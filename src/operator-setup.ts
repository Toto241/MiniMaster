/**
 * Operator-Setup ("Inbetriebnahme") Cloud Functions.
 *
 * Provides a single read-only status endpoint that aggregates everything an
 * operator needs to verify before going live, plus a small writable checklist
 * for manual external steps that cannot be detected automatically (e.g.,
 * Apple Developer enrollment, Play contract signed, legal texts published).
 *
 * Status fields are derived from environment variables, runtime config and
 * Firestore — never from request payloads — so an unauthenticated probe
 * cannot influence them.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db, storage } from "../firebase";
import { requireAdmin, validateAppCheck, AuditLogger } from "./shared";
import {
  getAdminRecoveryTokens,
  getAdminRecoveryTokenAgeDays,
  getAdminRecoveryTokenRotatedAt,
  ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS,
} from "./auth";

/**
 * Manual external checklist items that the operator must confirm by hand
 * (the backend cannot reliably detect them).  Stored in
 * `operatorConfig/setupChecklist` as `{ [itemId]: { done, doneAt, doneBy, note } }`.
 */
export const MANUAL_CHECKLIST_ITEMS: ReadonlyArray<{
  id: string;
  label: string;
  category: "google-play" | "apple" | "firebase" | "legal" | "ops" | "validation";
  required: boolean;
  hint: string;
}> = [
  { id: "play_developer_account", label: "Google Play Developer-Account aktiv & Vertrag akzeptiert", category: "google-play", required: true, hint: "https://play.google.com/console" },
  { id: "play_iap_skus_created", label: "In-App-Billing-Produkte angelegt (single_child_monthly, family_monthly, single_child_yearly, family_yearly)", category: "google-play", required: true, hint: "Play Console → Monetarisierung → Abos" },
  { id: "play_data_safety_form", label: "Data Safety Form ausgefüllt", category: "google-play", required: true, hint: "Play Console → App-Inhalte → Datensicherheit" },
  { id: "play_app_signing", label: "Play App Signing aktiviert", category: "google-play", required: true, hint: "Play Console → Setup → App-Signatur" },
  { id: "apple_developer_program", label: "Apple Developer Program aktiv", category: "apple", required: true, hint: "https://developer.apple.com/programs" },
  { id: "apple_app_ids_created", label: "App IDs für iosMasterApp + iosChildApp angelegt", category: "apple", required: true, hint: "App Store Connect" },
  { id: "apple_family_controls_entitlement", label: "Family Controls Entitlement bei Apple beantragt & genehmigt", category: "apple", required: true, hint: "Mehrere Wochen Apple-Approval einplanen" },
  { id: "apple_provisioning_profiles", label: "Distribution Certificate + Provisioning Profiles vorhanden", category: "apple", required: true, hint: "Xcode / App Store Connect" },
  { id: "apple_privacy_labels", label: "App Privacy Labels ausgefüllt", category: "apple", required: true, hint: "App Store Connect → App Privacy" },
  { id: "firebase_blaze_plan", label: "Firebase-Projekt auf Blaze-Plan (Pay-as-you-go)", category: "firebase", required: true, hint: "Pub/Sub-Trigger erfordern Blaze" },
  { id: "firebase_app_check_enforced", label: "App Check Enforcement in der Konsole auf 'Enforced' geschaltet", category: "firebase", required: true, hint: "Firebase Console → App Check → Enforce für Functions, Firestore, Storage" },
  { id: "firebase_backups_scheduled", label: "Firestore-Backup/-Export-Schedule eingerichtet", category: "firebase", required: true, hint: "gcloud firestore export per Cloud Scheduler" },
  { id: "legal_terms_published", label: "AGB veröffentlicht und im Onboarding verlinkt", category: "legal", required: true, hint: "" },
  { id: "legal_privacy_published", label: "Datenschutzerklärung (DSGVO) veröffentlicht", category: "legal", required: true, hint: "" },
  { id: "legal_imprint_published", label: "Impressum veröffentlicht", category: "legal", required: true, hint: "" },
  { id: "legal_dpa_signed", label: "Auftragsverarbeitungs-Vertrag (AVV) mit Google/Firebase geschlossen", category: "legal", required: true, hint: "https://cloud.google.com/terms/data-processing-addendum" },
  { id: "legal_dpia_completed", label: "Datenschutz-Folgenabschätzung (DSFA) Art. 35 DSGVO durchgeführt", category: "legal", required: true, hint: "Kindprodukt → DSFA verpflichtend" },
  { id: "ops_oncall_roster", label: "On-Call-Roster + Eskalations-Pfad dokumentiert", category: "ops", required: true, hint: "Siehe RUNBOOK.md" },
  { id: "ops_rollback_drill", label: "Rollback-Drill mind. 1× durchgeführt und protokolliert", category: "ops", required: true, hint: "" },
  { id: "ops_key_rotation_plan", label: "Schlüsselrotations-Plan operationalisiert (FCM, App-Check, SA-JSON)", category: "ops", required: true, hint: "Recovery-Token-Rotation ist automatisiert" },
  { id: "ops_pen_test", label: "Externer Penetrations-Test auf Cloud Functions + Admin-Panel durchgeführt", category: "validation", required: true, hint: "Mindestens 1× vor Public Release" },
  { id: "validation_oem_matrix", label: "OEM-Hardware-Matrix getestet (Samsung, Xiaomi, Huawei, Pixel)", category: "validation", required: true, hint: "DeviceAdmin/Accessibility-Verhalten unterscheidet sich pro OEM" },
  { id: "validation_ios_matrix", label: "iOS-Geräte-Matrix getestet (iOS 16/17/18, iPhone+iPad, Family Sharing)", category: "validation", required: true, hint: "" },
  { id: "validation_load_test", label: "Last-/Stress-Test der RTDN-Pipeline durchgeführt", category: "validation", required: false, hint: "Play Sandbox-Notifications" },
];

