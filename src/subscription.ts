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
import { validateSku, validateString } from "./validation";
import { withResilience } from "./resilience";
import { withErrorHandling } from "./error-handler";
import {
  B2C_TIERS, B2B_TIERS, VALID_PRODUCT_IDS,
  getChildLimit, getParentAppLimit, getSubscriptionDurationMs,
  isB2CSku, isB2BSku,
} from "./pricing-config";

// Re-export for backward compatibility
export { VALID_PRODUCT_IDS, getChildLimit, getParentAppLimit, getSubscriptionDurationMs };

/**
 * Verifies a Google Play subscription purchase and grants entitlement.
 */
export const verifyPurchase = functions.https.onCall(
  async (data: { purchaseToken: string; sku: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "verifyPurchase", 10);

    // Strict input validation
    const purchaseToken = validateString(data.purchaseToken, "purchaseToken", {
      required: true, maxLength: 2048, minLength: 10, sanitize: "none",
    });
    const sku = validateSku(data.sku);

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const isPurchaseValid = await withResilience(
        "play-store-verify",
        async () => verifyPlaySubscription("com.minimaster.masterapp", sku, purchaseToken),
        { timeoutMs: 15000, retry: { maxAttempts: 3, baseDelayMs: 1000 } }
      ).catch((e) => {
        functions.logger.error("Error verifying Google Play purchase:", e);
        return false;
      });

      if (isPurchaseValid) {
        const now = admin.firestore.Timestamp.now();
        const durationMs = getSubscriptionDurationMs(sku);
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMs);

        const tier = B2C_TIERS[sku] || B2B_TIERS[sku];

        await masterDeviceRef.update({
          subscription: {
            status: "active",
            type: sku,
            tierName: tier?.name || sku,
            isPremium: tier?.isPremium || false,
            parentAppLimit: getParentAppLimit(sku),
            childLimit: getChildLimit(sku),
            startedAt: now,
            expiresAt: expiresAt,
            purchaseToken: purchaseToken,
            purchaseVerifiedAt: now,
          },
        });

        // Track affiliate conversion if referred
        const masterData = (await masterDeviceRef.get()).data();
        if (masterData?.affiliateCode) {
          try {
            await db().collection("affiliate_conversions").add({
              affiliateId: masterData.affiliateId,
              affiliateCode: masterData.affiliateCode,
              masterId,
              sku,
              priceCents: tier?.priceCents || 0,
              commissionCents: Math.round((tier?.priceCents || 0) * 0.30),
              status: "pending",
              createdAt: now,
            });
            functions.logger.info(`Affiliate conversion tracked for ${masterId} via ${masterData.affiliateCode}`);
          } catch (affErr) {
            functions.logger.warn("Affiliate tracking failed (non-critical):", affErr);
          }
        }

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

/**
 * Default maximum number of subscriptions to re-verify per scheduled run.
 * Keeps Play Developer API quota usage bounded (default 200k req/day project-wide).
 */
const REVERIFY_DEFAULT_BATCH = 50;

/**
 * Google Play subscription resource (subset relevant for re-verification).
 * @see https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions
 */
type PlaySubscriptionResource = {
  expiryTimeMillis?: string | number;
  paymentState?: number;          // 0=Pending, 1=Received, 2=Free trial, 3=Pending deferred
  cancelReason?: number;          // 0=user, 1=system, 2=replaced, 3=developer
  autoRenewing?: boolean;
  userCancellationTimeMillis?: string | number;
};

/**
 * Computes a Firestore update from a Play Developer API subscription
 * response. Returns null when no observable change is needed.
 *
 * Mapping rules:
 *  - expiryTimeMillis < now            → status=expired, isPremium=false
 *  - cancelReason set AND expiry future → status=canceled (user keeps access until expiry)
 *  - paymentState=0 (pending)          → status=on_hold, isPremium=false
 *  - autoRenewing=false AND active     → keep active but flag autoRenewing=false
 *  - otherwise (paid + future expiry)  → status=active, expiresAt=<expiry>, isPremium=true
 */
export function computeReverifyUpdate(
  remote: PlaySubscriptionResource,
  nowMs: number
): Record<string, unknown> | null {
  const expiryMs = Number(remote.expiryTimeMillis ?? 0);
  if (!expiryMs || Number.isNaN(expiryMs)) return null;

  const update: Record<string, unknown> = {
    "subscription.lastReverifiedAt": admin.firestore.Timestamp.fromMillis(nowMs),
    "subscription.autoRenewing": remote.autoRenewing === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (expiryMs <= nowMs) {
    update["subscription.status"] = "expired";
    update["subscription.expiredAt"] = admin.firestore.Timestamp.fromMillis(nowMs);
    update["isPremium"] = false;
    return update;
  }

  update["subscription.expiresAt"] = admin.firestore.Timestamp.fromMillis(expiryMs);

  if (remote.paymentState === 0) {
    update["subscription.status"] = "on_hold";
    update["isPremium"] = false;
    return update;
  }

  if (typeof remote.cancelReason === "number") {
    update["subscription.status"] = "canceled";
    update["subscription.cancelReason"] = remote.cancelReason;
    if (remote.userCancellationTimeMillis) {
      update["subscription.canceledAt"] = admin.firestore.Timestamp.fromMillis(
        Number(remote.userCancellationTimeMillis)
      );
    }
    // User retains access until expiry — keep premium until expiry tick.
    update["isPremium"] = true;
    return update;
  }

  update["subscription.status"] = "active";
  update["isPremium"] = true;
  return update;
}

/**
 * Periodic Play API re-verification. Iterates active/grace masters with a
 * stored purchaseToken and reconciles their Firestore state against the
 * authoritative Play Developer API response (catches silent refunds,
 * payment failures, and cancellations missed by RTDN).
 *
 * Returns a summary so the scheduled wrapper and tests can assert on it.
 */
export async function reverifyActiveSubscriptionsRun(
  packageName: string,
  maxBatch: number = REVERIFY_DEFAULT_BATCH
): Promise<{ scanned: number; updated: number; skipped: number; errors: number }> {
  const nowMs = Date.now();
  const candidates = await db().collection("masters")
    .where("subscription.status", "in", ["active", "grace_period"])
    .limit(Math.max(1, maxBatch))
    .get();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  if (candidates.empty) return { scanned, updated, skipped, errors };

  const authClient = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth: authClient });

  for (const doc of candidates.docs) {
    const data = doc.data() || {};
    const sub = data.subscription || {};
    if (!sub.purchaseToken || !sub.type) {
      skipped++;
      continue;
    }
    scanned++;
    try {
      const res = await androidpublisher.purchases.subscriptions.get({
        packageName,
        subscriptionId: sub.type,
        token: sub.purchaseToken,
      });
      const remote = (res?.data || {}) as PlaySubscriptionResource;
      const update = computeReverifyUpdate(remote, nowMs);
      if (!update) {
        skipped++;
        continue;
      }
      await doc.ref.update(update);
      updated++;
      functions.logger.info("Reverified subscription", {
        masterId: doc.id,
        newStatus: update["subscription.status"],
      });
    } catch (err) {
      errors++;
      functions.logger.warn("Reverify failed for master", {
        masterId: doc.id,
        error: (err as Error)?.message,
      });
    }
  }

  return { scanned, updated, skipped, errors };
}

/**
 * Scheduled trigger: runs reverifyActiveSubscriptionsRun daily at 03:15
 * Europe/Berlin (after the midnight expiry sweep). Package name is
 * configurable via PLAY_PACKAGE_NAME (defaults to com.minimaster.masterapp).
 */
export const reverifyActiveSubscriptions = functions.pubsub
  .schedule("15 3 * * *")
  .timeZone("Europe/Berlin")
  .onRun(async () => {
    const packageName = process.env.PLAY_PACKAGE_NAME || "com.minimaster.masterapp";
    const batchSize = Number(process.env.REVERIFY_BATCH || REVERIFY_DEFAULT_BATCH);
    try {
      const summary = await reverifyActiveSubscriptionsRun(packageName, batchSize);
      functions.logger.info("Reverify run complete", summary);
    } catch (err) {
      functions.logger.error("Reverify run failed", err);
    }
    return null;
  });
