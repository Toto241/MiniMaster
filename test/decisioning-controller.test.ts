/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

const mockDbObj: any = { collection: jest.fn() };

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }

  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };

  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
  };
});

const testEnv = fft();
let fns: any;
let db: any;
let state: Record<string, Record<string, any>> = {};

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };

function resetState() {
  state = {
    users: {},
    devices: {},
    events: {},
    rules: {},
    suggestions: {},
    decision_traces: {},
    masters: { m1: { uid: "m1" } },
    children: { c1: { masterImei: "m1", childImei: "c1", usageRules: {} } },
  };
}

function buildQuery(collectionName: string, filters: Array<{ field: string; value: any }> = [], maxItems?: number): any {
  return {
    where: jest.fn((field: string, _op: string, value: any) => buildQuery(collectionName, [...filters, { field, value }], maxItems)),
    orderBy: jest.fn((_field: string, _direction?: string) => buildQuery(collectionName, filters, maxItems)),
    limit: jest.fn((nextLimit: number) => buildQuery(collectionName, filters, nextLimit)),
    get: jest.fn(async () => {
      const docs = Object.entries(state[collectionName] || {})
        .filter(([, data]) => filters.every((filter) => data?.[filter.field] === filter.value))
        .slice(0, maxItems ?? Number.MAX_SAFE_INTEGER)
        .map(([id, data]) => ({ id, data: () => data, ref: { id } }));
      return { empty: docs.length === 0, size: docs.length, docs };
    }),
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((name: string) => {
    const collectionName = String(name);
    const collectionState = state[collectionName] || (state[collectionName] = {});
    return {
      doc: jest.fn((docId?: string) => {
        const id = docId || `auto_${Date.now()}`;
        return {
          id,
          get: jest.fn(async () => ({ exists: Boolean(collectionState[id]), data: () => collectionState[id], id })),
          set: jest.fn(async (data: any, options?: { merge?: boolean }) => {
            collectionState[id] = options?.merge ? { ...(collectionState[id] || {}), ...data } : { ...data };
          }),
          update: jest.fn(async (data: any) => {
            collectionState[id] = { ...(collectionState[id] || {}), ...data };
          }),
          delete: jest.fn(async () => { delete collectionState[id]; }),
        };
      }),
      where: jest.fn((field: string, op: string, value: any) => buildQuery(collectionName, [{ field, value }])),
      get: jest.fn(async () => {
        const docs = Object.entries(collectionState).map(([id, data]) => ({ id, data: () => data, ref: { id } }));
        return { empty: docs.length === 0, size: docs.length, docs };
      }),
    } as any;
  });

  (db).batch = jest.fn(() => {
    const operations: Array<() => void> = [];
    return {
      set: jest.fn((ref: any, data: any, options?: { merge?: boolean }) => {
        operations.push(() => {
          const collectionName = String(ref.path || ref.id).includes("__") ? "rules" : "rules";
          const existing = state[collectionName][ref.id] || {};
          state[collectionName][ref.id] = options?.merge ? { ...existing, ...data } : { ...data };
        });
      }),
      delete: jest.fn((ref: any) => {
        operations.push(() => { delete state.rules[ref.id]; });
      }),
      commit: jest.fn(async () => { operations.forEach((operation) => operation()); }),
    };
  });
});

afterAll(() => testEnv.cleanup());

