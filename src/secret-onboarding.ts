/**
 * In-App Secret Onboarding — Cloud Functions.
 *
 * Lets an operator set the raw value of a backend secret (Gemini / OpenAI /
 * Resend / Apple keys) directly from the Admin-Panel, instead of dropping to
 * the CLI (`firebase functions:secrets:set …`). The raw value is written as a
 * NEW VERSION into Google Secret Manager and NEVER persisted in Firestore or
 * logs. Only a Secret-Manager *path reference* is mirrored back into
 * `operatorConfig/externalIntegrations` (for secrets that have a display field),
 * which keeps the existing `looksLikeCleartextSecret` guard on that document
 * fully intact — that guard protects the *path* field, while this endpoint is
 * the one sanctioned place that handles the *value*.
 *
 * IMPORTANT CAVEAT (documented in the setup wizard): secret consumers bind
 * their secrets via `functions.runWith({ secrets: [...] })`, so a newly written
 * version only takes effect after those functions are redeployed.
 *
 * Permissions / gating:
 *   - admin role (requireAdmin)
 *   - App Check enforced (validateAppCheck)
 *   - fresh privileged session (requireTier T3)
 *   - admin PIN confirmation when an operator PIN is configured
 *
 * IAM: the Cloud Functions runtime service account needs
 * `roles/secretmanager.admin` (to create secrets and add versions). This grant
 * cannot be self-applied in-app (privilege escalation) and stays a documented
 * one-time console / `gcloud` step.
 *
 * All writes are audit-logged via `AuditLogger` as `operator.secret_write`.
 * The value is never included in audit metadata, logs, or the response.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { secretManager } from "../firebase";
import {
  requireAdmin,
  requireTier,
  requireAdminPinVerification,
  validateAppCheck,
  AuditLogger,
} from "./shared";
import { writeIntegrationField, type IntegrationCategory } from "./external-integrations";

// ==================== SECRET REGISTRY ====================

interface SecretDescriptor {
  /** Human-readable label for the Admin-Panel. */
  label: string;
  /**
   * Where the resulting Secret-Manager path reference is mirrored for display.
   * `null` when the external-integrations document has no field for it (the
   * secret is still created/versioned and bound via runWith by env name).
   */
  pathField: { category: IntegrationCategory; field: string } | null;
}

/**
 * The Secret-Manager secret id intentionally equals the environment-variable
 * name, because Firebase binds `runWith({ secrets: ["GEMINI_API_KEY"] })` to a
 * Secret-Manager secret of that exact name (exposed as `process.env.GEMINI_API_KEY`).
 * Only ids listed here may be written — arbitrary secret names are rejected.
 */
export const SECRET_REGISTRY: Record<string, SecretDescriptor> = {
  GEMINI_API_KEY: {
    label: "Gemini API Key",
    pathField: { category: "secrets", field: "geminiApiKeyPath" },
  },
  OPENAI_API_KEY: {
    label: "OpenAI API Key (Fallback)",
    pathField: null,
  },
  RESEND_API_KEY: {
    label: "Resend Email API Key",
    pathField: null,
  },
  APPLE_PRIVATE_KEY: {
    label: "Apple App Store Connect Private Key",
    pathField: { category: "apple", field: "appStoreConnectKeySecretPath" },
  },
};

export const KNOWN_SECRET_IDS = Object.keys(SECRET_REGISTRY);

const MAX_SECRET_VALUE_BYTES = 65536; // Secret Manager payload limit is 64 KiB.

// ==================== HELPERS ====================

/** Resolves the active GCP project id from the Functions runtime env. */
export function getCurrentProjectId(): string | null {
  const direct = String(process.env.GCLOUD_PROJECT || "").trim();
  if (direct) return direct;

  const firebaseConfig = String(process.env.FIREBASE_CONFIG || "").trim();
  if (!firebaseConfig) return null;
  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
    return typeof parsed.projectId === "string" && parsed.projectId.trim().length > 0
      ? parsed.projectId.trim()
      : null;
  } catch {
    return null;
  }
}

/** gRPC status codes surfaced by the Secret Manager client. */
const GRPC_NOT_FOUND = 5;
const GRPC_ALREADY_EXISTS = 6;
const GRPC_PERMISSION_DENIED = 7;

function grpcCode(err: unknown): number | undefined {
  return typeof (err as { code?: unknown })?.code === "number"
    ? (err as { code: number }).code
    : undefined;
}

function mapSecretManagerError(err: unknown, action: string): functions.https.HttpsError {
  if (grpcCode(err) === GRPC_PERMISSION_DENIED) {
    return new functions.https.HttpsError(
      "permission-denied",
      `Secret Manager Zugriff fehlt (${action}). Dem Functions-Runtime-Service-Account ` +
        "die Rolle 'roles/secretmanager.admin' zuweisen und erneut versuchen."
    );
  }
  return new functions.https.HttpsError("internal", `Secret Manager Fehler (${action}).`);
}

