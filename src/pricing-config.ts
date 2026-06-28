/**
 * Centralized Pricing Configuration for MiniMaster.
 * Single source of truth for all product tiers, SKUs, limits, and pricing.
 *
 * Legal note: All prices are stored net (without VAT). VAT is added at checkout
 * based on the customer's billing country per EU VAT OSS rules.
 */
// ==================== B2C TIER CONFIGURATION ====================

export interface B2CTier {
  sku: string;
  name: string;
  description: string;
  priceCents: number;     // Net price in cents (e.g. 499 = 4.99 EUR)
  currency: string;       // ISO 4217
  billingPeriod: "monthly" | "yearly";
  childLimit: number;
  parentAppLimit: number;
  features: string[];
  isPremium: boolean;
}

export const B2C_TIERS: Record<string, B2CTier> = {
  single_child_monthly: {
    sku: "single_child_monthly",
    name: "Single Child (Monthly)",
    description: "Protection for 1 child, billed monthly",
    priceCents: 499,
    currency: "EUR",
    billingPeriod: "monthly",
    childLimit: 1,
    parentAppLimit: 2,
    features: ["app_lock", "screen_time", "task_system", "basic_reports"],
    isPremium: false,
  },
  family_monthly: {
    sku: "family_monthly",
    name: "Family (Monthly)",
    description: "Protection for up to 4 children, billed monthly",
    priceCents: 999,
    currency: "EUR",
    billingPeriod: "monthly",
    childLimit: 4,
    parentAppLimit: 2,
    features: ["app_lock", "screen_time", "task_system", "ai_verification", "advanced_reports", "priority_support"],
    isPremium: true,
  },
  single_child_yearly: {
    sku: "single_child_yearly",
    name: "Single Child (Yearly)",
    description: "Protection for 1 child, billed annually (save 20%)",
    priceCents: 3999,
    currency: "EUR",
    billingPeriod: "yearly",
    childLimit: 1,
    parentAppLimit: 2,
    features: ["app_lock", "screen_time", "task_system", "basic_reports"],
    isPremium: false,
  },
  family_yearly: {
    sku: "family_yearly",
    name: "Family (Yearly)",
    description: "Protection for up to 4 children, billed annually (save 33%)",
    priceCents: 7999,
    currency: "EUR",
    billingPeriod: "yearly",
    childLimit: 4,
    parentAppLimit: 2,
    features: ["app_lock", "screen_time", "task_system", "ai_verification", "advanced_reports", "priority_support"],
    isPremium: true,
  },
  family_yearly_premium: {
    sku: "family_yearly_premium",
    name: "Family Premium (Yearly)",
    description: "Premium protection for up to 6 children with exclusive features",
    priceCents: 9999,
    currency: "EUR",
    billingPeriod: "yearly",
    childLimit: 6,
    parentAppLimit: 3,
    features: ["app_lock", "screen_time", "task_system", "ai_verification", "advanced_reports", "priority_support", "family_coaching_discount", "beta_access"],
    isPremium: true,
  },
};

// ==================== B2B TIER CONFIGURATION ====================

export interface B2BTier {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  billingPeriod: "monthly" | "yearly";
  maxDevices: number;
  maxAdmins: number;
  features: string[];
  orgTypes: ("school" | "kita" | "youth_center" | "enterprise")[];
  requiresContract: boolean;
}

export const B2B_TIERS: Record<string, B2BTier> = {
  b2b_school_50: {
    sku: "b2b_school_50",
    name: "School Basic",
    description: "Up to 50 student devices for schools",
    priceCents: 19900,
    currency: "EUR",
    billingPeriod: "monthly",
    maxDevices: 50,
    maxAdmins: 5,
    features: ["bulk_device_management", "usage_reports", "tamper_alerts", "teacher_dashboard", "api_access"],
    orgTypes: ["school", "youth_center"],
    requiresContract: true,
  },
  b2b_school_200: {
    sku: "b2b_school_200",
    name: "School Professional",
    description: "Up to 200 student devices for larger schools",
    priceCents: 49900,
    currency: "EUR",
    billingPeriod: "monthly",
    maxDevices: 200,
    maxAdmins: 15,
    features: ["bulk_device_management", "usage_reports", "tamper_alerts", "teacher_dashboard", "api_access", "sso_integration", "dedicated_support"],
    orgTypes: ["school", "youth_center"],
    requiresContract: true,
  },
  b2b_school_unlimited: {
    sku: "b2b_school_unlimited",
    name: "School Enterprise",
    description: "Unlimited devices for school districts",
    priceCents: 99900,
    currency: "EUR",
    billingPeriod: "monthly",
    maxDevices: -1, // unlimited
    maxAdmins: -1,
    features: ["everything_in_200", "custom_onboarding", "sla_99_9", "data_residency_eu", "white_label_options"],
    orgTypes: ["school", "enterprise"],
    requiresContract: true,
  },
  b2b_kita_basic: {
    sku: "b2b_kita_basic",
    name: "Kita Basic",
    description: "Up to 25 devices for daycare centers",
    priceCents: 9900,
    currency: "EUR",
    billingPeriod: "monthly",
    maxDevices: 25,
    maxAdmins: 3,
    features: ["simple_device_management", "usage_reports", "parent_communication"],
    orgTypes: ["kita"],
    requiresContract: true,
  },
};

