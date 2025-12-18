
import fft from "firebase-functions-test";
import * as myFunctions from "../index";

const testEnv = fft();

// Create mock instances
const mockFirestoreInstance = {
  collection: jest.fn(),
  doc: jest.fn(),
};

const mockAuthInstance = {
  createCustomToken: jest.fn(),
};

// Mock ./firebase.ts
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockFirestoreInstance),
}));

// Mock firebase-admin
jest.mock("firebase-admin", () => ({
  auth: () => mockAuthInstance,
  firestore: {
    Timestamp: {
      now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    },
    FieldValue: {
      serverTimestamp: jest.fn(),
    }
  }
}));

describe("generateCustomToken", () => {

  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should generate a custom token for valid credentials", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);

    // Mock Firestore chain: db().collection("masters").doc(imei).get()
    const mockDoc = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ secretKey: "valid-secret" })
      })
    };

    mockFirestoreInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDoc)
    });

    // Mock Auth
    mockAuthInstance.createCustomToken.mockResolvedValue("mock-custom-token");

    const result = await wrapped({ masterImei: "valid-imei", secretKey: "valid-secret" });

    expect(result).toEqual({ customToken: "mock-custom-token" });
    expect(mockFirestoreInstance.collection).toHaveBeenCalledWith("masters");
    expect(mockDoc.get).toHaveBeenCalled();
    expect(mockAuthInstance.createCustomToken).toHaveBeenCalledWith("valid-imei", expect.objectContaining({ role: "master" }));
  });

  it("should throw error for invalid secret key", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);

    const mockDoc = {
      get: jest.fn().mockResolvedValue({
        exists: true,
        data: () => ({ secretKey: "real-secret" })
      })
    };

    mockFirestoreInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDoc)
    });

    await expect(wrapped({ masterImei: "valid-imei", secretKey: "wrong-secret" }))
      .rejects.toThrow("Invalid master IMEI or secret key");
  });

  it("should throw error if master does not exist", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);

    const mockDoc = {
      get: jest.fn().mockResolvedValue({
        exists: false
      })
    };

    mockFirestoreInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue(mockDoc)
    });

    await expect(wrapped({ masterImei: "unknown-imei", secretKey: "any-secret" }))
      .rejects.toThrow("Invalid master IMEI or secret key");
  });

  it("should throw error for missing arguments", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);

    // @ts-expect-error: Testing missing arguments
    await expect(wrapped({ masterImei: "valid-imei" }))
      .rejects.toThrow("The function must be called with a valid 'masterImei' and 'secretKey'");
  });
});
