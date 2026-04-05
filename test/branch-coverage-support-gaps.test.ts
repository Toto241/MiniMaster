/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch-coverage: support.ts remaining gaps
 *
 * Targets:
 *   - cleanupExpiredGrants: grant without ticketId, batch.commit error
 *   - processUserReplyMessage: status=escalated
 *   - getDebugInfo: empty debugScope bypasses scope check
 *   - createSupportTicket: generic error in try → catch internal
 *   - provideSolutionFeedback: non-HttpsError → internal
 *   - onTicketCreated: invalid email in problemDescription
 *   - formatDate: Date instance branch
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
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
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

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asSupport = { auth: { uid: "s1", token: { role: "support" } } };

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
    operatorAccessKeys: {},
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
          let entries = Object.entries(collData);
          if (filters.length > 0) {
            entries = entries.filter(([, data]) => {
              return filters.every(({ field, op, value }) => {
                const actual = (data as any)[field];
                if (op === "<=" || op === ">=") {
                  const a = typeof actual === "object" && actual?.seconds !== undefined ? actual.seconds : actual;
                  const b = typeof value === "object" && (value as any)?.seconds !== undefined ? (value as any).seconds : value;
                  return op === "<=" ? a <= b : a >= b;
                }
                return actual === value;
              });
            });
          }
          const docs = entries.map(([id, data]) => ({
            id, exists: true, data: () => data, ref: {
              delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
              collection: jest.fn(() => ({ limit: jest.fn().mockReturnThis(), get: jest.fn(() => Promise.resolve({ size: 0, docs: [], empty: true })) })),
            },
          }));
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
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()), update: jest.fn(() => Promise.resolve()) },
                })),
              })),
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
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// CLEANUP EXPIRED GRANTS – grant without ticketId + batch.commit error
// ══════════════════════════════════════════════════════════════════════════

describe("cleanupExpiredGrants – uncovered branches", () => {

  it("processes grant without ticketId (skips ticket update)", async () => {
    // Grant with no ticketId → only grant gets status:"expired", no ticket update
    state.supportAccessGrants = {
      g1: {
        status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) - 3600, toMillis: () => Date.now() - 3600000 },
        // no ticketId field!
      },
    };

    const wrapped = testEnv.wrap(fns.cleanupExpiredGrants);
    const res = await wrapped({});
    expect(res).toBeNull();
    // Grant should be marked as expired
    expect(state.supportAccessGrants.g1.status).toBe("expired");
  });

  it("catches batch.commit error and returns null", async () => {
    state.supportAccessGrants = {
      g2: {
        status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) - 100, toMillis: () => Date.now() - 100000 },
        ticketId: "t1",
      },
    };

    // Make batch.commit throw
    (db as any).batch = jest.fn(() => ({
      update: jest.fn(),
      commit: jest.fn().mockRejectedValue(new Error("Batch commit failed")),
    }));

    const wrapped = testEnv.wrap(fns.cleanupExpiredGrants);
    const res = await wrapped({});
    expect(res).toBeNull(); // Error caught, returns null
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PROCESS USER REPLY – status "escalated" branch
// ══════════════════════════════════════════════════════════════════════════

