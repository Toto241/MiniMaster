import * as fft from "firebase-functions-test";
import * as admin from "firebase-admin";
import { db as getDbInstance } from "../firebase";

// Mock the entire firebase-admin module
jest.mock("firebase-admin", () => ({
  ...jest.requireActual("firebase-admin"), // Import and retain default exports
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

describe("Cloud Functions", () => {
  let myFunctions: any;
  let db: admin.firestore.Firestore;
  let collectionStub: jest.SpyInstance;
  let docStub: jest.Mock;
  let getStub: jest.Mock;
  let setStub: jest.Mock;
  let deleteStub: jest.Mock;
  let updateStub: jest.Mock;

  beforeAll(() => {
    myFunctions = require("../index");
    db = getDbInstance();
  });

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    // Reset mocks before each test
    setStub = jest.fn();
    getStub = jest.fn();
    deleteStub = jest.fn();
    updateStub = jest.fn();
    docStub = jest.fn().mockReturnValue({
      get: getStub,
      set: setStub,
      delete: deleteStub,
      update: updateStub,
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: setStub,
          update: updateStub,
        }),
      }),
    });
    collectionStub = jest.spyOn(db, "collection").mockReturnValue({
      doc: docStub,
    } as any);
  });

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe("createPairingCode", () => {
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

  describe("validatePairingToken", () => {
    beforeEach(() => {
        collectionStub.mockImplementation((collectionName: string) => {
            if (collectionName === "pairingTokens" || collectionName === "children") {
                return { doc: docStub };
            }
            return { doc: jest.fn() };
        });
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
});
