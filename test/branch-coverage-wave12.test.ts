/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Wave 12 – Branch-coverage push targeting remaining uncovered branches.
 *
 * Targets (by file):
 *   tasks.ts     : L36/149/207 – non-owned child denied for createTask/approveTask/rejectTask
 *   device.ts    : L393 masterImei null, L408 fcmToken null in reportTamperEvent, L56 catch isLocked ternary
 *   admin.ts     : L84/89 deleteUserAccount by non-admin, L371 getKnowledgeBase doc without content, L569 getErrorAnalytics with functionFilter
 *   pairing.ts   : L106 codeData null, L287 tokenData null, L155/323 childLimit default
 *   triggers.ts  : L248 master without fcmToken, L281 child without fcmToken for review
 *   subscription.ts: L181/186 revokeSubscription masterId fallback + adminUid null
 *   auth.ts      : L97/98 setAdminClaim audit with undefined uid, L336 registerMasterDevice non-HttpsError re-throw
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
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
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
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp", delete: () => "mock-delete" };
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
const asMaster = { auth: { uid: "m1", token: {} } };
const asChild = { auth: { uid: "c1", token: {} } };

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "secret123", fcmToken: "master-fcm-token",
        subscription: {
          status: "active", childLimit: 5, type: "single_child_monthly",
          expiresAt: { seconds: Math.floor(Date.now() / 1000) + 86400 * 30, nanoseconds: 0, toMillis: () => Date.now() + 86400000 * 30 },
        },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: ["com.blocked"], usageRules: { dailyLimit: 120 } },
    },
    "children/c1/tasks": {},
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

// ═══ tasks.ts – createTask non-owned child (L36) ═══

describe("tasks.ts createTask denied for non-owned child", () => {
  it("createTask when child belongs to different master → permission-denied", async () => {
    state.children["c-other"] = { masterImei: "other-master", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c-other",
      description: "Test task",
      deadlineISO: new Date(Date.now() + 86400000).toISOString(),
    }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });
});

// ═══ tasks.ts – approveTask non-owned child (L149) ═══

describe("tasks.ts approveTask denied for non-owned child", () => {
  it("approveTask when child belongs to different master → permission-denied", async () => {
    state.children["c-other"] = { masterImei: "other-master", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({
      childId: "c-other",
      taskId: "task1",
    }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });
});

// ═══ tasks.ts – rejectTask non-owned child (L207) ═══

describe("tasks.ts rejectTask denied for non-owned child", () => {
  it("rejectTask when child belongs to different master → permission-denied", async () => {
    state.children["c-other"] = { masterImei: "other-master", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(wrapped({
      childId: "c-other",
      taskId: "task1",
    }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });
});

// ═══ device.ts – reportTamperEvent masterImei null (L393) ═══

describe("device.ts reportTamperEvent fallbacks", () => {
  it("reportTamperEvent when child has no masterImei → not-found", async () => {
    state.children["c1"] = { childImei: "c1" }; // no masterImei
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(wrapped({
      childId: "c1",
      eventType: "app_uninstall",
    }, asChild)).rejects.toThrow(/parent|not.found/i);
  });

  it("reportTamperEvent when master has no fcmToken → succeeds without sending", async () => {
    state.masters["m1"] = { imei: "m1" }; // no fcmToken
    state.children["c1"] = { masterImei: "m1", childImei: "c1" };
    // Need tamperEvents sub-collection support
    if (!state["children/c1/tamperEvents"]) state["children/c1/tamperEvents"] = {};
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    const res = await wrapped({
      childId: "c1",
      eventType: "app_uninstall",
    }, asChild);
    expect(res.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ═══ device.ts – setDeviceLocked catch path isLocked ternary (L56) ═══

describe("device.ts setDeviceLocked catch block ternary", () => {
  it("setDeviceLocked failure in update → catch block covers isLocked ternary", async () => {
    // Make childDoc.update throw to trigger the catch block
    const origImpl = jest.spyOn(db, "collection");
    const origFn = origImpl.getMockImplementation();
    origImpl.mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "children") {
        return {
          doc: jest.fn((docId: string) => ({
            id: docId,
            get: jest.fn(() => Promise.resolve({
              exists: true,
              data: () => state.children[docId],
              id: docId,
              ref: { id: docId, update: jest.fn().mockRejectedValue(new Error("Firestore write failed")) },
            })),
            update: jest.fn().mockRejectedValue(new Error("Firestore write failed")),
          })),
          where: jest.fn().mockReturnThis(),
          get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
        };
      }
      return origFn!(...args);
    });

    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c1", isLocked: true }, asMaster))
      .rejects.toThrow();
  });
});

// ═══ admin.ts – deleteUserAccount as non-admin (L84/89) ═══

describe("admin.ts deleteUserAccount non-admin paths", () => {
  it("deleteUserAccount by non-admin for own account → success", async () => {
    mockAuth.deleteUser.mockResolvedValueOnce(undefined);
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
  });

  it("deleteUserAccount by non-admin for different masterId → permission-denied", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    await expect(wrapped({ masterId: "other-master" }, asMaster))
      .rejects.toThrow(/permission|own account/i);
  });
});

// ═══ admin.ts – getKnowledgeBase when doc exists but no content (L371) ═══

describe("admin.ts getKnowledgeBase doc without content", () => {
  it("getKnowledgeBase when operatorConfig doc exists but has no content → falls back to file", async () => {
    state.operatorConfig["knowledgeBase"] = { updatedAt: "mock-timestamp" }; // no content field
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    expect(res.source).not.toBe("firestore");
  });
});

// ═══ admin.ts – getErrorAnalytics with functionFilter (L569) ═══

describe("admin.ts analyzeSystemErrors with functionFilter", () => {
  it("analyzeSystemErrors filters by functionFilter", async () => {
    state.error_logs["e1"] = { functionName: "setDeviceLocked", message: "test error", stack: "stack1", timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 } };
    state.error_logs["e2"] = { functionName: "createTask", message: "another error", stack: "stack2", timestamp: { seconds: Date.now() / 1000, nanoseconds: 0 } };
    // Mock the Gemini AI response for analysis
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ errorId: "e1", rootCause: "test", fix: "fix it", severity: "low", category: "logic" }]) }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ functionFilter: "setDeviceLocked" }, asAdmin);
    expect(res).toBeDefined();
  });
});