describe("processUserReplyMessage – escalated status branch", () => {

  it("rejects reply on escalated ticket", async () => {
    state.supportTickets = {
      t1: {
        masterImei: "m1",
        status: "escalated",
        conversationStatus: "escalated",
        conversationRound: 3,
      },
    };

    const wrapped = testEnv.wrap(fns.processUserReplyMessage);
    await expect(wrapped({ ticketId: "t1", message: "Hallo" }, asMaster))
      .rejects.toHaveProperty("code", "failed-precondition");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET DEBUG INFO – explicit diagnostic scope required
// ══════════════════════════════════════════════════════════════════════════

describe("getDebugInfo – explicit diagnostic scope required", () => {

  it("rejects access when debugScope is empty array", async () => {
    state.supportTickets = {
      t1: {
        masterImei: "m1",
        debugAccessGrantId: "grant1",
      },
    };
    state.supportAccessGrants = {
      grant1: {
        masterImei: "m1",
        ticketId: "t1",
        status: "active",
        debugScope: [],
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 3600, toMillis: () => Date.now() + 3600000 },
      },
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "t1" }, asMaster)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("rejects access when debugScope field is missing", async () => {
    state.supportTickets = {
      t1: {
        masterImei: "m1",
        debugAccessGrantId: "grant2",
      },
    };
    state.supportAccessGrants = {
      grant2: {
        masterImei: "m1",
        ticketId: "t1",
        status: "active",
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 3600, toMillis: () => Date.now() + 3600000 },
      },
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "t1" }, asMaster)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("rejects access when grant does not belong to the ticket", async () => {
    state.supportTickets = {
      t1: {
        masterImei: "m1",
        debugAccessGrantId: "grant3",
      },
    };
    state.supportAccessGrants = {
      grant3: {
        masterImei: "other-master",
        ticketId: "other-ticket",
        status: "active",
        debugScope: ["diagnostic_logs"],
        expiresAt: { seconds: Math.floor(Date.now() / 1000) + 3600, toMillis: () => Date.now() + 3600000 },
      },
    };

    const wrapped = testEnv.wrap(fns.getDebugInfo);
    await expect(wrapped({ ticketId: "t1" }, asMaster)).rejects.toHaveProperty("code", "permission-denied");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CREATE SUPPORT TICKET – generic error in try → catch → throw internal
// ══════════════════════════════════════════════════════════════════════════

describe("createSupportTicket – internal error catch branch", () => {

  it("catches generic DB error and throws internal", async () => {
    // Make the .add() call throw a non-HttpsError
    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "supportTickets") {
        return {
          add: jest.fn().mockRejectedValue(new Error("Firestore write failed")),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            update: jest.fn(),
            set: jest.fn(),
          }),
        } as any;
      }
      return origImpl!.call(db, ...args);
    });

    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({
      problemDescription: "App stürzt ab wenn ich sie öffne",
      allowSupportAccess: false,
    }, asMaster)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PROVIDE SOLUTION FEEDBACK – non-HttpsError → internal
// ══════════════════════════════════════════════════════════════════════════

describe("provideSolutionFeedback – non-HttpsError in try", () => {

  it("wraps generic error as internal HttpsError", async () => {
    state.supportTickets = {
      t1: {
        masterImei: "m1",
        status: "awaiting_user_feedback",
      },
    };

    // Make the ticket ref update throw a non-HttpsError
    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "supportTickets") {
        return {
          doc: jest.fn((id: string) => ({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => state.supportTickets[id],
              id,
            }),
            update: jest.fn().mockRejectedValue(new Error("Unexpected DB failure")),
          })),
        } as any;
      }
      return origImpl!.call(db, ...args);
    });

    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    await expect(wrapped({
      ticketId: "t1",
      feedback: "accepted",
    }, asMaster)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ON TICKET CREATED – invalid email in problemDescription
// ══════════════════════════════════════════════════════════════════════════

describe("onTicketCreated – email handling branches", () => {

  it("skips email when ReplyTo contains invalid email address", async () => {
    const ticketData = {
      problemDescription: "Die App stürzt ab\n[ReplyTo] not-a-valid-email\n[Name] TestUser",
      masterImei: "m1",
    };
    state.supportTickets["t_email"] = ticketData;

    const snapshot = { data: () => ticketData, id: "t_email" };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snapshot as any, { params: { ticketId: "t_email" } } as any);

    // Email should NOT be sent (invalid address)
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips email when no ReplyTo present at all", async () => {
    const ticketData = {
      problemDescription: "Die App stürzt ab. Bitte helfen Sie mir. Das ist ein langes Problem.",
      masterImei: "m1",
    };
    state.supportTickets["t_noemail"] = ticketData;

    const snapshot = { data: () => ticketData, id: "t_noemail" };
    const wrapped = testEnv.wrap(fns.onTicketCreated);
    await wrapped(snapshot as any, { params: { ticketId: "t_noemail" } } as any);

    // No email should be sent
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
