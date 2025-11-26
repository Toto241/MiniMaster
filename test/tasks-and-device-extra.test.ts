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
  docMock = jest.fn().mockReturnValue({ get: getMock, update: updateMock, set: setMock, collection: jest.fn().mockReturnValue({ doc: jest.fn().mockReturnValue({ update: updateMock, get: getMock }) }) });
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
