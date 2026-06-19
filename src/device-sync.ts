/**
 * Device Sync Cloud Functions — Control-Plane für plattformübergreifende Android/iOS-Kommunikation.
 *
 * Diese Funktionen bilden den bidirektionalen Kommunikationskanal zwischen Eltern- und Kinder-Gerät,
 * unabhängig davon ob das Gerät Android oder iOS ist. Push (FCM/APNs) dient nur als Wake-up-Hint;
 * die kanonische Wahrheit liegt immer in Firestore. Alle Operationen sind idempotent und replay-fähig.
 *
 * Neue Subcollections:
 *   children/{childId}/commands/{commandId}  — Master→Child Steuerkommandos (versioniert)
 *   children/{childId}/events/{eventId}       — Child→Master Ereignisse (Usage, Tamper, Acks)
 *
 * Neue Felder in children/{childId}:
 *   platform            — 'android' | 'ios'
 *   capabilities        — string[]  z.B. ['lock','appBlacklist','usageRules','screenTime']
 *   pushEndpoints       — Array<{endpointId, provider, token, appVersion, registeredAt, ...metadata}>
 *   component           — 'android-child' | 'ios-child' | ...
 *   componentInterfaceVersion — number (backend/client interface contract version)
 *   supportedProtocols  — string[]  z.B. ['control-plane/v1','device-events/v1']
 *   lastPolicyVersion   — number    (letzte vom Gerät bestätigte Policy-Version)
 *   policyVersion       — number    (aktuelle, serverseitig inkrementierte Version)
 */

import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db } from "../firebase";
import { requireAuth, validateAppCheck, AuditLogger, checkRateLimitShared } from "./shared";



// ------------------------------------------------------------------ Types --

export type DevicePlatform = "android" | "ios";
export type PushProvider = "fcm" | "apns";
export type ReleaseChannel = "development" | "internal" | "beta" | "production" | "unknown";
export type ClientComponent =
  | "android-child"
  | "ios-child"
  | "android-parent"
  | "ios-parent"
  | "web-parent"
  | "admin-panel"
  | "unknown";

export type CommandType =
  | "policy_update"
  | "lock_state"
  | "app_blacklist"
  | "usage_rules"
  | "screen_time";

export type CommandStatus = "pending" | "delivered" | "applied" | "failed" | "expired";

export type EventType =
  | "usage_report"
  | "tamper_event"
  | "command_ack"
  | "heartbeat"
  | "policy_applied";

export interface PushEndpoint {
  endpointId: string;
  provider: PushProvider;
  token: string;
  appVersion: string;
  buildNumber?: string;
  releaseChannel?: ReleaseChannel;
  component?: ClientComponent;
  interfaceVersion?: number;
  supportedProtocols?: string[];
  runtime?: RuntimeContext;
  registeredAt: admin.firestore.Timestamp;
}

export interface RuntimeContext {
  osVersion?: string;
  deviceModel?: string;
  locale?: string;
  timeZone?: string;
  appCheckMode?: string;
}

export interface DeviceCommand {
  commandId: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandStatus;
  schemaVersion: number;
  policyVersion: number;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  expiresAt: admin.firestore.Timestamp;
  ackedAt?: admin.firestore.Timestamp | null;
  errorCode?: string | null;
}

// Current schema version — increment when payload structure changes
const SCHEMA_VERSION = 1;
const COMPONENT_INTERFACE_VERSION = 2;
// Commands expire after 48h if not acknowledged
const COMMAND_TTL_SECONDS = 48 * 60 * 60;
const MAX_ENDPOINTS_PER_DEVICE = 5;
const MAX_FETCH_COMMANDS = 50;
const MAX_METADATA_FIELD_LENGTH = 96;
const MAX_PROTOCOLS = 12;

const KNOWN_CAPABILITIES = new Set([
  "lock",
  "appBlacklist",
  "usageRules",
  "screenTime",
  "screenTimeTokens",
  "offlinePolicy",
  "pushWakeup",
  "foregroundHeartbeat",
  "deviceActivityMonitor",
  "tamperDetection",
  "heartbeat",
  "taskProof",
  "taskPhotoUpload",
]);

