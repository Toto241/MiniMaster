/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

const mockDb = {
  collection: jest.fn((name: string) => ({
    doc: jest.fn(() => ({
      get: jest.fn(async () => {
        if (name === "masters") {
          return { exists: true, data: () => ({ subscription: { status: "active", type: "premium" } }) };
        }
        return { exists: true, data: () => ({ masterImei: "m1" }) };
      }),
      update: jest.fn(async () => undefined),
      set: jest.fn(async () => undefined),
      collection: jest.fn(() => ({ doc: jest.fn(() => ({ set: jest.fn(async () => undefined) })) })),
    })),
  })),
};

jest.mock("../../firebase", () => ({
  db: jest.fn(() => mockDb),
}));

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  return {
    ...original,
    firestore: {
      Timestamp: {
        now: jest.fn(() => ({ seconds: 1, nanoseconds: 0 })),
      },
      FieldValue: {
        serverTimestamp: jest.fn(() => "server-ts"),
      },
    },
    auth: () => ({
      getUser: jest.fn(async () => ({ customClaims: { role: "master" } })),
      createCustomToken: jest.fn(async () => "token-x"),
      setCustomUserClaims: jest.fn(async () => undefined),
    }),
  };
});

const testEnv = fft();
const fns = require("../../index");

describe("system: callable access control", () => {
  afterAll(() => testEnv.cleanup());

  it("blockiert unauthentifizierten Zugriff auf geschützte Funktionen", async () => {
    const setDeviceLocked = testEnv.wrap(fns.setDeviceLocked);
    await expect(setDeviceLocked({ childId: "c1", isLocked: true })).rejects.toThrow(/authenticated/);
  });

  it("erlaubt authentifizierten Zugriff und liefert Subscription-Status", async () => {
    const getSubscriptionStatus = testEnv.wrap(fns.getSubscriptionStatus);
    const result = await getSubscriptionStatus({}, { auth: { uid: "m1", token: { role: "master" } } });

    expect(result).toEqual({ subscriptionStatus: { status: "active", type: "premium" } });
  });
});
