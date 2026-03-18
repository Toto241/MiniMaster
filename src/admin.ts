/**
 * Admin & System Cloud Functions.
 * Handles account deletion, DSAR data export, daily error reports,
 * Gemini API testing, knowledge base management, FCM test push, and scheduled job triggers.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { db, storage } from "../firebase";
import { requireAuth, requireAdmin, checkRateLimit, validateAppCheck, AuditLogger } from "./shared";

const LEGAL_CONSENTS_COLLECTION = "masterLegalConsents";

async function deleteQuerySnapshot(snapshot: FirebaseFirestore.QuerySnapshot): Promise<number> {
  if (snapshot.empty) return 0;
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  return snapshot.size;
}

async function deleteMasterAccountById(masterId: string, context: CallableContext, startTime: number) {
  const masterDeviceRef = db().collection("masters").doc(masterId);
  const masterDoc = await masterDeviceRef.get();
  if (!masterDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Master account not found.");
  }

  const tasksSnapshot = await db().collectionGroup("tasks").where("masterImei", "==", masterId).get();
  const tasksDeleted = await deleteQuerySnapshot(tasksSnapshot);

  const childrenSnapshot = await db().collection("children").where("masterImei", "==", masterId).get();
  const childrenDeleted = await deleteQuerySnapshot(childrenSnapshot);

  const subsSnapshot = await db().collection("subscriptions").where("masterId", "==", masterId).get();
  const subscriptionsDeleted = await deleteQuerySnapshot(subsSnapshot);

  const ticketsSnapshot = await db().collection("supportTickets").where("masterImei", "==", masterId).get();
  const supportTicketsDeleted = await deleteQuerySnapshot(ticketsSnapshot);

  const supportGrantsSnapshot = await db().collection("supportAccessGrants").where("masterImei", "==", masterId).get();
  const supportGrantsDeleted = await deleteQuerySnapshot(supportGrantsSnapshot);

  const legalConsentsSnapshot = await db().collection(LEGAL_CONSENTS_COLLECTION).where("masterImei", "==", masterId).get();
  const legalConsentsDeleted = await deleteQuerySnapshot(legalConsentsSnapshot);

  const auditLogsSnapshot = await db().collection("audit_logs").where("userId", "==", masterId).get();
  const auditLogsDeleted = await deleteQuerySnapshot(auditLogsSnapshot);

  const errorLogsSnapshot = await db().collection("error_logs").where("userId", "==", masterId).get();
  const errorLogsDeleted = await deleteQuerySnapshot(errorLogsSnapshot);

  const performanceMetricsSnapshot = await db().collection("performance_metrics").where("userId", "==", masterId).get();
  const performanceMetricsDeleted = await deleteQuerySnapshot(performanceMetricsSnapshot);

  await masterDeviceRef.delete();
  await admin.auth().deleteUser(masterId);

  await AuditLogger.logSuccess(
    "device.delete", context, `masters/${masterId}`, "device",
    {
      masterId,
      childrenDeleted,
      tasksDeleted,
      subscriptionsDeleted,
      supportTicketsDeleted,
      supportGrantsDeleted,
      legalConsentsDeleted,
      auditLogsDeleted,
      errorLogsDeleted,
      performanceMetricsDeleted,
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

    let storageStatus = "ok";
    let storageBucketName: string | null = null;
    try {
      storageBucketName = storage().bucket().name || null;
      await storage().bucket().getMetadata();
    } catch (error) {
      storageStatus = `error: ${(error as Error).message}`;
    }

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      checks,
      prerequisites: {
        storage: storageStatus,
        storageBucket: storageBucketName,
        ai: {
          geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
          geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
          openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
        },
        environment: {
          projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG || null,
          functionsEmulator: process.env.FUNCTIONS_EMULATOR === "true",
        },
      },
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

      const supportGrantsSnapshot = await db().collection("supportAccessGrants").where("masterImei", "==", masterId).get();
      const supportAccessGrants = supportGrantsSnapshot.docs.map((g) => ({ id: g.id, ...g.data() }));

      const legalConsentsSnapshot = await db().collection(LEGAL_CONSENTS_COLLECTION).where("masterImei", "==", masterId).get();
      const legalConsents = legalConsentsSnapshot.docs.map((c) => ({ id: c.id, ...c.data() }));

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
        supportAccessGrants,
        legalConsents,
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

// ==================== GEMINI API TEST ====================

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export const testGeminiConnection = functions.https.onCall(
  async (data: { prompt?: string }, context: CallableContext) => {
    requireAdmin(context);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, error: "GEMINI_API_KEY ist nicht konfiguriert." };
    }

    const testPrompt = data?.prompt || "Antworte kurz: Was ist MiniMaster?";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: testPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Gemini API Fehler (${response.status}): ${errorText}` };
      }

      const result = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

      return { success: true, model: GEMINI_MODEL, response: text };
    } catch (error) {
      return { success: false, error: `Verbindungsfehler: ${(error as Error).message}` };
    }
  }
);

// ==================== KNOWLEDGE BASE MANAGEMENT ====================

export const getKnowledgeBase = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    requireAdmin(context);

    // Try Firestore first (runtime edits), fall back to deployed file
    const doc = await db().collection("operatorConfig").doc("knowledgeBase").get();
    if (doc.exists && doc.data()?.content) {
      return { success: true, content: doc.data()!.content, source: "firestore" };
    }

    try {
      const filePath = path.join(__dirname, "..", "knowledge_base.txt");
      const content = fs.readFileSync(filePath, "utf-8");
      return { success: true, content, source: "file" };
    } catch {
      return { success: true, content: "", source: "empty" };
    }
  }
);

export const updateKnowledgeBase = functions.https.onCall(
  async (data: { content?: string }, context: CallableContext) => {
    requireAdmin(context);

    if (typeof data?.content !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "content (string) is required.");
    }

    await db().collection("operatorConfig").doc("knowledgeBase").set({
      content: data.content,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth!.uid,
    });

    functions.logger.info(`Knowledge base updated by admin ${context.auth!.uid} (${data.content.length} chars).`);
    return { success: true, length: data.content.length };
  }
);

// ==================== FCM TEST PUSH ====================

export const sendTestFcmMessage = functions.https.onCall(
  async (data: { token?: string; childId?: string }, context: CallableContext) => {
    requireAdmin(context);

    let fcmToken = data?.token;

    // If childId provided, look up the FCM token
    if (!fcmToken && data?.childId) {
      const childDoc = await db().collection("children").doc(data.childId).get();
      fcmToken = childDoc.data()?.fcmToken;
      if (!fcmToken) {
        return { success: false, error: `Kein FCM-Token für Kind ${data.childId} gefunden.` };
      }
    }

    if (!fcmToken || typeof fcmToken !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "token oder childId ist erforderlich.");
    }

    try {
      const messageId = await admin.messaging().send({
        token: fcmToken,
        notification: {
          title: "MiniMaster Test",
          body: "Dies ist eine Test-Nachricht vom Admin-Panel.",
        },
        data: {
          type: "admin_test",
          timestamp: Date.now().toString(),
        },
      });

      functions.logger.info(`Test FCM sent by admin ${context.auth!.uid} to token ${fcmToken.substring(0, 20)}...`);
      return { success: true, messageId };
    } catch (error) {
      return { success: false, error: `FCM Fehler: ${(error as Error).message}` };
    }
  }
);

// ==================== SCHEDULED JOB TRIGGERS ====================

export const triggerScheduledJob = functions.https.onCall(
  async (data: { jobName?: string }, context: CallableContext) => {
    requireAdmin(context);

    const jobName = data?.jobName;
    if (!jobName || typeof jobName !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "jobName ist erforderlich.");
    }

    const startTime = Date.now();

    try {
      switch (jobName) {
        case "checkExpiredSubscriptions": {
          const subsSnapshot = await db().collection("subscriptions")
            .where("status", "==", "active").get();
          let expired = 0;
          const now = admin.firestore.Timestamp.now();
          for (const doc of subsSnapshot.docs) {
            const expiresAt = doc.data().expiresAt;
            if (expiresAt && expiresAt.toMillis() < now.toMillis()) {
              await doc.ref.update({ status: "expired", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              expired++;
            }
          }
          return { success: true, jobName, duration: Date.now() - startTime, result: { checked: subsSnapshot.size, expired } };
        }

        case "cleanupExpiredGrants": {
          const grantsSnapshot = await db().collection("supportTickets")
            .where("accessGranted", "==", true).get();
          let revoked = 0;
          const now = admin.firestore.Timestamp.now();
          for (const doc of grantsSnapshot.docs) {
            const expiresAt = doc.data().accessExpiresAt;
            if (expiresAt && expiresAt.toMillis() < now.toMillis()) {
              await doc.ref.update({ accessGranted: false, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
              revoked++;
            }
          }
          return { success: true, jobName, duration: Date.now() - startTime, result: { checked: grantsSnapshot.size, revoked } };
        }

        case "sendDailyErrorReport": {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const errorsSnapshot = await db().collection("error_logs")
            .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(since)).get();
          return { success: true, jobName, duration: Date.now() - startTime, result: { errorsLast24h: errorsSnapshot.size } };
        }

        default:
          throw new functions.https.HttpsError("invalid-argument", `Unbekannter Job: ${jobName}`);
      }
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error(`Failed to trigger job ${jobName}:`, error);
      throw new functions.https.HttpsError("internal", `Job-Ausführung fehlgeschlagen: ${(error as Error).message}`);
    }
  }
);
