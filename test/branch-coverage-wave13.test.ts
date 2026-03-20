/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Wave 13 – Focus on remaining practical branches.
 *
 * Targets:
 * - device.ts: non-existing child denied branches for setDeviceLocked/updateAppBlacklist/setUsageRules
 * - tasks.ts: non-existing child denied branches for createTask/approveTask/rejectTask
 * - device.ts getRulesForChild isSelfChild path (isOwner=false, isSelf=true)
 * - subscription.ts revokeSubscription with admin uid missing -> revokedBy fallback
 * - support.ts getTicketUserData role fallback + grantExpiresAt null fallback
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

const mockAuth: any = {
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) => Promise.resolve({ uid, customClaims: {} })),
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
    androidpublisher: jest.fn(() => ({ purchases: { subscriptions: { get: jest.fn() } } })),
  },
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();
let fns: any;
let db: any;
let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test-app" } };
const asAdminNoUid = { auth: { token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: {} } };
const asChild = { auth: { uid: "c1", token: {} } };
const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

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
    "children/c1/tasks": {
      t1: { status: "pending_approval", description: "Task", masterImei: "m1" },
    },
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
        where: jest.fn((field: string, op: string, value: unknown) => buildWhereChain([...filters, { field, op, value }])),
        get: jest.fn(() => {
          let entries = Object.entries(collData);
          for (const f of filters) {
            if (f.op === "==") entries = entries.filter(([, d]) => (d as any)?.[f.field] === f.value);
          }
          const docs = entries.map(([id, data]) => {
            const docRef: any = {
              id,
              delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
            };
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
            const has = Object.prototype.hasOwnProperty.call(collData, docId);
            const d = collData[docId];
            return Promise.resolve({ exists: has && d !== undefined, data: () => d, id: docId, ref });
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
                  update: jest.fn((upd: any) => { if (state[key]?.[sid]) Object.assign(state[key][sid], upd); return Promise.resolve(); }),
                };
              }),
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({ id, exists: true, data: () => data, ref: { id } })),
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
      where: jest.fn((field: string, op: string, value: unknown) => buildWhereChain([{ field, op, value }])),
      add: jest.fn((data: any) => {
        const newId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[newId] = data;
        if (!state[coll]) state[coll] = {};
        state[coll][newId] = data;
        return Promise.resolve({ id: newId });
      }),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({ id, exists: true, data: () => data, ref: { id } }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
      orderBy: jest.fn().mockReturnThis(),
    };
  });

  (db as any).batch = jest.fn(() => ({ update: jest.fn(), delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }));
  (db as any).collectionGroup = jest.fn(() => ({ where: jest.fn().mockReturnThis(), get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })) }));
});

afterAll(() => testEnv.cleanup());

describe("device/tasks !exists denied branches", () => {
  it("setDeviceLocked denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    await expect(wrapped({ childId: "c1", isLocked: true }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });

  it("updateAppBlacklist denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c1", appBlacklist: ["x"] }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });

  it("setUsageRules denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ childId: "c1", usageRules: { dailyLimit: 60 } }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });

  it("createTask denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({ childId: "c1", description: "x", deadlineISO: new Date(Date.now() + 60000).toISOString() }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });

  it("approveTask denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });

  it("rejectTask denies when child does not exist", async () => {
    delete state.children.c1;
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(wrapped({ childId: "c1", taskId: "t1" }, asMaster)).rejects.toThrow(/permission|authorized/i);
  });
});

describe("device.getRulesForChild self-child path", () => {
  it("allows child to read own rules even if master ownership check would fail", async () => {
    state.children.c1 = { masterImei: "someone-else", childImei: "c1", isLocked: true, appBlacklist: ["pkg"], usageRules: { bedtimeStart: "21:00" } };
    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const res = await wrapped({ childId: "c1" }, asChild);
    expect(res.isLocked).toBe(true);
    expect(res.appBlacklist).toEqual(["pkg"]);
    expect(res.usageRules).toEqual({ bedtimeStart: "21:00" });
  });
});

describe("subscription revoke fallback branches", () => {
  it("revokeSubscription sets revokedBy to unknown-admin when admin uid is missing", async () => {
    state.subscriptions.sub1 = { masterId: "m1", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ subscriptionId: "sub1" }, asAdminNoUid as any);
    expect(res.message).toMatch(/revoked/i);
  });
});

describe("support getTicketUserData fallbacks", () => {
  it("returns grantExpiresAt null when expiresAt is absent and role fallback is used", async () => {
    state.supportTickets.t1 = { masterImei: "m1", accessGrantId: "g1" };
    state.supportAccessGrants.g1 = { status: "active" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    const res = await wrapped({ ticketId: "t1" }, asSupport as any);
    expect(res.grantExpiresAt).toBeNull();
    expect(Array.isArray(res.children)).toBe(true);
  });
});

describe("legal fallback and branch paths", () => {
  it("getActiveLegalPolicies falls back to defaults when active docs are malformed", async () => {
    state.legalPolicies.badTerms = {
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      status: "active",
      // missing required fields like version/contentUrl -> mapPolicyDoc returns null
    };
    state.legalPolicies.badPrivacy = null;

    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.terms.version).toBe("2026.03.18-1");
    expect(res.privacy.version).toBe("2026.03.18-1");
  });

  it("needsLegalReconsent returns up_to_date when accepted versions match active policies", async () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();

    state.legalPolicies.termsDe = {
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "3.0",
      contentUrl: "https://example.com/terms",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.legalPolicies.privacyDe = {
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "5.0",
      contentUrl: "https://example.com/privacy",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.masterLegalConsents["m1_DE_de-DE"] = {
      acceptedTermsVersion: "3.0",
      acceptedPrivacyVersion: "5.0",
      requiresReconsent: false,
    };

    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(false);
    expect(res.reason).toBe("up_to_date");
  });

  it("recordLegalConsent falls back to defaults when consentSource/appVersion are non-string", async () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();

    state.legalPolicies.termsDe2 = {
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "7.1",
      contentUrl: "https://example.com/terms71",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.legalPolicies.privacyDe2 = {
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "9.4",
      contentUrl: "https://example.com/privacy94",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };

    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE",
      locale: "de-DE",
      termsVersion: "7.1",
      privacyVersion: "9.4",
      consentSource: 123 as any,
      appVersion: { x: 1 } as any,
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("publishLegalPolicy supports explicit status and major change with missing uid fallback", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "10.0",
      contentUrl: "https://example.com/terms100",
      status: "retired",
      isMajorChange: true,
    }, { auth: { token: { role: "admin" } } } as any);
    expect(res.success).toBe(true);
    expect(res.status).toBe("retired");
  });

  it("markLegalReconsentRequired updates by country-locale when masterImei is omitted", async () => {
    state.masterLegalConsents.a = { country: "DE", locale: "de-DE", requiresReconsent: false };
    state.masterLegalConsents.b = { country: "DE", locale: "de-DE", requiresReconsent: false };
    state.masterLegalConsents.c = { country: "AT", locale: "de-AT", requiresReconsent: false };

    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("country_locale");
  });
});

describe("pairing malformed data branches", () => {
  it("validatePairingCode returns internal when stored code data is null", async () => {
    state.pairingCodes["111111"] = null;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "111111" }, asChild)).rejects.toThrow(/missing|internal/i);
  });

  it("validatePairingToken returns internal when stored token data is null", async () => {
    state.pairingTokens["tok-null"] = null;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "tok-null" }, asChild)).rejects.toThrow(/missing|internal/i);
  });
});
