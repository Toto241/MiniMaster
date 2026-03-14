/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

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
  }

  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
    increment: (n: number) => `mock-increment-${n}`,
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
  };
});

const testEnv = fft();

let fns: any;
let db: any;
let getStub: jest.Mock;
let updateStub: jest.Mock;
let setStub: jest.Mock;
let deleteStub: jest.Mock;

const asMaster = { auth: { uid: "m1", token: { role: "master" } }, app: { appId: "test-app" } };
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test-app" } };
const asChild = { auth: { uid: "c1", token: {} }, app: { appId: "test-app" } };

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  getStub = jest.fn();
  updateStub = jest.fn();
  setStub = jest.fn();
  deleteStub = jest.fn();

  const childDoc = {
    get: getStub,
    update: updateStub,
    set: setStub,
    delete: deleteStub,
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: getStub,
        update: updateStub,
        set: setStub,
        delete: deleteStub,
      }),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    }),
  };

  jest.spyOn(db, "collection").mockImplementation(() => ({
    doc: jest.fn().mockReturnValue(childDoc),
    where: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
      where: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ empty: true, size: 0, docs: [] }),
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

// ==================== rejectTask Tests ====================

describe("rejectTask", () => {
  it("rejects a task that is in pending_approval status", async () => {
    // Mock: master doc exists
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    // Mock: child doc exists with matching masterImei
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    // Mock: task doc exists with pending_approval status
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: "pending_approval", title: "Clean room" }),
    });
    updateStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(fns.rejectTask);
    const result = await wrapped(
      { childId: "c1", taskId: "t1", reason: "Photo was blurry" },
      asMaster
    );

    expect(result).toEqual({ success: true });
    expect(updateStub).toHaveBeenCalled();
  });

  it("fails when task is not in pending_approval status", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: "assigned", title: "Clean room" }),
    });

    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(
      wrapped({ childId: "c1", taskId: "t1" }, asMaster)
    ).rejects.toThrow();
  });

  it("fails when required fields are missing", async () => {
    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(
      wrapped({ childId: "c1" }, asMaster)
    ).rejects.toThrow(/Missing required fields/);
  });

  it("fails when child does not belong to master", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({ masterImei: "other-master" }),
    });

    const wrapped = testEnv.wrap(fns.rejectTask);
    await expect(
      wrapped({ childId: "c1", taskId: "t1" }, asMaster)
    ).rejects.toThrow();
  });
});

// ==================== Rate Limiting Tests ====================

describe("Rate Limiting", () => {
  it("should not block requests within rate limit", async () => {
    // Test that a normal request goes through
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getStub.mockResolvedValueOnce({
      exists: true,
      data: () => ({ status: "pending_approval" }),
    });
    updateStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(fns.approveTask);
    const result = await wrapped({ childId: "c1", taskId: "t1" }, asMaster);
    expect(result).toEqual({ success: true });
  });
});

// ==================== exportUserData Tests ====================

describe("exportUserData", () => {
  it("fails when called without admin role", async () => {
    const wrapped = testEnv.wrap(fns.exportUserData);
    await expect(
      wrapped({ masterId: "m1" }, asMaster)
    ).rejects.toThrow();
  });

  it("fails when masterId is missing", async () => {
    const wrapped = testEnv.wrap(fns.exportUserData);
    await expect(
      wrapped({}, asAdmin)
    ).rejects.toThrow(/masterId is required/);
  });
});

// ==================== completeTask Validation Tests ====================

describe("completeTask validation", () => {
  it("requires both childId and taskId", async () => {
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1" }, asChild)).rejects.toThrow(
      /Missing required fields/
    );
  });

  it("requires taskId", async () => {
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ childId: "c1" }, asChild)).rejects.toThrow(
      /Missing required fields/
    );
  });
});

// ==================== approveTask Edge Cases ====================

describe("approveTask edge cases", () => {
  it("fails when task does not exist", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getStub.mockResolvedValueOnce({ exists: false });

    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(
      wrapped({ childId: "c1", taskId: "nonexistent" }, asMaster)
    ).rejects.toThrow();
  });

  it("fails when child does not exist", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: false });

    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(
      wrapped({ childId: "nonexistent", taskId: "t1" }, asMaster)
    ).rejects.toThrow();
  });
});
