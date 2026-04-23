import * as functions from "firebase-functions/v1";
import type { DecisioningEventType, RuleActionType } from "../models/decisioning";

const EVENT_TYPES = new Set<DecisioningEventType>([
  "APP_OPENED",
  "TIME_LIMIT_REACHED",
  "LOCATION_CHANGED",
  "DEVICE_UNLOCKED",
]);

const RULE_ACTIONS = new Set<RuleActionType>(["BLOCK", "ALLOW", "NOTIFY"]);

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new functions.https.HttpsError("invalid-argument", `${fieldName} muss ein nicht-leerer String sein.`);
  }
  return value.trim();
}

export function validateDeviceEventInput(data: unknown): {
  deviceId: string;
  type: DecisioningEventType;
  payload: Record<string, string>;
  timestamp: number;
} {
  if (!data || typeof data !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Event-Payload fehlt.");
  }

  const record = data as Record<string, unknown>;
  const deviceId = assertString(record.deviceId, "deviceId");
  const type = assertString(record.type, "type") as DecisioningEventType;
  if (!EVENT_TYPES.has(type)) {
    throw new functions.https.HttpsError("invalid-argument", `Nicht unterstützter Event-Typ: ${type}.`);
  }

  const payload = typeof record.payload === "object" && record.payload !== null
    ? Object.fromEntries(
      Object.entries(record.payload as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])
    )
    : {};

  const timestamp = Number(record.timestamp ?? Date.now());
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "timestamp muss eine positive Zahl sein.");
  }

  return { deviceId, type, payload, timestamp };
}

export function validateDecisionTraceInput(data: unknown): {
  deviceId: string;
  ruleId: string;
  reason: string;
  action: RuleActionType;
  eventType: DecisioningEventType;
  timestamp: number;
} {
  if (!data || typeof data !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "DecisionTrace-Payload fehlt.");
  }

  const record = data as Record<string, unknown>;
  const deviceId = assertString(record.deviceId, "deviceId");
  const ruleId = assertString(record.ruleId, "ruleId");
  const reason = assertString(record.reason, "reason");
  const action = assertString(record.action, "action") as RuleActionType;
  const eventType = assertString(record.eventType, "eventType") as DecisioningEventType;
  const timestamp = Number(record.timestamp ?? Date.now());

  if (!RULE_ACTIONS.has(action)) {
    throw new functions.https.HttpsError("invalid-argument", `Nicht unterstützte Aktion: ${action}.`);
  }
  if (!EVENT_TYPES.has(eventType)) {
    throw new functions.https.HttpsError("invalid-argument", `Nicht unterstützter Event-Typ: ${eventType}.`);
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "timestamp muss eine positive Zahl sein.");
  }

  return { deviceId, ruleId, reason, action, eventType, timestamp };
}

export function validateGetRulesInput(data: unknown): { deviceId?: string } {
  if (data == null) {
    return {};
  }
  if (typeof data !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Request muss ein Objekt sein.");
  }
  const record = data as Record<string, unknown>;
  if (record.deviceId == null) {
    return {};
  }
  return { deviceId: assertString(record.deviceId, "deviceId") };
}
