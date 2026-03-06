import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
// Korrekte Typen für onCall-Request
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin"; // Still need for Timestamp/FieldValue
import { v4 as uuidv4 } from "uuid";
import { google } from "googleapis";
import { db } from "./firebase";

function requireAuth(context: CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }
  return context.auth.uid;
}

function requireAdmin(context: CallableContext): void {
  if (!context.auth || context.auth.token.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required.");
  }
}

// --- Audit Logging Infrastructure ---

/**
 * Type definition for all possible audit actions in the system.
 * Each action represents a specific operation that should be logged.
 */
type AuditAction = 
  // Device Management
  | "device.register"
  | "device.lock"
  | "device.unlock"
  | "device.pair"
  | "device.unpair"
  | "device.delete"
  // Task Management
  | "task.create"
  | "task.update"
  | "task.delete"
  | "task.approve"
  | "task.reject"
  | "task.complete"
  // Rule Management
  | "rules.update_blacklist"
  | "rules.update_usage"
  | "rules.update_screen_time"
  // Authentication
  | "auth.login"
  | "auth.logout"
  | "auth.token_generated"
  | "auth.token_revoked"
  // Admin Actions
  | "admin.grant_support_access"
  | "admin.revoke_support_access"
  | "admin.set_admin_claim"
  | "admin.user_impersonation"
  | "admin.revoke_subscription"
  // Subscription
  | "subscription.verify_purchase"
  | "subscription.activated"
  // System
  | "system.heartbeat"
  | "system.error";

/**
 * Interface representing a single audit log entry.
 */
interface AuditLog {
  timestamp: admin.firestore.Timestamp;
  userId: string;              // uid (masterImei or childImei)
  userRole: "master" | "child" | "admin" | "support" | "unknown";
  action: AuditAction;
  resource: string;            // e.g. "children/123456789012345"
  resourceType: "device" | "task" | "rule" | "subscription" | "user" | "system";
  status: "success" | "failure" | "denied";
  metadata: {
    [key: string]: any;        // Additional context data
  };
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;       // For failures
  duration?: number;           // Execution time in ms
}

/**
 * Centralized Audit Logger utility class.
 * Handles all audit logging operations and ensures consistent logging across the system.
 */
class AuditLogger {
  private static collection = () => db().collection("audit_logs");

  /**
   * Log an audit event to Firestore and Cloud Logging.
   * @param action - The action being performed
   * @param userId - The user performing the action
   * @param userRole - The role of the user
   * @param resource - The resource being acted upon
   * @param resourceType - The type of resource
   * @param status - Whether the action succeeded, failed, or was denied
   * @param metadata - Additional context data
   * @param error - Optional error object for failures
   */
  static async log(
    action: AuditAction,
    userId: string,
    userRole: string,
    resource: string,
    resourceType: string,
    status: "success" | "failure" | "denied",
    metadata: Record<string, any> = {},
    error?: Error
  ): Promise<void> {
    try {
      const logEntry: AuditLog = {
        timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
        userId,
        userRole: userRole as any,
        action,
        resource,
        resourceType: resourceType as any,
        status,
        metadata,
        errorMessage: error?.message,
      };

      await this.collection().add(logEntry);

      // Parallel: Log to Cloud Logging for external systems
      if (status === "failure" || status === "denied") {
        functions.logger.error("Audit Event", {
          action,
          userId,
          status,
          error: error?.message,
        });
      } else {
        functions.logger.info("Audit Event", { action, userId, status });
      }
    } catch (loggingError) {
      // If logging fails, don't crash the main function
      functions.logger.error("Failed to write audit log", { error: loggingError });
    }
  }

  /**
   * Helper method for logging successful operations.
   * @param action - The action that succeeded
   * @param context - The callable context
   * @param resource - The resource that was acted upon
   * @param resourceType - The type of resource
   * @param metadata - Additional context data
   */
  static async logSuccess(
    action: AuditAction,
    context: CallableContext,
    resource: string,
    resourceType: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!context.auth) return;
    
    await this.log(
      action,
      context.auth.uid,
      (context.auth.token.role as string) || "unknown",
      resource,
      resourceType,
      "success",
      metadata
    );
  }

  /**
   * Helper method for logging failed operations.
   * @param action - The action that failed
   * @param context - The callable context (may be null for unauthenticated requests)
   * @param resource - The resource that was being acted upon
   * @param resourceType - The type of resource
   * @param error - The error that occurred
   * @param metadata - Additional context data
   */
  static async logFailure(
    action: AuditAction,
    context: CallableContext | null,
    resource: string,
    resourceType: string,
    error: Error,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.log(
      action,
      context?.auth?.uid || "anonymous",
      (context?.auth?.token?.role as string) || "unknown",
      resource,
      resourceType,
      "failure",
      metadata,
      error
    );
  }

  /**
   * Helper method for logging denied access attempts.
   * @param action - The action that was denied
   * @param context - The callable context
   * @param resource - The resource that access was denied to
   * @param resourceType - The type of resource
   * @param reason - The reason for denial
   * @param metadata - Additional context data
   */
  static async logDenied(
    action: AuditAction,
    context: CallableContext,
    resource: string,
    resourceType: string,
    reason: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!context.auth) return;
    
    await this.log(
      action,
      context.auth.uid,
      (context.auth.token.role as string) || "unknown",
      resource,
      resourceType,
      "denied",
      { ...metadata, reason }
    );
  }
}

/**
 * Custom error class with severity levels for better error tracking.
 */
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: "low" | "medium" | "high" | "critical",
    public metadata: Record<string, any> = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Centralized error handler that logs errors to Firestore and Cloud Logging.
 * @param error - The error to handle
 * @param context - The callable context (may be null)
 * @param functionName - The name of the function where the error occurred
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleError(
  error: Error,
  context: CallableContext | null,
  functionName: string
): Promise<void> {
  const errorDetails = {
    functionName,
    message: error.message,
    stack: error.stack,
    userId: context?.auth?.uid,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  };
  
  try {
    // Log to Firestore
    await db().collection("error_logs").add(errorDetails);
    
    // Log to Cloud Logging
    functions.logger.error("Function Error", { 
      ...errorDetails, 
      timestamp: new Date().toISOString() 
    });
    
    // Optional: Alert for critical errors
    if (error instanceof AppError && error.severity === "critical") {
      functions.logger.error("CRITICAL ERROR", { 
        ...errorDetails, 
        timestamp: new Date().toISOString() 
      });
    }
  } catch (loggingError) {
    functions.logger.error("Failed to log error", { error: loggingError });
  }
}

// --- Admin Panel Functions ---

/**
 * Sets the custom claim 'role: admin' for a specified user UID.
 * This function should only be callable by an existing admin or manually via the Firebase console.
 * For the purpose of this Admin Panel setup, we assume the initial admin user is created manually
 * and this function is used for subsequent admin user creation.
 * 
 * NOTE: In a real-world scenario, this function would be protected by a check
 * to ensure the caller is already an admin.
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
        
        // Log successful admin claim grant
        await AuditLogger.logSuccess(
            "admin.set_admin_claim",
            context,
            `users/${uid}`,
            "user",
            { targetUserId: uid, duration: Date.now() - startTime }
        );
        
        return { message: `Success! Custom claim 'admin' set for user ${uid}` };
    } catch (error) {
        // Log failure
        await AuditLogger.logFailure(
            "admin.set_admin_claim",
            context,
            `users/${data.uid || "unknown"}`,
            "user",
            error as Error,
            { targetUserId: data.uid }
        );
        
        console.error("Error setting custom claim:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to set admin claim.");
    }
});

/**
 * Cloud Function to revoke a subscription.
 * This function must be protected by the 'admin' custom claim.
 */