const KNOWN_PROTOCOLS = new Set([
  "control-plane/v1",
  "device-events/v1",
  "android-accessibility-enforcement/v1",
  "android-task-proof/v1",
  "screen-time-token/v1",
  "device-activity-monitor/v1",
  "foreground-heartbeat/v1",
  "remote-mac-evidence/v1",
]);

const KNOWN_COMPONENTS = new Set<ClientComponent>([
  "android-child",
  "ios-child",
  "android-parent",
  "ios-parent",
  "web-parent",
  "admin-panel",
  "unknown",
]);

const KNOWN_RELEASE_CHANNELS = new Set<ReleaseChannel>([
  "development",
  "internal",
  "beta",
  "production",
  "unknown",
]);

// ----------------------------------------- Helpers -------------------------

function sanitizeMetadataString(value: unknown, maxLength = MAX_METADATA_FIELD_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeInterfaceVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return COMPONENT_INTERFACE_VERSION;
  }
  return Math.min(value, COMPONENT_INTERFACE_VERSION);
}

function normalizeReleaseChannel(value: unknown): ReleaseChannel {
  const channel = sanitizeMetadataString(value, 32) as ReleaseChannel | undefined;
  return channel && KNOWN_RELEASE_CHANNELS.has(channel) ? channel : "unknown";
}

function normalizeComponent(value: unknown, platform: DevicePlatform): ClientComponent {
  const component = sanitizeMetadataString(value, 48) as ClientComponent | undefined;
  if (component && KNOWN_COMPONENTS.has(component)) return component;
  return platform === "ios" ? "ios-child" : "android-child";
}

function filterKnownList(values: unknown, allowed: Set<string>, maxItems = MAX_PROTOCOLS): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  for (const value of values) {
    const normalized = sanitizeMetadataString(value, 64);
    if (!normalized || !allowed.has(normalized) || result.includes(normalized)) continue;
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeRuntimeContext(value: unknown): RuntimeContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    osVersion: sanitizeMetadataString(raw.osVersion),
    deviceModel: sanitizeMetadataString(raw.deviceModel),
    locale: sanitizeMetadataString(raw.locale, 32),
    timeZone: sanitizeMetadataString(raw.timeZone, 64),
    appCheckMode: sanitizeMetadataString(raw.appCheckMode, 32),
  };
}

/**
 * Increments and returns the next policyVersion for a child document.
 * Uses a Firestore transaction to guarantee monotonic increments.
 */
async function incrementPolicyVersion(childId: string): Promise<number> {
  const childRef = db().collection("children").doc(childId);
  let nextVersion = 1;
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(childRef);
    const current = (snap.data()?.policyVersion as number) || 0;
    nextVersion = current + 1;
    tx.update(childRef, { policyVersion: nextVersion });
  });
  return nextVersion;
}

/**
 * Writes a command document to children/{childId}/commands/{commandId}.
 * Called internally by Control-Plane functions after state changes.
 */
export async function writeCommand(
  childId: string,
  type: CommandType,
  payload: Record<string, unknown>,
  policyVersion: number
): Promise<string> {
  const commandId = randomUUID();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = new admin.firestore.Timestamp(now.seconds + COMMAND_TTL_SECONDS, now.nanoseconds);

  const command: DeviceCommand = {
    commandId,
    type,
    payload,
    status: "pending",
    schemaVersion: SCHEMA_VERSION,
    policyVersion,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt,
    ackedAt: null,
    errorCode: null,
  };

  await db()
    .collection("children")
    .doc(childId)
    .collection("commands")
    .doc(commandId)
    .set(command);

  return commandId;
}

// ------------------------------------------------- registerDeviceEndpoint --

/**
 * Registriert oder aktualisiert einen Push-Endpunkt für ein Kinder-Gerät.
 * Kompatibel nach hinten: ersetzt intern registerFcmToken für Android,
 * unterstützt neu auch iOS (APNs-Token).
 *
 * Input:  { childId, platform, provider, token, appVersion, capabilities?, metadata... }
 * Output: { endpointId, acceptedCapabilities, acceptedProtocols, interfaceVersion }
 */