const SETUP_CHECKLIST_DOC = "operatorConfig/setupChecklist";

type ManualChecklistState = Record<
  string,
  { done: boolean; doneAt: string | null; doneBy: string | null; note: string | null }
>;

/**
 * Internal helper: read manual checklist state from Firestore.
 * Returns { itemId: { done, doneAt, doneBy, note } }.
 */
async function readManualChecklistState(): Promise<ManualChecklistState> {
  try {
    const doc = await db().doc(SETUP_CHECKLIST_DOC).get();
    if (!doc.exists) return {};
    const data = doc.data() || {};
    const items = (data as { items?: Record<string, unknown> }).items || {};
    const out: ManualChecklistState = {};
    for (const [id, raw] of Object.entries(items)) {
      const v = raw as { done?: unknown; doneAt?: unknown; doneBy?: unknown; note?: unknown };
      const doneAt = v.doneAt;
      out[id] = {
        done: v.done === true,
        doneAt: doneAt && typeof (doneAt as { toDate?: () => Date }).toDate === "function"
          ? (doneAt as { toDate: () => Date }).toDate().toISOString()
          : (typeof doneAt === "string" ? doneAt : null),
        doneBy: typeof v.doneBy === "string" ? v.doneBy : null,
        note: typeof v.note === "string" ? v.note : null,
      };
    }
    return out;
  } catch (err) {
    functions.logger.warn("readManualChecklistState failed", err);
    return {};
  }
}

/**
 * Aggregated read-only setup status. Admin-only.
 */
