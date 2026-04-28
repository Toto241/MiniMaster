/**
 * Authentication & Registration Cloud Functions.
 * Handles master device registration, custom token generation, token revocation,
 * and admin claim management.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db, auth } from "../firebase";
import { requireAdmin, requireAuth, AuditLogger, checkRateLimit, checkRateLimitShared, validateAppCheck } from "./shared";
import type { OperatorRole } from "./shared";
import { isLegacyAuthCutoverEnabled } from "./cutover-monitor";
const LEGACY_AUTH_DISABLED = process.env.DISABLE_LEGACY_SECRETKEY_AUTH === "true";

/**
 * Checks if legacy auth is disabled (env var OR dynamic Firestore config).
 * Prefer this over the LEGACY_AUTH_DISABLED constant for runtime decisions.
 */
async function isLegacyAuthDisabled(): Promise<boolean> {
  if (LEGACY_AUTH_DISABLED) return true;
  return await isLegacyAuthCutoverEnabled();
}
const MASTER_WEB_BOOTSTRAP_QUERY_PARAM = "bootstrapToken";
const DEFAULT_MASTER_WEB_BOOTSTRAP_TTL_MINUTES = 10;
const MAX_MASTER_WEB_BOOTSTRAP_TTL_MINUTES = 30;
const VALID_MASTER_WEB_BOOTSTRAP_TARGETS = ["web-control", "parent-panel", "child-panel"] as const;

type MasterWebBootstrapTarget = (typeof VALID_MASTER_WEB_BOOTSTRAP_TARGETS)[number];

function isOperatorResetEnabled(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    process.env.ENABLE_OPERATOR_ACCOUNT_RESET === "true" ||
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET === "true"
  );
}

function getAdminRecoveryToken(): string {
  return String(process.env.ADMIN_RECOVERY_TOKEN || process.env.MINIMASTER_ADMIN_RECOVERY_TOKEN || "").trim();
}

/**
 * Liefert alle aktuell akzeptierten Recovery-Tokens.
 * Unterstützt rolling rotation: Komma-getrennte Liste in `ADMIN_RECOVERY_TOKEN` /
 * `MINIMASTER_ADMIN_RECOVERY_TOKEN` erlaubt mehrere gleichzeitig gültige Tokens
 * während eines Rotations-Overlap-Fensters.
 */
export function getAdminRecoveryTokens(): string[] {
  const raw = getAdminRecoveryToken();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * ISO-Datum (oder leer), an dem das letzte Recovery-Token zuletzt rotiert wurde.
 * Wird im Health-Endpoint zurückgegeben, damit das Admin-Panel eine
 * Rotations-Erinnerung anzeigen kann (Empfehlung: ≤ 90 Tage).
 */
export function getAdminRecoveryTokenRotatedAt(): string {
  return String(
    process.env.ADMIN_RECOVERY_TOKEN_ROTATED_AT ||
    process.env.MINIMASTER_ADMIN_RECOVERY_TOKEN_ROTATED_AT ||
    ""
  ).trim();
}

/**
 * Berechnet das Alter (in Tagen) der letzten Token-Rotation.
 * Liefert `null`, wenn kein gültiges ISO-Datum konfiguriert ist.
 */
export function getAdminRecoveryTokenAgeDays(): number | null {
  const raw = getAdminRecoveryTokenRotatedAt();
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return null;
  const ageMs = Date.now() - ts;
  if (ageMs < 0) return 0;
  return Math.floor(ageMs / (24 * 60 * 60 * 1000));
}

export const ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS = 90;

function getCurrentProjectId(): string | null {
  const directProjectId = String(process.env.GCLOUD_PROJECT || "").trim();
  if (directProjectId) {
    return directProjectId;
  }

  const firebaseConfig = String(process.env.FIREBASE_CONFIG || "").trim();
  if (!firebaseConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
    return typeof parsed.projectId === "string" && parsed.projectId.trim().length > 0
      ? parsed.projectId.trim()
      : null;
  } catch {
    return null;
  }
}

function getResetAllowedProjects(): string[] {
  const raw = String(
    process.env.MINIMASTER_RESET_ALLOWED_PROJECTS || process.env.RESET_ALLOWED_PROJECTS || ""
  ).trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getResetGuardStatus(): {
  projectId: string | null;
  allowedProjectsConfigured: boolean;
  projectAllowedForReset: boolean;
  emulatorBypass: boolean;
  guardActive: boolean;
} {
  const emulatorBypass = process.env.FUNCTIONS_EMULATOR === "true";
  const guardActive = !emulatorBypass && process.env.NODE_ENV !== "test";
  const projectId = getCurrentProjectId();
  const allowedProjects = getResetAllowedProjects();
  const allowedProjectsConfigured = allowedProjects.length > 0;
  const projectAllowedForReset = projectId !== null && allowedProjects.includes(projectId);

  return {
    projectId,
    allowedProjectsConfigured,
    projectAllowedForReset,
    emulatorBypass,
    guardActive,
  };
}

function assertResetDeploymentAllowed(): void {
  const status = getResetGuardStatus();
  if (!status.guardActive) {
    return;
  }

  if (!status.allowedProjectsConfigured || !status.projectAllowedForReset) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Destructive reset is not allowed for this deployment. Configure MINIMASTER_RESET_ALLOWED_PROJECTS to include the current project."
    );
  }
}

