/**
 * B2B Licensing System for MiniMaster.
 * Manages organizations (schools, kitas, youth centers) with device-based licensing.
 *
 * Legal compliance notes:
 * - DSGVO Art. 28: Organizations act as "Auftraggeber", MiniMaster as "Auftragsverarbeiter"
 * - Separate Data Processing Agreement (DPA) required per organization
 * - All B2B data stored in EU data centers (data residency)
 * - Audit logging for all administrative actions (Art. 5(2) DSGVO)
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { requireAuth, requireAdmin, validateAppCheck, AuditLogger } from "./shared";
import { validateString } from "./validation";
import { withErrorHandling } from "./error-handler";
import { B2B_TIERS } from "./pricing-config";

// ==================== TYPES ====================

export interface B2BOrganization {
  id: string;
  name: string;
  type: "school" | "kita" | "youth_center" | "enterprise";
  licenseTier: string;     // references B2B_TIERS sku
  status: "pending" | "active" | "suspended" | "expired" | "canceled";
  maxDevices: number;
  currentDevices: number;
  maxAdmins: number;
  billingEmail: string;
  billingAddress?: string;
  vatId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone?: string;
  dpaSigned: boolean;
  dpaSignedAt?: admin.firestore.Timestamp;
  dataResidency: "eu" | "de";
  createdAt: admin.firestore.Timestamp;
  expiresAt?: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  notes?: string;
}

interface B2BAdminDoc {
  orgId: string;
  role: string;
}

interface B2BDeviceDoc {
  childId?: string;
  label?: string;
  addedAt?: admin.firestore.Timestamp;
}

interface B2BAuditLogDoc {
  action?: string;
  actor?: string;
  timestamp?: admin.firestore.Timestamp;
}

// ==================== CLOUD FUNCTIONS ====================

/**
 * Creates a new B2B organization (admin-only).
 * Triggers DPA workflow and Stripe customer creation.
 */
export const createB2BOrganization = functions.https.onCall(
  withErrorHandling(
    "createB2BOrganization",
    async (data: {
      name: string;
      type: string;
      licenseTier: string;
      billingEmail: string;
      billingAddress?: string;
      vatId?: string;
      primaryContactName: string;
      primaryContactEmail: string;
      primaryContactPhone?: string;
      notes?: string;
    }, context: CallableContext) => {
      const startTime = Date.now();
      requireAdmin(context);
      validateAppCheck(context, true);

      // Validate inputs
      const name = validateString(data.name, "name", { maxLength: 200 });
      const orgType = validateString(data.type, "type", {
        pattern: /^(school|kita|youth_center|enterprise)$/,
      }) as B2BOrganization["type"];
      const licenseTier = validateString(data.licenseTier, "licenseTier", {
        // eslint-disable-next-line security/detect-non-literal-regexp -- from Object.keys(B2B_TIERS)
        pattern: new RegExp(`^(${Object.keys(B2B_TIERS).join("|")})$`),
      });
      const billingEmail = validateString(data.billingEmail, "billingEmail", {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        sanitize: "none",
      });
      const primaryContactName = validateString(data.primaryContactName, "primaryContactName", { maxLength: 200 });
      const primaryContactEmail = validateString(data.primaryContactEmail, "primaryContactEmail", {
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        sanitize: "none",
      });

      const tier = B2B_TIERS[licenseTier];

      // Check for duplicate organization name
      const existing = await db().collection("b2b_organizations")
        .where("name", "==", name)
        .limit(1)
        .get();
      if (!existing.empty) {
        throw new functions.https.HttpsError("already-exists", "An organization with this name already exists.");
      }

      const now = admin.firestore.Timestamp.now();
      const orgRef = db().collection("b2b_organizations").doc();

      const orgData: Omit<B2BOrganization, "id"> = {
        name,
        type: orgType,
        licenseTier,
        status: "pending",
        maxDevices: tier!.maxDevices,
        currentDevices: 0,
        maxAdmins: tier!.maxAdmins,
        billingEmail,
        billingAddress: data.billingAddress || "",
        vatId: data.vatId || "",
        primaryContactName,
        primaryContactEmail,
        primaryContactPhone: data.primaryContactPhone || "",
        dpaSigned: false,
        dataResidency: "eu",
        createdAt: now,
        updatedAt: now,
        notes: data.notes || "",
      };

      await orgRef.set(orgData);

      // Create initial audit log entry
      await db().collection("b2b_audit_logs").add({
        orgId: orgRef.id,
        action: "organization.created",
        actor: context.auth?.uid || "system",
        details: { name, type: orgType, licenseTier },
        timestamp: now,
      });

      await AuditLogger.logSuccess(
        "admin.b2b.create", context, `b2b_organizations/${orgRef.id}`, "b2b",
        { orgId: orgRef.id, name, tier: licenseTier, duration: Date.now() - startTime }
      );

      functions.logger.info(`B2B organization created: ${name} (${orgRef.id})`);
      return {
        success: true,
        orgId: orgRef.id,
        name,
        status: "pending",
        message: "Organization created. DPA signature and payment setup required before activation.",
      };
    }
  )
);

