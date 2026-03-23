/**
 * Support & AI Cloud Functions.
 * Handles support tickets, access grants, and AI-powered automated resolution.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { getMessaging } from "firebase-admin/messaging";
import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";
import { db } from "../firebase";
import { AuditLogger, requireSupportOrAdmin } from "./shared";

// ==================== AI CLIENT ====================

type AiTicketResponse = {
  solution: string;
  confidence: number;
};

type AiGenerationResult = {
  provider: "gemini" | "openai" | "test-stub";
  rawResponse: string;
};

type TicketContactMeta = {
  replyToEmail?: string;
  senderName?: string;
  sourcePanel?: string;
};

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const OPENAI_FALLBACK_ENABLED = process.env.OPENAI_FALLBACK_ENABLED === "true";

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

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

async function generateWithOpenAI(prompt: string): Promise<AiGenerationResult> {
  const response = await getOpenAIClient().chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a technical support agent for the MiniMaster parental control application." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  return {
    provider: "openai",
    rawResponse: response.choices[0]?.message?.content || "",
  };
}

async function generateAiCompletion(prompt: string): Promise<AiGenerationResult> {
  // Keep tests deterministic and isolated from external model providers.
  if (process.env.NODE_ENV === "test") {
    return {
      provider: "test-stub",
      rawResponse: JSON.stringify({
        solution: "Test solution generated in stub mode.",
        confidence: 0.85,
      }),
    };
  }

  if (process.env.GEMINI_API_KEY) {
    functions.logger.info(`Calling Gemini API with model ${GEMINI_MODEL}...`);
    return generateWithGemini(prompt);
  }

  if (process.env.OPENAI_API_KEY) {
    if (!OPENAI_FALLBACK_ENABLED) {
      throw new Error("OPENAI_API_KEY is set but OpenAI fallback is disabled. Set OPENAI_FALLBACK_ENABLED=true to allow fallback.");
    }
    functions.logger.warn("GEMINI_API_KEY missing. Falling back to OpenAI.");
    return generateWithOpenAI(prompt);
  }

  throw new Error("No AI provider configured. Set GEMINI_API_KEY (preferred) or OPENAI_API_KEY.");
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

// ==================== AI SUPPORT ====================

export const onTicketCreated = functions.firestore
  .document("supportTickets/{ticketId}")
  .onCreate(async (snapshot, context) => {
    const ticketId = context.params.ticketId;
    const ticketData = snapshot.data();

    functions.logger.info(`New support ticket created: ${ticketId}`);

    try {
      const problemDescription = ticketData.problemDescription || "";
      if (!problemDescription || problemDescription.trim().length === 0) {
        functions.logger.info("Empty problem description, skipping AI analysis.");
        return;
      }

      const prompt = `You are a helpful support agent for the MiniMaster application, a parental control app that allows parents to manage their children's device usage through task-based unlocking.

A user has submitted the following support request:

"${problemDescription}"

Based on the following knowledge base, provide a clear, step-by-step solution to the user's problem. If you are not confident in your answer (confidence < 0.7), state that you are escalating the ticket to a human agent.

Knowledge Base:
${knowledgeBase}

Your response MUST be in JSON format with exactly two fields:
{
  "solution": "Your step-by-step solution here",
  "confidence": 0.85
}

The confidence should be a float between 0 and 1, where 1 means you are absolutely certain the solution is correct.`;

      const generation = await generateAiCompletion(prompt);
      const aiResponse = generation.rawResponse;
      functions.logger.info("AI Response:", aiResponse);

      let aiGeneratedSolution = "";
      let aiConfidenceScore = 0.0;
      let newStatus = "awaiting_user_feedback";

      const parsed = parseAiTicketResponse(aiResponse);
      aiGeneratedSolution = parsed.solution;
      aiConfidenceScore = parsed.confidence;

      if (aiConfidenceScore < 0.7) {
        newStatus = "escalated";
        aiGeneratedSolution += "\n\n⚠️ This ticket has been escalated to a human support agent for further assistance.";
      }

      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: aiGeneratedSolution,
        aiConfidenceScore: aiConfidenceScore,
        aiProvider: generation.provider,
        aiModel: generation.provider === "gemini" ? GEMINI_MODEL : (generation.provider === "openai" ? "gpt-4o" : "test-stub"),
        aiSolutionStatus: "generated",
        status: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Ticket ${ticketId} updated with AI solution (confidence: ${aiConfidenceScore})`);

      const masterImei = ticketData.masterImei;
      const masterDoc = await admin.firestore().collection("masters").doc(masterImei).get();

      if (masterDoc.exists) {
        const masterData = masterDoc.data();
        const fcmToken = masterData?.fcmToken;

        if (fcmToken) {
          const notificationMessage = {
            notification: {
              title: "Support Ticket Update",
              body: newStatus === "escalated"
                ? "Your ticket has been escalated to a human agent."
                : "We have a proposed solution for your support ticket!",
            },
            data: {
              ticketId: ticketId,
              type: "support_ticket_update",
            },
            token: fcmToken,
          };

          await getMessaging().send(notificationMessage);
          functions.logger.info(`Push notification sent to ${masterImei}`);
        }
      }

      return;
    } catch (error) {
      functions.logger.error("Error in onTicketCreated:", error);

      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: "An error occurred while analyzing your ticket. A human support agent will assist you shortly.",
        aiConfidenceScore: 0.0,
        aiSolutionStatus: "error",
        status: "escalated",
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

export const provideSolutionFeedback = functions.https.onCall(
  async (data: { ticketId: string; feedback: string; comment?: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

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

    const role = context.auth.token.role as string | undefined;
    if (role !== "admin" && role !== "support") {
      throw new functions.https.HttpsError("permission-denied", "Only admin or support users can use the AI assistant.");
    }

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
        "KI-Analyse fehlgeschlagen. Bitte prüfen Sie die KI-Konfiguration (GEMINI_API_KEY / OPENAI_API_KEY)."
      );
    }
  }
);

export const __supportTestables = {
  parseAiTicketResponse,
  generateWithGemini,
  generateWithOpenAI,
  resolveImpersonationRole,
  resolveExplainRole,
};
