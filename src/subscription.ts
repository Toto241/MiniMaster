/**
 * Subscription Management Cloud Functions.
 * Handles purchase verification, subscription status, revocation, and expiry checks.
 * Aligned with current monetization: one subscription includes up to
 * 2 parent apps and up to 4 child apps.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import { db } from "../firebase";
import { requireAuth, requireAdmin, checkRateLimit, validateAppCheck, AuditLogger, hasActiveAccess } from "./shared";

const DEFAULT_PARENT_APP_LIMIT = 2;
const DEFAULT_CHILD_LIMIT = 4;

/** Valid subscription product IDs (current monetization model). */
const VALID_PRODUCT_IDS = [
  "single_child_monthly",
  "family_monthly",
  "single_child_yearly",
  "family_yearly",
];

/**
 * Returns the child limit for a given subscription product.
 */
function getChildLimit(sku: string): number {
  if (VALID_PRODUCT_IDS.includes(sku)) return DEFAULT_CHILD_LIMIT;
  return DEFAULT_CHILD_LIMIT;
}

/**
 * Returns the parent app limit for a given subscription product.
 */
function getParentAppLimit(sku: string): number {
  if (VALID_PRODUCT_IDS.includes(sku)) return DEFAULT_PARENT_APP_LIMIT;
  return DEFAULT_PARENT_APP_LIMIT;
}

/**
 * Returns subscription duration in milliseconds for a given product.
 */
function getSubscriptionDurationMs(sku: string): number {
  if (sku.includes("yearly")) return 365 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000; // monthly default
}

/**
 * Verifies a Google Play subscription purchase and grants entitlement.
 */
export const verifyPurchase = functions.https.onCall(
  async (data: { purchaseToken: string; sku: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "verifyPurchase", 10);
    const { purchaseToken, sku } = data;

    if (!purchaseToken || !sku) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    if (!VALID_PRODUCT_IDS.includes(sku)) {
      throw new functions.https.HttpsError("invalid-argument", `Unknown product ID: ${sku}`);
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const isPurchaseValid = await verifyPlaySubscription(
        "com.minimaster.masterapp", sku, purchaseToken
      ).catch((e) => {
        functions.logger.error("Error verifying Google Play purchase:", e);
        return false;
      });

      if (isPurchaseValid) {
        const now = admin.firestore.Timestamp.now();
        const durationMs = getSubscriptionDurationMs(sku);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMs);

        await masterDeviceRef.update({
          subscription: {
            status: "active",
            type: sku,
            parentAppLimit: getParentAppLimit(sku),
            childLimit: getChildLimit(sku),
            startedAt: now,
            expiresAt: expiresAt,
            purchaseToken: purchaseToken,
            purchaseVerifiedAt: now,
          },
        });

        await AuditLogger.logSuccess(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          {
            masterId,
            sku,
            parentAppLimit: getParentAppLimit(sku),
            childLimit: getChildLimit(sku),
            duration: Date.now() - startTime,
          }
        );

        functions.logger.info(`Subscription ${sku} activated for master ${masterId}.`);
        return { success: true, subscriptionStatus: "active" };
      } else {
        await AuditLogger.logFailure(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          new Error("Purchase verification failed"), { masterId, sku }
        );

        functions.logger.warn(`Invalid purchase token received for master ${masterId}.`);
        throw new functions.https.HttpsError("permission-denied", "Purchase verification failed.");
      }
    } catch (error) {
      if (!(error instanceof functions.https.HttpsError)) {
        await AuditLogger.logFailure(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          error as Error, { masterId, sku }
        );
      }
      throw error;
    }
  }
);

/**
 * Gets the current subscription status for an authenticated master device.
 */
export const getSubscriptionStatus = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const masterData = masterDoc.data();
    const subscription = masterData?.subscription || { status: "none" };
    const result: Record<string, any> = { subscriptionStatus: subscription };

    if (subscription.status === "trial" && subscription.trialEndsAt) {
      const trialEnd = subscription.trialEndsAt instanceof admin.firestore.Timestamp
        ? subscription.trialEndsAt.toMillis()
        : subscription.trialEndsAt;
      const remainingMs = trialEnd - Date.now();
      result.trialDaysRemaining = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
      result.isTrialActive = remainingMs > 0;
    }

    result.hasAccess = hasActiveAccess(masterData);
    result.parentAppLimit = subscription.parentAppLimit || DEFAULT_PARENT_APP_LIMIT;
    result.childLimit = subscription.childLimit || DEFAULT_CHILD_LIMIT;
    return result;
  }
);

/**
 * Revokes a subscription (admin-only).
 */
