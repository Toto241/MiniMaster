/**
 * Wizard-Progress Cloud Functions.
 *
 * A small, generic progress tracker shared by ALL setup/configuration wizards
 * (operator full-setup, Firebase bootstrap, parent onboarding, child pairing,
 * pricing/integrations/backup config). It lets a wizard persist the current
 * step, completed steps, a small bag of non-secret answers and a status so the
 * user can resume where they left off — across devices and reloads.
 *
 * Storage: one document per user at `wizardProgress/{uid}` whose `wizards`
 * map holds an entry per wizardId. Scoped to the authenticated caller, so an
 * operator and a parent each see only their own progress. The whole collection
 * is removed by `purgeAllProjectData` like any other.
 *
 * SECURITY: only non-secret progress data is stored here. The payload is size
 * capped and never trusted for authorization — wizards still call their real,
 * individually-gated backend functions to perform actions.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, validateAppCheck, AuditLogger } from "./shared";

/** Canonical list of known wizards. Unknown ids are rejected. */
export const WIZARD_IDS = [
  "setup-complete",
  "firebase-setup",
  "parent-onboarding",
  "child-pairing",
  "config-pricing",
  "config-integrations",
  "config-backup-reset",
] as const;
export type WizardId = (typeof WIZARD_IDS)[number];

export const WIZARD_STATUSES = ["not_started", "in_progress", "completed", "skipped"] as const;
export type WizardStatus = (typeof WIZARD_STATUSES)[number];

const WIZARD_PROGRESS_COLLECTION = "wizardProgress";
const MAX_STEP = 100;
const MAX_COMPLETED_STEPS = 200;
const MAX_DATA_BYTES = 8000;

interface WizardEntry {
  wizardId: WizardId;
  currentStep: number;
  completedSteps: number[];
  status: WizardStatus;
  data: Record<string, unknown>;
  updatedAt: string | null;
}

function isWizardId(value: unknown): value is WizardId {
  return typeof value === "string" && (WIZARD_IDS as readonly string[]).includes(value);
}

function emptyEntry(wizardId: WizardId): WizardEntry {
  return { wizardId, currentStep: 0, completedSteps: [], status: "not_started", data: {}, updatedAt: null };
}

function coerceTimestamp(value: unknown): string | null {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return typeof value === "string" ? value : null;
}

function normalizeEntry(wizardId: WizardId, raw: unknown): WizardEntry {
  if (!raw || typeof raw !== "object") return emptyEntry(wizardId);
  const v = raw as Partial<WizardEntry> & { completedSteps?: unknown };
  const currentStep = typeof v.currentStep === "number" && Number.isFinite(v.currentStep)
    ? Math.max(0, Math.min(MAX_STEP, Math.floor(v.currentStep)))
    : 0;
  const completedSteps = Array.isArray(v.completedSteps)
    ? Array.from(new Set(v.completedSteps.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).map((n) => Math.floor(n)))).slice(0, MAX_COMPLETED_STEPS)
    : [];
  const status: WizardStatus = (WIZARD_STATUSES as readonly string[]).includes(v.status as string)
    ? (v.status as WizardStatus)
    : "not_started";
  const data = v.data && typeof v.data === "object" && !Array.isArray(v.data) ? (v.data as Record<string, unknown>) : {};
  return { wizardId, currentStep, completedSteps, status, data, updatedAt: coerceTimestamp(v.updatedAt) };
}

/**
 * Returns the saved progress for one wizard (or a fresh empty entry).
 *
 * data: { wizardId: WizardId }
 */
export const getWizardProgress = functions.https.onCall(
  async (data: { wizardId?: string }, context: CallableContext) => {
    const uid = requireAuth(context);
    validateAppCheck(context, true);

    if (!isWizardId(data?.wizardId)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `wizardId must be one of: ${WIZARD_IDS.join(", ")}.`
      );
    }

    const doc = await db().collection(WIZARD_PROGRESS_COLLECTION).doc(uid).get();
    const wizards = (doc.exists ? (doc.data()?.wizards as Record<string, unknown>) : undefined) || {};
    return { wizardId: data.wizardId, progress: normalizeEntry(data.wizardId, wizards[data.wizardId]) };
  }
);

