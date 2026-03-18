/**
 * Legal Policy and Consent Cloud Functions.
 * Provides country/locale policy delivery, versioned consent recording,
 * and re-consent enforcement for major legal changes.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, requireAdmin } from "./shared";

type PolicyType = "terms" | "privacy";

interface EffectivePolicy {
  policyType: PolicyType;
  country: string;
  locale: string;
  version: string;
  effectiveAt: admin.firestore.Timestamp;
  isMajorChange: boolean;
  contentUrl: string;
}

const LEGAL_POLICIES_COLLECTION = "legalPolicies";
const LEGAL_CONSENTS_COLLECTION = "masterLegalConsents";
const DEFAULT_POLICY_VERSION = "2026.03.18-1";
const DEFAULT_POLICY_BASE_URL = process.env.LEGAL_POLICY_BASE_URL || "https://minimaster.app/legal";

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
  };
}

async function findActivePolicy(policyType: PolicyType, country: string, locale: string): Promise<EffectivePolicy> {
  const language = locale.split("-")[0].toLowerCase();
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
      const policy = mapPolicyDoc(snap.docs[0]);
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
    const policy = mapPolicyDoc(globalSnap.docs[0]);
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
    requireAuth(context);
    const country = normalizeCountry(data?.country);
    const locale = normalizeLocale(data?.locale);

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
    const masterImei = requireAuth(context);
    const country = normalizeCountry(data?.country);
    const locale = normalizeLocale(data?.locale);

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
    const masterImei = requireAuth(context);
    const country = normalizeCountry(data?.country);
    const locale = normalizeLocale(data?.locale);

    const termsVersion = typeof data?.termsVersion === "string" ? data.termsVersion : "";
    const privacyVersion = typeof data?.privacyVersion === "string" ? data.privacyVersion : "";
    if (!termsVersion || !privacyVersion) {
      throw new functions.https.HttpsError("invalid-argument", "termsVersion and privacyVersion are required.");
    }

    const consentSource = typeof data?.consentSource === "string" && data.consentSource.length > 0
      ? data.consentSource
      : "master_app";
    const appVersion = typeof data?.appVersion === "string" && data.appVersion.length > 0
      ? data.appVersion
      : "unknown";

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
      userRole: context.auth?.token?.role || "master",
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
    requireAdmin(context);

    const policyType = normalizePolicyType(data?.policyType);
    const country = normalizeCountry(data?.country);
    const locale = normalizeLocale(data?.locale);
    const version = typeof data?.version === "string" && data.version.length > 0 ? data.version : "";
    const contentUrl = typeof data?.contentUrl === "string" && data.contentUrl.length > 0 ? data.contentUrl : "";
    const status = data?.status || "active";

    if (!version) {
      throw new functions.https.HttpsError("invalid-argument", "version is required.");
    }
    if (!contentUrl) {
      throw new functions.https.HttpsError("invalid-argument", "contentUrl is required.");
    }

    const effectiveAt = data?.effectiveAt instanceof admin.firestore.Timestamp
      ? data.effectiveAt
      : admin.firestore.Timestamp.now();
    const isMajorChange = data?.isMajorChange === true;

    const safeLocale = locale.replace(/[^A-Za-z0-9-]/g, "-");
    const safeVersion = version.replace(/[^A-Za-z0-9._-]/g, "-");
    const docId = `${policyType}_${country}_${safeLocale}_${safeVersion}`;

    await db().collection(LEGAL_POLICIES_COLLECTION).doc(docId).set({
      policyType,
      country,
      locale,
      version,
      effectiveAt,
      isMajorChange,
      contentUrl,
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
    };
  }
);

export const markLegalReconsentRequired = functions.https.onCall(
  async (data: { country: string; locale: string; masterImei?: string }, context: CallableContext) => {
    requireAdmin(context);

    const country = normalizeCountry(data?.country);
    const locale = normalizeLocale(data?.locale);
    const targetMaster = typeof data?.masterImei === "string" && data.masterImei.length > 0
      ? data.masterImei
      : null;

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
