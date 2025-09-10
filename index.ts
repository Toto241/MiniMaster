import * as functions from "firebase-functions";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin"; // Still need for Timestamp/FieldValue
import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import { db } from "./firebase";

/**
 * Creates a new pairing code for a given childId.
 */
export const createPairingCode = functions.https.onCall(async (data, _context) => {
  const childId = (data as any).childId;

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
 * Validates a given pairingCode, and if valid, returns the associated childId
 * and deletes the pairing code.
 */
export const validatePairingCode = functions.https.onCall(async (data, _context) => {
  const pairingCode = (data as any).pairingCode;

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
        functions.logger.error(`Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure."
        );
    }

    if (!childId || typeof childId !== "string") {
        functions.logger.error(`Pairing code ${pairingCode} has invalid 'childId' field.`);
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
 * Registers a new master device based on its IMEI.
 */
export const registerMasterDevice = functions.https.onCall(
  async (data: any, _context: any) => {
  const imei = (data as any).imei;
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
 */
export const generatePairingLink = functions.https.onCall(
  async (data: any, _context: any) => {
  const { imei, secretKey } = data as any;

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
 */
export const setDeviceLocked = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, childImei, isLocked } = data as any;

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
 * Updates the app blacklist for a specific child device.
 */
export const updateAppBlacklist = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, childImei, appBlacklist } = data as any;

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
 * Sets usage rules for a specific child device.
 */
export const setUsageRules = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, childImei, usageRules } = data as any;
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
 */
export const recordHeartbeat = functions.https.onCall(
  async (data: any, _context: any) => {
    const { childImei } = data as any;

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
 * Registers or updates the FCM token for a child device, allowing it to receive push messages.
 */
export const registerFcmToken = functions.https.onCall(
  async (data: any, _context: any) => {
    const { childImei, token } = data as any;

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
 * Firestore trigger (v2) that sends an FCM message to a child device when its data changes.
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
 * Creates a new task for a child device. Called by the master device.
 */
export const createTask = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, childImei, description, deadlineISO } = data as any;

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
 * Marks a task as complete from the child's side, attaching a photo proof URL.
 */
export const completeTask = functions.https.onCall(
  async (data: any, _context: any) => {
    const { childImei, taskId, photoUrl } = data as any;

    if (!childImei || !taskId || !photoUrl) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const taskRef = db().collection("children").doc(childImei).collection("tasks").doc(taskId);

    const taskDoc = await taskRef.get();
    if (!taskDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The specified task does not exist.");
    }

    await taskRef.update({
      status: "pending_approval",
      photoUrl: photoUrl,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`Task ${taskId} marked as complete by child ${childImei}`);
    return { success: true };
  }
);

/**
 * Approves a completed task. Called by the master device.
 */
export const approveTask = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, childImei, taskId } = data as any;

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
    await taskRef.update({ status: "approved" });

    functions.logger.info(`Task ${taskId} approved for child ${childImei}`);
    return { success: true };
  }
);

/**
 * Verifies a purchase with Google Play and grants entitlement.
 */
export const verifyPurchase = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey, purchaseToken, sku } = data as any;

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
 * Gets the current subscription status for the master device.
 */
export const getSubscriptionStatus = functions.https.onCall(
  async (data: any, _context: any) => {
    const { masterImei, secretKey } = data as any;
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

async function verifyPlaySubscription(packageName: string, productId: string, purchaseToken: string) {
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
 * Validates a single-use pairing token, and if valid, creates a
 * permanent child device profile linked to the master device.
 */
export const validatePairingToken = functions.https.onCall(
  async (data: any, _context: any) => {
  const { pairingToken, childImei } = data as any;

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


