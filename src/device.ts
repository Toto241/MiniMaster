/**
 * Device Management Cloud Functions.
 * Handles device locking, blacklist management, usage rules, heartbeat, and FCM registration.
 *
 * Improvements:
 * - Centralized input validation with XSS protection
 * - Structured error handling
 * - Enhanced usage rules validation
 * - Strict input sanitization for all string fields
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, checkRateLimit, validateAppCheck, AuditLogger, getTracedLogger } from "./shared";
import { syncLegacyUsageRulesToCanonicalRules } from "./controllers/decisioning";
import {
  validateDeviceId,
  validateBoolean,
  validateString,
  validateStringArray,
  validateUsageRules,
  validateToken,
  validateNumber,
} from "./validation";
import { withErrorHandling } from "./error-handler";

const MAX_APP_BLACKLIST_ENTRIES = 200;
const MAX_APP_BLACKLIST_VALUE_LENGTH = 4096;

/**
 * Firestore hands back documents as untyped `DocumentData` (`any`-valued), which
 * trips the `no-unsafe-*` lint family at every field access. These narrow,
 * caller-asserted shapes let the call sites read data type-safely. They are
 * deliberately partial: only the fields this module actually touches are declared.
 */
interface ChildDeviceDoc {
  masterImei?: string;
  isLocked?: boolean;
  appBlacklist?: string[];
  usageRules?: object;
}
interface MasterDeviceDoc { fcmToken?: string }

function normalizeAppBlacklist(appBlacklist: unknown): string[] {
  return validateStringArray(appBlacklist, "appBlacklist", {
    required: true,
    maxLength: MAX_APP_BLACKLIST_ENTRIES,
    maxItemLength: MAX_APP_BLACKLIST_VALUE_LENGTH,
    unique: true,
  });
}

// ==================== SET DEVICE LOCKED ====================

export const setDeviceLocked = functions.https.onCall(
  withErrorHandling(
    "setDeviceLocked",
    async (data: { childId: string; isLocked: boolean }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "setDeviceLocked");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(masterId, "setDeviceLocked", 30);

      const childId = validateDeviceId(data.childId);
      const isLocked = validateBoolean(data.isLocked, "isLocked");

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
          "Master not authorized for this child", { childId, isLocked, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "This master device is not authorized to control the specified child device.");
      }

      await childDeviceRef.update({
        isLocked,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        isLocked ? "device.lock" : "device.unlock", context,
        `children/${childId}`, "device",
        { childId, isLocked, duration: Date.now() - startTime, traceId }
      );

      logger.info(`Lock state for child ${childId} set to ${isLocked} by master ${masterId}.`);
      return { success: true, isLocked };
    }
  )
);

// ==================== UPDATE APP BLACKLIST ====================

export const updateAppBlacklist = functions.https.onCall(
  withErrorHandling(
    "updateAppBlacklist",
    async (data: { childId: string; appBlacklist: string[] }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "updateAppBlacklist");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);

      const childId = validateDeviceId(data.childId);
      const appBlacklist = normalizeAppBlacklist(data.appBlacklist);

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
          "Master not authorized for this child", { childId, appCount: appBlacklist.length, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
      }

      await childDeviceRef.update({
        appBlacklist,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "rules.update_blacklist", context, `children/${childId}`, "rule",
        { childId, appCount: appBlacklist.length, duration: Date.now() - startTime, traceId }
      );

      logger.info(`App blacklist for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    }
  )
);

// ==================== SET USAGE RULES ====================

export const setUsageRules = functions.https.onCall(
  withErrorHandling(
    "setUsageRules",
    async (data: { childId: string; usageRules: object }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "setUsageRules");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);

      const childId = validateDeviceId(data.childId);
      const usageRules = validateUsageRules(data.usageRules);

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
          "Master not authorized for this child", { childId, traceId }
        );
        throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
      }

      await childDeviceRef.update({
        usageRules,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await syncLegacyUsageRulesToCanonicalRules(masterId, childId, usageRules);

      await AuditLogger.logSuccess(
        "rules.update_usage", context, `children/${childId}`, "rule",
        { childId, duration: Date.now() - startTime, traceId }
      );

      logger.info(`Usage rules for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    }
  )
);

// ==================== GET RULES FOR CHILD ====================

export const getRulesForChild = functions.https.onCall(
  withErrorHandling(
    "getRulesForChild",
    async (data: { childId: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "getRulesForChild");
      void logger; void traceId;
      const requesterId = requireAuth(context);
      validateAppCheck(context, true);

      const childId = validateDeviceId(data.childId);

      const childDeviceRef = db().collection("children").doc(childId);
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      const childData = doc.data() as ChildDeviceDoc | undefined;
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
    }
  )
);

// ==================== RECORD HEARTBEAT ====================