/**
 * Upserts the progress for one wizard. Only non-secret progress data is stored.
 *
 * data: {
 *   wizardId: WizardId,
 *   currentStep: number,
 *   completedSteps?: number[],
 *   status?: WizardStatus,
 *   data?: Record<string, unknown>,   // small, non-secret
 * }
 */
export const setWizardProgress = functions.https.onCall(
  async (
    data: {
      wizardId?: string;
      currentStep?: number;
      completedSteps?: number[];
      status?: string;
      data?: Record<string, unknown>;
    },
    context: CallableContext
  ) => {
    const uid = requireAuth(context);
    validateAppCheck(context, true);

    if (!isWizardId(data?.wizardId)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `wizardId must be one of: ${WIZARD_IDS.join(", ")}.`
      );
    }
    if (typeof data.currentStep !== "number" || !Number.isFinite(data.currentStep) || data.currentStep < 0 || data.currentStep > MAX_STEP) {
      throw new functions.https.HttpsError("invalid-argument", `currentStep must be a number between 0 and ${MAX_STEP}.`);
    }
    if (data.status !== undefined && !(WIZARD_STATUSES as readonly string[]).includes(data.status)) {
      throw new functions.https.HttpsError("invalid-argument", `status must be one of: ${WIZARD_STATUSES.join(", ")}.`);
    }

    let progressData: Record<string, unknown> = {};
    if (data.data !== undefined) {
      if (typeof data.data !== "object" || data.data === null || Array.isArray(data.data)) {
        throw new functions.https.HttpsError("invalid-argument", "data must be a plain object.");
      }
      const json = JSON.stringify(data.data);
      if (json.length > MAX_DATA_BYTES) {
        throw new functions.https.HttpsError("invalid-argument", `data exceeds ${MAX_DATA_BYTES} bytes.`);
      }
      progressData = data.data;
    }

    const completedSteps = Array.isArray(data.completedSteps)
      ? Array.from(new Set(
        data.completedSteps
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_STEP)
          .map((n) => Math.floor(n))
      )).slice(0, MAX_COMPLETED_STEPS)
      : [];

    const status: WizardStatus = (data.status as WizardStatus) || "in_progress";
    const entry = {
      wizardId: data.wizardId,
      currentStep: Math.floor(data.currentStep),
      completedSteps,
      status,
      data: progressData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db().collection(WIZARD_PROGRESS_COLLECTION).doc(uid).set(
      {
        wizards: { [data.wizardId]: entry },
        lastWizardId: data.wizardId,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await AuditLogger.logSuccess(
      "wizard.progress_update", context, `${WIZARD_PROGRESS_COLLECTION}/${uid}`, "system",
      { wizardId: data.wizardId, currentStep: entry.currentStep, status }
    );

    return { ok: true, wizardId: data.wizardId, currentStep: entry.currentStep, status };
  }
);

/**
 * Returns a compact overview of ALL wizards for the caller (used by the
 * Wizard-Hub to render status chips). Returns one summary per known wizard,
 * defaulting to "not_started" where no progress exists yet.
 */
export const listWizardProgress = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const uid = requireAuth(context);
    validateAppCheck(context, true);

    const doc = await db().collection(WIZARD_PROGRESS_COLLECTION).doc(uid).get();
    const wizards = (doc.exists ? (doc.data()?.wizards as Record<string, unknown>) : undefined) || {};

    const summaries = WIZARD_IDS.map((wizardId) => {
      const entry = normalizeEntry(wizardId, wizards[wizardId]);
      return {
        wizardId,
        status: entry.status,
        currentStep: entry.currentStep,
        completedCount: entry.completedSteps.length,
        updatedAt: entry.updatedAt,
      };
    });

    return { wizards: summaries };
  }
);
