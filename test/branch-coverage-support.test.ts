/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage for support.ts — remaining uncovered branches:
 * - generateWithGemini: AbortError catch (line 127), non-ok response (130)
 * - generateAiCompletion: OpenAI fallback disabled (192), no provider (196)
 * - sendSupportFollowUpEmail: missing env vars (276,279), API call+ok/error/catch (304-335)
 * - runAiAnalysisRound: debugSnapshot failure catch (624), needsMoreInfo=false paths (660,663),
 *   solved/escalated/waiting resolution (678-682), escalation warning (715)
 * - onTicketCreated: error catch (799-810)
 * - onSupportTicketUpdated: valid email → send email + update (845-860)
 * - analyzeWithDebugData: permission check (881)
 * - skipDebugMode: various branches (1017)
 * - getDebugInfo: specific branches (1153)
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

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

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
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
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

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

const asMasterWithApp = { auth: { uid: "m1", token: { role: "master" } }, app: { appId: "test-app" } };

function makeExpiresAt(offsetSeconds: number) {
  const seconds = Math.floor(Date.now() / 1000) + offsetSeconds;
  return { seconds, nanoseconds: 0, toMillis() { return this.seconds * 1000; } };
}

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", fcmToken: "master-fcm", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: {
        masterImei: "m1", fcmToken: "child-fcm", isLocked: false,
        appBlacklist: ["com.test.app"], usageRules: ["rule1"],
        lastSeen: { toDate: () => new Date("2026-03-25T10:00:00Z") },
        updatedAt: { toDate: () => new Date("2026-03-25T11:00:00Z") },
      },
    },
    supportTickets: {
      "ticket-1": {
        masterImei: "m1", status: "awaiting_user_feedback", accessGranted: false,
        problemDescription: "App stürzt ab\n[ReplyTo] user@example.com\n[Sender] Max\n[SourcePanel] admin-panel",
        conversationStatus: "awaiting_debug_consent",
        conversationRound: 0, aiAttemptFailures: 0,
      },
      "ticket-open": {
        masterImei: "m1", status: "awaiting_user_feedback", accessGranted: true,
        debugAccessGrantId: "grant-active",
        problemDescription: "Gerät friert ein\n[ReplyTo] user@example.com\n[Sender] Test",
        conversationStatus: "waiting_user_response",
        conversationRound: 2, aiAttemptFailures: 1,
      },
      "ticket-admin": {
        masterImei: "other-master", status: "open",
        problemDescription: "Admin-managed ticket\n[ReplyTo] admin@example.com",
        conversationStatus: "analyzing",
        conversationRound: 0, aiAttemptFailures: 0,
        accessGranted: true, debugAccessGrantId: "grant-admin",
      },
    },
    supportAccessGrants: {
      "grant-active": {
        masterImei: "m1", ticketId: "ticket-open", status: "active",
        expiresAt: makeExpiresAt(3600),
        debugScope: ["diagnostic_logs", "app_status", "system_info"],
      },
      "grant-admin": {
        masterImei: "other-master", ticketId: "ticket-admin", status: "active",
        expiresAt: makeExpiresAt(3600),
        debugScope: ["diagnostic_logs", "app_status", "system_info"],
      },
    },
    subscriptions: {},
    legalPolicies: {},
    masterLegalConsents: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
    operatorAccessKeys: {},
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
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
            state[coll] = collData;
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()) },
                })),
              })),
              add: jest.fn((data: any) => {
                const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][id] = data;
                return Promise.resolve({ id });
              }),
              doc: jest.fn((subId: string) => ({
                get: jest.fn(() => {
                  const sd = state[key]?.[subId];
                  return Promise.resolve({ exists: !!sd, data: () => sd, id: subId });
                }),
                set: jest.fn((data: any) => { state[key][subId] = data; return Promise.resolve(); }),
                update: jest.fn((upd: any) => {
                  if (state[key]?.[subId]) Object.assign(state[key][subId], upd);
                  return Promise.resolve();
                }),
              })),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn(() => {
        const childDocs = Object.entries(state.children || {})
          .filter(([, d]: [string, any]) => d.masterImei === "m1")
          .map(([id, data]) => ({
            id, data: () => data,
            ref: {
              collection: jest.fn((sub: string) => {
                const key = `children/${id}/${sub}`;
                if (!state[key]) state[key] = {};
                return {
                  limit: jest.fn().mockReturnValue({
                    get: jest.fn(() => Promise.resolve({
                      size: Object.keys(state[key]).length,
                      docs: Object.entries(state[key]).map(([sid, sdata]) => ({
                        id: sid, data: () => sdata,
                      })),
                    })),
                  }),
                  get: jest.fn(() => Promise.resolve({
                    size: Object.keys(state[key]).length,
                    docs: Object.entries(state[key]).map(([sid, sdata]) => ({
                      id: sid, data: () => sdata,
                    })),
                  })),
                };
              }),
            },
          }));
        return {
          limit: jest.fn().mockReturnValue({
            get: jest.fn(() => Promise.resolve({
              empty: childDocs.length === 0,
              size: childDocs.length,
              docs: childDocs,
            })),
          }),
          get: jest.fn(() => Promise.resolve({
            empty: childDocs.length === 0,
            size: childDocs.length,
            docs: childDocs,
          })),
        };
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            id,
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [] })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db).runTransaction = jest.fn(async (fn: any) => {
    const tx = {
      get: jest.fn(async (ref: any) => ref.get()),
      update: jest.fn((ref: any, data: any) => ref.update(data)),
      set: jest.fn((ref: any, data: any) => ref.set(data)),
    };
    return fn(tx);
  });

  (db).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// sendSupportFollowUpEmail — env var branches
