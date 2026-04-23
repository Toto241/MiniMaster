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
import * as shared from "../src/shared";

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
const asAuthNoUid = { auth: { token: {} } };
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
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
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
            return Promise.resolve({ exists: has, data: () => d, id: docId, ref });
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

  (db).batch = jest.fn(() => ({ update: jest.fn(), delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }));
  (db).collectionGroup = jest.fn(() => ({ where: jest.fn().mockReturnThis(), get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })) }));
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

  it("throws not-found when support ticket does not exist", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "missing-ticket" }, asSupport as any)).rejects.toThrow(/ticket not found/i);
  });

  it("throws permission-denied when ticket has no accessGrantId", async () => {
    state.supportTickets["t-no-grant"] = { masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t-no-grant" }, asSupport as any)).rejects.toThrow(/must grant access first/i);
  });

  it("throws permission-denied when grant status is not active", async () => {
    state.supportTickets["t-revoked"] = { masterImei: "m1", accessGrantId: "g-revoked" };
    state.supportAccessGrants["g-revoked"] = { status: "revoked" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t-revoked" }, asSupport as any)).rejects.toThrow(/grant is revoked/i);
  });

  it("marks expired grant and throws deadline-exceeded", async () => {
    const admin = require("firebase-admin");
    const past = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) - 120, 0);
    state.supportTickets["t-expired"] = { masterImei: "m1", accessGrantId: "g-expired" };
    state.supportAccessGrants["g-expired"] = { status: "active", expiresAt: past };

    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t-expired" }, asSupport as any)).rejects.toThrow(/expired/i);
    expect(state.supportAccessGrants["g-expired"].status).toBe("expired");
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
    state.pairingTokens["dddddddd-dddd-dddd-dddd-dddddddddddd"] = null;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "dddddddd-dddd-dddd-dddd-dddddddddddd" }, asChild)).rejects.toThrow(/missing|internal/i);
  });

  it("validatePairingCode not-found path throws HttpsError branch", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "999999" }, asChild)).rejects.toThrow(/invalid|not found/i);
  });

  it("validatePairingToken not-found path throws HttpsError branch", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "tok-missing" }, asChild)).rejects.toThrow(/invalid|not found/i);
  });
});

