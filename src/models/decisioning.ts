import * as admin from "firebase-admin";

export const DECISIONING_COLLECTIONS = {
  users: "users",
  devices: "devices",
  rules: "rules",
  events: "events",
  suggestions: "suggestions",
  decisionTraces: "decision_traces",
} as const;

export type DecisioningEventType =
  | "APP_OPENED"
  | "TIME_LIMIT_REACHED"
  | "LOCATION_CHANGED"
  | "DEVICE_UNLOCKED";

export type RuleActionType = "BLOCK" | "ALLOW" | "NOTIFY";

export type RuleConditionRecord =
  | { kind: "event_type"; value: DecisioningEventType }
  | { kind: "app"; packageName: string }
  | { kind: "time_window"; start: string; end: string; outsideWindow: boolean }
  | { kind: "payload"; key: string; value: string };

export interface DeviceEventRecord {
  eventId: string;
  userId: string;
  deviceId: string;
  type: DecisioningEventType;
  payload: Record<string, string>;
  timestamp: admin.firestore.Timestamp;
  createdAt: admin.firestore.FieldValue;
}

export interface RuleRecord {
  ruleId: string;
  userId: string;
  deviceId: string;
  name: string;
  reason: string;
  action: RuleActionType;
  enabled: boolean;
  source: "user_defined";
  conditions: RuleConditionRecord[];
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
}

export interface DecisionTraceRecord {
  traceId: string;
  userId: string;
  deviceId: string;
  ruleId: string;
  reason: string;
  action: RuleActionType;
  eventType: DecisioningEventType;
  timestamp: admin.firestore.Timestamp;
  createdAt: admin.firestore.FieldValue;
}

export interface SuggestionRecord {
  suggestionId: string;
  userId: string;
  deviceId: string;
  title: string;
  description: string;
  reason: string;
  suggestedAction: RuleActionType;
  status: "pending_user_review";
  createdAt: admin.firestore.FieldValue;
}
