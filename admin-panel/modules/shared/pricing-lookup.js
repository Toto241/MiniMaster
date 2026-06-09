/**
 * B2C net prices — keep in sync with src/pricing-config.ts (B2C_TIERS.priceCents).
 */
import { register } from "../core/registry.js";

export const B2C_SKU_NET_CENTS = Object.freeze({
  single_child_monthly: 499,
  family_monthly: 999,
  single_child_yearly: 3999,
  family_yearly: 7999,
  family_yearly_premium: 9999,
});

export const B2C_SKU_BILLING_PERIOD = Object.freeze({
  single_child_monthly: "monthly",
  family_monthly: "monthly",
  single_child_yearly: "yearly",
  family_yearly: "yearly",
  family_yearly_premium: "yearly",
});

export function formatPriceDe(cents, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function monthlyRevenueCents(sku) {
  const cents = B2C_SKU_NET_CENTS[sku];
  if (!cents) return 0;
  return B2C_SKU_BILLING_PERIOD[sku] === "yearly" ? Math.round(cents / 12) : cents;
}

export function monthlyRevenueEur(sku) {
  return monthlyRevenueCents(sku) / 100;
}

export function buildSubscriptionSkuSummaryDe() {
  return Object.entries(B2C_SKU_NET_CENTS)
    .map(([sku, cents]) => {
      const period = B2C_SKU_BILLING_PERIOD[sku] === "yearly" ? "/Jahr" : "/Monat";
      return `${sku} (${formatPriceDe(cents)} netto${period})`;
    })
    .join(", ");
}

export function buildOperatorSubscriptionAnswerDe() {
  return (
    "Subscriptions: In der Übersicht werden Warnungen für ablaufende Trials (<7 Tage) und Abos angezeigt. " +
    "Im User-Detail sind alle Abo-Infos sichtbar: Typ, Start, Ablauf, Kinderlimit, Purchase-Token. " +
    `SKUs (netto, zzgl. MwSt.): ${buildSubscriptionSkuSummaryDe()}.`
  );
}

register("pricingLookup", {
  B2C_SKU_NET_CENTS,
  B2C_SKU_BILLING_PERIOD,
  formatPriceDe,
  monthlyRevenueCents,
  monthlyRevenueEur,
  buildSubscriptionSkuSummaryDe,
  buildOperatorSubscriptionAnswerDe,
});