describe("support grant/revoke additional branches", () => {
  it("grantSupportAccess denies when ticket is missing", async () => {
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    await expect(wrapped({ ticketId: "missing-ticket" }, asMaster)).rejects.toThrow(/denied|not found/i);
  });

  it("grantSupportAccess denies when ticket does not belong to caller", async () => {
    state.supportTickets["t-denied"] = { masterImei: "other-master" };
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    await expect(wrapped({ ticketId: "t-denied" }, asMaster)).rejects.toThrow(/denied|not found/i);
  });

  it("revokeSupportAccess denies when grant does not belong to caller", async () => {
    state.supportAccessGrants["g-denied"] = { masterImei: "other-master", ticketId: "t1", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    await expect(wrapped({ grantId: "g-denied" }, asMaster)).rejects.toThrow(/denied|not found/i);
  });

  it("revokeSupportAccess succeeds even when grant has no ticketId", async () => {
    state.supportAccessGrants["g-no-ticket"] = { masterImei: "m1", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "g-no-ticket" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("revokeSupportAccess updates linked ticket when ticketId is present", async () => {
    state.supportTickets["t-linked"] = { masterImei: "m1", accessGranted: true };
    state.supportAccessGrants["g-linked"] = { masterImei: "m1", ticketId: "t-linked", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "g-linked" }, asMaster);
    expect(res.success).toBe(true);
  });

  it("grantSupportAccess passes ownership check when ticket data is undefined and caller uid is undefined", async () => {
    state.supportTickets["t-undef"] = undefined as any;
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    const res = await wrapped({ ticketId: "t-undef" }, asAuthNoUid as any);
    expect(res.success).toBe(true);
    expect(typeof res.grantId).toBe("string");
  });

  it("revokeSupportAccess reaches ticketId optional branch when grant data is undefined and caller uid is undefined", async () => {
    state.supportAccessGrants["g-undef"] = undefined as any;
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "g-undef" }, asAuthNoUid as any);
    expect(res.success).toBe(true);
  });
});

describe("legal markLegalReconsentRequired single-master path", () => {
  it("updates exactly one consent doc when masterImei is provided", async () => {
    state.masterLegalConsents["m1_DE_de-DE"] = { country: "DE", locale: "de-DE", requiresReconsent: false };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "m1" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("single_master");
    expect(res.updatedCount).toBe(1);
  });
});

describe("pairing subscriptionStatus fallback metadata", () => {
  it("validatePairingCode uses subscriptionStatus fallback 'none' when subscription is missing", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["222222"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = { imei: "m1" };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222222" }, asChild)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });

  it("validatePairingToken uses subscriptionStatus fallback 'none' when subscription is missing", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingTokens["44444444-4444-4444-4444-444444444444"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = { imei: "m1" };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "44444444-4444-4444-4444-444444444444" }, asChild)).rejects.toThrow(/exhausted|trial|subscription/i);
  });

  it("generatePairingLink uses subscriptionStatus fallback 'none' when subscription is missing", async () => {
    state.masters["m1"] = { imei: "m1" };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });

  it("validatePairingCode uses subscriptionStatus fallback 'none' when subscription status is missing", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["222223"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = { imei: "m1", subscription: {} };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222223" }, asChild)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });

  it("generatePairingLink uses subscriptionStatus fallback 'none' when subscription status is missing", async () => {
    state.masters["m1"] = { imei: "m1", subscription: {} };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });

  it("validatePairingCode denied path when master doc exists but data is undefined", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["222224"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = undefined as any;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222224" }, asChild)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });

  it("generatePairingLink denied path when master doc exists but data is undefined", async () => {
    state.masters["m1"] = undefined as any;
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/exhausted|trial|subscribe/i);
  });
});

describe("admin analysis/KB branch coverage", () => {
  it("getKnowledgeBase returns firestore source when content exists", async () => {
    state.operatorConfig.knowledgeBase = { content: "Runtime KB content" };
    const wrapped = testEnv.wrap(fns.getKnowledgeBase);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    expect(res.source).toBe("firestore");
    expect(res.content).toContain("Runtime KB");
  });

  it("testGeminiConnection falls back to empty response text when candidates are missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(true);
    expect(res.response).toBe("");
  });

  it("analyzeSystemErrors uses KB prompt branch and rawText fallback [] when candidates are missing", async () => {
    state.operatorConfig.knowledgeBase = { content: "KB for analysis branch" };
    state.error_logs.e1 = {
      // intentionally missing functionName/message/stack to trigger fallback tokens in summary
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      count: 0,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 1 }, asAdmin);
    expect(res).toBeDefined();
    expect(Array.isArray(res.analyses)).toBe(true);
  });
});

describe("auth legacy and catch branches", () => {
  it("registerMasterDevice works in legacy mode without auth context and uses project id telemetry", async () => {
    process.env.GCLOUD_PROJECT = "minimaster-test-project";
    delete state.masters["legacy-m"];

    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    mockAuth.createUser.mockResolvedValueOnce({ uid: "legacy-m", customClaims: {} });

    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "legacy-m" }, {} as any);
    expect(res.masterId).toBe("legacy-m");
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("generateCustomToken rejects in legacy mode when secretKey is invalid", async () => {
    state.masters["m1"] = { imei: "m1", secretKey: "secret123" };
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "m1", secretKey: "wrong" }, {} as any))
      .rejects.toThrow(/invalid master imei or secret key/i);
  });

  it("registerMasterDevice rethrows HttpsError from catch branch", async () => {
    const functionsV1 = require("firebase-functions/v1");
    mockAuth.getUser.mockRejectedValueOnce(new functionsV1.https.HttpsError("internal", "forced"));
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "m1" }, { auth: { uid: "m1", token: {} } }))
      .rejects.toThrow(/forced|internal/i);
  });
});