export const recordHeartbeat = functions.https.onCall(
  withErrorHandling(
    "recordHeartbeat",
    async (_data: Record<string, never>, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "recordHeartbeat");
      void logger;
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);

      const childDeviceRef = db().collection("children").doc(childId);
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError("not-found", "The specified child device does not exist.");
      }

      await childDeviceRef.update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "system.heartbeat", context, `children/${childId}`, "system",
        { childId, duration: Date.now() - startTime, traceId }
      );

      return { success: true };
    }
  )
);

// ==================== REGISTER FCM TOKEN ====================

export const registerFcmToken = functions.https.onCall(
  withErrorHandling(
    "registerFcmToken",
    async (data: { token: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "registerFcmToken");
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);

      const token = validateToken(data.token);

      const childDeviceRef = db().collection("children").doc(childId);
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      await childDeviceRef.update({ fcmToken: token });

      await AuditLogger.logSuccess(
        "device.register", context, `children/${childId}`, "device",
        { tokenType: "fcm", childId, duration: Date.now() - startTime, traceId }
      );

      logger.info(`FCM token for child ${childId} has been registered.`);
      return { success: true };
    }
  )
);

// ==================== UPDATE FCM TOKEN (MASTER) ====================

export const updateFCMToken = functions.https.onCall(
  withErrorHandling(
    "updateFCMToken",
    async (data: { fcmToken: string }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "updateFCMToken");
      const startTime = Date.now();
      const masterId = requireAuth(context);
      validateAppCheck(context, true);

      const fcmToken = validateToken(data.fcmToken, "fcmToken");

      const masterDeviceRef = db().collection("masters").doc(masterId);
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      await masterDeviceRef.update({
        fcmToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "device.register", context, `masters/${masterId}`, "device",
        { tokenType: "fcm", masterId, duration: Date.now() - startTime, traceId }
      );

      logger.info(`FCM token updated for master ${masterId}.`);
      return { success: true };
    }
  )
);

// ==================== REPORT DAILY USAGE ====================

export const reportDailyUsage = functions.https.onCall(
  withErrorHandling(
    "reportDailyUsage",
    async (data: { date: string; usageMillis: number }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "reportDailyUsage");
      void logger;
      const startTime = Date.now();
      const childId = requireAuth(context);
      validateAppCheck(context, true);

      const date = validateString(data.date, "date", {
        required: true,
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        sanitize: "none",
      });
      const usageMillis = validateNumber(data.usageMillis, "usageMillis", {
        min: 0,
        max: 86400000, // 24 hours in ms
        integer: true,
      });

      const historyRef = db().collection("children").doc(childId).collection("usageHistory").doc(date);

      await historyRef.set({
        date,
        totalUsageMillis: usageMillis,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await AuditLogger.logSuccess(
        "rules.update_screen_time", context, `children/${childId}/usageHistory/${date}`, "system",
        { childId, date, usageMillis, duration: Date.now() - startTime, traceId }
      );

      return { success: true };
    }
  )
);

// ==================== REPORT TAMPER EVENT ====================

export const reportTamperEvent = functions.https.onCall(
  withErrorHandling(
    "reportTamperEvent",
    async (data: { childId: string; eventType: string; timestamp: number }, context: CallableContext) => {
      const { logger, traceId } = getTracedLogger(context, "reportTamperEvent");
      void traceId;
      const callerId = requireAuth(context);
      validateAppCheck(context, true);

      const childId = validateDeviceId(data.childId);
      const eventType = validateString(data.eventType, "eventType", {
        required: true,
        maxLength: 64,
        sanitize: "strip",
      });
      const timestamp = data.timestamp ? validateNumber(data.timestamp, "timestamp", {
        min: 0,
        integer: true,
      }) : Date.now();

      if (callerId !== childId) {
        throw new functions.https.HttpsError("permission-denied", "Child device is not authorized to report tamper events for another device.");
      }

      const childDoc = await db().collection("children").doc(childId).get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      const masterImei = (childDoc.data() as ChildDeviceDoc | undefined)?.masterImei;
      if (!masterImei) {
        throw new functions.https.HttpsError("not-found", "No parent linked to this child.");
      }

      await db().collection("children").doc(childId).collection("tamperEvents").add({
        eventType,
        timestamp,
        reportedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const masterDoc = await db().collection("masters").doc(masterImei).get();
      const fcmToken = (masterDoc.data() as MasterDeviceDoc | undefined)?.fcmToken;
      if (fcmToken) {
        await admin.messaging().send({
          token: fcmToken,
          notification: {
            title: "Tamper Alert",
            body: `Child device reported: ${eventType.replace(/_/g, " ")}`,
          },
          data: {
            type: "tamper_alert",
            childId,
            eventType,
          },
        });
      }

      logger.warn(`Tamper event from child ${childId}: ${eventType}`);
      return { success: true };
    }
  )
);
