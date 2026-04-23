/**
 * Support & AI Cloud Functions.
 * Handles support tickets, access grants, and AI-powered automated resolution.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import * as fs from "fs";
import * as path from "path";
import { db } from "../firebase";
import { AuditLogger, checkRateLimit, requireSupportOrAdmin, validateAppCheck } from "./shared";

// ==================== AI CLIENT ====================

type AiTicketResponse = {
  solution: string;
  confidence: number;
};

type AiGenerationResult = {
  provider: "gemini" | "test-stub";
  rawResponse: string;
};

type TicketContactMeta = {
  replyToEmail?: string;
  senderName?: string;
  sourcePanel?: string;
};

type TicketConversationStatus =
  | "awaiting_debug_consent"
  | "debug_active"
  | "analyzing"
  | "waiting_user_response"
  | "closed"
  | "escalated";

type ConversationRole = "assistant" | "user" | "system";

type ConversationEntry = {
  role: ConversationRole;
  content: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

type DebugSnapshot = {
  appStatus: {
    isLocked: boolean;
    appBlacklistCount: number;
    usageRulesCount: number;
  };
  activityData: {
    lastSeen: string | null;
    updatedAt: string | null;
  };
  networkDiagnostics: {
    fcmTokenPresent: boolean;
    /**
     * Coarse-grained connectivity class as reported by the child app.
     * Allowed values: "wifi" | "cellular" | "none" | "unknown".
     * Other values are normalized to "unknown" by sanitizeDebugSnapshot.
     */
    networkType: "wifi" | "cellular" | "none" | "unknown";
  };
  deviceTelemetry: {
    /** 0..100 integer percentage; null when not reported. */
    batteryLevelPct: number | null;
    /** true if device reports charging state. */
    isCharging: boolean;
    /** Free internal storage in bytes; null when not reported. */
    storageFreeBytes: number | null;
    /** Coarse OS version string (e.g. "Android 14", "iOS 17.4"). Truncated to 32 chars. */
    osVersion: string | null;
    /** App version string (semver). Truncated to 32 chars. */
    appVersion: string | null;
  };
  recentTamperEvents: number;
  recentUsageReports: number;
  fetchedAt: string;
};

const MAX_CONVERSATION_ROUNDS = 7;
const AI_SOLUTION_CONFIDENCE = 0.75;