export const revokeSubscription = functions.https.onCall(async (data: { subscriptionId: string }, context: CallableContext) => {
    const startTime = Date.now();
    
    try {
        requireAdmin(context);
        const adminUid = context.auth?.uid;

        const subscriptionId = data.subscriptionId;
        if (!subscriptionId) {
            throw new functions.https.HttpsError("invalid-argument", "The function must be called with a subscriptionId.");
        }

        // Read the subscription document first to get the masterId
        const subDoc = await admin.firestore().collection("subscriptions").doc(subscriptionId).get();
        if (!subDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Subscription not found.");
        }
        const masterId = subDoc.data()?.masterId;

        // Update the Firestore status to 'revoked'
        await admin.firestore().collection("subscriptions").doc(subscriptionId).update({
            status: "revoked",
            revokedAt: admin.firestore.FieldValue.serverTimestamp(),
            revokedBy: adminUid ?? "unknown-admin"
        });
        
        if (masterId) {
            await admin.firestore().collection("masters").doc(masterId).update({
                isPremium: false
            });
        }

        // Log successful revocation
        await AuditLogger.logSuccess(
            "admin.revoke_subscription",
            context,
            `subscriptions/${subscriptionId}`,
            "subscription",
            { subscriptionId, masterId, duration: Date.now() - startTime }
        );

        return { message: `Subscription ${subscriptionId} successfully revoked.` };
    } catch (error) {
        // Log failure
        await AuditLogger.logFailure(
            "admin.revoke_subscription",
            context,
            `subscriptions/${data.subscriptionId}`,
            "subscription",
            error as Error,
            { subscriptionId: data.subscriptionId }
        );
        
        console.error("Error revoking subscription:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError("internal", "Failed to revoke subscription.");
    }
});

/**
 * Creates a new, unique 6-digit pairing code for a given child device ID.
 * The code is stored in Firestore and expires after 24 hours.
 * This function is callable from a client application.
 *
 * @param {{childId: string}} data - The data passed to the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{pairingCode: string}>} A promise that resolves with the generated pairing code.
 * @throws {functions.https.HttpsError} Throws an error if the childId is invalid,
 * or if a unique code cannot be generated.
 */
export const createPairingCode = functions.https.onCall(async (_data: Record<string, never>, context: CallableContext) => {
  const startTime = Date.now();
  const masterId = requireAuth(context);

  const pairingCodesRef = db().collection("pairingCodes");
  const maxAttempts = 10; // Verhindert eine Endlosschleife

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const pairingCodeDocRef = pairingCodesRef.doc(pairingCode);

      const doc = await pairingCodeDocRef.get();
      if (!doc.exists) {
        const now = admin.firestore.Timestamp.now();
        const expiresAtSeconds = now.seconds + 24 * 60 * 60; // 24 Stunden
        const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

        await pairingCodeDocRef.set({
          masterId: masterId,
          createdAt: now,
          expiresAt: expiresAt,
        });

        await AuditLogger.logSuccess(
          "device.pair",
          context,
          `pairingCodes/${pairingCode}`,
          "device",
          { codeType: "6digit", expiresIn: "24h", duration: Date.now() - startTime }
        );

        functions.logger.info(`Pairing code ${pairingCode} created for masterId ${masterId}`);
        return { pairingCode: pairingCode };
      }
    }

    // Resource exhausted - log and throw
    await AuditLogger.logFailure(
      "device.pair",
      context,
      `masters/${masterId}`,
      "device",
      new Error("Could not create unique pairing code after 10 attempts"),
      { codeType: "6digit", maxAttempts }
    );

    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Could not create a unique pairing code. Please try again later."
    );
  } catch (error) {
    // Only log if not already an HttpsError (which was already logged above)
    if (!(error instanceof functions.https.HttpsError)) {
      await AuditLogger.logFailure(
        "device.pair",
        context,
        `masters/${masterId}`,
        "device",
        error as Error,
        { codeType: "6digit" }
      );
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while creating the pairing code.",
        error
      );
    }
    throw error;
  }
});

/**
 * Validates a given pairing code. If the code is valid and not expired,
 * it creates a child device document linked to the master, then returns the
 * associated childId and deletes the code to prevent reuse.
 *
 * @param {{pairingCode: string}} data - The data passed to the function.
 * @param {string} data.pairingCode - The 6-digit pairing code to validate.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{childId: string}>} A promise that resolves with the childId associated with the code.
 * @throws {functions.https.HttpsError} Throws an error if the code is invalid, not found, expired, or malformed.
 */
