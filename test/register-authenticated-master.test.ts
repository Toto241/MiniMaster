/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for registerAuthenticatedMaster (modern auth flow).
 */
import fft from "firebase-functions-test";

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: {} }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
};

const docs: Record<string, any> = {};
const mockDbObj = {
  collection: jest.fn().mockReturnValue({
    doc: jest.fn().mockImplementation((id: string) => ({
      get: jest.fn().mockImplementation(() => {
        const data = docs[id];
        return Promise.resolve({
          exists: !!data,
          data: () => data || null,
          id,
        });
      }),
      set: jest.fn().mockImplementation((data: any) => {
        docs[id] = { ...data };
        return Promise.resolve();
      }),
      update: jest.fn().mockImplementation((data: any) => {
        docs[id] = { ...docs[id], ...data };
        return Promise.resolve();
      }),
    })),
  }),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace: any = () => mockDbObj;
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
  };
});

const testEnv = fft();
let fns: any;

beforeAll(() => {
  fns = require("../src/auth");
});

afterAll(() => testEnv.cleanup());

beforeEach(() => {
  Object.keys(docs).forEach((k) => delete docs[k]);
  jest.clearAllMocks();
});

describe("registerAuthenticatedMaster", () => {
  it("creates a new master document when authenticated and doc does not exist", async () => {
    const wrapped = testEnv.wrap(fns.registerAuthenticatedMaster);
    const result = await wrapped(
      { deviceId: "device-123", deviceName: "Test Device" },
      { auth: { uid: "m1", token: {} } }
    );
    expect(result).toEqual({ masterId: "m1" });
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("m1", {
      role: "master",
      masterId: "m1",
    });
  });

  it("updates metadata when master document already exists", async () => {
    docs["m1"] = {
      deviceId: "old-device",
      uid: "m1",
      role: "master",
      subscription: { status: "trial_pending" },
    };

    const wrapped = testEnv.wrap(fns.registerAuthenticatedMaster);
    const result = await wrapped(
      { deviceId: "device-123" },
      { auth: { uid: "m1", token: {} } }
    );
    expect(result).toEqual({ masterId: "m1" });
    expect(docs["m1"].lastSeenAt).toBeDefined();
  });

  it("throws unauthenticated when no auth context", async () => {
    const wrapped = testEnv.wrap(fns.registerAuthenticatedMaster);
    await expect(wrapped({ deviceId: "x" }, {})).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("uses deviceId fallback to uid when not provided", async () => {
    const wrapped = testEnv.wrap(fns.registerAuthenticatedMaster);
    const result = await wrapped({}, { auth: { uid: "m2", token: {} } });
    expect(result).toEqual({ masterId: "m2" });
  });

  it("throws permission-denied when App Check is missing in non-test env", async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const wrapped = testEnv.wrap(fns.registerAuthenticatedMaster);
      await expect(
        wrapped({}, { auth: { uid: "m1", token: {} } })
      ).rejects.toMatchObject({
        code: "permission-denied",
      });
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });
});
