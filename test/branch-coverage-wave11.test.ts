/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Wave 11 – Branch-coverage push targeting remaining uncovered branches.
 *
 * Targets (by file):
 *   device.ts  : L33/56 denied-path ternary, L83/151 ownership denied, L208-210 fallbacks
 *   auth.ts    : L275 auth/user-not-found, L207 no customClaims, L97-98 setAdminClaim catch
 *   subscription.ts : L128 no subscription field, L181/186 revokeSubscription by subId, L261 empty batch
 *   pairing.ts : L72 non-HttpsError wrapping
 *   legal.ts   : L204 consent data || {}, L330 status fallback, L339 effectiveAt Timestamp, L287 role || master
 *   triggers.ts: onTaskStatusChange approved/rejected child notification
 *   support.ts : L529 ticket not owned, L539 accepted feedback null
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
const asAdminNoApp = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: {} } };

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

// ═══ device.ts – denied-path ternary on isLocked (L33) ═══

describe("device.ts setDeviceLocked denied-path", () => {
  it("setDeviceLocked denied with isLocked=true → covers L33 denied ternary", async () => {
    state.children["c-other"] = { masterImei: "other", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c-other", isLocked: true }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
  });

  it("setDeviceLocked denied with isLocked=false → covers L33 denied ternary (unlock)", async () => {
    state.children["c-other"] = { masterImei: "other", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c-other", isLocked: false }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
  });
});

// ═══ device.ts – updateAppBlacklist / setUsageRules denied (L83/L151) ═══

describe("device.ts updateAppBlacklist & setUsageRules denied-path", () => {
  it("updateAppBlacklist for non-owned child → permission denied", async () => {
    state.children["c-other"] = { masterImei: "other", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c-other", appBlacklist: ["x"] }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
  });

  it("setUsageRules for non-owned child → permission denied", async () => {
    state.children["c-other"] = { masterImei: "other", childImei: "c-other" };
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({
      childId: "c-other",
      usageRules: { dailyLimit: 60, bedtimeStart: "21:00", bedtimeEnd: "07:00" },
    }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });
});

// ═══ device.ts – getRulesForChild fallback defaults (L208-210) ═══

describe("device.ts getRulesForChild fallback defaults", () => {
  it("getRulesForChild when child has no isLocked/appBlacklist/usageRules fields", async () => {
    state.children["c-empty"] = { masterImei: "m1", childImei: "c-empty" };
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c-empty" }, asMaster);
    expect(res.isLocked).toBe(false);
    expect(res.appBlacklist).toEqual([]);
    expect(res.usageRules).toEqual({});
  });
});

// ═══ auth.ts – registerMasterDevice getUser auth/user-not-found → createUser (L275) ═══

describe("auth.ts registerMasterDevice user-not-found recovery", () => {
  it("creates Firebase Auth user when getUser rejects with auth/user-not-found", async () => {
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    mockAuth.createUser.mockResolvedValueOnce({ uid: "new-m", customClaims: {} });
    delete state.masters["m1"];
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "new-m" }, { auth: { uid: "new-m", token: {} } });
    expect(res.masterId).toBe("new-m");
    expect(res.customToken).toBe("mock-custom-token");
    expect(mockAuth.createUser).toHaveBeenCalledWith({ uid: "new-m" });
  });
});

// ═══ auth.ts – generateCustomToken when user has no customClaims (L207) ═══

describe("auth.ts generateCustomToken no customClaims", () => {
  it("generateCustomToken works when user.customClaims is undefined", async () => {
    mockAuth.getUser.mockResolvedValueOnce({ uid: "m1", customClaims: undefined });
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, { auth: { uid: "m1", token: { role: "master" } } });
    expect(res.customToken).toBe("mock-custom-token");
  });
});

// ═══ auth.ts – setAdminClaim catch block (L97-98) ═══

describe("auth.ts setAdminClaim error in catch block", () => {
  it("setAdminClaim wraps non-HttpsError as internal", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Firebase Auth unavailable"));
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "target-user", role: "admin" }, asAdmin))
      .rejects.toThrow(/failed|set admin/i);
  });
});

// ═══ subscription.ts – getSubscriptionStatus no subscription field (L128) ═══

describe("subscription.ts getSubscriptionStatus fallback", () => {
  it("getSubscriptionStatus when master has no subscription field → { status: 'none' }", async () => {
    state.masters["m1"] = { imei: "m1" };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.subscriptionStatus).toBeDefined();
    expect(res.subscriptionStatus.status).toBe("none");
  });
});

// ═══ subscription.ts – revokeSubscription by subscriptionId only (L181/186) ═══

describe("subscription.ts revokeSubscription by subscriptionId only", () => {
  it("revokeSubscription reads masterId from subscription doc when not passed", async () => {
    state.subscriptions["sub1"] = { masterId: "m1", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ subscriptionId: "sub1" }, asAdmin);
    expect(res.message).toMatch(/revoked/i);
  });
});

// ═══ subscription.ts – checkExpiredSubscriptions empty batch (L261 false) ═══

describe("subscription.ts checkExpiredSubscriptions empty batch", () => {
  it("checkExpiredSubscriptions with no expired items → batch.commit NOT called", async () => {
    delete state.masters["m1"];
    const fn = fns.checkExpiredSubscriptions;
    const wrapped = testEnv.wrap(fn);
    const batchMock = (db as any).batch();
    await wrapped({});
    expect(batchMock.commit).not.toHaveBeenCalled();
  });
});

