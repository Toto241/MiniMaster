/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Regression test for the iOS purchase product-binding fix.
 *
 * Bug (deep-analysis finding, critical): verifyPurchase trusted the client's
 * `sku` for the granted entitlement on iOS, while verifyAppleTransaction only
 * confirmed the receipt was valid and discarded the real productId. An
 * authenticated user with a genuine cheap subscription could request a
 * premium/B2B sku and receive its higher tier/limits.
 *
 * Fix: verifyAppleTransaction returns the verified productId; verifyPurchase
 * rejects the request when productId !== sku and only grants the verified tier.
 */
import fft from "firebase-functions-test";

process.env.APPLE_ISSUER_ID = "test-issuer";
process.env.APPLE_KEY_ID = "test-key-id";
process.env.APPLE_PRIVATE_KEY =
  "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBLb8fHVlaYtbSySmZNr16Q+9wVf1E0XbRyB+rjNQ4xZoAcGBSuBBAAK\n-----END EC PRIVATE KEY-----";
process.env.APPLE_BUNDLE_ID = "com.minimaster.masterapp";
process.env.APPLE_ENVIRONMENT = "sandbox";

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    createSign: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      sign: jest.fn().mockReturnValue("mocksignature"),
    })),
  };
});

// Minimal state-backed Firebase mock: only what verifyPurchase touches.
const mockState: { capturedUpdate: any } = { capturedUpdate: null };
jest.mock("../firebase", () => {
  const makeDoc = (coll: string) => ({
    get: async () => ({ exists: true, data: () => (coll === "masters" ? {} : {}) }),
    update: async (u: any) => { if (coll === "masters") mockState.capturedUpdate = u; },
    set: async () => undefined,
    delete: async () => undefined,
  });
  const makeColl = (coll: string) => ({
    doc: () => makeDoc(coll),
    add: async () => ({ id: "generated" }),
    where: () => ({
      orderBy() { return this; },
      limit() { return this; },
      get: async () => ({ empty: true, docs: [], size: 0, forEach() { /* none */ } }),
    }),
  });
  return {
    db: () => ({
      collection: makeColl,
      // Force the rate limiter onto its in-memory fallback (deterministic in tests).
      runTransaction: async () => { throw new Error("no firestore tx in unit test"); },
    }),
    auth: () => ({}),
    storage: () => ({}),
    secretManager: () => ({}),
  };
});

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();
const asMaster = { auth: { uid: "m1", token: {} } };

// Apple API returns an active subscription for the given productId.
function mockAppleReturns(productId: string) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      data: [
        {
          transactionId: "tx1",
          originalTransactionId: "otx1",
          productId,
          expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
          purchaseDate: Date.now() - 1000,
          environment: "Sandbox",
        },
      ],
    }),
  });
}

describe("verifyPurchase – iOS product binding", () => {
  let fns: any;
  beforeAll(() => { fns = require("../src/subscription"); });
  afterAll(() => testEnv.cleanup());
  beforeEach(() => { jest.clearAllMocks(); mockState.capturedUpdate = null; });

  it("REJECTS an iOS purchase whose claimed sku does not match the verified productId", async () => {
    mockAppleReturns("single_child_monthly"); // genuine cheap product
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    await expect(
      wrapped({ purchaseToken: "appletoken1", sku: "family_yearly", platform: "ios" }, asMaster)
    ).rejects.toMatchObject({ code: "permission-denied" });
    // No entitlement was granted.
    expect(mockState.capturedUpdate).toBeNull();
  });

  it("GRANTS only the verified tier when sku matches the verified productId", async () => {
    mockAppleReturns("single_child_monthly");
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    const res = await wrapped(
      { purchaseToken: "appletoken1", sku: "single_child_monthly", platform: "ios" },
      asMaster
    );
    expect(res).toMatchObject({ success: true });
    expect(mockState.capturedUpdate).not.toBeNull();
    const sub = mockState.capturedUpdate.subscription;
    expect(sub.type).toBe("single_child_monthly");
    // The cheap tier is NOT premium and has childLimit 1 — proving no escalation.
    expect(sub.isPremium).toBe(false);
    expect(sub.childLimit).toBe(1);
  });

  it("DENIES when the verified transaction has no productId", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ originalTransactionId: "otx1", expiresDate: Date.now() + 1000 }] }),
    });
    const wrapped = testEnv.wrap(fns.verifyPurchase);
    await expect(
      wrapped({ purchaseToken: "appletoken1", sku: "single_child_monthly", platform: "ios" }, asMaster)
    ).rejects.toMatchObject({ code: "permission-denied" });
    expect(mockState.capturedUpdate).toBeNull();
  });
});
