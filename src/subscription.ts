/**
 * Subscription Management Cloud Functions.
 * Handles purchase verification, subscription status, revocation, and expiry checks.
 * Aligned with current monetization: one subscription includes up to
 * 2 parent apps and up to 4 child apps.
 *
 * Platform coverage:
 *  - Google Play  → verifyPlaySubscription + RTDN Pub/Sub
 *  - Apple App Store → verifyAppleTransaction + StoreKit 2 server-side verification
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { createTraceContext, TracedLogger } from "./tracing";
import * as admin from "firebase-admin";
import { google } from "googleapis";
import * as crypto from "crypto";
import { db } from "../firebase";
import { requireAuth, requireAdmin, checkRateLimit, validateAppCheck, AuditLogger, hasActiveAccess, getTracedLogger } from "./shared";
import { validateSku, validateString } from "./validation";
import { withResilience, fetchWithTimeout } from "./resilience";
import {
  B2C_TIERS, B2B_TIERS, VALID_PRODUCT_IDS,
  getChildLimit, getParentAppLimit, getSubscriptionDurationMs,
} from "./pricing-config";

const DEFAULT_PARENT_APP_LIMIT = 2;
const DEFAULT_CHILD_LIMIT = 4;

// Re-export for backward compatibility
export { VALID_PRODUCT_IDS, getChildLimit, getParentAppLimit, getSubscriptionDurationMs };

/**
 * Verifies a subscription purchase (Google Play or Apple App Store) and grants entitlement.
 *
 * Client payload:
 *   { purchaseToken: string; sku: string; platform?: "android" | "ios" }
 *
 * For Apple the `purchaseToken` is the original transaction ID (StoreKit 2
 * `transaction.originalID`). The backend calls Apple's App Store Server API v2
 * to validate the transaction and read `expiresDate`.
 */
