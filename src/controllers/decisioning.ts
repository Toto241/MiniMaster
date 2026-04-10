import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { requireAuth, validateAppCheck } from "../shared";
import { DecisioningRepository } from "../repositories/decisioning-repository";
import { buildCanonicalRulesFromUsageRules, buildSuggestionFromEvents, toDeviceEventRecord } from "../services/decisioning-service";
import { validateDecisionTraceInput, validateDeviceEventInput, validateGetRulesInput } from "../validators/decisioning";
import * as admin from "firebase-admin";

const repository = new DecisioningRepository();

export const ingestEvent = functions.https.onCall(async (data: unknown, context: CallableContext) => {
  const userId = requireAuth(context);
  validateAppCheck(context, true);
  const event = validateDeviceEventInput(data);

  await repository.ensureUserAndDevice(userId, event.deviceId);
  const eventId = await repository.saveEvent(
    toDeviceEventRecord(userId, event.deviceId, event.type, event.payload, event.timestamp)
  );
  return { eventId, accepted: true };
});

export const getRules = functions.https.onCall(async (data: unknown, context: CallableContext) => {
  const userId = requireAuth(context);
  validateAppCheck(context, true);
  const { deviceId } = validateGetRulesInput(data);
  const rules = await repository.listRules(userId, deviceId);
  return { rules };
});

export const generateSuggestion = functions.https.onCall(async (data: unknown, context: CallableContext) => {
  const userId = requireAuth(context);
  validateAppCheck(context, true);
  const { deviceId } = validateGetRulesInput(data);
  if (!deviceId) {
    throw new functions.https.HttpsError("invalid-argument", "deviceId ist erforderlich.");
  }

  await repository.ensureUserAndDevice(userId, deviceId);
  const events = await repository.listRecentEvents(userId, deviceId, 20);
  const suggestion = buildSuggestionFromEvents(userId, deviceId, events);
  if (!suggestion) {
    return { suggestion: null, message: "Keine deterministische Empfehlung verfügbar." };
  }

  const suggestionId = await repository.saveSuggestion(suggestion);
  return { suggestionId, suggestion };
});

export const logDecision = functions.https.onCall(async (data: unknown, context: CallableContext) => {
  const userId = requireAuth(context);
  validateAppCheck(context, true);
  const trace = validateDecisionTraceInput(data);

  await repository.ensureUserAndDevice(userId, trace.deviceId);
  const traceId = await repository.saveDecisionTrace({
    userId,
    deviceId: trace.deviceId,
    ruleId: trace.ruleId,
    reason: trace.reason,
    action: trace.action,
    eventType: trace.eventType,
    timestamp: admin.firestore.Timestamp.fromMillis(trace.timestamp),
  });

  return { traceId, recorded: true };
});

export async function syncLegacyUsageRulesToCanonicalRules(
  userId: string,
  deviceId: string,
  usageRules: Record<string, unknown>,
): Promise<void> {
  await repository.ensureUserAndDevice(userId, deviceId);
  const rules = buildCanonicalRulesFromUsageRules(userId, deviceId, usageRules);
  await repository.replaceRulesForDevice(userId, deviceId, rules);
}