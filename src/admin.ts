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
import { db, auth, storage } from "../firebase";
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
  await auth().deleteUser(masterId);

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
export const adminHealthCheck = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(
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
          openAiFallbackEnabled: process.env.OPENAI_FALLBACK_ENABLED === "true",
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

export const testGeminiConnection = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(
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

// ==================== AI ERROR ANALYSIS (GEMINI) ====================

let knowledgeBaseAdmin = "";
try {
  const kbPath = path.join(__dirname, "..", "knowledge_base.txt");
  knowledgeBaseAdmin = fs.readFileSync(kbPath, "utf-8");
} catch { /* knowledge base file is optional */ }

/**
 * Analyzes recent error_logs with Gemini AI and returns structured diagnosis + fix proposals.
 * Only accessible to admins. All analyses are logged to `ai_error_analyses`.
 */
export const analyzeSystemErrors = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(
  async (data: { hours?: number; functionFilter?: string; errorId?: string }, context: CallableContext) => {
    requireAdmin(context);
    const adminId = requireAuth(context);
    checkRateLimit(adminId, "analyzeSystemErrors", 10, 3600000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "GEMINI_API_KEY ist nicht konfiguriert.");
    }

    const hours = Math.min(Math.max(data?.hours || 24, 1), 168); // 1h–7d
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const query: FirebaseFirestore.Query = db().collection("error_logs")
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(since))
      .orderBy("timestamp", "desc")
      .limit(50);

    // Single error analysis
    if (data?.errorId && typeof data.errorId === "string") {
      const errDoc = await db().collection("error_logs").doc(data.errorId).get();
      if (!errDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Fehler-Eintrag nicht gefunden.");
      }
      const errData = errDoc.data()!;
      const errors = [{ id: errDoc.id, ...errData }];
      return await performAnalysis(apiKey, errors, adminId, context);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      return { analyses: [], summary: "Keine Fehler im gewählten Zeitraum gefunden.", totalErrors: 0 };
    }

    // Group errors by function+message for deduplication
    const errorGroups: Record<string, { count: number; latestId: string; functionName: string; message: string; stack: string; timestamp: any }> = {};
    snapshot.docs.forEach((doc) => {
      const d = doc.data();
      const key = `${d.functionName || "unknown"}::${(d.message || "").substring(0, 100)}`;
      if (!errorGroups[key]) {
        errorGroups[key] = { count: 0, latestId: doc.id, functionName: d.functionName || "unknown", message: d.message || "", stack: d.stack || "", timestamp: d.timestamp };
      }
      errorGroups[key].count++;
    });

    // Filter by function if specified
    let groups = Object.values(errorGroups);
    if (data?.functionFilter && typeof data.functionFilter === "string") {
      groups = groups.filter((g) => g.functionName === data.functionFilter);
    }

    // Sort by count desc, take top 10
    groups.sort((a, b) => b.count - a.count);
    const topErrors = groups.slice(0, 10);

    return await performAnalysis(apiKey, topErrors.map((g) => ({
      id: g.latestId,
      functionName: g.functionName,
      message: g.message,
      stack: g.stack,
      count: g.count,
      timestamp: g.timestamp,
    })), adminId, context);
  }
);

