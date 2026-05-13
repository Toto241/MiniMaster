/**
 * Affiliate Program for MiniMaster.
 * Manages affiliate partners, tracking, commissions, and payouts.
 *
 * Legal compliance notes:
 * - EU Consumer Protection Directive: Affiliates must disclose commercial relationship
 * - German UWG (Gesetz gegen den unlauteren Wettbewerb): No deceptive marketing
 * - DSGVO: Cookie consent required for tracking (30-day attribution window)
 * - Tax: Affiliates responsible for their own tax; MiniMaster issues annual summaries
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, requireAdmin, checkRateLimit, validateAppCheck, AuditLogger } from "./shared";
import { validateString } from "./validation";
import { withErrorHandling } from "./error-handler";
import { AFFILIATE_CONFIG, B2C_TIERS } from "./pricing-config";

// ==================== TYPES ====================

export interface Affiliate {
  id: string;
  code: string;
  name: string;
  email: string;
  paypalEmail?: string;
  bankIban?: string;
  commissionRate: number;
  commissionDurationMonths: number;
  totalReferrals: number;
  totalEarningsCents: number;
  pendingEarningsCents: number;
  paidEarningsCents: number;
  status: "pending" | "active" | "suspended" | "rejected";
  website?: string;
  audienceDescription?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ==================== CLOUD FUNCTIONS ====================

/**
 * Registers a new affiliate application.
 */
export const registerAffiliate = functions.https.onCall(
  withErrorHandling(
    "registerAffiliate",
    async (data: {
      name: string;
      email: string;
      paypalEmail?: string;
      website?: string;
      audienceDescription?: string;
    }, context: CallableContext) => {
      const startTime = Date.now();
      const userId = requireAuth(context);
      validateAppCheck(context, true);
      checkRateLimit(userId, "registerAffiliate", 3);

      const name = validateString(data.name, "name", { maxLength: 200 });
      const email = validateString(data.email, "email", {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        sanitize: "none",
      });

      // Check if user already has an affiliate account
      const existing = await db().collection("affiliates")
        .where("email", "==", email)
        .limit(1)
        .get();

      if (!existing.empty) {
        const existingData = existing.docs[0]!.data();
        if (existingData.status === "active") {
          throw new functions.https.HttpsError("already-exists", "An affiliate account with this email already exists.");
        }
        if (existingData.status === "pending") {
          return { success: true, status: "pending", message: "Your application is still under review." };
        }
      }

      // Generate unique affiliate code with collision check
      const codePrefix = AFFILIATE_CONFIG.affiliateCodesPrefix;
      let code: string | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
        const candidate = `${codePrefix}${randomSuffix}`;
        const existing = await db().collection("affiliates").where("code", "==", candidate).limit(1).get();
        if (existing.empty) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        throw new functions.https.HttpsError("internal", "Could not generate a unique affiliate code. Please try again.");
      }

      const now = admin.firestore.Timestamp.now();
      const affiliateRef = db().collection("affiliates").doc();

      await affiliateRef.set({
        userId,
        code,
        name,
        email,
        paypalEmail: data.paypalEmail || email,
        commissionRate: AFFILIATE_CONFIG.commissionRate,
        commissionDurationMonths: AFFILIATE_CONFIG.commissionDurationMonths,
        totalReferrals: 0,
        totalEarningsCents: 0,
        pendingEarningsCents: 0,
        paidEarningsCents: 0,
        status: "pending",
        website: data.website || "",
        audienceDescription: data.audienceDescription || "",
        createdAt: now,
        updatedAt: now,
      });

      await AuditLogger.logSuccess(
        "affiliate.register", context, `affiliates/${affiliateRef.id}`, "affiliate",
        { affiliateId: affiliateRef.id, code, name, duration: Date.now() - startTime }
      );

      return {
        success: true,
        affiliateId: affiliateRef.id,
        code,
        status: "pending",
        message: "Application submitted. Review typically takes 1-2 business days.",
      };
    }
  )
);

/**
 * Admin: Approves or rejects an affiliate application.
 */
