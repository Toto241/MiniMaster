/**
 * Authentication & Registration Cloud Functions.
 * Handles master device registration, custom token generation, token revocation,
 * and admin claim management.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, requireAdmin, AuditLogger } from "./shared";
import type { OperatorRole } from "./shared";

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

    await admin.auth().setCustomUserClaims(uid, { role: "admin" });

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

      await admin.auth().setCustomUserClaims(uid, { role });

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
 * Issues a fresh Firebase custom token for the currently authenticated user.
 * Supports token rotation and includes current custom claims.
 */
export const generateCustomToken = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const uid = requireAuth(context);

    try {
      const user = await admin.auth().getUser(uid);
      const customToken = await admin.auth().createCustomToken(uid, user.customClaims || {});

      // Track token refresh for security monitoring (best-effort)
      try {
        await db().collection("masters").doc(uid).update({
          lastTokenRefresh: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch { /* doc may not exist yet or db unavailable */ }

      await AuditLogger.logSuccess(
        "auth.token_generated", context, `users/${uid}`, "user",
        { hasClaims: Object.keys(user.customClaims || {}).length > 0, duration: Date.now() - startTime }
      );

      return { customToken };
    } catch (error) {
      await AuditLogger.logFailure(
        "auth.token_generated", context, `users/${uid}`, "user", error as Error
      );
      functions.logger.error("Error generating custom token:", error);
      throw new functions.https.HttpsError("internal", "An unexpected error occurred while generating the token.", error);
    }
  }
);

/**
 * Registers a master account for the authenticated user.
 * Creates a Firestore master document, assigns the "master" role claim,
 * and starts a 7-day free trial period.
 */
export const registerMasterDevice = functions.https.onCall(
  async (data: { imei: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { imei } = data;
    if (!imei || typeof imei !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "The function must be called with a valid 'imei' string.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);

    try {
      const doc = await masterDeviceRef.get();
      if (doc.exists) {
        await AuditLogger.logSuccess(
          "device.register", context, `masters/${masterId}`, "device",
          { imei, alreadyExists: true, duration: Date.now() - startTime }
        );
        return { masterId: masterId };
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

      await admin.auth().setCustomUserClaims(masterId, { role: "master" });

      await AuditLogger.logSuccess(
        "device.register", context, `masters/${masterId}`, "device",
        { imei, duration: Date.now() - startTime }
      );

      functions.logger.info(`Master account registered for uid: ${masterId}`);
      return { masterId: masterId };

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

      await admin.auth().revokeRefreshTokens(targetUid);

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
