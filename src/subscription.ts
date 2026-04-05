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