export const reviewAffiliate = functions.https.onCall(
  withErrorHandling(
    "reviewAffiliate",
    async (data: { affiliateId: string; action: "approve" | "reject"; reason?: string }, context: CallableContext) => {
      const startTime = Date.now();
      requireAdmin(context);
      validateAppCheck(context, true);

      const affiliateId = validateString(data.affiliateId, "affiliateId", { maxLength: 128 });

      const affiliateRef = db().collection("affiliates").doc(affiliateId);
      const affiliateDoc = await affiliateRef.get();
      if (!affiliateDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Affiliate not found.");
      }

      const newStatus = data.action === "approve" ? "active" : "rejected";
      const now = admin.firestore.Timestamp.now();

      await affiliateRef.update({
        status: newStatus,
        reviewedBy: context.auth?.uid,
        reviewedAt: now,
        reviewReason: data.reason || "",
        updatedAt: now,
      });

      await AuditLogger.logSuccess(
        "admin.affiliate.review", context, `affiliates/${affiliateId}`, "affiliate",
        { affiliateId, action: data.action, duration: Date.now() - startTime }
      );

      return { success: true, affiliateId, status: newStatus };
    }
  )
);

/**
 * Tracks an affiliate conversion when a user subscribes.
 * Called internally by verifyPurchase.
 */
export const trackAffiliateConversion = functions.https.onCall(
  withErrorHandling(
    "trackAffiliateConversion",
    async (data: { affiliateCode: string; masterId: string; subscriptionId: string; sku: string }, context: CallableContext) => {
      validateAppCheck(context, true);

      const code = validateString(data.affiliateCode, "affiliateCode", { maxLength: 20 });
      const masterId = validateString(data.masterId, "masterId", { maxLength: 128 });
      const subscriptionId = validateString(data.subscriptionId, "subscriptionId", { maxLength: 128 });

      // Find affiliate by code
      const affiliateSnapshot = await db().collection("affiliates")
        .where("code", "==", code)
        .where("status", "==", "active")
        .limit(1)
        .get();

      if (affiliateSnapshot.empty) {
        return { success: false, reason: "affiliate_not_found_or_inactive" };
      }

      const affiliateDoc = affiliateSnapshot.docs[0]!;
      const affiliateData = affiliateDoc.data();

      // Check for duplicate referral
      const existing = await db().collection("affiliate_referrals")
        .where("masterId", "==", masterId)
        .limit(1)
        .get();

      if (!existing.empty) {
        return { success: false, reason: "already_referred" };
      }

      // Calculate commission
      const tier = B2C_TIERS[data.sku];
      const priceCents = tier?.priceCents || 0;
      const commissionCents = Math.round(priceCents * affiliateData.commissionRate);

      const now = admin.firestore.Timestamp.now();

      // Create referral record
      await db().collection("affiliate_referrals").add({
        affiliateId: affiliateDoc.id,
        masterId,
        subscriptionId,
        sku: data.sku,
        priceCents,
        commissionRate: affiliateData.commissionRate,
        commissionCents,
        status: "pending",
        createdAt: now,
      });

      // Update affiliate stats
      await affiliateDoc.ref.update({
        totalReferrals: admin.firestore.FieldValue.increment(1),
        pendingEarningsCents: admin.firestore.FieldValue.increment(commissionCents),
        totalEarningsCents: admin.firestore.FieldValue.increment(commissionCents),
        updatedAt: now,
      });

      // Link master to affiliate for recurring commissions
      await db().collection("masters").doc(masterId).update({
        affiliateId: affiliateDoc.id,
        affiliateCode: code,
        referredAt: now,
      });

      functions.logger.info(`Affiliate conversion tracked: ${code} -> ${masterId}, commission: ${commissionCents}c`);
      return { success: true, commissionCents };
    }
  )
);

/**
 * Gets affiliate dashboard data.
 */