async function performAnalysis(
  apiKey: string,
  errors: Array<{ id: string; functionName?: string; message?: string; stack?: string; count?: number; [key: string]: any }>,
  adminId: string,
  context: CallableContext,
) {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  // Load runtime KB if available
  let kb = knowledgeBaseAdmin;
  try {
    const kbDoc = await db().collection("operatorConfig").doc("knowledgeBase").get();
    if (kbDoc.exists && kbDoc.data()?.content) kb = kbDoc.data()!.content;
  } catch { /* use static KB */ }

  const errorSummary = errors.map((e, i) => {
    return `[Fehler ${i + 1}] Funktion: ${e.functionName || "?"}, Auftreten: ${e.count || 1}x\nNachricht: ${(e.message || "").substring(0, 300)}\nStack: ${(e.stack || "").substring(0, 500)}`;
  }).join("\n\n");

  const prompt = `Du bist ein DevOps-Experte für die MiniMaster Parental-Control-Suite (Firebase Cloud Functions, TypeScript).
Analysiere die folgenden Systemfehler und erstelle für jeden eine strukturierte Diagnose mit Lösungsvorschlag.

FEHLER:
${errorSummary}

${kb ? `WISSENSBASIS (Projektkontext):\n${kb.substring(0, 6000)}\n` : ""}
WICHTIG: Antworte als JSON-Array. Jedes Element muss folgende Felder haben:
[
  {
    "errorIndex": 0,
    "severity": "critical|high|medium|low",
    "category": "config|code|data|network|auth|resource",
    "diagnosis": "Kurze Erklärung der Ursache (2-3 Sätze)",
    "solution": "Konkrete Schritt-für-Schritt-Lösung",
    "autoFixable": true/false,
    "autoFixAction": "Name der automatischen Aktion falls möglich (z.B. 'restart_function', 'cleanup_expired', 'reindex'), sonst null",
    "autoFixDescription": "Beschreibung was der Auto-Fix tut, sonst null"
  }
]

Mögliche autoFixAction-Werte:
- "cleanup_expired_subscriptions": Abgelaufene Abos bereinigen
- "cleanup_expired_grants": Abgelaufene Zugriffsrechte entfernen
- "regenerate_error_report": Fehlerreport neu generieren
- "clear_error_logs": Alte Fehlerlogs (>30d) bereinigen
- null: Kein Auto-Fix möglich (manuell notwendig)

Antworte NUR mit dem JSON-Array, kein Markdown.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: "application/json" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Fehler (${response.status}): ${errText.substring(0, 200)}`);
    }

    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "[]";

    let analyses: Array<{
      errorIndex: number; severity: string; category: string;
      diagnosis: string; solution: string;
      autoFixable: boolean; autoFixAction: string | null; autoFixDescription: string | null;
    }>;

    try {
      analyses = JSON.parse(rawText);
      if (!Array.isArray(analyses)) analyses = [analyses];
    } catch {
      analyses = [{ errorIndex: 0, severity: "medium", category: "code", diagnosis: rawText.substring(0, 500), solution: "Manuelle Prüfung erforderlich.", autoFixable: false, autoFixAction: null, autoFixDescription: null }];
    }

    // Enrich with error metadata
    const enriched = analyses.map((a, idx) => ({
      ...a,
      errorId: errors[idx]?.id || errors[0]?.id || "unknown",
      functionName: errors[idx]?.functionName || errors[0]?.functionName || "unknown",
      errorMessage: errors[idx]?.message || errors[0]?.message || "",
      occurrences: errors[idx]?.count || 1,
    }));

    // Log analysis to Firestore
    const analysisDoc = await db().collection("ai_error_analyses").add({
      analyzedBy: adminId,
      analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
      errorCount: errors.length,
      model,
      analyses: enriched,
      status: "pending", // pending | applied | dismissed
    });

    await AuditLogger.logSuccess(
      "ai.error_analysis", context, `ai_error_analyses/${analysisDoc.id}`, "system",
      { errorCount: errors.length, analysisCount: enriched.length, model }
    );

    return {
      analysisId: analysisDoc.id,
      analyses: enriched,
      summary: `${enriched.length} Fehler analysiert. ${enriched.filter(a => a.autoFixable).length} automatisch behebbar.`,
      totalErrors: errors.length,
      model,
    };
  } catch (error) {
    clearTimeout(timeout);
    functions.logger.error("AI error analysis failed:", error);
    throw new functions.https.HttpsError("internal", `KI-Fehleranalyse fehlgeschlagen: ${(error as Error).message}`);
  }
}

/**
 * Executes an auto-fix action proposed by the AI analysis.
 * Logs all actions to ai_error_analyses and audit_logs.
 */