// ==================== VALID PRODUCT IDS ====================

export const VALID_PRODUCT_IDS = [
  ...Object.keys(B2C_TIERS),
  ...Object.keys(B2B_TIERS),
];

// ==================== AFFILIATE CONFIGURATION ====================

export const AFFILIATE_CONFIG = {
  commissionRate: 0.30,         // 30% commission
  commissionDurationMonths: 12, // For 12 months
  minimumPayoutCents: 5000,     // 50 EUR minimum payout
  payoutMethod: "paypal",       // paypal or bank_transfer
  cookieDurationDays: 30,       // 30-day attribution window
  affiliateCodesPrefix: "MM",
};

// ==================== VAT CONFIGURATION ====================

export interface VatRate {
  country: string;   // ISO 3166-1 alpha-2
  rate: number;      // e.g. 0.19 for 19%
  isStandard: boolean;
}

export const VAT_RATES: Record<string, VatRate> = {
  DE: { country: "Germany", rate: 0.19, isStandard: true },
  AT: { country: "Austria", rate: 0.20, isStandard: true },
  CH: { country: "Switzerland", rate: 0.077, isStandard: true },
  NL: { country: "Netherlands", rate: 0.21, isStandard: true },
  BE: { country: "Belgium", rate: 0.21, isStandard: true },
  FR: { country: "France", rate: 0.20, isStandard: true },
  IT: { country: "Italy", rate: 0.22, isStandard: true },
  ES: { country: "Spain", rate: 0.21, isStandard: true },
  PL: { country: "Poland", rate: 0.23, isStandard: true },
  CZ: { country: "Czech Republic", rate: 0.21, isStandard: true },
  // Add more as needed
};

/**
 * Calculates the gross price including VAT for a given country.
 * For B2B customers with valid VAT ID, returns net price (reverse charge).
 */
export function calculatePrice(priceCents: number, countryCode: string, vatId?: string): {
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatRate: number;
  reverseCharge: boolean;
} {
  const vatConfig = VAT_RATES[countryCode.toUpperCase()];
  const vatRate = vatConfig?.rate ?? 0;

  // B2B reverse charge for EU businesses with valid VAT ID
  const reverseCharge = Boolean(vatId && vatId.length > 5 && countryCode.toUpperCase() !== "CH");

  if (reverseCharge) {
    return {
      netCents: priceCents,
      vatCents: 0,
      grossCents: priceCents,
      vatRate: 0,
      reverseCharge: true,
    };
  }

  const vatCents = Math.round(priceCents * vatRate);
  return {
    netCents: priceCents,
    vatCents,
    grossCents: priceCents + vatCents,
    vatRate,
    reverseCharge: false,
  };
}

// ==================== HELPER FUNCTIONS ====================

export function getTierBySku(sku: string): B2CTier | B2BTier | undefined {
  return B2C_TIERS[sku] || B2B_TIERS[sku];
}

export function isB2BSku(sku: string): boolean {
  return sku in B2B_TIERS;
}

export function isB2CSku(sku: string): boolean {
  return sku in B2C_TIERS;
}

export function getChildLimit(sku: string): number {
  const tier = getTierBySku(sku);
  if (!tier) return 4;
  if ("childLimit" in tier) return tier.childLimit;
  if ("maxDevices" in tier) return tier.maxDevices;
  return 4;
}

export function getParentAppLimit(sku: string): number {
  const tier = getTierBySku(sku);
  if (!tier) return 2;
  if ("parentAppLimit" in tier) return tier.parentAppLimit;
  return 2;
}

export function getSubscriptionDurationMs(sku: string): number {
  const tier = getTierBySku(sku);
  if (!tier) return 30 * 24 * 60 * 60 * 1000;
  if (tier.billingPeriod === "yearly") return 365 * 24 * 60 * 60 * 1000;
  return 30 * 24 * 60 * 60 * 1000;
}

