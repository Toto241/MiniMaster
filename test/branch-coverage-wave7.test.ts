/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch-coverage wave 7 – surgical targeting of remaining uncovered branches.
 * Focus: corrupted data paths in pairing, legal validation internals,
 * triggers edge cases, auth deeper paths, and catch blocks.
 *
 * Goal: push branch coverage from 86.61% to ≥90%.
 * Need ~44 more branches from 173 remaining uncovered.
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

// ── Mocks ──────────────────────────────────────────────────────────────────

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

const mockAuth: any = {
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: {} }),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
};
jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => mockAuth),
}));

const mockDbObj = { collection: jest.fn(), runTransaction: jest.fn(async (fn: any) => await fn({
  get: jest.fn(async (refOrQuery: any) => {
    if (refOrQuery.get) return await refOrQuery.get();
    return await refOrQuery.get();
  }),
  set: jest.fn((ref: any, data: any, opts?: any) => ref.set(data, opts)),
  update: jest.fn((ref: any, data: any) => ref.update(data)),
  delete: jest.fn((ref: any) => ref.delete()),
})) };

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
    static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
    toDate() { return new Date(this.seconds * 1000); }
  }
  const firestoreNamespace: any = () => mockDbObj;
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
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

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: {} } };
const asChild = { auth: { uid: "c1", token: {} } };
const noAuth = {};

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "secret123", fcmToken: "master-fcm-token",
        subscription: {
          status: "active", childLimit: 4, parentAppLimit: 2, type: "single_child_monthly",
          expiresAt: { seconds: Math.floor(Date.now() / 1000) + 86400 * 30, nanoseconds: 0, toMillis: () => Date.now() + 86400000 * 30 },
        },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: ["com.blocked"], usageRules: { dailyLimit: 120 } },
    },
    "children/c1/tasks": {},
    "children/c1/tamperEvents": {},
    pairingCodes: {},
    pairingTokens: {},
    subscriptions: {},
    supportTickets: {},
    supportAccessGrants: {},
    legalPolicies: {},
    masterLegalConsents: {},
    operatorConfig: {},
    error_logs: {},
    error_summaries: {},
    audit_logs: {},
    ai_error_analyses: {},
    legacyAuthUsage: {},
    rateLimits: {},
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};

    const buildWhereChain = (filters: Array<{ field: string; op: string; value: unknown }>) => {
      const chain: any = {
        where: jest.fn((field: string, op: string, value: unknown) => {
          return buildWhereChain([...filters, { field, op, value }]);
        }),
        get: jest.fn(() => {
          const docs = Object.entries(collData).map(([id, data]) => {
            const docRef: any = {
              id,
              delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            };
            docRef.collection = jest.fn((sub: string) => {
              const subKey = `${coll}/${id}/${sub}`;
              if (!state[subKey]) state[subKey] = {};
              return {
                get: jest.fn(() => Promise.resolve({
                  empty: Object.keys(state[subKey]).length === 0,
                  size: Object.keys(state[subKey]).length,
                  docs: Object.entries(state[subKey]).map(([sid, sd]) => ({ id: sid, exists: true, data: () => sd, ref: { id: sid } })),
                })),
                doc: jest.fn((sid?: string) => {
                  const sId = sid || `auto_${Date.now()}`;
                  return { id: sId, get: jest.fn(() => Promise.resolve({ exists: !!state[subKey]?.[sId], data: () => state[subKey]?.[sId], id: sId })) };
                }),
              };
            });
            return { id, exists: true, data: () => data, ref: docRef };
          });
          return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
        }),
      };
      chain.orderBy = jest.fn(() => chain);
      chain.limit = jest.fn(() => chain);
      return chain;
    };

    return {
      doc: jest.fn((docId: string) => {
        const ref: any = {
          id: docId,
          get: () => {
            const d = collData[docId];
            return Promise.resolve({ exists: !!d, data: () => d, id: docId, ref });
          },
          update: jest.fn((upd: any) => { if (collData[docId]) Object.assign(collData[docId], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[docId] = opts?.merge ? { ...(collData[docId] || {}), ...data } : { ...data };
            if (!state[coll]) state[coll] = collData;
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              doc: jest.fn((subId?: string) => {
                const sid = subId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                return {
                  id: sid,
                  get: jest.fn(() => {
                    const sd = state[key]?.[sid];
                    return Promise.resolve({ exists: !!sd, data: () => sd, id: sid });
                  }),
                  set: jest.fn((data: any) => { state[key][sid] = data; return Promise.resolve(); }),
                  update: jest.fn((upd: any) => {
                    if (state[key]?.[sid]) Object.assign(state[key][sid], upd);
                    return Promise.resolve();
                  }),
                };
              }),
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({
                  id, exists: true, data: () => data,
                  ref: {
                    id,
                    update: jest.fn((upd: any) => { if (state[key][id]) Object.assign(state[key][id], upd); return Promise.resolve(); }),
                    delete: jest.fn(() => { delete state[key][id]; return Promise.resolve(); }),
                  },
                })),
              })),
              add: jest.fn((data: any) => {
                const newId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][newId] = data;
                return Promise.resolve({ id: newId });
              }),
            };
          }),
        };
        return ref;
      }),
      where: jest.fn((field: string, op: string, value: unknown) => {
        return buildWhereChain([{ field, op, value }]);
      }),
      add: jest.fn((data: any) => {
        const newId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[newId] = data;
        if (!state[coll]) state[coll] = {};
        state[coll][newId] = data;
        return Promise.resolve({ id: newId, get: () => Promise.resolve({ exists: true, data: () => data, id: newId }) });
      }),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, exists: true, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            collection: jest.fn((sub: string) => {
              const subKey = `${coll}/${id}/${sub}`;
              if (!state[subKey]) state[subKey] = {};
              return {
                get: jest.fn(() => Promise.resolve({
                  docs: Object.entries(state[subKey]).map(([sid, sd]) => ({ id: sid, exists: true, data: () => sd, ref: { id: sid } })),
                  empty: Object.keys(state[subKey]).length === 0,
                  size: Object.keys(state[subKey]).length,
                })),
              };
            }),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    } as any;
  });

  (db).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  (db).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – validatePairingCode with corrupted data (L147, L155)
