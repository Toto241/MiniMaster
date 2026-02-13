import fft from "firebase-functions-test";
import * as myFunctions from "../index";

const testEnv = fft();

const mockAuthInstance = {
  getUser: jest.fn(),
  createUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
  createCustomToken: jest.fn(),
};

const mockDbInstance = {
  collection: jest.fn(),
};

jest.mock("../firebase", () => ({
  db: () => mockDbInstance,
}));

jest.mock("firebase-admin", () => ({
  auth: () => mockAuthInstance,
  firestore: {
    Timestamp: {
      now: jest.fn(() => ({ seconds: 1234567890, nanoseconds: 0 })),
    },
    FieldValue: {
      serverTimestamp: jest.fn(),
    },
  },
}));

describe("refreshCustomToken", () => {
  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("liefert Token für authentifizierten Nutzer", async () => {
    const wrapped = testEnv.wrap(myFunctions.refreshCustomToken);
    mockAuthInstance.getUser.mockResolvedValue({ customClaims: { role: "master" } });
    mockAuthInstance.createCustomToken.mockResolvedValue("mock-custom-token");

    const result = await wrapped({}, { auth: { uid: "master-1", token: { role: "master" } } });

    expect(result).toEqual({ customToken: "mock-custom-token" });
    expect(mockAuthInstance.getUser).toHaveBeenCalledWith("master-1");
    expect(mockAuthInstance.createCustomToken).toHaveBeenCalledWith("master-1", { role: "master" });
  });

  it("wirft unauthenticated ohne Auth-Kontext", async () => {
    const wrapped = testEnv.wrap(myFunctions.refreshCustomToken);
    await expect(wrapped({})).rejects.toThrow(/authenticated/);
  });

  it("wirft internal bei Auth-Backend-Fehler", async () => {
    const wrapped = testEnv.wrap(myFunctions.refreshCustomToken);
    mockAuthInstance.getUser.mockRejectedValue(new Error("auth backend unavailable"));

    await expect(wrapped({}, { auth: { uid: "master-1", token: { role: "master" } } })).rejects.toThrow(/generating the token/i);
  });
});

describe("generateCustomToken (Bootstrap)", () => {
  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates token for master with valid IMEI and secretKey", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    
    // Mock Firestore master document
    const mockMasterDoc = {
      exists: true,
      data: () => ({ secretKey: "a".repeat(32) }),
    };
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockMasterDoc),
      }),
    });
    
    // Mock existing user
    mockAuthInstance.getUser.mockResolvedValue({ 
      uid: "123456789012345",
      customClaims: { role: "master" }
    });
    mockAuthInstance.createCustomToken.mockResolvedValue("mock-custom-token");

    const result = await wrapped({ 
      masterImei: "123456789012345", 
      secretKey: "a".repeat(32) 
    });

    expect(result).toEqual({ customToken: "mock-custom-token" });
    expect(mockAuthInstance.createCustomToken).toHaveBeenCalledWith(
      "123456789012345", 
      { role: "master", imei: "123456789012345" }
    );
  });

  it("throws invalid-argument for invalid IMEI format", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    
    await expect(wrapped({ 
      masterImei: "invalid", 
      secretKey: "a".repeat(32) 
    })).rejects.toThrow(/Invalid IMEI format/);
  });

  it("throws invalid-argument for invalid secretKey", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    
    await expect(wrapped({ 
      masterImei: "123456789012345", 
      secretKey: "short" 
    })).rejects.toThrow(/Invalid secretKey format/);
  });

  it("throws not-found if master device doesn't exist", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    });
    
    await expect(wrapped({ 
      masterImei: "123456789012345", 
      secretKey: "a".repeat(32) 
    })).rejects.toThrow(/Master device not found/);
  });

  it("throws permission-denied for wrong secretKey", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    
    const mockMasterDoc = {
      exists: true,
      data: () => ({ secretKey: "a".repeat(32) }),
    };
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockMasterDoc),
      }),
    });
    
    await expect(wrapped({ 
      masterImei: "123456789012345", 
      secretKey: "b".repeat(32) 
    })).rejects.toThrow(/Invalid credentials/);
  });
});

describe("generateChildToken", () => {
  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("generates token for paired child device", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateChildToken);
    
    // Mock Firestore child document
    const mockChildDoc = {
      exists: true,
      data: () => ({ masterImei: "123456789012345" }),
    };
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockChildDoc),
      }),
    });
    
    // Mock existing user
    mockAuthInstance.getUser.mockResolvedValue({ 
      uid: "987654321098765",
      customClaims: { role: "child" }
    });
    mockAuthInstance.createCustomToken.mockResolvedValue("mock-child-token");

    const result = await wrapped({ childImei: "987654321098765" });

    expect(result).toEqual({ customToken: "mock-child-token" });
    expect(mockAuthInstance.createCustomToken).toHaveBeenCalledWith(
      "987654321098765", 
      { role: "child", masterImei: "123456789012345" }
    );
  });

  it("throws invalid-argument for invalid IMEI format", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateChildToken);
    
    await expect(wrapped({ childImei: "invalid" })).rejects.toThrow(/Invalid IMEI format/);
  });

  it("throws not-found if child device doesn't exist", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateChildToken);
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
      }),
    });
    
    await expect(wrapped({ childImei: "987654321098765" })).rejects.toThrow(/Child device not found/);
  });

  it("throws internal error if child has no masterImei", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateChildToken);
    
    const mockChildDoc = {
      exists: true,
      data: () => ({ }),
    };
    
    mockDbInstance.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue(mockChildDoc),
      }),
    });
    
    await expect(wrapped({ childImei: "987654321098765" })).rejects.toThrow(/corrupted/);
  });
});