export function formatPriceCents(cents: number, currency = "EUR", locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

// ==================== PROMO CODE SUPPORT ====================

export interface PromoCode {
  code: string;
  discountPercent: number;
  maxRedemptions: number;
  currentRedemptions: number;
  validFrom: Date;
  validUntil: Date;
  applicableSkus: string[]; // empty = all
  createdBy: string;
}

export function applyPromoCode(priceCents: number, promoCode: PromoCode | null): {
  originalCents: number;
  discountedCents: number;
  discountCents: number;
  discountPercent: number;
} {
  if (!promoCode) {
    return { originalCents: priceCents, discountedCents: priceCents, discountCents: 0, discountPercent: 0 };
  }

  const discountCents = Math.round(priceCents * promoCode.discountPercent);
  const discountedCents = Math.max(0, priceCents - discountCents);

  return {
    originalCents: priceCents,
    discountedCents,
    discountCents,
    discountPercent: promoCode.discountPercent,
  };
}

// ==================== ADMIN API ====================

import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAdmin, validateAppCheck, AuditLogger } from "./shared";

// ==================== PRICING OVERRIDE (Firestore, display/invoicing only) ====================

/**
 * Firestore-backed pricing override. Lets an admin adjust the DISPLAYED pricing
 * (and any internal VAT/invoice calc that is fed these prices) from the panel
 * without a code change. Code (`B2C_TIERS`/`B2B_TIERS`) is the fallback default.
 *
 * IMPORTANT: This does NOT change what Play Store / App Store Connect actually
 * charge — store prices are configured there. Entitlement limits (childLimit,
 * maxDevices, durations) intentionally stay code-sourced and are NOT overridable
 * here, so a price edit can never silently widen what a subscriber receives.
 */
const PRICING_OVERRIDE_DOC = "operatorConfig/pricingOverride";

const B2C_OVERRIDE_FIELDS = ["priceCents", "currency", "name", "description", "features", "isPremium"] as const;
const B2B_OVERRIDE_FIELDS = ["priceCents", "currency", "name", "description", "features", "requiresContract"] as const;

type PricingScope = "b2c" | "b2b";

interface PricingOverrideDoc {
  b2c?: Record<string, Partial<B2CTier>>;
  b2b?: Record<string, Partial<B2BTier>>;
}

async function readPricingOverride(): Promise<PricingOverrideDoc> {
  try {
    const doc = await db().doc(PRICING_OVERRIDE_DOC).get();
    if (!doc.exists) return {};
    const raw = (doc.data() || {}) as PricingOverrideDoc;
    return {
      b2c: raw.b2c && typeof raw.b2c === "object" ? raw.b2c : {},
      b2b: raw.b2b && typeof raw.b2b === "object" ? raw.b2b : {},
    };
  } catch (err) {
    functions.logger.warn("readPricingOverride failed; using code defaults", err);
    return {};
  }
}

function mergeTier<T extends B2CTier | B2BTier>(
  base: T,
  override: Partial<T> | undefined,
  allowed: readonly string[]
): T {
  if (!override || typeof override !== "object") return base;
  const out: Record<string, unknown> = { ...base };
  const ov = override as unknown as Record<string, unknown>;
  for (const field of allowed) {
    if (ov[field] !== undefined) out[field] = ov[field];
  }
  return out as unknown as T;
}

/** Returns the effective tier maps: code defaults with the Firestore override applied. */
async function getEffectiveTiers(): Promise<{ b2c: Record<string, B2CTier>; b2b: Record<string, B2BTier> }> {
  const override = await readPricingOverride();
  const b2c: Record<string, B2CTier> = {};
  for (const sku of Object.keys(B2C_TIERS)) {
    b2c[sku] = mergeTier(B2C_TIERS[sku]!, override.b2c?.[sku], B2C_OVERRIDE_FIELDS);
  }
  const b2b: Record<string, B2BTier> = {};
  for (const sku of Object.keys(B2B_TIERS)) {
    b2b[sku] = mergeTier(B2B_TIERS[sku]!, override.b2b?.[sku], B2B_OVERRIDE_FIELDS);
  }
  return { b2c, b2b };
}

const CURRENCY_RE = /^[A-Z]{3}$/;
const MAX_PRICE_CENTS = 10_000_000; // 100k in major units — generous upper bound.

