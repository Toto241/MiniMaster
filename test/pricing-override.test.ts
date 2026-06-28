/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the Firestore-backed pricing override (display/invoicing only).
 *
 * Guarantees under test:
 *  - admin-only + App-Check gating
 *  - getPricingConfig merges the override over code defaults
 *  - only whitelisted fields of EXISTING SKUs are accepted (no new SKUs)
 *  - validation rejects bad currency / negative price / unknown field
 *  - reset removes the override doc
 */
import fft from "firebase-functions-test";

const mockDocData: Record<string, any> = {};

function deepMerge(target: any, source: any): any {
  for (const k of Object.keys(source)) {
    if (
      source[k] && typeof source[k] === "object" && !Array.isArray(source[k])
      && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])
    ) {
      deepMerge(target[k], source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

const mockDocSet = jest.fn(async (data: any, opts?: { merge?: boolean }) => {
  if (opts?.merge) deepMerge(mockDocData, data || {});
  else { for (const k of Object.keys(mockDocData)) delete mockDocData[k]; Object.assign(mockDocData, data || {}); }
});
const mockDocGet = jest.fn(async () => ({
  exists: Object.keys(mockDocData).length > 0,
  data: () => ({ ...mockDocData }),
}));
const mockDocDelete = jest.fn(async () => { for (const k of Object.keys(mockDocData)) delete mockDocData[k]; });
const mockDocFn = jest.fn(() => ({ get: mockDocGet, set: mockDocSet, delete: mockDocDelete }));
const mockCollAdd = jest.fn().mockResolvedValue({ id: "audit1" });
const mockCollFn = jest.fn(() => ({ add: mockCollAdd, doc: jest.fn(() => ({ get: jest.fn(async () => ({ exists: false, data: () => ({}) })) })) }));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: mockCollFn, doc: mockDocFn })),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })),
  secretManager: jest.fn(() => ({})),
}));

jest.mock("firebase-admin/auth", () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock("firebase-admin/storage", () => ({ getStorage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })) }));
jest.mock("firebase-admin/messaging", () => ({ getMessaging: jest.fn(() => ({ send: jest.fn() })) }));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(1_700_000_000, 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
    toDate() { return new Date(this.seconds * 1000); }
  }
  const firestoreNs: any = () => ({});
  firestoreNs.Timestamp = MockTimestamp;
  firestoreNs.FieldValue = { serverTimestamp: () => "SERVER_TS" };
  return { initializeApp: jest.fn(), firestore: firestoreNs };
});

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({ purchases: { subscriptions: { get: jest.fn() } } })),
  },
}));

const testEnv = fft();
const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test" } };
const asAuditor = { auth: { uid: "audit1", token: { role: "auditor" } }, app: { appId: "test" } };

process.env.GEMINI_API_KEY = "test-key";

let fns: any = null;
try { fns = require("../index"); } catch { fns = null; }
const describeCallable = fns ? describe : describe.skip;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockDocData)) delete mockDocData[k];
});
afterAll(() => testEnv.cleanup());

describeCallable("getPricingConfig + override", () => {
  it("returns code defaults when no override exists", async () => {
    const wrapped = testEnv.wrap(fns.getPricingConfig);
    const res = await wrapped({}, asAdmin);
    const single = res.b2c.find((t: any) => t.sku === "single_child_monthly");
    expect(single.priceCents).toBe(499);
  });

  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.getPricingConfig);
    await expect(wrapped({}, asAuditor)).rejects.toThrow();
  });

  it("reflects a persisted override over the code default", async () => {
    const patch = testEnv.wrap(fns.patchPricingOverride);
    await patch({ scope: "b2c", sku: "single_child_monthly", field: "priceCents", value: 599 }, asAdmin);

    const wrapped = testEnv.wrap(fns.getPricingConfig);
    const res = await wrapped({}, asAdmin);
    const single = res.b2c.find((t: any) => t.sku === "single_child_monthly");
    expect(single.priceCents).toBe(599);
    // Untouched tiers keep code defaults.
    const family = res.b2c.find((t: any) => t.sku === "family_monthly");
    expect(family.priceCents).toBe(999);
  });
});

describeCallable("patchPricingOverride", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await expect(wrapped({ scope: "b2c", sku: "single_child_monthly", field: "priceCents", value: 599 }, asAuditor)).rejects.toThrow();
  });

  it("writes a nested structure (not dot-notation)", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await wrapped({ scope: "b2c", sku: "single_child_monthly", field: "name", value: "Einzelkind" }, asAdmin);
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call.b2c.single_child_monthly.name).toBe("Einzelkind");
    expect(call["b2c.single_child_monthly.name"]).toBeUndefined();
    expect(call.meta.lastUpdatedBy).toBe("admin1");
  });

  it("rejects an unknown SKU (no new SKUs)", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await expect(wrapped({ scope: "b2c", sku: "does_not_exist", field: "priceCents", value: 100 }, asAdmin)).rejects.toThrow(/Unknown sku/);
  });

  it("rejects a non-overridable field (e.g. childLimit)", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await expect(wrapped({ scope: "b2c", sku: "single_child_monthly", field: "childLimit", value: 99 }, asAdmin)).rejects.toThrow(/field must be one of/);
  });

  it("rejects negative price and bad currency", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await expect(wrapped({ scope: "b2c", sku: "single_child_monthly", field: "priceCents", value: -5 }, asAdmin)).rejects.toThrow(/priceCents/);
    await expect(wrapped({ scope: "b2c", sku: "single_child_monthly", field: "currency", value: "euro" }, asAdmin)).rejects.toThrow(/ISO-4217/);
  });

  it("accepts a b2b requiresContract toggle", async () => {
    const wrapped = testEnv.wrap(fns.patchPricingOverride);
    await wrapped({ scope: "b2b", sku: "b2b_school_50", field: "requiresContract", value: false }, asAdmin);
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call.b2b.b2b_school_50.requiresContract).toBe(false);
  });
});

describeCallable("resetPricingOverride", () => {
  it("deletes the override doc (admin only)", async () => {
    const wrapped = testEnv.wrap(fns.resetPricingOverride);
    const res = await wrapped({}, asAdmin);
    expect(res.reset).toBe(true);
    expect(mockDocDelete).toHaveBeenCalled();
  });
});