function safeSecretEquals(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function logLegacyAuthUsage(endpoint: string, mode: "secretKey" | "imei_registration", identifier: string): Promise<void> {
  try {
    await db().collection("legacyAuthUsage").add({
      endpoint,
      mode,
      identifier,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      projectId: process.env.GCLOUD_PROJECT || null,
    });
  } catch (error) {
    functions.logger.warn("Failed to write legacy auth usage telemetry.", error);
  }
}

/**
 * Sets the custom claim 'role: admin' for a specified user UID.
 * Only callable by an existing admin.
 */
export const setAdminClaim = functions.https.onCall(async (data: { uid: string }, context: CallableContext) => {
  const startTime = Date.now();

  try {
    requireAdmin(context);
    validateAppCheck(context, true);

    const uid = data.uid;
    if (!uid) {
      throw new functions.https.HttpsError("invalid-argument", "The function must be called with a user UID.");
    }

    await auth().setCustomUserClaims(uid, { role: "admin" });

    await AuditLogger.logSuccess(
      "admin.set_admin_claim", context, `users/${uid}`, "user",
      { targetUserId: uid, duration: Date.now() - startTime }
    );

    return { message: `Success! Custom claim 'admin' set for user ${uid}` };
  } catch (error) {
    await AuditLogger.logFailure(
      "admin.set_admin_claim", context, `users/${data.uid || "unknown"}`, "user",
      error as Error, { targetUserId: data.uid }
    );
    console.error("Error setting custom claim:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", "Failed to set admin claim.");
  }
});

const VALID_OPERATOR_ROLES: OperatorRole[] = ["admin", "support", "auditor"];

async function hasAnyAdminUser(): Promise<boolean> {
  let pageToken: string | undefined;
  do {
    const listResult = await auth().listUsers(1000, pageToken);
    for (const user of listResult.users) {
      if (user.customClaims && (user.customClaims as Record<string, unknown>).role === "admin") {
        return true;
      }
    }
    pageToken = listResult.pageToken;
  } while (pageToken);

  return false;
}

async function listOperatorUsers(): Promise<admin.auth.UserRecord[]> {
  const operatorUsers: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined;

  do {
    const listResult = await auth().listUsers(1000, pageToken);
    for (const user of listResult.users) {
      const role = typeof user.customClaims?.role === "string" ? user.customClaims.role : "";
      if (VALID_OPERATOR_ROLES.includes(role as OperatorRole)) {
        operatorUsers.push(user);
      }
    }
    pageToken = listResult.pageToken;
  } while (pageToken);

  return operatorUsers;
}

async function deleteAllOperatorAccessKeys(): Promise<number> {
  let deleted = 0;

  let hasMore = true;
  while (hasMore) {
    const snapshot = await db().collection("operatorAccessKeys").limit(500).get();
    if (snapshot.empty) {
      hasMore = false;
      continue;
    }

    const batch = db().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
  }

  return deleted;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeMasterWebBootstrapTarget(raw: unknown): MasterWebBootstrapTarget {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (VALID_MASTER_WEB_BOOTSTRAP_TARGETS.includes(value as MasterWebBootstrapTarget)) {
    return value as MasterWebBootstrapTarget;
  }
  return "web-control";
}

function buildMasterWebBootstrapPath(target: MasterWebBootstrapTarget): string {
  switch (target) {
    case "parent-panel":
      return "/parent-panel/index.html";
    case "child-panel":
      return "/child-panel/index.html";
    case "web-control":
    default:
      return "/web-control/index.html";
  }
}

async function ensureMasterClaims(masterId: string): Promise<Record<string, unknown>> {
  const authUser = await auth().getUser(masterId).catch(async (error: { code?: string }) => {
    if (error?.code === "auth/user-not-found") {
      return auth().createUser({ uid: masterId });
    }
    throw error;
  });

  const claims = {
    ...(authUser.customClaims || {}),
    role: "master",
    masterImei: masterId,
  };

  await auth().setCustomUserClaims(masterId, claims);
  return claims;
}

/**
 * Creates a short-lived, one-time bootstrap token that can be redeemed by a browser
 * to establish a Firebase session for the same master account.
 * Additive bridge for web-control / parent-panel / child-panel while legacy login
 * still exists as rollback path.
 */
export const createMasterWebBootstrapToken = functions.https.onCall(
  async (data: { target?: string; ttlMinutes?: number }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }
    validateAppCheck(context, true);

    const masterId = context.auth.uid;
    const target = normalizeMasterWebBootstrapTarget(data?.target);
    const ttlMinutes = Number.isFinite(data?.ttlMinutes)
      ? Number(data.ttlMinutes)
      : DEFAULT_MASTER_WEB_BOOTSTRAP_TTL_MINUTES;

    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > MAX_MASTER_WEB_BOOTSTRAP_TTL_MINUTES) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `ttlMinutes muss zwischen 1 und ${MAX_MASTER_WEB_BOOTSTRAP_TTL_MINUTES} liegen.`
      );
    }

    await checkRateLimitShared(masterId, "auth.create_master_web_bootstrap_token", 5, 15 * 60 * 1000);

    const masterDoc = await db().collection("masters").doc(masterId).get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const rawToken = `mwb_${randomBytes(24).toString("base64url")}`;
    const keyHash = sha256Hex(rawToken);
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ttlMinutes * 60 * 1000);
    const docRef = db().collection("masterWebBootstrapTokens").doc();

    await docRef.set({
      keyHash,
      masterId,
      target,
      createdByUid: masterId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt,
      usedAt: null,
      redeemedByUid: null,
    });

    await AuditLogger.logSuccess(
      "auth.login",
      context,
      `masterWebBootstrapTokens/${docRef.id}`,
      "user",
      { channel: "master_web_bootstrap", masterId, target, ttlMinutes }
    );

    return {
      bootstrapToken: rawToken,
      expiresAtMs: expiresAt.toMillis(),
      target,
      targetPath: buildMasterWebBootstrapPath(target),
      queryParamName: MASTER_WEB_BOOTSTRAP_QUERY_PARAM,
    };
  }
);

/**
 * Redeems a short-lived one-time browser bootstrap token and returns a Firebase custom token
 * for the bound master account.
 */