/** Creates the secret container if it does not already exist (idempotent). */
async function ensureSecretExists(parent: string, secretId: string, secretPath: string): Promise<void> {
  const client = secretManager();
  try {
    await client.getSecret({ name: secretPath });
    return; // already exists
  } catch (err) {
    if (grpcCode(err) !== GRPC_NOT_FOUND) {
      throw mapSecretManagerError(err, "getSecret");
    }
  }
  try {
    await client.createSecret({
      parent,
      secretId,
      secret: { replication: { automatic: {} } },
    });
  } catch (err) {
    // A concurrent caller may have created it between get and create.
    if (grpcCode(err) === GRPC_ALREADY_EXISTS) return;
    throw mapSecretManagerError(err, "createSecret");
  }
}

// ==================== CALLABLE: SET SECRET VALUE ====================

interface SetSecretPayload {
  secretId?: string;
  value?: string;
}

/**
 * Writes a raw secret value as a new Secret-Manager version and mirrors only
 * the resulting path reference into `operatorConfig/externalIntegrations`.
 * Admin-only, App-Check enforced, T3 session, admin-PIN confirmation.
 *
 * data: { secretId: KNOWN_SECRET_ID, value: string }
 * Returns: { ok, secretId, version, pathStored } — never the value.
 */
export const setSecretValue = functions.https.onCall(
  async (data: SetSecretPayload, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);
    requireTier(context, "T3", "Secret schreiben");
    await requireAdminPinVerification(context, "Secret schreiben");

    const secretId = String(data?.secretId || "").trim();
    const descriptor = SECRET_REGISTRY[secretId];
    if (!descriptor) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        `Unbekannte secretId. Erlaubt: ${KNOWN_SECRET_IDS.join(", ")}.`
      );
    }

    if (typeof data?.value !== "string" || data.value.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "value (nicht-leerer String) erforderlich.");
    }
    if (Buffer.byteLength(data.value, "utf8") > MAX_SECRET_VALUE_BYTES) {
      throw new functions.https.HttpsError("invalid-argument", "value überschreitet 64 KiB.");
    }

    const projectId = getCurrentProjectId();
    if (!projectId) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Projekt-ID nicht ermittelbar (GCLOUD_PROJECT/FIREBASE_CONFIG fehlt)."
      );
    }

    const parent = `projects/${projectId}`;
    const secretPath = `${parent}/secrets/${secretId}`;

    await ensureSecretExists(parent, secretId, secretPath);

    let versionName: string;
    try {
      const [version] = await secretManager().addSecretVersion({
        parent: secretPath,
        payload: { data: Buffer.from(data.value, "utf8") },
      });
      versionName = version.name || `${secretPath}/versions/latest`;
    } catch (err) {
      throw mapSecretManagerError(err, "addSecretVersion");
    }

    // Mirror only a path reference (never the value) for panels that display it.
    let pathStored = false;
    if (descriptor.pathField) {
      const pathRef = `${secretPath}/versions/latest`;
      await writeIntegrationField(
        descriptor.pathField.category,
        descriptor.pathField.field,
        pathRef,
        context.auth?.uid || "unknown-admin"
      );
      pathStored = true;
    }

    const shortVersion = versionName.split("/versions/")[1] || "latest";
    await AuditLogger.logSuccess(
      "operator.secret_write",
      context,
      secretPath,
      "system",
      { secretId, version: shortVersion, pathStored }
    );

    return { ok: true, secretId, version: shortVersion, pathStored };
  }
);

// ==================== CALLABLE: GET SECRET INVENTORY ====================

/**
 * Returns metadata-only inventory for the known secrets (existence, latest
 * version, create time) so the wizard can show what is configured. NEVER reads
 * or returns the secret value (no accessSecretVersion call). Auditor or admin.
 */
export const getSecretInventory = functions.https.onCall(
  async (_data: Record<string, never>, context: CallableContext) => {
    requireAdmin(context);
    validateAppCheck(context, true);

    const projectId = getCurrentProjectId();
    const client = secretManager();

    const items = await Promise.all(
      KNOWN_SECRET_IDS.map(async (secretId) => {
        const descriptor = SECRET_REGISTRY[secretId]!;
        const base = {
          secretId,
          label: descriptor.label,
          hasPathReference: descriptor.pathField !== null,
          exists: false,
          latestVersion: null as string | null,
          updatedAt: null as string | null,
          error: null as string | null,
        };
        if (!projectId) return base;

        const versionName = `projects/${projectId}/secrets/${secretId}/versions/latest`;
        try {
          // getSecretVersion returns metadata only — it does NOT expose the payload.
          const [version] = await client.getSecretVersion({ name: versionName });
          const createTime = version.createTime;
          const seconds = (createTime as { seconds?: number | string })?.seconds;
          return {
            ...base,
            exists: true,
            latestVersion: (version.name || "").split("/versions/")[1] || "latest",
            updatedAt: seconds != null ? new Date(Number(seconds) * 1000).toISOString() : null,
          };
        } catch (err) {
          // Distinguish "never set" (NOT_FOUND) from an IAM gap so the panel can
          // show an actionable permissions warning instead of "not configured".
          if (grpcCode(err) === GRPC_PERMISSION_DENIED) {
            return { ...base, error: "permission" };
          }
          return base;
        }
      })
    );

    return { secrets: items };
  }
);
