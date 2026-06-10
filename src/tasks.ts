/**
 * Task Management Cloud Functions.
 * Handles task creation, completion, approval, and rejection.
 *
 * Improvements applied:
 * - Centralized input validation with XSS protection
 * - Structured error handling with error-handler wrapper
 * - Circuit breaker for external API calls
 * - Comprehensive input sanitization
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db, storage } from "../firebase";
import { requireAuth, checkRateLimit, validateAppCheck, AuditLogger, hasActiveAccess, getTracedLogger } from "./shared";
import {
  validateDeviceId,
  validateTaskDescription,
  validateRejectionReason,
  validateFirebaseStorageUrl,
  validateNumber,
  validateISODate,
} from "./validation";
import { withErrorHandling } from "./error-handler";

/**
 * Whitelist erlaubter Bild-MIME-Types für Photo-Proof Uploads.
 * Bewusst restriktiv: Nur verbreitete, von Gemini Vision unterstützte Formate.
 */
const ALLOWED_PHOTO_MIME_TYPES = new Set<string>([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

/**
 * Maximale erlaubte Bildgröße in Bytes (10 MB).
 * Verhindert Speicher-/Kosten-/AI-Quota-Missbrauch durch übergroße Uploads.
 */
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Minimale Bildgröße in Bytes — verhindert leere oder Stub-Dateien als Proof.
 */
const MIN_PHOTO_SIZE_BYTES = 256;

/**
 * Wieviele Bytes vom Anfang der Bilddatei für die EXIF-GPS-Inspektion gelesen
 * werden. EXIF-Segmente liegen normalerweise in den ersten 64 KB.
 */
const EXIF_SCAN_BYTES = 64 * 1024;

/**
 * Defense-in-Depth EXIF-GPS-Detektor (kein vollständiger TIFF-Parser).
 */
export function detectExifGpsTag(buf: Buffer): boolean {
  if (!buf || buf.length < 32) return false;
  const EXIF_MARKER = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const exifIdx = buf.indexOf(EXIF_MARKER);
  if (exifIdx < 0) return false;

  const tiffStart = exifIdx + EXIF_MARKER.length;
  if (tiffStart + 8 > buf.length) return false;

  const endianMarker = buf.readUInt16BE(tiffStart);
  let bigEndian: boolean;
  if (endianMarker === 0x4D4D) {
    bigEndian = true;
  } else if (endianMarker === 0x4949) {
    bigEndian = false;
  } else {
    return false;
  }

  const gpsTagBytes = bigEndian
    ? Buffer.from([0x88, 0x25])
    : Buffer.from([0x25, 0x88]);

  const scanEnd = Math.min(buf.length, tiffStart + EXIF_SCAN_BYTES);
  const segment = buf.subarray(tiffStart, scanEnd);
  return segment.indexOf(gpsTagBytes) >= 0;
}

/**
 * Validiert MIME-Type und Größe des hochgeladenen Photo-Proof-Objekts via Storage-Metadaten.
 */
async function validatePhotoObjectMetadata(
  decodedPath: string, childId: string, taskId: string,
): Promise<void> {
  let metadata: { contentType?: string | null; size?: string | number | null };
  try {
    const bucket = storage().bucket();
    const file = bucket.file(decodedPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "photoUrl referenziertes Storage-Objekt existiert nicht.",
      );
    }
    const [meta] = await file.getMetadata();
    metadata = meta as { contentType?: string | null; size?: string | number | null };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    functions.logger.warn(
      `Photo-Proof Metadaten-Check übersprungen für child=${childId} task=${taskId}: ` +
      `${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const contentType = String(metadata!.contentType || "").toLowerCase().split(";")[0]!.trim();
  if (!contentType || !ALLOWED_PHOTO_MIME_TYPES.has(contentType)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `photoUrl Content-Type "${contentType || "unbekannt"}" ist nicht erlaubt. ` +
      `Erlaubt: ${Array.from(ALLOWED_PHOTO_MIME_TYPES).join(", ")}.`,
    );
  }

  const sizeBytes = Number(metadata.size || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes < MIN_PHOTO_SIZE_BYTES) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `photoUrl Datei zu klein (${sizeBytes} Bytes, Minimum ${MIN_PHOTO_SIZE_BYTES}).`,
    );
  }
  if (sizeBytes > MAX_PHOTO_SIZE_BYTES) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `photoUrl Datei zu groß (${sizeBytes} Bytes, Maximum ${MAX_PHOTO_SIZE_BYTES}).`,
    );
  }

  if (process.env.PHOTO_EXIF_GPS_REJECT !== "false") {
    try {
      const bucket = storage().bucket();
      const file = bucket.file(decodedPath);
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = file.createReadStream({ start: 0, end: EXIF_SCAN_BYTES - 1 });
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => resolve());
        stream.on("error", (err: Error) => reject(err));
      });
      const head = Buffer.concat(chunks);
      if (detectExifGpsTag(head)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "photoUrl enthält EXIF-GPS-Geodaten. Bitte vor Upload entfernen (Privacy-Schutz).",
        );
      }
    } catch (err) {
      if (err instanceof functions.https.HttpsError) throw err;
      functions.logger.warn(
        `Photo-Proof EXIF-GPS-Scan übersprungen für child=${childId} task=${taskId}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

// ==================== CREATE TASK ====================

export const createTask = functions.https.onCall(
  withErrorHandling(
    "createTask",
    async (data: { childId: string; description: string; deadlineISO: string; unlockDuration?: number }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "createTask");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(masterId, "createTask", 20);

      // Strict input validation with XSS protection
      const childId = validateDeviceId(data.childId);
      const description = validateTaskDescription(data.description);
      const deadlineISO = validateISODate(data.deadlineISO);
      let unlockDuration: number | undefined;
      if (data.unlockDuration !== undefined) {
        unlockDuration = validateNumber(data.unlockDuration, "unlockDuration", {
          integer: true, min: 1, max: 1440,
        });
      }

      const masterDeviceRef = db().collection("masters").doc(masterId);
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      if (!hasActiveAccess(masterDoc.data())) {
        throw new functions.https.HttpsError("resource-exhausted",
          "Active subscription or trial required to create tasks.");
      }

      const childDeviceRef = db().collection("children").doc(childId);
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
        await AuditLogger.logDenied(
          "task.create", context, `children/${childId}/tasks`, "task",
          "Master not authorized for this child", { childId, description, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
      }

      const taskRef = childDeviceRef.collection("tasks").doc();
      const taskData: Record<string, unknown> = {
        description,
        deadline: admin.firestore.Timestamp.fromDate(new Date(deadlineISO)),
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        masterImei: masterId,
      };
      if (unlockDuration !== undefined) {
        taskData.unlockDuration = unlockDuration;
      }
      await taskRef.set(taskData);

      await AuditLogger.logSuccess(
        "task.create", context, `children/${childId}/tasks/${taskRef.id}`, "task",
        { childId, taskId: taskRef.id, description, deadline: deadlineISO, duration: Date.now() - startTime, traceId }
      );

      logger.info(`Task ${taskRef.id} created for child ${childId}`);
      return { success: true, taskId: taskRef.id };
    }
  )
);

// ==================== COMPLETE TASK ====================

export const completeTask = functions.https.onCall(
  withErrorHandling(
    "completeTask",
    async (data: { taskId: string; photoUrl: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "completeTask");
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(childId, "completeTask", 10, 60 * 60 * 1000);

      const taskId = validateDeviceId(data.taskId, "taskId");
      const photoUrl = validateFirebaseStorageUrl(data.photoUrl);

      // Validate URL path scoping
      const objectMatch = photoUrl.match(/\/o\/([^?]+)/);
      if (!objectMatch) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "photoUrl must reference a Firebase Storage object path (.../o/<path>).",
        );
      }
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(objectMatch[1]!);
      } catch {
        throw new functions.https.HttpsError("invalid-argument", "photoUrl object path is not properly URL-encoded.");
      }
      const allowedPrefixes = [`children/${childId}/photos/`, `proofs/${childId}/`];
      const pathAllowed = allowedPrefixes.some((prefix) => decodedPath.startsWith(prefix));
      if (!pathAllowed) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "photoUrl must point to the calling child's own storage path.",
        );
      }

      await validatePhotoObjectMetadata(decodedPath, childId, taskId);

      const taskRef = db().collection("children").doc(childId).collection("tasks").doc(taskId);
      const taskDoc = await taskRef.get();
      if (!taskDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The specified task does not exist.");
      }

      const current = taskDoc.data();
      if (current?.status && current.status !== "pending") {
        throw new functions.https.HttpsError("failed-precondition", "Task cannot transition to pending_approval from current state.");
      }

      await taskRef.update({
        status: "pending_approval",
        photoUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "task.complete", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, duration: Date.now() - startTime, traceId }
      );

      logger.info(`TASK_COMPLETED taskId=${taskId} child=${childId}`);
      return { success: true };
    }
  )
);

