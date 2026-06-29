import * as admin from "firebase-admin";
import type { DecisioningEventType, DeviceEventRecord, RuleActionType, RuleConditionRecord, RuleRecord, SuggestionRecord } from "../models/decisioning";

function toTimestamp(timestampMs: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(timestampMs);
}

export function buildCanonicalRulesFromUsageRules(
  userId: string,
  deviceId: string,
  usageRules: Record<string, unknown>,
): RuleRecord[] {
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  const rules: RuleRecord[] = [];

  const pushRule = (ruleId: string, name: string, reason: string, conditions: RuleConditionRecord[], action: RuleActionType = "BLOCK") => {
    rules.push({
      ruleId,
      userId,
      deviceId,
      name,
      reason,
      action,
      enabled: true,
      source: "user_defined",
      conditions,
      createdAt,
      updatedAt,
    });
  };

  const allowedHours = usageRules.allowedHours as Record<string, unknown> | undefined;
  const appLimits = usageRules.appLimits as Record<string, unknown> | undefined;

  if (typeof usageRules.dailyLimitSeconds === "number" && usageRules.dailyLimitSeconds > 0) {
    pushRule(
      "daily-limit",
      "Statisches Tageslimit",
      "Das statische Tageslimit wurde überschritten.",
      [
        { kind: "event_type", value: "TIME_LIMIT_REACHED" },
        { kind: "payload", key: "scope", value: "daily" },
      ],
    );
  }

  if (allowedHours && typeof allowedHours.start === "string" && typeof allowedHours.end === "string") {
    pushRule(
      "allowed-window",
      "Erlaubtes Zeitfenster",
      "Die Nutzung liegt außerhalb des erlaubten Zeitfensters.",
      [
        { kind: "event_type", value: "APP_OPENED" },
        { kind: "time_window", start: allowedHours.start, end: allowedHours.end, outsideWindow: true },
      ],
    );
  }

  if (appLimits && typeof appLimits === "object") {
    Object.keys(appLimits).forEach((packageName) => {
      pushRule(
        `per-app-limit-${packageName}`,
        `App-Limit ${packageName}`,
        `Das App-spezifische Limit für ${packageName} wurde überschritten.`,
        [
          { kind: "event_type", value: "TIME_LIMIT_REACHED" },
          { kind: "app", packageName },
        ],
      );
    });
  }

  return rules;
}

export function toDeviceEventRecord(
  userId: string,
  deviceId: string,
  type: DecisioningEventType,
  payload: Record<string, string>,
  timestamp: number,
): Omit<DeviceEventRecord, "eventId" | "createdAt"> {
  return {
    userId,
    deviceId,
    type,
    payload,
    timestamp: toTimestamp(timestamp),
  };
}

export function buildSuggestionFromEvents(
  userId: string,
  deviceId: string,
  events: DeviceEventRecord[],
): Omit<SuggestionRecord, "suggestionId" | "createdAt"> | null {
  const byPackage = new Map<string, number>();
  let latestLimitViolation: string | null = null;

  events.forEach((event) => {
    const packageName = event.payload.packageName;
    if (packageName) {
      byPackage.set(packageName, (byPackage.get(packageName) || 0) + 1);
    }
    if (event.type === "TIME_LIMIT_REACHED" && packageName) {
      latestLimitViolation = packageName;
    }
  });

  if (latestLimitViolation) {
    const violationPackage = latestLimitViolation as string;
    return {
      userId,
      deviceId,
      title: `Limit für ${violationPackage} vorschlagen`,
      description: `Das Gerät hat erneut ein Zeitlimit bei ${violationPackage} erreicht. Das System schlägt nur eine strengere Regel vor; es wird nichts automatisch umgesetzt.`,
      reason: `Mehrere TIME_LIMIT_REACHED-Events für ${violationPackage}.`,
      suggestedAction: "BLOCK",
      status: "pending_user_review",
    };
  }

  const mostOpened = Array.from(byPackage.entries()).sort((left, right) => right[1] - left[1])[0];
  if (mostOpened && mostOpened[1] >= 3) {
    return {
      userId,
      deviceId,
      title: `Nutzungsregel für ${mostOpened[0]} prüfen`,
      description: `${mostOpened[0]} wurde in kurzer Zeit ${mostOpened[1]} Mal geöffnet. Das System empfiehlt eine Nutzerprüfung statt einer automatischen Änderung.`,
      reason: `Mehrfache APP_OPENED-Events für ${mostOpened[0]}.`,
      suggestedAction: "NOTIFY",
      status: "pending_user_review",
    };
  }

  return null;
}