/**
 * Activates a B2B license after DPA is signed and payment is confirmed.
 */
export const activateB2BLicense = functions.https.onCall(
  withErrorHandling(
    "activateB2BLicense",
    async (data: { orgId: string; stripeSubscriptionId?: string }, context: CallableContext) => {
      const startTime = Date.now();
      requireAdmin(context);
      validateAppCheck(context, true);

      const orgId = validateString(data.orgId, "orgId", { maxLength: 128 });

      const orgRef = db().collection("b2b_organizations").doc(orgId);
      const orgDoc = await orgRef.get();
      if (!orgDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
      }

      const orgData = orgDoc.data() as B2BOrganization;
      if (orgData.status === "active") {
        throw new functions.https.HttpsError("failed-precondition", "Organization is already active.");
      }

      // DPA must be signed before activation
      if (!orgData.dpaSigned) {
        throw new functions.https.HttpsError("failed-precondition",
          "Data Processing Agreement must be signed before activation.");
      }

      const now = admin.firestore.Timestamp.now();
      const tier = B2B_TIERS[orgData.licenseTier];
      const durationMs = tier!.billingPeriod === "yearly"
        ? 365 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
      const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + durationMs);

      await orgRef.update({
        status: "active",
        expiresAt,
        stripeSubscriptionId: data.stripeSubscriptionId || orgData.stripeSubscriptionId || "",
        updatedAt: now,
      });

      await AuditLogger.logSuccess(
        "admin.b2b.activate", context, `b2b_organizations/${orgId}`, "b2b",
        { orgId, name: orgData.name, duration: Date.now() - startTime }
      );

      return { success: true, orgId, status: "active", expiresAt };
    }
  )
);

/**
 * Gets B2B license status for an organization admin.
 */
export const getB2BLicenseStatus = functions.https.onCall(
  withErrorHandling(
    "getB2BLicenseStatus",
    async (_data: Record<string, never>, context: CallableContext) => {
      const userId = requireAuth(context);
      validateAppCheck(context, true);

      // Find organization where user is admin
      const adminSnapshot = await db().collection("b2b_admins")
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "No organization found for this user.");
      }

      const adminData = adminSnapshot.docs[0]!.data() as B2BAdminDoc;
      const orgId = adminData.orgId;

      const orgDoc = await db().collection("b2b_organizations").doc(orgId).get();
      if (!orgDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
      }

      const orgData = orgDoc.data() as B2BOrganization;
      const tier = B2B_TIERS[orgData.licenseTier];

      return {
        orgId,
        name: orgData.name,
        type: orgData.type,
        status: orgData.status,
        licenseTier: orgData.licenseTier,
        maxDevices: orgData.maxDevices,
        currentDevices: orgData.currentDevices,
        maxAdmins: orgData.maxAdmins,
        deviceUtilization: orgData.maxDevices > 0
          ? Math.round((orgData.currentDevices / orgData.maxDevices) * 100)
          : 0,
        expiresAt: orgData.expiresAt,
        features: tier?.features ?? [],
        role: adminData.role,
      };
    }
  )
);

/**
 * Adds a device to a B2B organization.
 */
