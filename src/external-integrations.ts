/**
 * External Integrations Cockpit — Cloud Functions.
 *
 * Lets the operator capture data that comes from outside the repository
 * (Apple Developer Portal, Google Play Console, GCP Secret Manager, OEM
 * hardware test results) directly via the admin-panel, without ever
 * touching the Cloud Functions code.
 *
 * Stored in `operatorConfig/externalIntegrations` as a single document.
 * Sensitive material (API keys, service-account JSON) is NEVER persisted in
 * cleartext — only Secret-Manager path references and presence flags are
 * stored. The actual secret values must already exist in Google Secret
 * Manager and are mounted into Cloud Functions via runtime configuration.
 *
 * Permissions:
 *   - read:  admin or auditor
 *   - write: admin only
 *
 * All writes are audit-logged via `AuditLogger`.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import {
  requireAdmin,
  requireAuditorOrAbove,
  validateAppCheck,
  AuditLogger,
} from "./shared";

const EXTERNAL_INTEGRATIONS_DOC = "operatorConfig/externalIntegrations";

// ==================== TYPES ====================

export type IntegrationCategory = "apple" | "play" | "secrets" | "oem" | "release";

export interface OemValidationRow {
  deviceModel: string;
  osVersion: string;
  testedAt: string | null;
  signoffBy: string | null;
  status: "pending" | "passed" | "failed";
  notes: string | null;
}

export interface ExternalIntegrationsConfig {
  apple: {
    developerTeamId: string | null;
    parentBundleId: string | null;
    childBundleId: string | null;
    appStoreConnectKeySecretPath: string | null;
    provisioningProfilesReady: boolean;
  };
  play: {
    parentPackageId: string | null;
    childPackageId: string | null;
    serviceAccountSecretPath: string | null;
    rtdnTopicName: string | null;
    iapContractsSigned: boolean;
  };
  secrets: {
    geminiApiKeyPath: string | null;
    fcmServerKeyPath: string | null;
    recaptchaV3SiteKey: string | null;
    playIntegrityKeyPath: string | null;
    deviceCheckKeyPath: string | null;
  };
  oem: {
    matrix: OemValidationRow[];
  };
  release: {
    playDataSafetyComplete: boolean;
    playIarcRatingComplete: boolean;
    playStoreListingComplete: boolean;
    appleAppPrivacyComplete: boolean;
    appleScreenshotsComplete: boolean;
    legalTextsPublished: boolean;
  };
  meta: {
    lastUpdatedAt: string | null;
    lastUpdatedBy: string | null;
  };
}

// ==================== VALIDATION HELPERS ====================

const APPLE_TEAM_ID_RE = /^[A-Z0-9]{10}$/;
const BUNDLE_ID_RE = /^[a-zA-Z0-9.-]{3,155}$/;
const RTDN_TOPIC_RE = /^[a-zA-Z][a-zA-Z0-9_.~+%-]{2,254}$/;
const SECRET_MANAGER_PATH_RE =
  /^projects\/[^/]+\/secrets\/[A-Za-z0-9_-]{1,255}\/versions\/(latest|\d+)$/;

export function validateAppleTeamId(value: string): { ok: boolean; reason?: string } {
  if (typeof value !== "string") return { ok: false, reason: "Apple Team ID must be a string." };
  const v = value.trim();
  if (v.length === 0) return { ok: true }; // empty allowed for clearing
  if (!APPLE_TEAM_ID_RE.test(v)) {
    return { ok: false, reason: "Apple Team ID must be exactly 10 uppercase alphanumeric characters." };
  }
  return { ok: true };
}

export function validateBundleId(value: string, label = "Bundle ID"): { ok: boolean; reason?: string } {
  if (typeof value !== "string") return { ok: false, reason: `${label} must be a string.` };
  const v = value.trim();
  if (v.length === 0) return { ok: true };
  if (!BUNDLE_ID_RE.test(v) || !v.includes(".")) {
    return { ok: false, reason: `${label} must be reverse-DNS (e.g., com.example.app).` };
  }
  return { ok: true };
}

export function validateRtdnTopic(value: string): { ok: boolean; reason?: string } {
  if (typeof value !== "string") return { ok: false, reason: "RTDN topic must be a string." };
  const v = value.trim();
  if (v.length === 0) return { ok: true };
  if (!RTDN_TOPIC_RE.test(v)) {
    return {
      ok: false,
      reason: "RTDN topic must be 3–255 chars, start with a letter, and use [A-Za-z0-9_.~+%-].",
    };
  }
  return { ok: true };
}

export function validateSecretManagerPath(
  value: string,
  label = "Secret Manager path"
): { ok: boolean; reason?: string } {
  if (typeof value !== "string") return { ok: false, reason: `${label} must be a string.` };
  const v = value.trim();
  if (v.length === 0) return { ok: true };
  if (!SECRET_MANAGER_PATH_RE.test(v)) {
    return {
      ok: false,
      reason:
        `${label} must look like 'projects/<project>/secrets/<name>/versions/<latest|N>'. ` +
        "Never paste raw secret values — only references.",
    };
  }
  return { ok: true };
}

const FORBIDDEN_CLEARTEXT_PREFIXES = [
  "AIza", // Firebase / Google API keys
  "sk-",  // generic secret-style prefixes
  "ya29.", // OAuth tokens
  "-----BEGIN",
];

export function looksLikeCleartextSecret(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (SECRET_MANAGER_PATH_RE.test(trimmed)) return false;
  for (const prefix of FORBIDDEN_CLEARTEXT_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true;
  }
  // Long, opaque blobs without slashes/dots → likely a raw secret
  if (trimmed.length > 80 && !trimmed.includes("/") && !trimmed.includes(" ")) return true;
  return false;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function validateIsoDate(value: string): { ok: boolean; normalized: string | null } {
  if (typeof value !== "string") return { ok: false, normalized: null };
  const v = value.trim();
  if (v.length === 0) return { ok: true, normalized: null };
  if (!ISO_DATE_RE.test(v)) return { ok: false, normalized: null };
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return { ok: false, normalized: null };
  return { ok: true, normalized: v };
}

function validateOemRow(row: unknown): { ok: boolean; reason?: string; sanitized?: OemValidationRow } {
  if (!row || typeof row !== "object") return { ok: false, reason: "OEM row must be an object." };
  const r = row as Record<string, unknown>;
  const deviceModel = typeof r.deviceModel === "string" ? r.deviceModel.trim().slice(0, 80) : "";
  const osVersion = typeof r.osVersion === "string" ? r.osVersion.trim().slice(0, 40) : "";
  if (!deviceModel || !osVersion) {
    return { ok: false, reason: "Each OEM row needs deviceModel and osVersion." };
  }
  const status = r.status === "passed" || r.status === "failed" ? r.status : "pending";
  let testedAt: string | null = null;
  if (r.testedAt !== null && r.testedAt !== undefined && r.testedAt !== "") {
    const dateCheck = validateIsoDate(typeof r.testedAt === "string" ? r.testedAt : "");
    if (!dateCheck.ok) {
      return {
        ok: false,
        reason: `Row "${deviceModel}": testedAt must be ISO date (YYYY-MM-DD or full ISO 8601).`,
      };
    }
    testedAt = dateCheck.normalized;
  }
  const signoffBy = typeof r.signoffBy === "string" ? r.signoffBy.trim().slice(0, 80) : null;
  const notes = typeof r.notes === "string" ? r.notes.slice(0, 500) : null;
  return {
    ok: true,
    sanitized: { deviceModel, osVersion, testedAt, signoffBy, status, notes },
  };
}

// ==================== DEFAULT / READ ====================

function defaultConfig(): ExternalIntegrationsConfig {
  return {
    apple: {
      developerTeamId: null,
      parentBundleId: null,
      childBundleId: null,
      appStoreConnectKeySecretPath: null,
      provisioningProfilesReady: false,
    },
    play: {
      parentPackageId: null,
      childPackageId: null,
      serviceAccountSecretPath: null,
      rtdnTopicName: null,
      iapContractsSigned: false,
    },
    secrets: {
      geminiApiKeyPath: null,
      fcmServerKeyPath: null,
      recaptchaV3SiteKey: null,
      playIntegrityKeyPath: null,
      deviceCheckKeyPath: null,
    },
    oem: { matrix: [] },
    release: {
      playDataSafetyComplete: false,
      playIarcRatingComplete: false,
      playStoreListingComplete: false,
      appleAppPrivacyComplete: false,
      appleScreenshotsComplete: false,
      legalTextsPublished: false,
    },
    meta: { lastUpdatedAt: null, lastUpdatedBy: null },
  };
}

async function readConfig(): Promise<ExternalIntegrationsConfig> {
  try {
    const doc = await db().doc(EXTERNAL_INTEGRATIONS_DOC).get();
    if (!doc.exists) return defaultConfig();
    const raw = (doc.data() || {}) as Partial<ExternalIntegrationsConfig>;
    const base = defaultConfig();
    return {
      apple: { ...base.apple, ...(raw.apple || {}) },
      play: { ...base.play, ...(raw.play || {}) },
      secrets: { ...base.secrets, ...(raw.secrets || {}) },
      oem: { matrix: Array.isArray(raw.oem?.matrix) ? raw.oem.matrix : [] },
      release: { ...base.release, ...(raw.release || {}) },
      meta: { ...base.meta, ...(raw.meta || {}) },
    };
  } catch (err) {
    functions.logger.warn("readExternalIntegrationsConfig failed", err);
    return defaultConfig();
  }
}

// ==================== READINESS COMPUTATION ====================

export interface ReleaseReadinessReport {
  ready: boolean;
  blockers: string[];
  byCategory: Record<IntegrationCategory, { complete: number; total: number; missing: string[] }>;
  progressPct: number;
}

export function computeReleaseReadiness(cfg: ExternalIntegrationsConfig): ReleaseReadinessReport {
  const blockers: string[] = [];
  const byCategory: ReleaseReadinessReport["byCategory"] = {
    apple: { complete: 0, total: 0, missing: [] },
    play: { complete: 0, total: 0, missing: [] },
    secrets: { complete: 0, total: 0, missing: [] },
    oem: { complete: 0, total: 0, missing: [] },
    release: { complete: 0, total: 0, missing: [] },
  };

  const required: Array<[IntegrationCategory, string, boolean, string]> = [
    ["apple", "developerTeamId", !!cfg.apple.developerTeamId, "Apple Developer Team ID"],
    ["apple", "parentBundleId", !!cfg.apple.parentBundleId, "Apple Parent Bundle ID"],
    ["apple", "childBundleId", !!cfg.apple.childBundleId, "Apple Child Bundle ID"],
    ["apple", "appStoreConnectKey", !!cfg.apple.appStoreConnectKeySecretPath, "App Store Connect API Key"],
    ["apple", "provisioningProfilesReady", cfg.apple.provisioningProfilesReady, "Provisioning Profiles bestätigt"],
    ["play", "parentPackageId", !!cfg.play.parentPackageId, "Play Parent Package ID"],
    ["play", "childPackageId", !!cfg.play.childPackageId, "Play Child Package ID"],
    ["play", "serviceAccountSecretPath", !!cfg.play.serviceAccountSecretPath, "Play Service-Account-Pfad"],
    ["play", "rtdnTopicName", !!cfg.play.rtdnTopicName, "RTDN Pub/Sub Topic"],
    ["play", "iapContractsSigned", cfg.play.iapContractsSigned, "IAP-Verträge unterzeichnet"],
    ["secrets", "geminiApiKeyPath", !!cfg.secrets.geminiApiKeyPath, "Gemini API Key Pfad"],
    ["secrets", "fcmServerKeyPath", !!cfg.secrets.fcmServerKeyPath, "FCM Server Key Pfad"],
    ["release", "playDataSafetyComplete", cfg.release.playDataSafetyComplete, "Play Data Safety"],
    ["release", "playIarcRatingComplete", cfg.release.playIarcRatingComplete, "IARC Rating"],
    ["release", "playStoreListingComplete", cfg.release.playStoreListingComplete, "Play Store Listing"],
    ["release", "appleAppPrivacyComplete", cfg.release.appleAppPrivacyComplete, "Apple App Privacy"],
    ["release", "appleScreenshotsComplete", cfg.release.appleScreenshotsComplete, "Apple Screenshots"],
    ["release", "legalTextsPublished", cfg.release.legalTextsPublished, "Rechtstexte veröffentlicht"],
  ];

  for (const [cat, , done, label] of required) {
    byCategory[cat].total += 1;
    if (done) {
      byCategory[cat].complete += 1;
    } else {
      byCategory[cat].missing.push(label);
      blockers.push(`[${cat}] ${label} fehlt`);
    }
  }

  const passedOem = cfg.oem.matrix.filter((r) => r.status === "passed").length;
  byCategory.oem.total = Math.max(cfg.oem.matrix.length, 1);
  byCategory.oem.complete = passedOem;
  if (passedOem < 1) {
    byCategory.oem.missing.push("Mindestens 1 erfolgreich getestetes OEM-Gerät");
    blockers.push("[oem] Keine OEM-Hardware-Validierung mit Status 'passed'");
  }

  const total = Object.values(byCategory).reduce((s, c) => s + c.total, 0);
  const complete = Object.values(byCategory).reduce((s, c) => s + c.complete, 0);
  const progressPct = total === 0 ? 0 : Math.round((complete / total) * 100);

  return { ready: blockers.length === 0, blockers, byCategory, progressPct };
}

// ==================== CALLABLE: GET ====================

/**
 * Read external-integrations config + computed readiness. Auditor or admin.
 */