export const validatePairingCode = functions.https.onCall(async (data: { pairingCode: string }, context: CallableContext) => {
  const startTime = Date.now();
  const { pairingCode } = data;
  const childId = requireAuth(context);

  if (!pairingCode || typeof pairingCode !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a 'pairingCode' string."
    );
  }

  const pairingCodeRef = db().collection("pairingCodes").doc(pairingCode);

  try {
    const doc = await pairingCodeRef.get();

    if (!doc.exists) {
      functions.logger.warn(`Pairing code ${pairingCode} not found.`);
      throw new functions.https.HttpsError(
        "not-found",
        "Invalid pairing code."
      );
    }

    const codeData = doc.data();
    if (!codeData) {
      functions.logger.error(`Pairing code ${pairingCode} exists but data is undefined.`);
      throw new functions.https.HttpsError(
        "internal",
        "Pairing code data is missing."
      );
    }

    const expiresAt = codeData.expiresAt as admin.firestore.Timestamp;
    const masterId = (codeData.masterId || codeData.masterImei) as string | undefined;

  if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
    functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'expiresAt' field.`);
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure."
        );
    }

    if (!masterId || typeof masterId !== "string") {
    functions.logger.error(`DATA_CORRUPTION Pairing code ${pairingCode} has invalid 'masterId' field.`);
        await pairingCodeRef.delete();
        functions.logger.info(`Malformed pairing code ${pairingCode} deleted.`);
        throw new functions.https.HttpsError(
            "internal",
            "Invalid pairing code data structure (masterId)."
        );
    }

    const now = admin.firestore.Timestamp.now();

    if (now.seconds > expiresAt.seconds) {
      functions.logger.info(`Pairing code ${pairingCode} has expired.`);
      await pairingCodeRef.delete();
      functions.logger.info(`Expired pairing code ${pairingCode} deleted.`);
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        "Pairing code has expired."
      );
    }

    const masterDoc = await db().collection("masters").doc(masterId).get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    // Subscription Check: Limit non-premium users to 1 child
    const masterData = masterDoc.data();
    const isPremium = masterData?.subscription?.status === "active";

    if (!isPremium) {
      const childrenQuery = await db().collection("children").where("masterImei", "==", masterId).get();
      if (!childrenQuery.empty && childrenQuery.size >= 1) {
        await AuditLogger.logDenied(
          "device.pair",
          context,
          `children/${childId}`,
          "device",
          "Free tier limited to 1 child device",
          { masterId, childCount: childrenQuery.size }
        );
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Free tier limited to 1 child device. Please upgrade to Premium."
        );
      }
    }

    const childDeviceRef = db().collection("children").doc(childId);
    await childDeviceRef.set({
      childImei: childId,
      masterImei: masterId,
      pairedAt: now,
    }, { merge: true });
    functions.logger.info(`Child device ${childId} successfully paired with master ${masterId} via pairing code.`);

    await pairingCodeRef.delete();
    functions.logger.info(`Valid pairing code ${pairingCode} used and deleted for childId ${childId}.`);

    await AuditLogger.logSuccess(
      "device.pair",
      context,
      `children/${childId}`,
      "device",
      { masterId, pairingMethod: "code", duration: Date.now() - startTime }
    );

    return { childId: childId };

  } catch (error) {
    // Only log if not already logged (e.g., logDenied was already called for free tier limit)
    if (error instanceof functions.https.HttpsError && error.code === "resource-exhausted") {
      // Already logged with logDenied above
      throw error;
    }
    
    await AuditLogger.logFailure(
      "device.pair",
      context,
      `children/${childId}`,
      "device",
      error as Error,
      { pairingMethod: "code" }
    );
    
    if (error instanceof functions.https.HttpsError) {
        functions.logger.warn(`Validation failed for code ${pairingCode}:`, error.message, error.code, error.details);
        throw error;
    }
    
    functions.logger.error(`Unexpected error validating code ${pairingCode}:`, error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while validating the pairing code.",
      error
    );
  }
  }
);

/**
 * Issues a fresh Firebase custom token for the currently authenticated user.
 * Use this to rotate tokens or refresh claims after role updates.
 */
export const generateCustomToken = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const uid = requireAuth(context);

    try {
      const user = await admin.auth().getUser(uid);
      const customToken = await admin.auth().createCustomToken(uid, user.customClaims || {});
      
      await AuditLogger.logSuccess(
        "auth.token_generated",
        context,
        `users/${uid}`,
        "user",
        { hasClaims: Object.keys(user.customClaims || {}).length > 0, duration: Date.now() - startTime }
      );
      
      return { customToken };
    } catch (error) {
      await AuditLogger.logFailure(
        "auth.token_generated",
        context,
        `users/${uid}`,
        "user",
        error as Error
      );
      
      functions.logger.error("Error generating custom token:", error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while generating the token.",
        error
      );
    }
  }
);

/**
 * Registers a master account for the authenticated user.
 * Creates a Firestore master document and assigns the "master" role claim.
 *
 * @param {{imei: string}} data - The data passed to the function.
 * @param {string} data.imei - The unique identifier for the master device.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{masterId: string}>} A promise that resolves with the master UID.
 */
export const registerMasterDevice = functions.https.onCall(
  async (data: { imei: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { imei } = data;
    if (!imei || typeof imei !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with a valid 'imei' string."
      );
    }

  const masterDeviceRef = db().collection("masters").doc(masterId);

  try {
    const doc = await masterDeviceRef.get();
    if (doc.exists) {
      await AuditLogger.logSuccess(
        "device.register",
        context,
        `masters/${masterId}`,
        "device",
        { imei, alreadyExists: true, duration: Date.now() - startTime }
      );
      return { masterId: masterId };
    }

    const now = admin.firestore.Timestamp.now();

    await masterDeviceRef.set({
      imei: imei,
      uid: masterId,
      role: "master",
      createdAt: now,
    });

    await admin.auth().setCustomUserClaims(masterId, { role: "master" });

    await AuditLogger.logSuccess(
      "device.register",
      context,
      `masters/${masterId}`,
      "device",
      { imei, duration: Date.now() - startTime }
    );

    functions.logger.info(`Master account registered for uid: ${masterId}`);
    return { masterId: masterId };

  } catch (error) {
    await AuditLogger.logFailure(
      "device.register",
      context,
      `masters/${masterId}`,
      "device",
      error as Error,
      { imei }
    );
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error registering master device:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while registering the device.",
      error
    );
  }
  }
);

/**
 * Generates a single-use pairing token for an authenticated master device.
 * This token can be used to link a new child device to this master account.
 * The token is valid for 5 minutes.
 *
 * @param {{}} data - The data passed to the function.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{pairingToken: string}>} A promise that resolves with the generated pairing token.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const generatePairingLink = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);

  const masterDeviceRef = db().collection("masters").doc(masterId);

  try {
    const doc = await masterDeviceRef.get();
    if (!doc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Master account not found."
      );
    }

    // Subscription Check: Limit non-premium users to 1 child
    const masterData = doc.data();
    const isPremium = masterData?.subscription?.status === "active";

    if (!isPremium) {
      const childrenQuery = await db().collection("children").where("masterImei", "==", masterId).get();
      if (!childrenQuery.empty && childrenQuery.size >= 1) {
        await AuditLogger.logDenied(
          "device.pair",
          context,
          `masters/${masterId}`,
          "device",
          "Free tier limited to 1 child device",
          { childCount: childrenQuery.size }
        );
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Free tier limited to 1 child device. Please upgrade to Premium."
        );
      }
    }

    const pairingToken = uuidv4();
    const now = admin.firestore.Timestamp.now();
    const expiresAtSeconds = now.seconds + 5 * 60; // Token expires in 5 minutes
    const expiresAt = new admin.firestore.Timestamp(expiresAtSeconds, now.nanoseconds);

    const tokenRef = db().collection("pairingTokens").doc(pairingToken);
    await tokenRef.set({
      masterId: masterId,
      createdAt: now,
      expiresAt: expiresAt,
    });

    await AuditLogger.logSuccess(
      "device.pair",
      context,
      `pairingTokens/${pairingToken}`,
      "device",
      { tokenType: "link", expiresIn: "5min", duration: Date.now() - startTime }
    );

    functions.logger.info(`Pairing token created for masterId: ${masterId}`);
    return { pairingToken: pairingToken };

  } catch (error) {
    await AuditLogger.logFailure(
      "device.pair",
      context,
      `masters/${masterId}`,
      "device",
      error as Error,
      { tokenType: "link" }
    );
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error generating pairing link:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while generating the pairing link.",
      error
    );
  }
  }
);

/**
 * Sets the lock state for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{childId: string, isLocked: boolean}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device to lock/unlock.
 * @param {boolean} data.isLocked - The desired lock state.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, isLocked: boolean}>} A promise that resolves with the new lock state.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const setDeviceLocked = functions.https.onCall(
  async (data: { childId: string; isLocked: boolean }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { childId, isLocked } = data;

    if (
      !childId || typeof childId !== "string" ||
      typeof isLocked !== "boolean"
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'childId' and 'isLocked' boolean."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        isLocked ? "device.lock" : "device.unlock",
        context,
        `children/${childId}`,
        "device",
        "Master not authorized for this child",
        { childId, isLocked }
      );
      throw new functions.https.HttpsError(
        "permission-denied",
        "This master device is not authorized to control the specified child device."
      );
    }

    try {
      await childDeviceRef.update({
        isLocked: isLocked,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        isLocked ? "device.lock" : "device.unlock",
        context,
        `children/${childId}`,
        "device",
        { childId, isLocked, duration: Date.now() - startTime }
      );

      functions.logger.info(`Lock state for child ${childId} set to ${isLocked} by master ${masterId}.`);
      return { success: true, isLocked: isLocked };

    } catch (error) {
      await AuditLogger.logFailure(
        isLocked ? "device.lock" : "device.unlock",
        context,
        `children/${childId}`,
        "device",
        error as Error,
        { childId, isLocked }
      );
      
      functions.logger.error(`Failed to set lock state for child ${childId}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while updating the device lock state.",
        error
      );
    }
  }
);

/**
 * Updates the list of blacklisted apps for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{childId: string, appBlacklist: string[]}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {string[]} data.appBlacklist - An array of package names to be blacklisted.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const updateAppBlacklist = functions.https.onCall(
  async (data: { childId: string; appBlacklist: string[] }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { childId, appBlacklist } = data;

    if (
      !childId || typeof childId !== "string" ||
      !Array.isArray(appBlacklist)
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'childId' and 'appBlacklist' array."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "rules.update_blacklist",
        context,
        `children/${childId}`,
        "rule",
        "Master not authorized for this child",
        { childId, appCount: appBlacklist.length }
      );
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        appBlacklist: appBlacklist,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      await AuditLogger.logSuccess(
        "rules.update_blacklist",
        context,
        `children/${childId}`,
        "rule",
        { childId, appCount: appBlacklist.length, duration: Date.now() - startTime }
      );
      
      functions.logger.info(`App blacklist for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "rules.update_blacklist",
        context,
        `children/${childId}`,
        "rule",
        error as Error,
        { childId, appCount: appBlacklist.length }
      );
      
      functions.logger.error(`Failed to update blacklist for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to update app blacklist.", error);
    }
  }
);

/**
 * Sets screen time usage rules for a specific child device.
 * This function requires authentication from the master device.
 *
 * @param {{childId: string, usageRules: object}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {object} data.usageRules - An object containing the usage rules to be applied.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails, permissions are denied, or arguments are invalid.
 */