export const revokeSubscription = functions.https.onCall(
  async (data: { subscriptionId?: string; masterId?: string }, context: CallableContext) => {
    const startTime = Date.now();

    try {
      requireAdmin(context);
      validateAppCheck(context, true);
      const adminUid = context.auth?.uid;

      let subscriptionId = data.subscriptionId;
      const targetMasterId = data.masterId;

      if (!subscriptionId && !targetMasterId) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with subscriptionId or masterId.");
      }

      if (!subscriptionId && targetMasterId) {
        const candidate = await db().collection("subscriptions")
          .where("masterId", "==", targetMasterId)
          .limit(1)
          .get();
        if (!candidate.empty) {
          subscriptionId = candidate.docs[0].id;
        }
      }

      let masterId = targetMasterId;

      if (subscriptionId) {
        const subDoc = await db().collection("subscriptions").doc(subscriptionId).get();
        if (!subDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Subscription not found.");
        }
        masterId = masterId || subDoc.data()?.masterId;

        await db().collection("subscriptions").doc(subscriptionId).update({
          status: "revoked",
          revokedAt: admin.firestore.FieldValue.serverTimestamp(),
          revokedBy: adminUid ?? "unknown-admin",
        });
      }

      if (!masterId) {
        throw new functions.https.HttpsError("not-found", "Master account not found for subscription revocation.");
      }

      await db().collection("masters").doc(masterId).update({
        isPremium: false,
        "subscription.status": "revoked",
        "subscription.revokedAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "admin.revoke_subscription", context, subscriptionId ? `subscriptions/${subscriptionId}` : `masters/${masterId}`, "subscription",
        { subscriptionId, masterId, duration: Date.now() - startTime }
      );

      return { message: subscriptionId ? `Subscription ${subscriptionId} successfully revoked.` : `Subscription status for master ${masterId} successfully revoked.` };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.revoke_subscription", context, `subscriptions/${data.subscriptionId || "unknown"}`, "subscription",
        error as Error, { subscriptionId: data.subscriptionId, masterId: data.masterId }
      );
      console.error("Error revoking subscription:", error);
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to revoke subscription.");
    }
  }
);

/**
 * Scheduled: checks for expired subscriptions/trials daily at midnight.
 */
export const checkExpiredSubscriptions = functions.pubsub
  .schedule("0 0 * * *")
  .timeZone("Europe/Berlin")
  .onRun(async (_context) => {
    const now = admin.firestore.Timestamp.now();

    try {
      const expiredSubSnapshot = await db().collection("masters")
        .where("subscription.status", "==", "active")
        .where("subscription.expiresAt", "<=", now)
        .get();

      const batch = db().batch();
      let subCount = 0;

      expiredSubSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          "subscription.status": "expired",
          "subscription.expiredAt": now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        subCount++;
      });

      const expiredTrialSnapshot = await db().collection("masters")
        .where("subscription.status", "==", "trial")
        .where("subscription.trialEndsAt", "<=", now)
        .get();

      let trialCount = 0;

      expiredTrialSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          "subscription.status": "trial_expired",
          "subscription.trialExpiredAt": now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        trialCount++;
      });

      if (subCount > 0 || trialCount > 0) {
        await batch.commit();
      }

      functions.logger.info(
        `Subscription Check: ${subCount} subscription(s) and ${trialCount} trial(s) marked as expired.`
      );
      return null;
    } catch (error) {
      functions.logger.error("Failed to check expired subscriptions:", error);
      return null;
    }
  });

/**
 * Verifies a subscription with the Google Play Developer API.
 */
async function verifyPlaySubscription(
  packageName: string, productId: string, purchaseToken: string
): Promise<boolean> {
  const authClient = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth: authClient });
  const res = await androidpublisher.purchases.subscriptions.get({
    packageName,
    subscriptionId: productId,
    token: purchaseToken,
  });
  const body = res.data;
  return body && (body as any).purchaseState === 0 && (body as any).expiryTimeMillis > Date.now();
}

/**
 * Google Play Real-Time Developer Notification (RTDN) notification types.
 * See: https://developer.android.com/google/play/billing/rtdn-reference#sub
 */
export const RTDN_NOTIFICATION_TYPES = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
} as const;

type RtdnPayload = {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string | number;
  subscriptionNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  testNotification?: {
    version?: string;
  };
};

/**
 * Decodes a Pub/Sub message payload from Google Play RTDN.
 * The message.data is base64-encoded JSON per RTDN contract.
 */