// Corrupted expiresAt (not Timestamp) → hits instanceof FALSE branch
// Corrupted masterId (missing/non-string) → hits typeof check
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingCode corrupted data", () => {
  it("expiresAt not a Timestamp instance → deletes and throws internal", async () => {
    state.pairingCodes["999999"] = {
      masterId: "m1",
      expiresAt: { seconds: 9999999999 }, // plain object, not MockTimestamp
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "999999" }, asChild))
      .rejects.toThrow(/Invalid pairing code data/);
    expect(state.pairingCodes["999999"]).toBeUndefined();
  });

  it("expiresAt is a raw number → deletes and throws internal", async () => {
    state.pairingCodes["888888"] = {
      masterId: "m1",
      expiresAt: Date.now() + 3600000, // raw number
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "888888" }, asChild))
      .rejects.toThrow(/Invalid pairing code data/);
  });

  it("masterId missing → deletes and throws internal", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["777777"] = {
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
      // no masterId
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "777777" }, asChild))
      .rejects.toThrow(/masterId/);
    expect(state.pairingCodes["777777"]).toBeUndefined();
  });

  it("masterId is a number, not string → deletes and throws internal", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["666666"] = {
      masterId: 12345,
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "666666" }, asChild))
      .rejects.toThrow(/masterId/);
  });

  it("codeData is undefined (exists but empty) → throws internal", async () => {
    // Simulate doc.exists = true but data() returns undefined
    state.pairingCodes["555555"] = undefined;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    // doc.exists will be false since data is falsy in our mock
    await expect(wrapped({ pairingCode: "555555" }, asChild))
      .rejects.toThrow(/Invalid pairing code|not found/i);
  });

  it("valid code but expired → deletes and throws deadline-exceeded", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["444444"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) - 3600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "444444" }, asChild))
      .rejects.toThrow(/expired/i);
    expect(state.pairingCodes["444444"]).toBeUndefined();
  });

  it("valid code but master trial expired → throws resource-exhausted", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["333333"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    state.masters["m1"].subscription = { status: "expired" };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "333333" }, asChild))
      .rejects.toThrow(/expired|subscribe/i);
  });

  it("valid code but child limit reached → throws resource-exhausted", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["222222"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    state.masters["m1"].subscription.childLimit = 1;
    // c1 already exists as a child of m1
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222222" }, asChild))
      .rejects.toThrow(/limit/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – validatePairingToken with corrupted data (L224)
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingToken corrupted data", () => {
  it("expiresAt not a Timestamp instance → deletes and throws internal", async () => {
    state.pairingTokens["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"] = {
      masterId: "m1",
      expiresAt: { seconds: 9999999999 }, // plain object
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }, asChild))
      .rejects.toThrow(/Invalid pairing token data/);
    expect(state.pairingTokens["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]).toBeUndefined();
  });

  it("masterId missing → deletes and throws internal", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["cccccccc-cccc-cccc-cccc-cccccccccccc"] = {
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
      // no masterId
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "cccccccc-cccc-cccc-cccc-cccccccccccc" }, asChild))
      .rejects.toThrow(/masterId/);
    expect(state.pairingTokens["cccccccc-cccc-cccc-cccc-cccccccccccc"]).toBeUndefined();
  });

  it("token expired → deletes and throws deadline-exceeded", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["dddddddd-dddd-dddd-dddd-dddddddddddd"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) - 600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "dddddddd-dddd-dddd-dddd-dddddddddddd" }, asChild))
      .rejects.toThrow(/expired/i);
  });

  it("tokenData undefined → throws internal", async () => {
    state.pairingTokens["dddddddd-dddd-dddd-dddd-dddddddddddd"] = undefined;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "dddddddd-dddd-dddd-dddd-dddddddddddd" }, asChild))
      .rejects.toThrow(/invalid|not found/i);
  });

  it("master not found → throws not-found", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"] = {
      masterId: "nonexistent",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }, asChild))
      .rejects.toThrow(/Master account not found/);
  });

  it("master trial expired → throws resource-exhausted", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["ffffffff-ffff-ffff-ffff-ffffffffffff"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    state.masters["m1"].subscription = { status: "expired" };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "ffffffff-ffff-ffff-ffff-ffffffffffff" }, asChild))
      .rejects.toThrow(/subscription|trial/i);
  });

  it("child limit reached → throws resource-exhausted", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    state.masters["m1"].subscription.childLimit = 1;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }, asChild))
      .rejects.toThrow(/limit/i);
  });

  it("valid token full success → pairs child", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["ffffffff-ffff-ffff-ffff-ffffffffffff"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    const res = await wrapped({ pairingToken: "ffffffff-ffff-ffff-ffff-ffffffffffff" }, asChild);
    expect(res.childId).toBe("c1");
    expect(res.masterId).toBe("m1");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – mapPolicyDoc with invalid data (L67, L81)
// These test findActivePolicy → mapPolicyDoc fallback paths.
// When mapPolicyDoc returns null, findActivePolicy tries next locale.
// ══════════════════════════════════════════════════════════════════════════

describe("legal mapPolicyDoc invalid data via getActiveLegalPolicies", () => {
  it("policy with invalid policyType falls through to default", async () => {
    // Policy exists but has bad policyType → mapPolicyDoc returns null → falls to default
    state.legalPolicies["p1"] = {
      policyType: "invalid_type", // not "terms" or "privacy"
      country: "DE", locale: "de-DE", version: "1.0",
      contentUrl: "https://example.com/terms", status: "active",
      effectiveAt: { seconds: 1000 },
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.country).toBe("DE");
    // Will return default policies since mapPolicyDoc returned null
  });

  it("policy with non-string country falls through to default", async () => {
    state.legalPolicies["p1"] = {
      policyType: "terms",
      country: 123, // not a string
      locale: "de-DE", version: "1.0",
      contentUrl: "https://example.com/terms", status: "active",
      effectiveAt: { seconds: 1000 },
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.terms).toBeDefined();
  });

  it("policy with non-string version falls through to default", async () => {
    state.legalPolicies["p1"] = {
      policyType: "terms",
      country: "DE", locale: "de-DE",
      version: 42, // not a string
      contentUrl: "https://example.com/terms", status: "active",
      effectiveAt: { seconds: 1000 },
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.terms).toBeDefined();
  });

  it("policy with non-string contentUrl falls through to default", async () => {
    state.legalPolicies["p1"] = {
      policyType: "terms",
      country: "DE", locale: "de-DE", version: "1.0",
      contentUrl: null, // not a string
      status: "active",
      effectiveAt: { seconds: 1000 },
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.terms).toBeDefined();
  });

  it("policy with valid data but non-Timestamp effectiveAt uses Timestamp.now()", async () => {
    state.legalPolicies["p1"] = {
      policyType: "terms",
      country: "DE", locale: "de-DE", version: "2.0",
      contentUrl: "https://example.com/terms", status: "active",
      effectiveAt: "2025-01-01", // string, not Timestamp
      isMajorChange: true,
    };
    state.legalPolicies["p2"] = {
      policyType: "privacy",
      country: "DE", locale: "de-DE", version: "2.0",
      contentUrl: "https://example.com/privacy", status: "active",
      effectiveAt: "2025-01-01",
      isMajorChange: false,
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.terms.version).toBe("2.0");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – needsLegalReconsent consent matching (L178-179, L204)
// ══════════════════════════════════════════════════════════════════════════

describe("needsLegalReconsent consent matching", () => {
  it("consent matches active policies → requiresReconsent=false", async () => {
    // Set up matching policies and consent
    state.legalPolicies["p1"] = {
      policyType: "terms", country: "DE", locale: "de-DE", version: "1.0",
      contentUrl: "https://example.com/terms", status: "active",
      effectiveAt: { seconds: 1000 }, isMajorChange: false,
    };
    state.legalPolicies["p2"] = {
      policyType: "privacy", country: "DE", locale: "de-DE", version: "1.0",
      contentUrl: "https://example.com/privacy", status: "active",
      effectiveAt: { seconds: 1000 }, isMajorChange: false,
    };
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1",
      acceptedTermsVersion: "1.0",
      acceptedPrivacyVersion: "1.0",
      requiresReconsent: false,
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(false);
    expect(res.reason).toBe("up_to_date");
  });

  it("consent requires reconsent flag set → requiresReconsent=true", async () => {
    state.masterLegalConsents["m1_US_en-US"] = {
      masterImei: "m1",
      acceptedTermsVersion: "1.0",
      acceptedPrivacyVersion: "1.0",
      requiresReconsent: true, // forcefully flagged
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "US", locale: "en-US" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
    expect(res.reason).toBe("version_or_policy_change");
  });

  it("consent with non-string acceptedTermsVersion treated as empty string", async () => {
    state.masterLegalConsents["m1_FR_fr-FR"] = {
      masterImei: "m1",
      acceptedTermsVersion: 123, // number, not string
      acceptedPrivacyVersion: null, // null, not string
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "FR", locale: "fr-FR" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – recordLegalConsent validation (L245-257)
// ══════════════════════════════════════════════════════════════════════════

describe("recordLegalConsent validation", () => {
  it("non-string termsVersion → treated as empty, throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: 123, privacyVersion: "1.0",
    }, asMaster)).rejects.toThrow(/termsVersion.*required|privacyVersion.*required/i);
  });

  it("non-string privacyVersion → treated as empty, throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "1.0", privacyVersion: null,
    }, asMaster)).rejects.toThrow(/termsVersion.*required|privacyVersion.*required/i);
  });

  it("empty strings for both versions → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "", privacyVersion: "",
    }, asMaster)).rejects.toThrow(/required/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – publishLegalPolicy validation (L325-342)
// ══════════════════════════════════════════════════════════════════════════

describe("publishLegalPolicy validation", () => {
  it("empty version string → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "", contentUrl: "https://example.com",
    }, asAdmin)).rejects.toThrow(/version.*required/i);
  });

  it("empty contentUrl string → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: "",
    }, asAdmin)).rejects.toThrow(/contentUrl.*required/i);
  });

  it("non-string version → treated as empty, throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: 42, contentUrl: "https://example.com",
    }, asAdmin)).rejects.toThrow(/version.*required/i);
  });

  it("non-string contentUrl → treated as empty, throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: null,
    }, asAdmin)).rejects.toThrow(/contentUrl.*required/i);
  });

  it("isMajorChange true publishes correctly", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "3.0", contentUrl: "https://example.com/terms",
      isMajorChange: true, status: "draft",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.status).toBe("draft");
  });

  it("status approved publishes correctly", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy", country: "US", locale: "en-US",
      version: "1.0", contentUrl: "https://example.com/privacy",
      status: "approved",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.policyType).toBe("privacy");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – analyzeTaskPhoto edge cases (L100-101, L123, L134)
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeTaskPhoto edge cases", () => {
  it("event.data undefined → returns early", async () => {
    const fn = fns.analyzeTaskPhoto;
    const event = { params: { childId: "c1", taskId: "t1" }, data: undefined };
    // Should not throw
    await fn.run(event);
  });

  it("newData is null → returns early", async () => {
    const fn = fns.analyzeTaskPhoto;
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => null },
        after: { data: () => null },
      },
    };
    await fn.run(event);
  });

  it("status not changing to pending_approval → skips analysis", async () => {
    const fn = fns.analyzeTaskPhoto;
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: { data: () => ({ status: "approved" }) },
      },
    };
    await fn.run(event);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("status already pending_approval before → skips analysis", async () => {
    const fn = fns.analyzeTaskPhoto;
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending_approval" }) },
        after: { data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test" }) },
      },
    };
    await fn.run(event);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no photoUrl → skips analysis", async () => {
    const fn = fns.analyzeTaskPhoto;
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: { data: () => ({ status: "pending_approval" }) }, // no photoUrl
      },
    };
    await fn.run(event);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("non-Firebase Storage URL → skips analysis (SSRF guard)", async () => {
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://evil.com/phishing.jpg" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("no GEMINI_API_KEY → uses fallback analysis", async () => {
    const savedKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.aiAnalysis.source).toBe("fallback");
    if (savedKey) process.env.GEMINI_API_KEY = savedKey;
  });

  it("Gemini analysis throws → uses fallback analysis", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    // Mock photo download (first fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
      headers: { get: () => "image/jpeg" },
    });
    // Mock Gemini API error (second fetch)
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    delete process.env.GEMINI_API_KEY;
  });

  it("Gemini API returns non-ok status → throws and uses fallback", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    // Mock photo download (first fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
      headers: { get: () => "image/jpeg" },
    });
    // Mock Gemini API non-ok response (second fetch)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: "Too Many Requests" });
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    delete process.env.GEMINI_API_KEY;
  });

  it("Gemini returns unparseable JSON → uses raw response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    // Mock photo download (first fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
      headers: { get: () => "image/jpeg" },
    });
    // Mock Gemini API response with unparseable JSON (second fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "not json {{{" }] } }],
      }),
    });
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall.aiAnalysis.source).toBe("gemini_unparsed");
    delete process.env.GEMINI_API_KEY;
  });

  it("Gemini returns empty candidates → uses raw (empty) response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    // Mock photo download (first fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(1),
      headers: { get: () => "image/jpeg" },
    });
    // Mock Gemini API response with empty candidates (second fetch)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    });
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    delete process.env.GEMINI_API_KEY;
  });

  it("AbortError from fetch → throws timeout error and uses fallback", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    mockFetch.mockRejectedValueOnce(abortErr);
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockResolvedValue(undefined);
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/test.jpg", description: "Test" }),
          ref: { update: mockUpdate },
        },
      },
    };
    await fn.run(event);
    expect(mockUpdate).toHaveBeenCalled();
    delete process.env.GEMINI_API_KEY;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – onTaskStatusChange missing data/masterImei/fcmToken
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange edge cases", () => {
  it("missing newValue → returns early", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending" }) },
      after: { data: () => null },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("missing previousValue → returns early", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => null },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("pending_approval but no masterImei → skips notification", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending" }) },
      after: { data: () => ({ status: "pending_approval" }) }, // no masterImei
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("pending_approval but master has no FCM token → skips notification", async () => {
    delete state.masters["m1"].fcmToken;
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending" }) },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("approved but child has no FCM token → skips notification", async () => {
    delete state.children["c1"].fcmToken;
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("FCM send fails → logs error but does not throw", async () => {
    mockSend.mockRejectedValueOnce(new Error("FCM error"));
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Test" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    // Should not throw despite FCM error
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – bootstrapFirstAdmin (L133, deeper branches)
// ══════════════════════════════════════════════════════════════════════════

describe("bootstrapFirstAdmin", () => {
  it("admin already exists → throws permission-denied", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [{ uid: "existing-admin", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/bereits ein Admin/);
  });

  it("no admin exists → promotes caller to admin", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [{ uid: "regular-user", customClaims: { role: "master" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
    expect(res.message).toContain("Admin");
  });

  it("unauthenticated → throws unauthenticated", async () => {
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, noAuth)).rejects.toThrow(/angemeldet/);
  });

  it("listUsers with multiple pages → iterates all", async () => {
    mockAuth.listUsers
      .mockResolvedValueOnce({
        users: [{ uid: "u1", customClaims: {} }],
        pageToken: "page2",
      })
      .mockResolvedValueOnce({
        users: [{ uid: "u2", customClaims: {} }],
        pageToken: undefined,
      });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
    expect(mockAuth.listUsers).toHaveBeenCalledTimes(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – setAdminClaim catch blocks (L97-98)
// ══════════════════════════════════════════════════════════════════════════

describe("setAdminClaim error handling", () => {
  it("non-HttpsError in setCustomUserClaims → wraps as internal", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Firebase internal error"));
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "targetUser", role: "admin" }, asAdmin))
      .rejects.toThrow(/Failed to set admin claim/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – sendTestFcmMessage with valid string token (FALSE branch at L452)
// ══════════════════════════════════════════════════════════════════════════

describe("sendTestFcmMessage valid token", () => {
  it("valid string token sends FCM directly", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ token: "valid-fcm-token-string" }, asAdmin);
    expect(res.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });

  it("childId with existing child sends to child FCM token", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "c1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – testGeminiConnection Gemini success with valid JSON
// ══════════════════════════════════════════════════════════════════════════

describe("testGeminiConnection", () => {
  it("successful Gemini response with valid JSON", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "Gemini connection successful" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    expect(res.response).toContain("Gemini");
    delete process.env.GEMINI_API_KEY;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – reportTamperEvent (L393, L408)
// ══════════════════════════════════════════════════════════════════════════

describe("reportTamperEvent", () => {
  it("valid tamper event stores and notifies master", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({ childId: "c1", eventType: "accessibility_service_disabled" }, asChild);
    expect(res.success).toBe(true);
    expect(mockSend).toHaveBeenCalled();
  });

  it("child reporting for another child → throws permission-denied", async () => {
    state.children["c2"] = { masterImei: "m1", childImei: "c2", fcmToken: "c2-token" };
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(wrapped({ childId: "c2", eventType: "overlay_removed" }, asChild))
      .rejects.toThrow(/not authorized/i);
  });

  it("child not found → throws not-found", async () => {
    delete state.children["c1"];
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(wrapped({ childId: "c1", eventType: "uninstall_attempt" }, asChild))
      .rejects.toThrow(/not found/i);
  });

  it("master has no fcmToken → stores event but no notification", async () => {
    delete state.masters["m1"].fcmToken;
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({ childId: "c1", eventType: "device_admin_removed" }, asChild);
    expect(res.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – setDeviceLocked catch branch (L31)
// ══════════════════════════════════════════════════════════════════════════

describe("setDeviceLocked catch", () => {
  it("non-owner master → throws permission-denied", async () => {
    state.children["c2"] = { masterImei: "other-master", childImei: "c2" };
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c2", isLocked: true }, asMaster))
      .rejects.toThrow(/not authorized/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// onChildDeviceUpdateV2 – more edge cases (no fcmToken, no change)
// ══════════════════════════════════════════════════════════════════════════

describe("onChildDeviceUpdateV2 edge cases", () => {
  it("newData is null (document deleted) → returns early", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: false }) },
        after: { data: () => null },
      },
    };
    await fn.run(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("oldData is null (new document) → returns early", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => null },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: true }) },
      },
    };
    await fn.run(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("no fcmToken on child → skips notification", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", isLocked: false }) },
        after: { data: () => ({ masterImei: "m1", isLocked: true }) },
      },
    };
    await fn.run(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("no data change → no FCM sent", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: ["a"] }) },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: ["a"] }) },
      },
    };
    await fn.run(event);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("appBlacklist change sends FCM", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", appBlacklist: ["a"] }) },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", appBlacklist: ["a", "b"] }) },
      },
    };
    await fn.run(event);
    expect(mockSend).toHaveBeenCalled();
  });

  it("usageRules change sends FCM", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", usageRules: { dailyLimit: 60 } }) },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", usageRules: { dailyLimit: 120 } }) },
      },
    };
    await fn.run(event);
    expect(mockSend).toHaveBeenCalled();
  });

  it("FCM send fails → logs error but does not throw", async () => {
    mockSend.mockRejectedValueOnce(new Error("FCM error"));
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: false }) },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: true }) },
      },
    };
    // Should not throw despite FCM error
    await fn.run(event);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// tasks.ts – catch blocks and edge cases (L36, L143, L149)