// ==================== APPROVE TASK ====================

export const approveTask = functions.https.onCall(
  withErrorHandling(
    "approveTask",
    async (data: { childId: string; taskId: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "approveTask");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(masterId, "approveTask", 30);

      const childId = validateDeviceId(data.childId);
      const taskId = validateDeviceId(data.taskId, "taskId");

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const childDoc = await db().collection("children").doc(childId).get();
      if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
        await AuditLogger.logDenied(
          "task.approve", context, `children/${childId}/tasks/${taskId}`, "task",
          "Master not authorized for this child", { childId, taskId, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
      }

      const taskRef = db().collection("children").doc(childId).collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Task not found.");
      }
      const taskData = taskSnap.data();
      if (taskData?.status !== "pending_approval") {
        throw new functions.https.HttpsError("failed-precondition", "Task not in pending_approval state.");
      }

      const updatePayload: Record<string, unknown> = {
        status: "approved",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (typeof taskData?.unlockDuration === "number" && taskData.unlockDuration > 0) {
        updatePayload.unlockUntil = admin.firestore.Timestamp.fromMillis(
          Date.now() + taskData.unlockDuration * 60 * 1000
        );
      }
      await taskRef.update(updatePayload);

      await AuditLogger.logSuccess(
        "task.approve", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, duration: Date.now() - startTime, traceId }
      );

      logger.info(`TASK_APPROVED taskId=${taskId} child=${childId} master=${masterId}`);
      return { success: true };
    }
  )
);

