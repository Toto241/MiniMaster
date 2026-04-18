/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for periodic Play API re-verification.
 */

// --- Module-level mocks (must precede any require/import of subscription) ---
const mockSubscriptionsGet = jest.fn();
let docs: any[] = [];

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({
      purchases: { subscriptions: { get: mockSubscriptionsGet } },
    })),
  },
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const fns: any = () => ({});
  fns.Timestamp = MockTimestamp;
  fns.FieldValue = { serverTimestamp: () => "SERVER_TS" };
  return { initializeApp: jest.fn(), firestore: fns };
});

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(async () => ({ empty: docs.length === 0, docs })),
        })),
      })),
    })),
  })),
}));

import { computeReverifyUpdate, reverifyActiveSubscriptionsRun } from "../src/subscription";

const makeMaster = (id: string, sub: any) => ({
  id,
  data: () => ({ subscription: sub }),
  ref: { update: jest.fn().mockResolvedValue(undefined) },
});

describe("computeReverifyUpdate", () => {
  const NOW = Date.UTC(2026, 3, 18, 12, 0, 0);

  it("returns null when expiryTimeMillis is missing or invalid", () => {
    expect(computeReverifyUpdate({}, NOW)).toBeNull();
    expect(computeReverifyUpdate({ expiryTimeMillis: "not-a-number" } as any, NOW)).toBeNull();
  });

  it("marks expired when expiry is in the past", () => {
    const u = computeReverifyUpdate({ expiryTimeMillis: NOW - 1000 }, NOW);
    expect(u).not.toBeNull();
    expect(u!["subscription.status"]).toBe("expired");
    expect(u!["isPremium"]).toBe(false);
    expect(u!["subscription.expiredAt"]).toBeDefined();
  });

  it("flags on_hold when paymentState=0 (pending)", () => {
    const u = computeReverifyUpdate({
      expiryTimeMillis: NOW + 5 * 86_400_000,
      paymentState: 0,
      autoRenewing: true,
    }, NOW);
    expect(u!["subscription.status"]).toBe("on_hold");
    expect(u!["isPremium"]).toBe(false);
    expect(u!["subscription.autoRenewing"]).toBe(true);
  });

  it("marks canceled while preserving access until expiry when cancelReason set", () => {
    const cancelMs = NOW - 3600_000;
    const expiryMs = NOW + 10 * 86_400_000;
    const u = computeReverifyUpdate({
      expiryTimeMillis: expiryMs,
      cancelReason: 0,
      userCancellationTimeMillis: cancelMs,
      autoRenewing: false,
    }, NOW);
    expect(u!["subscription.status"]).toBe("canceled");
    expect(u!["subscription.cancelReason"]).toBe(0);
    expect(u!["isPremium"]).toBe(true);
    expect(u!["subscription.canceledAt"]).toBeDefined();
    expect(u!["subscription.autoRenewing"]).toBe(false);
  });

  it("keeps active and refreshes expiresAt for paid future-expiry subscriptions", () => {
    const expiryMs = NOW + 30 * 86_400_000;
    const u = computeReverifyUpdate({
      expiryTimeMillis: expiryMs,
      paymentState: 1,
      autoRenewing: true,
    }, NOW);
    expect(u!["subscription.status"]).toBe("active");
    expect(u!["isPremium"]).toBe(true);
    expect(u!["subscription.expiresAt"]).toBeDefined();
    expect(u!["subscription.autoRenewing"]).toBe(true);
  });

  it("treats free trial paymentState=2 as active", () => {
    const u = computeReverifyUpdate({
      expiryTimeMillis: NOW + 7 * 86_400_000,
      paymentState: 2,
      autoRenewing: true,
    }, NOW);
    expect(u!["subscription.status"]).toBe("active");
    expect(u!["isPremium"]).toBe(true);
  });
});

describe("reverifyActiveSubscriptionsRun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    docs = [];
  });

  it("returns zeros when no candidates", async () => {
    const r = await reverifyActiveSubscriptionsRun("com.minimaster.masterapp", 10);
    expect(r).toEqual({ scanned: 0, updated: 0, skipped: 0, errors: 0 });
  });

  it("skips masters without purchaseToken or type", async () => {
    docs = [
      makeMaster("m1", { status: "active" }),
      makeMaster("m2", { status: "active", purchaseToken: "abc" }),
    ];
    const r = await reverifyActiveSubscriptionsRun("pkg", 10);
    expect(r.scanned).toBe(0);
    expect(r.skipped).toBe(2);
    expect(mockSubscriptionsGet).not.toHaveBeenCalled();
  });

  it("updates a master when remote signals expiry", async () => {
    const m = makeMaster("m1", {
      status: "active",
      purchaseToken: "tok1",
      type: "family_monthly",
    });
    docs = [m];
    mockSubscriptionsGet.mockResolvedValueOnce({
      data: { expiryTimeMillis: Date.now() - 1000, paymentState: 1, autoRenewing: false },
    });
    const r = await reverifyActiveSubscriptionsRun("pkg", 10);
    expect(r.scanned).toBe(1);
    expect(r.updated).toBe(1);
    expect(m.ref.update).toHaveBeenCalledWith(expect.objectContaining({
      "subscription.status": "expired",
      "isPremium": false,
    }));
  });

  it("counts errors when Play API throws", async () => {
    const m = makeMaster("m1", {
      status: "active",
      purchaseToken: "tok1",
      type: "single_child_monthly",
    });
    docs = [m];
    mockSubscriptionsGet.mockRejectedValueOnce(new Error("403 forbidden"));
    const r = await reverifyActiveSubscriptionsRun("pkg", 10);
    expect(r.scanned).toBe(1);
    expect(r.errors).toBe(1);
    expect(m.ref.update).not.toHaveBeenCalled();
  });

  it("skips when remote response has no expiryTimeMillis", async () => {
    const m = makeMaster("m1", {
      status: "active",
      purchaseToken: "tok1",
      type: "family_yearly",
    });
    docs = [m];
    mockSubscriptionsGet.mockResolvedValueOnce({ data: {} });
    const r = await reverifyActiveSubscriptionsRun("pkg", 10);
    expect(r.scanned).toBe(1);
    expect(r.updated).toBe(0);
    expect(r.skipped).toBe(1);
    expect(m.ref.update).not.toHaveBeenCalled();
  });
});
