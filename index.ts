import * as functions from "firebase-functions";
// Korrekte Typen für onCall-Request
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin"; // Still need for Timestamp/FieldValue
import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import { db } from "./firebase";

/**
 * Creates a new, unique 6-digit pairing code for a given child device ID.
 * The code is stored in Firestore and expires after 24 hours.
 * This function is callable from a client application.
 *
 * @param {{childId: string}} data - The data passed to the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{pairingCode: string}>} A promise that resolves with the generated pairing code.
 * @throws {functions.https.HttpsError} Throws an error if the childId is invalid,
 * or if a unique code cannot be generated.
 */
export const createPairingCode = functions.https.onCall(async (request: functions.https.CallableRequest<{ childId: string }>) => {
  const { childId } = request.data;

  if (!childId || typeof childId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid 'childId' string."
    );
  }

  const pairingCodesRef = db().collection("pairingCodes");
  const maxAttempts = 10; // Verhindert eine Endlosschleife

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const pairingCodeDocRef = pairingCodesRef.doc(pairingCode);

    try {
      const doc = await pairingCodeDocRef.get();
      if (!doc.exists) {
        const now = admin.firestore.Timestamp.now();
        const expiresAtSeconds = now.seconds + 24 * 60 * 60; // 24 Stunden
        const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

        await pairingCodeDocRef.set({
          childId: childId,
          createdAt: now,
          expiresAt: expiresAt,
        });

        functions.logger.info(`Pairing code ${pairingCode} created for childId ${childId}`);
        return { pairingCode: pairingCode };
      }
    } catch (error) {
      functions.logger.error("Error checking for pairing code uniqueness:", error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while creating the pairing code.",
        error
      );
    }
  }

  throw new functions.https.HttpsError(
    "resource-exhausted",
    "Could not create a unique pairing code. Please try again later."
  );
});

/**
 * Validates a given pairing code. If the code is valid and not expired,
 * it returns the associated childId and deletes the code to prevent reuse.
 *
 * @param {{pairingCode: string}} data - The data passed to the function.
 * @param {string} data.pairingCode - The 6-digit pairing code to validate.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{childId: string}>} A promise that resolves with the childId associated with the code.
 * @throws {functions.https.HttpsError} Throws an error if the code is invalid, not found, expired, or malformed.
 */
