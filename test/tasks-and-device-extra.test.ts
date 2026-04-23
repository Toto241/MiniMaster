/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { const d = new Date(); return new MockTimestamp(Math.floor(d.getTime()/1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime()/1000),0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms/1000), 0); }
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

let fns: any;
let db: any;

let docMock: jest.Mock;
let getMock: jest.Mock;
let updateMock: jest.Mock;
let setMock: jest.Mock;

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  getMock = jest.fn();
  updateMock = jest.fn();
  setMock = jest.fn();
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
    const collectionMock: any = {
      doc: docMock,
      add: jest.fn().mockResolvedValue({ id: "mock-audit-id" }),
      where: jest.fn(() => collectionMock),
      orderBy: jest.fn(() => collectionMock),
      limit: jest.fn(() => collectionMock),
      get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
    };
    return collectionMock;
  });
  (db).batch = jest.fn(() => ({
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  }));
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => testEnv.cleanup());

describe("registerFcmToken", () => {
  it("registers token when child exists", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({}) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    const res = await wrapped({ token: "child-fcm-tok" }, asChild);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ fcmToken: "child-fcm-tok" });
  });

  it("fails with not-found when child missing", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    await expect(wrapped({ token: "child-fcm-tok" }, asChild)).rejects.toThrow(/Child device not found/);
  });
});

describe("recordHeartbeat", () => {
  it("updates lastSeen when child exists", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({}) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    const res = await wrapped({}, asChild);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ lastSeen: "mock-server-timestamp" });
  });

  it("throws not-found for missing child", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.recordHeartbeat);
    await expect(wrapped({}, asChild)).rejects.toThrow(/does not exist/);
  });
});

describe("task state machine", () => {
  it("completeTask transitions pending -> pending_approval", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ status: "pending" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.completeTask);
    const res = await wrapped({ taskId: "t1", photoUrl: "https://firebasestorage.googleapis.com/v0/b/minimaster/o/children%2Fc1%2Fphotos%2Fproof.jpg" }, asChild);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalled();
  });

  it("completeTask rejects invalid current status", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ status: "approved" }) });
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1", photoUrl: "https://firebasestorage.googleapis.com/v0/b/minimaster/o/children%2Fc1%2Fphotos%2Fproof.jpg" }, asChild)).rejects.toThrow(/cannot transition/);
  });

  it("completeTask rejects non-Firebase photo URLs", async () => {
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1", photoUrl: "https://example.com/proof.jpg" }, asChild)).rejects.toThrow(/Firebase Storage URL/);
  });

  it("completeTask rejects oversized photo URLs", async () => {
    const longUrl = `https://firebasestorage.googleapis.com/${"a".repeat(2050)}`;
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1", photoUrl: longUrl }, asChild)).rejects.toThrow(/must not exceed 2048 characters/);
  });

  it("completeTask throws not-found when task does not exist", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "missing", photoUrl: "https://firebasestorage.googleapis.com/v0/b/minimaster/o/children%2Fc1%2Fphotos%2Fproof.jpg" }, asChild)).rejects.toThrow(/does not exist/);
  });

  it("approveTask enforces pending_approval", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ status: "pending_approval" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.approveTask);
    const res = await wrapped({ childId: "c5", taskId: "tZ" }, asMaster);
    expect(res).toEqual({ success: true });
  });

  it("approveTask rejects wrong status", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ status: "pending" }) });
    const wrapped = testEnv.wrap(fns.approveTask);
    await expect(wrapped({ childId: "c5", taskId: "tZ" }, asMaster)).rejects.toThrow(/pending_approval/);
  });
});

describe("updateAppBlacklist", () => {
  it("updates blacklist for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: ["com.blocked.app"] }, asMaster);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ appBlacklist: ["com.blocked.app"], updatedAt: "mock-server-timestamp" });
  });

  it("throws not-found for missing master doc", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c1", appBlacklist: [] }, asMaster)).rejects.toThrow(/Master account not found/);
  });

  it("throws permission-denied if master not owner of child", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "other-master" }) });
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c1", appBlacklist: [] }, asMaster)).rejects.toThrow(/not authorized/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/childId is required/);
  });

  it("normalizes and deduplicates blacklist entries", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    const res = await wrapped({ childId: "c1", appBlacklist: [" com.blocked.app ", "com.blocked.app", "ios-app-token:abc"] }, asMaster);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ appBlacklist: ["com.blocked.app", "ios-app-token:abc"], updatedAt: "mock-server-timestamp" });
  });

  it("rejects non-string blacklist entries", async () => {
    const wrapped = testEnv.wrap(fns.updateAppBlacklist);
    await expect(wrapped({ childId: "c1", appBlacklist: [123] }, asMaster)).rejects.toThrow(/must be a string/);
  });
});

