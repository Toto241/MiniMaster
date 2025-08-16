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

describe("validatePairingToken", () => {
  let myFunctions: any;
  let db: admin.firestore.Firestore;
  let collectionStub: jest.SpyInstance;
  let docStub: jest.Mock;
  let getStub: jest.Mock;
  let setStub: jest.Mock;
  let deleteStub: jest.Mock;

  beforeAll(() => {
    myFunctions = require("../index");
    db = getDbInstance();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    setStub = jest.fn().mockResolvedValue(undefined);
    getStub = jest.fn();
    deleteStub = jest.fn().mockResolvedValue(undefined);
    docStub = jest.fn().mockReturnValue({
      get: getStub,
      set: setStub,
      delete: deleteStub,
    });
    collectionStub = jest.spyOn(db, "collection").mockImplementation((collectionName: string) => {
        if (collectionName === "pairingTokens" || collectionName === "children") {
            return { doc: docStub };
        }
        return { doc: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  it("should validate a token and create a child profile", async () => {
    const future = new Date();
    future.setMinutes(future.getMinutes() + 1);
    const expiresAt = admin.firestore.Timestamp.fromDate(future);
    getStub.mockResolvedValue({
      exists: true,
      data: () => ({ masterImei: "parent-imei-123", expiresAt }),
    });

    const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
    const result = await wrapped({ pairingToken: "valid-token", childImei: "child-imei-456" });

    expect(result).toEqual({ childId: "parent-imei-123" });
    expect(collectionStub).toHaveBeenCalledWith("children");
    expect(setStub).toHaveBeenCalledTimes(1);
    expect(deleteStub).toHaveBeenCalledTimes(1);
  });

  it("should throw 'not-found' for an invalid token", async () => {
    getStub.mockResolvedValue({ exists: false });
    const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
    await expect(wrapped({ pairingToken: "invalid-token", childImei: "child-imei" })).rejects.toThrow(/Invalid pairing token/);
  });

  it("should throw 'deadline-exceeded' for an expired token", async () => {
    const past = new Date();
    past.setMinutes(past.getMinutes() - 1);
    const expiresAt = admin.firestore.Timestamp.fromDate(past);
    getStub.mockResolvedValue({
      exists: true,
      data: () => ({ masterImei: "parent-imei-123", expiresAt }),
    });

    const wrapped = testEnv.wrap(myFunctions.validatePairingToken);
    await expect(wrapped({ pairingToken: "expired-token", childImei: "child-imei" })).rejects.toThrow(/Pairing token has expired/);
    expect(deleteStub).toHaveBeenCalledTimes(1);
  });
});
