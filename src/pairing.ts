/**
 * Pairing Cloud Functions.
 * Handles pairing code/token generation and validation for linking parent-child devices.
 *
 * Improvements:
 * - Centralized input validation with XSS protection
 * - Structured error handling with withErrorHandling wrapper
 * - Strict input sanitization for all string fields
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { db } from "../firebase";
import { requireAuth, validateAppCheck, AuditLogger, hasActiveAccess, checkRateLimitShared, getTracedLogger } from "./shared";
import { validateString } from "./validation";
import { withErrorHandling } from "./error-handler";

const DEFAULT_CHILD_APP_LIMIT = 4;
const DEFAULT_PARENT_APP_LIMIT = 2;
const PAIRING_LINK_BASE_URL = process.env.PAIRING_LINK_BASE_URL || "https://minimaster.app/pair";
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hasPairingAccess(masterData: admin.firestore.DocumentData | undefined): boolean {
  if (hasActiveAccess(masterData)) return true;
  return masterData?.subscription?.status === "trial_pending";
}

async function activateTrialIfPending(masterId: string, masterData: admin.firestore.DocumentData | undefined): Promise<void> {
  if (masterData?.subscription?.status !== "trial_pending") return;

  const now = admin.firestore.Timestamp.now();
  const trialEndsAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + TRIAL_DURATION_MS);
  const nextSubscription = {
    ...(masterData.subscription || {}),
    status: "trial",
    trialStartedAt: now,
    trialEndsAt,
  };

  await db().collection("masters").doc(masterId).update({
    subscription: nextSubscription,
  });
}

/**
 * Creates a new, unique 6-digit pairing code. The code expires after 24 hours.
 */
export const createPairingCode = functions.https.onCall(
  withErrorHandling(
    "createPairingCode",
    async (_data: Record<string, never>, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "createPairingCode");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);
      await checkRateLimitShared(masterId, "pairing.create_code", 10, 60 * 60 * 1000);

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }
      if (!hasPairingAccess(masterDoc.data())) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Active subscription, pending trial, or active trial required to create pairing codes."
        );
      }

      const pairingCodesRef = db().collection("pairingCodes");
      const maxAttempts = 50;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const pairingCode = crypto.randomInt(100000, 999999).toString();
        const pairingCodeDocRef = pairingCodesRef.doc(pairingCode);

        const doc = await pairingCodeDocRef.get();
        if (!doc.exists) {
          const now = admin.firestore.Timestamp.now();
          const expiresAtSeconds = now.seconds + 24 * 60 * 60;
          const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

          await pairingCodeDocRef.set({
            masterId: masterId,
            createdAt: now,
            expiresAt: expiresAt,
          });

          await AuditLogger.logSuccess(
            "device.pair", context, `pairingCodes/${pairingCode}`, "device",
            { codeType: "6digit", expiresIn: "24h", duration: Date.now() - startTime, traceId }
          );

          logger.info(`Pairing code ${pairingCode} created for masterId ${masterId}`);
          return { pairingCode: pairingCode };
        }
      }

      await AuditLogger.logFailure(
        "device.pair", context, `masters/${masterId}`, "device",
        new Error("Could not create unique pairing code after max attempts"),
        { codeType: "6digit", maxAttempts, traceId }
      );

      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Could not create a unique pairing code. Please try again later."
      );
    }
  )
);

/**
 * Validates a 6-digit pairing code and links the child device to the master.
 */