export const setUsageRules = functions.https.onCall(
  async (data: { childId: string; usageRules: object }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { childId, usageRules } = data;
    if (
      !childId || typeof childId !== "string" ||
      typeof usageRules !== "object" || usageRules === null
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include valid 'childId' and 'usageRules' object."
      );
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "rules.update_usage",
        context,
        `children/${childId}`,
        "rule",
        "Master not authorized for this child",
        { childId }
      );
      throw new functions.https.HttpsError("permission-denied", "Master device not authorized for this child.");
    }

    try {
      await childDeviceRef.update({
        usageRules: usageRules,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      await AuditLogger.logSuccess(
        "rules.update_usage",
        context,
        `children/${childId}`,
        "rule",
        { childId, duration: Date.now() - startTime }
      );
      
      functions.logger.info(`Usage rules for child ${childId} updated by master ${masterId}.`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "rules.update_usage",
        context,
        `children/${childId}`,
        "rule",
        error as Error,
        { childId }
      );
      
      functions.logger.error(`Failed to set usage rules for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to set usage rules.", error);
    }
  }
);

/**
 * Records a heartbeat from a child device to indicate it's online.
 * This function updates the `lastSeen` timestamp for the child device.
 *
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if the childImei is invalid or the device is not found.
 */
export const recordHeartbeat = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const childDoc = await childDeviceRef.get();
      if (!childDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "The specified child device does not exist."
        );
      }

      await childDeviceRef.update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      });

      await AuditLogger.logSuccess(
        "system.heartbeat",
        context,
        `children/${childId}`,
        "system",
        { childId, duration: Date.now() - startTime }
      );

      return { success: true };

    } catch (error) {
      await AuditLogger.logFailure(
        "system.heartbeat",
        context,
        `children/${childId}`,
        "system",
        error as Error,
        { childId }
      );
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error(`Failed to record heartbeat for child ${childId}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while recording heartbeat.",
        error
      );
    }
  }
);

/**
 * Registers or updates the FCM token for a child device. This token is required
 * to send push notifications (e.g., for rule synchronization) to the device.
 *
 * @param {{token: string}} data - The data passed to the function.
 * @param {string} data.token - The Firebase Cloud Messaging (FCM) registration token.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if arguments are invalid or the device is not found.
 */
export const registerFcmToken = functions.https.onCall(
  async (data: { token: string }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    const { token } = data;

    if (!token || typeof token !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'token'."
      );
    }

    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
          throw new functions.https.HttpsError("not-found", "Child device not found.");
      }

      await childDeviceRef.update({ fcmToken: token });
      
      await AuditLogger.logSuccess(
        "device.register",
        context,
        `children/${childId}`,
        "device",
        { tokenType: "fcm", childId, duration: Date.now() - startTime }
      );
      
      functions.logger.info(`FCM token for child ${childId} has been registered.`);
      return { success: true };

    } catch (error) {
        await AuditLogger.logFailure(
          "device.register",
          context,
          `children/${childId}`,
          "device",
          error as Error,
          { tokenType: "fcm", childId }
        );
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
      functions.logger.error(`Failed to register FCM token for child ${childId}:`, error);
        throw new functions.https.HttpsError("internal", "Failed to register FCM token.", error);
    }
  }
);

/**
 * Retrieves the current rules (lock state, app blacklist, usage rules) for a child device.
 * This is called by the child device to synchronize its local state.
 *
 * @param {{childId: string}} data - The data passed to the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{isLocked: boolean, appBlacklist: string[], usageRules: object}>} A promise that resolves with the rules.
 * @throws {functions.https.HttpsError} Throws an error if arguments are invalid or the device is not found.
 */
export const getRulesForChild = functions.https.onCall(
  async (data: { childId: string }, _context: CallableContext) => {
    const { childId } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'childId'."
      );
    }

    const childDeviceRef = db().collection("children").doc(childId);

    try {
      const doc = await childDeviceRef.get();
      if (!doc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Child device not found."
        );
      }

      const data = doc.data();
      return {
        isLocked: data?.isLocked || false,
        appBlacklist: data?.appBlacklist || [],
        usageRules: data?.usageRules || {},
      };

    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      functions.logger.error(`Failed to get rules for child ${childId}:`, error);
      throw new functions.https.HttpsError(
        "internal",
        "An unexpected error occurred while retrieving rules.",
        error
      );
    }
  }
);

/**
 * A Firestore trigger (v2) that sends a "SYNC_RULES" command via FCM to a child
 * device whenever its lock state, app blacklist, or usage rules are modified.
 * This ensures the child device applies new settings in near real-time.
 *
 * @param {FirestoreEvent<Change<DocumentSnapshot> | undefined, {childId: string}>} event - The Firestore event object.
 * @returns {Promise<void>} A promise that resolves when the operation is complete.
 */
export const onChildDeviceUpdateV2 = onDocumentUpdated("children/{childId}", async (event) => {
    const childId = event.params.childId;
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();

    if (!newData) {
        functions.logger.info(`Child device ${childId} deleted, no action taken.`);
        return;
    }

    if (!oldData) {
        functions.logger.info(`New child device ${childId} created, no action taken on update.`);
        return;
    }

    const fcmToken = newData.fcmToken;
    if (!fcmToken || typeof fcmToken !== "string") {
        functions.logger.warn(`No valid FCM token for child ${childId}, cannot send notification.`);
        return;
    }

    const payload: { [key: string]: string } = {};

    if (newData.isLocked !== oldData.isLocked) {
        payload.isLocked = String(newData.isLocked);
    }

    if (JSON.stringify(newData.appBlacklist) !== JSON.stringify(oldData.appBlacklist)) {
        payload.appBlacklist = JSON.stringify(newData.appBlacklist);
    }

    if (JSON.stringify(newData.usageRules) !== JSON.stringify(oldData.usageRules)) {
        payload.usageRules = JSON.stringify(newData.usageRules);
    }

    if (Object.keys(payload).length === 0) {
        functions.logger.info(`No relevant changes detected for child ${childId}.`);
        return;
    }

    const message = {
        token: fcmToken,
        data: payload,
        notification: {
            title: "Device Settings Updated",
            body: "Your device settings have been updated by your parent.",
        },
    };

    try {
        await getMessaging().send(message);
        functions.logger.info(`Successfully sent FCM message to child ${childId} for data update.`);
    } catch (error) {
        functions.logger.error(`Failed to send FCM message to child ${childId}:`, error);
    }
});

/**
 * A Firestore trigger (v2) that simulates AI image analysis when a task is completed.
 * Real implementation would use Google Cloud Vision API.
 */