export function decodeRtdnPayload(data: string | undefined | null): RtdnPayload | null {
  if (!data) return null;
  try {
    const raw = Buffer.from(data, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as RtdnPayload : null;
  } catch (err) {
    functions.logger.warn("Failed to decode RTDN payload", err);
    return null;
  }
}

/**
 * Applies an RTDN notification to the matching master's subscription state.
 * Returns a summary { handled, reason } — does not throw on business-level
 * conditions (missing master, unknown type) so that Pub/Sub does not retry
 * indefinitely; logs a warning instead.
 */
export async function applyRtdnNotification(
  payload: RtdnPayload
): Promise<{ handled: boolean; reason: string; masterId?: string; notificationType?: number }> {
  if (payload.testNotification) {
    functions.logger.info("RTDN test notification received", { version: payload.testNotification.version });
    return { handled: true, reason: "test_notification" };
  }
  const sub = payload.subscriptionNotification;
  if (!sub || !sub.purchaseToken || typeof sub.notificationType !== "number") {
    return { handled: false, reason: "missing_subscription_notification" };
  }

  const snapshot = await db().collection("masters")
    .where("subscription.purchaseToken", "==", sub.purchaseToken)
    .limit(1)
    .get();

  if (snapshot.empty) {
    functions.logger.warn("RTDN received but no matching master found", {
      purchaseToken: sub.purchaseToken.slice(0, 6) + "…",
      notificationType: sub.notificationType,
    });
    return { handled: false, reason: "master_not_found", notificationType: sub.notificationType };
  }

  const doc = snapshot.docs[0];
  const masterId = doc.id;
  const now = admin.firestore.Timestamp.now();

  const update: Record<string, unknown> = {
    "subscription.lastNotificationType": sub.notificationType,
    "subscription.lastNotificationAt": now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  switch (sub.notificationType) {
    case RTDN_NOTIFICATION_TYPES.PURCHASED:
    case RTDN_NOTIFICATION_TYPES.RENEWED:
    case RTDN_NOTIFICATION_TYPES.RECOVERED:
    case RTDN_NOTIFICATION_TYPES.RESTARTED: {
      const durationMs = getSubscriptionDurationMs(sub.subscriptionId);
      update["subscription.status"] = "active";
      update["subscription.expiresAt"] = admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMs);
      update["isPremium"] = true;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.IN_GRACE_PERIOD: {
      update["subscription.status"] = "grace_period";
      break;
    }
    case RTDN_NOTIFICATION_TYPES.ON_HOLD: {
      update["subscription.status"] = "on_hold";
      update["isPremium"] = false;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.PAUSED: {
      update["subscription.status"] = "paused";
      update["isPremium"] = false;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.CANCELED: {
      update["subscription.status"] = "canceled";
      update["subscription.canceledAt"] = now;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.REVOKED: {
      update["subscription.status"] = "revoked";
      update["subscription.revokedAt"] = now;
      update["isPremium"] = false;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.EXPIRED: {
      update["subscription.status"] = "expired";
      update["subscription.expiredAt"] = now;
      update["isPremium"] = false;
      break;
    }
    case RTDN_NOTIFICATION_TYPES.PRICE_CHANGE_CONFIRMED:
    case RTDN_NOTIFICATION_TYPES.DEFERRED:
    case RTDN_NOTIFICATION_TYPES.PAUSE_SCHEDULE_CHANGED: {
      // Informational only – no status change.
      break;
    }
    default: {
      functions.logger.warn("RTDN unknown notificationType", { notificationType: sub.notificationType });
      return { handled: false, reason: "unknown_notification_type", masterId, notificationType: sub.notificationType };
    }
  }

  await doc.ref.update(update);

  functions.logger.info("RTDN processed", {
    masterId,
    notificationType: sub.notificationType,
    subscriptionId: sub.subscriptionId,
  });

  return { handled: true, reason: "applied", masterId, notificationType: sub.notificationType };
}

/**
 * Pub/Sub trigger for Google Play Real-Time Developer Notifications (RTDN).
 * Subscribe this topic in Google Play Console → Monetization setup.
 * Topic name is configurable via PLAY_BILLING_PUBSUB_TOPIC (defaults to
 * "play-billing-notifications").
 */
export const onPlayBillingNotification = functions.pubsub
  .topic(process.env.PLAY_BILLING_PUBSUB_TOPIC || "play-billing-notifications")
  .onPublish(async (message) => {
    const payload = decodeRtdnPayload((message as any)?.data);
    if (!payload) {
      functions.logger.warn("RTDN: empty or undecodable payload");
      return null;
    }
    try {
      await applyRtdnNotification(payload);
    } catch (err) {
      functions.logger.error("RTDN processing failed", err);
      // Swallow the error so Pub/Sub does not retry indefinitely on
      // permanent business-logic failures. Transient infra errors are
      // already retried by Firestore SDK internals.
    }
    return null;
  });
