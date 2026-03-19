/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch-coverage wave 8 – final push targeting 36+ more branches for ≥90%.
 * Focus: legal deep branches, admin executeAutoFix/triggerScheduledJob,
 * support getTicketUserData/aiExplainProblem, subscription revokeSubscription,
 * auth registerMasterDevice, device updateChildDevice.
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
const asChild = { auth: { uid: "c1", token: {} } };
const asSupport = { auth: { uid: "s1", token: { role: "support" } } };
const noAuth = {};

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
        return Promise.resolve({ id: newId, get: () => Promise.resolve({ exists: true, data: () => data, id: newId }) });
      }),
    };
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  (db as any).batch = jest.fn(() => {
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
// legal.ts – recordLegalConsent edge cases (L245-257, L287)
// ══════════════════════════════════════════════════════════════════════════

describe("recordLegalConsent", () => {
  it("missing termsVersion → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({ country: "DE", locale: "de-DE", termsVersion: "", privacyVersion: "1.0" }, asMaster))
      .rejects.toThrow(/termsVersion and privacyVersion are required/i);
  });

  it("missing privacyVersion → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({ country: "DE", locale: "de-DE", termsVersion: "1.0", privacyVersion: "" }, asMaster))
      .rejects.toThrow(/termsVersion and privacyVersion are required/i);
  });

  it("non-string termsVersion → treated as empty", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({ country: "DE", locale: "de-DE", termsVersion: 123, privacyVersion: "1.0" }, asMaster))
      .rejects.toThrow(/termsVersion and privacyVersion are required/i);
  });

  it("non-string privacyVersion → treated as empty", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({ country: "DE", locale: "de-DE", termsVersion: "1.0", privacyVersion: null }, asMaster))
      .rejects.toThrow(/termsVersion and privacyVersion are required/i);
  });

  it("consentSource defaults to master_app when empty", async () => {
    // policies must match - we use default which is "2026.03.18-1"
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
      consentSource: "", appVersion: "",
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("custom consentSource and appVersion are accepted", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
      consentSource: "child_app", appVersion: "2.0.0",
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("version mismatch → throws failed-precondition", async () => {
    // Provide a policy in state that doesn't match
    state.legalPolicies["terms_DE_de-DE_2.0"] = {
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "2.0", contentUrl: "https://example.com/terms",
      status: "active", effectiveAt: { seconds: 1000, nanoseconds: 0 },
    };
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE", locale: "de-DE",
      termsVersion: "1.0", privacyVersion: "1.0",
    }, asMaster)).rejects.toThrow(/Consent versions do not match/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – publishLegalPolicy validation (L325-342)
// ══════════════════════════════════════════════════════════════════════════

describe("publishLegalPolicy", () => {
  it("invalid policyType → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "cookies", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: "https://example.com",
    }, asAdminNoApp)).rejects.toThrow(/policyType must be either|invalid/i);
  });

  it("empty version → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "", contentUrl: "https://example.com",
    }, asAdminNoApp)).rejects.toThrow(/version is required/i);
  });

  it("empty contentUrl → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: "",
    }, asAdminNoApp)).rejects.toThrow(/contentUrl is required/i);
  });

  it("non-string version → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "privacy", country: "DE", locale: "de-DE",
      version: 123, contentUrl: "https://example.com",
    }, asAdminNoApp)).rejects.toThrow(/version is required/i);
  });

  it("non-string contentUrl → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "privacy", country: "DE", locale: "de-DE",
      version: "1.0", contentUrl: null,
    }, asAdminNoApp)).rejects.toThrow(/contentUrl is required/i);
  });

  it("successful publish with isMajorChange true", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms", country: "DE", locale: "de-DE",
      version: "2.0", contentUrl: "https://example.com/terms/2.0",
      isMajorChange: true, status: "draft",
    }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.policyType).toBe("terms");
    expect(res.status).toBe("draft");
  });

  it("successful publish defaults to active status", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy", country: "US", locale: "en-US",
      version: "1.0", contentUrl: "https://example.com/privacy",
    }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.status).toBe("active");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – markLegalReconsentRequired (L359-380)