// ══════════════════════════════════════════════════════════════════════════

describe("sendSupportFollowUpEmail branches via analyzeWithDebugData", () => {
  it("sendet Follow-Up Email bei gültiger Email im Ticket (line 845-860)", async () => {
    // analyzeWithDebugData triggers runAiAnalysisRound + email send
    state.supportTickets["ticket-email"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Problem XY\n[ReplyTo] user@example.com\n[Sender] Max\n[SourcePanel] admin-panel",
      conversationStatus: "analyzing",
      conversationRound: 1, aiAttemptFailures: 0,
      accessGranted: true, debugAccessGrantId: "grant-active",
    };

    // Set env vars for sendSupportFollowUpEmail
    const origResendKey = process.env.RESEND_API_KEY;
    const origFromEmail = process.env.SUPPORT_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUPPORT_FROM_EMAIL = "support@minimaster.app";

    // Mock global.fetch for Resend API
    const origFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-123" }),
    });

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({
        ticketId: "ticket-email",
        userMessage: "Bitte Debug-Daten analysieren",
      }, asMaster);
      expect(res.success).toBe(true);

      // Verify fetch was called with Resend API
      expect((global as any).fetch).toHaveBeenCalled();
    } finally {
      (global as any).fetch = origFetch;
      if (origResendKey !== undefined) process.env.RESEND_API_KEY = origResendKey;
      else delete process.env.RESEND_API_KEY;
      if (origFromEmail !== undefined) process.env.SUPPORT_FROM_EMAIL = origFromEmail;
      else delete process.env.SUPPORT_FROM_EMAIL;
    }
  });

  it("sendet Email mit nicht-ok Response (error path)", async () => {
    state.supportTickets["ticket-email2"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Problem\n[ReplyTo] user@example.com\n[Sender] Max",
      conversationStatus: "analyzing",
      conversationRound: 1, aiAttemptFailures: 0,
      accessGranted: true, debugAccessGrantId: "grant-active",
    };

    const origResendKey = process.env.RESEND_API_KEY;
    const origFromEmail = process.env.SUPPORT_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUPPORT_FROM_EMAIL = "support@minimaster.app";

    const origFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      // Should still succeed - email failure is non-blocking
      const res = await wrapped({
        ticketId: "ticket-email2",
        userMessage: "Test",
      }, asMaster);
      expect(res.success).toBe(true);
    } finally {
      (global as any).fetch = origFetch;
      if (origResendKey !== undefined) process.env.RESEND_API_KEY = origResendKey;
      else delete process.env.RESEND_API_KEY;
      if (origFromEmail !== undefined) process.env.SUPPORT_FROM_EMAIL = origFromEmail;
      else delete process.env.SUPPORT_FROM_EMAIL;
    }
  });

  it("behandelt fetch-Exception gracefully", async () => {
    state.supportTickets["ticket-email3"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Problem\n[ReplyTo] user@example.com\n[Sender] Max",
      conversationStatus: "analyzing",
      conversationRound: 1, aiAttemptFailures: 0,
      accessGranted: true, debugAccessGrantId: "grant-active",
    };

    const origResendKey = process.env.RESEND_API_KEY;
    const origFromEmail = process.env.SUPPORT_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUPPORT_FROM_EMAIL = "support@minimaster.app";

    const origFetch = global.fetch;
    (global as any).fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({
        ticketId: "ticket-email3",
        userMessage: "Test",
      }, asMaster);
      expect(res.success).toBe(true);
    } finally {
      (global as any).fetch = origFetch;
      if (origResendKey !== undefined) process.env.RESEND_API_KEY = origResendKey;
      else delete process.env.RESEND_API_KEY;
      if (origFromEmail !== undefined) process.env.SUPPORT_FROM_EMAIL = origFromEmail;
      else delete process.env.SUPPORT_FROM_EMAIL;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// analyzeWithDebugData — permission check (line 881)
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeWithDebugData — permission branches", () => {
  it("wirft permission-denied für nicht-autorisierter User", async () => {
    state.supportTickets["ticket-perm"] = {
      masterImei: "other-master", status: "open",
      problemDescription: "Problem",
      conversationRound: 0, aiAttemptFailures: 0,
    };

    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    // asMaster (uid: m1) trying to access ticket owned by other-master
    await expect(wrapped({ ticketId: "ticket-perm", userMessage: "test" }, asMaster))
      .rejects.toThrow(/permission/i);
  });

  it("erlaubt Admin-Zugriff auf fremdes Ticket", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({
      ticketId: "ticket-admin",
      userMessage: "Admin analysis",
    }, asAdmin);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// onSupportTicketUpdated — email flow (lines 845-860)
// ══════════════════════════════════════════════════════════════════════════

describe("onSupportTicketUpdated — adminResponse email branch", () => {
  it("sendet Email bei neuer adminResponse", async () => {
    const origResendKey = process.env.RESEND_API_KEY;
    const origFromEmail = process.env.SUPPORT_FROM_EMAIL;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SUPPORT_FROM_EMAIL = "support@minimaster.app";

    const origFetch = global.fetch;
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-456" }),
    });

    try {
      const wrapped = testEnv.wrap(fns.onSupportTicketUpdated);
      const before = { data: () => ({ adminResponse: "", masterImei: "m1", problemDescription: "Problem\n[ReplyTo] admin-user@example.com\n[Sender] Hans" }) };
      const afterData: any = {
        adminResponse: "Wir haben das Problem behoben.",
        masterImei: "m1",
        problemDescription: "Problem\n[ReplyTo] admin-user@example.com\n[Sender] Hans",
      };
      const afterRef = {
        update: jest.fn((upd: any) => {
          Object.assign(afterData, upd);
          return Promise.resolve();
        }),
      };
      const after = { data: () => afterData, ref: afterRef };
      const change = { before, after };
      await wrapped(change as any, { params: { ticketId: "ticket-updated" } } as any);

      expect((global as any).fetch).toHaveBeenCalled();
      expect(afterRef.update).toHaveBeenCalled();
    } finally {
      (global as any).fetch = origFetch;
      if (origResendKey !== undefined) process.env.RESEND_API_KEY = origResendKey;
      else delete process.env.RESEND_API_KEY;
      if (origFromEmail !== undefined) process.env.SUPPORT_FROM_EMAIL = origFromEmail;
      else delete process.env.SUPPORT_FROM_EMAIL;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// skipDebugMode — permission check branch (line 1017)
// ══════════════════════════════════════════════════════════════════════════

describe("skipDebugMode — branches", () => {
  it("wirft permission-denied für fremdes Ticket", async () => {
    state.supportTickets["ticket-foreign"] = {
      masterImei: "other-master", status: "open",
      conversationStatus: "awaiting_debug_consent",
    };

    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "ticket-foreign" }, asMaster))
      .rejects.toThrow(/access denied/i);
  });

  it("wirft failed-precondition wenn nicht awaiting_debug_consent", async () => {
    state.supportTickets["ticket-wrong-state"] = {
      masterImei: "m1", status: "open",
      conversationStatus: "analyzing",
    };

    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "ticket-wrong-state" }, asMaster))
      .rejects.toThrow(/not expected/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// getDebugInfo — permission + no debug access branch (line 1153)
// ══════════════════════════════════════════════════════════════════════════

describe("getDebugInfo — branches", () => {
  it("wirft permission-denied für fremdes Ticket als non-support", async () => {
    state.supportTickets["ticket-other"] = {
      masterImei: "other-master", status: "open",
      debugAccessGrantId: "grant-admin",
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-other" }, asMaster))
      .rejects.toThrow(/access denied/i);
  });

  it("wirft failed-precondition ohne debugAccessGrantId", async () => {
    state.supportTickets["ticket-no-debug"] = {
      masterImei: "m1", status: "open",
      // No debugAccessGrantId
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-no-debug" }, asMaster))
      .rejects.toThrow(/not activated/i);
  });

  it("wirft permission-denied bei inaktivem Grant", async () => {
    state.supportTickets["ticket-inactive-grant"] = {
      masterImei: "m1", status: "open",
      debugAccessGrantId: "grant-inactive",
    };
    state.supportAccessGrants["grant-inactive"] = {
      masterImei: "m1", ticketId: "ticket-inactive-grant", status: "revoked",
      expiresAt: makeExpiresAt(3600),
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-inactive-grant" }, asMaster))
      .rejects.toThrow(/not active/i);
  });

  it("erlaubt Admin-Zugriff auf fremdes Ticket mit Debug", async () => {
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    const res = await wrapped({ ticketId: "ticket-admin" }, asAdmin);
    expect(res).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROUND 2 — remaining uncovered branches
// ══════════════════════════════════════════════════════════════════════════

describe("ticket not found branches", () => {
  it("analyzeWithDebugData — wirft not-found bei fehlendem Ticket (line 881)", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    await expect(wrapped({ ticketId: "nonexistent-ticket" }, asMaster))
      .rejects.toThrow(/not found/i);
  });

  it("skipDebugMode — wirft not-found bei fehlendem Ticket (line 1017)", async () => {
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "nonexistent-ticket" }, asMaster))
      .rejects.toThrow(/not found/i);
  });

  it("getDebugInfo — wirft not-found bei fehlendem Ticket (line 1153)", async () => {
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "nonexistent-ticket" }, asMaster))
      .rejects.toThrow(/not found/i);
  });
});

describe("runAiAnalysisRound — solved path (lines 660,663,678-679)", () => {
  it("setzt Status auf closed bei hoher Confidence und needsMoreInfo=false", async () => {
    state.supportTickets["ticket-solve"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Einfaches Problem",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: false,
    };

    // Bypass test-stub: set NODE_ENV != "test" + provide GEMINI_API_KEY + mock fetch
    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origFetch = global.fetch;
    process.env.NODE_ENV = "production";
    process.env.GEMINI_API_KEY = "fake-key";

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({
              solution: "Neustart des Geräts löst das Problem.",
              confidence: 0.95,
              needsMoreInfo: false,
              nextQuestion: "Funktioniert jetzt alles?",
            })}],
          },
        }],
      }),
    });

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({ ticketId: "ticket-solve", userMessage: "Bitte analysieren" }, asMasterWithApp);
      expect(res.success).toBe(true);
      const ticket = state.supportTickets["ticket-solve"];
      expect(ticket.conversationStatus).toBe("closed");
      expect(ticket.status).toBe("closed_by_ai");
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      (global as any).fetch = origFetch;
    }
  });
});