export const getOperatorSetupStatus = functions.runWith({
  secrets: ["GEMINI_API_KEY"],
}).https.onCall(async (_data: Record<string, never>, context: CallableContext) => {
  requireAdmin(context);
  validateAppCheck(context, true);

  const projectId = process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || (() => {
      try {
        const parsed = JSON.parse(process.env.FIREBASE_CONFIG || "{}") as { projectId?: unknown };
        return parsed.projectId || null;
      } catch { return null; }
    })();

  // ── Recovery Token ───────────────────────────────────────────────────────
  const recoveryTokens = getAdminRecoveryTokens();
  const recoveryTokenAgeDays = getAdminRecoveryTokenAgeDays();
  const recoveryTokenRotatedAt = getAdminRecoveryTokenRotatedAt();
  const recoveryTokenStatus = recoveryTokens.length === 0
    ? "missing"
    : (recoveryTokenAgeDays !== null && recoveryTokenAgeDays > ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS)
      ? "overdue"
      : "ok";

  // ── Secrets ──────────────────────────────────────────────────────────────
  const secrets = {
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    ADMIN_RECOVERY_TOKEN: recoveryTokens.length > 0,
    ADMIN_RECOVERY_TOKEN_ROTATED_AT: Boolean(recoveryTokenRotatedAt),
    ALLOWED_RESET_PROJECTS: Boolean(process.env.ALLOWED_RESET_PROJECTS),
    PLAY_BILLING_PUBSUB_TOPIC: Boolean(process.env.PLAY_BILLING_PUBSUB_TOPIC),
    GOOGLE_APPLICATION_CREDENTIALS: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
  };

  // ── Storage Bucket reachability ──────────────────────────────────────────
  let storageStatus: "ok" | "error" = "ok";
  let storageBucket: string | null = null;
  try {
    storageBucket = storage().bucket().name || null;
    await storage().bucket().getMetadata();
  } catch (err) {
    storageStatus = "error";
    functions.logger.warn("storage.getMetadata failed", err);
  }

  // ── Firestore reachability per critical collection ───────────────────────
  const firestoreChecks: Record<string, "ok" | "error"> = {};
  for (const coll of ["masters", "children", "supportTickets", "audit_logs", "operatorConfig"]) {
    try {
      await db().collection(coll).limit(1).get();
      firestoreChecks[coll] = "ok";
    } catch {
      firestoreChecks[coll] = "error";
    }
  }

  // ── RTDN topic ───────────────────────────────────────────────────────────
  const rtdn = {
    topic: process.env.PLAY_BILLING_PUBSUB_TOPIC || "play-billing-notifications",
    topicConfigured: Boolean(process.env.PLAY_BILLING_PUBSUB_TOPIC),
  };

  // ── Manual external checklist ────────────────────────────────────────────
  const manualState = await readManualChecklistState();
  const manualItems = MANUAL_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    done: manualState[item.id]?.done === true,
    doneAt: manualState[item.id]?.doneAt || null,
    doneBy: manualState[item.id]?.doneBy || null,
    note: manualState[item.id]?.note || null,
  }));
  const manualRequiredTotal = manualItems.filter((i) => i.required).length;
  const manualRequiredDone = manualItems.filter((i) => i.required && i.done).length;

  // ── Overall readiness ────────────────────────────────────────────────────
  const blockers: string[] = [];
  if (!secrets.GEMINI_API_KEY) blockers.push("GEMINI_API_KEY secret not set");
  if (recoveryTokenStatus === "missing") blockers.push("ADMIN_RECOVERY_TOKEN secret not set");
  if (storageStatus !== "ok") blockers.push(`Storage bucket unreachable (${storageBucket})`);
  for (const [k, v] of Object.entries(firestoreChecks)) {
    if (v !== "ok") blockers.push(`Firestore collection ${k} unreachable`);
  }
  if (manualRequiredDone < manualRequiredTotal) {
    blockers.push(`${manualRequiredTotal - manualRequiredDone} manual checklist item(s) pending`);
  }

  const readiness = blockers.length === 0
    ? "ready"
    : (blockers.length <= 2 ? "near-ready" : "not-ready");

  return {
    timestamp: new Date().toISOString(),
    projectId,
    readiness,
    blockers,
    secrets,
    storage: { status: storageStatus, bucket: storageBucket },
    firestore: firestoreChecks,
    rtdn,
    recoveryToken: {
      status: recoveryTokenStatus,
      tokenCount: recoveryTokens.length,
      ageDays: recoveryTokenAgeDays,
      rotatedAt: recoveryTokenRotatedAt,
      warnAfterDays: ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS,
    },
    manualChecklist: {
      items: manualItems,
      requiredTotal: manualRequiredTotal,
      requiredDone: manualRequiredDone,
      progressPct: manualRequiredTotal === 0 ? 100 : Math.round((manualRequiredDone / manualRequiredTotal) * 100),
    },
  };
});

/**
 * Updates a single manual checklist item.  Admin-only.
 *
 * data: { itemId: string, done: boolean, note?: string }
 */
export const setOperatorSetupChecklistItem = functions.https.onCall(
  async (
    data: { itemId: string; done: boolean; note?: string },
    context: CallableContext
  ) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    if (!data || typeof data.itemId !== "string" || typeof data.done !== "boolean") {
      throw new functions.https.HttpsError("invalid-argument", "itemId (string) and done (boolean) are required.");
    }
    const known = MANUAL_CHECKLIST_ITEMS.find((i) => i.id === data.itemId);
    if (!known) {
      throw new functions.https.HttpsError("invalid-argument", `Unknown checklist itemId: ${data.itemId}`);
    }
    const note = typeof data.note === "string" ? data.note.slice(0, 500) : null;
    const adminUid = context.auth?.uid || "unknown-admin";

    const update = {
      [`items.${data.itemId}`]: {
        done: data.done,
        doneAt: data.done ? admin.firestore.FieldValue.serverTimestamp() : null,
        doneBy: data.done ? adminUid : null,
        note,
      },
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedBy: adminUid,
    };

    await db().doc(SETUP_CHECKLIST_DOC).set(update, { merge: true });

    await AuditLogger.logSuccess(
      "operator.setup_checklist_update", context, SETUP_CHECKLIST_DOC, "operator-setup",
      { itemId: data.itemId, done: data.done }
    );

    return { ok: true, itemId: data.itemId, done: data.done };
  }
);
