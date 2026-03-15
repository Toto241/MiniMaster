/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

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
    const res = await wrapped({ token: "tok" }, asChild);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalledWith({ fcmToken: "tok" });
  });

  it("fails with not-found when child missing", async () => {
    getMock.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(fns.registerFcmToken);
    await expect(wrapped({ token: "tok" }, asChild)).rejects.toThrow(/Child device not found/);
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
    const res = await wrapped({ taskId: "t1", photoUrl: "http://img" }, asChild);
    expect(res).toEqual({ success: true });
    expect(updateMock).toHaveBeenCalled();
  });

  it("completeTask rejects invalid current status", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ status: "approved" }) });
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1", photoUrl: "p" }, asChild)).rejects.toThrow(/cannot transition/);
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
    await expect(wrapped({}, asMaster)).rejects.toThrow(/must include valid/);
  });
});

describe("setUsageRules", () => {
  it("sets usage rules for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateMock.mockResolvedValue(undefined);
    const wrapped = testEnv.wrap(fns.setUsageRules);
    const usageRules = { dailyLimitSeconds: 3600 };
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
    await expect(wrapped({ childId: "c" }, asMaster)).rejects.toThrow(/must include valid/);
  });
});

describe("createTask", () => {
  it("creates task for authorized master", async () => {
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
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
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "sec" }) });
    getMock.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "other" }) });
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({
      childId: "c1",
      description: "test",
      deadlineISO: "2025-12-31T23:59:59Z"
    }, asMaster)).rejects.toThrow(/not authorized/);
  });

  it("throws invalid-argument for missing fields", async () => {
    const wrapped = testEnv.wrap(fns.createTask);
    await expect(wrapped({ childId: "c1" }, asMaster)).rejects.toThrow(/Missing required fields/);
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
    expect(res).toEqual({ subscriptionStatus: { status: "active", type: "premium" }, hasAccess: true, childLimit: 1 });
  });

  it("returns none status if no subscription", async () => {
    getMock.mockResolvedValue({ exists: true, data: () => ({ secretKey: "sec" }) });
    const wrapped = testEnv.wrap(fns.getSubscriptionStatus);
    const res = await wrapped({}, asMaster);
    expect(res).toEqual({ subscriptionStatus: { status: "none" }, hasAccess: false, childLimit: 1 });
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
    await expect(wrapped({ usageMillis: 1000 }, asChild)).rejects.toThrow(/Missing required fields/);
  });

  it("throws invalid-argument for invalid usageMillis type", async () => {
    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    await expect(wrapped({ date: "2025-12-08", usageMillis: "not-a-number" }, asChild)).rejects.toThrow(/Missing required fields/);
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