export const validatePairingCode = functions.https.onCall(async (request: functions.https.CallableRequest<{ pairingCode: string }>) => {
  const { pairingCode } = request.data;

  if (!pairingCode || typeof pairingCode !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'pairingCode' string."
    );
  }

  const pairingCodeRef = db().collection("pairingCodes").doc(pairingCode);

  try {
    const doc = await pairingCodeRef.get();

    if (!doc.exists) {
      functions.logger.warn(`Pairing code ${pairingCode} not found.`);
      throw new functions.https.HttpsError(
        "not-found",
        "Invalid pairing code."
      );
    }

    const codeData = doc.data();
    if (!codeData) {
      functions.logger.error(`Pairing code ${pairingCode} exists but data is undefined.`);
      throw new functions.https.HttpsError(
        "internal",
        "Pairing code data is missing."
      );
    }

    const expiresAt = codeData.expiresAt as admin.firestore.Timestamp;
    const childId = codeData.childId as string;

  if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
    functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure."
        );
    }

    if (!childId || typeof childId !== "string") {
    functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'childId' field.`);
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure (childId)."
        );
    }

    const now = admin.firestore.Timestamp.now();

    if (now.seconds > expiresAt.seconds) {
      functions.logger.info(`Pairing code ${pairingCode} has expired.`);
      await pairingCodeRef.delete();
      functions.logger.info(`Expired pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Pairing code has expired."
      );
    }

    await pairingCodeRef.delete();
    functions.logger.info(`Valid pairing code ${pairingCode} used and deleted for childId ${childId}.`);

    return { childId: childId };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
        functions.logger.warn(`Validation failed for code ${pairingCode}:`, error.message, error.code, error.details);
        throw error;
    }
    
    functions.logger.error(`Unexpected error validating code ${pairingCode}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while validating the pairing code.",
      error
    );
  }
  }
);

/**
 * Registers a new master device using its IMEI (or another unique ID).
 * If the device is not already registered, it creates a new entry in Firestore
 * and returns a unique secret key for future authentication.
 *
 * @param {{imei: string}} data - The data passed to the function.
 * @param {string} data.imei - The unique identifier for the master device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{secretKey: string}>} A promise that resolves with the newly generated secret key.
 * @throws {functions.https.HttpsError} Throws an error if the IMEI is invalid or already registered.
 */
export const registerMasterDevice = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ imei: string }>) => {
    const { imei } = request.data;
    if (!imei || typeof imei !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with a valid 'imei' string."
      );
    }

  const masterDeviceRef = db().collection("masters").doc(imei);

  try {
    const doc = await masterDeviceRef.get();
    if (doc.exists) {
      throw new functions.https.HttpsError(
        "already-exists",
        "This device has already been registered."
      );
    }

    const secretKey = uuidv4();
    const now = admin.firestore.Timestamp.now();

    await masterDeviceRef.set({
      imei: imei,
      secretKey: secretKey,
      createdAt: now,
    });

    functions.logger.info(`Master device registered with IMEI: ${imei}`);
    return { secretKey: secretKey };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error registering master device:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while registering the device.",
      error
    );
  }
  }
);

/**
 * Generates a single-use pairing token for an authenticated master device.
 * This token can be used to link a new child device to this master account.
 * The token is valid for 5 minutes.
 *
 * @param {{imei: string, secretKey: string}} data - The data passed to the function.
 * @param {string} data.imei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{pairingToken: string}>} A promise that resolves with the generated pairing token.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const generatePairingLink = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ imei: string; secretKey: string }>) => {
    const { imei, secretKey } = request.data;

    if (!imei || typeof imei !== "string" || !secretKey || typeof secretKey !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'imei' and 'secretKey'."
      );
    }

  const masterDeviceRef = db().collection("masters").doc(imei);

  try {
    const doc = await masterDeviceRef.get();
    if (!doc.exists || doc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Invalid IMEI or secret key."
      );
    }

    const pairingToken = uuidv4();
    const now = admin.firestore.Timestamp.now();
    const expiresAtSeconds = now.seconds + 5 * 60; // Token expires in 5 minutes
    const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

    const tokenRef = db().collection("pairingTokens").doc(pairingToken);
    await tokenRef.set({
      masterImei: imei,
      createdAt: now,
      expiresAt: expiresAt,
    });

    functions.logger.info(`Pairing token created for master IMEI: ${imei}`);
    return { pairingToken: pairingToken };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error generating pairing link:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while generating the pairing link.",
      error
    );
  }
  }
);

/**
 * Sets the lock state for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{masterImei: string, secretKey: string, childImei: string, isLocked: boolean}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.childImei - The unique identifier of the child device to lock/unlock.
 * @param {boolean} data.isLocked - The desired lock state.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, isLocked: boolean}>} A promise that resolves with the new lock state.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const setDeviceLocked = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; childImei: string; isLocked: boolean }>) => {
    const { masterImei, secretKey, childImei, isLocked } = request.data;

    if (
      !masterImei || typeof masterImei !== "string" ||
      !secretKey || typeof secretKey !== "string" ||
      !childImei || typeof childImei !== "string" ||
      typeof isLocked !== "boolean"
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'masterImei', 'secretKey', 'childImei', and 'isLocked' boolean."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Invalid master IMEI or secret key."
      );
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterImei) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "This master device is not authorized to control the specified child device."
      );
    }

    try {
      await childDeviceRef.update({
        isLocked: isLocked,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Lock state for child ${childImei} set to ${isLocked} by master ${masterImei}.`);
      return { success: true, isLocked: isLocked };

    } catch (error) {
      functions.logger.error(`Failed to set lock state for child ${childImei}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while updating the device lock state.",
        error
      );
    }
  }
);

/**
 * Updates the list of blacklisted apps for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{masterImei: string, secretKey: string, childImei: string, appBlacklist: string[]}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.childImei - The unique identifier of the child device.
 * @param {string[]} data.appBlacklist - An array of package names to be blacklisted.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const updateAppBlacklist = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; childImei: string; appBlacklist: string[] }>) => {
    const { masterImei, secretKey, childImei, appBlacklist } = request.data;

    if (
      !masterImei || typeof masterImei !== "string" ||
      !secretKey || typeof secretKey !== "string" ||
      !childImei || typeof childImei !== "string" ||
      !Array.isArray(appBlacklist)
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'masterImei', 'secretKey', 'childImei', and 'appBlacklist' array."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterImei) {
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        appBlacklist: appBlacklist,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      functions.logger.info(`App blacklist for child ${childImei} updated by master ${masterImei}.`);
      return { success: true };
    } catch (error) {
      functions.logger.error(`Failed to update blacklist for child ${childImei}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to update app blacklist.", error);
    }
  }
);