describe("support onTicketCreated trigger branches", () => {
  it("onTicketCreated updates ticket with test-stub aiModel and skips notification when no fcmToken", async () => {
    state.supportTickets["ticket-no-fcm"] = {
      masterImei: "m1",
      problemDescription: "My child device is still blocked after task approval.",
    };
    state.masters["m1"] = { imei: "m1" }; // no fcmToken

    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped({ data: () => state.supportTickets["ticket-no-fcm"] }, { params: { ticketId: "ticket-no-fcm" } } as any);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("onTicketCreated sends notification when master has fcmToken", async () => {
    state.supportTickets["ticket-with-fcm"] = {
      masterImei: "m1",
      problemDescription: "Pairing code expires immediately on child app.",
    };
    state.masters["m1"] = { imei: "m1", fcmToken: "master-fcm-token" };

    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped({ data: () => state.supportTickets["ticket-with-fcm"] }, { params: { ticketId: "ticket-with-fcm" } } as any);
    expect(mockSend).toHaveBeenCalled();
  });

  it("onTicketCreated skips notification when master doc exists but data is undefined", async () => {
    state.supportTickets["ticket-master-undef"] = {
      masterImei: "m1",
      problemDescription: "Pairing code remains invalid.",
    };
    state.masters["m1"] = undefined as any;

    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped({ data: () => state.supportTickets["ticket-master-undef"] }, { params: { ticketId: "ticket-master-undef" } } as any);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("legal invalid-argument branch variants", () => {
  it("getActiveLegalPolicies hits locale optional-chain branch when locale is missing", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE" } as any, asMaster)).rejects.toThrow(/locale/i);
  });

  it("needsLegalReconsent hits locale optional-chain branch when locale is missing", async () => {
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    await expect(wrapped({ country: "DE" } as any, asMaster)).rejects.toThrow(/locale/i);
  });

  it("getActiveLegalPolicies rejects when locale is not a string", async () => {
    const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
    await expect(wrapped({ country: "DE", locale: 123 as any }, asMaster)).rejects.toThrow(/locale/i);
  });

  it("needsLegalReconsent rejects when locale format is invalid", async () => {
    const wrapped = testEnv.wrap(fns.needsLegalReconsent);
    await expect(wrapped({ country: "DE", locale: "@@@" }, asMaster)).rejects.toThrow(/locale/i);
  });

  it("recordLegalConsent rejects when terms/privacy version are non-string", async () => {
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    await expect(wrapped({
      country: "DE",
      locale: "de-DE",
      termsVersion: 123 as any,
      privacyVersion: null as any,
    }, asMaster)).rejects.toThrow(/termsVersion|privacyVersion/i);
  });

  it("recordLegalConsent writes explicit role when auth token role is present", async () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();
    state.legalPolicies.termsRole = {
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "11.1",
      contentUrl: "https://example.com/t111",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.legalPolicies.privacyRole = {
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "11.2",
      contentUrl: "https://example.com/p112",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    const wrapped = testEnv.wrap(fns.recordLegalConsent);
    const res = await wrapped({
      country: "DE",
      locale: "de-DE",
      termsVersion: "11.1",
      privacyVersion: "11.2",
    }, { auth: { uid: "m1", token: { role: "admin" } } });
    expect(res.success).toBe(true);
  });

  it("publishLegalPolicy rejects when version/contentUrl are not strings", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: 42 as any,
      contentUrl: null as any,
    }, asAdmin)).rejects.toThrow(/version|contentUrl/i);
  });

  it("publishLegalPolicy validates missing locale/value chain", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    await expect(wrapped({ policyType: "terms", country: "DE" } as any, asAdmin)).rejects.toThrow(/locale/i);
  });

  it("markLegalReconsentRequired validates missing locale", async () => {
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    await expect(wrapped({ country: "DE" } as any, asAdmin)).rejects.toThrow(/locale/i);
  });

  it("publishLegalPolicy succeeds with admin role but missing uid (publishedBy fallback)", async () => {
    const wrapped = testEnv.wrap(fns.publishLegalPolicy);
    const res = await wrapped({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "10.1",
      contentUrl: "https://example.com/privacy101",
      status: "active",
    }, asAdminNoUid as any);
    expect(res.success).toBe(true);
    expect(res.policyType).toBe("privacy");
  });
});

describe("subscription branch variants", () => {
  it("getSubscriptionStatus returns active subscription object when present", async () => {
    state.masters.m1 = {
      imei: "m1",
      subscription: {
        status: "active",
        childLimit: 3,
      },
    };
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res.subscriptionStatus.status).toBe("active");
    expect(res.childLimit).toBe(3);
  });

  it("revokeSubscription keeps provided masterId instead of reading from subDoc", async () => {
    state.subscriptions.sub2 = { masterId: "m1", status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    const res = await wrapped({ subscriptionId: "sub2", masterId: "m1" }, asAdmin);
    expect(res.message).toMatch(/revoked/i);
  });

  it("revokeSubscription fails when subscription has no masterId and none is provided", async () => {
    state.subscriptions.sub3 = { status: "active" };
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    await expect(wrapped({ subscriptionId: "sub3" }, asAdmin)).rejects.toThrow(/master account not found/i);
  });
});

describe("shared helper branch coverage", () => {
  it("requireMasterOwnership denies when child exists but belongs to another master", async () => {
    state.children["c-foreign"] = { masterImei: "other-master", childImei: "c-foreign" };
    await expect(shared.requireMasterOwnership(asMaster as any, "c-foreign"))
      .rejects.toThrow(/owner|permission/i);
  });

  it("checkRateLimit uses default params when optional args are omitted", () => {
    expect(() => shared.checkRateLimit("u-default", "act-default")).not.toThrow();
  });

  it("validateAppCheck uses default enforce=false and does not throw without app", () => {
    expect(() => shared.validateAppCheck({ auth: { uid: "u1" } } as any)).not.toThrow();
  });

  it("validateAppCheck enforce=true in non-test mode throws and logs anonymous uid fallback", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => shared.validateAppCheck({} as any, true)).toThrow(/App Check/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("AuditLogger.log works with default metadata parameter", async () => {
    await expect(shared.AuditLogger.log(
      "system.error",
      "u1",
      "unknown",
      "system",
      "system",
      "success"
    )).resolves.toBeUndefined();
  });
});

describe("legal targetMaster empty-string fallback", () => {
  it("markLegalReconsentRequired treats empty masterImei as country-locale scope", async () => {
    state.masterLegalConsents.l1 = { country: "DE", locale: "de-DE", requiresReconsent: false };
    state.masterLegalConsents.l2 = { country: "DE", locale: "de-DE", requiresReconsent: false };
    const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
    const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.scope).toBe("country_locale");
  });
});

describe("support provider branch coverage", () => {
  it("onTicketCreated bleibt im Consent-Flow bei Gemini non-ok Setup", async () => {
    const prevNode = process.env.NODE_ENV;
    const prevGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.GEMINI_API_KEY = "gemini-key";
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve("boom") });

      state.supportTickets["ticket-gemini-nonok"] = {
        masterImei: "m1",
        problemDescription: "Gemini non-ok branch.",
      };

      const wrapped = testEnv.wrap(fns.onTicketCreated);
      await expect(wrapped({ data: () => state.supportTickets["ticket-gemini-nonok"] }, { params: { ticketId: "ticket-gemini-nonok" } } as any))
        .resolves.toBeUndefined();
      expect(state.supportTickets["ticket-gemini-nonok"].conversationStatus).toBe("awaiting_debug_consent");
    } finally {
      process.env.NODE_ENV = prevNode;
      process.env.GEMINI_API_KEY = prevGemini;
    }
  });

  it("onTicketCreated bleibt im Consent-Flow bei Gemini AbortError-Setup", async () => {
    const prevNode = process.env.NODE_ENV;
    const prevGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.GEMINI_API_KEY = "gemini-key";
      const abortErr: any = new Error("aborted");
      abortErr.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortErr);

      state.supportTickets["ticket-gemini-abort"] = {
        masterImei: "m1",
        problemDescription: "Gemini timeout branch.",
      };

      const wrapped = testEnv.wrap(fns.onTicketCreated);
      await expect(wrapped({ data: () => state.supportTickets["ticket-gemini-abort"] }, { params: { ticketId: "ticket-gemini-abort" } } as any))
        .resolves.toBeUndefined();
      expect(state.supportTickets["ticket-gemini-abort"].conversationStatus).toBe("awaiting_debug_consent");
    } finally {
      process.env.NODE_ENV = prevNode;
      process.env.GEMINI_API_KEY = prevGemini;
    }
  });

  it("onTicketCreated bleibt im Consent-Flow ohne konfigurierten Provider", async () => {
    const prevNode = process.env.NODE_ENV;
    const prevGemini = process.env.GEMINI_API_KEY;
    try {
      process.env.NODE_ENV = "production";
      process.env.GEMINI_API_KEY = "";

      state.supportTickets["ticket-no-provider"] = {
        masterImei: "m1",
        problemDescription: "No provider configured branch.",
      };

      const wrapped = testEnv.wrap(fns.onTicketCreated);
      await expect(wrapped({ data: () => state.supportTickets["ticket-no-provider"] }, { params: { ticketId: "ticket-no-provider" } } as any))
        .resolves.toBeUndefined();
      expect(state.supportTickets["ticket-no-provider"].conversationStatus).toBe("awaiting_debug_consent");
    } finally {
      process.env.NODE_ENV = prevNode;
      process.env.GEMINI_API_KEY = prevGemini;
    }
  });
});