export const getAffiliateDashboard = functions.https.onCall(
  withErrorHandling(
    "getAffiliateDashboard",
    async (_data: Record<string, never>, context: CallableContext) => {
      const userId = requireAuth(context);
      validateAppCheck(context, true);

      const affiliateSnapshot = await db().collection("affiliates")
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (affiliateSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "No affiliate account found.");
      }

      const affiliateDoc = affiliateSnapshot.docs[0]!;
      const affiliateData = affiliateDoc.data();

      // Get recent referrals
      const referralsSnapshot = await db().collection("affiliate_referrals")
        .where("affiliateId", "==", affiliateDoc.id)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      return {
        affiliateId: affiliateDoc.id,
        code: affiliateData.code,
        status: affiliateData.status,
        commissionRate: affiliateData.commissionRate,
        totalReferrals: affiliateData.totalReferrals,
        totalEarningsCents: affiliateData.totalEarningsCents,
        pendingEarningsCents: affiliateData.pendingEarningsCents,
        paidEarningsCents: affiliateData.paidEarningsCents,
        referralLink: `https://minimaster.app/ref/${affiliateData.code}`,
        referrals: referralsSnapshot.docs.map((d) => ({
          id: d.id,
          masterId: d.data().masterId,
          sku: d.data().sku,
          commissionCents: d.data().commissionCents,
          status: d.data().status,
          createdAt: d.data().createdAt?.toMillis(),
        })),
      };
    }
  )
);

/**
 * Admin: Lists all affiliates with stats.
 */
export const listAffiliates = functions.https.onCall(
  withErrorHandling(
    "listAffiliates",
    async (data: { status?: string; limit?: number }, context: CallableContext) => {
      requireAdmin(context);
      validateAppCheck(context, true);

      const limit = Math.min(data.limit || 50, 100);

      let query: admin.firestore.Query = db().collection("affiliates")
        .orderBy("createdAt", "desc")
        .limit(limit);

      if (data.status) {
        query = query.where("status", "==", data.status);
      }

      const snapshot = await query.get();

      return {
        affiliates: snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            code: d.code,
            name: d.name,
            email: d.email,
            status: d.status,
            totalReferrals: d.totalReferrals,
            totalEarningsCents: d.totalEarningsCents,
            pendingEarningsCents: d.pendingEarningsCents,
            createdAt: d.createdAt?.toMillis(),
          };
        }),
        total: snapshot.size,
      };
    }
  )
);

/**
 * Admin: Processes monthly affiliate payouts.
 * Marks pending commissions as paid.
 */
export const processAffiliatePayouts = functions.https.onCall(
  withErrorHandling(
    "processAffiliatePayouts",
    async (_data: Record<string, never>, context: CallableContext) => {
      const startTime = Date.now();
      requireAdmin(context);
      validateAppCheck(context, true);

      const minPayoutCents = AFFILIATE_CONFIG.minimumPayoutCents;

      // Find affiliates with pending earnings above minimum
      const affiliatesSnapshot = await db().collection("affiliates")
        .where("status", "==", "active")
        .where("pendingEarningsCents", ">=", minPayoutCents)
        .get();

      const batch = db().batch();
      let payoutCount = 0;
      const now = admin.firestore.Timestamp.now();

      for (const doc of affiliatesSnapshot.docs) {
        const data = doc.data();
        const pendingCents = data.pendingEarningsCents || 0;

        // Reset pending, add to paid
        batch.update(doc.ref, {
          pendingEarningsCents: 0,
          paidEarningsCents: admin.firestore.FieldValue.increment(pendingCents),
          lastPayoutAt: now,
          updatedAt: now,
        });

        // Create payout record
        const payoutRef = db().collection("affiliate_payouts").doc();
        batch.set(payoutRef, {
          affiliateId: doc.id,
          amountCents: pendingCents,
          status: "pending_transfer", // Admin must manually transfer
          createdAt: now,
          processedBy: context.auth?.uid,
        });

        payoutCount++;
      }

      if (payoutCount > 0) {
        await batch.commit();
      }

      await AuditLogger.logSuccess(
        "admin.affiliate.payouts", context, "affiliates", "affiliate",
        { payoutsProcessed: payoutCount, totalAffiliates: affiliatesSnapshot.size, duration: Date.now() - startTime }
      );

      return {
        success: true,
        payoutsProcessed: payoutCount,
        message: `${payoutCount} affiliates marked for payout. Manual transfer required.`,
      };
    }
  )
);