export const redeemMasterWebBootstrapToken = functions.https.onCall(
  async (data: { bootstrapToken?: string }, context: CallableContext) => {
    validateAppCheck(context, true);

    const rawToken = typeof data?.bootstrapToken === "string" ? data.bootstrapToken.trim() : "";
    if (!rawToken.startsWith("mwb_") || rawToken.length < 20) {
      throw new functions.https.HttpsError("invalid-argument", "Ungültiger Bootstrap-Token.");
    }

    const keyHash = sha256Hex(rawToken);
    await checkRateLimitShared(keyHash.slice(0, 16), "auth.redeem_master_web_bootstrap_token", 10, 15 * 60 * 1000);

    try {
      const querySnapshot = await db()
        .collection("masterWebBootstrapTokens")
        .where("keyHash", "==", keyHash)
        .limit(1)
        .get();

      if (querySnapshot.empty) {
        throw new functions.https.HttpsError("permission-denied", "Bootstrap-Token ist ungültig oder wurde widerrufen.");
      }

      const tokenRef = querySnapshot.docs[0]!.ref;

      const redeemed = await db().runTransaction(async (tx) => {
        const tokenDoc = await tx.get(tokenRef);
        if (!tokenDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Bootstrap-Token nicht gefunden.");
        }

        const payload = tokenDoc.data() || {};
        const masterId = typeof payload.masterId === "string" ? payload.masterId : "";
        const target = normalizeMasterWebBootstrapTarget(payload.target);
        const usedAt = payload.usedAt || null;
        const expiresAt = payload.expiresAt as admin.firestore.Timestamp | null;

        if (!masterId) {
          throw new functions.https.HttpsError("internal", "Bootstrap-Token ist beschädigt (masterId).");
        }
        if (usedAt) {
          throw new functions.https.HttpsError("failed-precondition", "Dieser Bootstrap-Token wurde bereits eingelöst.");
        }
        if (!expiresAt || expiresAt.toMillis() < Date.now()) {
          throw new functions.https.HttpsError("deadline-exceeded", "Dieser Bootstrap-Token ist abgelaufen.");
        }

        tx.update(tokenRef, {
          usedAt: admin.firestore.FieldValue.serverTimestamp(),
          redeemedByUid: context.auth?.uid || null,
        });

        return { masterId, target };
      });

      const claims = await ensureMasterClaims(redeemed.masterId);
      const customToken = await auth().createCustomToken(redeemed.masterId, claims);

      await AuditLogger.log(
        "auth.login",
        redeemed.masterId,
        "master",
        `masters/${redeemed.masterId}`,
        "user",
        "success",
        { channel: "master_web_bootstrap", target: redeemed.target }
      );

      functions.logger.info("Master web bootstrap redeemed.", {
        masterId: redeemed.masterId,
        target: redeemed.target,
      });

      return {
        masterId: redeemed.masterId,
        customToken,
        target: redeemed.target,
      };
    } catch (error) {
      await AuditLogger.logFailure(
        "auth.login",
        context,
        "masterWebBootstrapTokens/redeem",
        "user",
        error as Error,
        { channel: "master_web_bootstrap" }
      );

      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Bootstrap-Login fehlgeschlagen.", error);
    }
  }
);

/**
 * Creates an operator access key record that can be redeemed exactly once.
 * - admin callers can create keys for any operator role.
 * - if no admin exists yet, authenticated callers can create an admin bootstrap key.
 */
export const createOperatorAccessKey = functions.https.onCall(
  async (
    data: { keyHash?: string; role?: string; ttlMinutes?: number; label?: string },
    context: CallableContext
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }
    validateAppCheck(context, true);

    const keyHash = typeof data?.keyHash === "string" ? data.keyHash.trim().toLowerCase() : "";
    const requestedRole = typeof data?.role === "string" ? data.role.trim().toLowerCase() : "admin";
    const ttlMinutes = Number.isFinite(data?.ttlMinutes) ? Number(data.ttlMinutes) : 60;
    const label = typeof data?.label === "string" ? data.label.trim().slice(0, 120) : "";

    if (!/^[a-f0-9]{64}$/.test(keyHash)) {
      throw new functions.https.HttpsError("invalid-argument", "keyHash muss ein SHA-256-Hash (hex) sein.");
    }
    if (!VALID_OPERATOR_ROLES.includes(requestedRole as OperatorRole)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Role must be one of: ${VALID_OPERATOR_ROLES.join(", ")}`
      );
    }
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 10080) {
      throw new functions.https.HttpsError("invalid-argument", "ttlMinutes muss zwischen 1 und 10080 liegen.");
    }

    const callerRole = typeof context.auth.token.role === "string" ? context.auth.token.role : "";
    if (callerRole !== "admin") {
      const adminExists = await hasAnyAdminUser();
      if (adminExists || requestedRole !== "admin") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Nur ein Admin kann Zugangsschlüssel erzeugen. Ausnahme: Erst-Bootstrap (kein Admin vorhanden)."
        );
      }
    }

    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + ttlMinutes * 60 * 1000);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const docRef = db().collection("operatorAccessKeys").doc();
    await docRef.set({
      keyHash,
      role: requestedRole,
      label,
      createdByUid: context.auth.uid,
      createdAt: now,
      expiresAt,
      usedAt: null,
      redeemedByUid: null,
    });

    return {
      keyId: docRef.id,
      role: requestedRole,
      expiresAtMs: expiresAt.toMillis(),
    };
  }
);

/**
 * Redeems an operator access key and grants role to the authenticated caller.
 * The key is one-time use and server-validated via SHA-256 hash lookup.
 */
export const redeemOperatorAccessKey = functions.https.onCall(
  async (data: { key?: string }, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }
    validateAppCheck(context, true);

    const rawKey = typeof data?.key === "string" ? data.key.trim() : "";
    if (rawKey.length < 43) {
      throw new functions.https.HttpsError("invalid-argument", "Ungültige Schlüsseldatei oder Schlüsselwert.");
    }

    const keyHash = sha256Hex(rawKey);
    const querySnapshot = await db()
      .collection("operatorAccessKeys")
      .where("keyHash", "==", keyHash)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      throw new functions.https.HttpsError("permission-denied", "Schlüssel ist ungültig oder wurde widerrufen.");
    }

    const keyRef = querySnapshot.docs[0]!.ref;

    const grantedRole = await db().runTransaction(async (tx) => {
      const keyDoc = await tx.get(keyRef);
      if (!keyDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Zugangsschlüssel nicht gefunden.");
      }

      const payload = keyDoc.data() || {};
      const role = typeof payload.role === "string" ? payload.role : "";
      const usedAt = payload.usedAt || null;
      const expiresAt = payload.expiresAt as admin.firestore.Timestamp | null;

      if (!VALID_OPERATOR_ROLES.includes(role as OperatorRole)) {
        throw new functions.https.HttpsError("internal", "Ungültige Rolleninformation im Schlüssel.");
      }
      if (usedAt) {
        throw new functions.https.HttpsError("failed-precondition", "Dieser Zugangsschlüssel wurde bereits eingelöst.");
      }
      if (!expiresAt || expiresAt.toMillis() < Date.now()) {
        throw new functions.https.HttpsError("deadline-exceeded", "Dieser Zugangsschlüssel ist abgelaufen.");
      }

      tx.update(keyRef, {
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        redeemedByUid: context.auth?.uid,
      });

      return role as OperatorRole;
    });

    await auth().setCustomUserClaims(context.auth.uid, { role: grantedRole });

    return {
      success: true,
      role: grantedRole,
      message: `Zugang wurde freigeschaltet. Rolle: ${grantedRole}`,
    };
  }
);

/**
 * Sets an operator role (admin/support/auditor) for a specified user UID.
 * Only callable by an existing admin.
 */
export const setUserRole = functions.https.onCall(
  async (data: { uid: string; role: string }, context: CallableContext) => {
    const startTime = Date.now();

    try {
      requireAdmin(context);
      validateAppCheck(context, true);

      const { uid, role } = data;
      if (!uid || typeof uid !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "A valid user UID is required.");
      }
      if (!role || !VALID_OPERATOR_ROLES.includes(role as OperatorRole)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Role must be one of: ${VALID_OPERATOR_ROLES.join(", ")}`
        );
      }

      await auth().setCustomUserClaims(uid, { role });

      await AuditLogger.logSuccess(
        "admin.set_admin_claim", context, `users/${uid}`, "user",
        { targetUserId: uid, assignedRole: role, duration: Date.now() - startTime }
      );

      return { message: `Role '${role}' set for user ${uid}` };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.set_admin_claim", context, `users/${data?.uid || "unknown"}`, "user",
        error as Error, { targetUserId: data?.uid, role: data?.role }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to set user role.");
    }
  }
);

