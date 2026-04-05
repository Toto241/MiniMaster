/**
 * Device Management Cloud Functions.
 * Handles device locking, blacklist management, usage rules, heartbeat, and FCM registration.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, checkRateLimit, validateAppCheck, AuditLogger } from "./shared";

export const setDeviceLocked = functions.https.onCall(
  async (data: { childId: string; isLocked: boolean }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "setDeviceLocked", 30);
    const { childId, isLocked } = data;

    if (!childId || typeof childId !== "string" || typeof isLocked !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "Request must include valid 'childId' and 'isLocked' boolean.");
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
        isLocked ? "device.lock" : "device.unlock", context,
        `children/${childId}`, "device",
        "Master not authorized for this child", { childId, isLocked }
      );
      throw new functions.https.HttpsError("permission-denied", "This master device is not authorized to control the specified child device.");
    }

    try {
      await childDeviceRef.update({
        isLocked: isLocked,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        isLocked ? "device.lock" : "device.unlock", context,
        `children/${childId}`, "device",
        { childId, isLocked, duration: Date.now() - startTime }
      );

      functions.logger.info(`Lock state for child ${childId} set to ${isLocked} by master ${masterId}.`);
      return { success: true, isLocked: isLocked };
    } catch (error) {
      await AuditLogger.logFailure(
        isLocked ? "device.lock" : "device.unlock", context,
        `children/${childId}`, "device", error as Error, { childId, isLocked }
      );
      functions.logger.error(`Failed to set lock state for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while updating the device lock state.", error);
    }
  }
);

export const updateAppBlacklist = functions.https.onCall(
  async (data: { childId: string; appBlacklist: string[] }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    const { childId, appBlacklist } = data;

    if (!childId || typeof childId !== "string" || !Array.isArray(appBlacklist)) {
      throw new functions.https.HttpsError("invalid-argument", "Request must include valid 'childId' and 'appBlacklist' array.");
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
        "rules.update_blacklist", context, `children/${childId}`, "rule",
        "Master not authorized for this child", { childId, appCount: appBlacklist.length }
      );
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        appBlacklist: appBlacklist,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "rules.update_blacklist", context, `children/${childId}`, "rule",
        { childId, appCount: appBlacklist.length, duration: Date.now() - startTime }
      );

      functions.logger.info(`App blacklist for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "rules.update_blacklist", context, `children/${childId}`, "rule",
        error as Error, { childId, appCount: appBlacklist.length }
      );
      functions.logger.error(`Failed to update blacklist for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to update app blacklist.", error);
    }
  }
);

export const setUsageRules = functions.https.onCall(
  async (data: { childId: string; usageRules: object }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    const { childId, usageRules } = data;

    if (!childId || typeof childId !== "string" || typeof usageRules !== "object" || usageRules === null) {
      throw new functions.https.HttpsError("invalid-argument", "Request must include valid 'childId' and 'usageRules' object.");
    }

    // Schema validation: accept both current web/mobile rule schemas and legacy simple keys.
    const rules = usageRules as Record<string, unknown>;
    const allowedKeys = new Set([
      "dailyLimit",
      "bedtimeStart",
      "bedtimeEnd",
      "scheduledDowntime",
      "dailyLimitSeconds",
      "allowedHours",
      "appLimits",
    ]);
    const invalidKeys = Object.keys(rules).filter((k) => !allowedKeys.has(k));
    if (invalidKeys.length > 0) {
      throw new functions.https.HttpsError("invalid-argument", `Unknown usageRules keys: ${invalidKeys.join(", ")}`);
    }
    if (rules.dailyLimit !== undefined && (typeof rules.dailyLimit !== "number" || rules.dailyLimit < 0)) {
      throw new functions.https.HttpsError("invalid-argument", "dailyLimit must be a non-negative number.");
    }
    if (rules.dailyLimitSeconds !== undefined && (typeof rules.dailyLimitSeconds !== "number" || rules.dailyLimitSeconds < 0)) {
      throw new functions.https.HttpsError("invalid-argument", "dailyLimitSeconds must be a non-negative number.");
    }
    const timeRegex = /^\d{2}:\d{2}$/;
    if (rules.bedtimeStart !== undefined && (typeof rules.bedtimeStart !== "string" || !timeRegex.test(rules.bedtimeStart))) {
      throw new functions.https.HttpsError("invalid-argument", "bedtimeStart must be in HH:MM format.");
    }
    if (rules.bedtimeEnd !== undefined && (typeof rules.bedtimeEnd !== "string" || !timeRegex.test(rules.bedtimeEnd))) {
      throw new functions.https.HttpsError("invalid-argument", "bedtimeEnd must be in HH:MM format.");
    }
    if (rules.allowedHours !== undefined) {
      const allowedHours = rules.allowedHours as Record<string, unknown>;
      if (typeof allowedHours !== "object" || allowedHours === null || !timeRegex.test(String(allowedHours.start || "")) || !timeRegex.test(String(allowedHours.end || ""))) {
        throw new functions.https.HttpsError("invalid-argument", "allowedHours must include start/end in HH:MM format.");
      }
    }
    if (rules.appLimits !== undefined) {
      const appLimits = rules.appLimits as Record<string, unknown>;
      if (typeof appLimits !== "object" || appLimits === null) {
        throw new functions.https.HttpsError("invalid-argument", "appLimits must be an object.");
      }
      for (const [packageName, limit] of Object.entries(appLimits)) {
        if (!packageName || typeof limit !== "number" || limit < 0) {
          throw new functions.https.HttpsError("invalid-argument", "appLimits entries must contain a package name and non-negative numeric limit.");
        }
      }
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
        "rules.update_usage", context, `children/${childId}`, "rule",
        "Master not authorized for this child", { childId }
      );
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        usageRules: usageRules,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "rules.update_usage", context, `children/${childId}`, "rule",
        { childId, duration: Date.now() - startTime }
      );

      functions.logger.info(`Usage rules for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "rules.update_usage", context, `children/${childId}`, "rule",
        error as Error, { childId }
      );
      functions.logger.error(`Failed to set usage rules for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to set usage rules.", error);
    }
  }
);

export const getRulesForChild = functions.https.onCall(
  async (data: { childId: string }, context: CallableContext) => {
    const requesterId = requireAuth(context);
    const { childId } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Request must include a valid 'childId'.");
    }

    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      const childData = doc.data();
      const isOwnerMaster = childData?.masterImei === requesterId;
      const isSelfChild = childId === requesterId;
      if (!isOwnerMaster && !isSelfChild) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized to read rules for this child device.");
      }

      return {
        isLocked: childData?.isLocked || false,
        appBlacklist: childData?.appBlacklist || [],
        usageRules: childData?.usageRules || {},
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error(`Failed to get rules for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while retrieving rules.", error);
    }
  }
);

export const recordHeartbeat = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    validateAppCheck(context, true);
    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The specified child device does not exist.");
      }

      await childDeviceRef.update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "system.heartbeat", context, `children/${childId}`, "system",
        { childId, duration: Date.now() - startTime }
      );

      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "system.heartbeat", context, `children/${childId}`, "system",
        error as Error, { childId }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error(`Failed to record heartbeat for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while recording heartbeat.", error);
    }
  }
);

export const registerFcmToken = functions.https.onCall(
  async (data: { token: string }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    validateAppCheck(context, true);
    const { token } = data;

    if (!token || typeof token !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Request must include a valid 'token'.");
    }

    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      await childDeviceRef.update({ fcmToken: token });

      await AuditLogger.logSuccess(
        "device.register", context, `children/${childId}`, "device",
        { tokenType: "fcm", childId, duration: Date.now() - startTime }
      );

      functions.logger.info(`FCM token for child ${childId} has been registered.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "device.register", context, `children/${childId}`, "device",
        error as Error, { tokenType: "fcm", childId }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error(`Failed to register FCM token for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to register FCM token.", error);
    }
  }
);

export const updateFCMToken = functions.https.onCall(
  async (data: { fcmToken: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    const { fcmToken } = data;

    if (!fcmToken || typeof fcmToken !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Request must include valid 'fcmToken'.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      await masterDeviceRef.update({
        fcmToken: fcmToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "device.register", context, `masters/${masterId}`, "device",
        { tokenType: "fcm", masterId, duration: Date.now() - startTime }
      );

      functions.logger.info(`FCM token updated for master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "device.register", context, `masters/${masterId}`, "device",
        error as Error, { tokenType: "fcm", masterId }
      );
      functions.logger.error(`Failed to update FCM token for master ${masterId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while updating the FCM token.", error);
    }
  }
);

export const reportDailyUsage = functions.https.onCall(
  async (data: { date: string; usageMillis: number }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    validateAppCheck(context, true);
    const { date, usageMillis } = data;

    if (!date || typeof usageMillis !== "number") {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const historyRef = db().collection("children").doc(childId).collection("usageHistory").doc(date);

    try {
      await historyRef.set({
        date: date,
        totalUsageMillis: usageMillis,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await AuditLogger.logSuccess(
        "rules.update_screen_time", context, `children/${childId}/usageHistory/${date}`, "system",
        { childId, date, usageMillis, duration: Date.now() - startTime }
      );

      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "rules.update_screen_time", context, `children/${childId}/usageHistory/${date}`, "system",
        error as Error, { childId, date }
      );
      functions.logger.error(`Failed to report usage for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to save usage report.", error);
    }
  }
);

/**
 * Reports a tamper event from the child device (e.g., accessibility service disabled,
 * device admin removal attempt). Stores the event and notifies the parent via FCM.
 */
