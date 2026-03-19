/**
 * Pairing Cloud Functions.
 * Handles pairing code/token generation and validation for linking parent-child devices.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { db } from "../firebase";
import { requireAuth, AuditLogger, hasActiveAccess } from "./shared";

/**
 * Creates a new, unique 6-digit pairing code. The code expires after 24 hours.
 */
export const createPairingCode = functions.https.onCall(async (_data: Record<string, never>, context: CallableContext) => {
  const startTime = Date.now();
  const masterId = requireAuth(context);

  const masterDoc = await db().collection("masters").doc(masterId).get();
  if (!masterDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Master account not found.");
  }
  if (!hasActiveAccess(masterDoc.data())) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Active subscription or trial required to create pairing codes."
    );
  }

  const pairingCodesRef = db().collection("pairingCodes");
  const maxAttempts = 10;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
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
          { codeType: "6digit", expiresIn: "24h", duration: Date.now() - startTime }
        );

        functions.logger.info(`Pairing code ${pairingCode} created for masterId ${masterId}`);
        return { pairingCode: pairingCode };
      }
    }

    await AuditLogger.logFailure(
      "device.pair", context, `masters/${masterId}`, "device",
      new Error("Could not create unique pairing code after 10 attempts"),
      { codeType: "6digit", maxAttempts }
    );

    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Could not create a unique pairing code. Please try again later."
    );
  } catch (error) {
    if (!(error instanceof functions.https.HttpsError)) {
      await AuditLogger.logFailure(
        "device.pair", context, `masters/${masterId}`, "device",
        error as Error, { codeType: "6digit" }
      );
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while creating the pairing code.", error);
    }
    throw error;
  }
});

/**
 * Validates a 6-digit pairing code and links the child device to the master.
 */
export const validatePairingCode = functions.https.onCall(async (data: { pairingCode: string }, context: CallableContext) => {
  const startTime = Date.now();
  const { pairingCode } = data;
  const childId = requireAuth(context);

  if (!pairingCode || typeof pairingCode !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'pairingCode' string.");
  }

  const pairingCodeRef = db().collection("pairingCodes").doc(pairingCode);

  try {
    const doc = await pairingCodeRef.get();

    if (!doc.exists) {
      functions.logger.warn(`Pairing code ${pairingCode} not found.`);
      throw new functions.https.HttpsError("not-found", "Invalid pairing code.");
    }

    const codeData = doc.data();
    if (!codeData) {
      functions.logger.error(`Pairing code ${pairingCode} exists but data is undefined.`);
      throw new functions.https.HttpsError("internal", "Pairing code data is missing.");
    }

    const expiresAt = codeData.expiresAt as admin.firestore.Timestamp;
    const masterId = (codeData.masterId || codeData.masterImei) as string | undefined;

    if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
      functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
      await pairingCodeRef.delete();
      functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError("internal", "Invalid pairing code data structure.");
    }

    if (!masterId || typeof masterId !== "string") {
      functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'masterId' field.`);
      await pairingCodeRef.delete();
      functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError("internal", "Invalid pairing code data structure (masterId).");
    }

    const now = admin.firestore.Timestamp.now();

    if (now.seconds > expiresAt.seconds) {
      functions.logger.info(`Pairing code ${pairingCode} has expired.`);
      await pairingCodeRef.delete();
      functions.logger.info(`Expired pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError("deadline-exceeded", "Pairing code has expired.");
    }

    const masterDoc = await db().collection("masters").doc(masterId).get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const masterData = masterDoc.data();
    if (!hasActiveAccess(masterData)) {
      await AuditLogger.logDenied(
        "device.pair", context, `children/${childId}`, "device",
        "No active subscription or trial. Please subscribe to continue.",
        { masterId, subscriptionStatus: masterData?.subscription?.status || "none" }
      );
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Your trial has expired. Please subscribe to continue using Mini-Master."
      );
    }

    const childLimit = masterData?.subscription?.childLimit || 1;
    const existingChildren = await db().collection("children")
      .where("masterImei", "==", masterId).get();
    if (existingChildren.size >= childLimit) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        `Child limit reached (${childLimit}). Upgrade your subscription for more devices.`
      );
    }

    const childDeviceRef = db().collection("children").doc(childId);
    await childDeviceRef.set({
      childImei: childId,
      masterImei: masterId,
      pairedAt: now,
    }, { merge: true });
    functions.logger.info(`Child device ${childId} successfully paired with master ${masterId} via pairing code.`);

    await pairingCodeRef.delete();
    functions.logger.info(`Valid pairing code ${pairingCode} used and deleted for childId ${childId}.`);

    await AuditLogger.logSuccess(
      "device.pair", context, `children/${childId}`, "device",
      { masterId, pairingMethod: "code", duration: Date.now() - startTime }
    );

    return { childId: childId };

  } catch (error) {
    if (error instanceof functions.https.HttpsError && error.code === "resource-exhausted") {
      throw error;
    }

    await AuditLogger.logFailure(
      "device.pair", context, `children/${childId}`, "device",
      error as Error, { pairingMethod: "code" }
    );

    if (error instanceof functions.https.HttpsError) {
      functions.logger.warn(`Validation failed for code ${pairingCode}:`, error.message, error.code, error.details);
      throw error;
    }

    functions.logger.error(`Unexpected error validating code ${pairingCode}:`, error);
    throw new functions.https.HttpsError("internal", "An unexpected error occurred while validating the pairing code.", error);
  }
});