/**
 * Sets screen time usage rules for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{masterImei: string, secretKey: string, childImei: string, usageRules: object}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.childImei - The unique identifier of the child device.
 * @param {object} data.usageRules - An object containing the usage rules to be applied.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const setUsageRules = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; childImei: string; usageRules: object }>) => {
    const { masterImei, secretKey, childImei, usageRules } = request.data;
    if (
      !masterImei || typeof masterImei !== "string" ||
      !secretKey || typeof secretKey !== "string" ||
      !childImei || typeof childImei !== "string" ||
      typeof usageRules !== "object" || usageRules === null
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'masterImei', 'secretKey', 'childImei', and 'usageRules' object."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterImei) {
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        usageRules: usageRules,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      functions.logger.info(`Usage rules for child ${childImei} updated by master ${masterImei}.`);
      return { success: true };
    } catch (error) {
      functions.logger.error(`Failed to set usage rules for child ${childImei}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to set usage rules.", error);
    }
  }
);

/**
 * Records a heartbeat from a child device to indicate it's online.
 * This function updates the `lastSeen` timestamp for the child device.
 *
 * @param {{childImei: string}} data - The data passed to the function.
 * @param {string} data.childImei - The unique identifier of the child device sending the heartbeat.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if the childImei is invalid or the device is not found.
 */