/**
 * Resets all existing operator accounts (admin/support/auditor) for development setups.
 * Requires an admin caller and explicit confirmation token.
 */
export const resetOperatorAccounts = functions.https.onCall(
  async (data: { confirmText?: string }, context: CallableContext) => {
    const startTime = Date.now();
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }

    const resetEnabled = isOperatorResetEnabled();

    const callerRole = typeof context.auth.token.role === "string" ? context.auth.token.role : "";
    const callerIsAdmin = callerRole === "admin";

    if (!resetEnabled) {
      requireAdmin(context);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Operator account reset is disabled. Enable via FUNCTIONS_EMULATOR=true, ENABLE_OPERATOR_ACCOUNT_RESET=true, or MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET=true."
      );
    }

    assertResetDeploymentAllowed();

    if (!callerIsAdmin) {
      functions.logger.warn("DEV resetOperatorAccounts invoked by non-admin user.", {
        uid: context.auth.uid,
        role: callerRole || "none",
      });
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin privileges required for operator account reset."
      );
    }

    validateAppCheck(context, true);

    const confirmText = typeof data?.confirmText === "string" ? data.confirmText.trim() : "";
    if (confirmText !== "RESET_OPERATOR_ACCOUNTS") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "confirmText must be exactly RESET_OPERATOR_ACCOUNTS."
      );
    }

    const callerUid = context.auth.uid;

    try {
      const operatorUsers = await listOperatorUsers();
      let accessKeysDeleted = 0;
      let accessKeyCleanupWarning: string | null = null;
      try {
        accessKeysDeleted = await deleteAllOperatorAccessKeys();
      } catch (cleanupError) {
        accessKeyCleanupWarning = (cleanupError as Error).message || "unknown operatorAccessKeys cleanup error";
        functions.logger.error("resetOperatorAccounts operatorAccessKeys cleanup failed (non-fatal).", {
          requestedBy: callerUid,
          accessKeyCleanupWarning,
        });
      }

      const deletedUids: string[] = [];
      const failedUids: string[] = [];
      for (const user of operatorUsers) {
        try {
          await auth().deleteUser(user.uid);
          deletedUids.push(user.uid);
        } catch (error) {
          functions.logger.error("Failed to delete operator user during reset.", {
            uid: user.uid,
            error: (error as Error).message,
          });
          failedUids.push(user.uid);
        }
      }

      await AuditLogger.logSuccess(
        "admin.reset_operator_accounts",
        context,
        "operatorAccounts/reset",
        "user",
        {
          requestedBy: callerUid,
          requestedByRole: callerRole || "none",
          matchedUsers: operatorUsers.length,
          deletedUsers: deletedUids.length,
          failedUsers: failedUids.length,
          accessKeysDeleted,
          duration: Date.now() - startTime,
        }
      );

      return {
        success: failedUids.length === 0,
        requestedBy: callerUid,
        matchedUsers: operatorUsers.length,
        deletedUsers: deletedUids.length,
        failedUsers: failedUids,
        accessKeysDeleted,
      };
    } catch (error) {
      await AuditLogger.logFailure(
        "admin.reset_operator_accounts",
        context,
        "operatorAccounts/reset",
        "user",
        error as Error,
        { requestedBy: callerUid }
      );

      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        "Operator account reset failed.",
        error
      );
    }
  }
);

/**
 * Resets all existing Firebase Auth users for development setups.
 * Deletes users regardless of role. Requires explicit confirmation token.
 */