export const getExternalIntegrationsConfig = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    requireAuditorOrAbove(context);
    validateAppCheck(context, true);
    const cfg = await readConfig();
    const readiness = computeReleaseReadiness(cfg);
    return { config: cfg, readiness };
  }
);

// ==================== SHARED WRITE HELPER ====================

/**
 * Deep-merges a single `<category>.<field>` value into the external-integrations
 * document and stamps `meta`. Shared by `patchExternalIntegrationsField` and the
 * secret-onboarding endpoint so both write through ONE consistent, audited path.
 *
 * Note: `set({ merge: true })` does NOT interpret dot-notation in keys — they
 * would be persisted as literal field names. A nested structure is built so the
 * deep-merge semantics apply correctly.
 */
export async function writeIntegrationField(
  category: IntegrationCategory,
  field: string,
  value: unknown,
  adminUid: string
): Promise<void> {
  const update: Record<string, unknown> = {
    [category]: { [field]: value },
    meta: {
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: adminUid,
    },
  };
  await db().doc(EXTERNAL_INTEGRATIONS_DOC).set(update, { merge: true });
}

// ==================== CALLABLE: PATCH ====================

interface PatchPayload {
  category: IntegrationCategory;
  field: string;
  value: unknown;
}

function validatePatch(payload: PatchPayload): { ok: boolean; reason?: string } {
  const { category, field, value } = payload;
  if (!category || !field) return { ok: false, reason: "category and field are required." };

  if (category === "apple") {
    if (field === "developerTeamId") {
      return validateAppleTeamId(String(value || ""));
    }
    if (field === "parentBundleId" || field === "childBundleId") {
      return validateBundleId(String(value || ""), field);
    }
    if (field === "appStoreConnectKeySecretPath") {
      if (typeof value === "string" && looksLikeCleartextSecret(value)) {
        return { ok: false, reason: "Refusing cleartext secret. Use Secret Manager path only." };
      }
      return validateSecretManagerPath(String(value || ""), field);
    }
    if (field === "provisioningProfilesReady") {
      return typeof value === "boolean" ? { ok: true } : { ok: false, reason: "Boolean required." };
    }
  }

  if (category === "play") {
    if (field === "parentPackageId" || field === "childPackageId") {
      return validateBundleId(String(value || ""), field);
    }
    if (field === "rtdnTopicName") {
      return validateRtdnTopic(String(value || ""));
    }
    if (field === "serviceAccountSecretPath") {
      if (typeof value === "string" && looksLikeCleartextSecret(value)) {
        return { ok: false, reason: "Refusing cleartext secret. Use Secret Manager path only." };
      }
      return validateSecretManagerPath(String(value || ""), field);
    }
    if (field === "iapContractsSigned") {
      return typeof value === "boolean" ? { ok: true } : { ok: false, reason: "Boolean required." };
    }
  }

  if (category === "secrets") {
    const isPathField = field === "geminiApiKeyPath"
      || field === "fcmServerKeyPath"
      || field === "playIntegrityKeyPath"
      || field === "deviceCheckKeyPath";
    if (isPathField) {
      if (typeof value === "string" && looksLikeCleartextSecret(value)) {
        return { ok: false, reason: "Refusing cleartext secret. Use Secret Manager path only." };
      }
      return validateSecretManagerPath(String(value || ""), field);
    }
    if (field === "recaptchaV3SiteKey") {
      const v = String(value || "").trim();
      if (v.length > 100) return { ok: false, reason: "Site key too long." };
      return { ok: true };
    }
  }

  if (category === "release") {
    return typeof value === "boolean" ? { ok: true } : { ok: false, reason: "Boolean required." };
  }

  return { ok: false, reason: `Unknown category/field: ${category}/${field}` };
}