export const registerDeviceEndpoint = functions.https.onCall(
  async (
    data: {
      childId: string;
      platform: DevicePlatform;
      provider: PushProvider;
      token: string;
      appVersion: string;
      capabilities?: string[];
      buildNumber?: string;
      releaseChannel?: ReleaseChannel;
      component?: ClientComponent;
      interfaceVersion?: number;
      supportedProtocols?: string[];
      runtime?: RuntimeContext;
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
    await checkRateLimitShared(callerId, "device-sync.register", 30, 60000);
    validateAppCheck(context, true);
    const { childId, platform, provider, token, appVersion, capabilities = [] } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "childId ist erforderlich.");
    }
    if (!["android", "ios"].includes(platform)) {
      throw new functions.https.HttpsError("invalid-argument", "platform muss 'android' oder 'ios' sein.");
    }
    if (!["fcm", "apns"].includes(provider)) {
      throw new functions.https.HttpsError("invalid-argument", "provider muss 'fcm' oder 'apns' sein.");
    }
    if (!token || typeof token !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "token ist erforderlich.");
    }
    if (!appVersion || typeof appVersion !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "appVersion ist erforderlich.");
    }

    // Nur das Gerät selbst oder sein Master darf registrieren
    const childRef = db().collection("children").doc(childId);
    const childDoc = await childRef.get();
    if (!childDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Kinder-Gerät nicht gefunden.");
    }
    const isSelf = callerId === childId;
    const isMaster = childDoc.data()?.masterImei === callerId;
    if (!isSelf && !isMaster) {
      throw new functions.https.HttpsError("permission-denied", "Keine Berechtigung für dieses Gerät.");
    }

    const acceptedCapabilities = filterKnownList(capabilities, KNOWN_CAPABILITIES, 24);
    const acceptedProtocols = filterKnownList(data.supportedProtocols, KNOWN_PROTOCOLS);
    const interfaceVersion = normalizeInterfaceVersion(data.interfaceVersion);
    const component = normalizeComponent(data.component, platform);
    const releaseChannel = normalizeReleaseChannel(data.releaseChannel);
    const buildNumber = sanitizeMetadataString(data.buildNumber, 48);
    const runtime = sanitizeRuntimeContext(data.runtime);

    // Endpunkt-Liste aktualisieren: gleichen Token deduplicieren, dann voranstellen
    const existing: PushEndpoint[] = (childDoc.data()?.pushEndpoints as PushEndpoint[]) || [];
    const filtered = existing
      .filter((e) => e.token !== token)
      .slice(0, MAX_ENDPOINTS_PER_DEVICE - 1);

    const endpointId = randomUUID();
    const newEndpoint: PushEndpoint = {
      endpointId,
      provider,
      token,
      appVersion,
      ...(buildNumber ? { buildNumber } : {}),
      releaseChannel,
      component,
      interfaceVersion,
      supportedProtocols: acceptedProtocols,
      runtime,
      registeredAt: admin.firestore.Timestamp.now(),
    };

    const updatedEndpoints = [newEndpoint, ...filtered];

    await childRef.update({
      platform,
      component,
      componentInterfaceVersion: interfaceVersion,
      capabilities: acceptedCapabilities,
      supportedProtocols: acceptedProtocols,
      appVersion,
      ...(buildNumber ? { buildNumber } : {}),
      releaseChannel,
      runtime,
      pushEndpoints: updatedEndpoints,
      lastEndpointRegisteredAt: admin.firestore.FieldValue.serverTimestamp(),
      // Legacy-Feld fcmToken weiterhin befüllen für Rückwärtskompatibilität mit vorhandenem Android-Code
      ...(provider === "fcm" ? { fcmToken: token } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await AuditLogger.logSuccess(
      "device.register", context, `children/${childId}`, "device",
      {
        childId,
        platform,
        provider,
        appVersion,
        buildNumber,
        releaseChannel,
        component,
        interfaceVersion,
        acceptedCapabilities,
        acceptedProtocols,
      }
    );

    functions.logger.info(`Endpoint registered for child ${childId} [${platform}/${provider}]`);
    return { endpointId, acceptedCapabilities, acceptedProtocols, interfaceVersion };
  }
);

// ---------------------------------------------------- publishDeviceEvent --

/**
 * Kinder-Gerät meldet ein Ereignis an das Backend (usage_report, tamper_event, etc.).
 * Idempotent: doppelte idempotencyKey-Einträge werden verworfen.
 *
 * Input:  { childId, eventType, payload, idempotencyKey }
 * Output: { eventId, receivedAt }
 */
export const publishDeviceEvent = functions.https.onCall(
  async (
    data: {
      childId: string;
      eventType: EventType;
      payload: Record<string, unknown>;
      idempotencyKey: string;
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
    await checkRateLimitShared(callerId, "device-sync.publish", 30, 60000);
    validateAppCheck(context, true);
    const { childId, eventType, payload, idempotencyKey } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "childId ist erforderlich.");
    }
    if (!eventType || typeof eventType !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "eventType ist erforderlich.");
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "idempotencyKey ist erforderlich.");
    }
    if (!payload || typeof payload !== "object") {
      throw new functions.https.HttpsError("invalid-argument", "payload muss ein Objekt sein.");
    }

    // Nur das Kinder-Gerät selbst darf Events publizieren
    if (callerId !== childId) {
      throw new functions.https.HttpsError("permission-denied", "Nur das Gerät selbst darf Events senden.");
    }

    const childRef = db().collection("children").doc(childId);
    const childDoc = await childRef.get();
    if (!childDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Kinder-Gerät nicht gefunden.");
    }

    const childData = childDoc.data() ?? {};
    const platform: DevicePlatform = childData.platform === "ios" ? "ios" : "android";
    const senderComponent = normalizeComponent(childData.component, platform);
    const senderAppVersion = sanitizeMetadataString(childData.appVersion);
    const senderBuildNumber = sanitizeMetadataString(childData.buildNumber, 48);
    const senderInterfaceVersion = normalizeInterfaceVersion(childData.componentInterfaceVersion);

    // Idempotenz: existierendes Dokument mit diesem Key zurückgeben
    const eventsRef = childRef.collection("events");
    const existing = await eventsRef.where("idempotencyKey", "==", idempotencyKey).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      if (!doc) {
        throw new functions.https.HttpsError("internal", "Event-Deduplizierung fehlgeschlagen.");
      }
      functions.logger.info(`Duplicate event suppressed for child ${childId}, key: ${idempotencyKey}`);
      const eventData = doc.data() as { createdAt?: unknown };
      return { eventId: doc.id, receivedAt: eventData.createdAt ?? null };
    }

    const eventId = randomUUID();
    const eventDoc = {
      eventId,
      eventType,
      payload,
      idempotencyKey,
      senderPlatform: platform,
      senderComponent,
      senderInterfaceVersion,
      ...(senderAppVersion ? { senderAppVersion } : {}),
      ...(senderBuildNumber ? { senderBuildNumber } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await eventsRef.doc(eventId).set(eventDoc);

    functions.logger.info(`Event ${eventType} recorded for child ${childId} [${eventId}]`);
    return { eventId, receivedAt: admin.firestore.Timestamp.now() };
  }
);