export const validatePairingCode = functions.https.onCall(
  withErrorHandling(
    "validatePairingCode",
    async (data: { pairingCode: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "validatePairingCode");
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);
      await checkRateLimitShared(childId, "pairing.validate_code", 10, 15 * 60 * 1000);

      const pairingCode = validateString(data.pairingCode, "pairingCode", {
        required: true,
        pattern: /^\d{6}$/,
        sanitize: "none",
      });

      const pairingCodeRef = db().collection("pairingCodes").doc(pairingCode);

      const doc = await pairingCodeRef.get();

      if (!doc.exists) {
        logger.warn(`Pairing code ${pairingCode} not found.`);
        throw new functions.https.HttpsError("not-found", "Invalid pairing code.");
      }

      const codeData = doc.data();
      if (!codeData) {
        logger.error(`Pairing code ${pairingCode} exists but data is undefined.`);
        throw new functions.https.HttpsError("internal", "Pairing code data is missing.");
      }

      const expiresAt = codeData.expiresAt as admin.firestore.Timestamp;
      const masterId = (codeData.masterId || codeData.masterImei) as string | undefined;

      if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
        logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
        await pairingCodeRef.delete();
        throw new functions.https.HttpsError("internal", "Invalid pairing code data structure.");
      }

      if (!masterId || typeof masterId !== "string") {
        logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'masterId' field.`);
        await pairingCodeRef.delete();
        throw new functions.https.HttpsError("internal", "Invalid pairing code data structure (masterId).");
      }

      const now = admin.firestore.Timestamp.now();

      if (now.seconds > expiresAt.seconds) {
        logger.info(`Pairing code ${pairingCode} has expired.`);
        await pairingCodeRef.delete();
        throw new functions.https.HttpsError("deadline-exceeded", "Pairing code has expired.");
      }

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const masterData = masterDoc.data();
      if (!hasPairingAccess(masterData)) {
        await AuditLogger.logDenied(
          "device.pair", context, `children/${childId}`, "device",
          "No active subscription or trial. Please subscribe to continue.",
          { masterId, subscriptionStatus: masterData?.subscription?.status || "none", traceId }
        );
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Your trial has expired. Please subscribe to continue using Mini-Master."
        );
      }

      const childLimit = masterData?.subscription?.childLimit || DEFAULT_CHILD_APP_LIMIT;
      const childDeviceRef = db().collection("children").doc(childId);

      await db().runTransaction(async (tx) => {
        const childrenQuery = db().collection("children").where("masterImei", "==", masterId);
        const existingChildren = await tx.get(childrenQuery);
        if (existingChildren.size >= childLimit) {
          throw new functions.https.HttpsError(
            "resource-exhausted",
            `Child limit reached (${childLimit}). Upgrade your subscription for more devices.`
          );
        }
        tx.set(childDeviceRef, {
          childImei: childId,
          masterImei: masterId,
          pairedAt: now,
        }, { merge: true });
      });

      await activateTrialIfPending(masterId, masterData);
      logger.info(`Child device ${childId} successfully paired with master ${masterId} via pairing code.`);

      await pairingCodeRef.delete();
      logger.info(`Valid pairing code ${pairingCode} used and deleted for childId ${childId}.`);

      await AuditLogger.logSuccess(
        "device.pair", context, `children/${childId}`, "device",
        { masterId, pairingMethod: "code", duration: Date.now() - startTime, traceId }
      );

      return { childId: childId };
    }
  )
);

/**
 * Generates a single-use pairing token (UUID, valid for 5 minutes).
 */
export const generatePairingLink = functions.https.onCall(
  withErrorHandling(
    "generatePairingLink",
    async (_data: Record<string, never>, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "generatePairingLink");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);

      const masterDeviceRef = db().collection("masters").doc(masterId);

      const doc = await masterDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const masterData = doc.data();
      if (!hasPairingAccess(masterData)) {
        await AuditLogger.logDenied(
          "device.pair", context, `masters/${masterId}`, "device",
          "No active subscription or trial. Please subscribe to continue.",
          { subscriptionStatus: masterData?.subscription?.status || "none", traceId }
        );
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Your trial has expired. Please subscribe to continue using Mini-Master."
        );
      }

      const pairingToken = crypto.randomUUID();
      const now = admin.firestore.Timestamp.now();
      const expiresAtSeconds = now.seconds + 5 * 60;
      const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);
      const childLimit = masterData?.subscription?.childLimit || DEFAULT_CHILD_APP_LIMIT;
      const parentAppLimit = masterData?.subscription?.parentAppLimit || DEFAULT_PARENT_APP_LIMIT;
      const pairingLink = `${PAIRING_LINK_BASE_URL}?token=${encodeURIComponent(pairingToken)}`;

      const tokenRef = db().collection("pairingTokens").doc(pairingToken);
      await tokenRef.set({
        masterId: masterId,
        createdAt: now,
        expiresAt: expiresAt,
      });

      await AuditLogger.logSuccess(
        "device.pair", context, `pairingTokens/${pairingToken}`, "device",
        { tokenType: "link", expiresIn: "5min", duration: Date.now() - startTime, traceId }
      );

      logger.info(`Pairing token created for masterId: ${masterId}`);
      return {
        pairingToken: pairingToken,
        pairingLink,
        qrCodeValue: pairingLink,
        shareMethod: "link_or_qr",
        distribution: {
          initiatedByParent: masterId,
          parentAppLimit,
          childAppLimit: childLimit,
        },
      };
    }
  )
);

/**
 * Validates a single-use pairing token and links the child to the master.
 */
export const validatePairingToken = functions.https.onCall(
  withErrorHandling(
    "validatePairingToken",
    async (data: { pairingToken: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "validatePairingToken");
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);
      await checkRateLimitShared(childId, "pairing.validate_token", 10, 15 * 60 * 1000);

      const pairingToken = validateString(data.pairingToken, "pairingToken", {
        required: true,
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        sanitize: "none",
      });

      const tokenRef = db().collection("pairingTokens").doc(pairingToken);

      const tokenDoc = await tokenRef.get();

      if (!tokenDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Pairing token is invalid.");
      }

      const tokenData = tokenDoc.data();
      if (!tokenData) {
        await tokenRef.delete();
        throw new functions.https.HttpsError("internal", "Pairing token data is missing.");
      }

      const expiresAt = tokenData.expiresAt as admin.firestore.Timestamp;
      const masterId = (tokenData.masterId || tokenData.masterImei) as string | undefined;

      if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
        logger.error(`DATA_CORRUPTION Pairing token ${pairingToken} has invalid 'expiresAt' field.`);
        await tokenRef.delete();
        throw new functions.https.HttpsError("internal", "Invalid pairing token data structure.");
      }

      const now = admin.firestore.Timestamp.now();
      if (now.seconds > expiresAt.seconds) {
        await tokenRef.delete();
        throw new functions.https.HttpsError("deadline-exceeded", "Pairing token has expired.");
      }

      if (!masterId || typeof masterId !== "string") {
        await tokenRef.delete();
        throw new functions.https.HttpsError("internal", "Pairing token data is missing masterId.");
      }

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }
      const masterData = masterDoc.data();
      if (!hasPairingAccess(masterData)) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Active subscription or trial required for pairing."
        );
      }
      const childLimit = masterData?.subscription?.childLimit || DEFAULT_CHILD_APP_LIMIT;
      const childDeviceRef = db().collection("children").doc(childId);

      await db().runTransaction(async (tx) => {
        const childrenQuery = db().collection("children").where("masterImei", "==", masterId);
        const existingChildren = await tx.get(childrenQuery);
        if (existingChildren.size >= childLimit) {
          throw new functions.https.HttpsError(
            "resource-exhausted",
            `Child limit reached (${childLimit}). Upgrade your subscription for more devices.`
          );
        }
        tx.set(childDeviceRef, {
          childImei: childId,
          masterImei: masterId,
          pairedAt: now,
        });
      });

      await activateTrialIfPending(masterId, masterData);

      await tokenRef.delete();

      await AuditLogger.logSuccess(
        "device.pair", context, `children/${childId}`, "device",
        { masterId, pairingMethod: "token", duration: Date.now() - startTime, traceId }
      );

      logger.info(`Child device ${childId} successfully paired with master ${masterId}.`);
      return { childId: childId, masterId: masterId };
    }
  )
);

/**
 * Authenticated child-device pairing (modern flow).
 *
 * The caller must already be signed in to Firebase (anonymous auth is fine).
 * The child's Firebase UID becomes the canonical `childId`.
 *
 * Supports both `pairingCode` (6-digit) and `pairingToken` (UUID deep-link).
 */
export const pairAuthenticatedChild = functions.https.onCall(
  withErrorHandling(
    "pairAuthenticatedChild",
    async (data: { pairingCode?: string; pairingToken?: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "pairAuthenticatedChild");
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);

      if (!data.pairingCode && !data.pairingToken) {
        throw new functions.https.HttpsError("invalid-argument", "Either pairingCode or pairingToken is required.");
      }

      let masterId: string;

      if (data.pairingCode) {
        const pairingCode = validateString(data.pairingCode, "pairingCode", {
          required: true, pattern: /^\d{6}$/, sanitize: "none",
        });
        const codeDoc = await db().collection("pairingCodes").doc(pairingCode).get();
        if (!codeDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Invalid pairing code.");
        }
        const codeData = codeDoc.data();
        const expiresAt = codeData?.expiresAt as admin.firestore.Timestamp;
        masterId = (codeData?.masterId || codeData?.masterImei) as string;
        if (!masterId || !expiresAt || admin.firestore.Timestamp.now().seconds > expiresAt.seconds) {
          await db().collection("pairingCodes").doc(pairingCode).delete();
          throw new functions.https.HttpsError("deadline-exceeded", "Pairing code has expired.");
        }
        await db().collection("pairingCodes").doc(pairingCode).delete();
      } else {
        const pairingToken = validateString(data.pairingToken!, "pairingToken", {
          required: true,
          pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          sanitize: "none",
        });
        const tokenDoc = await db().collection("pairingTokens").doc(pairingToken).get();
        if (!tokenDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Invalid pairing token.");
        }
        const tokenData = tokenDoc.data();
        const expiresAt = tokenData?.expiresAt as admin.firestore.Timestamp;
        masterId = (tokenData?.masterId || tokenData?.masterImei) as string;
        if (!masterId || !expiresAt || admin.firestore.Timestamp.now().seconds > expiresAt.seconds) {
          await db().collection("pairingTokens").doc(pairingToken).delete();
          throw new functions.https.HttpsError("deadline-exceeded", "Pairing token has expired.");
        }
        await db().collection("pairingTokens").doc(pairingToken).delete();
      }

      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }
      const masterData = masterDoc.data();
      if (!hasPairingAccess(masterData)) {
        throw new functions.https.HttpsError("resource-exhausted", "Active subscription or trial required for pairing.");
      }

      const childLimit = masterData?.subscription?.childLimit || DEFAULT_CHILD_APP_LIMIT;
      const childDeviceRef = db().collection("children").doc(childId);
      const now = admin.firestore.Timestamp.now();

      await db().runTransaction(async (tx) => {
        const childrenQuery = db().collection("children").where("masterImei", "==", masterId);
        const existingChildren = await tx.get(childrenQuery);
        if (existingChildren.size >= childLimit) {
          throw new functions.https.HttpsError("resource-exhausted", `Child limit reached (${childLimit}).`);
        }
        tx.set(childDeviceRef, {
          childId,
          masterImei: masterId,
          pairedAt: now,
          modernFlow: true,
        }, { merge: true });
      });

      await activateTrialIfPending(masterId, masterData);

      await AuditLogger.logSuccess(
        "device.pair", context, `children/${childId}`, "device",
        { masterId, pairingMethod: data.pairingCode ? "code" : "token", modernFlow: true, duration: Date.now() - startTime, traceId }
      );

      logger.info(`Authenticated child ${childId} paired with master ${masterId}.`);
      return { childId, masterId };
    }
  )
);