export const resetAllAuthUsers = functions.https.onCall(
  async (data: { confirmText?: string; requestId?: string; includeCurrentSessionUser?: boolean; recoveryToken?: string }, context: CallableContext) => {
    const startTime = Date.now();
    functions.logger.info("resetAllAuthUsers ENTRY — function invoked.", {
      hasAuth: !!context.auth,
      callerUid: context.auth?.uid || "none",
      dataKeys: data ? Object.keys(data) : [],
      timestamp: new Date().toISOString(),
    });

    const resetEnabled = isOperatorResetEnabled();

    const recoveryTokens = getAdminRecoveryTokens();
    const recoveryTokenData = typeof data?.recoveryToken === "string" ? data.recoveryToken.trim() : "";
    const recoveryTokenAllowed =
      recoveryTokens.length > 0 &&
      recoveryTokenData.length > 0 &&
      recoveryTokens.some((expected) => safeSecretEquals(expected, recoveryTokenData));

    const callerRole = context.auth && typeof context.auth.token.role === "string" ? context.auth.token.role : "";
    if (!resetEnabled) {
      requireAdmin(context);
      throw new functions.https.HttpsError(
        "failed-precondition",
        "All-user reset is disabled. Enable via FUNCTIONS_EMULATOR=true, ENABLE_OPERATOR_ACCOUNT_RESET=true, or MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET=true."
      );
    }

    assertResetDeploymentAllowed();

    if (!context.auth && !recoveryTokenAllowed) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Sie müssen angemeldet sein oder einen gültigen Recovery-Token angeben."
      );
    }

    if (!recoveryTokenAllowed && callerRole !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Admin privileges or a valid recovery token are required for all-user reset."
      );
    }

    validateAppCheck(context, true);

    const confirmText = typeof data?.confirmText === "string" ? data.confirmText.trim() : "";
    const includeCurrentSessionUser = data?.includeCurrentSessionUser === true;
    const requestId =
      typeof data?.requestId === "string" && data.requestId.trim().length > 0
        ? data.requestId.trim().slice(0, 80)
        : `srv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (confirmText !== "RESET_ALL_AUTH_USERS") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "confirmText must be exactly RESET_ALL_AUTH_USERS."
      );
    }

    functions.logger.warn("DEV resetAllAuthUsers invoked.", {
      uid: context.auth?.uid || "recovery-token",
      role: callerRole || "none",
      requestId,
      includeCurrentSessionUser,
      recoveryTokenUsed: recoveryTokenAllowed,
    });

    if (recoveryTokenAllowed) {
      const ageDays = getAdminRecoveryTokenAgeDays();
      if (ageDays !== null && ageDays > ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS) {
        functions.logger.warn(
          "Recovery-Token-Rotation überfällig: Token wurde vor mehr als " +
          `${ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS} Tagen rotiert (aktuell ${ageDays} Tage). ` +
          "Bitte ADMIN_RECOVERY_TOKEN rotieren und ADMIN_RECOVERY_TOKEN_ROTATED_AT aktualisieren.",
          { requestId, ageDays }
        );
      }
    }

    const callerUid = context.auth?.uid || "recovery-token";

    try {
      const usersToDelete: admin.auth.UserRecord[] = [];
      const skippedCurrentUserUids: string[] = [];
      let pageToken: string | undefined;
      do {
        const listResult = await auth().listUsers(1000, pageToken);
        for (const user of listResult.users) {
          const isCurrentCaller = context.auth ? user.uid === callerUid : false;
          if (isCurrentCaller && !includeCurrentSessionUser) {
            skippedCurrentUserUids.push(user.uid);
            continue;
          }
          usersToDelete.push(user);
        }
        pageToken = listResult.pageToken;
      } while (pageToken);

      functions.logger.info("resetAllAuthUsers user selection complete.", {
        requestId,
        callerUid,
        matchedUsers: usersToDelete.length,
        skippedCurrentSessionUsers: skippedCurrentUserUids.length,
      });

      const deletedUids: string[] = [];
      const failedUids: string[] = [];
      for (const user of usersToDelete) {
        try {
          await auth().deleteUser(user.uid);
          deletedUids.push(user.uid);
        } catch (error) {
          functions.logger.error("Failed to delete user during all-user reset.", {
            uid: user.uid,
            error: (error as Error).message,
          });
          failedUids.push(user.uid);
        }
      }

      let accessKeysDeleted = 0;
      let accessKeyCleanupWarning: string | null = null;
      try {
        accessKeysDeleted = await deleteAllOperatorAccessKeys();
      } catch (cleanupError) {
        accessKeyCleanupWarning = (cleanupError as Error).message || "unknown operatorAccessKeys cleanup error";
        functions.logger.error("resetAllAuthUsers operatorAccessKeys cleanup failed (non-fatal).", {
          requestId,
          accessKeyCleanupWarning,
        });
      }

      let auditLogWarning: string | null = null;
      try {
        await AuditLogger.logSuccess(
          "admin.reset_operator_accounts",
          context,
          "users/reset-all",
          "user",
          {
            resetScope: "all_auth_users",
            requestId,
            requestedBy: callerUid,
            requestedByRole: callerRole || "none",
            recoveryTokenUsed: recoveryTokenAllowed,
            matchedUsers: usersToDelete.length,
            skippedCurrentSessionUsers: skippedCurrentUserUids.length,
            deletedUsers: deletedUids.length,
            failedUsers: failedUids.length,
            accessKeysDeleted,
            accessKeyCleanupWarning,
            duration: Date.now() - startTime,
          }
        );
      } catch (auditError) {
        auditLogWarning = (auditError as Error).message || "unknown audit logging error";
        functions.logger.error("resetAllAuthUsers audit logging failed (non-fatal).", {
          requestId,
          auditLogWarning,
        });
      }

      return {
        success: failedUids.length === 0,
        requestId,
        requestedBy: callerUid,
        matchedUsers: usersToDelete.length,
        skippedCurrentSessionUsers: skippedCurrentUserUids,
        deletedUsers: deletedUids.length,
        failedUsers: failedUids,
        accessKeysDeleted,
        accessKeyCleanupWarning,
        auditLogWarning,
      };
    } catch (error) {
      functions.logger.error("resetAllAuthUsers failed.", {
        requestId,
        requestedBy: callerUid,
        role: callerRole || "none",
        message: (error as Error).message,
        stack: (error as Error).stack,
      });

      try {
        await AuditLogger.logFailure(
          "admin.reset_operator_accounts",
          context,
          "users/reset-all",
          "user",
          error as Error,
          { requestedBy: callerUid, resetScope: "all_auth_users", requestId }
        );
      } catch (auditFailureError) {
        functions.logger.error("resetAllAuthUsers failure-audit logging failed (non-fatal).", {
          requestId,
          message: (auditFailureError as Error).message,
        });
      }

      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError(
        "internal",
        `All-user reset failed: ${(error as Error).message}`,
        {
          requestId,
          resetScope: "all_auth_users",
          callerUid,
          callerRole: callerRole || "none",
          originalMessage: (error as Error).message,
        }
      );
    }
  }
);

/**
 * Read-only health endpoint for resetAllAuthUsers.
 * Helps the admin panel verify reachability and reset gating without side effects.
 */
export const resetAllAuthUsersHealth = functions.https.onCall(
  async (data: { requestId?: string } | Record<string, never>, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }
    validateAppCheck(context, true);

    const requestId =
      typeof (data as { requestId?: string })?.requestId === "string" && (data as { requestId?: string }).requestId?.trim()
        ? (data as { requestId?: string }).requestId!.trim().slice(0, 80)
        : `srv-health-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const resetEnabled = isOperatorResetEnabled();
    const recoveryTokens = getAdminRecoveryTokens();
    const recoveryTokenConfigured = recoveryTokens.length > 0;
    const recoveryTokenCount = recoveryTokens.length;
    const recoveryTokenRotatedAt = getAdminRecoveryTokenRotatedAt() || null;
    const recoveryTokenAgeDays = getAdminRecoveryTokenAgeDays();
    const recoveryTokenRotationOverdue =
      recoveryTokenAgeDays !== null && recoveryTokenAgeDays > ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS;
    const resetGuardStatus = getResetGuardStatus();

    const callerRole = typeof context.auth.token.role === "string" ? context.auth.token.role : "none";
    return {
      reachable: true,
      requestId,
      resetEnabled,
      recoveryTokenConfigured,
      recoveryTokenCount,
      recoveryTokenRotatedAt,
      recoveryTokenAgeDays,
      recoveryTokenRotationOverdue,
      recoveryTokenRotationWarnDays: ADMIN_RECOVERY_TOKEN_ROTATION_WARN_DAYS,
      projectId: resetGuardStatus.projectId,
      allowedProjectsConfigured: resetGuardStatus.allowedProjectsConfigured,
      projectAllowedForReset: resetGuardStatus.projectAllowedForReset,
      emulatorBypass: resetGuardStatus.emulatorBypass,
      callerRole,
      isAdmin: callerRole === "admin",
      requiredConfirmText: "RESET_ALL_AUTH_USERS",
    };
  }
);

