/**
 * Authentication & Registration Cloud Functions.
 * Handles master device registration, custom token generation, token revocation,
 * and admin claim management.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db, auth } from "../firebase";
import { requireAdmin, AuditLogger } from "./shared";
import type { OperatorRole } from "./shared";

const LEGACY_AUTH_DISABLED = process.env.DISABLE_LEGACY_SECRETKEY_AUTH === "true";

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

/**
 * Sets an operator role (admin/support/auditor) for a specified user UID.
 * Only callable by an existing admin.
 */
export const setUserRole = functions.https.onCall(
  async (data: { uid: string; role: string }, context: CallableContext) => {
    const startTime = Date.now();

    try {
      requireAdmin(context);

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

    const callerUid = context.auth.uid;

    try {
      // Check if ANY admin already exists — iterate all users
      let pageToken: string | undefined;
      let adminExists = false;
      do {
        const listResult = await auth().listUsers(1000, pageToken);
        for (const user of listResult.users) {
          if (user.customClaims && (user.customClaims as Record<string, unknown>).role === "admin") {
            adminExists = true;
            break;
          }
        }
        pageToken = listResult.pageToken;
      } while (pageToken && !adminExists);

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
      uid = context.auth.uid;
    } else {
      if (LEGACY_AUTH_DISABLED) {
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

      const masterDoc = await db().collection("masters").doc(masterImei).get();
      if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
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
    if (!context.auth && LEGACY_AUTH_DISABLED) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Legacy IMEI-only registration is disabled. Please register while authenticated."
      );
    }

    if (!context.auth) {
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
      const trialEndsAt = new admin.firestore.Timestamp(now.seconds + 7 * 24 * 60 * 60, now.nanoseconds);

      await masterDeviceRef.set({
        imei: imei,
        uid: masterId,
        role: "master",
        createdAt: now,
        subscription: {
          status: "trial",
          trialStartedAt: now,
          trialEndsAt: trialEndsAt,
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
 * Revokes all refresh tokens for a user, forcing re-authentication.
 * Admin-only action for security incidents.
 */
export const revokeUserTokens = functions.https.onCall(
  async (data: { uid: string }, context: CallableContext) => {
    const startTime = Date.now();
    try {
      requireAdmin(context);
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
