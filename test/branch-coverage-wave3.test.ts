/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch‐coverage wave 3 – targets missed branches in:
 *   admin.ts       (44 uncov → deleteUserAccount, adminHealthCheck, sendTestFcmMessage, triggerScheduledJob, getKnowledgeBase, executeAutoFix)
 *   auth.ts        (16 uncov → setUserRole, bootstrapFirstAdmin, generateCustomToken legacy, registerMasterDevice)
 *   subscription.ts(10 uncov → getChildLimit family, getSubscriptionDurationMs yearly, trial branches, revokeSubscription masterId-only)
 *   tasks.ts       (9 uncov  → createTask ownership denied, approveTask/rejectTask error paths, completeTask)
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
    bucket: jest.fn(() => mockBucket),
  })),
}));

// Default-Mock: liefert konfigurierbares File-Verhalten für alle Tests.
// Per-Test kann via mockBucketFileMetadata.* überschrieben werden.
const mockBucketFileMetadata = {
  exists: true,
  contentType: "image/jpeg" as string | null,
  size: 1024 * 100, // 100 KB → bestanden Default
};
const mockBucket = {
  name: "test-bucket",
  getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
  file: jest.fn(() => ({
    exists: jest.fn().mockResolvedValue([mockBucketFileMetadata.exists]),
    getMetadata: jest.fn().mockResolvedValue([{
      contentType: mockBucketFileMetadata.contentType,
      size: String(mockBucketFileMetadata.size),
    }]),
  })),
};

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

// ── State-backed Firestore mock (matches wave2 pattern) ────────────────────