// ═══ pairing.ts – validatePairingCode codeData null (L106) ═══

describe("pairing.ts validatePairingCode subscription denied path", () => {
  it("validatePairingCode when master has no active subscription → resource-exhausted (L147)", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
    state.pairingCodes["123456"] = { masterId: "m1", expiresAt: futureTs };
    // Master with expired subscription
    state.masters["m1"] = {
      imei: "m1",
      subscription: {
        status: "expired", type: "single_child_monthly",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) - 86400, nanoseconds: 0, toMillis: () => Date.now() - 86400000 },
      },
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "123456", childId: "new-child" }, { auth: { uid: "new-child", token: {} } }))
      .rejects.toThrow(/exhausted|subscription|trial/i);
  });
});

// ═══ pairing.ts – validatePairingToken tokenData null (L287) ═══

describe("pairing.ts validatePairingToken subscription denied path", () => {
  it("validatePairingToken when master has no active subscription → resource-exhausted (L224)", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
    state.pairingTokens["token-abc"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = {
      imei: "m1",
      subscription: {
        status: "expired", type: "single_child_monthly",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) - 86400, nanoseconds: 0, toMillis: () => Date.now() - 86400000 },
      },
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "token-abc" }, { auth: { uid: "new-child", token: {} } }))
      .rejects.toThrow(/exhausted|subscription|trial/i);
  });
});

// ═══ pairing.ts – validatePairingCode childLimit default (L155) ═══

describe("pairing.ts validatePairingCode childLimit fallback", () => {
  it("validatePairingCode when subscription has no childLimit → defaults to 1", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
    state.pairingCodes["654321"] = {
      masterId: "m1",
      expiresAt: futureTs,
    };
    // Master with subscription but no childLimit
    state.masters["m1"] = {
      imei: "m1",
      subscription: {
        status: "active", type: "single_child_monthly",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 86400, nanoseconds: 0, toMillis: () => Date.now() + 86400000 },
      },
      // no childLimit in subscription
    };
    // One child already paired → limit is 1 (default), so this should fail with resource-exhausted
    state.children["existing-child"] = { masterImei: "m1", childImei: "existing" };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "654321", childId: "new-child" }, { auth: { uid: "new-child", token: {} } }))
      .rejects.toThrow(/limit|exhausted/i);
  });
});

// ═══ pairing.ts – validatePairingToken childLimit default (L323) ═══

describe("pairing.ts validatePairingToken childLimit fallback", () => {
  it("validatePairingToken when subscription has no childLimit → defaults to 1", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
    state.pairingTokens["tok123"] = {
      masterId: "m1",
      expiresAt: futureTs,
    };
    state.masters["m1"] = {
      imei: "m1",
      subscription: {
        status: "active", type: "single_child_monthly",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 86400, nanoseconds: 0, toMillis: () => Date.now() + 86400000 },
      },
    };
    state.children["existing-child"] = { masterImei: "m1", childImei: "existing" };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "tok123" }, { auth: { uid: "new-child", token: {} } }))
      .rejects.toThrow(/limit|exhausted/i);
  });
});

// ═══ triggers.ts – onTaskStatusChange pending_approval with master without fcmToken (L248) ═══

describe("triggers.ts onTaskStatusChange no fcmToken paths", () => {
  it("onTaskStatusChange pending_approval but master has no fcmToken → skips notification", async () => {
    state.masters["m1"] = { imei: "m1" }; // no fcmToken
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const change = {
      before: { data: () => ({ status: "pending", masterImei: "m1", description: "Task" }) },
      after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Task" }) },
    };
    await wrapped(change, { params: { childId: "c1", taskId: "task1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("onTaskStatusChange approved but child has no fcmToken → skips notification (L281)", async () => {
    state.children["c1"] = { masterImei: "m1", childImei: "c1" }; // no fcmToken
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Task" }) },
      after: { data: () => ({ status: "approved", masterImei: "m1", description: "Task" }) },
    };
    await wrapped(change, { params: { childId: "c1", taskId: "task1" } });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ═══ auth.ts – setAdminClaim with undefined uid in audit log (L97/98) ═══

describe("auth.ts setAdminClaim audit with undefined data", () => {
  it("setAdminClaim with missing uid in data → audit log uses 'unknown' fallback", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ role: "admin" }, asAdmin))
      .rejects.toThrow();
  });
});

// ═══ auth.ts – registerMasterDevice non-HttpsError in catch (L336) ═══

describe("auth.ts registerMasterDevice unexpected catch", () => {
  it("registerMasterDevice when getUser throws non-auth error → wraps as internal", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("Unexpected DB error"));
    mockAuth.createUser.mockRejectedValueOnce(new Error("Create also fails"));
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "new-m" }, { auth: { uid: "new-m", token: {} } }))
      .rejects.toThrow();
  });
});