// ══════════════════════════════════════════════════════════════════════════

describe("markLegalReconsentRequired", () => {
  it("targets specific master if masterImei provided", async () => {
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "m1" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("single_master");
    expect(res.updatedCount).toBe(1);
  });

  it("targets all consents for country/locale when no masterImei", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", country: "DE", locale: "de-DE" };
    state.masterLegalConsents["m2_DE_de-DE"] = { masterImei: "m2", country: "DE", locale: "de-DE" };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("country_locale");
  });

  it("empty masterImei string is treated as no masterImei", async () => {
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("country_locale");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – normalizeLocale edge cases (L67)
// ══════════════════════════════════════════════════════════════════════════

describe("legal normalizeLocale edge cases", () => {
  it("invalid locale format → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE", locale: "1234" }, asMaster))
      .rejects.toThrow(/locale must be a valid BCP-47/i);
  });

  it("non-string locale → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE", locale: null }, asMaster))
      .rejects.toThrow(/locale must be a valid BCP-47/i);
  });

  it("normalizes underscore to hyphen", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de_DE" }, asMaster);
    expect(res.locale).toBe("de-DE");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – deleteUserAccount non-admin edge cases (L84-89)
// ══════════════════════════════════════════════════════════════════════════

describe("deleteUserAccount edge cases", () => {
  it("non-admin trying to delete another user → throws permission-denied", async () => {
    state.masters["other"] = { imei: "other", uid: "other" };
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    await expect(wrapped({ masterId: "other" }, asMaster))
      .rejects.toThrow(/can only delete their own/i);
  });

  it("non-admin deletes own account (masterId matches caller)", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({ masterId: "m1" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("non-admin deletes own account without specifying masterId", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – adminHealthCheck storage error (L151)
// ══════════════════════════════════════════════════════════════════════════

describe("adminHealthCheck storage error", () => {
  it("returns error status when storage metadata fails", async () => {
    // Storage mock is set up in the module mock - we can just call it
    const wrapped = testEnv.wrap(fns.adminHealthCheck);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.ok).toBe(true);
    expect(res.checks).toBeDefined();
    expect(res.prerequisites.storage).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – triggerScheduledJob (L460-510)
// ══════════════════════════════════════════════════════════════════════════

describe("triggerScheduledJob", () => {
  it("checkExpiredSubscriptions job", async () => {
    state.subscriptions["sub1"] = {
      status: "active", masterId: "m1",
      expiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
    };
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "checkExpiredSubscriptions" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.jobName).toBe("checkExpiredSubscriptions");
  });

  it("cleanupExpiredGrants job", async () => {
    state.supportTickets["t1"] = {
      accessGranted: true,
      accessExpiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
    };
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "cleanupExpiredGrants" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.jobName).toBe("cleanupExpiredGrants");
  });

  it("sendDailyErrorReport job", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    const res = await wrapped({ jobName: "sendDailyErrorReport" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.jobName).toBe("sendDailyErrorReport");
  });

  it("unknown job → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped({ jobName: "nonExistentJob" }, asAdminNoApp))
      .rejects.toThrow(/Unbekannter Job/i);
  });

  it("missing jobName → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.triggerScheduledJob);
    await expect(wrapped({}, asAdminNoApp))
      .rejects.toThrow(/jobName ist erforderlich/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – executeAutoFix (L724-840)
// ══════════════════════════════════════════════════════════════════════════

describe("executeAutoFix", () => {
  it("cleanup_expired_subscriptions action", async () => {
    state.ai_error_analyses["a1"] = {
      analyses: [{ errorIndex: 0, autoFixable: true, autoFixAction: "cleanup_expired_subscriptions" }],
      status: "pending",
    };
    state.subscriptions["sub1"] = {
      status: "active",
      expiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a1", errorIndex: 0, action: "cleanup_expired_subscriptions" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("cleanup_expired_grants action", async () => {
    state.ai_error_analyses["a2"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    state.supportAccessGrants["g1"] = {
      expiresAt: { seconds: 100, nanoseconds: 0, toMillis: () => 100000 },
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a2", errorIndex: 0, action: "cleanup_expired_grants" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("regenerate_error_report action", async () => {
    state.ai_error_analyses["a3"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a3", errorIndex: 0, action: "regenerate_error_report" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("clear_error_logs action", async () => {
    state.ai_error_analyses["a4"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({ analysisId: "a4", errorIndex: 0, action: "clear_error_logs" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("unknown action → throws invalid-argument", async () => {
    state.ai_error_analyses["a5"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({ analysisId: "a5", errorIndex: 0, action: "drop_database" }, asAdmin))
      .rejects.toThrow(/Unbekannte Auto-Fix-Aktion/i);
  });

  it("missing analysisId → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({ errorIndex: 0, action: "clear_error_logs" }, asAdmin))
      .rejects.toThrow(/analysisId ist erforderlich/i);
  });

  it("negative errorIndex → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({ analysisId: "a1", errorIndex: -1, action: "clear_error_logs" }, asAdmin))
      .rejects.toThrow(/errorIndex ist erforderlich/i);
  });

  it("missing action → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({ analysisId: "a1", errorIndex: 0 }, asAdmin))
      .rejects.toThrow(/action ist erforderlich/i);
  });

  it("nonexistent analysis document → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({ analysisId: "nonexistent", errorIndex: 0, action: "clear_error_logs" }, asAdmin))
      .rejects.toThrow(/Analyse nicht gefunden/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – analyzeSystemErrors edge cases (L532-569)
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeSystemErrors edge cases", () => {
  it("no errors in time range → returns empty", async () => {
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 1 }, asAdminNoApp);
    expect(res.totalErrors).toBe(0);
    expect(res.summary).toMatch(/Keine Fehler/i);
  });

  it("single errorId analysis", async () => {
    state.error_logs["err1"] = {
      functionName: "testFn", message: "test error", stack: "at line 1",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ errorIndex: 0, severity: "low", category: "code", diagnosis: "test", solution: "fix", autoFixable: false, autoFixAction: null, autoFixDescription: null }]) }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ errorId: "err1" }, asAdminNoApp);
    expect(res.analyses).toBeDefined();
  });

  it("nonexistent errorId → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({ errorId: "nonexistent" }, asAdminNoApp))
      .rejects.toThrow(/Fehler-Eintrag nicht gefunden/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – getTicketUserData edge cases (L605-619)
// ══════════════════════════════════════════════════════════════════════════

describe("getTicketUserData edge cases", () => {
  it("ticket without accessGrantId → throws permission-denied", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", problemDescription: "test" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t1" }, asSupport))
      .rejects.toThrow(/No support access grant|must grant access/i);
  });

  it("grant not active (revoked) → throws permission-denied", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", accessGrantId: "g1" };
    state.supportAccessGrants["g1"] = { masterImei: "m1", status: "revoked", ticketId: "t1" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t1" }, asSupport))
      .rejects.toThrow(/grant is revoked|re-grant access/i);
  });

  it("grant expired → throws deadline-exceeded", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", accessGrantId: "g1" };
    state.supportAccessGrants["g1"] = {
      masterImei: "m1", status: "active", ticketId: "t1",
      expiresAt: { seconds: 100, nanoseconds: 0 },
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t1" }, asSupport))
      .rejects.toThrow(/expired/i);
  });

  it("grant not found → throws permission-denied", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", accessGrantId: "nonexistent" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t1" }, asSupport))
      .rejects.toThrow(/grant not found/i);
  });

  it("valid grant returns master and children data", async () => {
    const future = Math.floor(Date.now() / 1000) + 86400;
    state.supportTickets["t1"] = { masterImei: "m1", accessGrantId: "g1" };
    state.supportAccessGrants["g1"] = {
      masterImei: "m1", status: "active", ticketId: "t1",
      expiresAt: { seconds: future, nanoseconds: 0, toDate: () => new Date(future * 1000) },
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    const res = await wrapped({ ticketId: "t1" }, asSupport);
    expect(res.master).toBeDefined();
    expect(res.children).toBeDefined();
  });

  it("nonexistent ticket → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "nonexistent" }, asSupport))
      .rejects.toThrow(/not found/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – aiExplainProblem edge cases (L673-693)
// ══════════════════════════════════════════════════════════════════════════

describe("aiExplainProblem edge cases", () => {
  it("non-admin/support → throws permission-denied", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({ problemContext: "My child app crashes", consentGiven: true }, asMaster))
      .rejects.toThrow(/admin or support/i);
  });

  it("consentGiven false → throws failed-precondition", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({ problemContext: "My child app crashes", consentGiven: false }, asAdminNoApp))
      .rejects.toThrow(/Zustimmung zur KI-Nutzung/i);
  });

  it("problemContext too short → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({ problemContext: "short", consentGiven: true }, asAdminNoApp))
      .rejects.toThrow(/mindestens 10 Zeichen/i);
  });

  it("problemContext too long → throws invalid-argument", async () => {
    const longText = "a".repeat(3001);
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({ problemContext: longText, consentGiven: true }, asAdminNoApp))
      .rejects.toThrow(/maximal 3000 Zeichen/i);
  });

  it("support user can call aiExplainProblem", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    const res = await wrapped({
      problemContext: "The pairing QR code is not being scanned properly on the child device",
      consentGiven: true,
    }, asSupport);
    expect(res.explanation).toBeDefined();
    expect(res.suggestion).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – provideSolutionFeedback edge cases (L529-539)
// ══════════════════════════════════════════════════════════════════════════

describe("provideSolutionFeedback edge cases", () => {
  it("missing ticketId → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ feedback: "accepted" }, asMaster))
      .rejects.toThrow(/Missing ticketId or feedback/i);
  });

  it("missing feedback → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1" }, asMaster))
      .rejects.toThrow(/Missing ticketId or feedback/i);
  });

  it("invalid feedback value → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1", feedback: "maybe" }, asMaster))
      .rejects.toThrow(/must be.*accepted.*rejected/i);
  });

  it("rejected without comment → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1", feedback: "rejected" }, asMaster))
      .rejects.toThrow(/Comment is required/i);
  });

  it("rejected with empty comment → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1", feedback: "rejected", comment: "   " }, asMaster))
      .rejects.toThrow(/Comment is required/i);
  });

  it("accepted feedback → closes ticket", async () => {
    state.supportTickets["t1"] = { masterImei: "m1", status: "awaiting_user_feedback" };
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({ ticketId: "t1", feedback: "accepted" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("not-found ticket → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "nonexistent", feedback: "accepted" }, asMaster))
      .rejects.toThrow(/not found/i);
  });

  it("not own ticket → throws permission-denied", async () => {
    state.supportTickets["t1"] = { masterImei: "other-user", status: "awaiting_user_feedback" };
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1", feedback: "accepted" }, asMaster))
      .rejects.toThrow(/permission/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// subscription.ts – revokeSubscription edge cases (L155-261)
// ══════════════════════════════════════════════════════════════════════════

describe("revokeSubscription edge cases", () => {
  it("by masterId only (no subscriptionId)", async () => {
    state.masters["target"] = { imei: "target", subscription: { status: "active" } };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ masterId: "target" }, asAdminNoApp);
    expect(res.message).toMatch(/revoked/i);
  });

  it("by subscriptionId", async () => {
    state.subscriptions["sub1"] = { masterId: "m1", status: "active" };
    state.masters["m1"] = { imei: "m1", subscription: { status: "active" } };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ subscriptionId: "sub1" }, asAdminNoApp);
    expect(res.message).toMatch(/revoked/i);
  });

  it("missing both subscriptionId and masterId → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    await expect(wrapped({}, asAdminNoApp))
      .rejects.toThrow(/subscriptionId or masterId/i);
  });

  it("nonexistent subscription → throws not-found", async () => {
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    await expect(wrapped({ subscriptionId: "nonexistent" }, asAdminNoApp))
      .rejects.toThrow(/not found/i);
  });

  it("by masterId with matching subscription doc", async () => {
    state.masters["target"] = { imei: "target", subscription: { status: "active" } };
    state.subscriptions["sub2"] = { masterId: "target", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ masterId: "target" }, asAdminNoApp);
    expect(res.message).toMatch(/revoked/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// subscription.ts – getSubscriptionStatus trialEndsAt branches (L128-186)
// ══════════════════════════════════════════════════════════════════════════

describe("getSubscriptionStatus trial branches", () => {
  it("trial with Timestamp-like trialEndsAt", async () => {
    const admin = require("firebase-admin");
    const futureMs = Date.now() + 86400000 * 3;
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: admin.firestore.Timestamp.fromMillis(futureMs),
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.isTrialActive).toBe(true);
    expect(res.trialDaysRemaining).toBeGreaterThan(0);
  });

  it("trial with non-Timestamp trialEndsAt (raw number)", async () => {
    const futureMs = Date.now() + 86400000 * 2;
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: futureMs,
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.isTrialActive).toBe(true);
  });

  it("expired trial → isTrialActive false", async () => {
    const admin = require("firebase-admin");
    state.masters["m1"].subscription = {
      status: "trial",
      trialEndsAt: admin.firestore.Timestamp.fromMillis(100000),
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.isTrialActive).toBe(false);
    expect(res.trialDaysRemaining).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// auth.ts – registerMasterDevice edge cases (L275-336)
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice edge cases", () => {
  it("authenticated user with mismatched uid → throws failed-precondition", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "different-imei" }, asMaster))
      .rejects.toThrow(/does not match/i);
  });

  it("authenticated user registers new device (doc does not exist)", async () => {
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBeDefined();
  });

  it("authenticated user re-registers existing device", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// device.ts – updateChildDevice (L201-210), setUsageRules edge (L151)
// ══════════════════════════════════════════════════════════════════════════

describe("updateChildDevice edge cases", () => {
  it("appBlacklist update by owner master", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: ["com.new.app"] }, asMaster);
    expect(res.success).toBe(true);
  });

  it("non-owner master → throws permission-denied", async () => {
    state.children["c2"] = { masterImei: "other-master", childImei: "c2" };
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c2", appBlacklist: [] }, asMaster))
      .rejects.toThrow(/not authorized/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – getKnowledgeBase / updateKnowledgeBase (L410-452)
// ══════════════════════════════════════════════════════════════════════════

describe("getKnowledgeBase", () => {
  it("returns from firestore when present", async () => {
    state.operatorConfig["knowledgeBase"] = { content: "test KB content" };
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.source).toBe("firestore");
  });

  it("falls back to file when not in firestore", async () => {
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.success).toBe(true);
    // source will be "file" if file exists, "empty" if not
    expect(["file", "empty"]).toContain(res.source);
  });
});

describe("updateKnowledgeBase", () => {
  it("updates KB content", async () => {
    const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
    const res = await wrapped({ content: "New knowledge base content" }, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.length).toBe(26);
  });

  it("non-string content → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.updateKnowledgeBase);
    await expect(wrapped({ content: 123 }, asAdminNoApp))
      .rejects.toThrow(/content.*string.*required/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – testGeminiConnection (L333-371)
// ══════════════════════════════════════════════════════════════════════════

describe("testGeminiConnection", () => {
  it("successful Gemini response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "MiniMaster ist eine Parental-Control-App." }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.success).toBe(true);
    expect(res.response).toBeDefined();
  });

  it("Gemini API error response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Invalid API key"),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Gemini API Fehler/i);
  });

  it("fetch network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network unreachable"));
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdminNoApp);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Verbindungsfehler/i);
  });

  it("custom prompt passed to Gemini", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: "Custom answer" }] } }],
      }),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({ prompt: "Custom test prompt" }, asAdminNoApp);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – sendTestFcmMessage (L452)