/**
 * Generates a single-use pairing token (UUID, valid for 5 minutes).
 */
export const generatePairingLink = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const doc = await masterDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const masterData = doc.data();
      if (!hasActiveAccess(masterData)) {
        await AuditLogger.logDenied(
          "device.pair", context, `masters/${masterId}`, "device",
          "No active subscription or trial. Please subscribe to continue.",
          { subscriptionStatus: masterData?.subscription?.status || "none" }
        );
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Your trial has expired. Please subscribe to continue using Mini-Master."
        );
      }

      const pairingToken = uuidv4();
      const now = admin.firestore.Timestamp.now();
      const expiresAtSeconds = now.seconds + 5 * 60;
      const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

      const tokenRef = db().collection("pairingTokens").doc(pairingToken);
      await tokenRef.set({
        masterId: masterId,
        createdAt: now,
        expiresAt: expiresAt,
      });

      await AuditLogger.logSuccess(
        "device.pair", context, `pairingTokens/${pairingToken}`, "device",
        { tokenType: "link", expiresIn: "5min", duration: Date.now() - startTime }
      );

      functions.logger.info(`Pairing token created for masterId: ${masterId}`);
      return { pairingToken: pairingToken };

    } catch (error) {
      await AuditLogger.logFailure(
        "device.pair", context, `masters/${masterId}`, "device",
        error as Error, { tokenType: "link" }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error("Error generating pairing link:", error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while generating the pairing link.", error);
    }
  }
);

/**
 * Validates a single-use pairing token and links the child to the master.
 */
export const validatePairingToken = functions.https.onCall(
  async (data: { pairingToken: string }, context: CallableContext) => {
    const startTime = Date.now();
    const { pairingToken } = data;
    const childId = requireAuth(context);

    if (!pairingToken || typeof pairingToken !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Request must include a valid 'pairingToken'.");
    }

    const tokenRef = db().collection("pairingTokens").doc(pairingToken);

    try {
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
        functions.logger.error(`DATA_CORRUPTION Pairing token ${pairingToken} has invalid 'expiresAt' field.`);
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
      if (!hasActiveAccess(masterData)) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Active subscription or trial required for pairing."
        );
      }
      const childLimit = masterData?.subscription?.childLimit || 1;
      const existingChildren = await db().collection("children")
        .where("masterImei", "==", masterId).get();
      if (existingChildren.size >= childLimit) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          `Child limit reached (${childLimit}). Upgrade your subscription for more devices.`
        );
      }

      const childDeviceRef = db().collection("children").doc(childId);
      await childDeviceRef.set({
        childImei: childId,
        masterImei: masterId,
        pairedAt: now,
      });

      await tokenRef.delete();

      await AuditLogger.logSuccess(
        "device.pair", context, `children/${childId}`, "device",
        { masterId, pairingMethod: "token", duration: Date.now() - startTime }
      );

      functions.logger.info(`Child device ${childId} successfully paired with master ${masterId}.`);
      return { childId: childId, masterId: masterId };

    } catch (error) {
      await AuditLogger.logFailure(
        "device.pair", context, `children/${childId}`, "device",
        error as Error, { pairingMethod: "token" }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error("Error validating pairing token:", error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while validating the pairing token.", error);
    }
  }
);
