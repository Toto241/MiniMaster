import fft from "firebase-functions-test";
import * as admin from "firebase-admin";
import { db as getDbInstance } from "../firebase";

// Mock the entire firebase-admin module
jest.mock("firebase-admin", () => {
  // We need a class that can be used with `instanceof`
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    toDate() {
      return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
    }
    static fromDate(date: Date) {
      const seconds = Math.floor(date.getTime() / 1000);
      const nanoseconds = date.getMilliseconds() * 1000000;
      return new MockTimestamp(seconds, nanoseconds);
    }
    static now() {
      const now = new Date();
      const seconds = Math.floor(now.getTime() / 1000);
      const nanoseconds = now.getMilliseconds() * 1000000;
      return new MockTimestamp(seconds, nanoseconds);
    }
  }

  const firestoreNamespace = () => ({
    collection: jest.fn(),
  });

  // Assign the class to the Timestamp property
  (firestoreNamespace as any).Timestamp = MockTimestamp;

  (firestoreNamespace as any).FieldValue = {
    serverTimestamp: () => "mock-server-timestamp",
  };

  return {
    ...jest.requireActual("firebase-admin"),
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
  };
});

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

    // Mock for where() queries
    const whereStub = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        empty: true,
        size: 0,
        forEach: jest.fn()
      })
    });

    collectionStub = jest.spyOn(db, "collection").mockReturnValue({
      doc: docStub,
      where: whereStub
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
      await expect(wrapped({ pairingToken: "invalid-token", childImei: "child-imei" })).rejects.toThrow(/Pairing token is invalid/); // Updated to match exact error message
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

  describe("validatePairingCode", () => {
    beforeEach(() => {
      collectionStub.mockImplementation((collectionName: string) => {
        if (collectionName === "pairingCodes") {
          return { doc: docStub };
        }
        return { doc: jest.fn() };
      });
    });

    it("should validate a code and return the childId", async () => {
      const future = new Date();
      future.setDate(future.getDate() + 1);
      const expiresAt = admin.firestore.Timestamp.fromDate(future);
      getStub.mockResolvedValue({
        exists: true,
        data: () => ({ childId: "test-child-123", expiresAt }),
      });

      const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
      const result = await wrapped({ pairingCode: "123456" });

      expect(result).toEqual({ childId: "test-child-123" });
      expect(deleteStub).toHaveBeenCalledTimes(1);
    });

    it("should throw 'not-found' for an invalid code", async () => {
      getStub.mockResolvedValue({ exists: false });
      const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
      await expect(wrapped({ pairingCode: "000000" })).rejects.toThrow(/Invalid pairing code/);
    });

    it("should throw 'deadline-exceeded' for an expired code", async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      const expiresAt = admin.firestore.Timestamp.fromDate(past);
      getStub.mockResolvedValue({
        exists: true,
        data: () => ({ childId: "test-child-123", expiresAt }),
      });

      const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
      await expect(wrapped({ pairingCode: "123456" })).rejects.toThrow(/Pairing code has expired/);
      expect(deleteStub).toHaveBeenCalledTimes(1);
    });

    it("should throw 'internal' if code data is missing", async () => {
      getStub.mockResolvedValue({ exists: true, data: () => undefined });
      const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
      await expect(wrapped({ pairingCode: "123456" })).rejects.toThrow(/Pairing code data is missing/);
    });

    it("should throw 'internal' if expiresAt is malformed", async () => {
        getStub.mockResolvedValue({
            exists: true,
            data: () => ({ childId: "test-child-123", expiresAt: "not-a-timestamp" }),
        });
        const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
        await expect(wrapped({ pairingCode: "123456" })).rejects.toThrow(/Invalid pairing code data structure/);
    });

    it("should throw 'internal' if childId is malformed", async () => {
        const future = new Date();
        future.setDate(future.getDate() + 1);
        const expiresAt = admin.firestore.Timestamp.fromDate(future);
        getStub.mockResolvedValue({
            exists: true,
            data: () => ({ childId: 123, expiresAt }), // Invalid childId
        });
        const wrapped = testEnv.wrap(myFunctions.validatePairingCode);
        await expect(wrapped({ pairingCode: "123456" })).rejects.toThrow(/Invalid pairing code data structure \(childId\)/);
    });
  });

  describe("registerMasterDevice", () => {
    beforeEach(() => {
      collectionStub.mockImplementation((collectionName: string) => {
        if (collectionName === "masters") {
          return { doc: docStub };
        }
        return { doc: jest.fn() };
      });
    });

    it("should register a new master device successfully", async () => {
      getStub.mockResolvedValue({ exists: false });
      setStub.mockResolvedValue(undefined);

      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);
      const result = await wrapped({ imei: "test-imei-123" });

      expect(result).toHaveProperty("secretKey");
      expect(typeof result.secretKey).toBe("string");
      expect(setStub).toHaveBeenCalledTimes(1);
    });

    it("should throw 'already-exists' if the device is already registered", async () => {
      getStub.mockResolvedValue({ exists: true });

      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);
      await expect(wrapped({ imei: "test-imei-123" })).rejects.toThrow(/This device has already been registered/);
    });

    it("should throw 'invalid-argument' if imei is missing", async () => {
      const wrapped = testEnv.wrap(myFunctions.registerMasterDevice);
      await expect(wrapped({})).rejects.toThrow(/The function must be called with a valid 'imei' string/);
    });
  });

  describe("generatePairingLink", () => {
    beforeEach(() => {
        collectionStub.mockImplementation((collectionName: string) => {
            if (collectionName === "masters" || collectionName === "pairingTokens") {
                return { doc: docStub };
            }
            // For children check (premium feature)
            if (collectionName === "children") {
                 return {
                     where: jest.fn().mockReturnValue({
                         get: jest.fn().mockResolvedValue({ empty: true, size: 0 })
                     })
                 };
            }
            return { doc: jest.fn() };
        });
    });

    it("should generate a pairing token successfully", async () => {
        getStub.mockResolvedValue({ exists: true, data: () => ({ secretKey: "valid-secret" }) });
        setStub.mockResolvedValue(undefined);

        const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
        const result = await wrapped({ imei: "test-imei-123", secretKey: "valid-secret" });

        expect(result).toHaveProperty("pairingToken");
        expect(typeof result.pairingToken).toBe("string");
        expect(setStub).toHaveBeenCalledTimes(1);
    });

    it("should throw 'unauthenticated' for an invalid imei or secret key", async () => {
        getStub.mockResolvedValue({ exists: false });

        const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
        await expect(wrapped({ imei: "invalid-imei", secretKey: "invalid-secret" })).rejects.toThrow(/Invalid IMEI or secret key/);
    });

    it("should throw 'invalid-argument' if imei or secretKey is missing", async () => {
        const wrapped = testEnv.wrap(myFunctions.generatePairingLink);
        await expect(wrapped({ imei: "test-imei" })).rejects.toThrow(/Request must include a valid 'imei' and 'secretKey'/);
        await expect(wrapped({ secretKey: "test-secret" })).rejects.toThrow(/Request must include a valid 'imei' and 'secretKey'/);
    });
  });

  describe("setDeviceLocked", () => {
    beforeEach(() => {
        collectionStub.mockImplementation((collectionName: string) => {
            if (collectionName === "masters" || collectionName === "children") {
                return { doc: docStub };
            }
            return { doc: jest.fn() };
        });
    });

    it("should set the device lock state to true", async () => {
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "valid-secret" }) }); // master
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "test-imei" }) }); // child
        updateStub.mockResolvedValue(undefined);

        const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
        const result = await wrapped({ masterImei: "test-imei", secretKey: "valid-secret", childImei: "child-imei", isLocked: true });

        expect(result).toEqual({ success: true, isLocked: true });
        expect(updateStub).toHaveBeenCalledWith({ isLocked: true, updatedAt: "mock-server-timestamp" });
    });

    it("should set the device lock state to false", async () => {
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "valid-secret" }) }); // master
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "test-imei" }) }); // child
        updateStub.mockResolvedValue(undefined);

        const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
        const result = await wrapped({ masterImei: "test-imei", secretKey: "valid-secret", childImei: "child-imei", isLocked: false });

        expect(result).toEqual({ success: true, isLocked: false });
        expect(updateStub).toHaveBeenCalledWith({ isLocked: false, updatedAt: "mock-server-timestamp" });
    });

    it("should throw 'unauthenticated' for invalid master credentials", async () => {
        getStub.mockResolvedValue({ exists: false });

        const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
        await expect(wrapped({ masterImei: "invalid-imei", secretKey: "invalid-secret", childImei: "child-imei", isLocked: true })).rejects.toThrow(/Invalid master IMEI or secret key/);
    });

    it("should throw 'permission-denied' if master is not authorized for the child", async () => {
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ secretKey: "valid-secret" }) }); // master
        getStub.mockResolvedValueOnce({ exists: true, data: () => ({ masterImei: "another-master" }) }); // child

        const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
        await expect(wrapped({ masterImei: "test-imei", secretKey: "valid-secret", childImei: "child-imei", isLocked: true })).rejects.toThrow(/This master device is not authorized/);
    });

    it("should throw 'invalid-argument' for missing arguments", async () => {
        const wrapped = testEnv.wrap(myFunctions.setDeviceLocked);
        await expect(wrapped({})).rejects.toThrow(/Request must include valid/);
    });
  });
});
