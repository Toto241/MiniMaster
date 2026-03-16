/**
 * Admin & System Cloud Functions.
 * Handles account deletion, DSAR data export, daily error reports.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, requireAdmin, checkRateLimit, validateAppCheck, AuditLogger } from "./shared";

async function deleteMasterAccountById(masterId: string, context: CallableContext, startTime: number) {
  const masterDeviceRef = db().collection("masters").doc(masterId);
  const masterDoc = await masterDeviceRef.get();
  if (!masterDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Master account not found.");
  }

  const childrenSnapshot = await db().collection("children").where("masterImei", "==", masterId).get();
  const deleteChildrenPromises = childrenSnapshot.docs.map((doc) => doc.ref.delete());
  await Promise.all(deleteChildrenPromises);

  const tasksSnapshot = await db().collectionGroup("tasks").where("masterImei", "==", masterId).get();
  const deleteTasksPromises = tasksSnapshot.docs.map((doc) => doc.ref.delete());
  await Promise.all(deleteTasksPromises);

  const subsSnapshot = await db().collection("subscriptions").where("masterId", "==", masterId).get();
  const deleteSubsPromises = subsSnapshot.docs.map((doc) => doc.ref.delete());
  await Promise.all(deleteSubsPromises);

  await masterDeviceRef.delete();
  await admin.auth().deleteUser(masterId);

  await AuditLogger.logSuccess(
    "device.delete", context, `masters/${masterId}`, "device",
    {
      masterId, childrenDeleted: childrenSnapshot.size,
      tasksDeleted: tasksSnapshot.size, subscriptionsDeleted: subsSnapshot.size,
      duration: Date.now() - startTime,
    }
  );
}

/**
 * Deletes a user account and all associated data.
 */
export const deleteUserAccount = functions.https.onCall(
  async (data: { masterId?: string }, context: CallableContext) => {
    const startTime = Date.now();
    const callerId = requireAuth(context);
    const isAdmin = context.auth?.token?.role === "admin";

    let masterId = callerId;
    if (isAdmin && data?.masterId && typeof data.masterId === "string") {
      masterId = data.masterId;
    } else if (!isAdmin && data?.masterId && data.masterId !== callerId) {
      throw new functions.https.HttpsError("permission-denied", "Users can only delete their own account.");
    }

    try {
      await deleteMasterAccountById(masterId, context, startTime);

      functions.logger.info(`User account and all associated data deleted for master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "device.delete", context, `masters/${masterId}`, "device",
        error as Error, { masterId }
      );
      functions.logger.error(`Failed to delete user account for master ${masterId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while deleting the user account.", error);
    }
  }
);

/**
 * Safe admin health check for the operator dashboard (read-only, no side effects).
 */
export const adminHealthCheck = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    requireAdmin(context);

    const collections = ["masters", "children", "supportTickets", "audit_logs", "operatorConfig"];
    const checks: Record<string, string> = {};

    for (const collectionName of collections) {
      try {
        await db().collection(collectionName).limit(1).get();
        checks[collectionName] = "ok";
      } catch (error) {
        checks[collectionName] = `error: ${(error as Error).message}`;
      }
    }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      checks,
      functions: {
        validatePairingCode: true,
        getSubscriptionStatus: true,
        exportUserData: true,
      },
    };
  }
);

/**
 * Scheduled: sends a daily error summary at 9 AM Europe/Berlin.
 */