/**
 * Patch one field of the external-integrations config. Admin-only.
 */
export const patchExternalIntegrationsField = functions.https.onCall(
  async (data: PatchPayload, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    if (!data || typeof data !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "Payload required.");
    }
    const valid = validatePatch(data);
    if (!valid.ok) {
      throw new functions.https.HttpsError("invalid-argument", valid.reason || "Invalid value.");
    }

    const adminUid = context.auth?.uid || "unknown-admin";
    const normalized = typeof data.value === "string"
      ? (data.value.trim() === "" ? null : data.value.trim())
      : data.value;

    await writeIntegrationField(data.category, data.field, normalized, adminUid);

    await AuditLogger.logSuccess(
      "operator.setup_checklist_update",
      context,
      EXTERNAL_INTEGRATIONS_DOC,
      "system",
      { category: data.category, field: data.field, hasValue: normalized !== null && normalized !== false }
    );

    return { ok: true, category: data.category, field: data.field };
  }
);

// ==================== CALLABLE: OEM MATRIX ====================

interface OemUpsertPayload {
  rows: unknown[];
}

/**
 * Replace the OEM validation matrix. Admin-only.
 *
 * Sends the entire matrix to keep the API simple — the matrix is bounded
 * (typically ≤ 30 devices) and the payload stays small.
 */