describe("setUsageRules", () => {
  it("sets usage rules for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const usageRules = { dailyLimit: 60, bedtimeStart: "21:00", bedtimeEnd: "07:00" };
    const res = await wrapped({ childId: "c1", usageRules }, asMaster);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ usageRules, updatedAt: "mock-server-timestamp" });
  });

  it("throws not-found for missing master doc", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ childId: "c", usageRules: {} }, asMaster)).rejects.toThrow(/Master account not found/);
  });

  it("throws invalid-argument for missing usageRules", async () => {
    const wrapped = testEnv.wrap(fns.setUsageRules);
    await expect(wrapped({ childId: "c" }, asMaster)).rejects.toThrow(/usageRules is required/);
  });
});

describe("getRulesForChild", () => {
  it("throws permission-denied when requester is neither owner nor child", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ masterImei: "other-master", isLocked: true, appBlacklist: ["com.example"], usageRules: { dailyLimitSeconds: 10 } }),
    });

    const wrapped = testEnv.wrap(fns.getRulesForChild);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/Not authorized/);
  });
});

describe("reportTamperEvent", () => {
  it("throws permission-denied when childId does not match caller", async () => {
    const wrapped = testEnv.wrap(fns.reportTamperEvent);
    await expect(
      wrapped({ childId: "c2", eventType: "accessibility_service_disabled", timestamp: Date.now() }, asChild)
    ).rejects.toThrow(/not authorized/i);
  });
});

describe("createTask", () => {
  it("creates task for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec", subscription: { status: "active" } }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    setMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.createTask);
    const res = await wrapped({
      childId: "c1",
      description: "Clean your room",
      deadlineISO: "2025-12-31T23:59:59Z"
    }, asMaster);
    expect(res).toHaveProperty("success", true);
    expect(res).toHaveProperty("taskId");
  });

  it("throws not-found for missing master", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    }, asMaster)).rejects.toThrow(/Master account not found/);
  });

  it("throws permission-denied if master not owner", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec", subscription: { status: "active" } }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "other" }) });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    }, asMaster)).rejects.toThrow(/not authorized/);
  });

  it("throws resource-exhausted without active subscription", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ subscription: { status: "expired" } }) });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    }, asMaster)).rejects.toThrow(/Active subscription or trial required/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/description is required/);
  });
});

describe("getSubscriptionStatus", () => {
  it("returns subscription status for authenticated master", async () => {
    getMock.mockResolvedValue({
      exists: true,
      data: () => ({ secretKey: "sec", subscription: { status: "active", type: "premium" } })
    });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res).toEqual({ subscriptionStatus: { status: "active", type: "premium" }, hasAccess: true, childLimit: 4, parentAppLimit: 2, expiresDateMs: null, originalTransactionId: null, platform: "unknown" });
  });

  it("returns none status if no subscription", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ secretKey: "sec" }) });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res).toEqual({ subscriptionStatus: { status: "none" }, hasAccess: false, childLimit: 4, parentAppLimit: 2, expiresDateMs: null, originalTransactionId: null, platform: "unknown" });
  });

  it("throws not-found if master document is missing", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Master account not found/);
  });
});

describe("reportDailyUsage", () => {
  it("reports usage successfully", async () => {
    setMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    const res = await wrapped({ date: "2025-12-08", usageMillis: 3600000 }, asChild);
    expect(res).toEqual({ success: true });
  });

  it("throws invalid-argument for missing date", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ usageMillis: 1000 }, asChild)).rejects.toThrow(/date is required/);
  });

  it("throws invalid-argument for invalid usageMillis type", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ date: "2025-12-08", usageMillis: "not-a-number" }, asChild)).rejects.toThrow(/usageMillis must be a number/);
  });
});

describe("setAdminClaim", () => {
  it("throws permission-denied when not admin", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Admin privileges required/);
  });
});

describe("revokeSubscription", () => {
  it("throws permission-denied when not admin", async () => {
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    await expect(wrapped({ subscriptionId: "sub123" }, asMaster)).rejects.toThrow(/Admin privileges required/);
  });

  it("throws invalid-argument when subscriptionId is missing", async () => {
    const wrapped = testEnv.wrap(fns.revokeSubscription);
    await expect(wrapped({}, { auth: { uid: "admin-1", token: { role: "admin" } } })).rejects.toThrow(/subscriptionId/);
  });
});