describe("runAiAnalysisRound — escalated path (lines 681-682, 715)", () => {
  it("eskaliert Ticket nach MAX_CONVERSATION_ROUNDS gescheiterten Versuchen", async () => {
    // MAX_CONVERSATION_ROUNDS = 7 — need nextRound >= 7 && nextFailures >= 7
    state.supportTickets["ticket-escal"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Wiederkehrendes Problem",
      conversationStatus: "analyzing",
      conversationRound: 6, aiAttemptFailures: 6,
      accessGranted: false,
    };

    // Bypass test-stub for real Gemini-path JSON with needsMoreInfo=true + low confidence → not solved
    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origFetch = global.fetch;
    process.env.NODE_ENV = "production";
    process.env.GEMINI_API_KEY = "fake-key";

    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify({
              solution: "Leider konnte das Problem nicht gelöst werden.",
              confidence: 0.3,
              needsMoreInfo: true,
              nextQuestion: "Können Sie weitere Details liefern?",
            })}],
          },
        }],
      }),
    });

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({ ticketId: "ticket-escal", userMessage: "Immer noch kaputt" }, asMasterWithApp);
      expect(res.success).toBe(true);
      const ticket = state.supportTickets["ticket-escal"];
      expect(ticket.conversationStatus).toBe("escalated");
      expect(ticket.conversationRound).toBe(7);
      expect(ticket.aiAttemptFailures).toBe(7);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      (global as any).fetch = origFetch;
    }
  });
});