// -------------------------------------------------- fetchPendingCommands --

/**
 * Kinder-Gerät ruft ausstehende Kommandos ab (Pull-Mechanismus).
 * Gibt Commands zurück deren Status 'pending' und die noch nicht abgelaufen sind.
 * cursor = commandId des letzten bekannten Commands (Pagination).
 *
 * Input:  { childId, sinceCursor?, maxItems? }
 * Output: { commands[], nextCursor, policyVersion }
 */
export const fetchPendingCommands = functions.https.onCall(
  async (
    data: {
      childId: string;
      sinceCursor?: string;
      maxItems?: number;
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
    await checkRateLimitShared(callerId, "device-sync.fetch", 60, 60000);
    validateAppCheck(context, true);
    const { childId, sinceCursor, maxItems = 20 } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "childId ist erforderlich.");
    }
    if (maxItems > MAX_FETCH_COMMANDS) {
      throw new functions.https.HttpsError("invalid-argument", `maxItems darf maximal ${MAX_FETCH_COMMANDS} sein.`);
    }

    // Nur das Kinder-Gerät selbst oder sein Master darf Commands abrufen
    const childRef = db().collection("children").doc(childId);
    const childDoc = await childRef.get();
    if (!childDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Kinder-Gerät nicht gefunden.");
    }
    const isSelf = callerId === childId;
    const isMaster = childDoc.data()?.masterImei === callerId;
    if (!isSelf && !isMaster) {
      throw new functions.https.HttpsError("permission-denied", "Keine Berechtigung für dieses Gerät.");
    }

    const now = admin.firestore.Timestamp.now();
    let query = childRef
      .collection("commands")
      .where("status", "==", "pending")
      .where("expiresAt", ">", now)
      .orderBy("expiresAt")
      .orderBy("createdAt")
      .limit(maxItems);

    if (sinceCursor) {
      const cursorDoc = await childRef.collection("commands").doc(sinceCursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const commands = snap.docs.map((d) => ({ ...d.data() }));
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.docs.length === maxItems && lastDoc ? lastDoc.id : null;

    const policyVersion = (childDoc.data()?.policyVersion as number) || 0;

    return { commands, nextCursor, policyVersion };
  }
);

// --------------------------------------------------- acknowledgeCommand --

/**
 * Kinder-Gerät bestätigt Anwendung eines Commands (Ack).
 * Setzt status auf 'applied' oder 'failed'; aktualisiert lastPolicyVersion.
 *
 * Input:  { childId, commandId, status: 'applied'|'failed', appliedAt, errorCode? }
 * Output: { success }
 */
export const acknowledgeCommand = functions.https.onCall(
  async (
    data: {
      childId: string;
      commandId: string;
      status: "applied" | "failed";
      appliedAt: number;
      errorCode?: string;
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
    await checkRateLimitShared(callerId, "device-sync.ack", 60, 60000);
    validateAppCheck(context, true);
    const { childId, commandId, status, appliedAt, errorCode } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "childId ist erforderlich.");
    }
    if (!commandId || typeof commandId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "commandId ist erforderlich.");
    }
    if (!["applied", "failed"].includes(status)) {
      throw new functions.https.HttpsError("invalid-argument", "status muss 'applied' oder 'failed' sein.");
    }
    if (typeof appliedAt !== "number") {
      throw new functions.https.HttpsError("invalid-argument", "appliedAt muss ein numerischer Epoch-ms-Wert sein.");
    }

    // Nur das Kinder-Gerät selbst darf ack'en
    if (callerId !== childId) {
      throw new functions.https.HttpsError("permission-denied", "Nur das Gerät selbst darf Kommandos bestätigen.");
    }

    const childRef = db().collection("children").doc(childId);
    const commandRef = childRef.collection("commands").doc(commandId);

    const commandDoc = await commandRef.get();
    if (!commandDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Kommando nicht gefunden.");
    }

    const commandData = commandDoc.data() as DeviceCommand;

    // Idempotenz: bereits bewertetes Kommando zurückgeben
    if (commandData.status === "applied" || commandData.status === "failed") {
      return { success: true };
    }

    const ackedAt = admin.firestore.Timestamp.fromMillis(appliedAt);
    await commandRef.update({
      status,
      ackedAt,
      ...(errorCode ? { errorCode } : {}),
    });

    // Bei erfolgreicher Anwendung: lastPolicyVersion aktualisieren
    if (status === "applied") {
      const commandPolicyVersion = commandData.policyVersion || 0;
      const childDoc = await childRef.get();
      const currentLastVersion = (childDoc.data()?.lastPolicyVersion as number) || 0;
      if (commandPolicyVersion > currentLastVersion) {
        await childRef.update({ lastPolicyVersion: commandPolicyVersion });
      }
    }

    functions.logger.info(`Command ${commandId} acknowledged with status '${status}' for child ${childId}`);
    return { success: true };
  }
);

