/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Manual Test Conversions
 *
 * Converts documented manual test scenarios from
 *   docs/TEST_SCENARIOS_SECURITY.md
 *   docs/TEST_SCENARIOS_AI_AGENT.md
 *   docs/TEST_SCENARIOS_TASK_UNLOCK.md
 * into automated unit tests.
 */
import fft from "firebase-functions-test";

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

const mockSetCustomUserClaims = jest.fn().mockResolvedValue(undefined);
const mockAuth: any = {
  setCustomUserClaims: mockSetCustomUserClaims,
  getUser: jest.fn().mockResolvedValue({ uid: "u1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

const supportTicketState: Record<string, any> = {};

const mockDb = {
  collection: jest.fn((name: string) => {
    if (name === "supportTickets") {
      return {
        doc: jest.fn((id: string) => ({
          get: jest.fn(() => {
            const data = supportTicketState[id];
            return Promise.resolve({
              exists: !!data,
              data: () => data,
              id,
            });
          }),
          update: jest.fn((upd: any) => {
            if (supportTicketState[id]) {
              Object.assign(supportTicketState[id], upd);
            }
            return Promise.resolve();
          }),
        })),
        add: jest.fn((data: any) => {
          const id = `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          supportTicketState[id] = { ...data, id };
          return Promise.resolve({ id });
        }),
      };
    }
    if (name === "masters") {
      return {
        doc: jest.fn((_id: string) => ({
          get: jest.fn(() => Promise.resolve({
            exists: true,
            data: () => ({ subscription: { status: "active", type: "family_monthly" } }),
          })),
        })),
      };
    }
    if (name === "children") {
      return {
        doc: jest.fn((_id: string) => ({
          get: jest.fn(() => Promise.resolve({
            exists: true,
            data: () => ({ masterImei: "m1" }),
          })),
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({
              set: jest.fn(() => Promise.resolve()),
            })),
          })),
        })),
      };
    }
    return {
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        update: jest.fn(() => Promise.resolve()),
        set: jest.fn(() => Promise.resolve()),
      })),
    };
  }),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDb),
  auth: jest.fn(() => mockAuth),
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
  const firestoreNamespace: any = () => mockDb;
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

beforeAll(() => {
  fns = require("../index");
});

afterAll(() => testEnv.cleanup());

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(supportTicketState).forEach((k) => delete supportTicketState[k]);
});

// ══════════════════════════════════════════════════════════════════════════
// SECURITY: Cloud Function Authorization
// (docs/TEST_SCENARIOS_SECURITY.md → SEC-CF-01 / SEC-CF-02)
// ══════════════════════════════════════════════════════════════════════════

describe("SEC-CF: setAdminClaim authorization", () => {
  it("SEC-CF-01: rejects setAdminClaim when caller is not admin", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    const asMaster = { auth: { uid: "m1", token: { role: "master" } } };

    await expect(wrapped({ uid: "target-user" }, asMaster)).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockSetCustomUserClaims).not.toHaveBeenCalled();
  });

  it("SEC-CF-02: allows setAdminClaim when caller is admin", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    const asAdmin = { auth: { uid: "a1", token: { role: "admin" } } };

    const res = await wrapped({ uid: "target-user" }, asAdmin);
    expect(res.message).toContain("Success");
    expect(mockSetCustomUserClaims).toHaveBeenCalledWith("target-user", { role: "admin" });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AI AGENT: Edge Cases
// (docs/TEST_SCENARIOS_AI_AGENT.md → AI-02 / AI-07)
// ══════════════════════════════════════════════════════════════════════════

describe("AI-Agent edge cases", () => {
  it("AI-02: rejects createSupportTicket with empty problem description", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    const asMaster = { auth: { uid: "m1", token: { role: "master" } } };

    await expect(
      wrapped({ problemDescription: "   ", allowSupportAccess: true }, asMaster)
    ).rejects.toMatchObject({ code: "invalid-argument" });

    await expect(
      wrapped({ problemDescription: "", allowSupportAccess: true }, asMaster)
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("AI-07: rejects provideSolutionFeedback for ticket owned by another user", async () => {
    const ticketId = "tk-unauthorized";
    supportTicketState[ticketId] = {
      masterImei: "m1",
      status: "awaiting_user_feedback",
    };

    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const asOther = { auth: { uid: "m2", token: { role: "master" } } };

    await expect(
      wrapped({ ticketId, feedback: "accepted" }, asOther)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("AI-07: accepts provideSolutionFeedback for ticket owned by caller", async () => {
    const ticketId = "tk-authorized";
    supportTicketState[ticketId] = {
      masterImei: "m1",
      status: "awaiting_user_feedback",
    };

    const wrapped = testEnv.wrap(fns.provideSolutionFeedback);
    const asOwner = { auth: { uid: "m1", token: { role: "master" } } };

    const res = await wrapped({ ticketId, feedback: "accepted" }, asOwner);
    expect(res.success).toBe(true);
    expect(supportTicketState[ticketId].status).toBe("closed_by_ai");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// TASK UNLOCK: Security boundaries
// (docs/TEST_SCENARIOS_TASK_UNLOCK.md → Testfall 3)
// ══════════════════════════════════════════════════════════════════════════

describe("Task unlock security boundaries", () => {
  it("rejects createTask for unauthenticated caller", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    const unauthenticated = { auth: undefined };

    await expect(
      wrapped({ childId: "c1", description: "Test task", deadlineISO: "2026-12-31T23:59:00Z" }, unauthenticated)
    ).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects createTask when master does not own the child", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    // Override mock so that masters collection returns valid master,
    // but children collection returns a child owned by another master.
    mockDb.collection.mockImplementation((name: string) => {
      if (name === "masters") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({
              exists: true,
              data: () => ({ subscription: { status: "active", type: "family_monthly" } }),
            })),
          })),
        };
      }
      if (name === "children") {
        return {
          doc: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({
              exists: true,
              data: () => ({ masterImei: "other-master" }),
            })),
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ set: jest.fn(() => Promise.resolve()) })),
            })),
          })),
        };
      }
      return {
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
        })),
      };
    });

    const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
    await expect(
      wrapped({ childId: "c1", description: "Test task", deadlineISO: "2026-12-31T23:59:00Z" }, asMaster)
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
});
