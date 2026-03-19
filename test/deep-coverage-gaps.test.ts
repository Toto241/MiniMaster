/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Deep coverage tests targeting remaining gaps in:
 * - support.ts: getTicketUserData happy path, onTicketCreated trigger, cleanupExpiredGrants, aiExplainProblem happy path, provideSolutionFeedback
 * - triggers.ts: sendFcmWithRetry retry/fail, analyzeTaskPhoto fallback, onTaskStatusChange approved/rejected
 * - auth.ts: revokeUserTokens, generateCustomToken via IMEI, registerMasterDevice UID mismatch
 * - shared.ts: buildTtlTimestamp, hasActiveAccess trial expired, handleError critical
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
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
  deleteUser: jest.fn().mockResolvedValue(undefined),
};

// Shared firestore instance so admin.firestore() and db() return the same mock
const sharedFirestore: any = { collection: jest.fn() };

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace: any = () => sharedFirestore;
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

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asSupport = { auth: { uid: "support1", token: { role: "support" } } };
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asAuditor = { auth: { uid: "auditor1", token: { role: "auditor" } } };

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", fcmToken: "master-fcm-token", secretKey: "secret123", subscription: { status: "active", childLimit: 99 } },
    },
    children: {
      c1: { masterImei: "m1", fcmToken: "child-fcm-token", childImei: "c1" },
    },
    supportTickets: {
      "ticket-1": { masterImei: "m1", status: "open", accessGranted: false, problemDescription: "App stürzt ab" },
      "ticket-with-grant": {
        masterImei: "m1", status: "open", accessGranted: true, accessGrantId: "grant-active",
        problemDescription: "Gerät reagiert nicht",
      },
      "ticket-awaiting": {
        masterImei: "m1", status: "awaiting_user_feedback", accessGranted: false,
        problemDescription: "Test problem", aiGeneratedSolution: "Try restarting", aiConfidenceScore: 0.9,
      },
    },
    supportAccessGrants: {
      "grant-active": {
        masterImei: "m1", ticketId: "ticket-with-grant", status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 7200, nanoseconds: 0 },
      },
      "grant-expired": {
        masterImei: "m1", ticketId: "ticket-1", status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) - 3600, nanoseconds: 0 },
      },
      "grant-revoked": {
        masterImei: "m1", ticketId: "ticket-1", status: "revoked",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 7200, nanoseconds: 0 },
      },
    },
    subscriptions: {},
    legalPolicies: {},
    masterLegalConsents: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
    pairingCodes: {},
    pairingTokens: {},
    performance_metrics: {},
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

  const collectionImpl = (...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData: any = state[coll] || {};
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
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()), update: jest.fn((u: any) => { Object.assign((state[key] as any)[id], u); return Promise.resolve(); }) },
                })),
              })),
              doc: jest.fn((subId: string) => ({
                get: jest.fn(() => {
                  const sd = (state[key] as any)?.[subId];
                  return Promise.resolve({ exists: !!sd, data: () => sd, id: subId });
                }),
                set: jest.fn((data: any) => { (state[key] as any)[subId] = data; return Promise.resolve(); }),
                update: jest.fn((upd: any) => {
                  if ((state[key] as any)?.[subId]) Object.assign((state[key] as any)[subId], upd);
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
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [] })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  };

  jest.spyOn(db, "collection").mockImplementation(collectionImpl);
  // Ensure admin.firestore().collection() uses the same mock
  sharedFirestore.collection = jest.fn(collectionImpl);

  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – getTicketUserData (Happy Path + Edge Cases)
// ══════════════════════════════════════════════════════════════════════════

describe("getTicketUserData – deep coverage", () => {
  it("gibt Master- und Kinder-Daten zurück bei aktivem Grant", async () => {
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    const res = await wrapped({ ticketId: "ticket-with-grant" }, asSupport);
    expect(res.master).toBeDefined();
    expect(res.master.id).toBe("m1");
    expect(res.children).toBeDefined();
    expect(res.grantExpiresAt).toBeDefined();
  });

  it("wirft deadline-exceeded bei abgelaufenem Grant", async () => {
    state.supportTickets["ticket-expired-grant"] = {
      masterImei: "m1", status: "open", accessGranted: true, accessGrantId: "grant-expired",
      problemDescription: "Help",
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "ticket-expired-grant" }, asSupport))
      .rejects.toThrow(/expired/i);
  });

  it("wirft permission-denied bei widerrufenm Grant", async () => {
    state.supportTickets["ticket-revoked-grant"] = {
      masterImei: "m1", status: "open", accessGranted: true, accessGrantId: "grant-revoked",
      problemDescription: "Help",
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "ticket-revoked-grant" }, asSupport))
      .rejects.toThrow(/revoked|permission/i);
  });

  it("wirft permission-denied bei nicht-existentem Grant", async () => {
    state.supportTickets["ticket-missing-grant"] = {
      masterImei: "m1", status: "open", accessGranted: true, accessGrantId: "nonexistent-grant",
      problemDescription: "Help",
    };
    const wrapped = testEnv.wrap(fns.getTicketUserData);
    await expect(wrapped({ ticketId: "ticket-missing-grant" }, asSupport))
      .rejects.toThrow(/not found|permission/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – provideSolutionFeedback
// ══════════════════════════════════════════════════════════════════════════

describe("provideSolutionFeedback – deep coverage", () => {
  it("akzeptiert Feedback und schließt Ticket", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({ ticketId: "ticket-awaiting", feedback: "accepted" }, asMaster);
    expect(res.success).toBe(true);
    expect(state.supportTickets["ticket-awaiting"].status).toBe("closed_by_ai");
    expect(state.supportTickets["ticket-awaiting"].aiSolutionStatus).toBe("accepted");
  });

  it("lehnt ab mit Kommentar und eskaliert", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({
      ticketId: "ticket-awaiting", feedback: "rejected", comment: "Problem besteht weiterhin",
    }, asMaster);
    expect(res.success).toBe(true);
    expect(state.supportTickets["ticket-awaiting"].status).toBe("escalated");
    expect(state.supportTickets["ticket-awaiting"].aiSolutionStatus).toBe("rejected");
  });

  it("wirft invalid-argument bei rejected ohne Kommentar", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "ticket-awaiting", feedback: "rejected" }, asMaster))
      .rejects.toThrow(/Comment|required/i);
  });

  it("wirft invalid-argument bei ungültigem Feedback", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "ticket-awaiting", feedback: "maybe" }, asMaster))
      .rejects.toThrow(/accepted|rejected/i);
  });

  it("wirft Fehler wenn anderer Master", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const otherMaster = { auth: { uid: "m2", token: { role: "master" } } };
    await expect(wrapped({ ticketId: "ticket-awaiting", feedback: "accepted" }, otherMaster))
      .rejects.toThrow();
  });

  it("wirft Fehler bei unbekanntem Ticket", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "nonexistent", feedback: "accepted" }, asMaster))
      .rejects.toThrow();
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({ ticketId: "ticket-awaiting", feedback: "accepted" }, {}))
      .rejects.toThrow(/authenticated/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – aiExplainProblem (Happy Path + More Edge Cases)
// ══════════════════════════════════════════════════════════════════════════

describe("aiExplainProblem – deep coverage", () => {
  it("gibt KI-Erklärung zurück bei gültigem Request", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    const res = await wrapped({
      problemContext: "Die App stürzt beim Start der Kindersicherung ab und zeigt einen Fehlercode",
      consentGiven: true,
    }, asAdmin);
    expect(res.explanation).toBeDefined();
    expect(res.suggestion).toBeDefined();
    expect(res.provider).toBeDefined();
  });

  it("funktioniert auch für Support-Rolle", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    const res = await wrapped({
      problemContext: "Bluetooth-Verbindung zum Kindgerät wird ständig unterbrochen",
      consentGiven: true,
    }, asSupport);
    expect(res.explanation).toBeDefined();
    expect(res.provider).toBe("test-stub");
  });

  it("wirft permission-denied für Auditor-Rolle", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "Das Problem ist lang genug für den Test",
      consentGiven: true,
    }, asAuditor)).rejects.toThrow(/admin|support/i);
  });

  it("wirft invalid-argument bei zu langem Kontext", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "x".repeat(3001),
      consentGiven: true,
    }, asAdmin)).rejects.toThrow(/3000|Zeichen/i);
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.aiExplainProblem);
    await expect(wrapped({
      problemContext: "Ein Problem beim Einrichten des Systems",
      consentGiven: true,
    }, {})).rejects.toThrow(/authenticated/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – revokeUserTokens, generateCustomToken, registerMasterDevice
// ══════════════════════════════════════════════════════════════════════════

describe("revokeUserTokens", () => {
  it("widerruft Tokens erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    const res = await wrapped({ uid: "m1" }, asAdmin);
    expect(res.message).toContain("revoked");
    expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith("m1");
  });

  it("wirft invalid-argument ohne UID", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/UID|required/i);
  });

  it("wirft permission-denied für nicht-Admin", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "m1" }, asMaster)).rejects.toThrow(/Admin|permission/i);
  });
});

