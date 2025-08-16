import * as fft from "firebase-functions-test";
import * as admin from "firebase-admin";
import { db as getDbInstance } from "../firebase";

// Mock the entire firebase-admin module
jest.mock("firebase-admin", () => ({
  ...jest.requireActual("firebase-admin"),
  firestore: () => ({
    collection: jest.fn(),
    Timestamp: {
      now: jest.fn(() => ({
        seconds: Math.floor(Date.now() / 1000),
      })),
      fromDate: (date: Date) => ({
        seconds: Math.floor(date.getTime() / 1000),
      }),
    },
  }),
}));

const testEnv = fft();

describe("createPairingCode", () => {
  let myFunctions: any;
  let db: admin.firestore.Firestore;
  let collectionStub: jest.SpyInstance;
  let docStub: jest.Mock;
  let getStub: jest.Mock;
  let setStub: jest.Mock;

  beforeAll(() => {
    myFunctions = require("../index");
    db = getDbInstance();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    setStub = jest.fn();
    getStub = jest.fn();
    docStub = jest.fn().mockReturnValue({
      get: getStub,
      set: setStub,
    });
    collectionStub = jest.spyOn(db, "collection").mockReturnValue({
      doc: docStub,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it("should create a unique pairing code successfully", async () => {
    getStub.mockResolvedValue({ exists: false });
    setStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(myFunctions.createPairingCode);
    const result = await wrapped({ childId: "test-child-123" });

    expect(result).toHaveProperty("pairingCode");
    expect(typeof result.pairingCode).toBe("string");
    expect(result.pairingCode.length).toBe(6);
    expect(collectionStub).toHaveBeenCalledWith("pairingCodes");
    expect(setStub).toHaveBeenCalledTimes(1);
  });

  it("should handle collision and retry", async () => {
    getStub.mockResolvedValueOnce({ exists: true });
    getStub.mockResolvedValueOnce({ exists: false });
    setStub.mockResolvedValue(undefined);

    const wrapped = testEnv.wrap(myFunctions.createPairingCode);
    const result = await wrapped({ childId: "test-child-456" });

    expect(result).toHaveProperty("pairingCode");
    expect(getStub).toHaveBeenCalledTimes(2);
    expect(setStub).toHaveBeenCalledTimes(1);
  });

  it("should throw 'invalid-argument' if childId is missing", async () => {
    const wrapped = testEnv.wrap(myFunctions.createPairingCode);
    await expect(wrapped({})).rejects.toThrow(/childId/);
  });

  it("should throw 'resource-exhausted' after max attempts", async () => {
    getStub.mockResolvedValue({ exists: true });

    const wrapped = testEnv.wrap(myFunctions.createPairingCode);
    await expect(wrapped({ childId: "test-child-789" })).rejects.toThrow(/Could not create a unique pairing code/);
    expect(getStub).toHaveBeenCalledTimes(10);
  });
});
