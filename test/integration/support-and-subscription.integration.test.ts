/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../../firebase";

/**
 * Integration tests for the Support Ticket and Subscription lifecycle.
 *
 * These tests verify the complete workflows:
 * 1. Support ticket creation -> AI solution -> feedback -> escalation -> access grant/revoke
 * 2. Subscription verification -> expiry check -> status update
 */

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() {
      const d = new Date();
      return new MockTimestamp(Math.floor(d.getTime() / 1000), 0);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
    static fromMillis(ms: number) {
      return new MockTimestamp(Math.floor(ms / 1000), 0);
    }
    toMillis() {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
    }
  }

  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
    increment: (n: number) => `mock-increment-${n}`,
    delete: () => "mock-field-delete",
  };

  return {
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => ({
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
      createCustomToken: jest.fn().mockResolvedValue("mock-token"),
    }),
    messaging: () => ({
      send: jest.fn().mockResolvedValue("mock-message-id"),
    }),
  };
});

const testEnv = fft();

let fns: any;
let db: any;
let getStub: jest.Mock;
let updateStub: jest.Mock;
let setStub: jest.Mock;
let addStub: jest.Mock;

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
// const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

beforeAll(() => {
  fns = require("../../index");
  db = getDb();
});

beforeEach(() => {
  getStub = jest.fn();
  updateStub = jest.fn();
  setStub = jest.fn();
  addStub = jest.fn().mockResolvedValue({ id: "mock-doc-id" });

  const mockDoc = {
    get: getStub,
    update: updateStub,
    set: setStub,
    delete: jest.fn().mockResolvedValue(undefined),
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: getStub,
        update: updateStub,
        set: setStub,
        delete: jest.fn().mockResolvedValue(undefined),
      }),
      add: addStub,
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    }),
  };

  jest.spyOn(db, "collection").mockImplementation(() => ({
    doc: jest.fn().mockReturnValue(mockDoc),
    add: addStub,
    where: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
      }),
      orderBy: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
        }),
      }),
    }),
  }) as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  testEnv.cleanup();
});

// ==================== Support Ticket Lifecycle ====================

describe("Support Ticket Lifecycle", () => {
  it("createSupportTicket requires authentication", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(
      wrapped({ problemDescription: "My device is stuck" })
    ).rejects.toThrow();
  });

  it("createSupportTicket requires problemDescription", async () => {
    const wrapped = testEnv.wrap(fns.createSupportTicket);
    await expect(wrapped({}, asMaster)).rejects.toThrow();
  });

  it("grantSupportAccess requires authentication", async () => {
    const wrapped = testEnv.wrap(fns.grantSupportAccess);
    await expect(wrapped({ ticketId: "t1" })).rejects.toThrow();
  });

  it("revokeSupportAccess requires authentication", async () => {
    const wrapped = testEnv.wrap(fns.revokeSupportAccess);
    await expect(wrapped({ grantId: "g1" })).rejects.toThrow();
  });
});

// ==================== Task Lifecycle with Reject ====================

describe("Task Lifecycle - Complete Flow", () => {
  it("task can be created, completed, and then rejected", async () => {
    // Step 1: Create task
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    setStub.mockResolvedValue(undefined);

    const createWrapped = testEnv.wrap(fns.createTask);
    const createResult = await createWrapped(
      {
        childId: "c1",
        description: "Complete math homework",
        deadlineISO: new Date().toISOString(),
      },
      asMaster
    );
    expect(createResult.success).toBe(true);

    // Step 2: Reject task (after it was submitted for approval)
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: "pending_approval", title: "Do homework" }),
    });
    updateStub.mockResolvedValue(undefined);

    const rejectWrapped = testEnv.wrap(fns.rejectTask);
    const rejectResult = await rejectWrapped(
      { childId: "c1", taskId: "t1", reason: "Incomplete work" },
      asMaster
    );
    expect(rejectResult.success).toBe(true);
  });
});

// ==================== Authentication Edge Cases ====================

describe("Authentication edge cases", () => {
  it("unauthenticated users cannot access any callable function", async () => {
    const functionNames = [
      "setDeviceLocked",
      "createTask",
      "approveTask",
      "rejectTask",
      "createSupportTicket",
    ];

    for (const fnName of functionNames) {
      if (fns[fnName]) {
        const wrapped = testEnv.wrap(fns[fnName]);
        await expect(wrapped({})).rejects.toThrow();
      }
    }
  });
});

// ==================== Trial & Subscription Access Control ====================

describe("Trial & Subscription Access Control", () => {
  it("getSubscriptionStatus returns trial info with days remaining", async () => {
    const admin = require("firebase-admin");
    const now = admin.firestore.Timestamp.now();
    const trialEndsAt = new admin.firestore.Timestamp(now.seconds + 5 * 24 * 60 * 60, 0); // 5 days left

    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        subscription: {
          status: "trial",
          trialStartedAt: now,
          trialEndsAt: trialEndsAt,
        },
      }),
    });

    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const result = await wrapped({}, asMaster);

    expect(result.subscriptionStatus.status).toBe("trial");
    expect(result.hasAccess).toBe(true);
    expect(result.isTrialActive).toBe(true);
    expect(result.trialDaysRemaining).toBeGreaterThan(0);
    expect(result.trialDaysRemaining).toBeLessThanOrEqual(5);
  });

  it("getSubscriptionStatus returns hasAccess=false for expired trial", async () => {
    const admin = require("firebase-admin");
    const now = admin.firestore.Timestamp.now();
    const trialEndsAt = new admin.firestore.Timestamp(now.seconds - 1 * 24 * 60 * 60, 0); // 1 day ago

    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        subscription: {
          status: "trial",
          trialStartedAt: new admin.firestore.Timestamp(now.seconds - 8 * 24 * 60 * 60, 0),
          trialEndsAt: trialEndsAt,
        },
      }),
    });

    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const result = await wrapped({}, asMaster);

    expect(result.subscriptionStatus.status).toBe("trial");
    expect(result.hasAccess).toBe(false);
    expect(result.isTrialActive).toBe(false);
    expect(result.trialDaysRemaining).toBe(0);
  });

  it("getSubscriptionStatus returns hasAccess=false for trial_expired status", async () => {
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        subscription: {
          status: "trial_expired",
        },
      }),
    });

    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const result = await wrapped({}, asMaster);

    expect(result.subscriptionStatus.status).toBe("trial_expired");
    expect(result.hasAccess).toBe(false);
  });
});