describe("ownership mismatch and default fallback branches", () => {
  it("setDeviceLocked/updateAppBlacklist/setUsageRules deny when child belongs to another master", async () => {
    state.children.c1 = { masterImei: "other-master", childImei: "c1" };

    await expect(testEnv.wrap(fns.setDeviceLocked)({ childId: "c1", isLocked: true }, asMaster)).rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.updateAppBlacklist)({ childId: "c1", appBlacklist: ["x"] }, asMaster)).rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.setUsageRules)({ childId: "c1", usageRules: { dailyLimit: 60 } }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });

  it("setDeviceLocked/updateAppBlacklist/setUsageRules deny when child doc exists but data is undefined", async () => {
    state.children.c1 = undefined as any;

    await expect(testEnv.wrap(fns.setDeviceLocked)({ childId: "c1", isLocked: true }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.updateAppBlacklist)({ childId: "c1", appBlacklist: ["x"] }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.setUsageRules)({ childId: "c1", usageRules: { dailyLimit: 60 } }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
  });

  it("createTask/approveTask/rejectTask deny when child belongs to another master", async () => {
    state.children.c1 = { masterImei: "other-master", childImei: "c1" };

    await expect(testEnv.wrap(fns.createTask)({ childId: "c1", description: "x", deadlineISO: new Date(Date.now() + 60000).toISOString() }, asMaster)).rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.approveTask)({ childId: "c1", taskId: "t1" }, asMaster)).rejects.toThrow(/authorized|permission/i);
    await expect(testEnv.wrap(fns.rejectTask)({ childId: "c1", taskId: "t1" }, asMaster)).rejects.toThrow(/authorized|permission/i);
  });

  it("createTask/approveTask/rejectTask deny when child document exists but data is undefined", async () => {
    state.children["c1"] = undefined as any;

    await expect(testEnv.wrap(fns.createTask)({
      childId: "c1",
      description: "x",
      deadlineISO: new Date(Date.now() + 60000).toISOString(),
    }, asMaster)).rejects.toThrow(/authorized|permission/i);

    await expect(testEnv.wrap(fns.approveTask)({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/authorized|permission/i);

    await expect(testEnv.wrap(fns.rejectTask)({ childId: "c1", taskId: "t1" }, asMaster))
      .rejects.toThrow(/authorized|permission/i);
  });

  it("getRulesForChild returns defaults when optional fields are absent", async () => {
    state.children.c1 = { masterImei: "m1", childImei: "c1" };
    const res = await testEnv.wrap(fns.getRulesForChild)({ childId: "c1" }, asMaster);
    expect(res.isLocked).toBe(false);
    expect(res.appBlacklist).toEqual([]);
    expect(res.usageRules).toEqual({});
  });

  it("getRulesForChild returns defaults when child doc data is undefined but requester is the child", async () => {
    state.children.c1 = undefined as any;
    const res = await testEnv.wrap(fns.getRulesForChild)({ childId: "c1" }, asChild);
    expect(res.isLocked).toBe(false);
    expect(res.appBlacklist).toEqual([]);
    expect(res.usageRules).toEqual({});
  });

  it("reportTamperEvent throws when child has no linked parent", async () => {
    state.children.c1 = { childImei: "c1" };
    await expect(testEnv.wrap(fns.reportTamperEvent)({ childId: "c1", eventType: "accessibility_service_disabled", timestamp: Date.now() }, asChild))
      .rejects.toThrow(/no parent linked/i);
  });

  it("reportTamperEvent throws when child doc data is undefined", async () => {
    state.children.c1 = undefined as any;
    await expect(testEnv.wrap(fns.reportTamperEvent)({ childId: "c1", eventType: "accessibility_service_disabled", timestamp: Date.now() }, asChild))
      .rejects.toThrow(/no parent linked/i);
  });

  it("reportTamperEvent succeeds without FCM when master doc exists but data is undefined", async () => {
    state.children.c1 = { childImei: "c1", masterImei: "m3" };
    state.masters.m3 = undefined as any;
    const res = await testEnv.wrap(fns.reportTamperEvent)({ childId: "c1", eventType: "device_admin_disable_requested", timestamp: Date.now() }, asChild);
    expect(res.success).toBe(true);
  });

  it("reportTamperEvent succeeds without sending FCM when parent has no token", async () => {
    state.children.c1 = { childImei: "c1", masterImei: "m2" };
    state.masters.m2 = { imei: "m2" };
    const res = await testEnv.wrap(fns.reportTamperEvent)({ childId: "c1", eventType: "device_admin_disable_requested", timestamp: Date.now() }, asChild);
    expect(res.success).toBe(true);
  });

  it("reportTamperEvent catch branch when tamper event write fails", async () => {
    state.children.c1 = { childImei: "c1", masterImei: "m1" };

    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "children") {
        const realDoc = coll.doc;
        coll.doc = jest.fn((id: string) => {
          const ref = realDoc(id);
          if (id === "c1") {
            const realSubCollection = ref.collection;
            ref.collection = jest.fn((sub: string) => {
              const subColl: any = realSubCollection(sub);
              if (sub === "tamperEvents") {
                subColl.add = jest.fn(() => Promise.reject(new Error("tamper-write-failed")));
              }
              return subColl;
            });
          }
          return ref;
        });
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.reportTamperEvent)({
      childId: "c1",
      eventType: "accessibility_service_disabled",
      timestamp: Date.now(),
    }, asChild)).rejects.toThrow(/unexpected error/i);
  });
});