export const executeAutoFix = functions.https.onCall(
  async (data: { analysisId: string; errorIndex: number; action: string }, context: CallableContext) => {
    requireAdmin(context);
    const adminId = requireAuth(context);
    validateAppCheck(context, true);

    const { analysisId, errorIndex, action } = data || {};
    if (!analysisId || typeof analysisId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "analysisId ist erforderlich.");
    }
    if (typeof errorIndex !== "number" || errorIndex < 0) {
      throw new functions.https.HttpsError("invalid-argument", "errorIndex ist erforderlich.");
    }
    if (!action || typeof action !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "action ist erforderlich.");
    }

    // Verify analysis exists
    const analysisRef = db().collection("ai_error_analyses").doc(analysisId);
    const analysisDoc = await analysisRef.get();
    if (!analysisDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Analyse nicht gefunden.");
    }

    // Allowlisted auto-fix actions
    const ALLOWED_ACTIONS: Record<string, () => Promise<{ result: string; details: any }>> = {
      cleanup_expired_subscriptions: async () => {
        const subsSnap = await db().collection("subscriptions").where("status", "==", "active").get();
        let expired = 0;
        const now = admin.firestore.Timestamp.now();
        for (const doc of subsSnap.docs) {
          const expiresAt = doc.data().expiresAt;
          if (expiresAt && expiresAt.toMillis() < now.toMillis()) {
            await doc.ref.update({ status: "expired", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            expired++;
          }
        }
        return { result: `${expired} abgelaufene Abonnements bereinigt.`, details: { checked: subsSnap.size, expired } };
      },

      cleanup_expired_grants: async () => {
        const grantsSnap = await db().collection("supportAccessGrants")
          .where("expiresAt", "<", admin.firestore.Timestamp.now()).get();
        let revoked = 0;
        for (const doc of grantsSnap.docs) {
          await doc.ref.delete();
          revoked++;
        }
        return { result: `${revoked} abgelaufene Zugriffsrechte entfernt.`, details: { revoked } };
      },

      regenerate_error_report: async () => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const errSnap = await db().collection("error_logs")
          .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(since)).get();
        const errorsByFunction: Record<string, number> = {};
        errSnap.docs.forEach((doc) => {
          const fn = doc.data().functionName || "unknown";
          errorsByFunction[fn] = (errorsByFunction[fn] || 0) + 1;
        });
        await db().collection("error_summaries").add({
          date: new Date(),
          totalErrors: errSnap.size,
          errorsByFunction,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
          triggeredBy: "auto_fix",
        });
        return { result: `Fehlerreport für ${errSnap.size} Fehler erstellt.`, details: { totalErrors: errSnap.size } };
      },

      clear_error_logs: async () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const oldLogs = await db().collection("error_logs")
          .where("timestamp", "<", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
          .limit(500).get();
        let deleted = 0;
        for (const doc of oldLogs.docs) {
          await doc.ref.delete();
          deleted++;
        }
        return { result: `${deleted} alte Fehlerlog-Einträge (>30 Tage) gelöscht.`, details: { deleted } };
      },
    };

    if (!ALLOWED_ACTIONS[action]) {
      throw new functions.https.HttpsError("invalid-argument",
        `Unbekannte Auto-Fix-Aktion: ${action}. Erlaubt: ${Object.keys(ALLOWED_ACTIONS).join(", ")}`);
    }

    try {
      const fixResult = await ALLOWED_ACTIONS[action]();

      // Update analysis doc with fix result
      const analysisData = analysisDoc.data()!;
      const updatedAnalyses = [...(analysisData.analyses || [])];
      if (updatedAnalyses[errorIndex]) {
        updatedAnalyses[errorIndex] = {
          ...updatedAnalyses[errorIndex],
          fixApplied: true,
          fixResult: fixResult.result,
          fixAppliedAt: new Date().toISOString(),
          fixAppliedBy: adminId,
        };
      }
      await analysisRef.update({
        analyses: updatedAnalyses,
        status: "applied",
        lastFixAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "ai.auto_fix", context, `ai_error_analyses/${analysisId}`, "system",
        { action, errorIndex, ...fixResult.details }
      );

      functions.logger.info(`Auto-fix "${action}" executed by admin ${adminId}: ${fixResult.result}`);
      return { success: true, ...fixResult };
    } catch (error) {
      await AuditLogger.logFailure(
        "ai.auto_fix", context, `ai_error_analyses/${analysisId}`, "system",
        error as Error, { action, errorIndex }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", `Auto-Fix fehlgeschlagen: ${(error as Error).message}`);
    }
  }
);
