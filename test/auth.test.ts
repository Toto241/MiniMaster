import fft from "firebase-functions-test";
import * as myFunctions from "../index";

const testEnv = fft();

const mockAuthInstance = {
  getUser: jest.fn(),
  createCustomToken: jest.fn(),
};

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