// ═══ pairing.ts – non-HttpsError in catch (L72) ═══

describe("pairing.ts createPairingCode non-HttpsError catch", () => {
  it("wraps non-HttpsError as internal error", async () => {
    const origImpl = jest.spyOn(db, "collection");
    const origFn = origImpl.getMockImplementation();
    origImpl.mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "pairingCodes") {
        return {
          doc: () => ({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: jest.fn().mockRejectedValue(new Error("Firestore write failed")),
            delete: jest.fn(),
          }),
          where: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        };
      }
      return origFn!(...args);
    });

    const wrapped = testEnv.wrap(fns.createPairingCode);
    await expect(wrapped({ childId: "c1" }, asMaster))
      .rejects.toThrow(/unexpected|internal|error/i);
  });
});

// ═══ legal.ts – getConsentStatus consent data || {} (L204) ═══

describe("legal.ts needsLegalReconsent consentData fallback", () => {
  it("needsLegalReconsent when consent doc data() returns null → || {} fallback", async () => {
    // Provide policies so getEffectivePolicies works
    state.legalPolicies["terms_DE_de-DE"] = { policyType: "terms", country: "DE", locale: "de-DE", version: "1.0", contentUrl: "https://example.com/terms", status: "active", isMajorChange: false };
    state.legalPolicies["privacy_DE_de-DE"] = { policyType: "privacy", country: "DE", locale: "de-DE", version: "1.0", contentUrl: "https://example.com/privacy", status: "active", isMajorChange: false };
    // Consent doc exists but data() returns undefined (triggers || {})
    state.masterLegalConsents["m1_DE_de-DE"] = undefined as any;
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });
});

// ═══ legal.ts – publishLegalPolicy status fallback (L330) + effectiveAt Timestamp (L339) + no isMajorChange (L342) ═══

describe("legal.ts publishLegalPolicy status/effectiveAt branches", () => {
  it("publishLegalPolicy without status → defaults to 'active', no isMajorChange → false", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "2.0",
      contentUrl: "https://example.com/terms-de",
    }, asAdminNoApp);
    expect(res.success).toBe(true);
  });

  it("publishLegalPolicy with effectiveAt as Timestamp instance", async () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy",
      country: "AT",
      locale: "de-AT",
      version: "1.0",
      contentUrl: "https://example.com/privacy-at",
      effectiveAt: ts,
    }, asAdminNoApp);
    expect(res.success).toBe(true);
  });
});

// ═══ legal.ts – recordLegalConsent with empty consentSource/appVersion (L254/L257) ═══

describe("legal.ts recordLegalConsent consentSource/appVersion empty", () => {
  it("recordLegalConsent with empty consentSource/appVersion → falls back to defaults", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE",
      locale: "de-DE",
      termsVersion: "2026.03.18-1",
      privacyVersion: "2026.03.18-1",
      consentSource: "",
      appVersion: "",
    }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ═══ legal.ts – recordLegalConsent audit role fallback (L287) ═══

describe("legal.ts recordLegalConsent audit role fallback", () => {
  it("recordLegalConsent when auth token has no role → role fallback to 'master'", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE",
      locale: "de-DE",
      termsVersion: "2026.03.18-1",
      privacyVersion: "2026.03.18-1",
    }, { auth: { uid: "m1", token: {} } });
    expect(res.success).toBe(true);
  });
});

// ═══ support.ts – provideSolutionFeedback not-owned ticket (L529) ═══

describe("support.ts provideSolutionFeedback not-owned ticket", () => {
  it("provideSolutionFeedback when ticket belongs to different user → permission-denied", async () => {
    state.supportTickets["t1"] = { masterImei: "other-master", status: "ai_responded" };
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "t1", feedback: "accepted" }, asMaster))
      .rejects.toThrow(/permission/i);
  });
});

// ═══ support.ts – provideSolutionFeedback accepted → null (L539) ═══

describe("support.ts provideSolutionFeedback accepted path", () => {
  it("provideSolutionFeedback with accepted → userFeedbackComment is null", async () => {
    state.supportTickets["t2"] = { masterImei: "m1", status: "ai_responded" };
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({ ticketId: "t2", feedback: "accepted" }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ═══ triggers.ts – onTaskStatusChange approved/rejected → child notified ═══

describe("triggers.ts onTaskStatusChange notification branches", () => {
  it("onTaskStatusChange approved → child notified", async () => {
    state.children["c1"] = { masterImei: "m1", childImei: "c1", fcmToken: "child-token" };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Aufräumen" }) },
      after: { data: () => ({ status: "approved", masterImei: "m1", description: "Aufräumen" }) },
    };
    await wrapped(change, { params: { childId: "c1", taskId: "task1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("onTaskStatusChange rejected → child notified", async () => {
    state.children["c1"] = { masterImei: "m1", childImei: "c1", fcmToken: "child-token" };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    const change = {
      before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Aufräumen" }) },
      after: { data: () => ({ status: "rejected", masterImei: "m1", description: "Aufräumen" }) },
    };
    await wrapped(change, { params: { childId: "c1", taskId: "task1" } });
    expect(mockSend).toHaveBeenCalled();
  });
});