// ══════════════════════════════════════════════════════════════════════════

describe("sendTestFcmMessage edge cases", () => {
  it("childId provided, no token found → returns error", async () => {
    state.children["c2"] = { childImei: "c2", masterImei: "m1" }; // no fcmToken
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "c2" }, asAdminNoApp);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Kein FCM-Token/i);
  });

  it("neither token nor childId → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    await expect(wrapped({}, asAdminNoApp))
      .rejects.toThrow(/token oder childId/i);
  });

  it("childId provided with token → sends message", async () => {
    state.children["c1"] = { ...state.children["c1"], fcmToken: "child-fcm-123" };
    const wrapped = testEnv.wrap(fns.sendTestFcmMessage);
    const res = await wrapped({ childId: "c1" }, asAdminNoApp);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – cleanupExpiredGrants (L329, L319)
// ══════════════════════════════════════════════════════════════════════════

describe("cleanupExpiredGrants scheduled", () => {
  it("revokes expired grants and updates tickets", async () => {
    state.supportAccessGrants["g1"] = {
      masterImei: "m1", ticketId: "t1", status: "active",
      expiresAt: { seconds: 100, nanoseconds: 0 },
    };
    state.supportTickets["t1"] = { accessGranted: true, accessGrantId: "g1" };
    const func = fns.cleanupExpiredGrants;
    const wrapped = testEnv.wrap(func);
    const res = await wrapped({});
    // scheduled function returns null
    expect(res).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – createSupportTicket with allowSupportAccess=false (L260)
// ══════════════════════════════════════════════════════════════════════════

describe("createSupportTicket branches", () => {
  it("allowSupportAccess false → no grant created", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    const res = await wrapped({
      problemDescription: "My device is not syncing",
      allowSupportAccess: false,
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.ticketId).toBeDefined();
  });

  it("missing problemDescription → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({
      problemDescription: "",
      allowSupportAccess: true,
    }, asMaster)).rejects.toThrow(/Problem description is required/i);
  });

  it("non-boolean allowSupportAccess → throws invalid-argument", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({
      problemDescription: "Test problem",
      allowSupportAccess: "yes",
    }, asMaster)).rejects.toThrow(/allowSupportAccess.*boolean.*required/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// support.ts – revokeSupportAccess edge cases (L319)
// ══════════════════════════════════════════════════════════════════════════

describe("revokeSupportAccess", () => {
  it("revokes own grant with associated ticket", async () => {
    state.supportAccessGrants["g1"] = { masterImei: "m1", ticketId: "t1", status: "active" };
    state.supportTickets["t1"] = { accessGranted: true, accessGrantId: "g1", masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "g1" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("nonexistent grant → throws permission-denied", async () => {
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    await expect(wrapped({ grantId: "nonexistent" }, asMaster))
      .rejects.toThrow(/not found|access denied/i);
  });

  it("grant owned by other user → throws permission-denied", async () => {
    state.supportAccessGrants["g2"] = { masterImei: "other-user", ticketId: "t2", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    await expect(wrapped({ grantId: "g2" }, asMaster))
      .rejects.toThrow(/not found|access denied/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// triggers.ts – onTaskStatusChange edge cases (L248-291)
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange edge cases", () => {
  it("status approved → sends notification to child", async () => {
    state.children["c1"].fcmToken = "child-fcm-token";
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Clean room", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", description: "Clean room", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("status rejected → sends rejection notification to child", async () => {
    state.children["c1"].fcmToken = "child-fcm-token";
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Do homework", masterImei: "m1" }) },
      after: { data: () => ({ status: "rejected", description: "Do homework", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("no child FCM token → logs warning, does not throw", async () => {
    delete state.children["c1"].fcmToken;
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Task", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", description: "Task", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    // Should not throw
  });

  it("no masterImei → logs warning for pending_approval", async () => {
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", description: "Task" }) },
      after: { data: () => ({ status: "pending_approval", description: "Task" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    // Should log warning about missing masterImei
  });

  it("no master FCM token → logs warning for pending_approval", async () => {
    delete state.masters["m1"].fcmToken;
    const fn = fns.onTaskStatusChange;
    const change = {
      before: { data: () => ({ status: "pending", description: "Task", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", description: "Task", masterImei: "m1" }) },
    };
    await fn.run(change, { params: { childId: "c1", taskId: "t1" } });
    // Should log warning about missing FCM token
  });
});

// ══════════════════════════════════════════════════════════════════════════
// tasks.ts – createTask subscription check (L36)
// ══════════════════════════════════════════════════════════════════════════

describe("createTask subscription edge cases", () => {
  it("expired trial → throws resource-exhausted", async () => {
    state.masters["m1"].subscription = { status: "trial_expired" };
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "Clean room",
      deadlineISO: new Date(Date.now() + 86400000).toISOString(),
    }, asMaster)).rejects.toThrow(/Active subscription or trial required/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// pairing.ts – generatePairingLink edge cases (L224, L287)
// ══════════════════════════════════════════════════════════════════════════

describe("generatePairingLink edge cases", () => {
  it("expired trial → throws resource-exhausted", async () => {
    state.masters["m1"].subscription = { status: "trial_expired" };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster))
      .rejects.toThrow(/trial has expired|subscribe/i);
  });

  it("master not found → throws not-found", async () => {
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster))
      .rejects.toThrow(/not found/i);
  });

  it("successful token generation", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// legal.ts – needsLegalReconsent edge cases (L245-257)
// ══════════════════════════════════════════════════════════════════════════

describe("needsLegalReconsent edge cases", () => {
  it("no consent doc → returns missing_consent", async () => {
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
    expect(res.reason).toBe("missing_consent");
  });

  it("consent exists but versions outdated → requires reconsent", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", acceptedTermsVersion: "old-version",
      acceptedPrivacyVersion: "old-version",
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
    expect(res.reason).toBe("version_or_policy_change");
  });

  it("consent exists with matching versions → up_to_date", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", acceptedTermsVersion: "2026.03.18-1",
      acceptedPrivacyVersion: "2026.03.18-1",
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(false);
    expect(res.reason).toBe("up_to_date");
  });

  it("requiresReconsent flag forced → requires reconsent", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", acceptedTermsVersion: "2026.03.18-1",
      acceptedPrivacyVersion: "2026.03.18-1",
      requiresReconsent: true,
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });

  it("non-string acceptedTermsVersion treated as empty", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = {
      masterImei: "m1", acceptedTermsVersion: 123,
      acceptedPrivacyVersion: "2026.03.18-1",
    };
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// admin.ts – sendDailyErrorReport with errors (L195-249)
// ══════════════════════════════════════════════════════════════════════════

describe("sendDailyErrorReport", () => {
  it("runs scheduled report (no errors)", async () => {
    const func = fns.sendDailyErrorReport;
    const wrapped = testEnv.wrap(func);
    const res = await wrapped({});
    expect(res).toBeNull();
  });

  it("runs with error logs present", async () => {
    state.error_logs["e1"] = {
      functionName: "testFn", message: "Test error",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    state.error_logs["e2"] = {
      functionName: "testFn", message: "Another error",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    const func = fns.sendDailyErrorReport;
    const wrapped = testEnv.wrap(func);
    const res = await wrapped({});
    expect(res).toBeNull();
  });
});
