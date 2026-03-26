/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for support.ts uncovered callable functions and helpers:
 * - grantDebugAccess, skipDebugMode, processUserReplyMessage, getDebugInfo
 * - analyzeWithDebugData
 * - onTicketCreated, onSupportTicketUpdated (triggers)
 * - collectDebugSnapshot, sendSupportFollowUpEmail (internal via callables)
 *
 * Target: support.ts coverage from 54% → 80%+
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

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

const mockMessaging = { send: mockSend };

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
    messaging: () => mockMessaging,
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
const asOtherMaster = { auth: { uid: "m2", token: { role: "master" } } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

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
        problemDescription: "Gerät friert ein\n[ReplyTo] user@example.com",
        conversationStatus: "waiting_user_response",
        conversationRound: 2, aiAttemptFailures: 1,
      },
      "ticket-closed": {
        masterImei: "m1", status: "closed_by_ai",
        problemDescription: "Altes Problem", conversationStatus: "closed",
        conversationRound: 3, aiAttemptFailures: 0,
      },
      "ticket-maxrounds": {
        masterImei: "m1", status: "awaiting_user_feedback",
        problemDescription: "Langes Problem",
        conversationStatus: "waiting_user_response",
        conversationRound: 7, aiAttemptFailures: 5,
      },
    },
    supportAccessGrants: {
      "grant-active": {
        masterImei: "m1", ticketId: "ticket-open", status: "active",
        expiresAt: makeExpiresAt(3600),
        debugScope: ["diagnostic_logs", "app_status", "system_info"],
      },
      "grant-expired": {
        masterImei: "m1", ticketId: "ticket-1", status: "active",
        expiresAt: makeExpiresAt(-3600),
        debugScope: ["diagnostic_logs"],
      },
      "grant-no-scope": {
        masterImei: "m1", ticketId: "ticket-open", status: "active",
        expiresAt: makeExpiresAt(3600),
        debugScope: ["app_status"],
      },
      "grant-inactive": {
        masterImei: "m1", ticketId: "ticket-open", status: "revoked",
        expiresAt: makeExpiresAt(3600),
        debugScope: ["diagnostic_logs"],
      },
    },
    subscriptions: {},
    legalPolicies: {},
    masterLegalConsents: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
  };
}