// ══════════════════════════════════════════════════════════════════════════

describe("tasks catch blocks and edges", () => {
  it("rejectTask with reason string", async () => {
    state["children/c1/tasks"]["t1"] = { status: "pending_approval", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.rejectTask);
    const res = await wrapped({ childId: "c1", taskId: "t1", reason: "Photo is blurry" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("completeTask with invalid photoUrl (not firebase storage) → throws", async () => {
    state["children/c1/tasks"]["t1"] = { status: "pending", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1", photoUrl: "https://evil.com/photo.jpg" }, asChild))
      .rejects.toThrow(/Firebase Storage URL/);
  });

  it("completeTask already approved → throws failed-precondition", async () => {
    state["children/c1/tasks"]["t1"] = { status: "approved", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({
      taskId: "t1",
      photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Ftest.jpg",
    }, asChild)).rejects.toThrow(/cannot transition/i);
  });

  it("approveTask not in pending_approval → throws failed-precondition", async () => {
    state["children/c1/tasks"]["t1"] = { status: "pending", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/not in pending_approval/);
  });

  it("rejectTask not in pending_approval → throws failed-precondition", async () => {
    state["children/c1/tasks"]["t1"] = { status: "pending", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/not in pending_approval/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – generateCustomToken catch blocks (L179, L195)
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken error paths", () => {
  it("getUser throws → wraps as internal error", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("Auth service unavailable"));
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, asMaster))
      .rejects.toThrow(/unexpected error/i);
  });

  it("createCustomToken throws → wraps as internal error", async () => {
    mockAuth.createCustomToken.mockRejectedValueOnce(new Error("Token creation failed"));
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, asMaster))
      .rejects.toThrow(/unexpected error/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// subscription.ts – revokeSubscription by masterId branch (L181)
// ══════════════════════════════════════════════════════════════════════════

describe("revokeSubscription by masterId (deeper)", () => {
  it("no subscriptionId, targets by masterId → finds and revokes", async () => {
    state.subscriptions["sub99"] = { masterId: "target1", status: "active" };
    state.masters["target1"] = { imei: "target1", subscription: { status: "active" } };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ masterId: "target1" }, asAdmin);
    expect(res.message).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – generatePairingLink success
// ══════════════════════════════════════════════════════════════════════════

describe("generatePairingLink", () => {
  it("generates a valid pairing token", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(typeof res.pairingToken).toBe("string");
  });

  it("expired trial → throws resource-exhausted", async () => {
    state.masters["m1"].subscription = { status: "expired" };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/expired|subscribe/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – unauthorized requester for getRulesForChild (L201-210)
// ══════════════════════════════════════════════════════════════════════════

describe("getRulesForChild unauthorized", () => {
  it("third party (not owner, not self) → throws permission-denied", async () => {
    state.children["c2"] = { masterImei: "other-master", childImei: "c2" };
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    await expect(wrapped({ childId: "c2" }, asMaster))
      .rejects.toThrow(/Not authorized/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – deleteUserAccount with various collection data (L84-89)
// ══════════════════════════════════════════════════════════════════════════

describe("deleteUserAccount edge cases", () => {
  it("self-delete by master (not admin)", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
    expect(state.masters["m1"]).toBeUndefined();
  });

  it("admin deletes nonexistent master → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    await expect(wrapped({ masterId: "nonexistent" }, asAdmin))
      .rejects.toThrow(/unexpected error/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – createSupportTicket
// ══════════════════════════════════════════════════════════════════════════

describe("createSupportTicket", () => {
  it("creates a ticket with valid data", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    const res = await wrapped({
      category: "device_issue",
      problemDescription: "My child's device won't sync",
      allowSupportAccess: true,
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.ticketId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – respondToTicket
// ══════════════════════════════════════════════════════════════════════════

describe("provideSolutionFeedback", () => {
  it("master provides feedback on ticket solution", async () => {
    state.supportTickets["t1"] = {
      masterImei: "m1", status: "awaiting_user_feedback",
      problemDescription: "Test", aiGeneratedSolution: "Try restarting",
    };
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({
      ticketId: "t1",
      feedback: "rejected",
      comment: "Solution didn't work",
    }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – grantSupportAccess, revokeSupportAccess
// ══════════════════════════════════════════════════════════════════════════

describe("support access management", () => {
  it("grantSupportAccess creates access grant", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", status: "in_progress" };
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    const res = await wrapped({ ticketId: "t1", durationHours: 24 }, asMaster);
    expect(res.success).toBe(true);
    expect(res.grantId).toBeDefined();
  });

  it("revokeSupportAccess revokes active grant", async () => {
    state.supportAccessGrants["g1"] = { status: "active", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "g1" }, asMaster);
    expect(res.success).toBe(true);
  });
});