export const sendDailyErrorReport = functions.pubsub
  .schedule("0 9 * * *")
  .timeZone("Europe/Berlin")
  .onRun(async (_context) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const errorSnapshot = await db()
        .collection("error_logs")
        .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(yesterday))
        .where("timestamp", "<", admin.firestore.Timestamp.fromDate(today))
        .get();

      if (errorSnapshot.empty) {
        functions.logger.info("Daily Error Report: No errors in the last 24 hours ✅");
        return null;
      }

      const errorsByFunction: Record<string, number> = {};
      const errorsByType: Record<string, number> = {};

      errorSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        const functionName = data.functionName || "unknown";
        const errorMessage = data.message || "unknown";
        errorsByFunction[functionName] = (errorsByFunction[functionName] || 0) + 1;
        errorsByType[errorMessage] = (errorsByType[errorMessage] || 0) + 1;
      });

      const sortedFunctions = Object.entries(errorsByFunction)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);
      const sortedErrors = Object.entries(errorsByType)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

      const report = `
╔════════════════════════════════════════════════════════════════
║ Daily Error Report - ${today.toDateString()}
╠════════════════════════════════════════════════════════════════
║ Total Errors: ${errorSnapshot.size}
║
║ Top Errors by Function:
${sortedFunctions.map(([name, count]) => "║   - " + name + ": " + count).join("\n")}
║
║ Top Error Messages:
${sortedErrors.map(([msg, count]) => "║   - " + msg.substring(0, 60) + "...: " + count).join("\n")}
╚════════════════════════════════════════════════════════════════
      `;

      functions.logger.warn(report);

      await db().collection("error_summaries").add({
        date: today,
        totalErrors: errorSnapshot.size,
        errorsByFunction,
        errorsByType,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return null;
    } catch (error) {
      functions.logger.error("Failed to generate daily error report:", error);
      return null;
    }
  });

/**
 * GDPR/DSAR data export – admin only.
 */
export const exportUserData = functions.https.onCall(
  async (data: { masterId?: string }, context: CallableContext) => {
    const startTime = Date.now();
    requireAdmin(context);
    const adminId = requireAuth(context);
    validateAppCheck(context, true);

    const { masterId } = data || {};
    if (!masterId || typeof masterId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "masterId is required.");
    }

    checkRateLimit(adminId, "exportUserData", 5, 3600000);

    try {
      const masterDoc = await db().collection("masters").doc(masterId).get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }
      const masterData = masterDoc.data();

      const childrenSnapshot = await db().collection("children").where("masterImei", "==", masterId).get();
      const childrenData: any[] = [];
      for (const childDoc of childrenSnapshot.docs) {
        const childInfo = childDoc.data();
        const tasksSnapshot = await childDoc.ref.collection("tasks").get();
        const tasks = tasksSnapshot.docs.map((t) => ({ id: t.id, ...t.data() }));
        const usageSnapshot = await childDoc.ref.collection("usageHistory").get();
        const usageHistory = usageSnapshot.docs.map((u) => ({ id: u.id, ...u.data() }));
        childrenData.push({ id: childDoc.id, ...childInfo, tasks, usageHistory });
      }

      const subsSnapshot = await db().collection("subscriptions").where("masterId", "==", masterId).get();
      const subscriptions = subsSnapshot.docs.map((s) => ({ id: s.id, ...s.data() }));

      const ticketsSnapshot = await db().collection("supportTickets").where("masterImei", "==", masterId).get();
      const supportTickets = ticketsSnapshot.docs.map((t) => ({ id: t.id, ...t.data() }));

      const auditSnapshot = await db().collection("audit_logs")
        .where("userId", "==", masterId)
        .orderBy("timestamp", "desc")
        .limit(500)
        .get();
      const auditLogs = auditSnapshot.docs.map((a) => ({ id: a.id, ...a.data() }));

      const exportData = {
        exportedAt: new Date().toISOString(),
        masterId,
        masterProfile: masterData,
        children: childrenData,
        subscriptions,
        supportTickets,
        auditLogs,
      };

      await AuditLogger.logSuccess(
        "device.delete", context, `masters/${masterId}`, "user",
        { action: "data_export", duration: Date.now() - startTime }
      );

      functions.logger.info(`Data export completed for master ${masterId} by admin ${adminId}.`);
      return { success: true, data: exportData };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error(`Failed to export data for master ${masterId}:`, error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while exporting user data.", error);
    }
  }
);
