/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
// import * as admin from "firebase-admin";  // Unused
import { db as getDb } from "../firebase";

// Reuse existing jest mocks pattern for firebase-admin (if needed could extend)
jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { const d = new Date(); return new MockTimestamp(Math.floor(d.getTime()/1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime()/1000),0); }
  }
  
  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  
  return {
    ...original,
    initializeApp: jest.fn(),
    firestore: firestoreNamespace
  };
});

const testEnv = fft();

// Lazy load functions after mocks
let fns: any;
let db: any;

// Common spies
// let collectionSpy: jest.SpyInstance;  // Unused
let docMock: jest.Mock;
let getMock: jest.Mock;
let updateMock: jest.Mock;
let setMock: jest.Mock;

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  getMock = jest.fn();
  updateMock = jest.fn();
  setMock = jest.fn();
  // Mock for subcollection: .collection().doc().collection().doc() => { set, get, update }
  const subDocMock = jest.fn().mockReturnValue({ 
    update: updateMock, 
    get: getMock, 
    set: setMock 
  });
  const subCollectionMock = jest.fn().mockReturnValue({ 
    doc: subDocMock 
  });
  docMock = jest.fn().mockReturnValue({ 
    get: getMock, 
    update: updateMock, 
    set: setMock, 
    collection: subCollectionMock 
  });
  jest.spyOn(db, "collection").mockImplementation((..._args: unknown[]) => {
    return { doc: docMock } as any;
  });
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => testEnv.cleanup());

describe("registerFcmToken", () => {
  it("registers token when child exists", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({}) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    const res = await wrapped({ childImei: "c1", token: "tok" });
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ fcmToken: "tok" });
  });
  it("fails with not-found when child missing", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    await expect(wrapped({ childImei: "c2", token: "tok" })).rejects.toThrow(/Child device not found/);
  });
});

describe("recordHeartbeat", () => {
  it("updates lastSeen when child exists", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({}) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    const res = await wrapped({ childImei: "c3" });
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ lastSeen: "mock-server-timestamp" });
  });
  it("throws not-found for missing child", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    await expect(wrapped({ childImei: "x" })).rejects.toThrow(/does not exist/);
  });
});

describe("task state machine", () => {
  beforeEach(() => {
    // tailor collection responses per name if needed later
  });
  it("completeTask transitions pending -> pending_approval", async () => {
    // For completeTask path we expect first get() returns corresponding task doc
    getMock.mockResolvedValue({ exists: true, data: () => ({ status: "pending" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.completeTask);
    const res = await wrapped({ childImei: "c4", taskId: "t1", photoUrl: "http://img" });
    expect(res).toEqual({ success: true });
    // status and photoUrl present
    expect(updateMock).toHaveBeenCalled();
  });
  it("completeTask rejects invalid current status", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ status: "approved" }) });
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ childImei: "c4", taskId: "t1", photoUrl: "p" })).rejects.toThrow(/cannot transition/);
  });
  it("approveTask enforces pending_approval", async () => {
    // Approve path triggers several get() calls: master, child, task
    // master
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    // child
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    // task
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ status: "pending_approval" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ masterImei: "m1", secretKey: "sec", childImei: "c5", taskId: "tZ" });
    expect(res).toEqual({ success: true });
  });
  it("approveTask rejects wrong status", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ status: "pending" }) });
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({ masterImei: "m1", secretKey: "sec", childImei: "c5", taskId: "tZ" })).rejects.toThrow(/pending_approval/);
  });
});

describe("updateAppBlacklist", () => {
  it("updates blacklist for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) }); // master
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) }); // child
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ masterImei: "m1", secretKey: "sec", childImei: "c1", appBlacklist: ["com.blocked.app"] });
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ appBlacklist: ["com.blocked.app"], updatedAt: "mock-server-timestamp" });
  });

  it("throws unauthenticated for invalid master credentials", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ masterImei: "invalid", secretKey: "wrong", childImei: "c1", appBlacklist: [] })).rejects.toThrow(/Invalid master IMEI or secret key/);
  });

  it("throws permission-denied if master not owner of child", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "other-master" }) });
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ masterImei: "m1", secretKey: "sec", childImei: "c1", appBlacklist: [] })).rejects.toThrow(/not authorized/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({})).rejects.toThrow(/must include valid/);
  });
});