export const analyzeTaskPhoto = onDocumentUpdated("children/{childId}/tasks/{taskId}", async (event) => {
    const newData = event.data?.after.data();
    const oldData = event.data?.before.data();

    if (!newData || !oldData) return;

    // Only run analysis if status changed to 'pending_approval' and photoUrl exists
    if (newData.status === "pending_approval" && oldData.status !== "pending_approval" && newData.photoUrl) {
        const taskId = event.params.taskId;
        const childId = event.params.childId;

        functions.logger.info(`Starting AI analysis for task ${taskId} (child: ${childId}) photo: ${newData.photoUrl}`);

        // MOCK AI ANALYSIS
        // In production: const client = new vision.ImageAnnotatorClient(); ...
        const mockAnalysis = {
            labels: ["Room", "Furniture", "Clean"],
            safeSearch: {
                adult: "VERY_UNLIKELY",
                violence: "VERY_UNLIKELY",
            },
            analyzedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        try {
            await event.data?.after.ref.update({
                aiAnalysis: mockAnalysis
            });
            functions.logger.info(`AI analysis completed for task ${taskId}`);
        } catch (error) {
            functions.logger.error("Failed to update task with AI analysis:", error);
        }
    }
});

/**
 * Creates a new task for a child device, assigned by an authenticated master device.
 *
 * @param {{childId: string, description: string, deadlineISO: string}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device receiving the task.
 * @param {string} data.description - The description of the task.
 * @param {string} data.deadlineISO - The task's deadline in ISO 8601 format.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, taskId: string}>} A promise that resolves with the new task's ID.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const createTask = functions.https.onCall(
  async (data: { childId: string; description: string; deadlineISO: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { childId, description, deadlineISO } = data;

    if (!childId || !description || !deadlineISO) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "task.create",
        context,
        `children/${childId}/tasks`,
        "task",
        "Master not authorized for this child",
        { childId, description }
      );
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    try {
      const taskRef = childDeviceRef.collection("tasks").doc();
      await taskRef.set({
        description: description,
        deadline: admin.firestore.Timestamp.fromDate(new Date(deadlineISO)),
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        masterImei: masterId, // Denormalize for easier querying
      });

      await AuditLogger.logSuccess(
        "task.create",
        context,
        `children/${childId}/tasks/${taskRef.id}`,
        "task",
        { childId, taskId: taskRef.id, description, deadline: deadlineISO, duration: Date.now() - startTime }
      );

      functions.logger.info(`Task ${taskRef.id} created for child ${childId}`);
      return { success: true, taskId: taskRef.id };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.create",
        context,
        `children/${childId}/tasks`,
        "task",
        error as Error,
        { childId, description }
      );
      throw error;
    }
  }
);

/**
 * Marks a task as complete from the child's side and attaches a photo proof URL.
 * The task status is updated to 'pending_approval'.
 *
 * @param {{taskId: string, photoUrl: string}} data - The data for the function.
 * @param {string} data.taskId - The ID of the task being completed.
 * @param {string} data.photoUrl - The URL of the uploaded photo proof.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if arguments are invalid or the task is not found.
 */
export const completeTask = functions.https.onCall(
  async (data: { taskId: string; photoUrl: string }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    const { taskId, photoUrl } = data;

    if (!taskId || !photoUrl) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const taskRef = db().collection("children").doc(childId).collection("tasks").doc(taskId);

    try {
      const taskDoc = await taskRef.get();
      if (!taskDoc.exists) {
          throw new functions.https.HttpsError("not-found", "The specified task does not exist.");
      }

      const current = taskDoc.data() as any;
      if (current.status && current.status !== "pending") {
        throw new functions.https.HttpsError("failed-precondition", "Task cannot transition to pending_approval from current state.");
      }
      
      await taskRef.update({
        status: "pending_approval",
        photoUrl: photoUrl,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      await AuditLogger.logSuccess(
        "task.complete",
        context,
        `children/${childId}/tasks/${taskId}`,
        "task",
        { childId, taskId, duration: Date.now() - startTime }
      );
      
      functions.logger.info(`TASK_COMPLETED taskId=${taskId} child=${childId}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.complete",
        context,
        `children/${childId}/tasks/${taskId}`,
        "task",
        error as Error,
        { childId, taskId }
      );
      throw error;
    }
  }
);

/**
 * Approves a completed task. This function is called by the master device after
 * reviewing the photo proof. The task status is updated to 'approved'.
 *
 * @param {{childId: string, taskId: string}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device that completed the task.
 * @param {string} data.taskId - The ID of the task to approve.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails or arguments are invalid.
 */
export const approveTask = functions.https.onCall(
  async (data: { childId: string; taskId: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { childId, taskId } = data;

    if (!childId || !taskId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    const childDoc = await childDeviceRef.get();
    if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
      await AuditLogger.logDenied(
        "task.approve",
        context,
        `children/${childId}/tasks/${taskId}`,
        "task",
        "Master not authorized for this child",
        { childId, taskId }
      );
      throw new functions.https.HttpsError("permission-denied", "Master not authorized for this child.");
    }

    try {
      const taskRef = childDeviceRef.collection("tasks").doc(taskId);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Task not found.");
      }
      const taskData = taskSnap.data() as any;
      if (taskData.status !== "pending_approval") {
        throw new functions.https.HttpsError("failed-precondition", "Task not in pending_approval state.");
      }
      
      await taskRef.update({ status: "approved", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      await AuditLogger.logSuccess(
        "task.approve",
        context,
        `children/${childId}/tasks/${taskId}`,
        "task",
        { childId, taskId, duration: Date.now() - startTime }
      );
      
      functions.logger.info(`TASK_APPROVED taskId=${taskId} child=${childId} master=${masterId}`);
      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "task.approve",
        context,
        `children/${childId}/tasks/${taskId}`,
        "task",
        error as Error,
        { childId, taskId }
      );
      throw error;
    }
  }
);

/**
 * Verifies a Google Play subscription purchase and grants entitlement to the master device.
 * It calls the Google Play Developer API to validate the purchase token.
 *
 * @param {{purchaseToken: string, sku: string}} data - The data for the function.
 * @param {string} data.purchaseToken - The purchase token from the Google Play Billing library.
 * @param {string} data.sku - The product ID (SKU) of the subscription.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean, subscriptionStatus: string}>} A promise that resolves with the new subscription status.
 * @throws {functions.https.HttpsError} Throws an error if authentication or purchase verification fails.
 */
export const verifyPurchase = functions.https.onCall(
  async (data: { purchaseToken: string; sku: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { purchaseToken, sku } = data;

    if (!purchaseToken || !sku) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    
    try {
      const masterDoc = await masterDeviceRef.get();
      if (!masterDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Master account not found.");
      }

      const isPurchaseValid = await verifyPlaySubscription(
          "com.minimaster.masterapp",
          sku,
          purchaseToken
      ).catch((e) => {
          functions.logger.error("Error verifying Google Play purchase:", e);
          return false;
      });

      if (isPurchaseValid) {
        const now = admin.firestore.Timestamp.now();
        const subscriptionType = sku;
        const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000);

        await masterDeviceRef.update({
          subscription: {
            status: "active",
            type: subscriptionType,
            startedAt: now,
            expiresAt: expiresAt,
          },
        });
        
        await AuditLogger.logSuccess(
          "subscription.verify_purchase",
          context,
          `masters/${masterId}`,
          "subscription",
          { masterId, sku, subscriptionType, duration: Date.now() - startTime }
        );
        
        functions.logger.info(`Subscription ${sku} activated for master ${masterId}.`);
        return { success: true, subscriptionStatus: "active" };
      } else {
        await AuditLogger.logFailure(
          "subscription.verify_purchase",
          context,
          `masters/${masterId}`,
          "subscription",
          new Error("Purchase verification failed"),
          { masterId, sku }
        );
        
        functions.logger.warn(`Invalid purchase token received for master ${masterId}.`);
        throw new functions.https.HttpsError("permission-denied", "Purchase verification failed.");
      }
    } catch (error) {
      if (!(error instanceof functions.https.HttpsError)) {
        await AuditLogger.logFailure(
          "subscription.verify_purchase",
          context,
          `masters/${masterId}`,
          "subscription",
          error as Error,
          { masterId, sku }
        );
      }
      throw error;
    }
  }
);

/**
 * Gets the current subscription status for an authenticated master device.
 *
 * @param {{}} data - The data for the function.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{subscriptionStatus: object}>} A promise that resolves with the subscription status object.
 * @throws {functions.https.HttpsError} Throws an error if authentication fails.
 */
export const getSubscriptionStatus = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    const masterId = requireAuth(context);
    const masterDeviceRef = db().collection("masters").doc(masterId);
    const masterDoc = await masterDeviceRef.get();
    if (!masterDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Master account not found.");
    }

    const subscription = masterDoc.data()?.subscription || { status: "none" };
    return { subscriptionStatus: subscription };
  }
);

/**
 * Reports daily usage statistics for a child device.
 * Stores the data in a 'usageHistory' sub-collection for the child.
 *
 * @param {{childId: string, date: string, usageMillis: number}} data - The data for the function.
 * @param {string} data.childId - The unique identifier of the child device.
 * @param {string} data.date - The date of the report (YYYY-MM-DD).
 * @param {number} data.usageMillis - The total usage in milliseconds for that day.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{success: boolean}>} A promise that resolves with a success status.
 */
export const reportDailyUsage = functions.https.onCall(
  async (data: { date: string; usageMillis: number }, context: CallableContext) => {
    const startTime = Date.now();
    const childId = requireAuth(context);
    const { date, usageMillis } = data;

    if (!date || typeof usageMillis !== "number") {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }

    const historyRef = db().collection("children").doc(childId).collection("usageHistory").doc(date);

    try {
      await historyRef.set({
        date: date,
        totalUsageMillis: usageMillis,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }); // Merge to allow partial updates during the day

      await AuditLogger.logSuccess(
        "system.heartbeat",
        context,
        `children/${childId}/usageHistory/${date}`,
        "system",
        { childId, date, usageMillis, duration: Date.now() - startTime }
      );

      return { success: true };
    } catch (error) {
      await AuditLogger.logFailure(
        "system.heartbeat",
        context,
        `children/${childId}/usageHistory/${date}`,
        "system",
        error as Error,
        { childId, date }
      );
      
      functions.logger.error(`Failed to report usage for child ${childId}:`, error);
      throw new functions.https.HttpsError("internal", "Failed to save usage report.", error);
    }
  }
);

/**
 * Verifies a subscription's validity with the Google Play Developer API.
 * @param {string} packageName - The application's package name.
 * @param {string} productId - The subscription product ID (SKU).
 * @param {string} purchaseToken - The token provided by the client upon purchase.
 * @returns {Promise<boolean>} A promise that resolves to true if the subscription is active and valid.
 */
async function verifyPlaySubscription(packageName: string, productId: string, purchaseToken: string): Promise<boolean> {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const androidpublisher = google.androidpublisher({ version: "v3", auth: auth });
  const res = await androidpublisher.purchases.subscriptions.get({
    packageName, subscriptionId: productId, token: purchaseToken,
  });
  const body = res.data;
  return body && (body as any).purchaseState === 0 && (body as any).expiryTimeMillis > Date.now();
}

/**
 * Validates a single-use pairing token. If valid, it creates a permanent
 * child device profile in Firestore, linking it to the master device that
 * generated the token. The token is then deleted.
 *
 * @param {{pairingToken: string}} data - The data for the function.
 * @param {string} data.pairingToken - The single-use token for pairing.
 * @param {CallableContext} _context - The context of the function call (unused).
 * @returns {Promise<{childId: string}>} A promise that resolves with the master device's ID, confirming the link.
 * @throws {functions.https.HttpsError} Throws an error if the token is invalid, expired, or arguments are missing.
 */
export const validatePairingToken = functions.https.onCall(
  async (data: { pairingToken: string }, context: CallableContext) => {
    const startTime = Date.now();
    const { pairingToken } = data;
    const childId = requireAuth(context);

    if (!pairingToken || typeof pairingToken !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Request must include a valid 'pairingToken'."
      );
    }

  const tokenRef = db().collection("pairingTokens").doc(pairingToken);

  try {
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Pairing token is invalid.");
    }

    const tokenData = tokenDoc.data();
    if (!tokenData) {
      await tokenRef.delete();
      throw new functions.https.HttpsError("internal", "Pairing token data is missing.");
    }

    const expiresAt = tokenData.expiresAt as admin.firestore.Timestamp;
    const masterId = (tokenData.masterId || tokenData.masterImei) as string | undefined;

    if (!expiresAt || !(expiresAt instanceof admin.firestore.Timestamp)) {
      functions.logger.error(`DATA_CORRUPTION Pairing token ${pairingToken} has invalid 'expiresAt' field.`);
      await tokenRef.delete();
      throw new functions.https.HttpsError("internal", "Invalid pairing token data structure.");
    }

    const now = admin.firestore.Timestamp.now();
    if (now.seconds > expiresAt.seconds) {
      await tokenRef.delete();
      throw new functions.https.HttpsError("deadline-exceeded", "Pairing token has expired.");
    }

    if (!masterId || typeof masterId !== "string") {
      await tokenRef.delete();
      throw new functions.https.HttpsError("internal", "Pairing token data is missing masterId.");
    }

    const childDeviceRef = db().collection("children").doc(childId);
    await childDeviceRef.set({
      childImei: childId,
      masterImei: masterId,
      pairedAt: now,
    });

    await tokenRef.delete();

    await AuditLogger.logSuccess(
      "device.pair",
      context,
      `children/${childId}`,
      "device",
      { masterId, pairingMethod: "token", duration: Date.now() - startTime }
    );

  functions.logger.info(`Child device ${childId} successfully paired with master ${masterId}.`);
  return { childId: childId, masterId: masterId };

  } catch (error) {
    await AuditLogger.logFailure(
      "device.pair",
      context,
      `children/${childId}`,
      "device",
      error as Error,
      { pairingMethod: "token" }
    );
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    functions.logger.error("Error validating pairing token:", error);
    throw new functions.https.HttpsError(
      "internal",
      "An unexpected error occurred while validating the pairing token.",
      error
    );
  }
  }
);

// --- PUSH NOTIFICATIONS ---

/**
 * Cloud Function that triggers when a task document is updated.
 * It sends a push notification to the master device when a task is submitted for review.
 */
export const onTaskStatusChange = functions.firestore
    .document("/children/{childId}/tasks/{taskId}")
    .onUpdate(async (change, context) => {
        const newValue = change.after.data();
        const previousValue = change.before.data();

        if (!newValue || !previousValue) {
            functions.logger.warn(`Task update ${context.params.taskId} has missing before/after data. Skipping notification.`);
            return;
        }

        // Check if the status has changed to pending_approval
        if (newValue.status === "pending_approval" && previousValue.status !== "pending_approval") {
            const masterImei = newValue.masterImei;
            if (!masterImei) {
                functions.logger.warn("No masterImei found for this task. Cannot send notification.");
                return;
            }

            // Get the master's FCM token from the masters collection
            const masterDoc = await db().collection("masters").doc(masterImei).get();
            const fcmToken = masterDoc.data()?.fcmToken;

            if (!fcmToken) {
                functions.logger.warn(`Master ${masterImei} does not have an FCM token. Cannot send notification.`);
                return;
            }

            const message = {
                token: fcmToken,
                notification: {
                    title: "Task Submitted for Review",
                    body: `Your child has submitted the task "${newValue.description || ""}" for your review.`,
                },
                data: {
                    taskId: context.params.taskId,
                    childId: context.params.childId
                }
            };

            try {
                await getMessaging().send(message);
                functions.logger.info(`Notification sent to master ${masterImei} for task ${context.params.taskId}`);
            } catch (error) {
                functions.logger.error("Error sending notification:", error);
            }
        }
    });

/**
 * Updates the FCM token for a master device.
 * This allows the backend to send push notifications to the correct device.
 */
export const updateFCMToken = functions.https.onCall(async (data: { fcmToken: string }, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const { fcmToken } = data;

    if (!fcmToken || typeof fcmToken !== "string") {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Request must include valid 'fcmToken'."
        );
    }

    const masterDeviceRef = db().collection("masters").doc(masterId);
    
    try {
        const masterDoc = await masterDeviceRef.get();
        if (!masterDoc.exists) {
            throw new functions.https.HttpsError(
                "not-found",
                "Master account not found."
            );
        }

        await masterDeviceRef.update({
            fcmToken: fcmToken,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await AuditLogger.logSuccess(
            "device.register",
            context,
            `masters/${masterId}`,
            "device",
            { tokenType: "fcm", masterId, duration: Date.now() - startTime }
        );

        functions.logger.info(`FCM token updated for master ${masterId}.`);
        return { success: true };

    } catch (error) {
        await AuditLogger.logFailure(
            "device.register",
            context,
            `masters/${masterId}`,
            "device",
            error as Error,
            { tokenType: "fcm", masterId }
        );
        
        functions.logger.error(`Failed to update FCM token for master ${masterId}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            "An unexpected error occurred while updating the FCM token.",
            error
        );
    }
});

/**
 * Deletes a user account and all associated data.
 * This function should be called when a user requests to delete their account.
 */
export const deleteUserAccount = functions.https.onCall(async (_data: Record<string, never>, context: CallableContext) => {
    const startTime = Date.now();
    const masterId = requireAuth(context);
    const masterDeviceRef = db().collection("masters").doc(masterId);
    
    try {
        const masterDoc = await masterDeviceRef.get();
        if (!masterDoc.exists) {
            throw new functions.https.HttpsError(
                "not-found",
                "Master account not found."
            );
        }

        // 1. Delete all children associated with the master
        const childrenSnapshot = await db().collection("children").where("masterImei", "==", masterId).get();
        const deleteChildrenPromises = childrenSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deleteChildrenPromises);

        // 2. Delete all tasks associated with the master
        const tasksSnapshot = await db().collectionGroup("tasks").where("masterImei", "==", masterId).get();
        const deleteTasksPromises = tasksSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deleteTasksPromises);

        // 3. Delete all subscriptions associated with the master
        const subsSnapshot = await db().collection("subscriptions").where("masterId", "==", masterId).get();
        const deleteSubsPromises = subsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deleteSubsPromises);

        // 4. Delete the master document itself
        await masterDeviceRef.delete();

        // 5. Delete the Firebase Auth user (if using Firebase Auth)
        // This part needs to be implemented when migrating to Firebase Auth tokens
        await admin.auth().deleteUser(masterId);

        await AuditLogger.logSuccess(
            "device.delete",
            context,
            `masters/${masterId}`,
            "device",
            { 
                masterId, 
                childrenDeleted: childrenSnapshot.size,
                tasksDeleted: tasksSnapshot.size,
                subscriptionsDeleted: subsSnapshot.size,
                duration: Date.now() - startTime 
            }
        );

        functions.logger.info(`User account and all associated data deleted for master ${masterId}.`);
        return { success: true };

    } catch (error) {
        await AuditLogger.logFailure(
            "device.delete",
            context,
            `masters/${masterId}`,
            "device",
            error as Error,
            { masterId }
        );
        
        functions.logger.error(`Failed to delete user account for master ${masterId}:`, error);
        throw new functions.https.HttpsError(
            "internal",
            "An unexpected error occurred while deleting the user account.",
            error
        );
    }
});

