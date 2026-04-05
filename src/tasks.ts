/**
 * Task Management Cloud Functions.
 * Handles task creation, completion, approval, and rejection.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, checkRateLimit, validateAppCheck, AuditLogger, hasActiveAccess } from "./shared";

export const createTask = functions.https.onCall(
  async (data: { childId: string; description: string; deadlineISO: string; unlockDuration?: number }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "createTask", 20);
    const { childId, description, deadlineISO, unlockDuration } = data;

    if (!childId || !description || !deadlineISO) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    if (unlockDuration !== undefined) {
      if (typeof unlockDuration !== "number" || !Number.isInteger(unlockDuration) || unlockDuration < 1 || unlockDuration > 1440) {
        throw new functions.https.HttpsError("invalid-argument", "unlockDuration must be an integer between 1 and 1440 minutes.");
      }
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
        "Master not authorized for this child", { childId, description }
      );
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    try {
      const taskRef = childDeviceRef.collection("tasks").doc();
      const taskData: Record<string, unknown> = {
        description: description,
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
        { childId, taskId: taskRef.id, description, deadline: deadlineISO, duration: Date.now() - startTime }
      );

      functions.logger.info(`Task ${taskRef.id} created for child ${childId}`);
      return { success: true, taskId: taskRef.id };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.create", context, `children/${childId}/tasks`, "task",
        error as Error, { childId, description }
      );
      throw error;
    }
  }
);

export const completeTask = functions.https.onCall(
  async (data: { taskId: string; photoUrl: string }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    validateAppCheck(context, true);
    const { taskId, photoUrl } = data;

    if (!taskId || !photoUrl) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    // Validate photoUrl: must be a Firebase Storage URL (prevent SSRF/injection)
    const validStorageUrl = /^https:\/\/firebasestorage\.googleapis\.com\//;
    if (typeof photoUrl !== "string" || !validStorageUrl.test(photoUrl)) {
      throw new functions.https.HttpsError("invalid-argument", "photoUrl must be a valid Firebase Storage URL.");
    }

    // Enforce max URL length to prevent abuse
    if (photoUrl.length > 2048) {
      throw new functions.https.HttpsError("invalid-argument", "photoUrl exceeds maximum allowed length.");
    }

    const taskRef = db().collection("children").doc(childId).collection("tasks").doc(taskId);

    try {
      const taskDoc = await taskRef.get();
      if (!taskDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The specified task does not exist.");
      }

      const current = taskDoc.data() as any;
      if (current.status && current.status !== "pending") {
        throw new functions.https.HttpsError("failed-precondition", "Task cannot transition to pending_approval from current state.");
      }

      await taskRef.update({
        status: "pending_approval",
        photoUrl: photoUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "task.complete", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, duration: Date.now() - startTime }
      );

      functions.logger.info(`TASK_COMPLETED taskId=${taskId} child=${childId}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.complete", context, `children/${childId}/tasks/${taskId}`, "task",
        error as Error, { childId, taskId }
      );
      throw error;
    }
  }
);

export const approveTask = functions.https.onCall(
  async (data: { childId: string; taskId: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "approveTask", 30);
    const { childId, taskId } = data;

    if (!childId || !taskId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "task.approve", context, `children/${childId}/tasks/${taskId}`, "task",
        "Master not authorized for this child", { childId, taskId }
      );
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    try {
      const taskRef = childDeviceRef.collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Task not found.");
      }
      const taskData = taskSnap.data() as any;
      if (taskData.status !== "pending_approval") {
        throw new functions.https.HttpsError("failed-precondition", "Task not in pending_approval state.");
      }

      await taskRef.update({ status: "approved", updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      if (typeof taskData.unlockDuration === "number" && taskData.unlockDuration > 0) {
        const unlockUntil = admin.firestore.Timestamp.fromMillis(
          Date.now() + taskData.unlockDuration * 60 * 1000
        );
        await taskRef.update({ unlockUntil });
      }

      await AuditLogger.logSuccess(
        "task.approve", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, duration: Date.now() - startTime }
      );

      functions.logger.info(`TASK_APPROVED taskId=${taskId} child=${childId} master=${masterId}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.approve", context, `children/${childId}/tasks/${taskId}`, "task",
        error as Error, { childId, taskId }
      );
      throw error;
    }
  }
);

export const rejectTask = functions.https.onCall(
  async (data: { childId: string; taskId: string; reason?: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "rejectTask", 30);
    const { childId, taskId, reason } = data;

    if (!childId || !taskId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields: childId and taskId.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "task.reject", context, `children/${childId}/tasks/${taskId}`, "task",
        "Master not authorized for this child", { childId, taskId }
      );
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    try {
      const taskRef = childDeviceRef.collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Task not found.");
      }
      const taskData = taskSnap.data() as any;
      if (taskData.status !== "pending_approval") {
        throw new functions.https.HttpsError("failed-precondition", "Task not in pending_approval state.");
      }

      const updateData: any = {
        status: "rejected",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (reason && typeof reason === "string") {
        updateData.rejectionReason = reason.trim();
      }

      await taskRef.update(updateData);

      await AuditLogger.logSuccess(
        "task.reject", context, `children/${childId}/tasks/${taskId}`, "task",
        { childId, taskId, reason: reason || "none", duration: Date.now() - startTime }
      );

      functions.logger.info(`TASK_REJECTED taskId=${taskId} child=${childId} master=${masterId} reason=${reason || "none"}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.reject", context, `children/${childId}/tasks/${taskId}`, "task",
        error as Error, { childId, taskId }
      );
      throw error;
    }
  }
);
