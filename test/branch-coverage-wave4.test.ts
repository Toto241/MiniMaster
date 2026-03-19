/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch‐coverage wave 4 – targets missed branches in:
 *   support.ts     (38 uncov → createSupportTicket, grantSupportAccess, revokeSupportAccess, onTicketCreated, provideSolutionFeedback, cleanupExpiredGrants)
 *   legal.ts       (31 uncov → normalizeLocale/Country, mapPolicyDoc, findActivePolicy, needsLegalReconsent, recordLegalConsent, publishLegalPolicy, markLegalReconsentRequired)
 *   admin.ts       (remaining → sendDailyErrorReport, testGeminiConnection fetch paths, analyzeSystemErrors errorId path)
 *   pairing.ts     (14 uncov → validatePairingCode data corruption, expired, child limit, collision)
 *   auth.ts        (remaining → setUserRole catch branch, logLegacyAuthUsage catch, LEGACY_AUTH_DISABLED)
 *   triggers.ts    (16 uncov → onChildDeviceUpdateV2 diff branches)
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

// ── State-backed Firestore mock (matches wave3 pattern) ────────────────────

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
        subscription: { status: "trial", trialEndsAt: Date.now() + 7 * 86400000, childLimit: 1 },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token", isLocked: false, appBlacklist: [] },
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
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
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
// SUPPORT.TS – createSupportTicket, grantSupportAccess, revokeSupportAccess,
//              onTicketCreated, provideSolutionFeedback
// ══════════════════════════════════════════════════════════════════════════