// --------------------------------------------------- syncPolicySnapshot --

/**
 * Kinder-Gerät zieht eine vollständige Kopie der aktuellen Policy.
 * Wird beim App-Start und nach längerem Offline-Betrieb aufgerufen.
 * Liefert zusätzlich alle offenen (pending) kritischen Kommandos zurück.
 *
 * Input:  { childId, knownPolicyVersion? }
 * Output: { fullPolicy, policyVersion, pendingCriticalCommands }
 */
export const syncPolicySnapshot = functions.https.onCall(
  async (
    data: {
      childId: string;
      knownPolicyVersion?: number;
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
    validateAppCheck(context, true);
    const { childId, knownPolicyVersion = 0 } = data;

    if (!childId || typeof childId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "childId ist erforderlich.");
    }

    // Nur das Kinder-Gerät selbst oder sein Master darf den Snapshot abrufen
    const childRef = db().collection("children").doc(childId);
    const childDoc = await childRef.get();
    if (!childDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Kinder-Gerät nicht gefunden.");
    }
    const isSelf = callerId === childId;
    const isMaster = childDoc.data()?.masterImei === callerId;
    if (!isSelf && !isMaster) {
      throw new functions.https.HttpsError("permission-denied", "Keine Berechtigung für dieses Gerät.");
    }

    const childData = childDoc.data() ?? {};
    const currentPolicyVersion =
      typeof childData.policyVersion === "number" ? childData.policyVersion : 0;
    const platform: DevicePlatform = childData.platform === "ios" ? "ios" : "android";
    const usageRules = childData.usageRules &&
      typeof childData.usageRules === "object" &&
      !Array.isArray(childData.usageRules)
      ? childData.usageRules as Record<string, unknown>
      : {};

    const fullPolicy = {
      isLocked: childData.isLocked === true,
      appBlacklist: Array.isArray(childData.appBlacklist) ? childData.appBlacklist : [],
      usageRules,
      platform,
      capabilities: filterKnownList(childData.capabilities, KNOWN_CAPABILITIES, 24),
      component: normalizeComponent(childData.component, platform),
      componentInterfaceVersion: normalizeInterfaceVersion(childData.componentInterfaceVersion),
      supportedProtocols: filterKnownList(childData.supportedProtocols, KNOWN_PROTOCOLS),
      appVersion: sanitizeMetadataString(childData.appVersion) ?? null,
      buildNumber: sanitizeMetadataString(childData.buildNumber, 48) ?? null,
      releaseChannel: normalizeReleaseChannel(childData.releaseChannel),
    };

    // Offene kritische Commands (lock_state, policy_update) zurückgeben
    const criticalTypes: CommandType[] = ["lock_state", "policy_update"];
    const now = admin.firestore.Timestamp.now();
    const criticalSnap = await childRef
      .collection("commands")
      .where("status", "==", "pending")
      .where("expiresAt", ">", now)
      .orderBy("expiresAt")
      .orderBy("createdAt")
      .limit(10)
      .get();

    const pendingCriticalCommands = criticalSnap.docs
      .map((d) => d.data())
      .filter((cmd) => criticalTypes.includes(cmd.type as CommandType));

    // Wenn Gerät bereits aktuelle Version hat: nur Metadaten zurückgeben
    if (knownPolicyVersion >= currentPolicyVersion && knownPolicyVersion > 0) {
      functions.logger.info(`Child ${childId} already at policyVersion ${knownPolicyVersion}, no sync needed`);
      return {
        fullPolicy,
        policyVersion: currentPolicyVersion,
        pendingCriticalCommands,
        upToDate: true,
      };
    }

    functions.logger.info(`Policy snapshot delivered to child ${childId}: v${currentPolicyVersion}`);
    return {
      fullPolicy,
      policyVersion: currentPolicyVersion,
      pendingCriticalCommands,
      upToDate: false,
    };
  }
);

// Re-export helper for use in triggers.ts
export { incrementPolicyVersion };
