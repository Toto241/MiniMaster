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
  const vatRate = vatConfig?.rate || 0.19; // Default to German VAT

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
import { requireAdmin, validateAppCheck } from "./shared";

export const getPricingConfig = functions.https.onCall(
  async (_data: unknown, context: CallableContext) => {
    validateAppCheck(context, true);
    requireAdmin(context);

    return {
      b2c: Object.values(B2C_TIERS).map((t) => ({
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
      b2b: Object.values(B2B_TIERS).map((t) => ({
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
