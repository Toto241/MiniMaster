/**
 * Firestore Triggers Cloud Functions.
 * Handles FCM sync on child device update, task photo AI analysis, and task status notifications.
 */
import * as functions from "firebase-functions/v1";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin";
import { db } from "../firebase";

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
    await getMessaging().send(message);
    functions.logger.info(`Successfully sent FCM message to child ${childId} for data update.`);
  } catch (error) {
    functions.logger.error(`Failed to send FCM message to child ${childId}:`, error);
  }
});

/**
 * AI image analysis trigger when a task is completed (mock implementation).
 */
export const analyzeTaskPhoto = onDocumentUpdated("children/{childId}/tasks/{taskId}", async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();

  if (!newData || !oldData) return;

  if (newData.status === "pending_approval" && oldData.status !== "pending_approval" && newData.photoUrl) {
    const taskId = event.params.taskId;
    const childId = event.params.childId;

    functions.logger.info(`Starting AI analysis for task ${taskId} (child: ${childId}) photo: ${newData.photoUrl}`);

    // MOCK AI ANALYSIS — In production: use Google Cloud Vision API
    const mockAnalysis = {
      labels: ["Room", "Furniture", "Clean"],
      safeSearch: {
        adult: "VERY_UNLIKELY",
        violence: "VERY_UNLIKELY",
      },
      analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      await event.data?.after.ref.update({
        aiAnalysis: mockAnalysis,
      });
      functions.logger.info(`AI analysis completed for task ${taskId}`);
    } catch (error) {
      functions.logger.error("Failed to update task with AI analysis:", error);
    }
  }
});

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
        await getMessaging().send(message);
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
        await getMessaging().send(reviewMessage);
        functions.logger.info(`Review notification sent to child ${childId} for task ${context.params.taskId}`);
      } catch (error) {
        functions.logger.error("Error sending review notification:", error);
      }
    }
  });
