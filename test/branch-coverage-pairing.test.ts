/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage for pairing.ts — remaining uncovered branches:
 * - activateTrialIfPending: trial_pending → trial activation (lines 24-29)
 * - validatePairingCode: masterId missing / malformed (line 182)
 * - validatePairingToken: tokenData missing masterId (lines 264-265)
 * - generatePairingLink: master with no subscription → resource-exhausted (line 364)
 *
 * Also covers: generatePairingLink error catch non-HttpsError wrapping
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
const asChild = { auth: { uid: "child1", token: { role: "child" } } };

function makeTimestamp(offsetSeconds: number) {
  const adminMod = require("firebase-admin");
  return new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + offsetSeconds, 0);
}

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "sk-123", fcmToken: "fcm-m1",
        subscription: { status: "trial_pending", childLimit: 5 },
      },
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
        const id = docId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn((_field: string, _op: string, value: any) => ({
        limit: jest.fn().mockReturnValue({
          get: jest.fn(() => {
            const matches = Object.entries(collData)
              .filter(([, d]: [string, any]) => d?.[_field] === value)
              .map(([id, data]) => ({ id, data: () => data, ref: { id } }));
            return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
          }),
        }),
        get: jest.fn(() => {
          const matches = Object.entries(collData)
            .filter(([, d]: [string, any]) => d?.[_field] === value)
            .map(([id, data]) => ({ id, data: () => data, ref: { id } }));
          return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
        }),
      })),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data,
          ref: { id, delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }), update: jest.fn() },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db).batch = jest.fn(() => ({
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
// activateTrialIfPending — trial_pending → trial activation
// ══════════════════════════════════════════════════════════════════════════

describe("pairing — activateTrialIfPending via validatePairingCode", () => {
  it("aktiviert Trial wenn Master-Status trial_pending (lines 24-29)", async () => {
    // Master with trial_pending gets trial activated after successful pairing
    state.pairingCodes["123456"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "123456" }, asChild);
    expect(res.childId).toBeDefined();

    // Verify master's subscription was updated from trial_pending to trial
    expect(state.masters.m1.subscription.status).toBe("trial");
    expect(state.masters.m1.subscription.trialStartedAt).toBeDefined();
    expect(state.masters.m1.subscription.trialEndsAt).toBeDefined();
  });

  it("aktiviert Trial NICHT wenn Master-Status schon active", async () => {
    state.masters.m1.subscription = { status: "active", childLimit: 5 };
    state.pairingCodes["654321"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "654321" }, asChild);
    expect(res.childId).toBeDefined();
    // Subscription should remain active, not changed to trial
    expect(state.masters.m1.subscription.status).toBe("active");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// validatePairingCode — masterId missing (line 182)
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingCode — masterId missing branch", () => {
  it("wirft internal bei fehlendem masterId im Code-Dokument", async () => {
    state.pairingCodes["999999"] = {
      // No masterId field at all
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "999999" }, asChild))
      .rejects.toThrow(/masterId|data structure/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// validatePairingToken — tokenData missing masterId (lines 264-265)
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingToken — masterId missing branch", () => {
  it("wirft internal bei fehlendem masterId im Token-Dokument", async () => {
    state.pairingTokens["11111111-1111-1111-1111-111111111111"] = {
      // No masterId/masterImei field
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "11111111-1111-1111-1111-111111111111" }, asChild))
      .rejects.toThrow(/masterId|missing/i);
  });

  it("wirft internal bei null masterId im Token", async () => {
    state.pairingTokens["22222222-2222-2222-2222-222222222222"] = {
      masterId: null,
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "22222222-2222-2222-2222-222222222222" }, asChild))
      .rejects.toThrow(/masterId|missing/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// generatePairingLink — no subscription (line 364)
// ══════════════════════════════════════════════════════════════════════════

describe("generatePairingLink — subscription branches", () => {
  it("wirft resource-exhausted wenn Master keine Subscription hat", async () => {
    state.masters.m1.subscription = { status: "expired" };

    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster))
      .rejects.toThrow(/trial|expired|subscribe/i);
  });

  it("generiert Link erfolgreich bei trial_pending Status", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(res.pairingLink).toContain("token=");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// validatePairingToken — activateTrialIfPending via token path
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingToken — trial activation via token", () => {
  it("aktiviert Trial bei validatePairingToken mit trial_pending Master", async () => {
    // Master must have trial_pending to trigger activateTrialIfPending body (lines 24-29)
    state.masters.m1.subscription = { status: "trial_pending" };
    state.pairingTokens["33333333-3333-3333-3333-333333333333"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(300),
    };

    const wrapped = testEnv.wrap(fns.validatePairingToken);
    const res = await wrapped({ pairingToken: "33333333-3333-3333-3333-333333333333" }, asChild);
    expect(res.childId).toBeDefined();
    expect(state.masters.m1.subscription.status).toBe("trial");
  });

  it("aktiviert Trial bei validatePairingCode mit trial_pending Master (lines 24-29)", async () => {
    state.masters.m1.subscription = { status: "trial_pending" };
    state.pairingCodes["777777"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "777777" }, asChild);
    expect(res.childId).toBeDefined();
    expect(state.masters.m1.subscription.status).toBe("trial");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROUND 2 — additional branch coverage for || fallback paths
// ══════════════════════════════════════════════════════════════════════════

describe("pairing — childLimit/parentAppLimit truthy branches", () => {
  it("validatePairingCode nutzt subscription.childLimit wenn definiert (line 182)", async () => {
    // Master with explicit childLimit=2, and already has 1 child
    state.masters.m1.subscription = { status: "active", childLimit: 2, parentAppLimit: 3 };
    state.children.existing1 = { masterImei: "m1", childImei: "existing1" };
    state.pairingCodes["111111"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "111111" }, asChild);
    expect(res.childId).toBeDefined();
  });

  it("validatePairingCode wirft resource-exhausted bei erreichtem childLimit", async () => {
    state.masters.m1.subscription = { status: "active", childLimit: 1 };
    state.children.existing1 = { masterImei: "m1", childImei: "existing1" };
    state.pairingCodes["222222"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222222" }, asChild))
      .rejects.toThrow(/limit reached/i);
  });

  it("generatePairingLink nutzt subscription.childLimit und parentAppLimit (lines 264-265)", async () => {
    state.masters.m1.subscription = { status: "active", childLimit: 10, parentAppLimit: 5 };

    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(res.distribution.parentAppLimit).toBe(5);
  });

  it("validatePairingToken nutzt subscription.childLimit (line 364)", async () => {
    state.masters.m1.subscription = { status: "active", childLimit: 3, parentAppLimit: 2 };
    state.pairingTokens["44444444-4444-4444-4444-444444444444"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(300),
    };

    const wrapped = testEnv.wrap(fns.validatePairingToken);
    const res = await wrapped({ pairingToken: "44444444-4444-4444-4444-444444444444" }, asChild);
    expect(res.childId).toBeDefined();
  });

  it("validatePairingCode nutzt DEFAULT wenn childLimit nicht gesetzt (|| fallback line 182)", async () => {
    // No childLimit in subscription → uses DEFAULT_CHILD_APP_LIMIT fallback
    state.masters.m1.subscription = { status: "active" };
    state.pairingCodes["222222"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(3600),
    };

    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "222222" }, asChild);
    expect(res.childId).toBeDefined();
  });

  it("generatePairingLink nutzt DEFAULT bei fehlendem childLimit/parentAppLimit (lines 264-265)", async () => {
    // No childLimit or parentAppLimit → both fallback to DEFAULT
    state.masters.m1.subscription = { status: "active" };

    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(res.pairingLink).toContain("token=");
  });

  it("validatePairingToken nutzt DEFAULT wenn childLimit nicht gesetzt", async () => {
    state.masters.m1.subscription = { status: "active" };
    state.pairingTokens["55555555-5555-5555-5555-555555555555"] = {
      masterId: "m1",
      createdAt: makeTimestamp(-60),
      expiresAt: makeTimestamp(300),
    };

    const wrapped = testEnv.wrap(fns.validatePairingToken);
    const res = await wrapped({ pairingToken: "55555555-5555-5555-5555-555555555555" }, asChild);
    expect(res.childId).toBeDefined();
  });
});