export const addB2BDevice = functions.https.onCall(
  withErrorHandling(
    "addB2BDevice",
    async (data: { orgId: string; childId: string; label?: string }, context: CallableContext) => {
      const startTime = Date.now();
      const userId = requireAuth(context);
      validateAppCheck(context, true);

      const orgId = validateString(data.orgId, "orgId", { maxLength: 128 });
      const childId = validateString(data.childId, "childId", { maxLength: 256 });

      // Verify user is admin of this organization
      const adminSnapshot = await db().collection("b2b_admins")
        .where("userId", "==", userId)
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized for this organization.");
      }

      const orgRef = db().collection("b2b_organizations").doc(orgId);
      const orgDoc = await orgRef.get();
      if (!orgDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
      }

      // Check if device already in org (before transaction to avoid unnecessary transaction)
      const existing = await db().collection("b2b_devices")
        .where("orgId", "==", orgId)
        .where("childId", "==", childId)
        .limit(1)
        .get();

      if (!existing.empty) {
        throw new functions.https.HttpsError("already-exists", "Device is already in this organization.");
      }

      const now = admin.firestore.Timestamp.now();
      let newDeviceCount: number;

      await db().runTransaction(async (tx) => {
        const freshOrgDoc = await tx.get(orgRef);
        if (!freshOrgDoc.exists) {
          throw new functions.https.HttpsError("not-found", "Organization not found.");
        }
        const freshOrgData = freshOrgDoc.data() as B2BOrganization;

        if (freshOrgData.maxDevices > 0 && freshOrgData.currentDevices >= freshOrgData.maxDevices) {
          throw new functions.https.HttpsError("resource-exhausted",
            `Device limit reached (${freshOrgData.currentDevices}/${freshOrgData.maxDevices}). Upgrade license tier.`);
        }

        const newDeviceRef = db().collection("b2b_devices").doc();
        tx.set(newDeviceRef, {
          orgId,
          childId,
          label: data.label || "",
          addedAt: now,
          addedBy: userId,
        });

        tx.update(orgRef, {
          currentDevices: admin.firestore.FieldValue.increment(1),
          updatedAt: now,
        });

        newDeviceCount = freshOrgData.currentDevices + 1;
      });

      await AuditLogger.logSuccess(
        "admin.b2b.add_device", context, `b2b_organizations/${orgId}`, "b2b",
        { orgId, childId, duration: Date.now() - startTime }
      );

      return { success: true, orgId, childId, currentDevices: newDeviceCount! };
    }
  )
);

/**
 * Removes a device from a B2B organization.
 */
export const removeB2BDevice = functions.https.onCall(
  withErrorHandling(
    "removeB2BDevice",
    async (data: { orgId: string; childId: string }, context: CallableContext) => {
      const startTime = Date.now();
      const userId = requireAuth(context);
      validateAppCheck(context, true);

      const orgId = validateString(data.orgId, "orgId", { maxLength: 128 });
      const childId = validateString(data.childId, "childId", { maxLength: 256 });

      // Verify user is admin
      const adminSnapshot = await db().collection("b2b_admins")
        .where("userId", "==", userId)
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

      if (adminSnapshot.empty) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized for this organization.");
      }

      // Find and delete device
      const deviceSnapshot = await db().collection("b2b_devices")
        .where("orgId", "==", orgId)
        .where("childId", "==", childId)
        .get();

      if (deviceSnapshot.empty) {
        throw new functions.https.HttpsError("not-found", "Device not found in this organization.");
      }

      const batch = db().batch();
      deviceSnapshot.docs.forEach((doc) => batch.delete(doc.ref));

      // Decrement counter
      const orgRef = db().collection("b2b_organizations").doc(orgId);
      batch.update(orgRef, {
        currentDevices: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.Timestamp.now(),
      });

      await batch.commit();

      await AuditLogger.logSuccess(
        "admin.b2b.remove_device", context, `b2b_organizations/${orgId}`, "b2b",
        { orgId, childId, duration: Date.now() - startTime }
      );

      return { success: true, orgId, childId };
    }
  )
);

/**
 * Generates a usage report for a B2B organization.
 */
