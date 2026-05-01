import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { db } from "../../firebase";
import {
  DECISIONING_COLLECTIONS,
  type DecisionTraceRecord,
  type DeviceEventRecord,
  type RuleRecord,
  type SuggestionRecord,
} from "../models/decisioning";

export class DecisioningRepository {
  private readonly database = db();

  async ensureUserAndDevice(userId: string, deviceId: string): Promise<void> {
    await Promise.all([
      this.database.collection(DECISIONING_COLLECTIONS.users).doc(userId).set({
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      this.database.collection(DECISIONING_COLLECTIONS.devices).doc(deviceId).set({
        deviceId,
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
  }

  async saveEvent(record: Omit<DeviceEventRecord, "eventId" | "createdAt">): Promise<string> {
    const eventId = randomUUID();
    await this.database.collection(DECISIONING_COLLECTIONS.events).doc(eventId).set({
      ...record,
      eventId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    } satisfies DeviceEventRecord);
    return eventId;
  }

  async saveDecisionTrace(record: Omit<DecisionTraceRecord, "traceId" | "createdAt">): Promise<string> {
    const traceId = randomUUID();
    await this.database.collection(DECISIONING_COLLECTIONS.decisionTraces).doc(traceId).set({
      ...record,
      traceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    } satisfies DecisionTraceRecord);
    return traceId;
  }

  async saveSuggestion(record: Omit<SuggestionRecord, "suggestionId" | "createdAt">): Promise<string> {
    const suggestionId = randomUUID();
    await this.database.collection(DECISIONING_COLLECTIONS.suggestions).doc(suggestionId).set({
      ...record,
      suggestionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    } satisfies SuggestionRecord);
    return suggestionId;
  }

  async listRules(userId: string, deviceId?: string): Promise<RuleRecord[]> {
    let query: FirebaseFirestore.Query = this.database.collection(DECISIONING_COLLECTIONS.rules).where("userId", "==", userId);
    if (deviceId) {
      query = query.where("deviceId", "==", deviceId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as RuleRecord);
  }

  async listRecentEvents(userId: string, deviceId: string, limit = 20): Promise<DeviceEventRecord[]> {
    const snapshot = await this.database.collection(DECISIONING_COLLECTIONS.events)
      .where("userId", "==", userId)
      .where("deviceId", "==", deviceId)
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as DeviceEventRecord);
  }

  async replaceRulesForDevice(userId: string, deviceId: string, rules: RuleRecord[]): Promise<void> {
    const collection = this.database.collection(DECISIONING_COLLECTIONS.rules);
    const existingSnapshot = await collection
      .where("userId", "==", userId)
      .where("deviceId", "==", deviceId)
      .get();

    const nextIds = new Set(rules.map((rule) => rule.ruleId));
    const batch = this.database.batch();

    existingSnapshot.docs.forEach((doc) => {
      const existingRuleId = String(doc.data().ruleId || doc.id);
      if (!nextIds.has(existingRuleId)) {
        batch.delete(doc.ref);
      }
    });

    rules.forEach((rule) => {
      const docRef = collection.doc(`${deviceId}__${rule.ruleId}`);
      batch.set(docRef, rule, { merge: true });
    });

    await batch.commit();
  }
}