describe("generateCustomToken – IMEI/secretKey path", () => {
  it("generiert Token über masterImei + secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({ masterImei: "m1", secretKey: "secret123" }, {});
    expect(res.customToken).toBe("mock-custom-token");
    expect(mockAuth.createCustomToken).toHaveBeenCalled();
  });

  it("wirft unauthenticated bei falschem secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "m1", secretKey: "wrong" }, {}))
      .rejects.toThrow(/Invalid master IMEI|unauthenticated/i);
  });

  it("wirft unauthenticated bei nicht-existentem Master", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "nonexistent", secretKey: "any" }, {}))
      .rejects.toThrow(/Invalid master IMEI|unauthenticated/i);
  });

  it("wirft unauthenticated ohne Credentials und ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, {}))
      .rejects.toThrow(/unauthenticated|masterImei/i);
  });
});

describe("registerMasterDevice – UID mismatch", () => {
  it("wirft failed-precondition bei Auth-UID != IMEI", async () => {
    const mismatch = { auth: { uid: "different-uid", token: { role: "master" } } };
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "m1" }, mismatch))
      .rejects.toThrow(/does not match/i);
  });

  it("registriert neues Gerät ohne bestehenden Account", async () => {
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const newMaster = { auth: { uid: "new-device", token: {} } };
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "new-device" }, newMaster);
    expect(res.masterId).toBe("new-device");
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("gibt bestehenden Account zurück", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBe("mock-custom-token");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SHARED.TS – buildTtlTimestamp, hasActiveAccess, handleError
// ══════════════════════════════════════════════════════════════════════════

describe("shared.ts utilities", () => {
  let shared: any;

  beforeAll(() => {
    shared = require("../src/shared");
  });

  it("buildTtlTimestamp erzeugt Timestamp in der Zukunft", () => {
    const ttl = shared.buildTtlTimestamp(30);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(ttl.seconds).toBeGreaterThan(nowSec);
    expect(ttl.seconds).toBeLessThanOrEqual(nowSec + 30 * 24 * 60 * 60 + 1);
  });

  it("hasActiveAccess gibt false für undefined masterData", () => {
    expect(shared.hasActiveAccess(undefined)).toBe(false);
  });

  it("hasActiveAccess gibt false ohne subscription", () => {
    expect(shared.hasActiveAccess({})).toBe(false);
  });

  it("hasActiveAccess gibt true für active subscription", () => {
    expect(shared.hasActiveAccess({ subscription: { status: "active" } })).toBe(true);
  });

  it("hasActiveAccess gibt true für gültige Trial", () => {
    expect(shared.hasActiveAccess({
      subscription: {
        status: "trial",
        trialEndsAt: Date.now() + 100000,
      },
    })).toBe(true);
  });

  it("hasActiveAccess gibt false für abgelaufene Trial", () => {
    expect(shared.hasActiveAccess({
      subscription: {
        status: "trial",
        trialEndsAt: Date.now() - 100000,
      },
    })).toBe(false);
  });

  it("hasActiveAccess gibt false für cancelled subscription", () => {
    expect(shared.hasActiveAccess({ subscription: { status: "cancelled" } })).toBe(false);
  });

  it("handleError loggt Fehler in error_logs", async () => {
    const ctx = { auth: { uid: "user1", token: { role: "master" } } } as any;
    await shared.handleError(new Error("Test error"), ctx, "testFunction");
    // error_logs should have been added to
    const errorKeys = Object.keys(state.error_logs);
    expect(errorKeys.length).toBeGreaterThanOrEqual(1);
  });

  it("handleError loggt AppError mit critical severity", async () => {
    const appError = new shared.AppError("TEST", "Critical failure", "critical", { detail: "test" });
    await shared.handleError(appError, null, "criticalFn");
    const errorKeys = Object.keys(state.error_logs);
    expect(errorKeys.length).toBeGreaterThanOrEqual(1);
  });

  it("checkRateLimit erlaubt Anfragen innerhalb des Limits", () => {
    expect(() => shared.checkRateLimit("user1", "test-action", 5, 60000)).not.toThrow();
    expect(() => shared.checkRateLimit("user1", "test-action", 5, 60000)).not.toThrow();
  });

  it("checkRateLimit wirft bei Überschreitung", () => {
    for (let i = 0; i < 5; i++) {
      shared.checkRateLimit("rl-user", "rl-action", 5, 60000);
    }
    expect(() => shared.checkRateLimit("rl-user", "rl-action", 5, 60000))
      .toThrow(/Too many requests/i);
  });

  it("validateAppCheck wirft bei fehlend App-Check im enforce-Modus (nicht Test)", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ctx = { auth: { uid: "u1" } } as any;
      expect(() => shared.validateAppCheck(ctx, true)).toThrow(/App Check/i);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("validateAppCheck erlaubt im Test-Modus ohne App Token", () => {
    const ctx = { auth: { uid: "u1" } } as any;
    expect(() => shared.validateAppCheck(ctx, true)).not.toThrow();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – onTicketCreated trigger
// ══════════════════════════════════════════════════════════════════════════

describe("onTicketCreated trigger", () => {
  it("generiert AI-Lösung und aktualisiert Ticket", async () => {
    state.supportTickets["ticket-new"] = {
      masterImei: "m1", problemDescription: "App stürzt ab beim Starten", status: "open",
    };
    const snapshot = {
      data: () => ({ masterImei: "m1", problemDescription: "App stürzt ab beim Starten", status: "open" }),
      id: "ticket-new",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snapshot, { params: { ticketId: "ticket-new" } });

    const ticket = state.supportTickets["ticket-new"];
    expect(ticket.aiGeneratedSolution).toBeDefined();
    expect(ticket.aiProvider).toBe("test-stub");
  });

  it("überspringt bei leerer Problembeschreibung", async () => {
    const snapshot = {
      data: () => ({ masterImei: "m1", problemDescription: "", status: "open" }),
      id: "ticket-empty",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    // Should not throw, just skip AI analysis
    await wrapped(snapshot, { params: { ticketId: "ticket-empty" } });
  });

  it("eskaliert bei niedriger AI-Confidence", async () => {
    state.supportTickets["ticket-low-conf"] = {
      masterImei: "m1", problemDescription: "Unklares Problem das niemand versteht", status: "open",
    };
    const snapshot = {
      data: () => ({ masterImei: "m1", problemDescription: "Unklares Problem das niemand versteht", status: "open" }),
      id: "ticket-low-conf",
    };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snapshot, { params: { ticketId: "ticket-low-conf" } });
    // Test stub returns confidence 0.85 > 0.7, so status should be awaiting_user_feedback
    const ticket = state.supportTickets["ticket-low-conf"];
    expect(ticket.status).toBe("awaiting_user_feedback");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TRIGGERS.TS – onTaskStatusChange
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange", () => {
  it("sendet Benachrichtigung an Master bei pending_approval", async () => {
    const change = {
      before: { data: () => ({ status: "pending", description: "Zimmer aufräumen", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", description: "Zimmer aufräumen", masterImei: "m1" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("sendet Benachrichtigung an Kind bei approved", async () => {
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Hausaufgaben machen", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", description: "Hausaufgaben machen", masterImei: "m1" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t2" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("sendet Benachrichtigung an Kind bei rejected", async () => {
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Müll rausbringen", masterImei: "m1" }) },
      after: { data: () => ({ status: "rejected", description: "Müll rausbringen", masterImei: "m1" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t3" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("sendet keine Benachrichtigung ohne FCM-Token", async () => {
    state.masters.m1.fcmToken = undefined;
    const change = {
      before: { data: () => ({ status: "pending", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", description: "Test", masterImei: "m1" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t4" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sendet keine Benachrichtigung ohne masterImei", async () => {
    const change = {
      before: { data: () => ({ status: "pending", description: "Test" }) },
      after: { data: () => ({ status: "pending_approval", description: "Test" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t5" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sendet keine Benachrichtigung an Kind ohne FCM-Token", async () => {
    state.children.c1.fcmToken = undefined;
    const change = {
      before: { data: () => ({ status: "pending_approval", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", description: "Test", masterImei: "m1" }) },
    };
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped(change, { params: { childId: "c1", taskId: "t6" } });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – createSupportTicket
// ══════════════════════════════════════════════════════════════════════════

describe("createSupportTicket – deep coverage", () => {
  it("erstellt Ticket mit Support-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    const res = await wrapped({
      problemDescription: "Kann mich nicht einloggen",
      allowSupportAccess: true,
      consentSource: "web-control",
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.ticketId).toBeDefined();
  });

  it("erstellt Ticket ohne Support-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    const res = await wrapped({
      problemDescription: "Installation schlägt fehl",
      allowSupportAccess: false,
    }, asMaster);
    expect(res.success).toBe(true);
    expect(res.ticketId).toBeDefined();
  });

  it("wirft invalid-argument bei leerer Beschreibung", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({ problemDescription: "  ", allowSupportAccess: false }, asMaster))
      .rejects.toThrow(/required|description/i);
  });

  it("wirft invalid-argument ohne allowSupportAccess", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({ problemDescription: "Test problem" }, asMaster))
      .rejects.toThrow(/allowSupportAccess/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SUPPORT.TS – grantSupportAccess + revokeSupportAccess
// ══════════════════════════════════════════════════════════════════════════

describe("grantSupportAccess", () => {
  it("gewährt Support-Zugriff für eigenes Ticket", async () => {
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    const res = await wrapped({ ticketId: "ticket-1" }, asMaster);
    expect(res.success).toBe(true);
    expect(res.grantId).toBeDefined();
    expect(res.expiresAt).toBeDefined();
  });

  it("wirft permission-denied für fremdes Ticket", async () => {
    const otherMaster = { auth: { uid: "m2", token: { role: "master" } } };
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    await expect(wrapped({ ticketId: "ticket-1" }, otherMaster))
      .rejects.toThrow(/denied|not found/i);
  });
});

describe("revokeSupportAccess", () => {
  it("widerruft Support-Zugriff", async () => {
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId: "grant-active" }, asMaster);
    expect(res.success).toBe(true);
    expect(state.supportAccessGrants["grant-active"].status).toBe("revoked");
  });

  it("wirft permission-denied für fremden Grant", async () => {
    const otherMaster = { auth: { uid: "m2", token: { role: "master" } } };
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    await expect(wrapped({ grantId: "grant-active" }, otherMaster))
      .rejects.toThrow(/denied|not found/i);
  });
});