/**
 * Creates a new support ticket.
 */
export const createSupportTicket = functions.https.onCall(async (data: { problemDescription: string }, context: CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { problemDescription } = data;

    if (!problemDescription || typeof problemDescription !== "string" || problemDescription.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "Problem description is required.");
    }

    const masterImei = context.auth.uid;

    try {
        const ticketRef = await db().collection("supportTickets").add({
            masterImei: masterImei,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: "open",
            problemDescription: problemDescription.trim(),
            accessGranted: false
        });

        functions.logger.info(`Support ticket created: ${ticketRef.id} for master ${masterImei}`);
        return { success: true, ticketId: ticketRef.id };

    } catch (error) {
        functions.logger.error(`Failed to create support ticket for master ${masterImei}:`, error);
        throw new functions.https.HttpsError("internal", "Failed to create support ticket.", error);
    }
});

/**
 * Grants temporary support access.
 */
export const grantSupportAccess = functions.https.onCall(async (data: { ticketId: string }, context: CallableContext) => {
    const startTime = Date.now();
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { ticketId } = data;

    if (!ticketId || typeof ticketId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Ticket ID is required.");
    }

    const masterImei = context.auth.uid;

    try {
        // Verify the ticket belongs to the user
        const ticketDoc = await db().collection("supportTickets").doc(ticketId).get();
        if (!ticketDoc.exists || ticketDoc.data()?.masterImei !== masterImei) {
            await AuditLogger.logDenied(
                "admin.grant_support_access",
                context,
                `supportTickets/${ticketId}`,
                "system",
                "Ticket not found or access denied",
                { ticketId }
            );
            throw new functions.https.HttpsError("permission-denied", "Ticket not found or access denied.");
        }

        // Create a support access grant (valid for 48 hours)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        const grantRef = await db().collection("supportAccessGrants").add({
            masterImei: masterImei,
            ticketId: ticketId,
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            status: "active"
        });

        // Update the ticket
        await db().collection("supportTickets").doc(ticketId).update({
            accessGranted: true,
            accessGrantId: grantRef.id
        });

        await AuditLogger.logSuccess(
            "admin.grant_support_access",
            context,
            `supportAccessGrants/${grantRef.id}`,
            "system",
            { ticketId, grantId: grantRef.id, expiresAt: expiresAt.toISOString(), duration: Date.now() - startTime }
        );

        functions.logger.info(`Support access granted: ${grantRef.id} for ticket ${ticketId}`);
        return { success: true, grantId: grantRef.id, expiresAt: expiresAt.toISOString() };

    } catch (error) {
        await AuditLogger.logFailure(
            "admin.grant_support_access",
            context,
            `supportTickets/${ticketId}`,
            "system",
            error as Error,
            { ticketId }
        );
        
        functions.logger.error(`Failed to grant support access for ticket ${ticketId}:`, error);
        throw new functions.https.HttpsError("internal", "Failed to grant support access.", error);
    }
});