describe("onTicketCreated — error catch (lines 799-810)", () => {
  it("eskaliert Ticket bei Fehler in der Verarbeitung", async () => {
    // Create a minimal ticket snapshot
    const ticketData = {
      problemDescription: "Test problem",
      masterImei: "m1",
    };

    // Make the inner processing fail by having admin.firestore() calls fail
    // The onTicketCreated uses admin.firestore() directly (not db())
    const adminMod = require("firebase-admin");
    const origFirestore = adminMod.firestore;

    // First call to admin.firestore().collection("supportTickets").doc().update() should fail
    let callCount = 0;
    adminMod.firestore = Object.assign(
      () => ({
        collection: (_coll: string) => ({
          doc: (_id: string) => ({
            update: jest.fn(() => {
              callCount++;
              if (callCount === 1) {
                // First update fails → triggers catch block
                return Promise.reject(new Error("Firestore write failed"));
              }
              return Promise.resolve();
            }),
            get: () => Promise.resolve({ exists: true, data: () => ticketData }),
          }),
          add: jest.fn(() => Promise.resolve({ id: "auto-1" })),
        }),
      }),
      {
        Timestamp: origFirestore.Timestamp,
        FieldValue: origFirestore.FieldValue,
      }
    );

    try {
      const wrapped = testEnv.wrap(fns.onTicketCreated);
      const snap = {
        data: () => ticketData,
        ref: { id: "ticket-error-test" },
        id: "ticket-error-test",
      };
      // onTicketCreated catches the error and escalates, then re-throws
      await expect(wrapped(snap, { params: { ticketId: "ticket-error-test" } }))
        .rejects.toThrow(/Firestore write failed/);
    } finally {
      adminMod.firestore = origFirestore;
    }
  });
});