// ==================== REJECT TASK ====================

export const rejectTask = functions.https.onCall(
  withErrorHandling(
    "rejectTask",
    async (data: { childId: string; taskId: string; reason?: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "rejectTask");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(masterId, "rejectTask", 30);

      const childId = validateDeviceId(data.childId);
      const taskId = validateDeviceId(data.taskId, "taskId");
      const reason = validateRejectionReason(data.reason);

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const childDoc = await db().collection("children").doc(childId).get();
      if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
        await AuditLogger.logDenied(
          "task.reject", context, `children/${childId}/tasks/${taskId}`, "task",
          "Master not authorized for this child", { childId, taskId, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
      }

      const taskRef = db().collection("children").doc(childId).collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Task not found.");
      }
      const taskData = taskSnap.data();
      if (taskData?.status !== "pending_approval") {
        throw new functions.https.HttpsError("failed-precondition", "Task not in pending_approval state.");
      }

      const updateData: Record<string, unknown> = {
        status: "rejected",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (reason) {
        updateData.rejectionReason = reason;
      }

      await taskRef.update(updateData);

      await AuditLogger.logSuccess(
        "task.reject", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, reason: reason || "none", duration: Date.now() - startTime, traceId }
      );

      logger.info(`TASK_REJECTED taskId=${taskId} child=${childId} master=${masterId} reason=${reason || "none"}`);
      return { success: true };
    }
  )
);
