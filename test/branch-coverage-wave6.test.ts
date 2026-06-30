/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch‐coverage wave 6 – deep code-path targeting for remaining uncovered branches.
 * Focus: exercise internal helper functions, catch blocks, and deep logic branches
 * that prior waves missed (mostly optional chaining, try/catch, conditional logic).
 *
 * Targets:
 *   subscription.ts  → verifyPurchase SUCCESS, getChildLimit, getSubscriptionDurationMs,
 *                       checkExpiredSubscriptions, getSubscriptionStatus instanceof
 *   admin.ts         → performAnalysis KB+fetch, adminHealthCheck errors,
 *                       executeAutoFix deep, sendTestFcmMessage numeric token
 *   device.ts        → getRulesForChild owner+self, setDeviceLocked catch, updateAppBlacklist success
 *   auth.ts          → registerMasterDevice catch, logLegacyAuthUsage catch, generateCustomToken refresh catch
 *   tasks.ts         → completeTask catch, approveTask catch
 *   pairing.ts       → validatePairingCode full success, createPairingCode collision
 *   triggers.ts      → onTaskStatusChange deeper branches, analyzeTaskPhoto ref.update failure
 *   legal.ts         → findActivePolicy fallback locale, mapPolicyDoc invalid data
 *   shared.ts        → hasActiveAccess trial edge, context.app present
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

// ── State‐backed Firestore mock ───────────────────────────────────────────

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