describe("collectDebugSnapshot — failure catch (line 624)", () => {
  it("fährt fort ohne Debug-Snapshot bei Fehler", async () => {
    // Ticket with debug access, but child data causes error
    state.supportTickets["ticket-debug-fail"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Problem mit Debug",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: true, debugAccessGrantId: "grant-debug-fail",
    };
    state.supportAccessGrants["grant-debug-fail"] = {
      masterImei: "m1", ticketId: "ticket-debug-fail", status: "active",
      expiresAt: makeExpiresAt(3600),
      debugScope: ["diagnostic_logs", "app_status"],
    };

    // Remove all children to cause collectDebugSnapshot to have issues
    // Capture the mock implementation BEFORE overriding to avoid recursive stack overflow
    const capturedMockImpl = (db.collection as jest.Mock).getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "children") {
        return {
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockRejectedValue(new Error("Children query failed")),
            }),
            get: jest.fn().mockRejectedValue(new Error("Children query failed")),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockRejectedValue(new Error("Children query failed")),
          }),
        } as any;
      }
      return capturedMockImpl!(...args);
    });

    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({
      ticketId: "ticket-debug-fail",
      userMessage: "Debug fehlgeschlagen",
    }, asMaster);
    // Should still succeed — collectDebugSnapshot failure is caught
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// formatDate — Timestamp and Date branches (lines 276, 279)
// ══════════════════════════════════════════════════════════════════════════

