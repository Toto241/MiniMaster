/**
 * Legal Policy and Consent Cloud Functions.
 * Provides country/locale policy delivery, versioned consent recording,
 * and re-consent enforcement for major legal changes.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { db } from "../firebase";
import { requireAuth, requireAdmin, validateAppCheck, getTracedLogger } from "./shared";

type PolicyType = "terms" | "privacy";

interface EffectivePolicy {
  policyType: PolicyType;
  country: string;
  locale: string;
  version: string;
  effectiveAt: admin.firestore.Timestamp;
  isMajorChange: boolean;
  contentUrl: string;
  checksum?: string;
}

const LEGAL_POLICIES_COLLECTION = "legalPolicies";
const LEGAL_CONSENTS_COLLECTION = "masterLegalConsents";
const DEFAULT_POLICY_VERSION = "2026.03.18-1";
const DEFAULT_POLICY_BASE_URL = process.env.LEGAL_POLICY_BASE_URL || "https://minimaster.app/legal";

type LegalCountryLocaleInput = { country?: unknown; locale?: unknown } | undefined;
type RecordConsentInput = {
  termsVersion?: unknown;
  privacyVersion?: unknown;
  consentSource?: unknown;
  appVersion?: unknown;
} | undefined;
type PublishPolicyInput = {
  policyType?: unknown;
  country?: unknown;
  locale?: unknown;
  version?: unknown;
  contentUrl?: unknown;
  effectiveAt?: unknown;
  isMajorChange?: unknown;
  status?: unknown;
} | undefined;

function parseCountryLocaleInput(input: LegalCountryLocaleInput): { country: string; locale: string } {
  return {
    country: normalizeCountry(input?.country),
    locale: normalizeLocale(input?.locale),
  };
}

function parseRecordConsentInput(input: RecordConsentInput): {
  termsVersion: string;
  privacyVersion: string;
  consentSource: string;
  appVersion: string;
} {
  const termsVersion = typeof input?.termsVersion === "string" ? input.termsVersion : "";
  const privacyVersion = typeof input?.privacyVersion === "string" ? input.privacyVersion : "";
  const consentSource = typeof input?.consentSource === "string" && input.consentSource.length > 0
    ? input.consentSource
    : "master_app";
  const appVersion = typeof input?.appVersion === "string" && input.appVersion.length > 0
    ? input.appVersion
    : "unknown";

  return { termsVersion, privacyVersion, consentSource, appVersion };
}

function parsePublishPolicyInput(input: PublishPolicyInput): {
  policyType: PolicyType;
  country: string;
  locale: string;
  version: string;
  contentUrl: string;
  status: "draft" | "approved" | "active" | "retired";
  effectiveAt: admin.firestore.Timestamp;
  isMajorChange: boolean;
} {
  const policyType = normalizePolicyType(input?.policyType);
  const { country, locale } = parseCountryLocaleInput(input);
  const version = typeof input?.version === "string" && input.version.length > 0 ? input.version : "";
  const contentUrl = typeof input?.contentUrl === "string" && input.contentUrl.length > 0 ? input.contentUrl : "";
  const status = (input?.status as "draft" | "approved" | "active" | "retired" | undefined) || "active";
  const effectiveAt = input?.effectiveAt instanceof admin.firestore.Timestamp
    ? input.effectiveAt
    : admin.firestore.Timestamp.now();
  const isMajorChange = input?.isMajorChange === true;

  return { policyType, country, locale, version, contentUrl, status, effectiveAt, isMajorChange };
}

function resolveAuditRole(context: CallableContext): string {
  return context.auth?.token?.role || "master";
}

function resolveTargetMaster(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function normalizeCountry(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length !== 2) {
    throw new functions.https.HttpsError("invalid-argument", "country must be a valid 2-letter ISO code.");
  }
  return raw.trim().toUpperCase();
}

function normalizeLocale(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "locale must be a valid BCP-47 language tag.");
  }
  const value = raw.trim();
  if (!/^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$/.test(value)) {
    throw new functions.https.HttpsError("invalid-argument", "locale must be a valid BCP-47 language tag.");
  }
  return value.replace("_", "-");
}

function normalizePolicyType(raw: unknown): PolicyType {
  if (raw !== "terms" && raw !== "privacy") {
    throw new functions.https.HttpsError("invalid-argument", "policyType must be either 'terms' or 'privacy'.");
  }
  return raw;
}

function buildDefaultPolicy(policyType: PolicyType, country: string, locale: string): EffectivePolicy {
  return {
    policyType,
    country,
    locale,
    version: DEFAULT_POLICY_VERSION,
    effectiveAt: admin.firestore.Timestamp.now(),
    isMajorChange: true,
    contentUrl: `${DEFAULT_POLICY_BASE_URL}/${country}/${locale}/${policyType}`,
  };
}

function mapPolicyDoc(doc: admin.firestore.DocumentSnapshot): EffectivePolicy | null {
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;

  const policyType = data.policyType;
  const country = data.country;
  const locale = data.locale;
  const version = data.version;
  const contentUrl = data.contentUrl;

  if ((policyType !== "terms" && policyType !== "privacy") || typeof country !== "string" || typeof locale !== "string" || typeof version !== "string" || typeof contentUrl !== "string") {
    return null;
  }

  const effectiveAt = data.effectiveAt instanceof admin.firestore.Timestamp
    ? data.effectiveAt
    : admin.firestore.Timestamp.now();

  return {
    policyType,
    country,
    locale,
    version,
    effectiveAt,
    isMajorChange: Boolean(data.isMajorChange),
    contentUrl,
    ...(typeof data.checksum === "string" ? { checksum: data.checksum } : {}),
  };
}

async function findActivePolicy(policyType: PolicyType, country: string, locale: string): Promise<EffectivePolicy> {
  const language = locale.split("-")[0]!.toLowerCase();
  const normalizedLocale = locale;
  const localeCandidates = [
    normalizedLocale,
    `${language}-${country}`,
    language,
    "en-US",
  ];

  for (const candidateLocale of localeCandidates) {
    const snap = await db().collection(LEGAL_POLICIES_COLLECTION)
      .where("policyType", "==", policyType)
      .where("country", "==", country)
      .where("locale", "==", candidateLocale)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (!snap.empty) {
      const policy = mapPolicyDoc(snap.docs[0]!);
      if (policy) return policy;
    }
  }

  const globalSnap = await db().collection(LEGAL_POLICIES_COLLECTION)
    .where("policyType", "==", policyType)
    .where("country", "==", "GLOBAL")
    .where("locale", "==", "en-US")
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (!globalSnap.empty) {
    const policy = mapPolicyDoc(globalSnap.docs[0]!);
    if (policy) return policy;
  }

  return buildDefaultPolicy(policyType, country, locale);
}

async function getEffectivePolicies(country: string, locale: string): Promise<{ terms: EffectivePolicy; privacy: EffectivePolicy }> {
  const [terms, privacy] = await Promise.all([
    findActivePolicy("terms", country, locale),
    findActivePolicy("privacy", country, locale),
  ]);
  return { terms, privacy };
}

function buildConsentDocId(masterImei: string, country: string, locale: string): string {
  return `${masterImei}_${country}_${locale}`;
}

export const getActiveLegalPolicies = functions.https.onCall(
  async (data: { country: string; locale: string }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "getActiveLegalPolicies");
    void logger; void traceId;
    requireAuth(context);
    validateAppCheck(context, true);
    const { country, locale } = parseCountryLocaleInput(data);

    const policies = await getEffectivePolicies(country, locale);
    return {
      country,
      locale,
      terms: {
        version: policies.terms.version,
        contentUrl: policies.terms.contentUrl,
        isMajorChange: policies.terms.isMajorChange,
        effectiveAt: policies.terms.effectiveAt,
      },
      privacy: {
        version: policies.privacy.version,
        contentUrl: policies.privacy.contentUrl,
        isMajorChange: policies.privacy.isMajorChange,
        effectiveAt: policies.privacy.effectiveAt,
      },
    };
  }
);

export const needsLegalReconsent = functions.https.onCall(
  async (data: { country: string; locale: string }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "needsLegalReconsent");
    void logger; void traceId;
    const masterImei = requireAuth(context);
    validateAppCheck(context, true);
    const { country, locale } = parseCountryLocaleInput(data);

    const policies = await getEffectivePolicies(country, locale);
    const consentRef = db().collection(LEGAL_CONSENTS_COLLECTION).doc(buildConsentDocId(masterImei, country, locale));
    const consentSnap = await consentRef.get();

    if (!consentSnap.exists) {
      return {
        requiresReconsent: true,
        reason: "missing_consent",
        country,
        locale,
        terms: {
          version: policies.terms.version,
          contentUrl: policies.terms.contentUrl,
          isMajorChange: policies.terms.isMajorChange,
        },
        privacy: {
          version: policies.privacy.version,
          contentUrl: policies.privacy.contentUrl,
          isMajorChange: policies.privacy.isMajorChange,
        },
      };
    }

    const consentData = consentSnap.data() || {};
    const acceptedTermsVersion = typeof consentData.acceptedTermsVersion === "string" ? consentData.acceptedTermsVersion : "";
    const acceptedPrivacyVersion = typeof consentData.acceptedPrivacyVersion === "string" ? consentData.acceptedPrivacyVersion : "";
    const requiresReconsentFlag = consentData.requiresReconsent === true;

    const requiresReconsent =
      requiresReconsentFlag ||
      acceptedTermsVersion !== policies.terms.version ||
      acceptedPrivacyVersion !== policies.privacy.version;

    return {
      requiresReconsent,
      reason: requiresReconsent ? "version_or_policy_change" : "up_to_date",
      country,
      locale,
      terms: {
        version: policies.terms.version,
        contentUrl: policies.terms.contentUrl,
        isMajorChange: policies.terms.isMajorChange,
      },
      privacy: {
        version: policies.privacy.version,
        contentUrl: policies.privacy.contentUrl,
        isMajorChange: policies.privacy.isMajorChange,
      },
      acceptedTermsVersion,
      acceptedPrivacyVersion,
    };
  }
);

export const recordLegalConsent = functions.https.onCall(
  async (data: {
    country: string;
    locale: string;
    termsVersion: string;
    privacyVersion: string;
    consentSource?: string;
    appVersion?: string;
  }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "recordLegalConsent");
    void logger; void traceId;
    const masterImei = requireAuth(context);
    validateAppCheck(context, true);
    const { country, locale } = parseCountryLocaleInput(data);
    const { termsVersion, privacyVersion, consentSource, appVersion } = parseRecordConsentInput(data);
    if (!termsVersion || !privacyVersion) {
      throw new functions.https.HttpsError("invalid-argument", "termsVersion and privacyVersion are required.");
    }

    const policies = await getEffectivePolicies(country, locale);
    if (policies.terms.version !== termsVersion || policies.privacy.version !== privacyVersion) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Consent versions do not match currently active legal policy versions."
      );
    }

    const consentRef = db().collection(LEGAL_CONSENTS_COLLECTION).doc(buildConsentDocId(masterImei, country, locale));
    await consentRef.set({
      masterImei,
      country,
      locale,
      acceptedTermsVersion: termsVersion,
      acceptedPrivacyVersion: privacyVersion,
      termsAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      privacyAcceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      consentSource,
      appVersion,
      requiresReconsent: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db().collection("audit_logs").add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: masterImei,
      userRole: resolveAuditRole(context),
      action: "legal.consent_recorded",
      resource: `masterLegalConsents/${buildConsentDocId(masterImei, country, locale)}`,
      resourceType: "user",
      status: "success",
      metadata: {
        country,
        locale,
        termsVersion,
        privacyVersion,
        consentSource,
        appVersion,
      },
    });

    return {
      success: true,
      country,
      locale,
      termsVersion,
      privacyVersion,
    };
  }
);

export const publishLegalPolicy = functions.https.onCall(
  async (data: {
    policyType: PolicyType;
    country: string;
    locale: string;
    version: string;
    contentUrl: string;
    effectiveAt?: unknown;
    isMajorChange?: boolean;
    status?: "draft" | "approved" | "active" | "retired";
  }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "publishLegalPolicy");
    void logger; void traceId;
    requireAdmin(context);
    validateAppCheck(context, true);
    const { policyType, country, locale, version, contentUrl, status, effectiveAt, isMajorChange } = parsePublishPolicyInput(data);

    if (!version) {
      throw new functions.https.HttpsError("invalid-argument", "version is required.");
    }
    if (!contentUrl) {
      throw new functions.https.HttpsError("invalid-argument", "contentUrl is required.");
    }

    const safeLocale = locale.replace(/[^A-Za-z0-9-]/g, "-");
    const safeVersion = version.replace(/[^A-Za-z0-9._-]/g, "-");
    const docId = `${policyType}_${country}_${safeLocale}_${safeVersion}`;

    const checksum = crypto.createHash("sha256")
      .update(`${policyType}:${country}:${locale}:${version}:${contentUrl}`)
      .digest("hex");

    await db().collection(LEGAL_POLICIES_COLLECTION).doc(docId).set({
      policyType,
      country,
      locale,
      version,
      effectiveAt,
      isMajorChange,
      contentUrl,
      checksum,
      status,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      publishedBy: context.auth?.uid || "unknown",
    }, { merge: true });

    return {
      success: true,
      policyId: docId,
      policyType,
      country,
      locale,
      version,
      status,
      checksum,
    };
  }
);

export const markLegalReconsentRequired = functions.https.onCall(
  async (data: { country: string; locale: string; masterImei?: string }, context: CallableContext) => {
    const { logger, traceId } = getTracedLogger(context, "markLegalReconsentRequired");
    void logger; void traceId;
    requireAdmin(context);
    validateAppCheck(context, true);
    const { country, locale } = parseCountryLocaleInput(data);
    const targetMaster = resolveTargetMaster(data?.masterImei);

    if (targetMaster) {
      const targetRef = db().collection(LEGAL_CONSENTS_COLLECTION).doc(buildConsentDocId(targetMaster, country, locale));
      await targetRef.set({
        requiresReconsent: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return { success: true, updatedCount: 1, scope: "single_master" };
    }

    const snapshot = await db().collection(LEGAL_CONSENTS_COLLECTION)
      .where("country", "==", country)
      .where("locale", "==", locale)
      .get();

    const batch = db().batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        requiresReconsent: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    return { success: true, updatedCount: snapshot.size, scope: "country_locale" };
  }
);

export const __legalTestables = {
  normalizeCountry,
  normalizeLocale,
  normalizePolicyType,
  buildDefaultPolicy,
  mapPolicyDoc,
  parseCountryLocaleInput,
  parseRecordConsentInput,
  parsePublishPolicyInput,
  resolveAuditRole,
  resolveTargetMaster,
  buildConsentDocId,
};
