/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * E2E Ticket Lifecycle Integration Test
 *
 * Full flow:
 *   createSupportTicket (with access grant)
 *     → onTicketCreated (initial debug consent)
 *       → grantDebugAccess (activates debug)
 *         → analyzeWithDebugData (AI analysis round)
 *           → processUserReplyMessage (user follows up)
 *             → provideSolutionFeedback("accepted") → ticket closed
 *
 * Also tests the rejection path:
 *   provideSolutionFeedback("rejected") → ticket escalated
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
              return filters.every(({ field, value }) => (data as any)[field] === value);
            });
          }
          const docs = entries.map(([id, data]) => ({
            id, exists: true, data: () => data, ref: {
              delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
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
            if (!state[coll]) state[coll] = collData;
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
// FULL TICKET LIFECYCLE: create → consent → analyze → reply → accept
// ══════════════════════════════════════════════════════════════════════════

describe("E2E Ticket Lifecycle", () => {

  it("complete flow: create → onTicketCreated → grantDebug → analyze → reply → accept", async () => {
    // 1. Create ticket
    const createWrapped = testEnv.wrap(fns.createSupportTicket);
    const createRes = await createWrapped({
      problemDescription: "Die App stürzt beim Start ab.\n[ReplyTo] user@example.com\n[Name] Max Mustermann",
      allowSupportAccess: true,
    }, asMaster);

    expect(createRes.success).toBe(true);
    const ticketId = createRes.ticketId;
    expect(ticketId).toBeDefined();

    // Verify ticket + grant created in state
    expect(state.supportTickets[ticketId]).toBeDefined();
    expect(state.supportTickets[ticketId].status).toBe("open");

    // 2. Simulate onTicketCreated trigger
    const ticketSnap = {
      data: () => state.supportTickets[ticketId],
      id: ticketId,
    };
    const onCreateWrapped = testEnv.wrap(fns.onTicketCreated);
    await onCreateWrapped(ticketSnap as any, { params: { ticketId } } as any);

    // 3. Grant debug access
    // First update ticket to "awaiting_debug_consent" (as onTicketCreated would do)
    state.supportTickets[ticketId].conversationStatus = "awaiting_debug_consent";
    state.supportTickets[ticketId].masterImei = "m1";

    const grantWrapped = testEnv.wrap(fns.grantDebugAccess);
    const grantRes = await grantWrapped({ ticketId }, asMaster);
    expect(grantRes.success).toBe(true);

    // 4. Analyze with debug data
    // Update ticket state to match post-grant conditions
    const grantId = Object.keys(state.supportAccessGrants).find(
      (k) => state.supportAccessGrants[k]?.ticketId === ticketId
    );
    state.supportTickets[ticketId].debugAccessGrantId = grantId;
    state.supportTickets[ticketId].accessGranted = true;
    state.supportTickets[ticketId].conversationStatus = "analyzing";

    const analyzeWrapped = testEnv.wrap(fns.analyzeWithDebugData);
    const analyzeRes = await analyzeWrapped({ ticketId }, asMaster);
    expect(analyzeRes.success).toBe(true);
    expect(analyzeRes.status).toBeDefined();

    // 5. Reply from user
    state.supportTickets[ticketId].masterImei = "m1";
    state.supportTickets[ticketId].status = "awaiting_user_feedback";
    state.supportTickets[ticketId].conversationStatus = "waiting_user_response";
    state.supportTickets[ticketId].conversationRound = 1;
    state.supportTickets[ticketId].aiAttemptFailures = 0;

    const replyWrapped = testEnv.wrap(fns.processUserReplyMessage);
    const replyRes = await replyWrapped({ ticketId, message: "Danke, aber das Problem besteht weiterhin." }, asMaster);
    expect(replyRes.success).toBe(true);

    // 6. Accept solution feedback
    state.supportTickets[ticketId].masterImei = "m1";

    const feedbackWrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const feedbackRes = await feedbackWrapped({
      ticketId,
      feedback: "accepted",
    }, asMaster);
    expect(feedbackRes.success).toBe(true);
    expect(feedbackRes.message).toContain("closed_by_ai");
  });

  it("rejection flow: create → feedback rejected → escalated", async () => {
    // Setup: ticket was analysed, user rejects
    const ticketId = "t-reject";
    state.supportTickets[ticketId] = {
      masterImei: "m1",
      problemDescription: "Bluetooth-Problem",
      status: "awaiting_user_feedback",
      conversationStatus: "waiting_user_response",
      conversationRound: 1,
    };

    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const res = await wrapped({
      ticketId,
      feedback: "rejected",
      comment: "Die Lösung hat nicht geholfen.",
    }, asMaster);

    expect(res.success).toBe(true);
    expect(res.message).toContain("escalated");
  });

  it("skipDebugMode path: create → skip debug → analyze without debug data", async () => {
    const ticketId = "t-skip";
    state.supportTickets[ticketId] = {
      masterImei: "m1",
      problemDescription: "Allgemeines Problem mit der Kindersicherung.",
      status: "awaiting_user_feedback",
      conversationStatus: "awaiting_debug_consent",
      conversationRound: 0,
      aiAttemptFailures: 0,
    };

    const wrapped = testEnv.wrap(fns.skipDebugMode);
    const res = await wrapped({ ticketId }, asMaster);
    expect(res.success).toBe(true);
    expect(res.status).toBeDefined();
  });

  it("revokeSupportAccess after ticket resolution", async () => {
    const grantId = "g-lifecycle";
    state.supportAccessGrants[grantId] = {
      masterImei: "m1",
      ticketId: "t-lifecycle",
      status: "active",
    };
    state.supportTickets["t-lifecycle"] = {
      masterImei: "m1",
      accessGranted: true,
      accessGrantId: grantId,
    };

    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    const res = await wrapped({ grantId }, asMaster);
    expect(res.success).toBe(true);
    // Grant revoked, ticket updated
    expect(state.supportAccessGrants[grantId].status).toBe("revoked");
  });
});
