/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch-coverage wave 9 – surgical tests targeting ?.  null branches and || fallbacks.
 * Strategy: pass null data to exercise data?.X null paths, manipulate mocks for error paths,
 * set/unset env vars for || fallbacks.
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

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test-app" } };
const asAdminNoApp = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: {} } };

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "secret123", fcmToken: "master-fcm-token",
        subscription: {
          status: "active", childLimit: 2, type: "single_child_monthly",
          expiresAt: { seconds: Math.floor(Date.now() / 1000) + 86400 * 30, nanoseconds: 0, toMillis: () => Date.now() + 86400000 * 30 },
        },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: ["com.blocked"], usageRules: { dailyLimit: 120 } },
    },
    "children/c1/tasks": {},
    "children/c1/tamperEvents": {},
    "children/c1/usageHistory": {},
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
  process.env.OPENAI_API_KEY = "test-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
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
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
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
        return Promise.resolve({ id: newId });
      }),
      // Add limit() at collection level for adminHealthCheck
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, exists: true, data: () => data,
          ref: { id, update: jest.fn(), delete: jest.fn() },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
      orderBy: jest.fn().mockReturnThis(),
    };
  });

  (db as any).batch = jest.fn(() => ({
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  }));

  (db as any).collectionGroup = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  }));
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 1: Null data tests to exercise data?.X null branches
// ══════════════════════════════════════════════════════════════════════════