/**
 * Bootstrap the very first admin user.
 * Only works when NO admin user exists yet in Firebase Auth.
 * The caller must be authenticated (registered via the panel).
 * Security: iterates all users to verify no admin claim exists.
 */
export const bootstrapFirstAdmin = functions.https.onCall(
  async (_data: unknown, context: CallableContext) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Sie müssen angemeldet sein.");
    }
    validateAppCheck(context, true);

    const callerUid = context.auth.uid;

    try {
      const adminExists = await hasAnyAdminUser();

      if (adminExists) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Es existiert bereits ein Admin. Bitten Sie den bestehenden Admin, Ihnen eine Rolle zuzuweisen."
        );
      }

      // No admin exists → promote caller to admin
      await auth().setCustomUserClaims(callerUid, { role: "admin" });

      await AuditLogger.logSuccess(
        "admin.set_admin_claim", context, `users/${callerUid}`, "user",
        { targetUserId: callerUid, bootstrapFirstAdmin: true }
      );

      functions.logger.info(`Bootstrap: First admin set for UID ${callerUid}`);
      return { success: true, message: "Sie sind jetzt Admin! Die Seite wird neu geladen." };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error("Bootstrap admin error:", error);
      throw new functions.https.HttpsError(
        "internal",
        `Admin-Aktivierung fehlgeschlagen: ${(error as Error).message}`
      );
    }
  }
);

/**
 * Issues a fresh Firebase custom token for either:
 * 1. the currently authenticated user, or
 * 2. a master authenticated via masterImei + secretKey (web-control login).
 *
 * ⚠️ LEGACY AUTH — EINGEFROREN: secretKey/IMEI-Auth wird nicht erweitert.
 * Migration zu Firebase Auth UI geplant (siehe docs/AUTH_MIGRATION_PLAN.md Phase 2).
 */
