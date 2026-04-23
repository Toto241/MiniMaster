/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Unit tests for verifyAppleTransaction (Apple App Store Server API v2).
 */
import fft from "firebase-functions-test";

process.env.APPLE_ISSUER_ID = "test-issuer";
process.env.APPLE_KEY_ID = "test-key-id";
process.env.APPLE_PRIVATE_KEY =
  "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIBLb8fHVlaYtbSySmZNr16Q+9wVf1E0XbRyB+rjNQ4xZoAcGBSuBBAAK\n-----END EC PRIVATE KEY-----";
process.env.APPLE_BUNDLE_ID = "com.minimaster.masterapp";
process.env.APPLE_ENVIRONMENT = "sandbox";

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: jest.fn() })),
}));

jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  firestore: () => ({ collection: jest.fn() }),
}));

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

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();

describe("verifyAppleTransaction", () => {
  let fns: any;

  beforeAll(() => {
    fns = require("../src/subscription");
  });

  afterAll(() => testEnv.cleanup());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns valid=true for active subscription with future expiry", async () => {
    const futureMs = Date.now() + 86400000;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            transactionId: "tx1",
            originalTransactionId: "otx1",
            productId: "minimaster.family_monthly",
            expiresDate: futureMs,
            purchaseDate: Date.now() - 86400000,
            environment: "Sandbox",
          },
        ],
      }),
    });

    const result = await fns.verifyAppleTransaction("otx1");
    expect(result.valid).toBe(true);
    expect(result.expiresDateMs).toBe(futureMs);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/inApps/v1/subscriptions/otx1"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
        }),
      })
    );
  });

  it("returns valid=false for expired subscription", async () => {
    const pastMs = Date.now() - 86400000;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            transactionId: "tx1",
            originalTransactionId: "otx1",
            productId: "minimaster.family_monthly",
            expiresDate: pastMs,
            purchaseDate: Date.now() - 172800000,
            environment: "Sandbox",
          },
        ],
      }),
    });

    const result = await fns.verifyAppleTransaction("otx1");
    expect(result.valid).toBe(false);
    expect(result.expiresDateMs).toBe(pastMs);
  });

  it("returns valid=false when Apple returns 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    const result = await fns.verifyAppleTransaction("otx-unknown");
    expect(result.valid).toBe(false);
  });

  it("throws when Apple API returns 500", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(fns.verifyAppleTransaction("otx1")).rejects.toThrow("Apple API returned 500");
  });

  it("throws failed-precondition when credentials are missing", async () => {
    delete process.env.APPLE_ISSUER_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;

    await jest.isolateModulesAsync(async () => {
      const isolated = require("../src/subscription");
      await expect(isolated.verifyAppleTransaction("otx1")).rejects.toMatchObject({
        code: "failed-precondition",
      });
    });
  });

  it("returns valid=false when data array is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    });

    const result = await fns.verifyAppleTransaction("otx1");
    expect(result.valid).toBe(false);
  });
});
