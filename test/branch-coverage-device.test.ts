/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage tests for device.ts — targeting setUsageRules validation branches:
 * - dailyLimitSeconds negative (line 144)
 * - allowedHours invalid start/end (lines 154-156)
 * - appLimits not-object (line 160)
 * - appLimits entry validation: empty package, non-numeric limit, negative limit (lines 161-166)
 * - bedtimeStart/End format validation
 * - scheduledDowntime pass-through
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

const mockSend = jest.fn().mockResolvedValue("mock-msg-id");
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

const mockDbObj = { collection: jest.fn() };
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
    messaging: () => ({ send: jest.fn() }),
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

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", secretKey: "sk-123", fcmToken: "fcm-m1", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "fcm-c1", isLocked: false, appBlacklist: [], usageRules: {} },
    },
    supportTickets: {},
    supportAccessGrants: {},
    subscriptions: {},
    legalPolicies: {},
    masterLegalConsents: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
    operatorAccessKeys: {},
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
      doc: jest.fn((docId?: string) => {
        const id = docId || `auto_${Date.now()}`;
        const ref: any = {
          id,
          get: () => {
            const d = collData[id];
            return Promise.resolve({ exists: !!d, data: () => d, id, ref });
          },
          update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[id] = opts?.merge ? { ...(collData[id] || {}), ...data } : { ...data };
            state[coll] = collData;
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${id}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([sid, sdata]) => ({
                  id: sid, data: () => sdata, ref: { delete: jest.fn(() => Promise.resolve()) },
                })),
              })),
              add: jest.fn((data: any) => {
                const sid = `auto_${Date.now()}`;
                state[key][sid] = data;
                return Promise.resolve({ id: sid });
              }),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}`;
        collData[id] = data;
        state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn((_field: string, _op: string, value: any) => {
        const buildSnapshot = () => {
          const matches = Object.entries(collData)
            .filter(([, d]: [string, any]) => d?.[_field] === value)
            .map(([id, data]) => ({ id, data: () => data, ref: { id } }));
          return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
        };
        const chained: any = {
          limit: jest.fn(() => ({ get: jest.fn(buildSnapshot) })),
          get: jest.fn(buildSnapshot),
          where: jest.fn(() => chained),
          orderBy: jest.fn(() => chained),
        };
        return chained;
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: { id, delete: jest.fn(() => Promise.resolve()), update: jest.fn() },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db).batch = jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  }));

  (db).runTransaction = jest.fn(async (fn: any) => {
    const tx = {
      get: jest.fn(async (ref: any) => ref.get()),
      update: jest.fn((ref: any, data: any) => ref.update(data)),
      set: jest.fn((ref: any, data: any) => ref.set(data)),
    };
    return fn(tx);
  });

  (db).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// setUsageRules — validation branches
// ══════════════════════════════════════════════════════════════════════════

describe("setUsageRules — validation branch coverage", () => {
  it("wirft bei negativem dailyLimitSeconds", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { dailyLimitSeconds: -10 },
    }, asMaster)).rejects.toThrow(/dailyLimitSeconds/);
  });

  it("wirft bei nicht-numerischem dailyLimitSeconds", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { dailyLimitSeconds: "abc" },
    }, asMaster)).rejects.toThrow(/dailyLimitSeconds/);
  });

  it("erlaubt allowedHours ohne start (optional)", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1",
      usageRules: { allowedHours: { end: "18:00" } },
    }, asMaster);
    expect(res).toEqual({ success: true });
  });

  it("erlaubt allowedHours ohne end (optional)", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1",
      usageRules: { allowedHours: { start: "08:00" } },
    }, asMaster);
    expect(res).toEqual({ success: true });
  });

  it("wirft bei allowedHours als null", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { allowedHours: null },
    }, asMaster)).rejects.toThrow(/allowedHours/);
  });

  it("wirft bei allowedHours mit ungültigem Format", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { allowedHours: { start: "8am", end: "6pm" } },
    }, asMaster)).rejects.toThrow(/allowedHours/);
  });

  it("wirft bei appLimits als nicht-Objekt", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { appLimits: "not-an-object" },
    }, asMaster)).rejects.toThrow(/appLimits must be an object/);
  });

  it("wirft bei appLimits als null", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { appLimits: null },
    }, asMaster)).rejects.toThrow(/appLimits is required/);
  });

  it("wirft bei appLimits Eintrag mit leerem Package-Name", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { appLimits: { "": 30 } },
    }, asMaster)).rejects.toThrow(/appLimits entries/);
  });

  it("wirft bei appLimits Eintrag mit nicht-numerischem Limit", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { appLimits: { "com.test": "thirty" } },
    }, asMaster)).rejects.toThrow(/appLimits entries/);
  });

  it("wirft bei appLimits Eintrag mit negativem Limit", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { appLimits: { "com.test": -5 } },
    }, asMaster)).rejects.toThrow(/appLimits entries/);
  });

  it("wirft bei ungültigem bedtimeStart Format", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { bedtimeStart: "9pm" },
    }, asMaster)).rejects.toThrow(/bedtimeStart/);
  });

  it("wirft bei ungültigem bedtimeEnd Format", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c1",
      usageRules: { bedtimeEnd: "morning" },
    }, asMaster)).rejects.toThrow(/bedtimeEnd/);
  });

  it("akzeptiert gültige allowedHours", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1",
      usageRules: { allowedHours: { start: "08:00", end: "18:00" } },
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("akzeptiert gültige appLimits", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1",
      usageRules: { appLimits: { "com.example.app": 60, "com.other.app": 120 } },
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("akzeptiert gültiges bedtimeStart/End", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({
      childId: "c1",
      usageRules: { bedtimeStart: "21:00", bedtimeEnd: "07:00" },
    }, asMaster);
    expect(res.success).toBe(true);
  });
});