beforeAll(() => {
  process.env.OPENAI_API_KEY = "test-key";
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
        return Promise.resolve({ id });
      }),
      where: jest.fn(() => {
        // For children.where("masterImei", "==", "m1")
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
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [] })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db as any).runTransaction = jest.fn(async (fn: any) => {
    const tx = {
      get: jest.fn(async (ref: any) => ref.get()),
      update: jest.fn((ref: any, data: any) => ref.update(data)),
      set: jest.fn((ref: any, data: any) => ref.set(data)),
    };
    return fn(tx);
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// grantDebugAccess
// ══════════════════════════════════════════════════════════════════════════

describe("grantDebugAccess", () => {
  it("aktiviert Debug-Modus und startet AI-Analyse", async () => {
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    const res = await wrapped({ ticketId: "ticket-1" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.grantId).toBeDefined();
    expect(res.status).toBeDefined();
    // Ticket state updated
    expect(state.supportTickets["ticket-1"].conversationStatus).toBe("waiting_user_response");
    expect(state.supportTickets["ticket-1"].accessGranted).toBe(true);
    expect(state.supportTickets["ticket-1"].debugAccessGrantId).toBeDefined();
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    await expect(wrapped({ ticketId: "ticket-1" }, {})).rejects.toThrow(/authenticated/);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Ticket ID/);
  });

  it("wirft not-found bei unbekanntem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    await expect(wrapped({ ticketId: "nonexistent" }, asMaster)).rejects.toThrow(/not found/);
  });

  it("wirft permission-denied bei fremdem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    await expect(wrapped({ ticketId: "ticket-1" }, asOtherMaster)).rejects.toThrow(/denied/);
  });

  it("wirft failed-precondition bei falschem Status", async () => {
    state.supportTickets["ticket-1"].conversationStatus = "analyzing";
    const wrapped = testEnv.wrap(fns.grantDebugAccess);
    await expect(wrapped({ ticketId: "ticket-1" }, asMaster)).rejects.toThrow(/not expected/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// skipDebugMode
// ══════════════════════════════════════════════════════════════════════════

describe("skipDebugMode", () => {
  it("überspringt Debug und startet AI-Analyse ohne Debug-Daten", async () => {
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    const res = await wrapped({ ticketId: "ticket-1" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.status).toBeDefined();
    expect(state.supportTickets["ticket-1"].conversationStatus).not.toBe("awaiting_debug_consent");
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "ticket-1" }, {})).rejects.toThrow(/authenticated/);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Ticket ID/);
  });

  it("wirft permission-denied bei fremdem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "ticket-1" }, asOtherMaster)).rejects.toThrow(/denied/);
  });

  it("wirft failed-precondition bei falschem Status", async () => {
    state.supportTickets["ticket-1"].conversationStatus = "closed";
    const wrapped = testEnv.wrap(fns.skipDebugMode);
    await expect(wrapped({ ticketId: "ticket-1" }, asMaster)).rejects.toThrow(/not expected/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// processUserReplyMessage
// ══════════════════════════════════════════════════════════════════════════

describe("processUserReplyMessage", () => {
  it("verarbeitet Nutzerantwort und startet AI-Runde", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    const res = await wrapped({ ticketId: "ticket-open", message: "Ich habe das probiert" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.status).toBeDefined();
    expect(res.confidence).toBeDefined();
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "ticket-open", message: "test" }, {})).rejects.toThrow(/authenticated/);
  });

  it("wirft invalid-argument ohne message", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "ticket-open", message: "" }, asMaster)).rejects.toThrow(/required/);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "", message: "test" }, asMaster)).rejects.toThrow(/required/);
  });

  it("wirft permission-denied bei fremdem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "ticket-open", message: "test" }, asOtherMaster)).rejects.toThrow(/denied/);
  });

  it("wirft failed-precondition bei geschlossenem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "ticket-closed", message: "test" }, asMaster)).rejects.toThrow(/closed or escalated/);
  });

  it("wirft failed-precondition bei maximalen Runden", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "ticket-maxrounds", message: "test" }, asMaster)).rejects.toThrow(/Maximum AI rounds/);
  });

  it("wirft not-found bei unbekanntem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "nonexistent", message: "test" }, asMaster)).rejects.toThrow(/not found/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// analyzeWithDebugData
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeWithDebugData", () => {
  it("führt AI-Analyse als Ticket-Owner durch", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({ ticketId: "ticket-open" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.status).toBeDefined();
    expect(res.confidence).toBeDefined();
  });

  it("erlaubt Support/Admin-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({ ticketId: "ticket-open" }, asSupport);
    expect(res.success).toBe(true);
  });

  it("erlaubt Admin-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({ ticketId: "ticket-open" }, asAdmin);
    expect(res.success).toBe(true);
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    await expect(wrapped({ ticketId: "ticket-open" }, {})).rejects.toThrow(/authenticated/);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Ticket ID/);
  });

  it("wirft permission-denied bei fremdem Ticket als Master", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    await expect(wrapped({ ticketId: "ticket-open" }, asOtherMaster)).rejects.toThrow(/permission/);
  });

  it("akzeptiert optionale userMessage", async () => {
    const wrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const res = await wrapped({ ticketId: "ticket-open", userMessage: "Zusätzliche Info" }, asMaster);
    expect(res.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// getDebugInfo
// ══════════════════════════════════════════════════════════════════════════

describe("getDebugInfo", () => {
  it("gibt Debug-Snapshot für aktiven Grant zurück", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-active";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    const res = await wrapped({ ticketId: "ticket-open" }, asMaster);
    expect(res.ticketId).toBe("ticket-open");
    expect(res.grantId).toBe("grant-active");
    expect(res.snapshot).toBeDefined();
    expect(res.snapshot.appStatus).toBeDefined();
    expect(res.snapshot.networkDiagnostics).toBeDefined();
  });

  it("erlaubt Support-Zugriff auf fremdes Ticket", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-active";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    const res = await wrapped({ ticketId: "ticket-open" }, asSupport);
    expect(res.ticketId).toBe("ticket-open");
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-open" }, {})).rejects.toThrow(/authenticated/);
  });

  it("wirft invalid-argument ohne ticketId", async () => {
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Ticket ID/);
  });

  it("wirft failed-precondition ohne debugAccessGrantId", async () => {
    state.supportTickets["ticket-1"].debugAccessGrantId = undefined;
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-1" }, asMaster)).rejects.toThrow(/not activated/);
  });

  it("wirft permission-denied bei inaktivem Grant", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-inactive";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-open" }, asMaster)).rejects.toThrow(/not active/);
  });

  it("wirft deadline-exceeded bei abgelaufenem Grant", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-expired";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-open" }, asMaster)).rejects.toThrow(/expired/);
    expect(state.supportAccessGrants["grant-expired"].status).toBe("expired");
  });

  it("wirft permission-denied bei fehlendem diagnostic_logs Scope", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-no-scope";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-open" }, asMaster)).rejects.toThrow(/scope/);
  });

  it("wirft permission-denied bei fremdem Ticket als Master", async () => {
    state.supportTickets["ticket-open"].debugAccessGrantId = "grant-active";
    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "ticket-open" }, asOtherMaster)).rejects.toThrow(/denied/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// onTicketCreated (Firestore trigger)
// ══════════════════════════════════════════════════════════════════════════

describe("onTicketCreated", () => {
  it("initialisiert Debug-Consent-Flow und sendet FCM", async () => {
    state.supportTickets["new-ticket"] = {
      masterImei: "m1",
      problemDescription: "App stürzt ab\n[ReplyTo] user@example.com\n[Sender] Max",
      status: "open",
    };
    const snap = {
      data: () => state.supportTickets["new-ticket"],
      id: "new-ticket",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snap as any, { params: { ticketId: "new-ticket" } } as any);
    expect(state.supportTickets["new-ticket"].conversationStatus).toBe("awaiting_debug_consent");
    expect(mockSend).toHaveBeenCalled();
  });

  it("überspringt leere Problembeschreibung", async () => {
    const snap = {
      data: () => ({ masterImei: "m1", problemDescription: "", status: "open" }),
      id: "empty-ticket",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snap as any, { params: { ticketId: "empty-ticket" } } as any);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("behandelt fehlenden Master-FCM-Token gracefully", async () => {
    state.masters.m1.fcmToken = undefined;
    state.supportTickets["no-fcm-ticket"] = {
      masterImei: "m1", problemDescription: "Problem hier", status: "open",
    };
    const snap = {
      data: () => state.supportTickets["no-fcm-ticket"],
      id: "no-fcm-ticket",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snap as any, { params: { ticketId: "no-fcm-ticket" } } as any);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// onSupportTicketUpdated (Firestore trigger)
// ══════════════════════════════════════════════════════════════════════════

describe("onSupportTicketUpdated", () => {
  it("überspringt wenn adminResponse unverändert", async () => {
    const wrapped = testEnv.wrap(fns.onSupportTicketUpdated);
    const before = { data: () => ({ adminResponse: "Alt", masterImei: "m1", problemDescription: "test" }) };
    const after = { data: () => ({ adminResponse: "Alt", masterImei: "m1", problemDescription: "test" }) };
    const change = { before, after };
    await wrapped(change as any, { params: { ticketId: "ticket-1" } } as any);
  });

  it("überspringt wenn adminResponse leer", async () => {
    const wrapped = testEnv.wrap(fns.onSupportTicketUpdated);
    const before = { data: () => ({ adminResponse: "", masterImei: "m1", problemDescription: "test" }) };
    const after = { data: () => ({ adminResponse: "", masterImei: "m1", problemDescription: "test" }) };
    const change = { before, after };
    await wrapped(change as any, { params: { ticketId: "ticket-1" } } as any);
  });

  it("setzt skipped_invalid_reply_to bei fehlender Email", async () => {
    const wrapped = testEnv.wrap(fns.onSupportTicketUpdated);
    const before = { data: () => ({ adminResponse: "", masterImei: "m1", problemDescription: "Keine Email hier" }) };
    const afterRef = {
      update: jest.fn((upd: any) => {
        Object.assign(state.supportTickets["ticket-1"], upd);
        return Promise.resolve();
      }),
    };
    const after = {
      data: () => ({ adminResponse: "Neue Antwort", masterImei: "m1", problemDescription: "Keine Email hier" }),
      ref: afterRef,
    };
    const change = { before, after };
    await wrapped(change as any, { params: { ticketId: "ticket-1" } } as any);
    expect(state.supportTickets["ticket-1"].lastFollowUpEmailStatus).toBe("skipped_invalid_reply_to");
  });
});