function shouldEscalateAfterAttempts(
  solved: boolean,
  nextRound: number,
  nextFailures: number
): boolean {
  return !solved && nextRound >= MAX_CONVERSATION_ROUNDS && nextFailures >= MAX_CONVERSATION_ROUNDS;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.0-flash";

async function generateWithGemini(prompt: string): Promise<AiGenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Gemini API timeout (30s)");
    }
    throw error;
  } finally {
    clearTimeout(timerId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const rawResponse = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("") || "";

  return {
    provider: "gemini",
    rawResponse,
  };
}

async function generateAiCompletion(prompt: string): Promise<AiGenerationResult> {
  // Keep tests deterministic and isolated from external model providers.
  if (process.env.NODE_ENV === "test") {
    // Security guard: test-stub MUST never be served from a real Cloud Functions runtime.
    // K_SERVICE is set in 2nd-gen functions, FUNCTION_TARGET/FUNCTION_NAME in 1st-gen,
    // GAE_SERVICE in legacy GAE. Local Jest never sets any of these.
    const isManagedRuntime = Boolean(
      process.env.K_SERVICE ||
      process.env.FUNCTION_TARGET ||
      process.env.FUNCTION_NAME ||
      process.env.GAE_SERVICE
    );
    if (isManagedRuntime) {
      functions.logger.error(
        "AI test-stub blocked: NODE_ENV=test darf nicht in einer Cloud-Functions-Runtime aktiv sein."
      );
      throw new functions.https.HttpsError(
        "failed-precondition",
        "AI provider misconfigured: test-stub mode is not allowed in production runtime."
      );
    }
    if (process.env.FIREBASE_CONFIG) {
      functions.logger.warn(
        "WARNING: TEST_STUB mode detected with FIREBASE_CONFIG set. AI will return stub responses. " +
        "Ensure NODE_ENV is not 'test' in production environments."
      );
    }
    return {
      provider: "test-stub",
      rawResponse: JSON.stringify({
        solution: "Test solution generated in stub mode.",
        confidence: 0.85,
      }),
    };
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("No AI provider configured. Set GEMINI_API_KEY to enable AI support.");
  }

  functions.logger.info(`Calling Gemini API with model ${GEMINI_MODEL}...`);
  return generateWithGemini(prompt);
}

function parseAiTicketResponse(rawResponse: string): AiTicketResponse {
  try {
    const parsed = JSON.parse(rawResponse) as Partial<AiTicketResponse>;
    return {
      solution: parsed.solution || "Unable to generate solution.",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return {
      solution: "AI generated an invalid response. Escalating to human support.",
      confidence: 0,
    };
  }
}

function resolveImpersonationRole(context: CallableContext): string {
  return context.auth!.token.role as string || "support";
}

function resolveExplainRole(role: string | undefined): string {
  return role || "unknown";
}

function extractTicketContactMeta(problemDescription: string | undefined): TicketContactMeta {
  const text = String(problemDescription || "");
  const lines = text.split(/\r?\n/).map((line) => line.trim());

  const replyToLine = lines.find((line) => line.startsWith("[ReplyTo] "));
  const senderLine = lines.find((line) => line.startsWith("[Sender] "));
  const sourcePanelLine = lines.find((line) => line.startsWith("[SourcePanel] "));

  const replyToEmail = replyToLine ? replyToLine.replace("[ReplyTo] ", "").trim() : undefined;
  const senderName = senderLine ? senderLine.replace("[Sender] ", "").trim() : undefined;
  const sourcePanel = sourcePanelLine ? sourcePanelLine.replace("[SourcePanel] ", "").trim() : undefined;

  return {
    replyToEmail,
    senderName,
    sourcePanel,
  };
}

function isValidEmailAddress(email: string | undefined): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function appendConversationEntry(
  ticketId: string,
  entry: ConversationEntry
): Promise<void> {
  await db()
    .collection("supportTickets")
    .doc(ticketId)
    .collection("conversationHistory")
    .add({
      role: entry.role,
      content: entry.content,
      confidence: typeof entry.confidence === "number" ? entry.confidence : null,
      metadata: entry.metadata || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

function buildInitialDebugConsentQuestion(): string {
  return [
    "Ich kann dir jetzt direkt helfen.",
    "",
    "Moechtest du den Debug-Modus aktivieren, damit ich technische Diagnose-Daten abrufen und den Fehler automatisch analysieren kann?",
    "",
    "Wenn du zustimmst, analysiere ich danach automatisch weiter.",
  ].join("\n");
}

function formatDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

async function sendSupportFollowUpEmail(params: {
  ticketId: string;
  toEmail: string;
  senderName?: string;
  sourcePanel?: string;
  message: string;
}): Promise<{ success: boolean; provider: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.SUPPORT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    const missing = [
      !apiKey ? "RESEND_API_KEY" : null,
      !fromEmail ? "SUPPORT_FROM_EMAIL" : null,
    ].filter(Boolean).join(", ");
    const error = `Email provider not configured (${missing}).`;
    functions.logger.warn(error, { ticketId: params.ticketId });
    return { success: false, provider: "none", error };
  }

  try {
    const subject = `[MiniMaster Support] Rueckfrage zu Ticket ${params.ticketId}`;
    const senderInfo = params.senderName ? `Hallo ${params.senderName},` : "Hallo,";
    const sourceLine = params.sourcePanel ? `Panel: ${params.sourcePanel}` : "Panel: unbekannt";
    const textBody = `${senderInfo}\n\n${params.message}\n\n---\nTicket: ${params.ticketId}\n${sourceLine}\n\nMiniMaster Support`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.toEmail],
        subject,
        text: textBody,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = `Resend API error (${response.status}): ${errorText}`;
      functions.logger.error(error, { ticketId: params.ticketId, toEmail: params.toEmail });
      return { success: false, provider: "resend", error };
    }

    return { success: true, provider: "resend" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email sending error";
    functions.logger.error("Failed to send support follow-up email", { ticketId: params.ticketId, message });
    return { success: false, provider: "resend", error: message };
  }
}

let knowledgeBase = "";
const knowledgeBaseCandidates = [
  process.env.KNOWLEDGE_BASE_PATH,
  path.join(__dirname, "..", "..", "knowledge_base.txt"),
  path.join(process.cwd(), "knowledge_base.txt"),
].filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);

for (const candidate of knowledgeBaseCandidates) {
  try {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    knowledgeBase = fs.readFileSync(candidate, "utf-8");
    functions.logger.info(`Knowledge base loaded from ${candidate}`);
    break;
  } catch (error) {
    functions.logger.warn(`Failed to read knowledge base candidate ${candidate}:`, error);
  }
}

if (!knowledgeBase) {
  functions.logger.warn("Knowledge base file not found. AI support answers will run without local KB context.");
}

// ==================== SUPPORT TICKETS ====================

export const createSupportTicket = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(
  async (data: { problemDescription: string; allowSupportAccess: boolean; consentSource?: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const { problemDescription, allowSupportAccess, consentSource } = data;
    if (!problemDescription || typeof problemDescription !== "string" || problemDescription.trim().length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Problem description is required.");
    }
    if (typeof allowSupportAccess !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "allowSupportAccess (boolean) is required.");
    }

    const masterImei = context.auth.uid;

    try {
      const ticketRef = await db().collection("supportTickets").add({
        masterImei: masterImei,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "open",
        problemDescription: problemDescription.trim(),
        accessGranted: false,
        supportAccessConsent: allowSupportAccess,
        supportAccessConsentSource: consentSource || "unknown",
        supportAccessConsentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      if (allowSupportAccess) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        const grantRef = await db().collection("supportAccessGrants").add({
          masterImei: masterImei,
          ticketId: ticketRef.id,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          status: "active",
          consentMode: "at_ticket_creation",
        });

        await db().collection("supportTickets").doc(ticketRef.id).update({
          accessGranted: true,
          accessGrantId: grantRef.id,
        });
      }

      functions.logger.info(`Support ticket created: ${ticketRef.id} for master ${masterImei}`);
      return { success: true, ticketId: ticketRef.id };
    } catch (error) {
      functions.logger.error(`Failed to create support ticket for master ${masterImei}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to create support ticket.", error);
    }
  }
);

export const grantSupportAccess = functions.https.onCall(
  async (data: { ticketId: string }, context: CallableContext) => {
    const startTime = Date.now();
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const { ticketId } = data;
    if (!ticketId || typeof ticketId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const masterImei = context.auth.uid;

    try {
      const ticketDoc = await db().collection("supportTickets").doc(ticketId).get();
      if (!ticketDoc.exists || ticketDoc.data()?.masterImei !== masterImei) {
        await AuditLogger.logDenied(
          "admin.grant_support_access", context, `supportTickets/${ticketId}`, "system",
          "Ticket not found or access denied", { ticketId }
        );
        throw new functions.https.HttpsError("permission-denied", "Ticket not found or access denied.");
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const grantRef = await db().collection("supportAccessGrants").add({
        masterImei: masterImei,
        ticketId: ticketId,
        grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        status: "active",
      });

      await db().collection("supportTickets").doc(ticketId).update({
        accessGranted: true,
        accessGrantId: grantRef.id,
      });

      await AuditLogger.logSuccess(
        "admin.grant_support_access", context, `supportAccessGrants/${grantRef.id}`, "system",
        { ticketId, grantId: grantRef.id, expiresAt: expiresAt.toISOString(), duration: Date.now() - startTime }
      );

      functions.logger.info(`Support access granted: ${grantRef.id} for ticket ${ticketId}`);
      return { success: true, grantId: grantRef.id, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.grant_support_access", context, `supportTickets/${ticketId}`, "system",
        error as Error, { ticketId }
      );
      functions.logger.error(`Failed to grant support access for ticket ${ticketId}:`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to grant support access.", error);
    }
  }
);

export const revokeSupportAccess = functions.https.onCall(
  async (data: { grantId: string }, context: CallableContext) => {
    const startTime = Date.now();
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const { grantId } = data;
    if (!grantId || typeof grantId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Grant ID is required.");
    }

    const masterImei = context.auth.uid;

    try {
      const grantDoc = await db().collection("supportAccessGrants").doc(grantId).get();
      if (!grantDoc.exists || grantDoc.data()?.masterImei !== masterImei) {
        await AuditLogger.logDenied(
          "admin.revoke_support_access", context, `supportAccessGrants/${grantId}`, "system",
          "Grant not found or access denied", { grantId }
        );
        throw new functions.https.HttpsError("permission-denied", "Grant not found or access denied.");
      }

      await db().collection("supportAccessGrants").doc(grantId).update({ status: "revoked" });

      const ticketId = grantDoc.data()?.ticketId;
      if (ticketId) {
        await db().collection("supportTickets").doc(ticketId).update({ accessGranted: false });
      }

      await AuditLogger.logSuccess(
        "admin.revoke_support_access", context, `supportAccessGrants/${grantId}`, "system",
        { grantId, ticketId, duration: Date.now() - startTime }
      );

      functions.logger.info(`Support access revoked: ${grantId}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.revoke_support_access", context, `supportAccessGrants/${grantId}`, "system",
        error as Error, { grantId }
      );
      functions.logger.error(`Failed to revoke support access for grant ${grantId}:`, error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to revoke support access.", error);
    }
  }
);

export const cleanupExpiredGrants = functions.pubsub.schedule("every 1 hours").onRun(async (_context) => {
  const now = admin.firestore.Timestamp.now();

  try {
    const expiredGrantsSnapshot = await db().collection("supportAccessGrants")
      .where("status", "==", "active")
      .where("expiresAt", "<=", now)
      .get();

    if (expiredGrantsSnapshot.empty) {
      functions.logger.info("No expired grants to clean up.");
      return null;
    }

    const batch = db().batch();

    expiredGrantsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { status: "expired" });
      const ticketId = doc.data().ticketId;
      if (ticketId) {
        batch.update(db().collection("supportTickets").doc(ticketId), { accessGranted: false });
      }
    });

    await batch.commit();

    functions.logger.info(`Cleaned up ${expiredGrantsSnapshot.size} expired support grants.`);
    return null;
  } catch (error) {
    functions.logger.error("Failed to clean up expired grants:", error);
    return null;
  }
});

async function collectDebugSnapshot(masterImei: string): Promise<DebugSnapshot> {
  const childrenSnap = await db()
    .collection("children")
    .where("masterImei", "==", masterImei)
    .limit(1)
    .get();

  const childDoc = childrenSnap.docs[0];
  const childData = childDoc?.data() || {};

  let recentTamperEvents = 0;
  let recentUsageReports = 0;

  if (childDoc) {
    const [tamperSnap, usageSnap] = await Promise.all([
      childDoc.ref.collection("tamperEvents").limit(20).get(),
      childDoc.ref.collection("usageHistory").limit(14).get(),
    ]);
    recentTamperEvents = tamperSnap.size;
    recentUsageReports = usageSnap.size;
  }

  const appBlacklist = Array.isArray(childData.appBlacklist) ? childData.appBlacklist : [];
  const usageRules = Array.isArray(childData.usageRules) ? childData.usageRules : [];

  return sanitizeDebugSnapshot({
    appStatus: {
      isLocked: Boolean(childData.isLocked),
      appBlacklistCount: appBlacklist.length,
      usageRulesCount: usageRules.length,
    },
    activityData: {
      lastSeen: formatDate(childData.lastSeen),
      updatedAt: formatDate(childData.updatedAt),
    },
    networkDiagnostics: {
      fcmTokenPresent: typeof childData.fcmToken === "string" && childData.fcmToken.length > 0,
      networkType: childData.networkType,
    },
    deviceTelemetry: {
      batteryLevelPct: childData.batteryLevelPct,
      isCharging: Boolean(childData.isCharging),
      storageFreeBytes: childData.storageFreeBytes,
      osVersion: childData.osVersion,
      appVersion: childData.appVersion,
    },
    recentTamperEvents,
    recentUsageReports,
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * Defense-in-depth Whitelist-Filter: stellt sicher, dass nur die ausdrücklich
 * deklarierten Felder den Snapshot verlassen — auch wenn der DebugSnapshot-Typ
 * später erweitert wird oder Aufrufer versehentlich zusätzliche Felder anhängen.
 * Wird vor JSON.stringify (AI-Prompt) und vor Firestore-Persistierung angewandt.
 */
function sanitizeDebugSnapshot(input: Partial<DebugSnapshot>): DebugSnapshot {
  const appStatus = input.appStatus || {} as DebugSnapshot["appStatus"];
  const activityData = input.activityData || {} as DebugSnapshot["activityData"];
  const networkDiagnostics = input.networkDiagnostics || {} as DebugSnapshot["networkDiagnostics"];
  const deviceTelemetry = input.deviceTelemetry || {} as DebugSnapshot["deviceTelemetry"];

  const allowedNetworkTypes = new Set(["wifi", "cellular", "none", "unknown"]);
  const rawNetworkType = typeof networkDiagnostics.networkType === "string"
    ? networkDiagnostics.networkType.toLowerCase()
    : "unknown";
  const normalizedNetworkType = allowedNetworkTypes.has(rawNetworkType)
    ? rawNetworkType as DebugSnapshot["networkDiagnostics"]["networkType"]
    : "unknown";

  const clampPct = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return Math.max(0, Math.min(100, Math.round(v)));
  };
  const sanitizeBytes = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    return Math.floor(v);
  };
  const truncStr = (v: unknown, max: number): string | null => {
    if (typeof v !== "string" || v.length === 0) return null;
    return v.length > max ? v.slice(0, max) : v;
  };

  return {
    appStatus: {
      isLocked: Boolean(appStatus.isLocked),
      appBlacklistCount: Number.isFinite(appStatus.appBlacklistCount) ? Number(appStatus.appBlacklistCount) : 0,
      usageRulesCount: Number.isFinite(appStatus.usageRulesCount) ? Number(appStatus.usageRulesCount) : 0,
    },
    activityData: {
      lastSeen: typeof activityData.lastSeen === "string" ? activityData.lastSeen : null,
      updatedAt: typeof activityData.updatedAt === "string" ? activityData.updatedAt : null,
    },
    networkDiagnostics: {
      fcmTokenPresent: Boolean(networkDiagnostics.fcmTokenPresent),
      networkType: normalizedNetworkType,
    },
    deviceTelemetry: {
      batteryLevelPct: clampPct(deviceTelemetry.batteryLevelPct),
      isCharging: Boolean(deviceTelemetry.isCharging),
      storageFreeBytes: sanitizeBytes(deviceTelemetry.storageFreeBytes),
      osVersion: truncStr(deviceTelemetry.osVersion, 32),
      appVersion: truncStr(deviceTelemetry.appVersion, 32),
    },
    recentTamperEvents: Number.isFinite(input.recentTamperEvents) ? Number(input.recentTamperEvents) : 0,
    recentUsageReports: Number.isFinite(input.recentUsageReports) ? Number(input.recentUsageReports) : 0,
    fetchedAt: typeof input.fetchedAt === "string" ? input.fetchedAt : new Date().toISOString(),
  };
}

async function runAiAnalysisRound(params: {
  ticketId: string;
  ticketData: FirebaseFirestore.DocumentData;
  userMessage?: string;
  useDebugData: boolean;
}): Promise<{ status: TicketConversationStatus; response: string; confidence: number }> {
  const { ticketId, ticketData, userMessage, useDebugData } = params;
  const masterImei = String(ticketData.masterImei || "");
  const currentRound = Number(ticketData.conversationRound || 0);
  const currentFailures = Number(ticketData.aiAttemptFailures || 0);

  let debugSnapshot: DebugSnapshot | null = null;
  if (useDebugData && masterImei) {
    try {
      debugSnapshot = await collectDebugSnapshot(masterImei);
    } catch (error) {
      functions.logger.warn("collectDebugSnapshot failed, continuing without debug snapshot", {
        ticketId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const prompt = `Du bist technischer Support-Agent fuer MiniMaster.
Problem:
${String(ticketData.problemDescription || "")}

Neue Rueckmeldung vom Nutzer:
${String(userMessage || "(keine neue Rueckmeldung, bitte proaktive Analyse)")}

Diagnose-Daten (falls verfuegbar):
${debugSnapshot ? JSON.stringify(debugSnapshot) : "keine"}

Antworte NUR als JSON mit:
{
  "solution": "konkrete, verstaendliche Handlungsempfehlung in Deutsch",
  "confidence": 0.0,
  "needsMoreInfo": true,
  "nextQuestion": "gezielte Rueckfrage wenn needsMoreInfo=true"
}`;

  const generation = await generateAiCompletion(prompt);
  const parsed = parseAiTicketResponse(generation.rawResponse);

  let needsMoreInfo = true;
  let nextQuestion = "Kannst du den letzten Schritt bestaetigen und die genaue Fehlermeldung senden?";
  try {
    const raw = JSON.parse(generation.rawResponse) as {
      needsMoreInfo?: boolean;
      nextQuestion?: string;
    };
    if (typeof raw.needsMoreInfo === "boolean") {
      needsMoreInfo = raw.needsMoreInfo;
    }
    if (typeof raw.nextQuestion === "string" && raw.nextQuestion.trim().length > 0) {
      nextQuestion = raw.nextQuestion.trim();
    }
  } catch {
    // Keep default follow-up fields when AI output does not include optional keys.
  }

  const solved = parsed.confidence >= AI_SOLUTION_CONFIDENCE && !needsMoreInfo;
  const nextRound = currentRound + 1;
  const nextFailures = solved ? currentFailures : currentFailures + 1;
  const shouldEscalate = shouldEscalateAfterAttempts(solved, nextRound, nextFailures);

  let response = parsed.solution;
  let status: TicketConversationStatus = "waiting_user_response";

  if (solved) {
    status = "closed";
    response = `${parsed.solution}\n\n✅ Problem wurde voraussichtlich geloest.`;
  } else if (shouldEscalate) {
    status = "escalated";
    response = `${parsed.solution}\n\n⚠️ Alle KI-Loesungsversuche sind gescheitert. Das Ticket wird jetzt an den menschlichen Support eskaliert.`;
  } else {
    response = `${parsed.solution}\n\nRueckfrage: ${nextQuestion}`;
  }

  await db().collection("supportTickets").doc(ticketId).update({
    aiGeneratedSolution: response,
    aiConfidenceScore: parsed.confidence,
    aiSolutionStatus: solved ? "accepted" : "generated",
    aiProvider: generation.provider,
    aiModel: generation.provider === "gemini" ? GEMINI_MODEL : "test-stub",
    status: status === "closed" ? "closed_by_ai" : (status === "escalated" ? "escalated" : "awaiting_user_feedback"),
    conversationStatus: status,
    conversationRound: nextRound,
    aiAttemptFailures: nextFailures,
    debugDataSnapshot: debugSnapshot,
    debugDataFetchedAt: debugSnapshot ? admin.firestore.FieldValue.serverTimestamp() : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await appendConversationEntry(ticketId, {
    role: "assistant",
    content: response,
    confidence: parsed.confidence,
    metadata: {
      round: nextRound,
      solved,
      escalated: shouldEscalate,
      debugUsed: Boolean(debugSnapshot),
    },
  });

  if (shouldEscalate) {
    functions.logger.warn("Ticket escalated after repeated failed AI attempts", {
      ticketId,
      nextRound,
      nextFailures,
    });
  }

  return { status, response, confidence: parsed.confidence };
}

// ==================== AI SUPPORT ====================

export const onTicketCreated = functions.firestore
  .document("supportTickets/{ticketId}")
  .onCreate(async (snapshot, context) => {
    const ticketId = context.params.ticketId;
    const ticketData = snapshot.data();

    functions.logger.info(`New support ticket created: ${ticketId}`);

    try {
      const problemDescription = String(ticketData.problemDescription || "").trim();
      if (!problemDescription) {
        functions.logger.info("Empty problem description, skipping consent flow.");
        return;
      }

      const consentQuestion = buildInitialDebugConsentQuestion();
      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        conversationRound: 0,
        aiAttemptFailures: 0,
        conversationStatus: "awaiting_debug_consent",
        aiGeneratedSolution: consentQuestion,
        aiSolutionStatus: "pending",
        status: "awaiting_user_feedback",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await appendConversationEntry(ticketId, {
        role: "assistant",
        content: consentQuestion,
        metadata: { stage: "initial_debug_consent" },
      });

      functions.logger.info(`Ticket ${ticketId} moved to debug consent flow.`);

      const masterImei = ticketData.masterImei;
      const masterDoc = await admin.firestore().collection("masters").doc(masterImei).get();

      if (masterDoc.exists) {
        const masterData = masterDoc.data();
        const fcmToken = masterData?.fcmToken;

        if (fcmToken) {
          const notificationMessage = {
            notification: {
              title: "Support Ticket Update",
              body: "Bitte bestaetige, ob die KI den Debug-Modus fuer die automatische Analyse aktivieren darf.",
            },
            data: {
              ticketId: ticketId,
              type: "support_ticket_debug_consent",
            },
            token: fcmToken,
          };

          await getMessaging().send(notificationMessage);
          functions.logger.info(`Push notification sent to ${masterImei}`);
        }
      }

      const meta = extractTicketContactMeta(problemDescription);
      if (meta.replyToEmail && isValidEmailAddress(meta.replyToEmail)) {
        await sendSupportFollowUpEmail({
          ticketId,
          toEmail: meta.replyToEmail,
          senderName: meta.senderName,
          sourcePanel: meta.sourcePanel,
          message: `${consentQuestion}\n\nAntworte mit: JA DEBUG oder NEIN DEBUG.`,
        });
      }

      return;
    } catch (error) {
      functions.logger.error("Error in onTicketCreated:", error);

      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: "Beim Start des KI-Supportprozesses ist ein Fehler aufgetreten. Das Ticket wird an den Support eskaliert.",
        aiConfidenceScore: 0.0,
        aiSolutionStatus: "error",
        status: "escalated",
        conversationStatus: "escalated",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      throw error;
    }
  });

export const onSupportTicketUpdated = functions.firestore
  .document("supportTickets/{ticketId}")
  .onUpdate(async (change, context) => {
    const ticketId = context.params.ticketId;
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const adminResponseBefore = typeof before.adminResponse === "string" ? before.adminResponse.trim() : "";
    const adminResponseAfter = typeof after.adminResponse === "string" ? after.adminResponse.trim() : "";

    // Send follow-up only when a new/changed admin response is present.
    if (!adminResponseAfter || adminResponseAfter === adminResponseBefore) {
      return;
    }

    const meta = extractTicketContactMeta(after.problemDescription);
    const replyToEmail = meta.replyToEmail;

    if (!replyToEmail || !isValidEmailAddress(replyToEmail)) {
      functions.logger.warn("No valid ReplyTo email found for support ticket follow-up", {
        ticketId,
        replyToEmail: replyToEmail || null,
      });

      await change.after.ref.update({
        lastFollowUpEmailStatus: "skipped_invalid_reply_to",
        lastFollowUpEmailAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }

    const sendResult = await sendSupportFollowUpEmail({
      ticketId,
      toEmail: replyToEmail,
      senderName: meta.senderName,
      sourcePanel: meta.sourcePanel,
      message: adminResponseAfter,
    });

    await change.after.ref.update({
      lastFollowUpEmailStatus: sendResult.success ? "sent" : "failed",
      lastFollowUpEmailProvider: sendResult.provider,
      lastFollowUpEmailError: sendResult.error || null,
      lastFollowUpEmailAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info("Support follow-up email processing completed", {
      ticketId,
      status: sendResult.success ? "sent" : "failed",
      provider: sendResult.provider,
    });
  });

export const analyzeWithDebugData = functions.https.onCall(
  async (data: { ticketId: string; userMessage?: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const ticketId = String(data?.ticketId || "").trim();
    if (!ticketId) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const ticketRef = db().collection("supportTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticketData = ticketDoc.data() || {};
    checkRateLimit(context.auth.uid, "support.analyze_with_debug_data", 20, 60_000);
    const role = String(context.auth.token.role || "");
    const isSupport = role === "admin" || role === "support";
    if (!isSupport && ticketData.masterImei !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission for this ticket.");
    }

    const result = await runAiAnalysisRound({
      ticketId,
      ticketData,
      userMessage: data.userMessage,
      useDebugData: Boolean(ticketData.accessGranted && ticketData.debugAccessGrantId),
    });

    const meta = extractTicketContactMeta(String(ticketData.problemDescription || ""));
    if (meta.replyToEmail && isValidEmailAddress(meta.replyToEmail)) {
      await sendSupportFollowUpEmail({
        ticketId,
        toEmail: meta.replyToEmail,
        senderName: meta.senderName,
        sourcePanel: meta.sourcePanel,
        message: result.response,
      });
    }

    return {
      success: true,
      status: result.status,
      confidence: result.confidence,
    };
  }
);

export const grantDebugAccess = functions.https.onCall(
  async (data: { ticketId: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const ticketId = String(data?.ticketId || "").trim();
    if (!ticketId) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const masterImei = context.auth.uid;
    checkRateLimit(masterImei, "support.grant_debug_access", 10, 60_000);
    const ticketRef = db().collection("supportTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticketData = ticketDoc.data() || {};
    if (ticketData.masterImei !== masterImei) {
      throw new functions.https.HttpsError("permission-denied", "Ticket access denied.");
    }
    if (String(ticketData.conversationStatus || "") !== "awaiting_debug_consent") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Debug consent is not expected in the current ticket state."
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const grantRef = await db().collection("supportAccessGrants").add({
      masterImei,
      ticketId,
      grantedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      status: "active",
      consentMode: "debug_mode_activation",
      debugScope: ["diagnostic_logs", "app_status", "system_info", "activity_data", "network_diag"],
    });

    await ticketRef.update({
      accessGranted: true,
      accessGrantId: grantRef.id,
      debugAccessGrantId: grantRef.id,
      debugAccessGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      conversationStatus: "debug_active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await appendConversationEntry(ticketId, {
      role: "user",
      content: "Ja, Debug-Modus aktivieren.",
      metadata: { debugConsent: true },
    });

    const refreshedDoc = await ticketRef.get();
    const result = await runAiAnalysisRound({
      ticketId,
      ticketData: refreshedDoc.data() || {},
      userMessage: "Der Nutzer hat Debug-Modus erlaubt. Bitte automatisch analysieren.",
      useDebugData: true,
    });

    const meta = extractTicketContactMeta(String(refreshedDoc.data()?.problemDescription || ""));
    if (meta.replyToEmail && isValidEmailAddress(meta.replyToEmail)) {
      await sendSupportFollowUpEmail({
        ticketId,
        toEmail: meta.replyToEmail,
        senderName: meta.senderName,
        sourcePanel: meta.sourcePanel,
        message: result.response,
      });
    }

    return {
      success: true,
      grantId: grantRef.id,
      status: result.status,
    };
  }
);

export const skipDebugMode = functions.https.onCall(
  async (data: { ticketId: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const ticketId = String(data?.ticketId || "").trim();
    if (!ticketId) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const ticketRef = db().collection("supportTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticketData = ticketDoc.data() || {};
    checkRateLimit(context.auth.uid, "support.skip_debug_mode", 10, 60_000);
    if (ticketData.masterImei !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Ticket access denied.");
    }
    if (String(ticketData.conversationStatus || "") !== "awaiting_debug_consent") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Debug consent is not expected in the current ticket state."
      );
    }

    await appendConversationEntry(ticketId, {
      role: "user",
      content: "Nein, bitte ohne Debug-Modus weiterarbeiten.",
      metadata: { debugConsent: false },
    });

    await ticketRef.update({
      conversationStatus: "analyzing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const result = await runAiAnalysisRound({
      ticketId,
      ticketData,
      userMessage: "Der Nutzer moechte keine Debug-Daten teilen. Bitte trotzdem bestmoeglich helfen.",
      useDebugData: false,
    });

    const meta = extractTicketContactMeta(String(ticketData.problemDescription || ""));
    if (meta.replyToEmail && isValidEmailAddress(meta.replyToEmail)) {
      await sendSupportFollowUpEmail({
        ticketId,
        toEmail: meta.replyToEmail,
        senderName: meta.senderName,
        sourcePanel: meta.sourcePanel,
        message: result.response,
      });
    }

    return { success: true, status: result.status };
  }
);

export const processUserReplyMessage = functions.https.onCall(
  async (data: { ticketId: string; message: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const ticketId = String(data?.ticketId || "").trim();
    const message = String(data?.message || "").trim();
    if (!ticketId || !message) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID and message are required.");
    }

    const ticketRef = db().collection("supportTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticketData = ticketDoc.data() || {};
    checkRateLimit(context.auth.uid, "support.process_user_reply", 15, 60_000);
    if (ticketData.masterImei !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Ticket access denied.");
    }
    if (ticketData.status === "closed_by_ai" || ticketData.status === "escalated") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Ticket is already closed or escalated and cannot accept new AI replies."
      );
    }

    const currentRound = Number(ticketData.conversationRound || 0);
    if (currentRound >= MAX_CONVERSATION_ROUNDS) {
      throw new functions.https.HttpsError("failed-precondition", "Maximum AI rounds reached. Ticket is escalated.");
    }

    await appendConversationEntry(ticketId, {
      role: "user",
      content: message,
      metadata: { round: currentRound },
    });

    await ticketRef.update({
      lastUserMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      conversationStatus: "analyzing",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const refreshedDoc = await ticketRef.get();
    const refreshed = refreshedDoc.data() || {};
    const result = await runAiAnalysisRound({
      ticketId,
      ticketData: refreshed,
      userMessage: message,
      useDebugData: Boolean(refreshed.accessGranted && refreshed.debugAccessGrantId),
    });

    const meta = extractTicketContactMeta(String(refreshed.problemDescription || ""));
    if (meta.replyToEmail && isValidEmailAddress(meta.replyToEmail)) {
      await sendSupportFollowUpEmail({
        ticketId,
        toEmail: meta.replyToEmail,
        senderName: meta.senderName,
        sourcePanel: meta.sourcePanel,
        message: result.response,
      });
    }

    return {
      success: true,
      status: result.status,
      confidence: result.confidence,
    };
  }
);

export const getDebugInfo = functions.https.onCall(
  async (data: { ticketId: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const ticketId = String(data?.ticketId || "").trim();
    if (!ticketId) {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const ticketDoc = await db().collection("supportTickets").doc(ticketId).get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticketData = ticketDoc.data() || {};
    checkRateLimit(context.auth.uid, "support.get_debug_info", 30, 60_000);
    const role = String(context.auth.token.role || "");
    const isSupport = role === "admin" || role === "support";
    if (!isSupport && ticketData.masterImei !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Ticket access denied.");
    }

    if (!ticketData.debugAccessGrantId) {
      throw new functions.https.HttpsError("failed-precondition", "Debug mode is not activated for this ticket.");
    }

    const grantDoc = await db().collection("supportAccessGrants").doc(String(ticketData.debugAccessGrantId)).get();
    if (!grantDoc.exists || grantDoc.data()?.status !== "active") {
      throw new functions.https.HttpsError("permission-denied", "Debug access grant is not active.");
    }

    const grant = grantDoc.data() || {};
    if (String(grant.ticketId || "") !== ticketId || String(grant.masterImei || "") !== String(ticketData.masterImei || "")) {
      throw new functions.https.HttpsError("permission-denied", "Debug access grant does not belong to this ticket.");
    }

    const debugScope = Array.isArray(grant.debugScope) ? grant.debugScope : null;
    if (!debugScope?.includes("diagnostic_logs")) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Debug scope does not allow diagnostic data access."
      );
    }
    const expiresAt = grant.expiresAt as admin.firestore.Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() <= Date.now()) {
      await grantDoc.ref.update({ status: "expired" });
      throw new functions.https.HttpsError("deadline-exceeded", "Debug access grant expired.");
    }

    const snapshot = await collectDebugSnapshot(String(ticketData.masterImei || ""));
    return {
      ticketId,
      grantId: ticketData.debugAccessGrantId,
      snapshot,
    };
  }
);

export const provideSolutionFeedback = functions.https.onCall(
  async (data: { ticketId: string; feedback: string; comment?: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const { ticketId, feedback, comment } = data;
    if (!ticketId || !feedback) {
      throw new functions.https.HttpsError("invalid-argument", "Missing ticketId or feedback.");
    }

    if (feedback !== "accepted" && feedback !== "rejected") {
      throw new functions.https.HttpsError("invalid-argument", "Feedback must be \"accepted\" or \"rejected\".");
    }
    if (feedback === "rejected" && (!comment || typeof comment !== "string" || comment.trim().length === 0)) {
      throw new functions.https.HttpsError("invalid-argument", "Comment is required when feedback is rejected.");
    }

    try {
      const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Ticket not found.");
      }

      const ticketData = ticketDoc.data();
      if (ticketData?.masterImei !== context.auth.uid) {
        throw new functions.https.HttpsError("permission-denied", "You do not have permission to update this ticket.");
      }

      const newStatus = feedback === "accepted" ? "closed_by_ai" : "escalated";
      const aiSolutionStatus = feedback === "accepted" ? "accepted" : "rejected";

      await ticketRef.update({
        aiSolutionStatus: aiSolutionStatus,
        status: newStatus,
        userFeedbackComment: feedback === "rejected" ? comment?.trim() : null,
        userFeedbackAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Ticket ${ticketId} feedback: ${feedback}, new status: ${newStatus}`);
      return { success: true, message: `Ticket ${newStatus}.` };
    } catch (error) {
      functions.logger.error("Error in provideSolutionFeedback:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to update ticket feedback.");
    }
  }
);

/**
 * GDPR-compliant function for support agents to view user data through a ticket.
 * Requires an active, non-expired support access grant linked to the ticket.
 */
export const getTicketUserData = functions.https.onCall(
  async (data: { ticketId: string }, context: CallableContext) => {
    requireSupportOrAdmin(context);
    const callerId = context.auth!.uid;
    validateAppCheck(context, true);

    const { ticketId } = data;
    if (!ticketId || typeof ticketId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const ticketDoc = await db().collection("supportTickets").doc(ticketId).get();
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }

    const ticket = ticketDoc.data()!;
    const masterImei = ticket.masterImei;

    // Verify active support grant exists for this ticket
    if (!ticket.accessGrantId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No support access grant for this ticket. User must grant access first."
      );
    }

    const grantDoc = await db().collection("supportAccessGrants").doc(ticket.accessGrantId).get();
    if (!grantDoc.exists) {
      throw new functions.https.HttpsError("permission-denied", "Support access grant not found.");
    }

    const grant = grantDoc.data()!;
    if (grant.status !== "active") {
      throw new functions.https.HttpsError(
        "permission-denied",
        `Support access grant is ${grant.status}. User must re-grant access.`
      );
    }

    const now = admin.firestore.Timestamp.now();
    if (grant.expiresAt && grant.expiresAt.seconds < now.seconds) {
      await db().collection("supportAccessGrants").doc(ticket.accessGrantId).update({ status: "expired" });
      throw new functions.https.HttpsError("deadline-exceeded", "Support access grant has expired.");
    }

    // Grant is valid — fetch user data
    const masterDoc = await db().collection("masters").doc(masterImei).get();
    const masterData = masterDoc.exists ? masterDoc.data() : null;

    const childrenSnap = await db().collection("children").where("masterImei", "==", masterImei).get();
    const children = childrenSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    await AuditLogger.log(
      "admin.user_impersonation", callerId, resolveImpersonationRole(context),
      `masters/${masterImei}`, "user", "success",
      { ticketId, grantId: ticket.accessGrantId, childCount: children.length }
    );

    return {
      master: masterData ? { id: masterImei, ...masterData } : null,
      children,
      grantExpiresAt: grant.expiresAt?.toDate?.()?.toISOString() || null,
    };
  }
);

// ==================== AI EXPLAIN PROBLEM (OPERATOR ASSISTANT) ====================

/**
 * Callable function for the admin panel to get AI explanations for setup/config problems.
 * Requires authenticated admin/support user and explicit consent flag.
 *
 * Input: { problemContext: string, consentGiven: boolean }
 * Output: { explanation: string, suggestion: string, provider: string, model: string }
 */
export const aiExplainProblem = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(
  async (data: { problemContext: string; consentGiven: boolean }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }
    validateAppCheck(context, true);

    const role = context.auth.token.role as string | undefined;
    if (role !== "admin" && role !== "support") {
      throw new functions.https.HttpsError("permission-denied", "Only admin or support users can use the AI assistant.");
    }

    checkRateLimit(context.auth.uid, "support.ai_explain_problem", 20, 60 * 60 * 1000);

    const { problemContext, consentGiven } = data;

    if (!consentGiven) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Zustimmung zur KI-Nutzung ist erforderlich. Bitte bestätigen Sie vor der Anfrage."
      );
    }

    if (!problemContext || typeof problemContext !== "string" || problemContext.trim().length < 10) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Problembeschreibung muss mindestens 10 Zeichen lang sein."
      );
    }

    if (problemContext.length > 3000) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Problembeschreibung darf maximal 3000 Zeichen lang sein."
      );
    }

    const prompt = `Du bist ein technischer Setup-Assistent für die MiniMaster Parental-Control-Suite.
Der Betreiber hat ein Problem während der Einrichtung oder Inbetriebnahme und bittet um Hilfe.

KONTEXT:
${problemContext.trim()}

${knowledgeBase ? `WISSENSBASIS:\n${knowledgeBase.substring(0, 8000)}\n` : ""}
Antworte auf Deutsch, präzise und umsetzbar. Gib deine Antwort als JSON zurück:
{
  "explanation": "Erklärung des Problems in 2-3 Sätzen",
  "suggestion": "Konkrete Schritt-für-Schritt-Lösung"
}`;

    try {
      const aiResult = await generateAiCompletion(prompt);
      let parsed: { explanation: string; suggestion: string };
      try {
        parsed = JSON.parse(aiResult.rawResponse);
      } catch {
        parsed = {
          explanation: aiResult.rawResponse.substring(0, 500),
          suggestion: "Bitte prüfen Sie die Konfiguration manuell oder wenden Sie sich an den Support.",
        };
      }

      await AuditLogger.log(
        "ai.explain_problem", context.auth.uid, resolveExplainRole(role),
        "system", "ai_query", "success",
        { provider: aiResult.provider, contextLength: problemContext.length }
      );

      return {
        explanation: parsed.explanation || "Keine Erklärung verfügbar.",
        suggestion: parsed.suggestion || "Keine Lösung vorgeschlagen.",
        provider: aiResult.provider,
        model: aiResult.provider === "gemini" ? GEMINI_MODEL : "gpt-4o",
      };
    } catch (error) {
      functions.logger.error("Error in aiExplainProblem:", error);
      throw new functions.https.HttpsError(
        "internal",
        "KI-Analyse fehlgeschlagen. Bitte prüfen Sie die KI-Konfiguration (GEMINI_API_KEY)."
      );
    }
  }
);

export const __supportTestables = {
  parseAiTicketResponse,
  generateWithGemini,
  resolveImpersonationRole,
  resolveExplainRole,
  shouldEscalateAfterAttempts,
  buildInitialDebugConsentQuestion,
};