export const verifyPurchase = functions.https.onCall(
  async (data: { purchaseToken: string; sku: string; platform?: "android" | "ios" }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "verifyPurchase");
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    checkRateLimit(masterId, "verifyPurchase", 10);

    // Strict input validation
    const purchaseToken = validateString(data.purchaseToken, "purchaseToken", {
      required: true, maxLength: 2048, minLength: 10, sanitize: "none",
    });
    const sku = validateSku(data.sku);
    const platform = (data.platform ?? "android");

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      let isPurchaseValid = false;
      let appleExpiresAtMs: number | undefined;

      if (platform === "ios") {
        const appleResult = await withResilience(
          "apple-store-verify",
          async () => verifyAppleTransaction(purchaseToken),
          { timeoutMs: 15000, retry: { maxAttempts: 3, baseDelayMs: 1000 } }
        ).catch((e) => {
          logger.error("Error verifying Apple purchase:", e);
          return null;
        });
        isPurchaseValid = appleResult?.valid ?? false;
        appleExpiresAtMs = appleResult?.expiresDateMs;
      } else {
        isPurchaseValid = await withResilience(
          "play-store-verify",
          async () => verifyPlaySubscription("com.minimaster.masterapp", sku, purchaseToken),
          { timeoutMs: 15000, retry: { maxAttempts: 3, baseDelayMs: 1000 } }
        ).catch((e) => {
          logger.error("Error verifying Google Play purchase:", e);
          return false;
        }) ?? false;
      }

      if (isPurchaseValid) {
        const now = admin.firestore.Timestamp.now();
        const durationMs = getSubscriptionDurationMs(sku);
        const expiresAt = appleExpiresAtMs
          ? admin.firestore.Timestamp.fromMillis(appleExpiresAtMs)
          : admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMs);

        const tier = B2C_TIERS[sku] || B2B_TIERS[sku];

        await masterDeviceRef.update({
          subscription: {
            status: "active",
            type: sku,
            tierName: tier?.name || sku,
            isPremium: (tier as any)?.isPremium || false,
            parentAppLimit: getParentAppLimit(sku),
            childLimit: getChildLimit(sku),
            startedAt: now,
            expiresAt: expiresAt,
            purchaseToken: purchaseToken,
            purchaseVerifiedAt: now,
            platform: platform,
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
            logger.info(`Affiliate conversion tracked for ${masterId} via ${masterData.affiliateCode}`);
          } catch (affErr) {
            logger.warn("Affiliate tracking failed (non-critical):", { error: String(affErr) });
          }
        }

        await AuditLogger.logSuccess(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          {
            masterId,
            sku,
            platform,
            parentAppLimit: getParentAppLimit(sku),
            childLimit: getChildLimit(sku),
            duration: Date.now() - startTime,
            traceId,
          }
        );

        logger.info(`Subscription ${sku} activated for master ${masterId} (platform=${platform}).`);
        return { success: true, subscriptionStatus: "active" };
      } else {
        await AuditLogger.logFailure(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          new Error("Purchase verification failed"), { masterId, sku, platform, traceId }
        );

        logger.warn(`Invalid purchase token received for master ${masterId} (platform=${platform}).`);
        throw new functions.https.HttpsError("permission-denied", "Purchase verification failed.");
      }
    } catch (error) {
      if (!(error instanceof functions.https.HttpsError)) {
        await AuditLogger.logFailure(
          "subscription.verify_purchase", context, `masters/${masterId}`, "subscription",
          error as Error, { masterId, sku, platform, traceId }
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
    const { logger, traceId } = getTracedLogger(context, "getSubscriptionStatus");
    void logger; void traceId;
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
    result.platform = subscription.platform || "unknown";
    result.originalTransactionId = subscription.originalTransactionId || null;
    result.expiresDateMs = subscription.expiresDateMs || null;
    return result;
  }
);

/**
 * Revokes a subscription (admin-only).
 */
export const revokeSubscription = functions.https.onCall(
  async (data: { subscriptionId?: string; masterId?: string }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "revokeSubscription");
    void logger;
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
          subscriptionId = candidate.docs[0]!.id;
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
        { subscriptionId, masterId, duration: Date.now() - startTime, traceId }
      );

      return { message: subscriptionId ? `Subscription ${subscriptionId} successfully revoked.` : `Subscription status for master ${masterId} successfully revoked.` };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.revoke_subscription", context, `subscriptions/${data.subscriptionId || "unknown"}`, "subscription",
        error as Error, { subscriptionId: data.subscriptionId, masterId: data.masterId, traceId }
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
    const logger = new TracedLogger(createTraceContext("checkExpiredSubscriptions"));
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

      logger.info(
        `Subscription Check: ${subCount} subscription(s) and ${trialCount} trial(s) marked as expired.`
      );
      return null;
    } catch (error) {
      logger.error("Failed to check expired subscriptions:", error);
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
 * Apple App Store Server API configuration (from environment).
 */
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.minimaster.masterapp";
const APPLE_ISSUER_ID = process.env.APPLE_ISSUER_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY || "";
const APPLE_ENVIRONMENT = process.env.APPLE_ENVIRONMENT || "production"; // "production" | "sandbox"

const APPLE_API_BASE = APPLE_ENVIRONMENT === "sandbox"
  ? "https://api.storekit-sandbox.itunes.apple.com"
  : "https://api.storekit.itunes.apple.com";

/**
 * Signs a JWT for Apple App Store Server API v2.
 * Uses ES256 (ECDSA using P-256 and SHA-256).
 */
function signAppleJWT(): string {
  if (!APPLE_ISSUER_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    throw new functions.https.HttpsError("failed-precondition", "Apple App Store Server API credentials are not configured.");
  }

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: APPLE_KEY_ID, typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: APPLE_ISSUER_ID,
    iat: now,
    exp: now + 600,
    aud: "appstoreconnect-v1",
    bid: APPLE_BUNDLE_ID,
  })).toString("base64url");

  const signingInput = `${header}.${payload}`;
  const signature = crypto.createSign("SHA256").update(signingInput).sign(APPLE_PRIVATE_KEY, "base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Apple App Store Server API transaction response (v2).
 */
type AppleTransactionResponse = {
  transactionId: string;
  originalTransactionId: string;
  webOrderLineItemId: string;
  bundleId: string;
  productId: string;
  subscriptionGroupIdentifier: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate: number;
  quantity: number;
  type: string; // "Auto-Renewable Subscription"
  inAppOwnershipType: string;
  signedDate: number;
  environment: string;
  recentSubscriptionStartDate: number;
  transactionReason?: string;
  storefront?: string;
  storefrontId?: string;
  price?: number;
  currency?: string;
};

/**
 * Verifies an Apple transaction via the App Store Server API v2.
 *
 * @param originalTransactionId The StoreKit 2 `transaction.originalID`.
 * @returns { valid: boolean; expiresDateMs?: number }
 */
export async function verifyAppleTransaction(
  originalTransactionId: string
): Promise<{ valid: boolean; expiresDateMs?: number }> {
  const logger = new TracedLogger(createTraceContext("verifyAppleTransaction"));
  const jwt = signAppleJWT();
  const url = `${APPLE_API_BASE}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    timeoutMs: 15000,
  });

  if (response.status === 404) {
    logger.warn("Apple transaction not found", { originalTransactionId });
    return { valid: false };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error("Apple API error", { status: response.status, body });
    throw new Error(`Apple API returned ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    data?: AppleTransactionResponse[];
    errorMessage?: string;
  };

  if (!data.data || data.data.length === 0) {
    return { valid: false };
  }

  // Find the most recent active transaction
  const latest = data.data
    .filter((t) => t.expiresDate > 0)
    .sort((a, b) => b.expiresDate - a.expiresDate)[0];

  if (!latest) {
    return { valid: false };
  }

  const nowMs = Date.now();
  const expiresDateMs = latest.expiresDate;
  const isActive = expiresDateMs > nowMs;

  logger.info("Apple transaction verified", {
    originalTransactionId,
    productId: latest.productId,
    expiresDateMs,
    isActive,
  });

  return { valid: isActive, expiresDateMs };
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
  const logger = new TracedLogger(createTraceContext("decodeRtdnPayload"));
  try {
    const raw = Buffer.from(data, "base64").toString("utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as RtdnPayload : null;
  } catch (err) {
    logger.warn("Failed to decode RTDN payload", { error: String(err) });
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
  const logger = new TracedLogger(createTraceContext("applyRtdnNotification"));
  if (payload.testNotification) {
    logger.info("RTDN test notification received", { version: payload.testNotification.version });
    return { handled: true, reason: "test_notification" };
  }
  const sub = payload.subscriptionNotification;
  if (!sub?.purchaseToken || typeof sub.notificationType !== "number") {
    return { handled: false, reason: "missing_subscription_notification" };
  }

  const snapshot = await db().collection("masters")
    .where("subscription.purchaseToken", "==", sub.purchaseToken)
    .limit(1)
    .get();

  if (snapshot.empty) {
    logger.warn("RTDN received but no matching master found", {
      purchaseToken: sub.purchaseToken.slice(0, 6) + "…",
      notificationType: sub.notificationType,
    });
    return { handled: false, reason: "master_not_found", notificationType: sub.notificationType };
  }

  const doc = snapshot.docs[0]!;
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
      logger.warn("RTDN unknown notificationType", { notificationType: sub.notificationType });
      return { handled: false, reason: "unknown_notification_type", masterId, notificationType: sub.notificationType };
    }
  }

  await doc.ref.update(update);

  logger.info("RTDN processed", {
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
    const logger = new TracedLogger(createTraceContext("onPlayBillingNotification"));
    const payload = decodeRtdnPayload((message as any)?.data);
    if (!payload) {
      logger.warn("RTDN: empty or undecodable payload");
      return null;
    }
    try {
      await applyRtdnNotification(payload);
    } catch (err) {
      logger.error("RTDN processing failed", err);
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
  const logger = new TracedLogger(createTraceContext("reverifyActiveSubscriptionsRun"));
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
      logger.info("Reverified subscription", {
        masterId: doc.id,
        newStatus: update["subscription.status"],
      });
    } catch (err) {
      errors++;
      logger.warn("Reverify failed for master", {
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
    const logger = new TracedLogger(createTraceContext("reverifyActiveSubscriptions"));
    const packageName = process.env.PLAY_PACKAGE_NAME || "com.minimaster.masterapp";
    const batchSize = Number(process.env.REVERIFY_BATCH || REVERIFY_DEFAULT_BATCH);
    try {
      const summary = await reverifyActiveSubscriptionsRun(packageName, batchSize);
      logger.info("Reverify run complete", summary);
    } catch (err) {
      logger.error("Reverify run failed", err);
    }
    return null;
  });