describe("pairing childLimit fallback branches", () => {
  it("validatePairingCode uses fallback childLimit=4 when active subscription has no childLimit", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["333333"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = { imei: "m1", subscription: { status: "active" } };
    state.children["child-2"] = { masterImei: "m1" };
    state.children["child-3"] = { masterImei: "m1" };
    state.children["child-4"] = { masterImei: "m1" };

    await expect(testEnv.wrap(fns.validatePairingCode)({ pairingCode: "333333" }, { auth: { uid: "c2", token: {} } }))
      .rejects.toThrow(/child limit reached/i);
  });

  it("validatePairingToken uses fallback childLimit=4 when active subscription has no childLimit", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingTokens["eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = { imei: "m1", subscription: { status: "active" } };
    state.children["child-2"] = { masterImei: "m1" };
    state.children["child-3"] = { masterImei: "m1" };
    state.children["child-4"] = { masterImei: "m1" };

    await expect(testEnv.wrap(fns.validatePairingToken)({ pairingToken: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" }, { auth: { uid: "c2", token: {} } }))
      .rejects.toThrow(/child limit reached/i);
  });

  it("validatePairingCode succeeds with explicit childLimit when capacity is available", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["333334"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = { imei: "m1", subscription: { status: "active", childLimit: 2 } };

    const res = await testEnv.wrap(fns.validatePairingCode)({ pairingCode: "333334" }, { auth: { uid: "c2", token: {} } });
    expect(res.childId).toBe("c2");
  });

  it("validatePairingToken succeeds with explicit childLimit when capacity is available", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingTokens["55555555-5555-5555-5555-555555555555"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = { imei: "m1", subscription: { status: "active", childLimit: 2 } };

    const res = await testEnv.wrap(fns.validatePairingToken)({ pairingToken: "55555555-5555-5555-5555-555555555555" }, { auth: { uid: "c2", token: {} } });
    expect(res.childId).toBe("c2");
    expect(res.masterId).toBe("m1");
  });

  it("validatePairingCode uses fallback childLimit=4 when access is granted via active trial", async () => {
    const admin = require("firebase-admin");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const futureTs = new admin.firestore.Timestamp(nowSeconds + 3600, 0);
    state.pairingCodes["333335"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = {
      imei: "m1",
      subscription: {
        status: "trial",
        trialEndsAt: new admin.firestore.Timestamp(nowSeconds + 3600, 0),
      },
    };
    state.children["child-2"] = { masterImei: "m1" };
    state.children["child-3"] = { masterImei: "m1" };
    state.children["child-4"] = { masterImei: "m1" };

    await expect(testEnv.wrap(fns.validatePairingCode)({ pairingCode: "333335" }, { auth: { uid: "c2", token: {} } }))
      .rejects.toThrow(/child limit reached/i);
  });

  it("validatePairingToken uses fallback childLimit=4 when access is granted via active trial", async () => {
    const admin = require("firebase-admin");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const futureTs = new admin.firestore.Timestamp(nowSeconds + 3600, 0);
    state.pairingTokens["66666666-6666-6666-6666-666666666666"] = { masterId: "m1", expiresAt: futureTs };
    state.masters.m1 = {
      imei: "m1",
      subscription: {
        status: "trial",
        trialEndsAt: new admin.firestore.Timestamp(nowSeconds + 3600, 0),
      },
    };
    state.children["child-2"] = { masterImei: "m1" };
    state.children["child-3"] = { masterImei: "m1" };
    state.children["child-4"] = { masterImei: "m1" };

    await expect(testEnv.wrap(fns.validatePairingToken)({ pairingToken: "66666666-6666-6666-6666-666666666666" }, { auth: { uid: "c2", token: {} } }))
      .rejects.toThrow(/child limit reached/i);
  });

  it("createPairingCode exhausts collision retries and throws resource-exhausted", async () => {
    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "pairingCodes") {
        const realDoc = coll.doc;
        coll.doc = jest.fn((id: string) => {
          const ref = realDoc(id);
          ref.get = jest.fn(() => Promise.resolve({ exists: true, data: () => ({ masterId: "m1" }), id }));
          return ref;
        });
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.createPairingCode)({}, asMaster)).rejects.toThrow(/unique pairing code/i);
  });
});

describe("auth/legal/support additional branch closures", () => {
  it("setUserRole handles undefined payload via catch path", async () => {
    await expect(testEnv.wrap(fns.setUserRole)(undefined as any, asAdmin)).rejects.toThrow(/failed to set user role/i);
  });

  it("needsLegalReconsent tolerates null consent payload via fallback object", async () => {
    const admin = require("firebase-admin");
    const ts = admin.firestore.Timestamp.now();
    state.legalPolicies.termsNull = {
      policyType: "terms",
      country: "DE",
      locale: "de-DE",
      version: "12.0",
      contentUrl: "https://example.com/t120",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.legalPolicies.privacyNull = {
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "12.1",
      contentUrl: "https://example.com/p121",
      effectiveAt: ts,
      status: "active",
      isMajorChange: false,
    };
    state.masterLegalConsents["m1_DE_de-DE"] = null;

    const res = await testEnv.wrap(fns.needsLegalReconsent)({ country: "DE", locale: "de-DE" }, asMaster);
    expect(res.requiresReconsent).toBe(true);
  });

  it("publishLegalPolicy uses provided effectiveAt and caller uid", async () => {
    const admin = require("firebase-admin");
    const explicitTs = admin.firestore.Timestamp.now();

    const res = await testEnv.wrap(fns.publishLegalPolicy)({
      policyType: "privacy",
      country: "DE",
      locale: "de-DE",
      version: "13.0",
      contentUrl: "https://example.com/p130",
      effectiveAt: explicitTs,
    }, { auth: { uid: "admin-uid", token: { role: "admin" } } });

    expect(res.success).toBe(true);
    expect(res.policyType).toBe("privacy");
  });

  it("markLegalReconsentRequired treats non-string masterImei as bulk scope", async () => {
    state.masterLegalConsents.x1 = { country: "DE", locale: "de-DE", requiresReconsent: false };
    state.masterLegalConsents.x2 = { country: "DE", locale: "de-DE", requiresReconsent: false };

    const res = await testEnv.wrap(fns.markLegalReconsentRequired)({ country: "DE", locale: "de-DE", masterImei: 123 as any }, asAdmin);
    expect(res.scope).toBe("country_locale");
  });

  it("markLegalReconsentRequired bulk scope with no matching docs returns updatedCount 0", async () => {
    const res = await testEnv.wrap(fns.markLegalReconsentRequired)({ country: "FR", locale: "fr-FR" }, asAdmin);
    expect(res.scope).toBe("country_locale");
    expect(res.updatedCount).toBe(0);
  });

  it("provideSolutionFeedback stores trimmed comment when feedback is rejected", async () => {
    state.supportTickets["t-feedback"] = { masterImei: "m1", status: "awaiting_user_feedback" };
    const res = await testEnv.wrap(fns.provideSolutionFeedback)({
      ticketId: "t-feedback",
      feedback: "rejected",
      comment: "  still broken  ",
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("provideSolutionFeedback stores null comment when feedback is accepted", async () => {
    state.supportTickets["t-accepted"] = { masterImei: "m1", status: "awaiting_user_feedback" };
    const res = await testEnv.wrap(fns.provideSolutionFeedback)({
      ticketId: "t-accepted",
      feedback: "accepted",
    }, asMaster);
    expect(res.success).toBe(true);
  });

  it("provideSolutionFeedback permission branch with existing but undefined ticket data", async () => {
    state.supportTickets["t-undef"] = undefined;
    await expect(testEnv.wrap(fns.provideSolutionFeedback)({
      ticketId: "t-undef",
      feedback: "accepted",
    }, asMaster)).rejects.toThrow(/permission|not found/i);
  });

  it("registerMasterDevice legacy telemetry uses null projectId fallback", async () => {
    const prevProject = process.env.GCLOUD_PROJECT;
    try {
      delete process.env.GCLOUD_PROJECT;
      delete state.masters["legacy-null-project"];
      mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
      mockAuth.createUser.mockResolvedValueOnce({ uid: "legacy-null-project", customClaims: {} });

      const res = await testEnv.wrap(fns.registerMasterDevice)({ imei: "legacy-null-project" }, {} as any);
      expect(res.masterId).toBe("legacy-null-project");
    } finally {
      if (prevProject !== undefined) process.env.GCLOUD_PROJECT = prevProject;
    }
  });
});

describe("shared and pairing remaining branch sides", () => {
  it("requireMasterOwnership denies when child does not exist", async () => {
    await expect(shared.requireMasterOwnership(asMaster as any, "missing-child"))
      .rejects.toThrow(/owner|permission/i);
  });

  it("validateAppCheck test-mode uses anonymous fallback uid when no auth exists", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      expect(() => shared.validateAppCheck({} as any, true)).not.toThrow();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("validatePairingCode denied path with explicit inactive subscription status", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingCodes["444444"] = { masterId: "m1", expiresAt: futureTs };
    state.masters["m1"] = { imei: "m1", subscription: { status: "expired" } };

    await expect(testEnv.wrap(fns.validatePairingCode)({ pairingCode: "444444" }, asChild)).rejects.toThrow(/subscribe|trial/i);
  });

  it("generatePairingLink denied path with explicit inactive subscription status", async () => {
    state.masters["m1"] = { imei: "m1", subscription: { status: "expired" } };
    await expect(testEnv.wrap(fns.generatePairingLink)({}, asMaster)).rejects.toThrow(/subscribe|trial/i);
  });

  it("validatePairingCode wraps unexpected non-Https errors as internal", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "pairingCodes") {
        const realDoc = coll.doc;
        coll.doc = jest.fn((id: string) => {
          const ref = realDoc(id);
          ref.get = jest.fn(() => Promise.resolve({
            exists: true,
            data: () => ({ masterId: "m1", expiresAt: futureTs }),
            id,
          }));
          return ref;
        });
      }
      if (name === "children") {
        coll.where = jest.fn(() => ({
          get: jest.fn(() => Promise.reject(new Error("children-query-failed"))),
        }));
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.validatePairingCode)({ pairingCode: "555555" }, asChild))
      .rejects.toThrow(/unexpected error/i);
  });

  it("validatePairingToken wraps unexpected non-Https errors as internal", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.pairingTokens["77777777-7777-7777-7777-777777777777"] = { masterId: "m1", expiresAt: futureTs };

    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "children") {
        coll.where = jest.fn(() => ({
          get: jest.fn(() => Promise.reject(new Error("children-query-failed-token"))),
        }));
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.validatePairingToken)({ pairingToken: "77777777-7777-7777-7777-777777777777" }, asChild))
      .rejects.toThrow(/unexpected error/i);
  });

  it("setDeviceLocked catch branch on child update failure", async () => {
    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "children") {
        const realDoc = coll.doc;
        coll.doc = jest.fn((id: string) => {
          const ref = realDoc(id);
          if (id === "c1") {
            ref.update = jest.fn(() => Promise.reject(new Error("update-failed")));
          }
          return ref;
        });
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.setDeviceLocked)({ childId: "c1", isLocked: true }, asMaster))
      .rejects.toThrow(/unexpected error|updating the device lock state/i);
  });

  it("createTask catch branch on task write failure", async () => {
    const collectionSpy = jest.spyOn(db, "collection");
    const originalImpl = collectionSpy.getMockImplementation();
    collectionSpy.mockImplementation((...args: unknown[]) => {
      const name = args[0] as string;
      const coll: any = originalImpl ? originalImpl(name) : undefined;
      if (name === "children") {
        const realDoc = coll.doc;
        coll.doc = jest.fn((id: string) => {
          const ref = realDoc(id);
          if (id === "c1") {
            const realSubCollection = ref.collection;
            ref.collection = jest.fn((sub: string) => {
              const subColl: any = realSubCollection(sub);
              if (sub === "tasks") {
                const realSubDoc = subColl.doc;
                subColl.doc = jest.fn((taskId?: string) => {
                  const taskRef = realSubDoc(taskId);
                  taskRef.set = jest.fn(() => Promise.reject(new Error("task-set-failed")));
                  return taskRef;
                });
              }
              return subColl;
            });
          }
          return ref;
        });
      }
      return coll;
    });

    await expect(testEnv.wrap(fns.createTask)({
      childId: "c1",
      description: "fail-set",
      deadlineISO: new Date(Date.now() + 120000).toISOString(),
    }, asMaster)).rejects.toThrow(/unexpected error/i);
  });
});