const mockPlayGet = jest.fn();
jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({
      purchases: { subscriptions: { get: mockPlayGet } },
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

// Context with app property (for validateAppCheck branches)
const asAdminWithApp = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test-app" } };
const asMasterWithApp = { auth: { uid: "m1", token: {} }, app: { appId: "test-app" } };
const asChildWithApp = { auth: { uid: "c1", token: {} }, app: { appId: "test-app" } };

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
  mockPlayGet.mockReset();
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
// subscription.ts – verifyPurchase SUCCESS path (hits getChildLimit, getSubscriptionDurationMs)
// ══════════════════════════════════════════════════════════════════════════

describe("verifyPurchase success paths", () => {
  it("single_child_monthly purchase succeeds and activates subscription", async () => {
    mockPlayGet.mockResolvedValueOnce({ data: { purchaseState: 0, expiryTimeMillis: Date.now() + 86400000 } });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped({ purchaseToken: "valid-token", sku: "single_child_monthly" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.subscriptionStatus).toBe("active");
  });

  it("family_monthly purchase succeeds (higher child limit)", async () => {
    mockPlayGet.mockResolvedValueOnce({ data: { purchaseState: 0, expiryTimeMillis: Date.now() + 86400000 } });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped({ purchaseToken: "valid-token", sku: "family_monthly" }, asMaster);
    expect(res.success).toBe(true);
    expect(state.masters["m1"].subscription.childLimit).toBe(4);
    expect(state.masters["m1"].subscription.parentAppLimit).toBe(2);
  });

  it("single_child_yearly purchase succeeds (yearly duration)", async () => {
    mockPlayGet.mockResolvedValueOnce({ data: { purchaseState: 0, expiryTimeMillis: Date.now() + 86400000 } });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped({ purchaseToken: "valid-token", sku: "single_child_yearly" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("family_yearly purchase succeeds", async () => {
    mockPlayGet.mockResolvedValueOnce({ data: { purchaseState: 0, expiryTimeMillis: Date.now() + 86400000 } });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped({ purchaseToken: "valid-token", sku: "family_yearly" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("purchase with context.app passes AppCheck", async () => {
    mockPlayGet.mockResolvedValueOnce({ data: { purchaseState: 0, expiryTimeMillis: Date.now() + 86400000 } });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped({ purchaseToken: "valid-token", sku: "single_child_monthly" }, asMasterWithApp);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// subscription.ts – getSubscriptionStatus instanceof branch
// ══════════════════════════════════════════════════════════════════════════

describe("getSubscriptionStatus instanceof branches", () => {
  it("trial with numeric trialEndsAt (not Timestamp instanceof)", async () => {
    // Use raw number instead of MockTimestamp to hit the false instanceof branch
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: Date.now() + 3 * 86400000, // raw number, not Timestamp
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.subscriptionStatus.status).toBe("trial");
    expect(res.trialDaysRemaining).toBeGreaterThan(0);
  });

  it("trial with object trialEndsAt that has toMillis", async () => {
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: { toMillis: () => Date.now() + 86400000, seconds: Math.floor(Date.now() / 1000) + 86400 },
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.subscriptionStatus.status).toBe("trial");
  });

  it("returns default app limits for current subscription model", async () => {
    state.masters["m1"].subscription = {
      status: "active",
      type: "family_monthly",
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.parentAppLimit).toBe(2);
    expect(res.childLimit).toBe(4);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// subscription.ts – checkExpiredSubscriptions (scheduled)
// ══════════════════════════════════════════════════════════════════════════

describe("checkExpiredSubscriptions", () => {
  it("expires active subscriptions past expiresAt", async () => {
    const admin = require("firebase-admin");
    state.masters["expired1"] = {
      imei: "expired1", uid: "expired1",
      subscription: { status: "active", expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) - 86400, 0) },
    };
    const wrapped = testEnv.wrap(fns.checkExpiredSubscriptions);
    const res = await wrapped({});
    expect(res).toBeNull();
  });

  it("expires trial subscriptions past trialEndsAt", async () => {
    const admin = require("firebase-admin");
    state.masters["trial1"] = {
      imei: "trial1", uid: "trial1",
      subscription: { status: "trial", trialEndsAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) - 86400, 0) },
    };
    const wrapped = testEnv.wrap(fns.checkExpiredSubscriptions);
    const res = await wrapped({});
    expect(res).toBeNull();
  });

  it("no expired subscriptions skips batch commit", async () => {
    const wrapped = testEnv.wrap(fns.checkExpiredSubscriptions);
    const res = await wrapped({});
    expect(res).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – analyzeSystemErrors with KB doc and varied fetch responses
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeSystemErrors performAnalysis deep branches", () => {
  it("uses KB from operatorConfig when available", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.operatorConfig["knowledgeBase"] = { content: "Custom KB content for testing" };
    state.error_logs["e1"] = { functionName: "createTask", message: "timeout", stack: "Error: timeout", timestamp: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ errorIndex: 0, severity: "high", category: "network", diagnosis: "Timeout", solution: "Retry", autoFixable: false, autoFixAction: null, autoFixDescription: null }]) }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ errorId: "e1" }, asAdmin);
    expect(res.analyses).toBeDefined();
    expect(res.analyses.length).toBeGreaterThan(0);
    delete process.env.GEMINI_API_KEY;
  });

  it("handles non-ok Gemini response in performAnalysis", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.error_logs["e1"] = { functionName: "test", message: "err", stack: "stack", timestamp: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({ errorId: "e1" }, asAdmin)).rejects.toThrow(/fehlgeschlagen/);
    delete process.env.GEMINI_API_KEY;
  });

  it("handles JSON parse failure in performAnalysis (non-array response)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.error_logs["e1"] = { functionName: "test", message: "err", stack: "stack", timestamp: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "not valid json {{{" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ errorId: "e1" }, asAdmin);
    // Should use fallback parse — single analysis with diagnosis from raw text
    expect(res.analyses).toBeDefined();
    delete process.env.GEMINI_API_KEY;
  });

  it("handles fetch timeout/abort in performAnalysis", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.error_logs["e1"] = { functionName: "test", message: "err", stack: "stack", timestamp: Date.now() };
    mockFetch.mockRejectedValueOnce(new Error("The operation was aborted"));
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({ errorId: "e1" }, asAdmin)).rejects.toThrow(/fehlgeschlagen/);
    delete process.env.GEMINI_API_KEY;
  });

  it("handles multiple errors with functionFilter", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.error_logs["e1"] = { functionName: "createTask", message: "timeout", stack: "Error", timestamp: Date.now() };
    state.error_logs["e2"] = { functionName: "verifyPurchase", message: "auth error", stack: "Error", timestamp: Date.now() };
    state.error_logs["e3"] = { functionName: "createTask", message: "timeout", stack: "Error", timestamp: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ errorIndex: 0, severity: "medium", category: "code", diagnosis: "Issue", solution: "Fix", autoFixable: false, autoFixAction: null, autoFixDescription: null }]) }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ functionFilter: "createTask" }, asAdmin);
    expect(res.analyses).toBeDefined();
    delete process.env.GEMINI_API_KEY;
  });

  it("handles Gemini response with non-array JSON (single object)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.error_logs["e1"] = { functionName: "test", message: "err", stack: "stack", timestamp: Date.now() };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ errorIndex: 0, severity: "low", category: "config", diagnosis: "Minor issue", solution: "Adjust config", autoFixable: true, autoFixAction: "cleanup_expired_grants", autoFixDescription: "Clean up" }) }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ errorId: "e1" }, asAdmin);
    expect(res.analyses).toBeDefined();
    // Should wrap single object in array
    expect(res.analyses.length).toBe(1);
    delete process.env.GEMINI_API_KEY;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – executeAutoFix deep (errorIndex valid, catch block)
// ══════════════════════════════════════════════════════════════════════════

describe("executeAutoFix deep branches", () => {
  it("applies fix and updates analysis doc when errorIndex matches", async () => {
    state.ai_error_analyses["a1"] = {
      analyses: [
        { errorIndex: 0, autoFixable: true, autoFixAction: "clear_error_logs", severity: "medium" },
        { errorIndex: 1, autoFixable: false, severity: "low" },
      ],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a1", errorIndex: 0, action: "clear_error_logs" }, asAdmin);
    expect(res.success).toBe(true);
    // The analysis doc should be updated
    const analysis = state.ai_error_analyses["a1"];
    expect(analysis.status).toBe("applied");
  });

  it("applies fix with errorIndex beyond analyses array (no crash)", async () => {
    state.ai_error_analyses["a1"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a1", errorIndex: 5, action: "regenerate_error_report" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("passes AppCheck with context.app", async () => {
    state.ai_error_analyses["a1"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a1", errorIndex: 0, action: "clear_error_logs" }, asAdminWithApp);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – sendTestFcmMessage edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("sendTestFcmMessage edge cases", () => {
  it("numeric token (not string) throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    await expect(wrapped({ token: 12345 as any }, asAdmin)).rejects.toThrow(/token oder childId/);
  });

  it("child not found returns error", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "nonexistent" }, asAdmin);
    // childDoc.data()?.fcmToken will be undefined → returns false
    expect(res.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – getRulesForChild (owner and self-child paths)
// ══════════════════════════════════════════════════════════════════════════

describe("getRulesForChild owner and self paths", () => {
  it("owner master can read rules", async () => {
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c1" }, asMaster);
    expect(res.isLocked).toBe(false);
    expect(res.appBlacklist).toEqual(["com.blocked"]);
    expect(res.usageRules).toEqual({ dailyLimit: 120 });
  });

  it("child itself can read its own rules", async () => {
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c1" }, asChild);
    expect(res.isLocked).toBeDefined();
  });

  it("child not found throws not-found", async () => {
    delete state.children["c1"];
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/not found/i);
  });

  it("missing childId throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/childId/);
  });

  it("child with minimal data returns defaults", async () => {
    state.children["c2"] = { masterImei: "m1", childImei: "c2" }; // no isLocked, appBlacklist, usageRules
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c2" }, asMaster);
    expect(res.isLocked).toBe(false);
    expect(res.appBlacklist).toEqual([]);
    expect(res.usageRules).toEqual({});
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – updateAppBlacklist & setUsageRules SUCCESS paths
// ══════════════════════════════════════════════════════════════════════════

describe("device success paths", () => {
  it("updateAppBlacklist succeeds for authorized master", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: ["com.app1", "com.app2"] }, asMaster);
    expect(res.success).toBe(true);
  });

  it("setUsageRules succeeds for authorized master", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({ childId: "c1", usageRules: { dailyLimit: 60, bedtimeStart: "21:00", bedtimeEnd: "07:00" } }, asMaster);
    expect(res.success).toBe(true);
  });

  it("updateAppBlacklist with empty blacklist", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: [] }, asMaster);
    expect(res.success).toBe(true);
  });

  it("setUsageRules with only scheduledDowntime", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const res = await wrapped({ childId: "c1", usageRules: { scheduledDowntime: [] } }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – generateCustomToken with lastTokenRefresh update
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken deep branches", () => {
  it("updates lastTokenRefresh on success (authenticated path)", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, asMaster);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("legacy path with valid secretKey updates lastTokenRefresh", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({ masterImei: "m1", secretKey: "secret123" }, noAuth);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("master not found for legacy auth throws unauthenticated", async () => {
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "m1", secretKey: "secret123" }, noAuth)).rejects.toThrow(/Invalid master IMEI/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – registerMasterDevice deep branches
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice deep branches", () => {
  it("existing master returns existing data", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
  });

  it("new master with getUser fallback to createUser", async () => {
    delete state.masters["m1"];
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBe("mock-custom-token");
    expect(state.masters["m1"].subscription.status).toBe("trial_pending");
    expect(state.masters["m1"].subscription.trialStartedAt).toBeUndefined();
    expect(state.masters["m1"].subscription.trialEndsAt).toBeUndefined();
  });

  it("unauthenticated new registration", async () => {
    delete state.masters["newDevice"];
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "newDevice" }, noAuth);
    expect(res.masterId).toBe("newDevice");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// tasks.ts – completeTask and approveTask SUCCESS paths
// ══════════════════════════════════════════════════════════════════════════

describe("tasks success paths", () => {
  it("completeTask succeeds for pending task", async () => {
    state["children/c1/tasks"]["t1"] = { status: "pending", description: "Test task", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.completeTask);
    const res = await wrapped({
      taskId: "t1",
      photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Fphoto.jpg",
    }, asChild);
    expect(res.success).toBe(true);
  });

  it("approveTask succeeds for pending_approval task", async () => {
    state["children/c1/tasks"]["t1"] = {
      status: "pending_approval", description: "Test task", masterImei: "m1",
      photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/photo.jpg",
    };
    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ childId: "c1", taskId: "t1" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("rejectTask succeeds for pending_approval task", async () => {
    state["children/c1/tasks"]["t1"] = {
      status: "pending_approval", description: "Test task", masterImei: "m1",
    };
    const wrapped = testEnv.wrap(fns.rejectTask);
    const res = await wrapped({ childId: "c1", taskId: "t1" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("createTask succeeds with active subscription", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Clean your room",
      deadlineISO: new Date(Date.now() + 86400000).toISOString(),
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.taskId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – validatePairingCode full success flow
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingCode full success", () => {
  it("valid pairing code creates child device", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["123456"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "123456" }, asChild);
    expect(res.childId).toBeDefined();
  });

  it("starts pending trial when first child is paired", async () => {
    const admin = require("firebase-admin");
    delete state.children["c1"];
    state.masters["m1"].subscription = {
      status: "trial_pending",
      childLimit: 4,
      parentAppLimit: 2,
    };
    state.pairingCodes["123457"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "123457" }, asChild);
    expect(res.childId).toBeDefined();
    expect(state.masters["m1"].subscription.status).toBe("trial");
    expect(state.masters["m1"].subscription.trialStartedAt).toBeDefined();
    expect(state.masters["m1"].subscription.trialEndsAt).toBeDefined();
  });

  it("valid code with higher child limit succeeds", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["654321"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    state.masters["m1"].subscription.childLimit = 10;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "654321" }, asChild);
    expect(res.childId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – createPairingCode
// ══════════════════════════════════════════════════════════════════════════

describe("createPairingCode", () => {
  it("generates a 6-digit pairing code", async () => {
    const wrapped = testEnv.wrap(fns.createPairingCode);
    const res = await wrapped({}, asMaster);
    expect(res.pairingCode).toBeDefined();
    expect(typeof res.pairingCode).toBe("string");
    expect(res.pairingCode.length).toBe(6);
  });
});

describe("generatePairingLink", () => {
  it("returns a shareable link and QR payload", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(res.pairingLink).toMatch(/^https:\/\/minimaster\.app\/pair\?token=/);
    expect(res.qrCodeValue).toBe(res.pairingLink);
    expect(res.shareMethod).toBe("link_or_qr");
    expect(res.distribution.parentAppLimit).toBe(2);
    expect(res.distribution.childAppLimit).toBe(4);
  });

  it("allows link generation while trial is pending", async () => {
    state.masters["m1"].subscription = {
      status: "trial_pending",
      childLimit: 4,
      parentAppLimit: 2,
    };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(res.pairingLink).toMatch(/^https:\/\/minimaster\.app\/pair\?token=/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – onTaskStatusChange deeper branches
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange deeper branches", () => {
  it("status unchanged does nothing", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1", description: "Test" }) },
      after: { data: () => ({ status: "pending", masterImei: "m1", description: "Test" }) },
    };
    const context = { params: { childId: "c1", taskId: "t1" } };
    await fn.run(change, context);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("pending_approval to approved sends to child", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Task A" }) },
      after: { data: () => ({ status: "approved", masterImei: "m1", description: "Task A" }) },
    };
    const context = { params: { childId: "c1", taskId: "t1" } };
    await fn.run(change, context);
    expect(mockSend).toHaveBeenCalled();
    const call = mockSend.mock.calls[0][0];
    expect(call.token).toBe("child-fcm-token");
  });

  it("pending_approval to rejected sends to child", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Task B" }) },
      after: { data: () => ({ status: "rejected", masterImei: "m1", description: "Task B" }) },
    };
    const context = { params: { childId: "c1", taskId: "t1" } };
    await fn.run(change, context);
    expect(mockSend).toHaveBeenCalled();
  });

  it("pending to pending_approval sends to master", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1", description: "Review me" }) },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Review me" }) },
    };
    const context = { params: { childId: "c1", taskId: "t1" } };
    await fn.run(change, context);
    expect(mockSend).toHaveBeenCalled();
    const call = mockSend.mock.calls[0][0];
    expect(call.token).toBe("master-fcm-token");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – analyzeTaskPhoto ref.update failure
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeTaskPhoto update failure", () => {
  it("catches ref.update error and continues", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ labels: ["room"], taskCompletion: "completed", confidence: 0.9, summary: "Clean" }) }] } }],
      }),
    });
    const fn = fns.analyzeTaskPhoto;
    const mockUpdate = jest.fn().mockRejectedValueOnce(new Error("Update failed"));
    const event = {
      params: { childId: "c1", taskId: "t1" },
      data: {
        before: { data: () => ({ status: "pending" }) },
        after: {
          data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/photo.jpg", description: "Clean room" }),
          ref: { update: mockUpdate },
        },
      },
    };
    // Should not throw despite update failure — falls to fallback
    await fn.run(event);
    delete process.env.GEMINI_API_KEY;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – findActivePolicy fallback locale, needsLegalReconsent edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("legal deep branches", () => {
  it("getActiveLegalPolicies with country-only fallback", async () => {
    // Policy exists for DE but locale de (not de-DE) — tests locale fallback chain
    state.legalPolicies["p1"] = {
      policyType: "terms", country: "DE", locale: "de", version: "3.0",
      contentUrl: "https://example.com/terms", status: "active", isMajorChange: false,
      effectiveAt: { seconds: 1000, nanoseconds: 0 },
    };
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de" }, asMaster);
    expect(res.country).toBe("DE");
  });

  it("needsLegalReconsent with undefined consent values", async () => {
    state.masterLegalConsents["m1_US_en-US"] = {
      masterImei: "m1",
      // no acceptedTermsVersion or acceptedPrivacyVersion at all
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "US", locale: "en-US" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });

  it("recordLegalConsent with custom consentSource and appVersion", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
      consentSource: "web_panel", appVersion: "3.0.0",
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("publishLegalPolicy with string effectiveAt triggers Timestamp conversion", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms", country: "US", locale: "en-US",
      version: "5.0", contentUrl: "https://example.com/terms",
      effectiveAt: "2026-01-01T00:00:00Z", // string, not Timestamp
      isMajorChange: false,
    }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("publishLegalPolicy with null effectiveAt defaults to now", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy", country: "AT", locale: "de-AT",
      version: "1.0", contentUrl: "https://example.com/privacy",
      // no effectiveAt
    }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("markLegalReconsentRequired with single master", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", requiresReconsent: false };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "m1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("single_master");
    expect(res.updatedCount).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// shared.ts – hasActiveAccess with context.app, various subscription states
// ══════════════════════════════════════════════════════════════════════════

describe("shared hasActiveAccess via various functions", () => {
  it("createTask with active trial succeeds", async () => {
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: Date.now() + 86400000 * 3, // 3 days future
    };
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Trial task",
      deadlineISO: new Date(Date.now() + 86400000).toISOString(),
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("pairing with context.app works", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["111111"] = {
      masterId: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "111111" }, asChildWithApp);
    expect(res.childId).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – onTicketCreated trigger
// ══════════════════════════════════════════════════════════════════════════

describe("onTicketCreated trigger", () => {
  it("processes new ticket and generates AI solution", async () => {
    const fn = fns.onTicketCreated;
    state.supportTickets["t1"] = {
      masterImei: "m1",
      category: "device_issue",
      problemDescription: "Child device not syncing",
      status: "open",
    };
    const snapshot = {
      id: "t1",
      data: () => ({
        masterImei: "m1",
        category: "device_issue",
        problemDescription: "Child device not syncing",
        status: "open",
      }),
      ref: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const context = { params: { ticketId: "t1" } };
    await fn.run(snapshot, context);
    // Function uses admin.firestore().collection("supportTickets").doc(ticketId).update()
    // So check state was modified
    const ticket = state.supportTickets["t1"];
    expect(ticket).toBeDefined();
    expect(ticket.aiSolutionStatus).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – reportDailyUsage & recordHeartbeat success
// ══════════════════════════════════════════════════════════════════════════

describe("device reporting success paths", () => {
  it("reportDailyUsage with all fields", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    const res = await wrapped({ date: "2025-06-15", usageMillis: 7200000, appUsage: { "com.app1": 3600000 } }, asChild);
    expect(res.success).toBe(true);
  });

  it("recordHeartbeat updates lastSeen", async () => {
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    const res = await wrapped({}, asChild);
    expect(res.success).toBe(true);
  });

  it("registerFcmToken success", async () => {
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    const res = await wrapped({ token: "new-fcm-token-123" }, asChild);
    expect(res.success).toBe(true);
  });

  it("updateFCMToken for master", async () => {
    const wrapped = testEnv.wrap(fns.updateFCMToken);
    const res = await wrapped({ fcmToken: "updated-master-token" }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – getTicketUserData with valid grant
// ══════════════════════════════════════════════════════════════════════════

describe("getTicketUserData valid grant", () => {
  it("returns user data with valid active grant", async () => {
    const admin = require("firebase-admin");
    state.supportTickets["t1"] = { masterImei: "m1", accessGrantId: "g1", status: "in_progress" };
    state.supportAccessGrants["g1"] = {
      status: "active", masterImei: "m1",
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0),
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    const res = await wrapped({ ticketId: "t1" }, asAdmin);
    expect(res.master).toBeDefined();
    expect(res.children).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – aiExplainProblem success path
// ══════════════════════════════════════════════════════════════════════════

describe("aiExplainProblem success", () => {
  it("returns AI explanation for valid problem", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    const res = await wrapped({
      problemContext: "Firebase connection timeout errors during peak hours",
      consentGiven: true,
    }, asAdmin);
    expect(res.explanation).toBeDefined();
    expect(res.provider).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – exportUserData with full data
// ══════════════════════════════════════════════════════════════════════════

describe("exportUserData full data", () => {
  it("exports master data with children, tasks, tickets, grants, consents, audit logs", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", status: "open" };
    state.supportAccessGrants["g1"] = { masterImei: "m1", status: "active" };
    state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", country: "DE", locale: "de-DE" };
    state.audit_logs["a1"] = { userId: "m1", action: "device.register", timestamp: Date.now() };
    state["children/c1/tasks"]["task1"] = { description: "Test", status: "pending" };
    const wrapped = testEnv.wrap(fns.exportUserData);
    const res = await wrapped({ masterId: "m1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.data.masterId).toBe("m1");
    expect(res.data.masterProfile).toBeDefined();
    // DSAR must not disclose reusable auth secrets (regression: credential leak).
    expect(res.data.masterProfile.secretKey).toBeUndefined();
    expect(res.data.masterProfile.fcmToken).toBeUndefined();
    expect(res.data.masterProfile.imei).toBe("m1"); // non-secret PII preserved
    expect(res.data.children[0].fcmToken).toBeUndefined();
    expect(res.data.children[0].masterImei).toBe("m1"); // child PII preserved
  });

  it("exportUserData with context.app passes AppCheck", async () => {
    const wrapped = testEnv.wrap(fns.exportUserData);
    const res = await wrapped({ masterId: "m1" }, asAdminWithApp);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – sendDailyErrorReport with errors
// ══════════════════════════════════════════════════════════════════════════

describe("sendDailyErrorReport with data", () => {
  it("generates report when errors exist", async () => {
    state.error_logs["e1"] = { functionName: "createTask", message: "timeout", timestamp: { seconds: Math.floor(Date.now() / 1000) - 3600 } };
    state.error_logs["e2"] = { functionName: "createTask", message: "timeout", timestamp: { seconds: Math.floor(Date.now() / 1000) - 7200 } };
    state.error_logs["e3"] = { functionName: "verifyPurchase", message: "auth error", timestamp: { seconds: Math.floor(Date.now() / 1000) - 3600 } };
    const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
    const res = await wrapped({});
    expect(res).toBeNull();
  });

  it("empty error logs returns null early", async () => {
    const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
    const res = await wrapped({});
    expect(res).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – deleteUserAccount with children cleanup
// ══════════════════════════════════════════════════════════════════════════

describe("deleteUserAccount full cleanup", () => {
  it("admin deletes master with children and tasks", async () => {
    state.masters["target"] = { imei: "target", uid: "target" };
    state.children["tc1"] = { masterImei: "target", childImei: "tc1" };
    state["children/tc1/tasks"] = { "t1": { description: "Task", status: "pending" } };
    state.subscriptions["ts1"] = { masterId: "target" };
    state.masterLegalConsents["target_DE_de-DE"] = { masterImei: "target" };
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({ masterId: "target" }, asAdmin);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – onChildDeviceUpdateV2 with isLocked change
// ══════════════════════════════════════════════════════════════════════════

describe("onChildDeviceUpdateV2 isLocked change", () => {
  it("isLocked change from false to true sends FCM", async () => {
    const fn = fns.onChildDeviceUpdateV2;
    const event = {
      params: { childId: "c1" },
      data: {
        before: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: false }) },
        after: { data: () => ({ masterImei: "m1", fcmToken: "child-fcm-token", isLocked: true }) },
      },
    };
    await fn.run(event);
    expect(mockSend).toHaveBeenCalled();
    const msg = mockSend.mock.calls[0][0];
    expect(msg.data.isLocked).toBe("true");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – adminHealthCheck happy path
// ══════════════════════════════════════════════════════════════════════════

describe("adminHealthCheck", () => {
  it("returns ok with all checks passing", async () => {
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdmin);
    expect(res.ok).toBe(true);
    expect(res.checks).toBeDefined();
    expect(res.prerequisites).toBeDefined();
  });
});