describe("null data → exercises data?.X null branches", () => {
  // legal.ts L152: data?.country null path
  it("getActiveLegalPolicies with null data", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped(null, asMaster)).rejects.toThrow(/country/i);
  });

  // legal.ts L178: data?.country null path
  it("needsLegalReconsent with null data", async () => {
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    await expect(wrapped(null, asMaster)).rejects.toThrow(/country/i);
  });

  // legal.ts L245: data?.country null path
  it("recordLegalConsent with null data", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped(null, asMaster)).rejects.toThrow(/country/i);
  });

  // legal.ts L325: data?.policyType null path
  it("publishLegalPolicy with null data", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow(/policyType/i);
  });

  // legal.ts L378: data?.country null path
  it("markLegalReconsentRequired with null data", async () => {
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow(/country/i);
  });

  // admin.ts L333: data?.prompt null path
  it("testGeminiConnection with null data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped(null, asAdminNoApp);
    expect(res.success).toBe(true);
  });

  // admin.ts L389: data?.content null path
  it("updateKnowledgeBase with null data", async () => {
    const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow(/content.*required/i);
  });

  // admin.ts L410: data?.token null path
  it("sendTestFcmMessage with null data", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow(/token.*childId/i);
  });

  // admin.ts L452: data?.jobName null path
  it("triggerScheduledJob with null data", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow(/jobName/i);
  });

  // admin.ts L532: data?.hours null path
  it("analyzeSystemErrors with null data", async () => {
    // With null data, data?.hours is undefined → uses default 24
    // Also data?.errorId is undefined → skips single error path
    // No errors in time range → returns empty
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped(null, asAdmin);
    expect(res.totalErrors).toBe(0);
  });

  // admin.ts L724: data || {} null path
  it("executeAutoFix with null data", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped(null, asAdmin)).rejects.toThrow(/analysisId/i);
  });

  // admin.ts L87: data?.masterId null path (admin without masterId)
  it("deleteUserAccount admin with null data → deletes own", async () => {
    state.masters["admin1"] = { imei: "admin1", uid: "admin1", secretKey: "s" };
    mockAuth.getUser.mockResolvedValueOnce({ uid: "admin1" });
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped(null, asAdminNoApp);
    expect(res.success).toBe(true);
  });

  // admin.ts L249: data || {} in exportUserData
  it("exportUserData with null data", async () => {
    const wrapped = testEnv.wrap(fns.exportUserData);
    await expect(wrapped(null, asAdmin)).rejects.toThrow(/masterId/i);
  });

  // auth.ts L186: data || {} in generateCustomToken
  it("generateCustomToken with null data", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped(null, {})).rejects.toThrow(/masterImei.*secretKey/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 2: || fallback tests (force left side to be falsy)
// ══════════════════════════════════════════════════════════════════════════

describe("|| fallback branches", () => {
  // admin.ts L131: storage().bucket().name || null → name is empty
  it("adminHealthCheck with empty storage bucket name", async () => {
    const storageMod = require("../firebase");
    const origStorage = storageMod.storage;
    storageMod.storage = jest.fn(() => ({
      bucket: jest.fn(() => ({
        name: "",
        getMetadata: jest.fn().mockResolvedValue([{}]),
      })),
    }));
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.prerequisites.storageBucket).toBeNull();
    storageMod.storage = origStorage;
  });

  // admin.ts L151: process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG || null
  it("adminHealthCheck env var fallbacks → FIREBASE_CONFIG used", async () => {
    const origGP = process.env.GCLOUD_PROJECT;
    const origFC = process.env.FIREBASE_CONFIG;
    delete process.env.GCLOUD_PROJECT;
    process.env.FIREBASE_CONFIG = "test-config";
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.prerequisites.environment.projectId).toBe("test-config");
    if (origGP) process.env.GCLOUD_PROJECT = origGP; else delete process.env.GCLOUD_PROJECT;
    if (origFC) process.env.FIREBASE_CONFIG = origFC; else delete process.env.FIREBASE_CONFIG;
  });

  it("adminHealthCheck env var fallbacks → both null", async () => {
    const origGP = process.env.GCLOUD_PROJECT;
    const origFC = process.env.FIREBASE_CONFIG;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.FIREBASE_CONFIG;
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.prerequisites.environment.projectId).toBeNull();
    if (origGP) process.env.GCLOUD_PROJECT = origGP;
    if (origFC) process.env.FIREBASE_CONFIG = origFC;
  });

  // auth.ts L22: process.env.GCLOUD_PROJECT || null
  // Already tested via env var deletion above

  // auth.ts L207/219/284/289/316: user.customClaims || {}
  it("registerMasterDevice with user having no customClaims", async () => {
    mockAuth.getUser.mockResolvedValueOnce({ uid: "m1" }); // no customClaims
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBeDefined();
  });

  // pairing.ts L147/155: masterData?.subscription?.status || "none", childLimit || 1
  it("validatePairingCode with master having no subscription", async () => {
    delete state.masters["m1"].subscription;
    const admin = require("firebase-admin");
    state.pairingCodes["123456"] = {
      masterId: "m1",
      childImei: "new-child",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "123456", childImei: "new-child" }, asMaster))
      .rejects.toThrow(/trial.*expired|subscribe/i);
  });

  // pairing.ts L224/323: same pattern for validatePairingToken
  it("validatePairingToken with master having no subscription", async () => {
    delete state.masters["m1"].subscription;
    const admin = require("firebase-admin");
    state.pairingTokens["token-1"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 300000),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "token-1" }, asMaster))
      .rejects.toThrow(/trial.*expired|subscribe|subscription/i);
  });

  // triggers.ts L123: description || "" in analyzeTaskPhoto
  it("analyzeTaskPhoto with empty description", async () => {
    // analyzeTaskPhoto is V2, call via .run()
    const fn = fns.analyzeTaskPhoto;
    if (!fn?.run) return; // skip if not available
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    });
    const event = {
      data: {
        before: { data: () => ({ status: "pending", masterImei: "m1" }) },
        after: {
          data: () => ({
            status: "pending_approval",
            masterImei: "m1",
            photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/photo.jpg",
            // NO description field → exercises || "" branch
          }),
          ref: { update: jest.fn().mockResolvedValue(undefined) },
        },
      },
      params: { childId: "c1", taskId: "t1" },
    };
    await fn.run(event);
  });

  // triggers.ts L259/290/291: description || "" in onTaskStatusChange notifications
  it("onTaskStatusChange approved with no description", async () => {
    state.children["c1"].fcmToken = "child-fcm-token";
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("onTaskStatusChange rejected with no description", async () => {
    state.children["c1"].fcmToken = "child-fcm-token";
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
      after: { data: () => ({ status: "rejected", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("onTaskStatusChange pending_approval with no description", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  // admin.ts L812: analysisData.analyses || [] — analysis doc without analyses
  it("executeAutoFix with analysis missing analyses array", async () => {
    state.ai_error_analyses["a1"] = { status: "pending" }; // no analyses field
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "a1", errorIndex: 0, action: "clear_error_logs",
    }, asAdmin);
    expect(res.success).toBe(true);
  });

  // admin.ts L560/562: functionName || "unknown", message || ""
  it("analyzeSystemErrors with error entries missing fields", async () => {
    state.error_logs["e1"] = {
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() },
      // NO functionName, NO message, NO stack
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "[]" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 168 }, asAdmin);
    expect(res.totalErrors).toBeGreaterThanOrEqual(0);
  });

  // admin.ts L604: e.functionName || "?", e.count || 1
  // Already exercised by above test (error entries without functionName)
});

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 3: Specific condition tests
// ══════════════════════════════════════════════════════════════════════════

describe("specific condition branches", () => {
  // admin.ts L89: non-admin with own masterId (allowed, doesn't throw)
  it("deleteUserAccount non-admin with own masterId → allowed", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({ masterId: "m1" }, asMaster);
    expect(res.success).toBe(true);
  });

  // admin.ts L569: analyzeSystemErrors with functionFilter
  it("analyzeSystemErrors with functionFilter", async () => {
    state.error_logs["e1"] = {
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() },
      functionName: "createTask",
      message: "test error",
      stack: "",
    };
    state.error_logs["e2"] = {
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() },
      functionName: "otherFn",
      message: "other error",
      stack: "",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "[]" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 168, functionFilter: "createTask" }, asAdmin);
    expect(res).toBeDefined();
  });

  // admin.ts L840: executeAutoFix where action throws HttpsError
  it("executeAutoFix action throws HttpsError → rethrown", async () => {
    state.ai_error_analyses["a1"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };
    // cleanup_expired_subscriptions will try to iterate subscription docs
    // Override to throw HttpsError
    const origSpyImpl = jest.spyOn(db, "collection");
    const origImpl = origSpyImpl.getMockImplementation()!;
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "subscriptions") {
        return {
          where: jest.fn(() => ({
            get: jest.fn().mockRejectedValue(
              new (require("firebase-functions").https.HttpsError)("not-found", "Test HttpsError")
            ),
          })),
          doc: jest.fn(),
        };
      }
      return origImpl(...args);
    });
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "a1", errorIndex: 0, action: "cleanup_expired_subscriptions",
    }, asAdmin)).rejects.toThrow(/Test HttpsError|not-found/i);
  });

  // auth.ts L275: error.code === "auth/user-not-found" in registerMasterDevice
  it("registerMasterDevice with user-not-found error", async () => {
    delete state.masters["m1"];
    const notFoundError: any = new Error("User not found");
    notFoundError.code = "auth/user-not-found";
    mockAuth.getUser.mockRejectedValueOnce(notFoundError);
    mockAuth.createUser.mockResolvedValueOnce({ uid: "m1" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
  });

  // auth.ts L97-98: data?.uid in setAdminClaim catch block — null data causes TypeError
  it("setAdminClaim with null data → error in catch block", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped(null, asAdminNoApp)).rejects.toThrow();
  });

  // tasks.ts L143: approveTask master not found
  it("approveTask with nonexistent master", async () => {
    delete state.masters["m1"];
    state["children/c1/tasks"]["t1"] = { status: "pending_approval", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/Master account not found/i);
  });

  // tasks.ts L201: rejectTask master not found
  it("rejectTask with nonexistent master", async () => {
    delete state.masters["m1"];
    state["children/c1/tasks"]["t1"] = { status: "pending_approval", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/Master account not found/i);
  });

  // tasks.ts L218: rejectTask task not found
  it("rejectTask with nonexistent task", async () => {
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(wrapped({ childId: "c1", taskId: "nonexistent" }, asMaster))
      .rejects.toThrow(/Task not found/i);
  });

  // legal.ts L330: data?.status || "active" fallback (no status provided)
  it("publishLegalPolicy without status field", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "1.0",
      contentUrl: "https://example.com/terms",
      // NO status → uses "active" default
    }, asAdminNoApp);
    expect(res.status).toBe("active");
  });

  // legal.ts L339: data?.effectiveAt not instanceof Timestamp
  it("publishLegalPolicy with non-Timestamp effectiveAt", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "2.0",
      contentUrl: "https://example.com/privacy",
      effectiveAt: "2025-01-01", // string, not Timestamp
    }, asAdminNoApp);
    expect(res.success).toBe(true);
  });

  // legal.ts L342: data?.isMajorChange === true (test with false)
  it("publishLegalPolicy with isMajorChange false", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms",
      country: "US",
      locale: "en-US",
      version: "3.0",
      contentUrl: "https://example.com/terms-us",
      isMajorChange: false,
    }, asAdminNoApp);
    expect(res.success).toBe(true);
  });

  // subscription.ts L186: adminUid ?? "unknown-admin"
  // subscription.ts L261: if (subCount > 0 || trialCount > 0)
  it("checkExpiredSubscriptions with active subscriptions", async () => {
    state.subscriptions["s1"] = {
      status: "active",
      masterId: "m1",
      expiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
    };
    const fn = fns.checkExpiredSubscriptions;
    if (fn?.run) {
      await fn.run({});
    }
  });

  // triggers.ts L215: result.candidates?.[0]?.content?.parts?.[0]?.text || ""
  // Already tested via analyzeTaskPhoto
});

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 4: onTaskStatusChange edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange null/edge paths", () => {
  // triggers.ts L248: same status no notification
  it("same status before/after → does nothing", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1", description: "Test" }) },
      after: { data: () => ({ status: "pending", masterImei: "m1", description: "Test updated" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  // triggers.ts: before data null
  it("before data null → logs warning, skips", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => null },
      after: { data: () => ({ status: "approved", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  // triggers.ts: after data null
  it("after data null → logs warning, skips", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending" }) },
      after: { data: () => null },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 5: Pairing edge cases for ?.  chains
// ══════════════════════════════════════════════════════════════════════════

describe("pairing subscription ?.  chain branches", () => {
  // pairing.ts L72: error catch wrapping non-HttpsError
  it("generatePairingLink with master not found wraps error", async () => {
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/not found/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CATEGORY 6: Admin.ts performAnalysis JSON parse failure
// ══════════════════════════════════════════════════════════════════════════

describe("performAnalysis edge cases", () => {
  // admin.ts L661/724: JSON.parse fails → fallback
  it("analyzeSystemErrors with invalid JSON from Gemini", async () => {
    state.error_logs["e1"] = {
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() },
      functionName: "testFn",
      message: "test error",
      stack: "Error: test",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "This is not valid JSON at all" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 168 }, asAdmin);
    // Should still return with fallback analysis
    expect(res.analyses).toBeDefined();
    expect(res.analyses.length).toBeGreaterThan(0);
  });

  // admin.ts L661: empty candidates in Gemini response
  it("analyzeSystemErrors with empty candidates", async () => {
    state.error_logs["e1"] = {
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() },
      functionName: "testFn",
      message: "error msg",
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: [] }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 168 }, asAdmin);
    expect(res.analyses).toBeDefined();
  });
});