export const reportTamperEvent = functions.https.onCall(
  async (data: { childId: string; eventType: string; timestamp: number }, context: CallableContext) => {
    const callerId = requireAuth(context);
    validateAppCheck(context, true);
    const { childId, eventType, timestamp } = data;

    if (!childId || !eventType) {
      throw new functions.https.HttpsError("invalid-argument", "Missing childId or eventType.");
    }

    if (callerId !== childId) {
      throw new functions.https.HttpsError("permission-denied", "Child device is not authorized to report tamper events for another device.");
    }

    // Look up the child to find the parent (masterImei)
    const childDoc = await db().collection("children").doc(childId).get();
    if (!childDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Child device not found.");
    }

    const masterImei = childDoc.data()?.masterImei;
    if (!masterImei) {
      throw new functions.https.HttpsError("not-found", "No parent linked to this child.");
    }

    try {
      // Store tamper event
      await db().collection("children").doc(childId).collection("tamperEvents").add({
        eventType,
        timestamp: timestamp || Date.now(),
        reportedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Send FCM notification to parent
      const masterDoc = await db().collection("masters").doc(masterImei).get();
      const fcmToken = masterDoc.data()?.fcmToken;
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: "⚠️ Tamper Alert",
            body: `Child device reported: ${eventType.replace(/_/g, " ")}`,
          },
          data: {
            type: "tamper_alert",
            childId,
            eventType,
          },
        });
      }

      functions.logger.warn(`Tamper event from child ${childId}: ${eventType}`);
      return { success: true };
    } catch (error) {
      functions.logger.error(`Failed to process tamper event for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to process tamper event.");
    }
  }
);
