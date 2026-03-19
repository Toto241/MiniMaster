/**
 * Firestore Triggers Cloud Functions.
 * Handles FCM sync on child device update, task photo AI analysis, and task status notifications.
 */
import * as functions from "firebase-functions/v1";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging, Message } from "firebase-admin/messaging";
import * as admin from "firebase-admin";
import { db } from "../firebase";

/**
 * Sends an FCM message with exponential backoff retry (max 3 attempts).
 * Only retries on transient/server errors (5xx, UNAVAILABLE, INTERNAL).
 */
async function sendFcmWithRetry(message: Message, maxAttempts = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getMessaging().send(message);
    } catch (error: unknown) {
      const code = (error as { code?: string }).code || "";
      const isTransient = code.includes("unavailable") || code.includes("internal") ||
        code.includes("deadline-exceeded") || code === "messaging/server-unavailable";
      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("FCM retry exhausted");
}

/**
 * Sends FCM diff-push when child device settings change (isLocked, appBlacklist, usageRules).
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
  if (!fcmToken || typeof fcmToken !== "string") {
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
    await sendFcmWithRetry(message);
    functions.logger.info(`Successfully sent FCM message to child ${childId} for data update.`);
  } catch (error) {
    functions.logger.error(`Failed to send FCM message to child ${childId}:`, error);
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

  if (!newData || !oldData) return;

  if (newData.status === "pending_approval" && oldData.status !== "pending_approval" && newData.photoUrl) {
    const taskId = event.params.taskId;
    const childId = event.params.childId;

    functions.logger.info(`Starting AI analysis for task ${taskId} (child: ${childId})`);

    // Validate photoUrl is a Firebase Storage URL to prevent SSRF/injection
    const validStorageUrl = /^https:\/\/firebasestorage\.googleapis\.com\//;
    if (!validStorageUrl.test(newData.photoUrl)) {
      functions.logger.error(`Invalid photoUrl for task ${taskId}: not a Firebase Storage URL`);
      return;
    }

    let analysis: Record<string, unknown>;

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        analysis = await analyzeWithGemini(geminiKey, newData.photoUrl, newData.description || "");
      } catch (error) {
        functions.logger.warn(`Gemini analysis failed for task ${taskId}, using fallback:`, error);
        analysis = buildFallbackAnalysis();
      }
    } else {
      functions.logger.info("GEMINI_API_KEY not set – using fallback analysis.");
      analysis = buildFallbackAnalysis();
    }

    try {
      await event.data?.after.ref.update({
        aiAnalysis: { ...analysis, analyzedAt: admin.firestore.FieldValue.serverTimestamp() },
      });
      functions.logger.info(`AI analysis completed for task ${taskId}`);
    } catch (error) {
      functions.logger.error("Failed to update task with AI analysis:", error);
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

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", fileUri: photoUrl } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), 30_000);

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

    if (!newValue || !previousValue) {
      functions.logger.warn(`Task update ${context.params.taskId} has missing before/after data. Skipping notification.`);
      return;
    }

    if (newValue.status === "pending_approval" && previousValue.status !== "pending_approval") {
      const masterImei = newValue.masterImei;
      if (!masterImei) {
        functions.logger.warn("No masterImei found for this task. Cannot send notification.");
        return;
      }

      const masterDoc = await db().collection("masters").doc(masterImei).get();
      const fcmToken = masterDoc.data()?.fcmToken;

      if (!fcmToken) {
        functions.logger.warn(`Master ${masterImei} does not have an FCM token. Cannot send notification.`);
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
        functions.logger.info(`Notification sent to master ${masterImei} for task ${context.params.taskId}`);
      } catch (error) {
        functions.logger.error("Error sending notification:", error);
      }

      return;
    }

    // Notify child when parent has reviewed the task.
    if ((newValue.status === "approved" || newValue.status === "rejected") && newValue.status !== previousValue.status) {
      const childId = context.params.childId;
      const childDoc = await db().collection("children").doc(childId).get();
      const childFcmToken = childDoc.data()?.fcmToken;

      if (!childFcmToken) {
        functions.logger.warn(`Child ${childId} does not have an FCM token. Cannot send review notification.`);
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
        functions.logger.info(`Review notification sent to child ${childId} for task ${context.params.taskId}`);
      } catch (error) {
        functions.logger.error("Error sending review notification:", error);
      }
    }
  });