describe("decisioning controller", () => {
  it("ingestEvent stores canonical event and identity records", async () => {
    const wrapped = testEnv.wrap(fns.ingestEvent);
    const result = await wrapped({
      deviceId: "c1",
      type: "APP_OPENED",
      payload: { packageName: "com.video.app" },
      timestamp: 1712736000000,
    }, asMaster);

    expect(result).toHaveProperty("eventId");
    expect(Object.keys(state.events)).toHaveLength(1);
    expect(state.users.m1.userId).toBe("m1");
    expect(state.devices.c1.userId).toBe("m1");
  });

  it("setUsageRules syncs deterministic canonical rules and getRules returns them", async () => {
    const saveRules = testEnv.wrap(fns.setUsageRules);
    await saveRules({
      childId: "c1",
      usageRules: {
        dailyLimitSeconds: 1800,
        allowedHours: { start: "08:00", end: "20:00" },
        appLimits: { "com.video.app": 600 },
      },
    }, asMaster);

    const getRules = testEnv.wrap(fns.getRules);
    const result = await getRules({ deviceId: "c1" }, asMaster);

    expect(result.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "daily-limit", userId: "m1", deviceId: "c1" }),
      expect.objectContaining({ ruleId: "allowed-window", userId: "m1", deviceId: "c1" }),
      expect.objectContaining({ ruleId: "per-app-limit-com.video.app", userId: "m1", deviceId: "c1" }),
    ]));
  });

  it("generateSuggestion creates deterministic suggestion without auto-action", async () => {
    state.events.e1 = {
      eventId: "e1",
      userId: "m1",
      deviceId: "c1",
      type: "TIME_LIMIT_REACHED",
      payload: { packageName: "com.video.app", scope: "per_app" },
      timestamp: { toMillis: () => 1712736000000 },
      createdAt: "mock-server-timestamp",
    };

    const wrapped = testEnv.wrap(fns.generateSuggestion);
    const result = await wrapped({ deviceId: "c1" }, asMaster);

    expect(result.suggestion).toEqual(expect.objectContaining({
      deviceId: "c1",
      userId: "m1",
      status: "pending_user_review",
      suggestedAction: "BLOCK",
    }));
    expect(Object.keys(state.suggestions)).toHaveLength(1);
  });

  it("logDecision stores decision trace transparently", async () => {
    const wrapped = testEnv.wrap(fns.logDecision);
    const result = await wrapped({
      deviceId: "c1",
      ruleId: "daily-limit",
      reason: "Das Limit wurde erreicht.",
      action: "BLOCK",
      eventType: "TIME_LIMIT_REACHED",
      timestamp: 1712736000000,
    }, asMaster);

    expect(result).toHaveProperty("traceId");
    expect(Object.keys(state.decision_traces)).toHaveLength(1);
    const trace = Object.values(state.decision_traces)[0];
    expect(trace.ruleId).toBe("daily-limit");
    expect(trace.userId).toBe("m1");
  });

  it("generateSuggestion rejects a request without deviceId", async () => {
    const wrapped = testEnv.wrap(fns.generateSuggestion);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/deviceId ist erforderlich/);
  });

  it("generateSuggestion returns null when no deterministic pattern is found", async () => {
    // A single APP_OPENED event does not trigger any suggestion heuristic.
    state.events.e1 = {
      eventId: "e1",
      userId: "m1",
      deviceId: "c1",
      type: "APP_OPENED",
      payload: { packageName: "com.video.app" },
      timestamp: { toMillis: () => 1712736000000 },
      createdAt: "mock-server-timestamp",
    };

    const wrapped = testEnv.wrap(fns.generateSuggestion);
    const result = await wrapped({ deviceId: "c1" }, asMaster);

    expect(result.suggestion).toBeNull();
    expect(result.message).toMatch(/Keine deterministische Empfehlung/);
    expect(Object.keys(state.suggestions)).toHaveLength(0);
  });

  it("getRules without a deviceId returns all rules for the user", async () => {
    state.rules["c1__daily-limit"] = { ruleId: "daily-limit", userId: "m1", deviceId: "c1" };
    state.rules["c2__daily-limit"] = { ruleId: "daily-limit", userId: "m1", deviceId: "c2" };

    const getRules = testEnv.wrap(fns.getRules);
    const result = await getRules({}, asMaster);

    expect(result.rules).toHaveLength(2);
  });

  it("setUsageRules deletes stale canonical rules that are no longer present", async () => {
    // Seed a stale rule (with a ruleId) and one without a ruleId field for device c1.
    state.rules["c1__stale-rule"] = { ruleId: "stale-rule", userId: "m1", deviceId: "c1" };
    state.rules["c1__legacy-noid"] = { userId: "m1", deviceId: "c1" };

    const saveRules = testEnv.wrap(fns.setUsageRules);
    await saveRules({
      childId: "c1",
      usageRules: { dailyLimitSeconds: 1800 },
    }, asMaster);

    // Stale rules removed; the freshly synced canonical rule is present.
    expect(state.rules["c1__stale-rule"]).toBeUndefined();
    expect(state.rules["c1__legacy-noid"]).toBeUndefined();
    expect(Object.keys(state.rules).some((id) => id.includes("daily-limit"))).toBe(true);
  });
});