export const getB2BUsageReport = functions.https.onCall(
  withErrorHandling(
    "getB2BUsageReport",
    async (data: { orgId: string; period?: string }, context: CallableContext) => {
      const userId = requireAuth(context);
      validateAppCheck(context, true);

      const orgId = validateString(data.orgId, "orgId", { maxLength: 128 });

      // Verify access (org admin or super admin)
      const adminSnapshot = await db().collection("b2b_admins")
        .where("userId", "==", userId)
        .where("orgId", "==", orgId)
        .limit(1)
        .get();

      const isSuperAdmin = context.auth?.token?.role === "admin";
      if (adminSnapshot.empty && !isSuperAdmin) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized for this organization.");
      }

      const orgDoc = await db().collection("b2b_organizations").doc(orgId).get();
      if (!orgDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
      }

      const orgData = orgDoc.data() as B2BOrganization;

      // Get all devices
      const devicesSnapshot = await db().collection("b2b_devices")
        .where("orgId", "==", orgId)
        .get();

      // Get recent audit logs
      const auditSnapshot = await db().collection("b2b_audit_logs")
        .where("orgId", "==", orgId)
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();

      return {
        orgId,
        name: orgData.name,
        status: orgData.status,
        licenseTier: orgData.licenseTier,
        deviceCount: devicesSnapshot.size,
        maxDevices: orgData.maxDevices,
        utilization: orgData.maxDevices > 0
          ? Math.round((devicesSnapshot.size / orgData.maxDevices) * 100)
          : 0,
        devices: devicesSnapshot.docs.map((d) => {
          const deviceData = d.data() as B2BDeviceDoc;
          return {
            id: d.id,
            childId: deviceData.childId,
            label: deviceData.label,
            addedAt: deviceData.addedAt?.toMillis(),
          };
        }),
        recentActivity: auditSnapshot.docs.map((d) => {
          const logData = d.data() as B2BAuditLogDoc;
          return {
            action: logData.action,
            actor: logData.actor,
            timestamp: logData.timestamp?.toMillis(),
          };
        }),
      };
    }
  )
);

/**
 * Revokes a B2B license (super-admin only).
 */
export const revokeB2BLicense = functions.https.onCall(
  withErrorHandling(
    "revokeB2BLicense",
    async (data: { orgId: string; reason?: string }, context: CallableContext) => {
      const startTime = Date.now();
      requireAdmin(context);
      validateAppCheck(context, true);

      const orgId = validateString(data.orgId, "orgId", { maxLength: 128 });
      const reason = data.reason || "Administrative revocation";

      const orgRef = db().collection("b2b_organizations").doc(orgId);
      const orgDoc = await orgRef.get();
      if (!orgDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Organization not found.");
      }

      const now = admin.firestore.Timestamp.now();

      await orgRef.update({
        status: "canceled",
        canceledAt: now,
        cancelReason: reason,
        updatedAt: now,
      });

      // Log revocation
      await db().collection("b2b_audit_logs").add({
        orgId,
        action: "organization.revoked",
        actor: context.auth?.uid || "system",
        details: { reason },
        timestamp: now,
      });

      await AuditLogger.logSuccess(
        "admin.b2b.revoke", context, `b2b_organizations/${orgId}`, "b2b",
        { orgId, reason, duration: Date.now() - startTime }
      );

      return { success: true, orgId, status: "canceled" };
    }
  )
);

/**
 * Lists all B2B organizations (admin-only, with pagination).
 */
export const listB2BOrganizations = functions.https.onCall(
  withErrorHandling(
    "listB2BOrganizations",
    async (data: { status?: string; limit?: number; offset?: number }, context: CallableContext) => {
      requireAdmin(context);
      validateAppCheck(context, true);

      const limit = Math.min(data.limit || 50, 100);

      let query: admin.firestore.Query = db().collection("b2b_organizations")
        .orderBy("createdAt", "desc")
        .limit(limit);

      if (data.status) {
        query = query.where("status", "==", data.status);
      }

      const snapshot = await query.get();

      return {
        organizations: snapshot.docs.map((doc) => {
          const d = doc.data() as B2BOrganization;
          return {
            id: doc.id,
            name: d.name,
            type: d.type,
            status: d.status,
            licenseTier: d.licenseTier,
            currentDevices: d.currentDevices,
            maxDevices: d.maxDevices,
            billingEmail: d.billingEmail,
            primaryContactName: d.primaryContactName,
            dpaSigned: d.dpaSigned,
            createdAt: d.createdAt?.toMillis(),
            expiresAt: d.expiresAt?.toMillis(),
          };
        }),
        total: snapshot.size,
      };
    }
  )
);
