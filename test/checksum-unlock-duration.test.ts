/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for two new features:
 * - checksum field in publishLegalPolicy (legal.ts)
 * - unlockDuration/unlockUntil fields in createTask/approveTask (tasks.ts)
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";
import { __legalTestables } from "../src/legal";

const mockSend = jest.fn().mockResolvedValue("mock-msg-id");
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

const mockBucket = {
  name: "test-bucket",
  getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
};
jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => mockBucket),
  })),
}));

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
};

const mockDbObj = { collection: jest.fn() };
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({ bucket: jest.fn(() => mockBucket) })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
    messaging: () => ({ send: mockSend }),
  };
});

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({
      purchases: { subscriptions: { get: jest.fn() } },
    })),
  },
}));

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", fcmToken: "master-fcm", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: { masterImei: "m1", fcmToken: "child-fcm" },
    },
    legalPolicies: {},
    masterLegalConsents: {},
    supportTickets: {},
    supportAccessGrants: {},
    subscriptions: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
    return {
      doc: jest.fn((docId: string) => {
        const ref: any = {
          get: () => {
            const d = collData[docId];
            return Promise.resolve({ exists: !!d, data: () => d, id: docId, ref });
          },
          update: jest.fn((upd: any) => { if (collData[docId]) Object.assign(collData[docId], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[docId] = opts?.merge ? { ...(collData[docId] || {}), ...data } : { ...data };
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()) },
                })),
              })),
              doc: jest.fn((subId?: string) => {
                const id = subId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                return {
                get: jest.fn(() => {
                  const sd = state[key]?.[id];
                  return Promise.resolve({ exists: !!sd, data: () => sd, id });
                }),
                set: jest.fn((data: any) => { state[key][id] = data; return Promise.resolve(); }),
                update: jest.fn((upd: any) => {
                  if (state[key]?.[id]) Object.assign(state[key][id], upd);
                  return Promise.resolve();
                }),
                id,
              };}),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        return Promise.resolve({ id });
      }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [] })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ═══════════════════════════════════════════════════════════════════════════
// publishLegalPolicy — checksum
// ═══════════════════════════════════════════════════════════════════════════

describe("publishLegalPolicy checksum", () => {
  it("returns a SHA-256 checksum in the response", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "2026.04.01-1",
      contentUrl: "https://example.com/terms",
    }, asAdmin);

    expect(res.success).toBe(true);
    expect(res.checksum).toBeDefined();
    expect(typeof res.checksum).toBe("string");
    expect(res.checksum).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("stores checksum in the Firestore document", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "1.0.0",
      contentUrl: "https://example.com/privacy",
    }, asAdmin);

    const stored = state.legalPolicies[res.policyId];
    expect(stored).toBeDefined();
    expect(stored.checksum).toBe(res.checksum);
  });

  it("produces deterministic checksum for same inputs", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const params = {
      policyType: "terms" as const,
      country: "DE",
      locale: "de-DE",
      version: "2.0.0",
      contentUrl: "https://example.com/terms-v2",
    };

    const res1 = await wrapped(params, asAdmin);
    const res2 = await wrapped(params, asAdmin);
    expect(res1.checksum).toBe(res2.checksum);
  });

  it("produces different checksums for different inputs", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res1 = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "1.0.0",
      contentUrl: "https://example.com/terms",
    }, asAdmin);
    const res2 = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "2.0.0",
      contentUrl: "https://example.com/terms",
    }, asAdmin);

    expect(res1.checksum).not.toBe(res2.checksum);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// createTask — unlockDuration
// ═══════════════════════════════════════════════════════════════════════════

describe("createTask with unlockDuration", () => {
  const futureDeadline = new Date(Date.now() + 3600000).toISOString();

  it("creates task without unlockDuration (backward compatible)", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Hausaufgaben machen",
      deadlineISO: futureDeadline,
    }, asMaster);

    expect(res.success).toBe(true);
    expect(res.taskId).toBeDefined();
  });

  it("creates task with valid unlockDuration", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Zimmer aufräumen",
      deadlineISO: futureDeadline,
      unlockDuration: 30,
    }, asMaster);

    expect(res.success).toBe(true);
    expect(res.taskId).toBeDefined();
  });

  it("rejects non-integer unlockDuration", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "Test",
      deadlineISO: futureDeadline,
      unlockDuration: 30.5,
    }, asMaster)).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects unlockDuration < 1", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "Test",
      deadlineISO: futureDeadline,
      unlockDuration: 0,
    }, asMaster)).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("rejects unlockDuration > 1440", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "Test",
      deadlineISO: futureDeadline,
      unlockDuration: 1441,
    }, asMaster)).rejects.toMatchObject({ code: "invalid-argument" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// approveTask — unlockUntil computation
// ═══════════════════════════════════════════════════════════════════════════

describe("approveTask with unlockDuration", () => {
  it("sets unlockUntil when task has unlockDuration", async () => {
    // Seed a task in pending_approval state with unlockDuration
    state["children/c1/tasks"] = {
      task1: {
        description: "Aufgabe",
        status: "pending_approval",
        masterImei: "m1",
        unlockDuration: 60,
      },
    };

    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ childId: "c1", taskId: "task1" }, asMaster);

    expect(res.success).toBe(true);
    const task = state["children/c1/tasks"].task1;
    expect(task.status).toBe("approved");
    expect(task.unlockUntil).toBeDefined();
  });

  it("does not set unlockUntil when task has no unlockDuration", async () => {
    state["children/c1/tasks"] = {
      task2: {
        description: "Aufgabe ohne Unlock",
        status: "pending_approval",
        masterImei: "m1",
      },
    };

    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ childId: "c1", taskId: "task2" }, asMaster);

    expect(res.success).toBe(true);
    const task = state["children/c1/tasks"].task2;
    expect(task.status).toBe("approved");
    expect(task.unlockUntil).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// mapPolicyDoc — checksum mapping
// ═══════════════════════════════════════════════════════════════════════════

describe("mapPolicyDoc checksum", () => {
  it("includes checksum when present in document", () => {
    const { mapPolicyDoc } = __legalTestables;
    const doc = {
      exists: true,
      data: () => ({
        policyType: "terms",
        country: "DE",
        locale: "de-DE",
        version: "1.0.0",
        contentUrl: "https://example.com/terms",
        isMajorChange: false,
        checksum: "abc123def456",
      }),
    };
    const result = mapPolicyDoc(doc);
    expect(result).not.toBeNull();
    expect(result.checksum).toBe("abc123def456");
  });

  it("omits checksum when not present in document", () => {
    const { mapPolicyDoc } = __legalTestables;
    const doc = {
      exists: true,
      data: () => ({
        policyType: "terms",
        country: "DE",
        locale: "de-DE",
        version: "1.0.0",
        contentUrl: "https://example.com/terms",
        isMajorChange: true,
      }),
    };
    const result = mapPolicyDoc(doc);
    expect(result).not.toBeNull();
    expect(result.checksum).toBeUndefined();
  });
});