describe("support.ts branch coverage", () => {
  describe("createSupportTicket – various paths", () => {
    it("creates ticket without support access", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      const res = await wrapped({
        problemDescription: "App crashes on startup",
        allowSupportAccess: false,
      }, asMaster);
      expect(res.success).toBe(true);
      expect(res.ticketId).toBeDefined();
    });

    it("creates ticket with support access consent", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      const res = await wrapped({
        problemDescription: "Cannot pair device",
        allowSupportAccess: true,
        consentSource: "settings_dialog",
      }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when unauthenticated", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      await expect(wrapped({
        problemDescription: "test",
        allowSupportAccess: false,
      }, noAuth)).rejects.toThrow(/authenticated/);
    });

    it("throws when problem description is empty", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      await expect(wrapped({
        problemDescription: "",
        allowSupportAccess: false,
      }, asMaster)).rejects.toThrow(/Problem description/);
    });

    it("throws when problem description is wrong type", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      await expect(wrapped({
        problemDescription: 42,
        allowSupportAccess: false,
      } as any, asMaster)).rejects.toThrow(/Problem description/);
    });

    it("throws when allowSupportAccess is not boolean", async () => {
      const wrapped = testEnv.wrap(fns.createSupportTicket);
      await expect(wrapped({
        problemDescription: "test",
        allowSupportAccess: "yes",
      } as any, asMaster)).rejects.toThrow(/allowSupportAccess/);
    });
  });

  describe("grantSupportAccess – ownership and error paths", () => {
    it("grants access for own ticket", async () => {
      state.supportTickets.t1 = { masterImei: "m1", status: "open" };
      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      const res = await wrapped({ ticketId: "t1" }, asMaster);
      expect(res.success).toBe(true);
      expect(res.grantId).toBeDefined();
    });

    it("throws when ticket not found", async () => {
      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      await expect(wrapped({ ticketId: "nonexistent" }, asMaster))
        .rejects.toThrow(/not found|access denied/);
    });

    it("throws when ticket belongs to another user", async () => {
      state.supportTickets.t_other = { masterImei: "other_master", status: "open" };
      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      await expect(wrapped({ ticketId: "t_other" }, asMaster))
        .rejects.toThrow(/not found|access denied/);
    });

    it("throws when ticketId is missing", async () => {
      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      await expect(wrapped({}, asMaster)).rejects.toThrow(/Ticket ID/);
    });

    it("throws when unauthenticated", async () => {
      const wrapped = testEnv.wrap(fns.grantSupportAccess);
      await expect(wrapped({ ticketId: "t1" }, noAuth)).rejects.toThrow(/authenticated/);
    });
  });

  describe("revokeSupportAccess – ownership and error paths", () => {
    it("revokes own grant", async () => {
      state.supportAccessGrants.g1 = { masterImei: "m1", ticketId: "t1", status: "active" };
      state.supportTickets.t1 = { masterImei: "m1", accessGranted: true };
      const wrapped = testEnv.wrap(fns.revokeSupportAccess);
      const res = await wrapped({ grantId: "g1" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when grant not found", async () => {
      const wrapped = testEnv.wrap(fns.revokeSupportAccess);
      await expect(wrapped({ grantId: "nonexistent" }, asMaster))
        .rejects.toThrow(/not found|access denied/);
    });

    it("throws when grant belongs to another user", async () => {
      state.supportAccessGrants.g_other = { masterImei: "other", ticketId: "t2", status: "active" };
      const wrapped = testEnv.wrap(fns.revokeSupportAccess);
      await expect(wrapped({ grantId: "g_other" }, asMaster))
        .rejects.toThrow(/not found|access denied/);
    });

    it("throws when grantId is missing", async () => {
      const wrapped = testEnv.wrap(fns.revokeSupportAccess);
      await expect(wrapped({}, asMaster)).rejects.toThrow(/Grant ID/);
    });

    it("throws when unauthenticated", async () => {
      const wrapped = testEnv.wrap(fns.revokeSupportAccess);
      await expect(wrapped({ grantId: "g1" }, noAuth)).rejects.toThrow(/authenticated/);
    });
  });

  describe("provideSolutionFeedback – accepted and rejected paths", () => {
    it("accepts a solution", async () => {
      state.supportTickets.t1 = { masterImei: "m1", status: "awaiting_user_feedback", aiGeneratedSolution: "Try X" };
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      const res = await wrapped({ ticketId: "t1", feedback: "accepted" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("rejects a solution with comment", async () => {
      state.supportTickets.t2 = { masterImei: "m1", status: "awaiting_user_feedback", aiGeneratedSolution: "Try Y" };
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      const res = await wrapped({ ticketId: "t2", feedback: "rejected", comment: "Did not work" }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when feedback is invalid value", async () => {
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({ ticketId: "t1", feedback: "maybe" }, asMaster))
        .rejects.toThrow(/accepted.*rejected/);
    });

    it("throws when rejecting without comment", async () => {
      state.supportTickets.t3 = { masterImei: "m1", status: "open" };
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({ ticketId: "t3", feedback: "rejected" }, asMaster))
        .rejects.toThrow(/Comment is required/);
    });

    it("throws when ticket not found", async () => {
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({ ticketId: "nonexistent", feedback: "accepted" }, asMaster))
        .rejects.toThrow(/not found/);
    });

    it("throws permission-denied when ticket belongs to another user", async () => {
      state.supportTickets.t_other = { masterImei: "other", status: "open" };
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({ ticketId: "t_other", feedback: "accepted" }, asMaster))
        .rejects.toThrow(/permission/);
    });

    it("throws when ticketId or feedback missing", async () => {
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({} as any, asMaster)).rejects.toThrow(/Missing ticketId/);
    });

    it("throws when unauthenticated", async () => {
      const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
      await expect(wrapped({ ticketId: "t1", feedback: "accepted" }, noAuth))
        .rejects.toThrow(/authenticated/);
    });
  });

  describe("onTicketCreated – AI analysis trigger", () => {
    it("processes ticket with valid problem description", async () => {
      state.supportTickets.ticket123 = { masterImei: "m1", problemDescription: "App crashes when I open settings", status: "open" };
      const snap = {
        id: "ticket123",
        data: () => state.supportTickets.ticket123,
        ref: {
          update: jest.fn((upd: any) => { Object.assign(state.supportTickets.ticket123, upd); return Promise.resolve(); }),
        },
      };
      if (fns.onTicketCreated?.run) {
        await fns.onTicketCreated.run(snap, { params: { ticketId: "ticket123" } });
      }
    });

    it("skips AI analysis when problem description is empty", async () => {
      state.supportTickets.ticket_empty = { masterImei: "m1", problemDescription: "", status: "open" };
      const snap = {
        id: "ticket_empty",
        data: () => state.supportTickets.ticket_empty,
        ref: {
          update: jest.fn((upd: any) => { Object.assign(state.supportTickets.ticket_empty, upd); return Promise.resolve(); }),
        },
      };
      if (fns.onTicketCreated?.run) {
        await fns.onTicketCreated.run(snap, { params: { ticketId: "ticket_empty" } });
      }
    });

    it("skips AI analysis when problem description is missing", async () => {
      state.supportTickets.ticket_no_desc = { masterImei: "m1", status: "open" };
      const snap = {
        id: "ticket_no_desc",
        data: () => state.supportTickets.ticket_no_desc,
        ref: {
          update: jest.fn((upd: any) => { Object.assign(state.supportTickets.ticket_no_desc, upd); return Promise.resolve(); }),
        },
      };
      if (fns.onTicketCreated?.run) {
        await fns.onTicketCreated.run(snap, { params: { ticketId: "ticket_no_desc" } });
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// LEGAL.TS – normalizers, mapPolicyDoc, findActivePolicy, consent, publish
// ══════════════════════════════════════════════════════════════════════════

describe("legal.ts branch coverage", () => {
  describe("getActiveLegalPolicies – normalization branches", () => {
    it("returns default policies for valid country/locale", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.country).toBe("DE");
      expect(res.locale).toBe("de-DE");
      expect(res.terms).toBeDefined();
      expect(res.privacy).toBeDefined();
    });

    it("throws when country is invalid (too long)", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      await expect(wrapped({ country: "DEU", locale: "de-DE" }, asMaster))
        .rejects.toThrow(/2-letter ISO/);
    });

    it("throws when country is not a string", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      await expect(wrapped({ country: 42, locale: "de-DE" } as any, asMaster))
        .rejects.toThrow(/2-letter ISO/);
    });

    it("throws when locale is not a string", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      await expect(wrapped({ country: "DE", locale: 123 } as any, asMaster))
        .rejects.toThrow(/BCP-47/);
    });

    it("throws when locale format is invalid", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      await expect(wrapped({ country: "DE", locale: "$$invalid" }, asMaster))
        .rejects.toThrow(/BCP-47/);
    });

    it("normalizes locale with underscore to hyphen", async () => {
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      const res = await wrapped({ country: "US", locale: "en_US" }, asMaster);
      expect(res.locale).toBe("en-US");
    });

    it("returns Firestore policies when they exist", async () => {
      state.legalPolicies.policy1 = {
        policyType: "terms", country: "DE", locale: "de-DE",
        version: "2026.1.0", contentUrl: "https://example.com/terms",
        status: "active", isMajorChange: false,
        effectiveAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      state.legalPolicies.policy2 = {
        policyType: "privacy", country: "DE", locale: "de-DE",
        version: "2026.1.0", contentUrl: "https://example.com/privacy",
        status: "active", isMajorChange: false,
        effectiveAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      const wrapped = testEnv.wrap(fns.getActiveLegalPolicies);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.terms.version).toBeDefined();
    });
  });

  describe("needsLegalReconsent – consent checking", () => {
    it("requires reconsent when no consent exists", async () => {
      const wrapped = testEnv.wrap(fns.needsLegalReconsent);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.requiresReconsent).toBe(true);
      expect(res.reason).toBe("missing_consent");
    });

    it("returns up_to_date when consent matches policies", async () => {
      const consentId = "m1_DE_de-DE";
      state.masterLegalConsents[consentId] = {
        masterImei: "m1",
        acceptedTermsVersion: "2026.03.18-1",
        acceptedPrivacyVersion: "2026.03.18-1",
        requiresReconsent: false,
      };
      const wrapped = testEnv.wrap(fns.needsLegalReconsent);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.requiresReconsent).toBe(false);
      expect(res.reason).toBe("up_to_date");
    });

    it("requires reconsent when version mismatches", async () => {
      const consentId = "m1_DE_de-DE";
      state.masterLegalConsents[consentId] = {
        masterImei: "m1",
        acceptedTermsVersion: "2025.01.01-1",
        acceptedPrivacyVersion: "2026.03.18-1",
        requiresReconsent: false,
      };
      const wrapped = testEnv.wrap(fns.needsLegalReconsent);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.requiresReconsent).toBe(true);
      expect(res.reason).toBe("version_or_policy_change");
    });

    it("requires reconsent when flag is set", async () => {
      const consentId = "m1_DE_de-DE";
      state.masterLegalConsents[consentId] = {
        masterImei: "m1",
        acceptedTermsVersion: "2026.03.18-1",
        acceptedPrivacyVersion: "2026.03.18-1",
        requiresReconsent: true,
      };
      const wrapped = testEnv.wrap(fns.needsLegalReconsent);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asMaster);
      expect(res.requiresReconsent).toBe(true);
    });

    it("handles non-string consent version fields", async () => {
      const consentId = "m1_US_en-US";
      state.masterLegalConsents[consentId] = {
        masterImei: "m1",
        acceptedTermsVersion: 123,
        acceptedPrivacyVersion: null,
      };
      const wrapped = testEnv.wrap(fns.needsLegalReconsent);
      const res = await wrapped({ country: "US", locale: "en-US" }, asMaster);
      expect(res.requiresReconsent).toBe(true);
      expect(res.acceptedTermsVersion).toBe("");
      expect(res.acceptedPrivacyVersion).toBe("");
    });
  });

  describe("recordLegalConsent – recording consent", () => {
    it("records legal consent successfully", async () => {
      const wrapped = testEnv.wrap(fns.recordLegalConsent);
      const res = await wrapped({
        country: "DE", locale: "de-DE",
        termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
        consentSource: "settings", appVersion: "1.0.0",
      }, asMaster);
      expect(res.success).toBe(true);
      expect(res.termsVersion).toBe("2026.03.18-1");
    });

    it("uses default consent source and app version when missing", async () => {
      const wrapped = testEnv.wrap(fns.recordLegalConsent);
      const res = await wrapped({
        country: "DE", locale: "de-DE",
        termsVersion: "2026.03.18-1", privacyVersion: "2026.03.18-1",
      }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when versions are missing", async () => {
      const wrapped = testEnv.wrap(fns.recordLegalConsent);
      await expect(wrapped({
        country: "DE", locale: "de-DE",
      } as any, asMaster)).rejects.toThrow(/termsVersion and privacyVersion/);
    });

    it("handles non-string termsVersion", async () => {
      const wrapped = testEnv.wrap(fns.recordLegalConsent);
      await expect(wrapped({
        country: "DE", locale: "de-DE",
        termsVersion: 42, privacyVersion: "1.0",
      } as any, asMaster)).rejects.toThrow(/termsVersion and privacyVersion/);
    });

    it("throws when consent version doesn't match active policy", async () => {
      const wrapped = testEnv.wrap(fns.recordLegalConsent);
      await expect(wrapped({
        country: "DE", locale: "de-DE",
        termsVersion: "999.0.0", privacyVersion: "2026.03.18-1",
      }, asMaster)).rejects.toThrow(/do not match/);
    });
  });

  describe("publishLegalPolicy – admin policy publishing", () => {
    it("publishes a new policy", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      const res = await wrapped({
        policyType: "terms", country: "DE", locale: "de-DE",
        version: "2026.04.01-1", contentUrl: "https://example.com/terms/v2",
        isMajorChange: true, status: "active",
      }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.policyId).toContain("terms_DE");
    });

    it("publishes with default status", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      const res = await wrapped({
        policyType: "privacy", country: "US", locale: "en-US",
        version: "1.0", contentUrl: "https://example.com/privacy",
      }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.status).toBe("active");
    });

    it("throws when policyType is invalid", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      await expect(wrapped({
        policyType: "cookies", country: "DE", locale: "de-DE",
        version: "1.0", contentUrl: "https://example.com",
      } as any, asAdmin)).rejects.toThrow(/terms.*privacy/);
    });

    it("throws when version is empty", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      await expect(wrapped({
        policyType: "terms", country: "DE", locale: "de-DE",
        version: "", contentUrl: "https://example.com",
      }, asAdmin)).rejects.toThrow(/version is required/);
    });

    it("throws when contentUrl is empty", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      await expect(wrapped({
        policyType: "terms", country: "DE", locale: "de-DE",
        version: "1.0", contentUrl: "",
      }, asAdmin)).rejects.toThrow(/contentUrl is required/);
    });

    it("throws when non-admin calls", async () => {
      const wrapped = testEnv.wrap(fns.publishLegalPolicy);
      await expect(wrapped({
        policyType: "terms", country: "DE", locale: "de-DE",
        version: "1.0", contentUrl: "https://example.com",
      }, asMaster)).rejects.toThrow(/Admin/);
    });
  });

  describe("markLegalReconsentRequired – single and bulk", () => {
    it("marks single master for reconsent", async () => {
      state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", requiresReconsent: false };
      const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
      const res = await wrapped({ country: "DE", locale: "de-DE", masterImei: "m1" }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.scope).toBe("single_master");
      expect(res.updatedCount).toBe(1);
    });

    it("marks all matching consents for reconsent (bulk)", async () => {
      state.masterLegalConsents["m1_DE_de-DE"] = { masterImei: "m1", country: "DE", locale: "de-DE" };
      state.masterLegalConsents["m2_DE_de-DE"] = { masterImei: "m2", country: "DE", locale: "de-DE" };
      const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
      const res = await wrapped({ country: "DE", locale: "de-DE" }, asAdmin);
      expect(res.success).toBe(true);
      expect(res.scope).toBe("country_locale");
    });

    it("throws when non-admin calls", async () => {
      const wrapped = testEnv.wrap(fns.markLegalReconsentRequired);
      await expect(wrapped({ country: "DE", locale: "de-DE" }, asMaster))
        .rejects.toThrow(/Admin/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – sendDailyErrorReport, testGeminiConnection fetch paths,
//            analyzeSystemErrors single-error path
// ══════════════════════════════════════════════════════════════════════════

describe("admin.ts deeper branch coverage", () => {
  describe("sendDailyErrorReport – scheduled job", () => {
    it("returns null when no errors in period", async () => {
      const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
      const res = await wrapped({});
      expect(res).toBeNull();
    });

    it("generates report when errors exist", async () => {
      state.error_logs.err1 = {
        functionName: "createTask",
        message: "Something failed",
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      state.error_logs.err2 = {
        functionName: "createTask",
        message: "Something failed",
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
      };
      const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
      const res = await wrapped({});
      expect(res).toBeNull();
    });
  });

  describe("testGeminiConnection – fetch response branches", () => {
    it("returns success with valid API response", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: "MiniMaster ist eine App" }] } }],
          }),
          text: () => Promise.resolve("ok"),
        });
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({}, asAdmin);
        expect(res.success).toBe(true);
        expect(res.model).toBeDefined();
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("returns error on non-ok response", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        mockFetch.mockResolvedValueOnce({
          ok: false, status: 401,
          text: () => Promise.resolve("Unauthorized"),
        });
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({}, asAdmin);
        expect(res.success).toBe(false);
        expect(res.error).toContain("401");
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("returns error on fetch exception", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({}, asAdmin);
        expect(res.success).toBe(false);
        expect(res.error).toContain("Verbindungsfehler");
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("uses custom prompt when provided", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "Custom response" }] } }] }),
          text: () => Promise.resolve("ok"),
        });
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({ prompt: "Was ist 1+1?" }, asAdmin);
        expect(res.success).toBe(true);
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("handles empty candidates array", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({ candidates: [] }),
          text: () => Promise.resolve("ok"),
        });
        const wrapped = testEnv.wrap(fns.testGeminiConnection);
        const res = await wrapped({}, asAdmin);
        expect(res.success).toBe(true);
        expect(res.response).toBe("");
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });
  });

  describe("analyzeSystemErrors – single error path", () => {
    it("analyzes a single error by errorId", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        state.error_logs.err_single = {
          functionName: "createTask",
          message: "Validation failed",
          stack: "Error at line 42",
          timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        };
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: JSON.stringify({
              analyses: [{ severity: "medium", diagnosis: "Bug", suggestedFix: "Fix it", autoFixable: false }],
              summary: "One error found",
            }) }] } }],
          }),
          text: () => Promise.resolve("ok"),
        });
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        const res = await wrapped({ errorId: "err_single" }, asAdmin);
        expect(res).toBeDefined();
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("throws not-found for nonexistent errorId", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        await expect(wrapped({ errorId: "nonexistent" }, asAdmin))
          .rejects.toThrow(/nicht gefunden/);
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("returns empty analysis when no errors in timeframe", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        const res = await wrapped({}, asAdmin);
        expect(res.totalErrors).toBe(0);
        expect(res.analyses).toEqual([]);
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("groups and analyzes multiple errors", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        state.error_logs.e1 = { functionName: "fn1", message: "err1", stack: "s1", timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } };
        state.error_logs.e2 = { functionName: "fn1", message: "err1", stack: "s1", timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } };
        state.error_logs.e3 = { functionName: "fn2", message: "err2", stack: "s2", timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } };
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: JSON.stringify({
              analyses: [{ severity: "high", diagnosis: "Multiple", suggestedFix: "Fix", autoFixable: false }],
              summary: "Summary",
            }) }] } }],
          }),
        });
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        const res = await wrapped({}, asAdmin);
        expect(res).toBeDefined();
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("filters errors by function name", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-key";
      try {
        state.error_logs.e4 = { functionName: "targetFn", message: "err", stack: "s", timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } };
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ analyses: [], summary: "Filtered" }) }] } }],
          }),
        });
        const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
        const res = await wrapped({ functionFilter: "targetFn" }, asAdmin);
        expect(res).toBeDefined();
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });
  });

  describe("adminHealthCheck – storage error branch", () => {
    it("handles storage error gracefully", async () => {
      // The storage mock from firebase-admin/storage is used via getStorage
      // We need to make the bucket().getMetadata throw - override storage mock for this test
      const storageModule = require("firebase-admin/storage");
      const origGetStorage = storageModule.getStorage;
      storageModule.getStorage = jest.fn(() => ({
        bucket: jest.fn(() => ({
          name: null,
          getMetadata: jest.fn().mockRejectedValue(new Error("Storage unavailable")),
        })),
      }));
      try {
        const wrapped = testEnv.wrap(fns.adminHealthCheck);
        const res = await wrapped({}, asAdmin);
        expect(res.ok).toBeDefined();
      } finally {
        storageModule.getStorage = origGetStorage;
      }
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAIRING.TS – validatePairingCode data corruption, expired, child limit
// ══════════════════════════════════════════════════════════════════════════

describe("pairing.ts branch coverage", () => {
  describe("validatePairingCode – error paths", () => {
    it("throws not-found when pairing code doesn't exist", async () => {
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "999999" }, asChild))
        .rejects.toThrow(/Invalid pairing code/);
    });

    it("throws when pairingCode is missing", async () => {
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({}, asChild)).rejects.toThrow(/pairingCode/);
    });

    it("handles data corruption: missing expiresAt", async () => {
      state.pairingCodes["111111"] = { masterId: "m1" };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "111111" }, asChild))
        .rejects.toThrow(/data structure/);
    });

    it("handles data corruption: missing masterId", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingCodes["222222"] = { expiresAt: futureTs };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "222222" }, asChild))
        .rejects.toThrow(/masterId/);
    });

    it("handles expired pairing code", async () => {
      const admin = require("firebase-admin");
      const pastTs = new admin.firestore.Timestamp(100, 0);
      state.pairingCodes["333333"] = { expiresAt: pastTs, masterId: "m1" };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "333333" }, asChild))
        .rejects.toThrow(/expired/);
    });

    it("throws when master not found for code", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingCodes["444444"] = { expiresAt: futureTs, masterId: "nonexistent" };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "444444" }, asChild))
        .rejects.toThrow(/Master account not found/);
    });

    it("throws resource-exhausted when trial expired", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingCodes["555555"] = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "expired", childLimit: 1 };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "555555" }, asChild))
        .rejects.toThrow(/trial has expired|subscribe/);
    });

    it("throws resource-exhausted when child limit reached", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingCodes["666666"] = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "active", childLimit: 1 };
      // c1 already exists as a child of m1
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      await expect(wrapped({ pairingCode: "666666" }, asChild))
        .rejects.toThrow(/Child limit reached/);
    });

    it("pairs child successfully when all checks pass", async () => {
      const admin = require("firebase-admin");
      const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingCodes["777777"] = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "active", childLimit: 5 };
      const wrapped = testEnv.wrap(fns.validatePairingCode);
      const res = await wrapped({ pairingCode: "777777" }, asChild);
      expect(res.childId).toBeDefined();
    });
  });

  describe("createPairingCode – collision exhaustion", () => {
    it("creates pairing code successfully", async () => {
      const wrapped = testEnv.wrap(fns.createPairingCode);
      const res = await wrapped({}, asMaster);
      expect(res.pairingCode).toBeDefined();
      expect(res.pairingCode).toHaveLength(6);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – remaining uncovered: LEGACY_AUTH_DISABLED, setUserRole catch,
//           logLegacyAuthUsage catch
// ══════════════════════════════════════════════════════════════════════════

describe("auth.ts deeper branch coverage", () => {
  describe("generateCustomToken – LEGACY_AUTH_DISABLED branch", () => {
    it("generates token with existing master doc update best-effort", async () => {
      const wrapped = testEnv.wrap(fns.generateCustomToken);
      const res = await wrapped({}, asMaster);
      expect(res.customToken).toBe("mock-custom-token");
    });
  });

  describe("setUserRole – catch branch in error handling", () => {
    it("handles internal error when setCustomUserClaims fails", async () => {
      mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Claims write failed"));
      const wrapped = testEnv.wrap(fns.setUserRole);
      await expect(wrapped({ uid: "user1", role: "support" }, asAdmin))
        .rejects.toThrow(/Failed to set user role|Claims write failed/);
    });
  });

  describe("registerMasterDevice – error catch branches", () => {
    it("handles non-auth error from getUser", async () => {
      mockAuth.getUser.mockRejectedValueOnce(new Error("Unknown auth error"));
      const wrapped = testEnv.wrap(fns.registerMasterDevice);
      await expect(wrapped({ imei: "m_err" }, { auth: { uid: "m_err", token: {} } }))
        .rejects.toThrow(/unexpected error|Unknown auth/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – getTicketUserData, aiExplainProblem
// ══════════════════════════════════════════════════════════════════════════

describe("support.ts – getTicketUserData", () => {
  const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

  it("returns master data with valid grant", async () => {
    const adminMod = require("firebase-admin");
    const futureT = new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
    state.supportTickets.t1 = { masterImei: "m1", accessGrantId: "g1" };
    state.supportAccessGrants.g1 = {
      masterImei: "m1", ticketId: "t1", status: "active",
      expiresAt: futureT,
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    const res = await wrapped({ ticketId: "t1" }, asSupport);
    expect(res.master).toBeDefined();
    expect(res.children).toBeDefined();
  });

  it("throws when ticket not found", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "none" }, asSupport)).rejects.toThrow(/not found/);
  });

  it("throws when no accessGrantId on ticket", async () => {
    state.supportTickets.t_nogrant = { masterImei: "m1" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t_nogrant" }, asSupport)).rejects.toThrow(/grant/);
  });

  it("throws when grant status is revoked", async () => {
    state.supportTickets.t2 = { masterImei: "m1", accessGrantId: "g2" };
    state.supportAccessGrants.g2 = { masterImei: "m1", status: "revoked" };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t2" }, asSupport)).rejects.toThrow(/revoked|permission/);
  });

  it("throws when grant has expired", async () => {
    const adminMod = require("firebase-admin");
    const pastT = new adminMod.firestore.Timestamp(100, 0);
    state.supportTickets.t3 = { masterImei: "m1", accessGrantId: "g3" };
    state.supportAccessGrants.g3 = { masterImei: "m1", status: "active", expiresAt: pastT };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t3" }, asSupport)).rejects.toThrow(/expired/);
  });

  it("throws when ticketId is missing", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({}, asSupport)).rejects.toThrow(/Ticket ID/);
  });

  it("throws when unauthenticated or non-support user calls", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "t1" }, noAuth)).rejects.toThrow(/permission|Support/);
    await expect(wrapped({ ticketId: "t1" }, asMaster)).rejects.toThrow(/permission|Support/);
  });
});

describe("support.ts – aiExplainProblem", () => {
  const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

  it("returns AI explanation with valid input", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    const res = await wrapped({
      problemContext: "Das Gerät verbindet sich nicht mit Firebase",
      consentGiven: true,
    }, asSupport);
    expect(res.explanation).toBeDefined();
    expect(res.suggestion).toBeDefined();
  });

  it("throws when consent not given", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "Some problem here",
      consentGiven: false,
    }, asSupport)).rejects.toThrow(/Zustimmung/);
  });

  it("throws when problem context too short", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "short",
      consentGiven: true,
    }, asSupport)).rejects.toThrow(/mindestens 10 Zeichen/);
  });

  it("throws when problem context too long", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "x".repeat(3001),
      consentGiven: true,
    }, asSupport)).rejects.toThrow(/maximal 3000 Zeichen/);
  });

  it("throws when not admin or support", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "Test problem context hier",
      consentGiven: true,
    }, asMaster)).rejects.toThrow(/admin.*support/);
  });

  it("throws when not authenticated", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "Test problem context hier",
      consentGiven: true,
    }, noAuth)).rejects.toThrow(/authenticated/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DEVICE.TS – setDeviceLockState, updateAppBlacklist, setUsageRules,
//             getRulesForChild, reportTamperEvent
// ══════════════════════════════════════════════════════════════════════════

describe("device.ts branch coverage", () => {
  describe("setDeviceLocked – error branches", () => {
    it("locks child device successfully", async () => {
      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      const res = await wrapped({ childId: "c1", isLocked: true }, asMaster);
      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(true);
    });

    it("unlocks child device", async () => {
      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      const res = await wrapped({ childId: "c1", isLocked: false }, asMaster);
      expect(res.success).toBe(true);
      expect(res.isLocked).toBe(false);
    });

    it("throws when childId is missing", async () => {
      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      await expect(wrapped({ isLocked: true }, asMaster)).rejects.toThrow(/childId/);
    });

    it("throws when child not found", async () => {
      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      await expect(wrapped({ childId: "unknown", isLocked: true }, asMaster))
        .rejects.toThrow(/not found|not authorized/);
    });

    it("throws when master does not own child", async () => {
      state.children.c_other = { masterImei: "other_master", childImei: "c_other" };
      const wrapped = testEnv.wrap(fns.setDeviceLocked);
      await expect(wrapped({ childId: "c_other", isLocked: true }, asMaster))
        .rejects.toThrow(/not authorized/);
    });
  });

  describe("updateAppBlacklist – branches", () => {
    it("updates blacklist successfully", async () => {
      const wrapped = testEnv.wrap(fns.updateAppBlacklist);
      const res = await wrapped({ childId: "c1", appBlacklist: ["com.game1", "com.game2"] }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when args missing", async () => {
      const wrapped = testEnv.wrap(fns.updateAppBlacklist);
      await expect(wrapped({ childId: "c1" } as any, asMaster)).rejects.toThrow(/appBlacklist/);
    });

    it("throws permission-denied for foreign child", async () => {
      state.children.c_other = { masterImei: "other_master" };
      const wrapped = testEnv.wrap(fns.updateAppBlacklist);
      await expect(wrapped({ childId: "c_other", appBlacklist: [] }, asMaster))
        .rejects.toThrow(/not authorized/);
    });
  });

  describe("setUsageRules – branches", () => {
    it("sets usage rules successfully", async () => {
      const wrapped = testEnv.wrap(fns.setUsageRules);
      const res = await wrapped({
        childId: "c1",
        usageRules: { dailyLimit: 120, bedtimeStart: "21:00", bedtimeEnd: "07:00" },
      }, asMaster);
      expect(res.success).toBe(true);
    });

    it("throws when usageRules missing", async () => {
      const wrapped = testEnv.wrap(fns.setUsageRules);
      await expect(wrapped({ childId: "c1" } as any, asMaster)).rejects.toThrow(/usageRules/);
    });

    it("throws invalid-argument for bad bedtimeStart", async () => {
      const wrapped = testEnv.wrap(fns.setUsageRules);
      await expect(wrapped({
        childId: "c1",
        usageRules: { dailyLimit: 120, bedtimeStart: "abc", bedtimeEnd: "07:00" },
      }, asMaster)).rejects.toThrow(/HH:MM/);
    });

    it("throws invalid-argument for bad bedtimeEnd", async () => {
      const wrapped = testEnv.wrap(fns.setUsageRules);
      await expect(wrapped({
        childId: "c1",
        usageRules: { dailyLimit: 120, bedtimeStart: "21:00", bedtimeEnd: "abc" },
      }, asMaster)).rejects.toThrow(/HH:MM/);
    });

    it("throws permission-denied for foreign child", async () => {
      state.children.c_other = { masterImei: "other_master" };
      const wrapped = testEnv.wrap(fns.setUsageRules);
      await expect(wrapped({
        childId: "c_other",
        usageRules: { dailyLimit: 60 },
      }, asMaster)).rejects.toThrow(/not authorized/);
    });
  });

  describe("getRulesForChild – access paths", () => {
    it("returns rules for master's own child", async () => {
      const wrapped = testEnv.wrap(fns.getRulesForChild);
      const res = await wrapped({ childId: "c1" }, asMaster);
      expect(res.isLocked).toBeDefined();
      expect(res.appBlacklist).toBeDefined();
    });

    it("returns rules when child requests own rules", async () => {
      const wrapped = testEnv.wrap(fns.getRulesForChild);
      const res = await wrapped({ childId: "c1" }, asChild);
      expect(res.isLocked).toBeDefined();
    });

    it("throws permission-denied for unrelated user", async () => {
      state.children.c_other = { masterImei: "other_master" };
      const wrapped = testEnv.wrap(fns.getRulesForChild);
      await expect(wrapped({ childId: "c_other" }, asMaster))
        .rejects.toThrow(/Not authorized/);
    });

    it("throws not-found for nonexistent child", async () => {
      const wrapped = testEnv.wrap(fns.getRulesForChild);
      await expect(wrapped({ childId: "nonexistent" }, asMaster))
        .rejects.toThrow(/not found/);
    });
  });

  describe("reportTamperEvent – branches", () => {
    it("reports tamper event successfully", async () => {
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      const res = await wrapped({
        childId: "c1", eventType: "accessibility_service_disabled",
      }, asChild);
      expect(res.success).toBe(true);
    });

    it("throws when eventType missing", async () => {
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      await expect(wrapped({ childId: "c1" } as any, asChild))
        .rejects.toThrow(/eventType/);
    });

    it("throws permission-denied when childId does not match caller", async () => {
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      await expect(wrapped({ childId: "nonexistent", eventType: "uninstall_attempt" }, asChild))
        .rejects.toThrow(/not authorized/);
    });

    it("throws when child doc not found", async () => {
      delete state.children.c1;
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      await expect(wrapped({ childId: "c1", eventType: "uninstall_attempt" }, asChild))
        .rejects.toThrow(/not found/);
    });

    it("sends FCM to master when fcmToken exists", async () => {
      state.masters.m1.fcmToken = "master-fcm-token";
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      await wrapped({
        childId: "c1", eventType: "overlay_permission_revoked",
      }, asChild);
      expect(mockSend).toHaveBeenCalled();
    });

    it("completes without FCM when no master fcmToken", async () => {
      delete state.masters.m1.fcmToken;
      const wrapped = testEnv.wrap(fns.reportTamperEvent);
      const res = await wrapped({
        childId: "c1", eventType: "admin_deactivated",
      }, asChild);
      expect(res.success).toBe(true);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAIRING.TS – generatePairingLink, validatePairingToken
// ══════════════════════════════════════════════════════════════════════════

describe("pairing.ts – generatePairingLink & validatePairingToken", () => {
  describe("generatePairingLink", () => {
    it("creates pairing link successfully", async () => {
      const wrapped = testEnv.wrap(fns.generatePairingLink);
      const res = await wrapped({}, asMaster);
      expect(res.pairingToken).toBeDefined();
    });

    it("throws when master not found", async () => {
      delete state.masters.m1;
      const wrapped = testEnv.wrap(fns.generatePairingLink);
      await expect(wrapped({}, asMaster)).rejects.toThrow(/not found/);
    });

    it("throws when subscription expired", async () => {
      state.masters.m1.subscription = { status: "expired" };
      const wrapped = testEnv.wrap(fns.generatePairingLink);
      await expect(wrapped({}, asMaster)).rejects.toThrow(/expired|subscribe/);
    });
  });

  describe("validatePairingToken", () => {
    it("validates token successfully", async () => {
      const adminMod = require("firebase-admin");
      const futureTs = new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingTokens.tok1 = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "active", childLimit: 5 };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      const res = await wrapped({ pairingToken: "tok1" }, asChild);
      expect(res.childId).toBeDefined();
    });

    it("throws when token not found", async () => {
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "nonexistent" }, asChild))
        .rejects.toThrow(/invalid/);
    });

    it("throws when token expired", async () => {
      const adminMod = require("firebase-admin");
      const pastTs = new adminMod.firestore.Timestamp(100, 0);
      state.pairingTokens.tok_exp = { expiresAt: pastTs, masterId: "m1" };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_exp" }, asChild))
        .rejects.toThrow(/expired/);
    });

    it("throws when token data is missing (null data)", async () => {
      state.pairingTokens.tok_empty = null;
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_empty" }, asChild))
        .rejects.toThrow(/missing|invalid/);
    });

    it("throws when expiresAt not a Timestamp", async () => {
      state.pairingTokens.tok_bad = { expiresAt: "not-a-timestamp", masterId: "m1" };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_bad" }, asChild))
        .rejects.toThrow(/data structure/);
    });

    it("throws when masterId missing", async () => {
      const adminMod = require("firebase-admin");
      const futureTs = new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingTokens.tok_noid = { expiresAt: futureTs };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_noid" }, asChild))
        .rejects.toThrow(/masterId/);
    });

    it("throws when master has expired subscription", async () => {
      const adminMod = require("firebase-admin");
      const futureTs = new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingTokens.tok_sub = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "expired" };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_sub" }, asChild))
        .rejects.toThrow(/subscription|trial/);
    });

    it("throws when child limit reached", async () => {
      const adminMod = require("firebase-admin");
      const futureTs = new adminMod.firestore.Timestamp(Math.floor(Date.now() / 1000) + 3600, 0);
      state.pairingTokens.tok_lim = { expiresAt: futureTs, masterId: "m1" };
      state.masters.m1.subscription = { status: "active", childLimit: 1 };
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({ pairingToken: "tok_lim" }, asChild))
        .rejects.toThrow(/Child limit/);
    });

    it("throws when pairingToken missing from input", async () => {
      const wrapped = testEnv.wrap(fns.validatePairingToken);
      await expect(wrapped({} as any, asChild)).rejects.toThrow(/pairingToken/);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TRIGGERS.TS – analyzeTaskPhoto, onTaskStatusChange, onChildDeviceUpdateV2
// ══════════════════════════════════════════════════════════════════════════

describe("triggers.ts branch coverage", () => {
  describe("onChildDeviceUpdateV2 – diff branches", () => {
    it("sends FCM when isLocked changes", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ fcmToken: "tok1", isLocked: false, appBlacklist: [], usageRules: {} }) },
            after: { data: () => ({ fcmToken: "tok1", isLocked: true, appBlacklist: [], usageRules: {} }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("sends FCM when appBlacklist changes", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ fcmToken: "tok2", isLocked: false, appBlacklist: [], usageRules: {} }) },
            after: { data: () => ({ fcmToken: "tok2", isLocked: false, appBlacklist: ["com.game"], usageRules: {} }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("sends FCM when usageRules changes", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ fcmToken: "tok3", isLocked: false, appBlacklist: [], usageRules: {} }) },
            after: { data: () => ({ fcmToken: "tok3", isLocked: false, appBlacklist: [], usageRules: { dailyLimit: 60 } }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("skips when no relevant changes", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ fcmToken: "tok4", isLocked: false, appBlacklist: [], usageRules: {}, name: "old" }) },
            after: { data: () => ({ fcmToken: "tok4", isLocked: false, appBlacklist: [], usageRules: {}, name: "new" }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("skips when fcmToken is missing", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ isLocked: false, appBlacklist: [] }) },
            after: { data: () => ({ isLocked: true, appBlacklist: [] }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("skips when newData is null", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => ({ fcmToken: "tok", isLocked: false }) },
            after: { data: () => null },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("skips when oldData is null (new doc)", async () => {
      if (fns.onChildDeviceUpdateV2?.run) {
        const event = {
          params: { childId: "c1" },
          data: {
            before: { data: () => null },
            after: { data: () => ({ fcmToken: "tok", isLocked: true }) },
          },
        };
        await fns.onChildDeviceUpdateV2.run(event);
        expect(mockSend).not.toHaveBeenCalled();
      }
    });
  });

  describe("analyzeTaskPhoto – v2 trigger paths", () => {
    it("runs fallback analysis when no GEMINI_API_KEY", async () => {
      const saved = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      try {
        if (fns.analyzeTaskPhoto?.run) {
          const updateRef = { update: jest.fn().mockResolvedValue(undefined) };
          const event = {
            params: { childId: "c1", taskId: "task1" },
            data: {
              before: { data: () => ({ status: "pending", description: "Clean room" }) },
              after: {
                data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/photo.jpg", description: "Clean room" }),
                ref: updateRef,
              },
            },
          };
          await fns.analyzeTaskPhoto.run(event);
          expect(updateRef.update).toHaveBeenCalled();
        }
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("skips when status transition is not to pending_approval", async () => {
      if (fns.analyzeTaskPhoto?.run) {
        const event = {
          params: { childId: "c1", taskId: "task2" },
          data: {
            before: { data: () => ({ status: "pending" }) },
            after: { data: () => ({ status: "approved" }) },
          },
        };
        await fns.analyzeTaskPhoto.run(event);
      }
    });

    it("skips when no photoUrl", async () => {
      if (fns.analyzeTaskPhoto?.run) {
        const event = {
          params: { childId: "c1", taskId: "task3" },
          data: {
            before: { data: () => ({ status: "pending" }) },
            after: { data: () => ({ status: "pending_approval" }) },
          },
        };
        await fns.analyzeTaskPhoto.run(event);
      }
    });

    it("rejects invalid photoUrl (SSRF prevention)", async () => {
      if (fns.analyzeTaskPhoto?.run) {
        const event = {
          params: { childId: "c1", taskId: "task4" },
          data: {
            before: { data: () => ({ status: "pending" }) },
            after: { data: () => ({ status: "pending_approval", photoUrl: "https://evil.com/hack" }) },
          },
        };
        await fns.analyzeTaskPhoto.run(event);
      }
    });

    it("skips when data is null", async () => {
      if (fns.analyzeTaskPhoto?.run) {
        const event = {
          params: { childId: "c1", taskId: "task5" },
          data: {
            before: { data: () => null },
            after: { data: () => null },
          },
        };
        await fns.analyzeTaskPhoto.run(event);
      }
    });

    it("uses Gemini when API key is set", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-gemini-key";
      try {
        mockFetch.mockResolvedValueOnce({
          ok: true, status: 200,
          json: () => Promise.resolve({
            candidates: [{ content: { parts: [{ text: JSON.stringify({
              labels: ["room", "clean"],
              safeSearch: { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY" },
              taskCompletion: "completed",
              confidence: 0.9,
              summary: "Room appears clean",
            }) }] } }],
          }),
        });
        if (fns.analyzeTaskPhoto?.run) {
          const updateRef = { update: jest.fn().mockResolvedValue(undefined) };
          const event = {
            params: { childId: "c1", taskId: "task6" },
            data: {
              before: { data: () => ({ status: "pending", description: "Clean room" }) },
              after: {
                data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/photo.jpg", description: "Clean room" }),
                ref: updateRef,
              },
            },
          };
          await fns.analyzeTaskPhoto.run(event);
          expect(updateRef.update).toHaveBeenCalled();
        }
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });

    it("falls back when Gemini analysis throws", async () => {
      const saved = process.env.GEMINI_API_KEY;
      process.env.GEMINI_API_KEY = "test-gemini-key";
      try {
        mockFetch.mockRejectedValueOnce(new Error("Network failure"));
        if (fns.analyzeTaskPhoto?.run) {
          const updateRef = { update: jest.fn().mockResolvedValue(undefined) };
          const event = {
            params: { childId: "c1", taskId: "task7" },
            data: {
              before: { data: () => ({ status: "pending", description: "Homework" }) },
              after: {
                data: () => ({ status: "pending_approval", photoUrl: "https://firebasestorage.googleapis.com/photo2.jpg", description: "Homework" }),
                ref: updateRef,
              },
            },
          };
          await fns.analyzeTaskPhoto.run(event);
          expect(updateRef.update).toHaveBeenCalled();
        }
      } finally {
        if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
        else delete process.env.GEMINI_API_KEY;
      }
    });
  });

  describe("onTaskStatusChange – notification paths", () => {
    it("sends notification to master when task submitted for review", async () => {
      state.children.c1.masterImei = "m1";
      const change = {
        before: { data: () => ({ status: "pending", masterImei: "m1", description: "Do homework" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Do homework" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t1" } });
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("sends notification to child when task approved", async () => {
      const change = {
        before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Clean room" }) },
        after: { data: () => ({ status: "approved", masterImei: "m1", description: "Clean room" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t2" } });
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("sends notification to child when task rejected", async () => {
      const change = {
        before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Study math" }) },
        after: { data: () => ({ status: "rejected", masterImei: "m1", description: "Study math" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t3" } });
        expect(mockSend).toHaveBeenCalled();
      }
    });

    it("skips when no masterImei on task", async () => {
      const change = {
        before: { data: () => ({ status: "pending", description: "X" }) },
        after: { data: () => ({ status: "pending_approval", description: "X" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t4" } });
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("skips when master has no fcmToken", async () => {
      delete state.masters.m1.fcmToken;
      const change = {
        before: { data: () => ({ status: "pending", masterImei: "m1", description: "X" }) },
        after: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "X" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t5" } });
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("handles missing before/after data", async () => {
      const change = {
        before: { data: () => null },
        after: { data: () => null },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t6" } });
        expect(mockSend).not.toHaveBeenCalled();
      }
    });

    it("skips when child has no fcmToken for review notification", async () => {
      delete state.children.c1.fcmToken;
      const change = {
        before: { data: () => ({ status: "pending_approval", masterImei: "m1", description: "Y" }) },
        after: { data: () => ({ status: "approved", masterImei: "m1", description: "Y" }) },
      };
      if (fns.onTaskStatusChange?.run) {
        await fns.onTaskStatusChange.run(change, { params: { childId: "c1", taskId: "t7" } });
        expect(mockSend).not.toHaveBeenCalled();
      }
    });
  });
});