/**
 * Revokes support access.
 */
export const revokeSupportAccess = functions.https.onCall(async (data: { grantId: string }, context: CallableContext) => {
    const startTime = Date.now();
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
    }

    const { grantId } = data;

    if (!grantId || typeof grantId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Grant ID is required.");
    }

    const masterImei = context.auth.uid;

    try {
        // Verify the grant belongs to the user
        const grantDoc = await db().collection("supportAccessGrants").doc(grantId).get();
        if (!grantDoc.exists || grantDoc.data()?.masterImei !== masterImei) {
            await AuditLogger.logDenied(
                "admin.revoke_support_access",
                context,
                `supportAccessGrants/${grantId}`,
                "system",
                "Grant not found or access denied",
                { grantId }
            );
            throw new functions.https.HttpsError("permission-denied", "Grant not found or access denied.");
        }

        // Revoke the grant
        await db().collection("supportAccessGrants").doc(grantId).update({
            status: "revoked"
        });

        // Update the associated ticket
        const ticketId = grantDoc.data()?.ticketId;
        if (ticketId) {
            await db().collection("supportTickets").doc(ticketId).update({
                accessGranted: false
            });
        }

        await AuditLogger.logSuccess(
            "admin.revoke_support_access",
            context,
            `supportAccessGrants/${grantId}`,
            "system",
            { grantId, ticketId, duration: Date.now() - startTime }
        );

        functions.logger.info(`Support access revoked: ${grantId}`);
        return { success: true };

    } catch (error) {
        await AuditLogger.logFailure(
            "admin.revoke_support_access",
            context,
            `supportAccessGrants/${grantId}`,
            "system",
            error as Error,
            { grantId }
        );
        
        functions.logger.error(`Failed to revoke support access for grant ${grantId}:`, error);
        throw new functions.https.HttpsError("internal", "Failed to revoke support access.", error);
    }
});

/**
 * Scheduled function to clean up expired support grants.
 * Runs every hour.
 */
export const cleanupExpiredGrants = functions.pubsub.schedule("every 1 hours").onRun(async (_context) => {
    const now = admin.firestore.Timestamp.now();

    try {
        const expiredGrantsSnapshot = await db().collection("supportAccessGrants")
            .where("status", "==", "active")
            .where("expiresAt", "<=", now)
            .get();

        if (expiredGrantsSnapshot.empty) {
            functions.logger.info("No expired grants to clean up.");
            return null;
        }

        const batch = db().batch();
        const ticketUpdates: { [ticketId: string]: boolean } = {};

        expiredGrantsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { status: "expired" });
            const ticketId = doc.data().ticketId;
            if (ticketId) {
                ticketUpdates[ticketId] = true;
            }
        });

        await batch.commit();

        // Update associated tickets
        for (const ticketId of Object.keys(ticketUpdates)) {
            await db().collection("supportTickets").doc(ticketId).update({
                accessGranted: false
            });
        }

        functions.logger.info(`Cleaned up ${expiredGrantsSnapshot.size} expired support grants.`);
        return null;

    } catch (error) {
        functions.logger.error("Failed to clean up expired grants:", error);
        return null;
    }
});

/**
 * Scheduled Function: Send daily error report
 * Runs daily at 9 AM Europe/Berlin timezone
 * Aggregates all errors from the last 24 hours and logs a summary
 */
