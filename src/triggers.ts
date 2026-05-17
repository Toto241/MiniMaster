/**
 * Firestore Triggers Cloud Functions.
 * Handles FCM sync on child device update, task photo AI analysis, and task status notifications.
 */
import * as functions from "firebase-functions/v1";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging, Message } from "firebase-admin/messaging";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { writeCommand, incrementPolicyVersion } from "./device-sync";
import { withRetry } from "./resilience";
import { createTraceContext, TracedLogger } from "./tracing";


// Deterministic JSON serialization: object keys are sorted recursively so equal
// payloads with differing key order compare equal.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

/**
 * Sends an FCM message with centralized resilience retry (max 3 attempts).
 * Only retries on transient/server errors (5xx, UNAVAILABLE, INTERNAL).
 */
async function sendFcmWithRetry(message: Message, maxAttempts = 3): Promise<string> {
  return withRetry(
    async () => getMessaging().send(message),
    {
      maxAttempts,
      baseDelayMs: 1000,
      maxDelayMs: 4000,
      retryableErrors: ["unavailable", "internal", "deadline-exceeded", "messaging/server-unavailable"],
    }
  );
}

/**
 * Sends FCM diff-push when child device settings change (isLocked, appBlacklist, usageRules).
 */
export const onChildDeviceUpdateV2 = onDocumentUpdated("children/{childId}", async (event) => {
  const childId = event.params.childId;
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  const logger = new TracedLogger(createTraceContext("onChildDeviceUpdateV2"));

  if (!newData) {
    logger.info(`Child device ${childId} deleted, no action taken.`);
    return;
  }

  if (!oldData) {
    logger.info(`New child device ${childId} created, no action taken on update.`);
    return;
  }

  const fcmToken = newData.fcmToken;
  if (!fcmToken || typeof fcmToken !== "string") {
    logger.warn(`No valid FCM token for child ${childId}, cannot send notification.`);
    return;
  }

  const payload: { [key: string]: string } = {};

  const lockChanged = newData.isLocked !== oldData.isLocked;
  const newBlacklist: string[] = Array.isArray(newData.appBlacklist) ? [...newData.appBlacklist].sort() : [];
  const oldBlacklist: string[] = Array.isArray(oldData.appBlacklist) ? [...oldData.appBlacklist].sort() : [];
  const blacklistChanged = JSON.stringify(newBlacklist) !== JSON.stringify(oldBlacklist);
  const usageChanged = stableStringify(newData.usageRules) !== stableStringify(oldData.usageRules);

  if (lockChanged) {
    payload.isLocked = String(newData.isLocked);
  }
  if (blacklistChanged) {
    payload.appBlacklist = JSON.stringify(newData.appBlacklist);
  }
  if (usageChanged) {
    payload.usageRules = JSON.stringify(newData.usageRules);
  }

  if (Object.keys(payload).length === 0) {
    logger.info(`No relevant changes detected for child ${childId}.`);
    return;
  }

  // --- Control-Plane: versionierte Commands erzeugen (Android + iOS) ---
  // Jede Policy-Änderung wird als Command in Firestore gespeichert, damit Geräte
  // sie auch ohne Push via fetchPendingCommands / syncPolicySnapshot abholen können.
  let policyVersion = 0;
  try {
    policyVersion = await incrementPolicyVersion(childId);

    if (lockChanged) {
      await writeCommand(childId, "lock_state", { isLocked: newData.isLocked }, policyVersion);
    }
    if (blacklistChanged) {
      await writeCommand(childId, "app_blacklist", { appBlacklist: newData.appBlacklist || [] }, policyVersion);
    }
    if (usageChanged) {
      await writeCommand(childId, "usage_rules", { usageRules: newData.usageRules || {} }, policyVersion);
    }
    logger.info(`Commands written for child ${childId}, policyVersion=${policyVersion}`);
  } catch (cmdError) {
    // Command-Erzeugung schlägt den FCM-Push nicht fehl; nur loggen
    logger.error(`Failed to write commands for child ${childId}:`, cmdError);
  }

  // --- Legacy FCM-Diff-Push (Wake-up/Hint für verbundene Geräte) ---
  const message = {
    token: fcmToken,
    data: { ...payload, policyVersion: String(policyVersion) },
    notification: {
      title: "Device Settings Updated",
      body: "Your device settings have been updated by your parent.",
    },
  };

  try {
    await sendFcmWithRetry(message);
    logger.info(`Successfully sent FCM message to child ${childId} for data update.`);
  } catch (error) {
    logger.error(`Failed to send FCM message to child ${childId}:`, error);
  }
});

/**
 * AI image analysis trigger when a task is completed.
 * Uses Gemini Vision API when GEMINI_API_KEY is configured, falls back to mock.
 */