export const setOemValidationMatrix = functions.https.onCall(
  async (data: OemUpsertPayload, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    if (!data || !Array.isArray(data.rows)) {
      throw new functions.https.HttpsError("invalid-argument", "rows[] required.");
    }
    if (data.rows.length > 100) {
      throw new functions.https.HttpsError("invalid-argument", "OEM matrix capped at 100 rows.");
    }

    const sanitized: OemValidationRow[] = [];
    for (const row of data.rows) {
      const r = validateOemRow(row);
      if (!r.ok) throw new functions.https.HttpsError("invalid-argument", r.reason!);
      sanitized.push(r.sanitized!);
    }

    const adminUid = context.auth?.uid || "unknown-admin";
    await db().doc(EXTERNAL_INTEGRATIONS_DOC).set(
      {
        oem: { matrix: sanitized },
        meta: {
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedBy: adminUid,
        },
      },
      { merge: true }
    );

    await AuditLogger.logSuccess(
      "operator.setup_checklist_update",
      context,
      EXTERNAL_INTEGRATIONS_DOC,
      "system",
      { area: "oem", rowCount: sanitized.length }
    );

    return { ok: true, rowCount: sanitized.length };
  }
);

// ==================== CALLABLE: READINESS ====================

/**
 * Aggregated release-readiness report (gates iOS build / Play release).
 * Auditor or admin.
 */
export const getReleaseReadinessStatus = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    requireAuditorOrAbove(context);
    validateAppCheck(context, true);
    const cfg = await readConfig();
    return computeReleaseReadiness(cfg);
  }
);
