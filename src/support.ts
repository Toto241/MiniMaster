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
import { AuditLogger } from "./shared";

// ==================== AI CLIENT ====================

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

let knowledgeBase = "";
try {
  // knowledge_base.txt lives at project root (parent of src/)
  const knowledgeBasePath = path.join(__dirname, "..", "knowledge_base.txt");
  knowledgeBase = fs.readFileSync(knowledgeBasePath, "utf-8");
} catch (error) {
  functions.logger.error("Failed to load knowledge base:", error);
}

// ==================== SUPPORT TICKETS ====================

export const createSupportTicket = functions.https.onCall(
  async (data: { problemDescription: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { problemDescription } = data;
    if (!problemDescription || typeof problemDescription !== "string" || problemDescription.trim().length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Problem description is required.");
    }

    const masterImei = context.auth.uid;

    try {
      const ticketRef = await db().collection("supportTickets").add({
        masterImei: masterImei,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "open",
        problemDescription: problemDescription.trim(),
        accessGranted: false,
      });

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
    const ticketUpdates: { [ticketId: string]: boolean } = {};

    expiredGrantsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { status: "expired" });
      const ticketId = doc.data().ticketId;
      if (ticketId) {
        ticketUpdates[ticketId] = true;
      }
    });

    await batch.commit();

    for (const ticketId of Object.keys(ticketUpdates)) {
      await db().collection("supportTickets").doc(ticketId).update({ accessGranted: false });
    }

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

      functions.logger.info("Calling OpenAI API...");
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a technical support agent for the MiniMaster parental control application." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const aiResponse = response.choices[0]?.message?.content || "";
      functions.logger.info("AI Response:", aiResponse);

      let aiGeneratedSolution = "";
      let aiConfidenceScore = 0.0;
      let newStatus = "awaiting_user_feedback";

      try {
        const parsed = JSON.parse(aiResponse);
        aiGeneratedSolution = parsed.solution || "Unable to generate solution.";
        aiConfidenceScore = parsed.confidence || 0.0;

        if (aiConfidenceScore < 0.7) {
          newStatus = "escalated";
          aiGeneratedSolution += "\n\n⚠️ This ticket has been escalated to a human support agent for further assistance.";
        }
      } catch (parseError) {
        functions.logger.error("Failed to parse AI response as JSON:", parseError);
        aiGeneratedSolution = "AI generated an invalid response. Escalating to human support.";
        aiConfidenceScore = 0.0;
        newStatus = "escalated";
      }

      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: aiGeneratedSolution,
        aiConfidenceScore: aiConfidenceScore,
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

export const provideSolutionFeedback = functions.https.onCall(
  async (data: { ticketId: string; feedback: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { ticketId, feedback } = data;
    if (!ticketId || !feedback) {
      throw new functions.https.HttpsError("invalid-argument", "Missing ticketId or feedback.");
    }

    if (feedback !== "accepted" && feedback !== "rejected") {
      throw new functions.https.HttpsError("invalid-argument", "Feedback must be \"accepted\" or \"rejected\".");
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Ticket ${ticketId} feedback: ${feedback}, new status: ${newStatus}`);
      return { success: true, message: `Ticket ${newStatus}.` };
    } catch (error) {
      functions.logger.error("Error in provideSolutionFeedback:", error);
      throw new functions.https.HttpsError("internal", "Failed to update ticket feedback.");
    }
  }
);
