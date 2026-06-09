/**
 * B2C net prices — keep in sync with src/pricing-config.ts (B2C_TIERS.priceCents).
 */
import { register } from "../core/registry.js";

const B2C_SKU_NET_CENTS_VALUE = Object.freeze({
  single_child_monthly: 499,
  family_monthly: 999,
  single_child_yearly: 3999,
  family_yearly: 7999,
  family_yearly_premium: 9999,
});

const B2C_SKU_BILLING_PERIOD_VALUE = Object.freeze({
  single_child_monthly: "monthly",
  family_monthly: "monthly",
  single_child_yearly: "yearly",
  family_yearly: "yearly",
  family_yearly_premium: "yearly",
});

export const B2C_SKU_NET_CENTS = B2C_SKU_NET_CENTS_VALUE;
export const B2C_SKU_BILLING_PERIOD = B2C_SKU_BILLING_PERIOD_VALUE;

function formatPriceDeValue(cents, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function monthlyRevenueCentsValue(sku) {
  const cents = B2C_SKU_NET_CENTS_VALUE[sku];
  if (!cents) return 0;
  return B2C_SKU_BILLING_PERIOD_VALUE[sku] === "yearly" ? Math.round(cents / 12) : cents;
}

function monthlyRevenueEurValue(sku) {
  return monthlyRevenueCentsValue(sku) / 100;
}

function buildSubscriptionSkuSummaryDeValue() {
  return Object.entries(B2C_SKU_NET_CENTS_VALUE)
    .map(([sku, cents]) => {
      const period = B2C_SKU_BILLING_PERIOD_VALUE[sku] === "yearly" ? "/Jahr" : "/Monat";
      return `${sku} (${formatPriceDeValue(cents)} netto${period})`;
    })
    .join(", ");
}

function buildOperatorSubscriptionAnswerDeValue() {
  return (
    "Subscriptions: In der Übersicht werden Warnungen für ablaufende Trials (<7 Tage) und Abos angezeigt. " +
    "Im User-Detail sind alle Abo-Infos sichtbar: Typ, Start, Ablauf, Kinderlimit, Purchase-Token. " +
    `SKUs (netto, zzgl. MwSt.): ${buildSubscriptionSkuSummaryDeValue()}.`
  );
}

export const formatPriceDe = formatPriceDeValue;
export const monthlyRevenueCents = monthlyRevenueCentsValue;
export const monthlyRevenueEur = monthlyRevenueEurValue;
export const buildSubscriptionSkuSummaryDe = buildSubscriptionSkuSummaryDeValue;
export const buildOperatorSubscriptionAnswerDe = buildOperatorSubscriptionAnswerDeValue;

register("pricingLookup", {
  B2C_SKU_NET_CENTS: B2C_SKU_NET_CENTS_VALUE,
  B2C_SKU_BILLING_PERIOD: B2C_SKU_BILLING_PERIOD_VALUE,
  formatPriceDe: formatPriceDeValue,
  monthlyRevenueCents: monthlyRevenueCentsValue,
  monthlyRevenueEur: monthlyRevenueEurValue,
  buildSubscriptionSkuSummaryDe: buildSubscriptionSkuSummaryDeValue,
  buildOperatorSubscriptionAnswerDe: buildOperatorSubscriptionAnswerDeValue,
});