export const generateCustomToken = functions.https.onCall(
  async (data: { masterImei?: string; secretKey?: string }, context: CallableContext) => {
    const startTime = Date.now();
    let uid: string;

    if (context.auth) {
      validateAppCheck(context, true);
      uid = context.auth.uid;
    } else {
      if (await isLegacyAuthDisabled()) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Legacy secretKey login is disabled. Please sign in via Firebase Auth."
        );
      }

      const { masterImei, secretKey } = data || {};
      if (!masterImei || typeof masterImei !== "string" || !secretKey || typeof secretKey !== "string") {
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Either authenticated context or valid masterImei/secretKey is required."
        );
      }

      validateAppCheck(context, true);
      await checkRateLimitShared(masterImei, "auth.generate_custom_token_legacy", 10, 15 * 60 * 1000);
      await logLegacyAuthUsage(masterImei, "generate_custom_token");

      const masterDoc = await db().collection("masters").doc(masterImei).get();
      const storedSecretKey = masterDoc.data()?.secretKey;
      if (!masterDoc.exists || typeof storedSecretKey !== "string" || !safeSecretEquals(storedSecretKey, secretKey)) {
        throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
      }

      functions.logger.warn("LEGACY_AUTH_USED generateCustomToken via masterImei/secretKey.", { masterImei });
      await logLegacyAuthUsage("generateCustomToken", "secretKey", masterImei);

      uid = masterImei;
    }

    try {
      const user = await auth().getUser(uid);
      const customToken = await auth().createCustomToken(uid, user.customClaims || {});

      // Track token refresh for security monitoring (best-effort)
      try {
        await db().collection("masters").doc(uid).update({
          lastTokenRefresh: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch { /* doc may not exist yet or db unavailable */ }

      if (context.auth) {
        await AuditLogger.logSuccess(
          "auth.token_generated", context, `users/${uid}`, "user",
          { hasClaims: Object.keys(user.customClaims || {}).length > 0, duration: Date.now() - startTime }
        );
      }

      return { customToken };
    } catch (error) {
      if (context.auth) {
        await AuditLogger.logFailure(
          "auth.token_generated", context, `users/${uid}`, "user", error as Error
        );
      }
      functions.logger.error("Error generating custom token:", error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while generating the token.", error);
    }
  }
);

/**
 * Registers a master account and returns a Firebase custom token for the
 * canonical master identity. Existing master records are reused.
 *
 * ⚠️ LEGACY AUTH — EINGEFROREN: IMEI-basierte Registrierung wird nicht erweitert.
 * Migration zu Firebase Installation ID geplant (siehe docs/AUTH_MIGRATION_PLAN.md Phase 2).
 */
export const registerMasterDevice = functions.https.onCall(
  async (data: { imei: string }, context: CallableContext) => {
    const startTime = Date.now();
    const { imei } = data;
    if (!imei || typeof imei !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "The function must be called with a valid 'imei' string.");
    }

    const masterId = context.auth?.uid || imei;
    if (!context.auth && await isLegacyAuthDisabled()) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Legacy IMEI-only registration is disabled. Please register while authenticated."
      );
    }

    validateAppCheck(context, true);

    if (!context.auth) {
      await checkRateLimitShared(imei, "auth.register_master_device_legacy", 5, 60 * 60 * 1000);
      await logLegacyAuthUsage(imei, "register_master_device");
      functions.logger.warn("LEGACY_AUTH_USED registerMasterDevice without authenticated context.", { imei });
      await logLegacyAuthUsage("registerMasterDevice", "imei_registration", imei);
    }

    if (context.auth && context.auth.uid !== imei) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Authenticated user does not match requested master device id."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const authUser = await auth().getUser(masterId).catch(async (error: { code?: string }) => {
        if (error?.code === "auth/user-not-found") {
          return auth().createUser({ uid: masterId });
        }
        throw error;
      });

      const doc = await masterDeviceRef.get();
      if (doc.exists) {
        await auth().setCustomUserClaims(masterId, {
          ...(authUser.customClaims || {}),
          role: "master",
          masterImei: masterId,
        });
        const customToken = await auth().createCustomToken(masterId, {
          ...(authUser.customClaims || {}),
          role: "master",
          masterImei: masterId,
        });
        await AuditLogger.logSuccess(
          "device.register", context, `masters/${masterId}`, "device",
          { imei, alreadyExists: true, duration: Date.now() - startTime }
        );
        return { masterId, customToken };
      }

      const now = admin.firestore.Timestamp.now();

      await masterDeviceRef.set({
        imei: imei,
        uid: masterId,
        role: "master",
        createdAt: now,
        subscription: {
          status: "trial_pending",
          parentAppLimit: 2,
          childLimit: 4,
        },
      });

      const customClaims = {
        ...(authUser.customClaims || {}),
        role: "master",
        masterImei: masterId,
      };
      await auth().setCustomUserClaims(masterId, customClaims);
      const customToken = await auth().createCustomToken(masterId, customClaims);

      await AuditLogger.logSuccess(
        "device.register", context, `masters/${masterId}`, "device",
        { imei, duration: Date.now() - startTime }
      );

      functions.logger.info(`Master account registered for uid: ${masterId}`);
      return { masterId, customToken };

    } catch (error) {
      await AuditLogger.logFailure(
        "device.register", context, `masters/${masterId}`, "device",
        error as Error, { imei }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      functions.logger.error("Error registering master device:", error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while registering the device.", error);
    }
  }
);

/**
 * Registers a master device using an already-authenticated Firebase user.
 *
 * This is the modern replacement for `registerMasterDevice` (legacy IMEI flow).
 * The caller must be authenticated (anonymous or email/password) and the
 * master document is created under `masters/{context.auth.uid}`.
 *
 * Returns `{ masterId }` — no custom token is needed because the caller
 * is already signed in.
 */