describe("formatDate — Timestamp/Date instanceof branches (lines 276, 279)", () => {
  it("formatiert Timestamp-Instanz korrekt via collectDebugSnapshot (line 276)", async () => {
    const admin = require("firebase-admin");
    // Add toDate() to MockTimestamp prototype for this test
    const proto = admin.firestore.Timestamp.prototype;
    const hadToDate = typeof proto.toDate === "function";
    if (!hadToDate) {
      proto.toDate = function (this: { seconds: number }) {
        return new Date(this.seconds * 1000);
      };
    }
    try {
      // Child data with real Timestamp instances
      const ts = new admin.firestore.Timestamp(1742900400, 0);
      state.children.c1.lastSeen = ts;
      state.children.c1.updatedAt = new Date("2026-03-25T11:00:00Z"); // Date instance for line 279

      state.supportTickets["ticket-ts"] = {
        masterImei: "m1", status: "analyzing",
        problemDescription: "Timestamp test",
        conversationStatus: "analyzing",
        conversationRound: 0, aiAttemptFailures: 0,
        accessGranted: true, debugAccessGrantId: "grant-active",
      };

      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      const res = await wrapped({ ticketId: "ticket-ts", userMessage: "Check timestamps" }, asMaster);
      expect(res.success).toBe(true);
    } finally {
      if (!hadToDate) delete proto.toDate;
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// generateWithGemini — AbortError catch (lines 127-130)
// ══════════════════════════════════════════════════════════════════════════

describe("generateWithGemini — AbortError (lines 127-130)", () => {
  it("wirft Timeout-Fehler bei AbortError", async () => {
    state.supportTickets["ticket-abort"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Abort test",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: false,
    };

    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origFetch = global.fetch;
    process.env.NODE_ENV = "production";
    process.env.GEMINI_API_KEY = "fake-key";

    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    (global as any).fetch = jest.fn().mockRejectedValue(abortError);

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      await expect(wrapped({ ticketId: "ticket-abort", userMessage: "Test" }, asMasterWithApp))
        .rejects.toThrow(/timeout|abort|30s/i);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      (global as any).fetch = origFetch;
    }
  });

  it("wirft non-AbortError weiter (line 130 rethrow)", async () => {
    state.supportTickets["ticket-rethrow"] = {
      masterImei: "m1", status: "analyzing",
      problemDescription: "Rethrow test",
      conversationStatus: "analyzing",
      conversationRound: 0, aiAttemptFailures: 0,
      accessGranted: false,
    };

    const origNodeEnv = process.env.NODE_ENV;
    const origGeminiKey = process.env.GEMINI_API_KEY;
    const origFetch = global.fetch;
    process.env.NODE_ENV = "production";
    process.env.GEMINI_API_KEY = "fake-key";

    (global as any).fetch = jest.fn().mockRejectedValue(new TypeError("Network failure"));

    try {
      const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
      await expect(wrapped({ ticketId: "ticket-rethrow", userMessage: "Test" }, asMasterWithApp))
        .rejects.toThrow(/Network failure/);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origGeminiKey !== undefined) process.env.GEMINI_API_KEY = origGeminiKey;
      else delete process.env.GEMINI_API_KEY;
      (global as any).fetch = origFetch;
    }
  });
});
