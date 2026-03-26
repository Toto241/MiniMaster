/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for LEGACY_AUTH_DISABLED=true branches in auth.ts.
 * - generateCustomToken: LEGACY_AUTH_DISABLED disables legacy secretKey login (line 733)
 * - registerMasterDevice: LEGACY_AUTH_DISABLED disables IMEI-only registration (line 806)
 *
 * IMPORTANT: process.env.DISABLE_LEGACY_SECRETKEY_AUTH is set BEFORE module load
 * so the module-level constant LEGACY_AUTH_DISABLED evaluates to true.
 */
process.env.DISABLE_LEGACY_SECRETKEY_AUTH = "true";

import fft from "firebase-functions-test";

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
  getUser: jest.fn().mockResolvedValue({ uid: "user1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
  createUser: jest.fn().mockImplementation((opts: { uid: string }) =>
    Promise.resolve({ uid: opts.uid, customClaims: {} })
  ),
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

let state: Record<string, any> = {};

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", secretKey: "sk-123", fcmToken: "fcm-m1" },
    },
    children: {},
    pairingCodes: {},
    pairingTokens: {},
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
    legacyAuthUsage: {},
  };
}

beforeAll(() => {
  fns = require("../index");
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  const db = mockDbObj;
  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
    return {
      doc: jest.fn((docId?: string) => {
        const id = docId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const ref: any = {
          id,
          get: () => {
            const d = collData[id];
            return Promise.resolve({ exists: !!d, data: () => d, id, ref });
          },
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[id] = opts?.merge ? { ...(collData[id] || {}), ...data } : { ...data };
            state[coll] = collData;
            return Promise.resolve();
          }),
          update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
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
              add: jest.fn((data: any) => { const sid = `auto_${Date.now()}`; state[key][sid] = data; return Promise.resolve({ id: sid }); }),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
        }),
        get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
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

  (db as any).runTransaction = jest.fn(async (fn: any) => {
    const tx = { get: jest.fn(async (ref: any) => ref.get()), update: jest.fn((ref: any, data: any) => ref.update(data)), set: jest.fn((ref: any, data: any) => ref.set(data)) };
    return fn(tx);
  });
  (db as any).collectionGroup = jest.fn().mockReturnValue({ where: jest.fn().mockReturnThis(), get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })) });
});

afterAll(() => {
  delete process.env.DISABLE_LEGACY_SECRETKEY_AUTH;
  testEnv.cleanup();
});

// ══════════════════════════════════════════════════════════════════════════
// generateCustomToken — LEGACY_AUTH_DISABLED=true
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken — LEGACY_AUTH_DISABLED", () => {
  it("wirft failed-precondition wenn Legacy-Login deaktiviert (line 733)", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    // Without auth context, should hit the LEGACY_AUTH_DISABLED branch
    await expect(wrapped({ masterImei: "m1", secretKey: "sk-123" }, {}))
      .rejects.toThrow(/Legacy.*disabled|secretKey.*disabled|Firebase Auth/i);
  });

  it("erlaubt Token-Generierung mit Auth trotz LEGACY_AUTH_DISABLED", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const asAdmin = { auth: { uid: "user1", token: { role: "admin" } } };
    const res = await wrapped({}, asAdmin);
    expect(res.customToken).toBe("mock-token");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// registerMasterDevice — LEGACY_AUTH_DISABLED=true
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice — LEGACY_AUTH_DISABLED", () => {
  it("wirft failed-precondition bei IMEI-Only-Registrierung (line 806)", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    // Without auth context, should hit the LEGACY_AUTH_DISABLED branch
    await expect(wrapped({ imei: "new-device" }, {}))
      .rejects.toThrow(/Legacy.*disabled|IMEI.*disabled|authenticated/i);
  });

  it("erlaubt Registrierung mit Auth trotz LEGACY_AUTH_DISABLED", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const asUser = { auth: { uid: "new-device", token: { role: "master" } } };
    const res = await wrapped({ imei: "new-device" }, asUser);
    expect(res).toBeDefined();
  });
});