export const recordHeartbeat = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ childImei: string }>) => {
    const { childImei } = request.data;

    if (!childImei || typeof childImei !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'childImei'."
      );
    }

    const childDeviceRef = db().collection("children").doc(childImei);

    try {
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "The specified child device does not exist."
        );
      }

      await childDeviceRef.update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };

    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error(`Failed to record heartbeat for child ${childImei}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while recording heartbeat.",
        error
      );
    }
  }
);

/**
 * Registers or updates the FCM token for a child device. This token is required
 * to send push notifications (e.g., for rule synchronization) to the device.
 *
 * @param {{childImei: string, token: string}} data - The data passed to the function.
 * @param {string} data.childImei - The unique identifier of the child device.
 * @param {string} data.token - The Firebase Cloud Messaging (FCM) registration token.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if arguments are invalid or the device is not found.
 */
export const registerFcmToken = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ childImei: string; token: string }>) => {
    const { childImei, token } = request.data;

    if (!childImei || typeof childImei !== "string" || !token || typeof token !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'childImei' and 'token'."
      );
    }

    const childDeviceRef = db().collection("children").doc(childImei);

    try {
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
          throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      await childDeviceRef.update({ fcmToken: token });
      functions.logger.info(`FCM token for child ${childImei} has been registered.`);
      return { success: true };

    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        functions.logger.error(`Failed to register FCM token for child ${childImei}:`, error);
        throw new functions.https.HttpsError("internal", "Failed to register FCM token.", error);
    }
  }
);

/**
 * A Firestore trigger (v2) that sends a "SYNC_RULES" command via FCM to a child
 * device whenever its lock state, app blacklist, or usage rules are modified.
 * This ensures the child device applies new settings in near real-time.
 *
 * @param {FirestoreEvent<Change<DocumentSnapshot> | undefined, {childId: string}>} event - The Firestore event object.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
export const onChildDeviceUpdateV2 = onDocumentUpdated("children/{childId}", async (event) => {
    const childId = event.params.childId;
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();

    if (!newData) {
        functions.logger.info(`Child device ${childId} deleted, no action taken.`);
        return;
    }

    if (!oldData) {
        functions.logger.info(`New child device ${childId} created, no action taken on update.`);
        return;
    }

    const fcmToken = newData.fcmToken;
    if (!fcmToken || typeof fcmToken !== 'string') {
        functions.logger.warn(`No valid FCM token for child ${childId}, cannot send notification.`);
        return;
    }

    const payload: { [key: string]: string } = {};

    if (newData.isLocked !== oldData.isLocked) {
        payload.isLocked = String(newData.isLocked);
    }

    if (JSON.stringify(newData.appBlacklist) !== JSON.stringify(oldData.appBlacklist)) {
        payload.appBlacklist = JSON.stringify(newData.appBlacklist);
    }

    if (JSON.stringify(newData.usageRules) !== JSON.stringify(oldData.usageRules)) {
        payload.usageRules = JSON.stringify(newData.usageRules);
    }

    if (Object.keys(payload).length === 0) {
        functions.logger.info(`No relevant changes detected for child ${childId}.`);
        return;
    }

    const message = {
        token: fcmToken,
        data: payload,
        notification: {
            title: "Device Settings Updated",
            body: "Your device settings have been updated by your parent.",
        },
    };

    try {
        await getMessaging().send(message);
        functions.logger.info(`Successfully sent FCM message to child ${childId} for data update.`);
    } catch (error) {
        functions.logger.error(`Failed to send FCM message to child ${childId}:`, error);
    }
});

/**
 * Creates a new task for a child device, assigned by an authenticated master device.
 *
 * @param {{masterImei: string, secretKey: string, childImei: string, description: string, deadlineISO: string}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.childImei - The unique identifier of the child device receiving the task.
 * @param {string} data.description - The description of the task.
 * @param {string} data.deadlineISO - The task's deadline in ISO 8601 format.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, taskId: string}>} A promise that resolves with the new task's ID.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const createTask = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; childImei: string; description: string; deadlineISO: string }>) => {
    const { masterImei, secretKey, childImei, description, deadlineISO } = request.data;

    if (!masterImei || !secretKey || !childImei || !description || !deadlineISO) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master credentials.");
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterImei) {
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    const taskRef = childDeviceRef.collection("tasks").doc();
    await taskRef.set({
      description: description,
      deadline: admin.firestore.Timestamp.fromDate(new Date(deadlineISO)),
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      masterImei: masterImei, // Denormalize for easier querying
    });

    functions.logger.info(`Task ${taskRef.id} created for child ${childImei}`);
    return { success: true, taskId: taskRef.id };
  }
);

/**
 * Marks a task as complete from the child's side and attaches a photo proof URL.
 * The task status is updated to 'pending_approval'.
 *
 * @param {{childImei: string, taskId: string, photoUrl: string}} data - The data for the function.
 * @param {string} data.childImei - The unique identifier of the child device.
 * @param {string} data.taskId - The ID of the task being completed.
 * @param {string} data.photoUrl - The URL of the uploaded photo proof.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if arguments are invalid or the task is not found.
 */
export const completeTask = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ childImei: string; taskId: string; photoUrl: string }>) => {
    const { childImei, taskId, photoUrl } = request.data;

    if (!childImei || !taskId || !photoUrl) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const taskRef = db().collection("children").doc(childImei).collection("tasks").doc(taskId);

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
    functions.logger.info(`TASK_COMPLETED taskId=${taskId} child=${childImei}`);
    return { success: true };
  }
);

/**
 * Approves a completed task. This function is called by the master device after
 * reviewing the photo proof. The task status is updated to 'approved'.
 *
 * @param {{masterImei: string, secretKey: string, childImei: string, taskId: string}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.childImei - The unique identifier of the child device that completed the task.
 * @param {string} data.taskId - The ID of the task to approve.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const approveTask = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; childImei: string; taskId: string }>) => {
    const { masterImei, secretKey, childImei, taskId } = request.data;

    if (!masterImei || !secretKey || !childImei || !taskId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master credentials.");
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterImei) {
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

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
    functions.logger.info(`TASK_APPROVED taskId=${taskId} child=${childImei} master=${masterImei}`);
    return { success: true };
  }
);

/**
 * Verifies a Google Play subscription purchase and grants entitlement to the master device.
 * It calls the Google Play Developer API to validate the purchase token.
 *
 * @param {{masterImei: string, secretKey: string, purchaseToken: string, sku: string}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {string} data.purchaseToken - The purchase token from the Google Play Billing library.
 * @param {string} data.sku - The product ID (SKU) of the subscription.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, subscriptionStatus: string}>} A promise that resolves with the new subscription status.
 * @throws {functions.https.HttpsError} Throws an error if authentication or purchase verification fails.
 */
export const verifyPurchase = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string; purchaseToken: string; sku: string }>) => {
    const { masterImei, secretKey, purchaseToken, sku } = request.data;

    if (!masterImei || !secretKey || !purchaseToken || !sku) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master credentials.");
    }

    const isPurchaseValid = await verifyPlaySubscription(
        "com.minimaster.masterapp",
        sku,
        purchaseToken
    ).catch((e) => {
        functions.logger.error("Error verifying Google Play purchase:", e);
        return false;
    });

    if (isPurchaseValid) {
      const now = admin.firestore.Timestamp.now();
      const subscriptionType = sku;
      const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);

      await masterDeviceRef.update({
        subscription: {
          status: "active",
          type: subscriptionType,
          startedAt: now,
          expiresAt: expiresAt,
        },
      });
      functions.logger.info(`Subscription ${sku} activated for master ${masterImei}.`);
      return { success: true, subscriptionStatus: "active" };
    } else {
      functions.logger.warn(`Invalid purchase token received for master ${masterImei}.`);
      throw new functions.https.HttpsError("permission-denied", "Purchase verification failed.");
    }
  }
);

/**
 * Gets the current subscription status for an authenticated master device.
 *
 * @param {{masterImei: string, secretKey: string}} data - The data for the function.
 * @param {string} data.masterImei - The master device's unique identifier.
 * @param {string} data.secretKey - The secret key for the master device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{subscriptionStatus: object}>} A promise that resolves with the subscription status object.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails.
 */
export const getSubscriptionStatus = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ masterImei: string; secretKey: string }>) => {
    const { masterImei, secretKey } = request.data;
    if (!masterImei || !secretKey) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterImei);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
      throw new functions.https.HttpsError("unauthenticated", "Invalid master credentials.");
    }

    const subscription = masterDoc.data()?.subscription || { status: "none" };
    return { subscriptionStatus: subscription };
  }
);

/**
 * Verifies a subscription's validity with the Google Play Developer API.
 * @param {string} packageName - The application's package name.
 * @param {string} productId - The subscription product ID (SKU).
 * @param {string} purchaseToken - The token provided by the client upon purchase.
 * @returns {Promise<boolean>} A promise that resolves to true if the subscription is active and valid.
 */
async function verifyPlaySubscription(packageName: string, productId: string, purchaseToken: string): Promise<boolean> {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth: auth });
  const res = await androidpublisher.purchases.subscriptions.get({
    packageName, subscriptionId: productId, token: purchaseToken,
  });
  const body = res.data;
  return body && (body as any).purchaseState === 0 && (body as any).expiryTimeMillis > Date.now();
}

/**
 * Validates a single-use pairing token. If valid, it creates a permanent
 * child device profile in Firestore, linking it to the master device that
 * generated the token. The token is then deleted.
 *
 * @param {{pairingToken: string, childImei: string}} data - The data for the function.
 * @param {string} data.pairingToken - The single-use token for pairing.
 * @param {string} data.childImei - The unique identifier of the new child device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{childId: string}>} A promise that resolves with the master device's ID, confirming the link.
 * @throws {functions.https.HttpsError} Throws an error if the token is invalid, expired, or arguments are missing.
 */
export const validatePairingToken = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ pairingToken: string; childImei: string }>) => {
    const { pairingToken, childImei } = request.data;

    if (!pairingToken || typeof pairingToken !== "string" || !childImei || typeof childImei !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'pairingToken' and 'childImei'."
      );
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
    const now = admin.firestore.Timestamp.now();
    if (now.seconds > expiresAt.seconds) {
      await tokenRef.delete();
      throw new functions.https.HttpsError("deadline-exceeded", "Pairing token has expired.");
    }

    const childDeviceRef = db().collection("children").doc(childImei);
    await childDeviceRef.set({
      childImei: childImei,
      masterImei: tokenData.masterImei,
      pairedAt: now,
    });

    await tokenRef.delete();

  functions.logger.info(`Child device ${childImei} successfully paired with master ${tokenData.masterImei}.`);
  // API compatibility note: historically returned { childId: masterImei }. Keep for now; plan deprecation.
  functions.logger.warn(`API_COMPAT validatePairingToken returning childId=masterImei (will deprecate) masterImei=${tokenData.masterImei}`);
  return { childId: tokenData.masterImei };

  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error validating pairing token:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while validating the pairing token.",
      error
    );
  }
  }
);

/**
 * Retrieves the current rules (lock state, blocked apps, usage rules) for a child device.
 * This function is called by the child app to sync rules from the backend.
 *
 * @param {{childId: string}} data - The data passed to the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {functions.https.CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{isLocked: boolean, blockedApps: string[], usageRules: object}>} The current rules for the child.
 * @throws {functions.https.HttpsError} Throws an error if the childId is invalid or not found.
 */
export const getRulesForChild = functions.https.onCall(
  async (request: functions.https.CallableRequest<{ childId: string }>) => {
    const { childId } = request.data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'childId'."
      );
    }

    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "The specified child device does not exist."
        );
      }

      const childData = childDoc.data();
      if (!childData) {
        throw new functions.https.HttpsError(
          "internal",
          "Child device data is missing."
        );
      }

      const rules = {
        isLocked: childData.isLocked ?? false,
        blockedApps: childData.appBlacklist ?? [],
        usageRules: childData.usageRules ?? {},
      };

      functions.logger.info(`Rules retrieved for child ${childId}`);
      return rules;

    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error(`Failed to retrieve rules for child ${childId}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while retrieving rules.",
        error
      );
    }
  }
);