export const sendDailyErrorReport = functions.pubsub
    .schedule("0 9 * * *") // Daily at 9 AM
    .timeZone("Europe/Berlin")
    .onRun(async (_context) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        try {
            // Aggregate errors from the last 24 hours
            const errorSnapshot = await db()
                .collection("error_logs")
                .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(yesterday))
                .where("timestamp", "<", admin.firestore.Timestamp.fromDate(today))
                .get();
            
            if (errorSnapshot.empty) {
                functions.logger.info("Daily Error Report: No errors in the last 24 hours ✅");
                return null;
            }
            
            // Group errors by function
            const errorsByFunction: Record<string, number> = {};
            const errorsByType: Record<string, number> = {};
            
            errorSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const functionName = data.functionName || "unknown";
                const errorMessage = data.message || "unknown";
                
                errorsByFunction[functionName] = (errorsByFunction[functionName] || 0) + 1;
                errorsByType[errorMessage] = (errorsByType[errorMessage] || 0) + 1;
            });
            
            // Sort by count
            const sortedFunctions = Object.entries(errorsByFunction)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10); // Top 10
            
            const sortedErrors = Object.entries(errorsByType)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5); // Top 5
            
            // Build report
            const report = `
╔════════════════════════════════════════════════════════════════
║ Daily Error Report - ${today.toDateString()}
╠════════════════════════════════════════════════════════════════
║ Total Errors: ${errorSnapshot.size}
║
║ Top Errors by Function:
${sortedFunctions.map(([name, count]) => "║   - " + name + ": " + count).join("\n")}
║
║ Top Error Messages:
${sortedErrors.map(([msg, count]) => "║   - " + msg.substring(0, 60) + "...: " + count).join("\n")}
╚════════════════════════════════════════════════════════════════
            `;
            
            functions.logger.warn(report);
            
            // Optional: Store summary for dashboard
            await db().collection("error_summaries").add({
                date: today,
                totalErrors: errorSnapshot.size,
                errorsByFunction,
                errorsByType,
                generatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            return null;
            
        } catch (error) {
            functions.logger.error("Failed to generate daily error report:", error);
            return null;
        }
    });


// ==================== AI-POWERED SUPPORT AGENT ====================

import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";

// Lazy initialize OpenAI client (only when needed)
let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Load knowledge base (all project documentation)
let knowledgeBase = "";
try {
  const knowledgeBasePath = path.join(__dirname, "knowledge_base.txt");
  knowledgeBase = fs.readFileSync(knowledgeBasePath, "utf-8");
} catch (error) {
  functions.logger.error("Failed to load knowledge base:", error);
}

/**
 * Firestore Trigger: Automatically analyze and solve new support tickets using AI
 * Triggered when a new document is created in the supportTickets collection
 */
export const onTicketCreated = functions.firestore
  .document("supportTickets/{ticketId}")
  .onCreate(async (snapshot, context) => {
    const ticketId = context.params.ticketId;
    const ticketData = snapshot.data();
    
    functions.logger.info(`New support ticket created: ${ticketId}`);
    
    try {
      // Extract problem description
      const problemDescription = ticketData.problemDescription || "";
      
      if (!problemDescription || problemDescription.trim().length === 0) {
        functions.logger.info("Empty problem description, skipping AI analysis.");
        return;
      }
      
      // Construct the prompt for the AI
      const prompt = `You are a helpful support agent for the MiniMaster application, a parental control app that allows parents to manage their children's device usage through task-based unlocking.

A user has submitted the following support request:

"${problemDescription}"

Based on the following knowledge base, provide a clear, step-by-step solution to the user's problem. If you are not confident in your answer (confidence < 0.7), state that you are escalating the ticket to a human agent.

Knowledge Base:
${knowledgeBase}

Your response MUST be in JSON format with exactly two fields:
{
  "solution": "Your step-by-step solution here",
  "confidence": 0.85
}

The confidence should be a float between 0 and 1, where 1 means you are absolutely certain the solution is correct.`;

      // Call OpenAI API
      functions.logger.info("Calling OpenAI API...");
      const response = await getOpenAIClient().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a technical support agent for the MiniMaster parental control application." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });
      
      // Parse the AI's response
      const aiResponse = response.choices[0]?.message?.content || "";
      functions.logger.info("AI Response:", aiResponse);
      
      let aiGeneratedSolution = "";
      let aiConfidenceScore = 0.0;
      let newStatus = "awaiting_user_feedback";
      
      try {
        const parsed = JSON.parse(aiResponse);
        aiGeneratedSolution = parsed.solution || "Unable to generate solution.";
        aiConfidenceScore = parsed.confidence || 0.0;
        
        // If confidence is too low, escalate immediately
        if (aiConfidenceScore < 0.7) {
          newStatus = "escalated";
          aiGeneratedSolution += "\n\n⚠️ This ticket has been escalated to a human support agent for further assistance.";
        }
      } catch (parseError) {
        functions.logger.error("Failed to parse AI response as JSON:", parseError);
        aiGeneratedSolution = "AI generated an invalid response. Escalating to human support.";
        aiConfidenceScore = 0.0;
        newStatus = "escalated";
      }
      
      // Update the ticket with the AI-generated solution
      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: aiGeneratedSolution,
        aiConfidenceScore: aiConfidenceScore,
        aiSolutionStatus: "generated",
        status: newStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      functions.logger.info(`Ticket ${ticketId} updated with AI solution (confidence: ${aiConfidenceScore})`);
      
      // Send push notification to the user
      const masterImei = ticketData.masterImei;
      const masterDoc = await admin.firestore().collection("masters").doc(masterImei).get();
      
      if (masterDoc.exists) {
        const masterData = masterDoc.data();
        const fcmToken = masterData?.fcmToken;
        
        if (fcmToken) {
          const notificationMessage = {
            notification: {
              title: "Support Ticket Update",
              body: newStatus === "escalated" 
                ? "Your ticket has been escalated to a human agent." 
                : "We have a proposed solution for your support ticket!",
            },
            data: {
              ticketId: ticketId,
              type: "support_ticket_update",
            },
            token: fcmToken,
          };
          
          await getMessaging().send(notificationMessage);
          functions.logger.info(`Push notification sent to ${masterImei}`);
        }
      }
      
      return;
    } catch (error) {
      functions.logger.error("Error in onTicketCreated:", error);
      
      // Update ticket to escalated status on error
      await admin.firestore().collection("supportTickets").doc(ticketId).update({
        aiGeneratedSolution: "An error occurred while analyzing your ticket. A human support agent will assist you shortly.",
        aiConfidenceScore: 0.0,
        aiSolutionStatus: "error",
        status: "escalated",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      throw error;
    }
  });

/**
 * Callable Function: User provides feedback on AI-generated solution
 */
export const provideSolutionFeedback = functions.https.onCall(async (data: { ticketId: string; feedback: string }, context: CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }
  
  const { ticketId, feedback } = data; // feedback: 'accepted' or 'rejected'
  
  if (!ticketId || !feedback) {
    throw new functions.https.HttpsError("invalid-argument", "Missing ticketId or feedback.");
  }
  
  if (feedback !== "accepted" && feedback !== "rejected") {
    throw new functions.https.HttpsError("invalid-argument", "Feedback must be \"accepted\" or \"rejected\".");
  }
  
  try {
    const ticketRef = admin.firestore().collection("supportTickets").doc(ticketId);
    const ticketDoc = await ticketRef.get();
    
    if (!ticketDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Ticket not found.");
    }
    
    const ticketData = ticketDoc.data();
    
    // Verify that the user owns this ticket
    if (ticketData?.masterImei !== context.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "You do not have permission to update this ticket.");
    }
    
    // Update ticket based on feedback
    const newStatus = feedback === "accepted" ? "closed_by_ai" : "escalated";
    const aiSolutionStatus = feedback === "accepted" ? "accepted" : "rejected";
    
    await ticketRef.update({
      aiSolutionStatus: aiSolutionStatus,
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    functions.logger.info(`Ticket ${ticketId} feedback: ${feedback}, new status: ${newStatus}`);
    
    return { success: true, message: `Ticket ${newStatus}.` };
  } catch (error) {
    functions.logger.error("Error in provideSolutionFeedback:", error);
    throw new functions.https.HttpsError("internal", "Failed to update ticket feedback.");
  }
});