export const registerAuthenticatedMaster = functions.https.onCall(
  async (data: { deviceId?: string; deviceName?: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    validateAppCheck(context, true);
    await checkRateLimitShared(masterId, "auth.register_authenticated_master", 5, 60 * 60 * 1000);

    const deviceId = data.deviceId || masterId;
    const deviceName = data.deviceName || "Master Device";

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const doc = await masterDeviceRef.get();
      if (doc.exists) {
        // Just refresh metadata
        await masterDeviceRef.update({
          lastSeenAt: admin.firestore.Timestamp.now(),
          appVersion: data.deviceName ? deviceName : (doc.data()?.appVersion || ""),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await AuditLogger.logSuccess(
          "device.register", context, `masters/${masterId}`, "device",
          { deviceId, alreadyExists: true, modernFlow: true, duration: Date.now() - startTime }
        );
        return { masterId };
      }

      const now = admin.firestore.Timestamp.now();
      await masterDeviceRef.set({
        deviceId,
        deviceName,
        uid: masterId,
        role: "master",
        createdAt: now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        subscription: {
          status: "trial_pending",
          parentAppLimit: 2,
          childLimit: 4,
        },
      });

      // DUAL-WRITE: Also create family document for future schema migration
      // Phase 1 of families/{familyId} migration — write to both paths
      try {
        const familyRef = db().collection("families").doc(masterId);
        await familyRef.set({
          masterId,
          deviceId,
          deviceName,
          createdAt: now,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          subscription: {
            status: "trial_pending",
            parentAppLimit: 2,
            childLimit: 4,
          },
          children: [],
          schemaVersion: 1,
        }, { merge: true });
      } catch (e) {
        functions.logger.warn("Dual-write to families/ failed (non-fatal)", { error: e, masterId });
      }

      await auth().setCustomUserClaims(masterId, {
        role: "master",
        masterId,
      });

      await AuditLogger.logSuccess(
        "device.register", context, `masters/${masterId}`, "device",
        { deviceId, modernFlow: true, duration: Date.now() - startTime }
      );

      functions.logger.info(`Authenticated master registered: ${masterId}`);
      return { masterId };
    } catch (error) {
      await AuditLogger.logFailure(
        "device.register", context, `masters/${masterId}`, "device",
        error as Error, { deviceId, modernFlow: true }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to register authenticated master.");
    }
  }
);

/**
 * Revokes all refresh tokens for a user, forcing re-authentication.
 * Admin-only action for security incidents.
 */
export const revokeUserTokens = functions.https.onCall(
  async (data: { uid: string }, context: CallableContext) => {
    const startTime = Date.now();
    try {
      requireAdmin(context);
      validateAppCheck(context, true);
      const targetUid = data.uid;
      if (!targetUid || typeof targetUid !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "A valid user UID is required.");
      }

      await auth().revokeRefreshTokens(targetUid);

      await db().collection("masters").doc(targetUid).update({
        tokensRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => { /* doc may not exist for non-masters */ });

      await AuditLogger.logSuccess(
        "auth.token_revoked", context, `users/${targetUid}`, "user",
        { targetUid, duration: Date.now() - startTime }
      );

      return { message: `All tokens revoked for user ${targetUid}.` };
    } catch (error) {
      await AuditLogger.logFailure(
        "auth.token_revoked", context, `users/${data.uid || "unknown"}`, "user",
        error as Error, { targetUid: data.uid }
      );
      if (error instanceof functions.https.HttpsError) throw error;
      throw new functions.https.HttpsError("internal", "Failed to revoke tokens.");
    }
  }
);
/**
 * Logs legacy auth usage for migration analytics.
 * Writes to legacy_auth_usage/{date}/{masterId} for 14-day window tracking.
 */
async function logLegacyAuthUsage(masterId: string, action: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const docRef = db().collection("legacy_auth_usage").doc(date).collection("users").doc(masterId);
  try {
    await docRef.set({
      masterId,
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      action,
      count: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
  } catch (e) {
    functions.logger.warn("Failed to log legacy auth usage", { error: e, masterId, action });
  }
}

/**
 * Admin endpoint: Migrates existing master/child data to the new families/ schema.
 * Phase 2 of migration: backfill families/ from existing masters/ and children/ docs.
 * Idempotent — safe to run multiple times.
 */
export const migrateToFamiliesSchema = functions.https.onCall(
  async (_data: void, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    const results = {
      familiesCreated: 0,
      childrenLinked: 0,
      errors: [] as string[],
    };

    try {
      const mastersSnap = await db().collection("masters").get();

      for (const masterDoc of mastersSnap.docs) {
        const masterId = masterDoc.id;
        const masterData = masterDoc.data();

        try {
          const familyRef = db().collection("families").doc(masterId);
          const familySnap = await familyRef.get();

          if (!familySnap.exists) {
            await familyRef.set({
              masterId,
              deviceId: masterData.deviceId || masterId,
              deviceName: masterData.deviceName || "Master Device",
              createdAt: masterData.createdAt || admin.firestore.Timestamp.now(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              subscription: masterData.subscription || {
                status: "trial_pending",
                parentAppLimit: 2,
                childLimit: 4,
              },
              children: [],
              schemaVersion: 1,
            });
            results.familiesCreated++;
          }

          // Link existing children to this family
          const childrenSnap = await db()
            .collection("children")
            .where("masterId", "==", masterId)
            .get();

          const childIds = childrenSnap.docs.map((d) => d.id);
          if (childIds.length > 0) {
            await familyRef.update({
              children: admin.firestore.FieldValue.arrayUnion(...childIds),
            });
            results.childrenLinked += childIds.length;
          }
        } catch (e) {
          const msg = `Migration failed for master ${masterId}: ${(e as Error).message}`;
          functions.logger.error(msg);
          results.errors.push(msg);
        }
      }

      return results;
    } catch (e) {
      throw new functions.https.HttpsError(
        "internal",
        `Migration failed: ${(e as Error).message}`
      );
    }
  }
);

/**
 * Admin endpoint: Returns legacy auth usage stats for the last N days.
 * Used to determine if the 14-day zero-usage gate for legacy auth cutover is met.
 */
export const getLegacyAuthUsageStats = functions.https.onCall(
  async (data: { days?: number }, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    const days = Number.isFinite(data?.days) ? Math.min(Number(data.days), 30) : 14;
    const results: { date: string; uniqueUsers: number; totalCalls: number }[] = [];

    const now = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      try {
        const snapshot = await db().collection("legacy_auth_usage").doc(dateStr).collection("users").get();
        let totalCalls = 0;
        snapshot.forEach((doc) => {
          totalCalls += (doc.data().count || 0) as number;
        });
        results.push({ date: dateStr, uniqueUsers: snapshot.size, totalCalls });
      } catch {
        results.push({ date: dateStr, uniqueUsers: 0, totalCalls: 0 });
      }
    }

    const totalUniqueUsers = new Set(results.flatMap((r) => r.uniqueUsers > 0 ? [r.date] : [])).size;
    const totalCallsAll = results.reduce((sum, r) => sum + r.totalCalls, 0);
    const cutoverReady = totalCallsAll === 0 && results.length >= 14;

    return {
      days,
      daily: results,
      summary: {
        totalCalls: totalCallsAll,
        totalDaysWithUsage: totalUniqueUsers,
        cutoverReady,
      },
    };
  }
);