function validatePricingPatch(
  scope: unknown,
  sku: unknown,
  field: unknown,
  value: unknown
): { ok: boolean; reason?: string } {
  if (scope !== "b2c" && scope !== "b2b") {
    return { ok: false, reason: "scope must be 'b2c' or 'b2b'." };
  }
  const tiers = scope === "b2c" ? B2C_TIERS : B2B_TIERS;
  if (typeof sku !== "string" || !tiers[sku]) {
    return { ok: false, reason: "Unknown sku (new SKUs are not allowed — only existing tiers)." };
  }
  const allowed = scope === "b2c" ? B2C_OVERRIDE_FIELDS : B2B_OVERRIDE_FIELDS;
  if (typeof field !== "string" || !(allowed as readonly string[]).includes(field)) {
    return { ok: false, reason: `field must be one of: ${allowed.join(", ")}.` };
  }
  if (field === "priceCents") {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > MAX_PRICE_CENTS) {
      return { ok: false, reason: `priceCents must be an integer between 0 and ${MAX_PRICE_CENTS}.` };
    }
  } else if (field === "currency") {
    if (typeof value !== "string" || !CURRENCY_RE.test(value)) {
      return { ok: false, reason: "currency must be a 3-letter ISO-4217 code (e.g. EUR)." };
    }
  } else if (field === "name") {
    if (typeof value !== "string" || value.length === 0 || value.length > 120) {
      return { ok: false, reason: "name must be a non-empty string up to 120 chars." };
    }
  } else if (field === "description") {
    if (typeof value !== "string" || value.length > 500) {
      return { ok: false, reason: "description must be a string up to 500 chars." };
    }
  } else if (field === "isPremium" || field === "requiresContract") {
    if (typeof value !== "boolean") return { ok: false, reason: `${field} must be a boolean.` };
  } else if (field === "features") {
    if (!Array.isArray(value) || value.length > 20 || !value.every((f) => typeof f === "string" && f.length <= 60)) {
      return { ok: false, reason: "features must be an array of ≤20 strings (≤60 chars each)." };
    }
  }
  return { ok: true };
}

export const getPricingConfig = functions.https.onCall(
  async (_data: unknown, context: CallableContext) => {
    validateAppCheck(context, true);
    requireAdmin(context);

    const { b2c, b2b } = await getEffectiveTiers();

    return {
      b2c: Object.values(b2c).map((t) => ({
        sku: t.sku,
        name: t.name,
        description: t.description,
        priceCents: t.priceCents,
        currency: t.currency,
        billingPeriod: t.billingPeriod,
        childLimit: t.childLimit,
        parentAppLimit: t.parentAppLimit,
        features: t.features,
        isPremium: t.isPremium,
        platforms: ["android", "ios"],
      })),
      b2b: Object.values(b2b).map((t) => ({
        sku: t.sku,
        name: t.name,
        description: t.description,
        priceCents: t.priceCents,
        currency: t.currency,
        billingPeriod: t.billingPeriod,
        maxDevices: t.maxDevices,
        maxAdmins: t.maxAdmins,
        features: t.features,
        orgTypes: t.orgTypes,
        requiresContract: t.requiresContract,
      })),
      affiliate: {
        commissionRate: 0.30,
        commissionDurationMonths: 12,
        minimumPayoutCents: 5000,
        cookieDurationDays: 30,
        payoutMethod: "PayPal",
      },
    };
  }
);

interface PricingPatchPayload {
  scope?: PricingScope;
  sku?: string;
  field?: string;
  value?: unknown;
}

/**
 * Patch one overridable field of one existing pricing tier. Admin-only.
 * Writes a nested structure into `operatorConfig/pricingOverride` so Firestore's
 * deep-merge semantics apply (dot-notation keys are NOT expanded by set+merge).
 */
export const patchPricingOverride = functions.https.onCall(
  async (data: PricingPatchPayload, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    if (!data || typeof data !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "Payload required.");
    }
    const check = validatePricingPatch(data.scope, data.sku, data.field, data.value);
    if (!check.ok) {
      throw new functions.https.HttpsError("invalid-argument", check.reason || "Invalid value.");
    }

    const adminUid = context.auth?.uid || "unknown-admin";
    await db().doc(PRICING_OVERRIDE_DOC).set(
      {
        [data.scope as string]: { [data.sku as string]: { [data.field as string]: data.value } },
        meta: {
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedBy: adminUid,
        },
      },
      { merge: true }
    );

    await AuditLogger.logSuccess(
      "operator.pricing_override", context, PRICING_OVERRIDE_DOC, "system",
      { scope: data.scope, sku: data.sku, field: data.field }
    );

    return { ok: true, scope: data.scope, sku: data.sku, field: data.field };
  }
);

/** Remove the entire pricing override, reverting to code defaults. Admin-only. */
export const resetPricingOverride = functions.https.onCall(
  async (_data: unknown, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    await db().doc(PRICING_OVERRIDE_DOC).delete();

    await AuditLogger.logSuccess(
      "operator.pricing_override", context, PRICING_OVERRIDE_DOC, "system", { reset: true }
    );

    return { ok: true, reset: true };
  }
);
