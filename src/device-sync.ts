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
 *   pushEndpoints       — Array<{endpointId, provider, token, appVersion, registeredAt}>
 *   lastPolicyVersion   — number    (letzte vom Gerät bestätigte Policy-Version)
 *   policyVersion       — number    (aktuelle, serverseitig inkrementierte Version)
 */

import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db } from "../firebase";
import { requireAuth, validateAppCheck, AuditLogger } from "./shared";



// ------------------------------------------------------------------ Types --

export type DevicePlatform = "android" | "ios";
export type PushProvider = "fcm" | "apns";

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
  registeredAt: admin.firestore.Timestamp;
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
// Commands expire after 48h if not acknowledged
const COMMAND_TTL_SECONDS = 48 * 60 * 60;
const MAX_ENDPOINTS_PER_DEVICE = 5;
const MAX_FETCH_COMMANDS = 50;

// ----------------------------------------- Helpers -------------------------

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
 * Input:  { childId, platform, provider, token, appVersion, capabilities? }
 * Output: { endpointId, acceptedCapabilities }
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
    },
    context: CallableContext
  ) => {
    const callerId = requireAuth(context);
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

    // Capabilities-Negotiation: Nur bekannte Capabilities akzeptieren
    const knownCapabilities = new Set([
      "lock", "appBlacklist", "usageRules", "screenTime",
      "tamperDetection", "heartbeat", "taskProof",
    ]);
    const acceptedCapabilities = capabilities.filter((c) => knownCapabilities.has(c));

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
      registeredAt: admin.firestore.Timestamp.now(),
    };

    const updatedEndpoints = [newEndpoint, ...filtered];

    await childRef.update({
      platform,
      capabilities: acceptedCapabilities,
      pushEndpoints: updatedEndpoints,
      // Legacy-Feld fcmToken weiterhin befüllen für Rückwärtskompatibilität mit vorhandenem Android-Code
      ...(provider === "fcm" ? { fcmToken: token } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await AuditLogger.logSuccess(
      "device.register", context, `children/${childId}`, "device",
      { childId, platform, provider, appVersion, acceptedCapabilities }
    );

    functions.logger.info(`Endpoint registered for child ${childId} [${platform}/${provider}]`);
    return { endpointId, acceptedCapabilities };
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

    const platform: DevicePlatform = (childDoc.data()?.platform as DevicePlatform) || "android";

    // Idempotenz: existierendes Dokument mit diesem Key zurückgeben
    const eventsRef = childRef.collection("events");
    const existing = await eventsRef.where("idempotencyKey", "==", idempotencyKey).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0]!;
      functions.logger.info(`Duplicate event suppressed for child ${childId}, key: ${idempotencyKey}`);
      return { eventId: doc.id, receivedAt: doc.data().createdAt };
    }

    const eventId = randomUUID();
    const eventDoc = {
      eventId,
      eventType,
      payload,
      idempotencyKey,
      senderPlatform: platform,
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
    const nextCursor = snap.docs.length === maxItems
      ? snap.docs[snap.docs.length - 1]!.id
      : null;

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

    const childData = childDoc.data()!;
    const currentPolicyVersion = (childData.policyVersion as number) || 0;

    const fullPolicy = {
      isLocked: childData.isLocked || false,
      appBlacklist: childData.appBlacklist || [],
      usageRules: childData.usageRules || {},
      platform: (childData.platform as DevicePlatform) || "android",
      capabilities: (childData.capabilities as string[]) || [],
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
