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

const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  getStub = jest.fn();
  updateStub = jest.fn();
  setStub = jest.fn();

  const childDoc = {
    get: getStub,
    update: updateStub,
    set: setStub,
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: getStub,
        update: updateStub,
        set: setStub,
      }),
    }),
  };

  jest.spyOn(db, "collection").mockImplementation(() => ({
    doc: jest.fn().mockReturnValue(childDoc),
    where: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ empty: true, size: 0 }),
    }),
  }) as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  testEnv.cleanup();
});

describe("callable contracts", () => {
  it("setDeviceLocked setzt Sperrstatus", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    updateStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(fns.setDeviceLocked);
    const result = await wrapped({ childId: "c1", isLocked: true }, asMaster);

    expect(result).toEqual({ success: true, isLocked: true });
    expect(updateStub).toHaveBeenCalledWith({ isLocked: true, updatedAt: "mock-server-timestamp" });
  });

  it("getRulesForChild liefert Defaults", async () => {
    getStub.mockResolvedValue({ exists: true, data: () => ({}) });

    const wrapped = testEnv.wrap(fns.getRulesForChild);
    const result = await wrapped({ childId: "c1" });

    expect(result).toEqual({ isLocked: false, appBlacklist: [], usageRules: {} });
  });

  it("completeTask validiert benötigte Felder", async () => {
    const wrapped = testEnv.wrap(fns.completeTask);
    await expect(wrapped({ taskId: "t1" }, asChild)).rejects.toThrow(/Missing required fields/);
  });

  it("approveTask setzt approved bei pending_approval", async () => {
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({}) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "m1" }) });
    getStub.mockResolvedValueOnce({ exists: true, data: () => ({ status: "pending_approval" }) });
    updateStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(fns.approveTask);
    const result = await wrapped({ childId: "c1", taskId: "t1" }, asMaster);

    expect(result).toEqual({ success: true });
    expect(updateStub).toHaveBeenCalled();
  });

  it("reportDailyUsage speichert Tageswert", async () => {
    setStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(fns.reportDailyUsage);
    const result = await wrapped({ date: "2026-02-13", usageMillis: 12345 }, asChild);

    expect(result).toEqual({ success: true });
    expect(setStub).toHaveBeenCalled();
  });
});