const mockDbObj = { collection: jest.fn() };

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => mockBucket),
  })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
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
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };
const noAuth = {};

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "secret123", fcmToken: "master-fcm-token",
        subscription: { status: "active", type: "family_monthly", childLimit: 99 },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token" },
    },
    pairingCodes: {},
    pairingTokens: {},
    subscriptions: {},
    supportTickets: {},
    supportAccessGrants: {},
    masterLegalConsents: {},
    legalPolicies: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    performance_metrics: {},
    operatorConfig: {},
    ai_error_analyses: {},
    legacyAuthUsage: {},
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
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()), update: jest.fn(() => Promise.resolve()) },
                })),
              })),
              add: jest.fn((data: any) => {
                const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][id] = data;
                return Promise.resolve({ id });
              }),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        if (!state[coll]) state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn((field: string, op: string, value: unknown) => {
        return buildWhereChain([{ field, op, value }]);
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – deleteUserAccount, adminHealthCheck, sendTestFcmMessage,
//            triggerScheduledJob, getKnowledgeBase, executeAutoFix, etc.
// ══════════════════════════════════════════════════════════════════════════

describe("admin.ts branch coverage", () => {
  describe("deleteUserAccount – admin vs self-delete", () => {
    it("allows admin to delete another user's account", async () => {
      state.masters.m_target = { imei: "m_target", uid: "m_target" };
      const wrapped = testEnv.wrap(fns.deleteUserAccount);
      const res = await wrapped({ masterId: "m_target" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("allows self-deletion (non-admin)", async () => {
      const wrapped = testEnv.wrap(fns.deleteUserAccount);
      const res = await wrapped({}, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws permission-denied when non-admin tries to delete another user", async () => {
      const wrapped = testEnv.wrap(fns.deleteUserAccount);
      await expect(wrapped({ masterId: "other_user" }, asMaster)).rejects.toThrow(/only delete their own/);
    });

    it("uses callerId when masterId equals callerId (non-admin)", async () => {
      const wrapped = testEnv.wrap(fns.deleteUserAccount);
      const res = await wrapped({ masterId: "m1" }, asMaster);
      expect(res.success).toBe(true);
    });
  });

  describe("adminHealthCheck – storage and collection checks", () => {
    it("returns health status for admin", async () => {
      const wrapped = testEnv.wrap(fns.adminHealthCheck);
      const res = await wrapped({}, asAdmin);
      expect(res.ok).toBe(true);
      expect(res.checks).toBeDefined();
      expect(res.prerequisites).toBeDefined();
      expect(res.prerequisites.storage).toBe("ok");
    });
  });

  describe("sendTestFcmMessage – token and childId paths", () => {
    it("sends FCM with direct token", async () => {
      const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
      const res = await wrapped({ token: "direct-tok" }, asAdmin);
      expect(res.success).toBe(true);
      expect(mockSend).toHaveBeenCalled();
    });

    it("looks up FCM token from childId", async () => {
      const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
      const res = await wrapped({ childId: "c1" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("returns error when childId has no FCM token", async () => {
      state.children.c_no_token = { masterImei: "m1", childImei: "c_no_token" };
      const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
      const res = await wrapped({ childId: "c_no_token" }, asAdmin);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Kein FCM-Token");
    });

    it("throws when neither token nor childId provided", async () => {
      const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/token oder childId/);
    });

    it("returns error when FCM send fails", async () => {
      mockSend.mockRejectedValueOnce(new Error("FCM failure"));
      const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
      const res = await wrapped({ token: "bad-tok" }, asAdmin);
      expect(res.success).toBe(false);
      expect(res.error).toContain("FCM");
    });
  });

  describe("triggerScheduledJob – various job names", () => {
    it("runs checkExpiredSubscriptions job", async () => {
      state.subscriptions.sub1 = {
        status: "active",
        expiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
      };
      const wrapped = testEnv.wrap(fns.triggerScheduledJob);
      const res = await wrapped({ jobName: "checkExpiredSubscriptions" }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.jobName).toBe("checkExpiredSubscriptions");
    });

    it("runs cleanupExpiredGrants job", async () => {
      state.supportTickets.t1 = {
        accessGranted: true,
        accessExpiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
      };
      const wrapped = testEnv.wrap(fns.triggerScheduledJob);
      const res = await wrapped({ jobName: "cleanupExpiredGrants" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("runs sendDailyErrorReport job", async () => {
      const wrapped = testEnv.wrap(fns.triggerScheduledJob);
      const res = await wrapped({ jobName: "sendDailyErrorReport" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("throws for unknown job name", async () => {
      const wrapped = testEnv.wrap(fns.triggerScheduledJob);
      await expect(wrapped({ jobName: "unknownJob" }, asAdmin)).rejects.toThrow(/Unbekannter Job/);
    });

    it("throws when jobName is missing", async () => {
      const wrapped = testEnv.wrap(fns.triggerScheduledJob);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/jobName/);
    });
  });

  describe("getKnowledgeBase – Firestore vs file fallback", () => {
    it("returns knowledge base from Firestore when content exists", async () => {
      state.operatorConfig = state.operatorConfig || {};
      state.operatorConfig.knowledgeBase = { content: "KB from Firestore" };
      const wrapped = testEnv.wrap(fns.getKnowledgeBase);
      const res = await wrapped({}, asAdmin);
      expect(res.success).toBe(true);
      expect(res.source).toBe("firestore");
      expect(res.content).toBe("KB from Firestore");
    });

    it("falls back to file when Firestore doc has no content", async () => {
      state.operatorConfig = state.operatorConfig || {};
      state.operatorConfig.knowledgeBase = {};
      const wrapped = testEnv.wrap(fns.getKnowledgeBase);
      const res = await wrapped({}, asAdmin);
      expect(res.success).toBe(true);
      expect(res.source).toBe("file");
    });

    it("falls back to file when Firestore doc does not exist", async () => {
      const wrapped = testEnv.wrap(fns.getKnowledgeBase);
      const res = await wrapped({}, asAdmin);
      expect(res.success).toBe(true);
      expect(res.source).toBe("file");
    });
  });

  describe("updateKnowledgeBase – validation", () => {
    it("updates knowledge base content", async () => {
      const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
      const res = await wrapped({ content: "Updated KB content" }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.length).toBe(18);
    });

    it("throws when content is not a string", async () => {
      const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
      await expect(wrapped({ content: 123 }, asAdmin)).rejects.toThrow(/content/);
    });

    it("throws when content is missing", async () => {
      const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/content/);
    });
  });

  describe("testGeminiConnection – API key check", () => {
    it("returns error when GEMINI_API_KEY is not set", async () => {
      const saved = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({}, asAdmin);
        expect(res.success).toBe(false);
        expect(res.error).toContain("GEMINI_API_KEY");
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
      }
    });
  });

  describe("exportUserData – admin DSAR export", () => {
    it("exports user data for existing master", async () => {
      const wrapped = testEnv.wrap(fns.exportUserData);
      const res = await wrapped({ masterId: "m1" }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data.masterId).toBe("m1");
    });

    it("throws when masterId is missing", async () => {
      const wrapped = testEnv.wrap(fns.exportUserData);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/masterId/);
    });

    it("throws when masterId is wrong type", async () => {
      const wrapped = testEnv.wrap(fns.exportUserData);
      await expect(wrapped({ masterId: 42 }, asAdmin)).rejects.toThrow(/masterId/);
    });

    it("throws when master not found", async () => {
      const wrapped = testEnv.wrap(fns.exportUserData);
      await expect(wrapped({ masterId: "nonexistent" }, asAdmin)).rejects.toThrow(/not found/);
    });
  });

  describe("executeAutoFix – auto-fix actions", () => {
    it("throws when analysisId is missing", async () => {
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/analysisId/);
    });

    it("throws when errorIndex is missing", async () => {
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      await expect(wrapped({ analysisId: "a1" }, asAdmin)).rejects.toThrow(/errorIndex/);
    });

    it("throws when action is missing", async () => {
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      await expect(wrapped({ analysisId: "a1", errorIndex: 0 }, asAdmin)).rejects.toThrow(/action/);
    });

    it("throws when analysis not found", async () => {
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      await expect(wrapped({ analysisId: "nonexistent", errorIndex: 0, action: "cleanup_expired_subscriptions" }, asAdmin))
        .rejects.toThrow(/nicht gefunden/);
    });

    it("throws when action is unknown", async () => {
      state.ai_error_analyses = state.ai_error_analyses || {};
      state.ai_error_analyses.analysis1 = { analyses: [{}], status: "pending" };
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      await expect(wrapped({ analysisId: "analysis1", errorIndex: 0, action: "drop_database" }, asAdmin))
        .rejects.toThrow(/Unbekannte Auto-Fix/);
    });

    it("executes cleanup_expired_subscriptions action", async () => {
      state.ai_error_analyses = state.ai_error_analyses || {};
      state.ai_error_analyses.analysis2 = { analyses: [{ autoFixable: true }], status: "pending" };
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      const res = await wrapped({ analysisId: "analysis2", errorIndex: 0, action: "cleanup_expired_subscriptions" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("executes cleanup_expired_grants action", async () => {
      state.ai_error_analyses = state.ai_error_analyses || {};
      state.ai_error_analyses.analysis3 = { analyses: [{ autoFixable: true }], status: "pending" };
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      const res = await wrapped({ analysisId: "analysis3", errorIndex: 0, action: "cleanup_expired_grants" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("executes regenerate_error_report action", async () => {
      state.ai_error_analyses = state.ai_error_analyses || {};
      state.ai_error_analyses.analysis4 = { analyses: [{ autoFixable: true }], status: "pending" };
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      const res = await wrapped({ analysisId: "analysis4", errorIndex: 0, action: "regenerate_error_report" }, asAdmin);
      expect(res.success).toBe(true);
    });

    it("executes clear_error_logs action", async () => {
      state.ai_error_analyses = state.ai_error_analyses || {};
      state.ai_error_analyses.analysis5 = { analyses: [{ autoFixable: true }], status: "pending" };
      const wrapped = testEnv.wrap(fns.executeAutoFix);
      const res = await wrapped({ analysisId: "analysis5", errorIndex: 0, action: "clear_error_logs" }, asAdmin);
      expect(res.success).toBe(true);
    });
  });

  describe("analyzeSystemErrors – validation branches", () => {
    it("throws when GEMINI_API_KEY is not set", async () => {
      const saved = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        await expect(wrapped({}, asAdmin)).rejects.toThrow(/GEMINI_API_KEY/);
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – generateCustomToken, registerMasterDevice, setAdminClaim, etc.
// ══════════════════════════════════════════════════════════════════════════

describe("auth.ts branch coverage", () => {
  describe("generateCustomToken – various auth paths", () => {
    it("generates token for authenticated user", async () => {
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      const res = await wrapped({}, asMaster);
      expect(res.customToken).toBe("mock-custom-token");
    });

    it("generates token for admin user", async () => {
      mockAuth.getUser.mockResolvedValueOnce({ uid: "admin1", customClaims: { role: "admin" } });
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      const res = await wrapped({}, asAdmin);
      expect(res.customToken).toBe("mock-custom-token");
    });

    it("generates token via legacy secretKey when not authenticated", async () => {
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      const res = await wrapped({ masterImei: "m1", secretKey: "secret123" }, noAuth);
      expect(res.customToken).toBe("mock-custom-token");
    });

    it("rejects invalid secretKey", async () => {
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      await expect(wrapped({ masterImei: "m1", secretKey: "wrong" }, noAuth))
        .rejects.toThrow(/Invalid master IMEI/);
    });

    it("rejects missing credentials when not authenticated", async () => {
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      await expect(wrapped({}, noAuth)).rejects.toThrow(/masterImei.*secretKey|authenticated/);
    });
  });

  describe("registerMasterDevice – various paths", () => {
    it("re-registers existing master and returns token", async () => {
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      const res = await wrapped({ imei: "m1" }, asMaster);
      expect(res.customToken).toBe("mock-custom-token");
      expect(res.masterId).toBe("m1");
    });

    it("registers new master device", async () => {
      mockAuth.getUser.mockResolvedValueOnce({ uid: "m_new", customClaims: {} });
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      const res = await wrapped({ imei: "m_new" }, { auth: { uid: "m_new", token: {} } });
      expect(res.customToken).toBe("mock-custom-token");
      expect(res.masterId).toBe("m_new");
    });

    it("throws when imei is missing", async () => {
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      await expect(wrapped({}, asMaster)).rejects.toThrow(/imei/);
    });

    it("throws when authenticated uid doesn't match imei", async () => {
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      await expect(wrapped(
        { imei: "different_imei" },
        { auth: { uid: "m1", token: {} } }
      )).rejects.toThrow(/does not match/);
    });

    it("handles auth/user-not-found by creating user", async () => {
      mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      const res = await wrapped({ imei: "m_new2" }, { auth: { uid: "m_new2", token: {} } });
      expect(res.customToken).toBe("mock-custom-token");
    });

    it("registers without auth context (legacy path)", async () => {
      mockAuth.getUser.mockResolvedValueOnce({ uid: "m_legacy", customClaims: {} });
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      const res = await wrapped({ imei: "m_legacy" }, noAuth);
      expect(res.customToken).toBe("mock-custom-token");
    });
  });

  describe("setAdminClaim – role assignment", () => {
    it("sets admin claim for user", async () => {
      const wrapped = testEnv.wrap(fns.setAdminClaim);
      const res = await wrapped({ uid: "user1" }, asAdmin);
      expect(res.message).toContain("admin");
    });

    it("throws when uid is missing", async () => {
      const wrapped = testEnv.wrap(fns.setAdminClaim);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/UID/);
    });

    it("throws when called by non-admin", async () => {
      const wrapped = testEnv.wrap(fns.setAdminClaim);
      await expect(wrapped({ uid: "u1" }, asMaster)).rejects.toThrow(/Admin/);
    });
  });

  describe("setUserRole – operator roles", () => {
    it("sets support role for user", async () => {
      const wrapped = testEnv.wrap(fns.setUserRole);
      const res = await wrapped({ uid: "user2", role: "support" }, asAdmin);
      expect(res.message).toContain("support");
    });

    it("sets auditor role for user", async () => {
      const wrapped = testEnv.wrap(fns.setUserRole);
      const res = await wrapped({ uid: "user3", role: "auditor" }, asAdmin);
      expect(res.message).toContain("auditor");
    });

    it("throws when role is invalid", async () => {
      const wrapped = testEnv.wrap(fns.setUserRole);
      await expect(wrapped({ uid: "u1", role: "superadmin" }, asAdmin)).rejects.toThrow(/Role must be/);
    });

    it("throws when uid is missing", async () => {
      const wrapped = testEnv.wrap(fns.setUserRole);
      await expect(wrapped({ role: "admin" }, asAdmin)).rejects.toThrow(/UID/);
    });

    it("throws when called by non-admin", async () => {
      const wrapped = testEnv.wrap(fns.setUserRole);
      await expect(wrapped({ uid: "u1", role: "admin" }, asMaster)).rejects.toThrow(/Admin/);
    });
  });

  describe("bootstrapFirstAdmin – first admin setup", () => {
    it("sets first admin when no admin exists", async () => {
      mockAuth.listUsers.mockResolvedValueOnce({ users: [{ uid: "u1", customClaims: {} }], pageToken: undefined });
      const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
      const res = await wrapped({}, { auth: { uid: "new_admin", token: {} } });
      expect(res.success).toBe(true);
    });

    it("throws when admin already exists", async () => {
      mockAuth.listUsers.mockResolvedValueOnce({
        users: [{ uid: "existing_admin", customClaims: { role: "admin" } }],
        pageToken: undefined,
      });
      const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
      await expect(wrapped({}, { auth: { uid: "wannabe", token: {} } })).rejects.toThrow(/bereits ein Admin/);
    });

    it("throws when unauthenticated", async () => {
      const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
      await expect(wrapped({}, noAuth)).rejects.toThrow(/angemeldet/);
    });
  });

  describe("revokeUserTokens – token revocation", () => {
    it("revokes tokens for specified user", async () => {
      const wrapped = testEnv.wrap(fns.revokeUserTokens);
      const res = await wrapped({ uid: "user1" }, asAdmin);
      expect(res.message).toContain("revoked");
    });

    it("throws when uid is missing", async () => {
      const wrapped = testEnv.wrap(fns.revokeUserTokens);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/UID/);
    });

    it("throws when called by non-admin", async () => {
      const wrapped = testEnv.wrap(fns.revokeUserTokens);
      await expect(wrapped({ uid: "u1" }, asMaster)).rejects.toThrow(/Admin/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION.TS – trial branches, revokeSubscription, verifyPurchase
// ══════════════════════════════════════════════════════════════════════════

describe("subscription.ts branch coverage", () => {
  describe("getSubscriptionStatus – trial branches", () => {
    it("returns trial status with remaining days", async () => {
      const futureMillis = Date.now() + 3 * 24 * 60 * 60 * 1000;
      state.masters.m1.subscription = {
        status: "trial",
        trialEndsAt: futureMillis,
        childLimit: 1,
      };
      const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
      const res = await wrapped({}, asMaster);
      expect(res.subscriptionStatus.status).toBe("trial");
      expect(res.trialDaysRemaining).toBeGreaterThan(0);
      expect(res.isTrialActive).toBe(true);
    });

    it("returns expired trial when trialEndsAt is in the past", async () => {
      state.masters.m1.subscription = {
        status: "trial",
        trialEndsAt: 100000,
        childLimit: 1,
      };
      const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
      const res = await wrapped({}, asMaster);
      expect(res.trialDaysRemaining).toBe(0);
      expect(res.isTrialActive).toBe(false);
    });

    it("handles trialEndsAt as Timestamp instance", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
      state.masters.m1.subscription = {
        status: "trial",
        trialEndsAt: futureTs,
        childLimit: 1,
      };
      const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
      const res = await wrapped({}, asMaster);
      expect(res.isTrialActive).toBe(true);
    });

    it("returns status without trial fields when not in trial", async () => {
      state.masters.m1.subscription = { status: "active", childLimit: 5 };
      const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
      const res = await wrapped({}, asMaster);
      expect(res.subscriptionStatus.status).toBe("active");
      expect(res.trialDaysRemaining).toBeUndefined();
    });

    it("returns none status when no subscription", async () => {
      delete state.masters.m1.subscription;
      const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
      const res = await wrapped({}, asMaster);
      expect(res.subscriptionStatus.status).toBe("none");
    });
  });

  describe("revokeSubscription – admin operation", () => {
    it("revokes by subscriptionId", async () => {
      state.subscriptions.sub1 = { masterId: "m1", status: "active" };
      const wrapped = testEnv.wrap(fns.revokeSubscription);
      const res = await wrapped({ subscriptionId: "sub1" }, asAdmin);
      expect(res.message).toContain("revoked");
    });

    it("revokes by masterId when subscriptionId not provided", async () => {
      state.subscriptions.sub2 = { masterId: "m1", status: "active" };
      const wrapped = testEnv.wrap(fns.revokeSubscription);
      const res = await wrapped({ masterId: "m1" }, asAdmin);
      expect(res.message).toContain("revoked");
    });

    it("throws when neither subscriptionId nor masterId provided", async () => {
      const wrapped = testEnv.wrap(fns.revokeSubscription);
      await expect(wrapped({}, asAdmin)).rejects.toThrow(/subscriptionId or masterId/);
    });
  });

  describe("verifyPurchase – subscription activation", () => {
    it("throws when purchaseToken is missing", async () => {
      const wrapped = testEnv.wrap(fns.verifyPurchase);
      await expect(wrapped({ sku: "single_child_monthly" }, asMaster)).rejects.toThrow(/Missing required/);
    });

    it("throws when sku is invalid", async () => {
      const wrapped = testEnv.wrap(fns.verifyPurchase);
      await expect(wrapped({ purchaseToken: "tok", sku: "invalid_sku" }, asMaster)).rejects.toThrow(/Unknown product/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TASKS.TS – createTask, approveTask, rejectTask, completeTask
// ══════════════════════════════════════════════════════════════════════════

describe("tasks.ts branch coverage", () => {
  describe("createTask – validation and error paths", () => {
    it("creates task successfully", async () => {
      const wrapped = testEnv.wrap(fns.createTask);
      const res = await wrapped({
        childId: "c1",
        description: "Do homework",
        deadlineISO: new Date(Date.now() + 86400000).toISOString(),
      }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when description is missing", async () => {
      const wrapped = testEnv.wrap(fns.createTask);
      await expect(wrapped({
        childId: "c1",
        deadlineISO: new Date().toISOString(),
      }, asMaster)).rejects.toThrow(/Missing required/);
    });

    it("throws when childId is missing", async () => {
      const wrapped = testEnv.wrap(fns.createTask);
      await expect(wrapped({
        description: "Test",
        deadlineISO: new Date().toISOString(),
      }, asMaster)).rejects.toThrow(/Missing required/);
    });

    it("throws permission-denied when child not owned by master", async () => {
      state.children.c_other = { masterImei: "other_master", childImei: "c_other" };
      const wrapped = testEnv.wrap(fns.createTask);
      await expect(wrapped({
        childId: "c_other",
        description: "Test",
        deadlineISO: new Date().toISOString(),
      }, asMaster)).rejects.toThrow(/not authorized/);
    });

    it("throws resource-exhausted when no active subscription", async () => {
      state.masters.m1.subscription = { status: "expired", childLimit: 0 };
      const wrapped = testEnv.wrap(fns.createTask);
      await expect(wrapped({
        childId: "c1",
        description: "Test",
        deadlineISO: new Date().toISOString(),
      }, asMaster)).rejects.toThrow(/subscription or trial/);
    });
  });

  describe("approveTask – state checks", () => {
    beforeEach(() => {
      state["children/c1/tasks"] = {
        task1: { status: "pending_approval", description: "Read book", masterImei: "m1" },
        task2: { status: "pending", description: "Other task", masterImei: "m1" },
      };
    });

    it("approves a task in pending_approval state", async () => {
      const wrapped = testEnv.wrap(fns.approveTask);
      const res = await wrapped({ childId: "c1", taskId: "task1" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when task is not in pending_approval state", async () => {
      const wrapped = testEnv.wrap(fns.approveTask);
      await expect(wrapped({ childId: "c1", taskId: "task2" }, asMaster))
        .rejects.toThrow(/pending_approval/);
    });

    it("throws when taskId is missing", async () => {
      const wrapped = testEnv.wrap(fns.approveTask);
      await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/Missing required/);
    });

    it("throws when task not found", async () => {
      const wrapped = testEnv.wrap(fns.approveTask);
      await expect(wrapped({ childId: "c1", taskId: "nonexistent" }, asMaster))
        .rejects.toThrow(/not found/);
    });
  });

  describe("rejectTask – with and without reason", () => {
    beforeEach(() => {
      state["children/c1/tasks"] = {
        task1: { status: "pending_approval", description: "Read book", masterImei: "m1" },
        task3: { status: "pending", description: "Pending task", masterImei: "m1" },
      };
    });

    it("rejects a task with reason", async () => {
      const wrapped = testEnv.wrap(fns.rejectTask);
      const res = await wrapped({ childId: "c1", taskId: "task1", reason: "Not done properly" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("rejects a task without reason", async () => {
      const wrapped = testEnv.wrap(fns.rejectTask);
      const res = await wrapped({ childId: "c1", taskId: "task1" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when childId is missing", async () => {
      const wrapped = testEnv.wrap(fns.rejectTask);
      await expect(wrapped({ taskId: "task1" }, asMaster)).rejects.toThrow(/Missing required/);
    });

    it("throws when task not in pending_approval state", async () => {
      const wrapped = testEnv.wrap(fns.rejectTask);
      await expect(wrapped({ childId: "c1", taskId: "task3" }, asMaster))
        .rejects.toThrow(/pending_approval/);
    });
  });

  describe("completeTask – photo URL validation", () => {
    beforeEach(() => {
      state["children/c1/tasks"] = {
        task4: { status: "pending", description: "Clean room", masterImei: "m1" },
        task5: { status: "approved", description: "Already done", masterImei: "m1" },
      };
    });

    it("completes a task with valid photoUrl", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      const res = await wrapped({
        taskId: "task4",
        photoUrl: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/children%2Fc1%2Fphotos%2Fphoto.jpg",
      }, asChild);
      expect(res.success).toBe(true);
    });

    it("throws when photoUrl is not a Firebase Storage URL", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({
        taskId: "task4",
        photoUrl: "https://evil.com/photo.jpg",
      }, asChild)).rejects.toThrow(/Firebase Storage URL/);
    });

    it("throws when photoUrl exceeds max length", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({
        taskId: "task4",
        photoUrl: "https://firebasestorage.googleapis.com/" + "a".repeat(2050),
      }, asChild)).rejects.toThrow(/maximum allowed length/);
    });

    it("throws when taskId/photoUrl is missing", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({ taskId: "task4" }, asChild)).rejects.toThrow(/Missing required/);
    });

    it("throws when task is not in pending state", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({
        taskId: "task5",
        photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Fp.jpg",
      }, asChild)).rejects.toThrow(/cannot transition/);
    });

    it("rejects photoUrl pointing to another child's storage path", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({
        taskId: "task4",
        photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fother-child%2Fphotos%2Fp.jpg",
      }, asChild)).rejects.toThrow(/calling child's own storage path/);
    });

    it("rejects photoUrl without an object path segment", async () => {
      const wrapped = testEnv.wrap(fns.completeTask);
      await expect(wrapped({
        taskId: "task4",
        photoUrl: "https://firebasestorage.googleapis.com/some-other-endpoint",
      }, asChild)).rejects.toThrow(/Storage object path/);
    });

    it("rejects photoUrl whose Storage object has disallowed MIME type", async () => {
      const original = mockBucketFileMetadata.contentType;
      mockBucketFileMetadata.contentType = "application/pdf";
      try {
        const wrapped = testEnv.wrap(fns.completeTask);
        await expect(wrapped({
          taskId: "task4",
          photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Ffile.pdf",
        }, asChild)).rejects.toThrow(/Content-Type/);
      } finally {
        mockBucketFileMetadata.contentType = original;
      }
    });

    it("rejects photoUrl whose Storage object exceeds maximum size", async () => {
      const originalSize = mockBucketFileMetadata.size;
      mockBucketFileMetadata.size = 11 * 1024 * 1024; // 11 MB > 10 MB Limit
      try {
        const wrapped = testEnv.wrap(fns.completeTask);
        await expect(wrapped({
          taskId: "task4",
          photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Fbig.jpg",
        }, asChild)).rejects.toThrow(/zu groß/);
      } finally {
        mockBucketFileMetadata.size = originalSize;
      }
    });

    it("rejects photoUrl whose Storage object is below minimum size", async () => {
      const originalSize = mockBucketFileMetadata.size;
      mockBucketFileMetadata.size = 100; // < 256 Bytes Minimum
      try {
        const wrapped = testEnv.wrap(fns.completeTask);
        await expect(wrapped({
          taskId: "task4",
          photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Ftiny.jpg",
        }, asChild)).rejects.toThrow(/zu klein/);
      } finally {
        mockBucketFileMetadata.size = originalSize;
      }
    });

    it("rejects photoUrl when Storage object does not exist", async () => {
      const originalExists = mockBucketFileMetadata.exists;
      mockBucketFileMetadata.exists = false;
      try {
        const wrapped = testEnv.wrap(fns.completeTask);
        await expect(wrapped({
          taskId: "task4",
          photoUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/children%2Fc1%2Fphotos%2Fghost.jpg",
        }, asChild)).rejects.toThrow(/existiert nicht/);
      } finally {
        mockBucketFileMetadata.exists = originalExists;
      }
    });
  });
});