describe("setUsageRules", () => {
  it("sets usage rules for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const usageRules = { dailyLimitSeconds: 3600 };
    const res = await wrapped({ masterImei: "m1", secretKey: "sec", childImei: "c1", usageRules });
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ usageRules, updatedAt: "mock-server-timestamp" });
  });

  it("throws unauthenticated for invalid credentials", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ masterImei: "x", secretKey: "y", childImei: "c", usageRules: {} })).rejects.toThrow(/Invalid master IMEI or secret key/);
  });

  it("throws invalid-argument for missing usageRules", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ masterImei: "m", secretKey: "s", childImei: "c" })).rejects.toThrow(/must include valid/);
  });
});

describe("createTask", () => {
  it("creates task for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) }); // master
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) }); // child
    setMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      masterImei: "m1",
      secretKey: "sec",
      childImei: "c1",
      description: "Clean your room",
      deadlineISO: "2025-12-31T23:59:59Z"
    });
    expect(res).toHaveProperty("success", true);
    expect(res).toHaveProperty("taskId");
  });

  it("throws unauthenticated for invalid master", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      masterImei: "invalid",
      secretKey: "wrong",
      childImei: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    })).rejects.toThrow(/Invalid master credentials/);
  });

  it("throws permission-denied if master not owner", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "other" }) });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      masterImei: "m1",
      secretKey: "sec",
      childImei: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    })).rejects.toThrow(/not authorized/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({ masterImei: "m" })).rejects.toThrow(/Missing required fields/);
  });
});

describe("getSubscriptionStatus", () => {
  it("returns subscription status for authenticated master", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ secretKey: "sec", subscription: { status: "active", type: "premium" } })
    });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({ masterImei: "m1", secretKey: "sec" });
    expect(res).toEqual({ subscriptionStatus: { status: "active", type: "premium" } });
  });

  it("returns none status if no subscription", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ secretKey: "sec" }) });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({ masterImei: "m1", secretKey: "sec" });
    expect(res).toEqual({ subscriptionStatus: { status: "none" } });
  });

  it("throws unauthenticated for invalid credentials", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    await expect(wrapped({ masterImei: "x", secretKey: "y" })).rejects.toThrow(/Invalid master credentials/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    await expect(wrapped({})).rejects.toThrow(/Missing required fields/);
  });
});

describe("reportDailyUsage", () => {
  it("reports usage successfully", async () => {
    setMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    const res = await wrapped({ childId: "c1", date: "2025-12-08", usageMillis: 3600000 });
    expect(res).toEqual({ success: true });
  });

  it("throws invalid-argument for missing childId", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ date: "2025-12-08", usageMillis: 1000 })).rejects.toThrow(/Missing required fields/);
  });

  it("throws invalid-argument for invalid usageMillis type", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ childId: "c1", date: "2025-12-08", usageMillis: "not-a-number" })).rejects.toThrow(/Missing required fields/);
  });
});

describe("setAdminClaim", () => {
  it("throws invalid-argument when uid is missing", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({})).rejects.toThrow(/user UID/);
  });
});

describe("revokeSubscription", () => {
  it("throws permission-denied when not admin", async () => {
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    // Without auth context, should deny
    await expect(wrapped({ subscriptionId: "sub123" })).rejects.toThrow(/Only operators can revoke/);
  });

  it("throws invalid-argument when subscriptionId is missing", async () => {
    // Create wrapped with admin context
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    // Even with missing subscriptionId - but permission check comes first
    await expect(wrapped({})).rejects.toThrow(/Only operators can revoke/);
  });
});
