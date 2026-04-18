/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

const testEnv = fft();

const mockAuthInstance = {
  getUser: jest.fn(),
  createCustomToken: jest.fn(),
};

const mockDbObj = {
  collection: jest.fn(() => ({
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ exists: false, data: () => undefined })),
      update: jest.fn(() => Promise.resolve()),
      set: jest.fn(() => Promise.resolve()),
    })),
    add: jest.fn(() => Promise.resolve()),
  })),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuthInstance),
  storage: jest.fn(() => ({ bucket: jest.fn() })),
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

let myFunctions: any;

beforeAll(() => {
  // Lazy require AFTER jest.mock factories are registered to avoid TDZ on mockDbObj.
  myFunctions = require("../index");
});

describe("generateCustomToken", () => {
  afterAll(() => {
    testEnv.cleanup();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("liefert Token für authentifizierten Nutzer", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    mockAuthInstance.getUser.mockResolvedValue({ customClaims: { role: "master" } });
    mockAuthInstance.createCustomToken.mockResolvedValue("mock-custom-token");

    const result = await wrapped({}, { auth: { uid: "master-1", token: { role: "master" } } });

    expect(result).toEqual({ customToken: "mock-custom-token" });
    expect(mockAuthInstance.getUser).toHaveBeenCalledWith("master-1");
    expect(mockAuthInstance.createCustomToken).toHaveBeenCalledWith("master-1", { role: "master" });
  });

  it("wirft unauthenticated ohne Auth-Kontext", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    await expect(wrapped({})).rejects.toThrow(/authenticated/);
  });

  it("wirft internal bei Auth-Backend-Fehler", async () => {
    const wrapped = testEnv.wrap(myFunctions.generateCustomToken);
    mockAuthInstance.getUser.mockRejectedValue(new Error("auth backend unavailable"));

    await expect(wrapped({}, { auth: { uid: "master-1", token: { role: "master" } } })).rejects.toThrow(/generating the token/i);
  });
});