export const analyzeTaskPhoto = onDocumentUpdated(
  { document: "children/{childId}/tasks/{taskId}", secrets: ["GEMINI_API_KEY"] },
  async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  const logger = new TracedLogger(createTraceContext("analyzeTaskPhoto"));

  if (!newData || !oldData) return;

  if (newData.status === "pending_approval" && oldData.status !== "pending_approval" && newData.photoUrl) {
    const taskId = event.params.taskId;
    const childId = event.params.childId;

    logger.info(`Starting AI analysis for task ${taskId} (child: ${childId})`);

    // Validate photoUrl is a Firebase Storage URL to prevent SSRF/injection
    const validStorageUrl = /^https:\/\/firebasestorage\.googleapis\.com\//;
    if (!validStorageUrl.test(newData.photoUrl)) {
      logger.error(`Invalid photoUrl for task ${taskId}: not a Firebase Storage URL`);
      return;
    }

    let analysis: Record<string, unknown>;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        analysis = await analyzeWithGemini(geminiKey, newData.photoUrl, newData.description || "");
      } catch (error) {
        logger.warn(`Gemini analysis failed for task ${taskId}, using fallback:`, { error: String(error) });
        analysis = buildFallbackAnalysis();
      }
    } else {
      logger.info("GEMINI_API_KEY not set – using fallback analysis.");
      analysis = buildFallbackAnalysis();
    }

    try {
      await event.data?.after.ref.update({
        aiAnalysis: { ...analysis, analyzedAt: admin.firestore.FieldValue.serverTimestamp() },
      });
      logger.info(`AI analysis completed for task ${taskId}`);
    } catch (error) {
      logger.error("Failed to update task with AI analysis:", error);
    }
  }
});

function buildFallbackAnalysis(): Record<string, unknown> {
  return {
    labels: [],
    safeSearch: { adult: "UNKNOWN", violence: "UNKNOWN" },
    taskCompletion: "not_analyzed",
    source: "fallback",
    warning: "AI analysis unavailable; using template detection",
  };
}

async function analyzeWithGemini(
  apiKey: string, photoUrl: string, taskDescription: string
): Promise<Record<string, unknown>> {
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const prompt = `You are a parental control assistant. Analyze this photo submitted as proof for a child's task.
Task description: "${taskDescription}"

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "labels": ["string array of objects/concepts visible"],
  "safeSearch": { "adult": "VERY_UNLIKELY|UNLIKELY|POSSIBLE|LIKELY|VERY_LIKELY", "violence": "same scale" },
  "taskCompletion": "completed|unclear|not_completed",
  "confidence": 0.0-1.0,
  "summary": "one sentence"
}`;

  const imageResponse = await fetch(photoUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download photo for Gemini analysis: ${imageResponse.status}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();
  const imageBase64 = Buffer.from(imageBuffer).toString("base64");
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0]!.trim();

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const controller = new AbortController();
  const abortMs = process.env.GEMINI_TIMEOUT_MS ? parseInt(process.env.GEMINI_TIMEOUT_MS, 10) : 30_000;
  const timerId = setTimeout(() => controller.abort(), abortMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
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
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return { ...parsed, source: "gemini" };
  } catch {
    return { rawResponse: text, source: "gemini_unparsed", labels: [], safeSearch: { adult: "UNKNOWN", violence: "UNKNOWN" } };
  }
}

/**
 * Sends push notification to master when a task is submitted for review.
 * Also notifies the child device when a task was approved or rejected.
 */
export const onTaskStatusChange = functions.firestore
  .document("/children/{childId}/tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();
    const logger = new TracedLogger(createTraceContext("onTaskStatusChange"));

    if (!newValue || !previousValue) {
      logger.warn(`Task update ${context.params.taskId} has missing before/after data. Skipping notification.`);
      return;
    }

    if (newValue.status === "pending_approval" && previousValue.status !== "pending_approval") {
      const masterImei = newValue.masterImei;
      if (!masterImei) {
        logger.warn("No masterImei found for this task. Cannot send notification.");
        return;
      }

      const masterDoc = await db().collection("masters").doc(masterImei).get();
      const fcmToken = masterDoc.data()?.fcmToken;

      if (!fcmToken) {
        logger.warn(`Master ${masterImei} does not have an FCM token. Cannot send notification.`);
        return;
      }

      const message = {
        token: fcmToken,
        notification: {
          title: "Task Submitted for Review",
          body: `Your child has submitted the task "${newValue.description || ""}" for your review.`,
        },
        data: {
          taskId: context.params.taskId,
          childId: context.params.childId,
        },
      };

      try {
        await sendFcmWithRetry(message);
        logger.info(`Notification sent to master ${masterImei} for task ${context.params.taskId}`);
      } catch (error) {
        logger.error("Error sending notification:", error);
      }

      return;
    }

    // Notify child when parent has reviewed the task.
    if ((newValue.status === "approved" || newValue.status === "rejected") && newValue.status !== previousValue.status) {
      const childId = context.params.childId;
      const childDoc = await db().collection("children").doc(childId).get();
      const childFcmToken = childDoc.data()?.fcmToken;

      if (!childFcmToken) {
        logger.warn(`Child ${childId} does not have an FCM token. Cannot send review notification.`);
        return;
      }

      const reviewTitle = newValue.status === "approved" ? "Task Approved" : "Task Rejected";
      const reviewBody = newValue.status === "approved"
        ? `Great job! Your task "${newValue.description || ""}" was approved.`
        : `Your task "${newValue.description || ""}" was rejected. Please review and try again.`;

      const reviewMessage = {
        token: childFcmToken,
        notification: {
          title: reviewTitle,
          body: reviewBody,
        },
        data: {
          taskId: context.params.taskId,
          childId,
          status: newValue.status,
        },
      };

      try {
        await sendFcmWithRetry(reviewMessage);
        logger.info(`Review notification sent to child ${childId} for task ${context.params.taskId}`);
      } catch (error) {
        logger.error("Error sending review notification:", error);
      }
    }
  });
