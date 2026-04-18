/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * RTDN (Real-Time Developer Notification) handler tests.
 * Covers:
 *  - decodeRtdnPayload: valid base64 JSON, invalid base64, missing data
 *  - applyRtdnNotification: each notificationType branch + unknown + missing token + test notification
 */
import * as admin from "firebase-admin";

// ── minimal firebase-admin mocks ───────────────────────────────────────────
const mockDocUpdate = jest.fn().mockResolvedValue(undefined);
const mockDocRef = { id: "m1", update: mockDocUpdate };
let mockSnapshotDocs: Array<{ id: string; ref: typeof mockDocRef }> = [];
const mockGet = jest.fn();
const mockLimit = jest.fn(() => ({ get: mockGet }));
const mockWhere = jest.fn(() => ({ limit: mockLimit }));
const mockCollection = jest.fn(() => ({ where: mockWhere }));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: mockCollection })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(1_700_000_000, 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNs: any = () => ({});
  firestoreNs.Timestamp = MockTimestamp;
  firestoreNs.FieldValue = { serverTimestamp: () => "SERVER_TS" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNs,
  };
});

// Avoid triggering other side effects when index.ts initializes.
jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({ purchases: { subscriptions: { get: jest.fn() } } })),
  },
}));

import { applyRtdnNotification, decodeRtdnPayload, RTDN_NOTIFICATION_TYPES } from "../src/subscription";

function setMasterFound(masterId = "m1") {
  mockSnapshotDocs = [{ id: masterId, ref: { ...mockDocRef, id: masterId, update: mockDocUpdate } }];
  mockGet.mockResolvedValue({ empty: false, size: 1, docs: mockSnapshotDocs });
}
function setMasterNotFound() {
  mockSnapshotDocs = [];
  mockGet.mockResolvedValue({ empty: true, size: 0, docs: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDocUpdate.mockResolvedValue(undefined);
});

describe("decodeRtdnPayload", () => {
  it("returns null on empty/undefined data", () => {
    expect(decodeRtdnPayload(undefined)).toBeNull();
    expect(decodeRtdnPayload(null)).toBeNull();
    expect(decodeRtdnPayload("")).toBeNull();
  });

  it("returns null on non-base64 garbage", () => {
    expect(decodeRtdnPayload("not-base64-json!!!")).toBeNull();
  });

  it("decodes a valid base64 JSON payload", () => {
    const raw = JSON.stringify({
      version: "1.0",
      packageName: "com.minimaster.masterapp",
      subscriptionNotification: {
        version: "1.0",
        notificationType: 2,
        purchaseToken: "tok-123",
        subscriptionId: "family_monthly",
      },
    });
    const encoded = Buffer.from(raw, "utf8").toString("base64");
    const decoded = decodeRtdnPayload(encoded);
    expect(decoded?.subscriptionNotification?.notificationType).toBe(2);
    expect(decoded?.subscriptionNotification?.purchaseToken).toBe("tok-123");
  });
});

describe("applyRtdnNotification", () => {
  it("handles test notifications without touching Firestore", async () => {
    const res = await applyRtdnNotification({ testNotification: { version: "1.0" } });
    expect(res).toEqual({ handled: true, reason: "test_notification" });
    expect(mockCollection).not.toHaveBeenCalled();
  });

  it("returns missing_subscription_notification when payload lacks required fields", async () => {
    const res = await applyRtdnNotification({});
    expect(res.handled).toBe(false);
    expect(res.reason).toBe("missing_subscription_notification");
  });

  it("returns master_not_found when no master matches purchaseToken", async () => {
    setMasterNotFound();
    const res = await applyRtdnNotification({
      subscriptionNotification: { notificationType: 2, purchaseToken: "ghost", subscriptionId: "family_monthly" },
    });
    expect(res.handled).toBe(false);
    expect(res.reason).toBe("master_not_found");
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });

  it("RENEWED: sets status=active, advances expiresAt, sets isPremium=true", async () => {
    setMasterFound();
    const res = await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.RENEWED,
        purchaseToken: "tok",
        subscriptionId: "single_child_monthly",
      },
    });
    expect(res.handled).toBe(true);
    expect(mockDocUpdate).toHaveBeenCalledTimes(1);
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("active");
    expect(upd["subscription.expiresAt"]).toBeInstanceOf(admin.firestore.Timestamp);
    expect(upd["isPremium"]).toBe(true);
    expect(upd["subscription.lastNotificationType"]).toBe(RTDN_NOTIFICATION_TYPES.RENEWED);
  });

  it("CANCELED: marks canceled and records canceledAt", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.CANCELED,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("canceled");
    expect(upd["subscription.canceledAt"]).toBeDefined();
  });

  it("ON_HOLD: clears premium, status=on_hold", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.ON_HOLD,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("on_hold");
    expect(upd["isPremium"]).toBe(false);
  });

  it("PAUSED: status=paused, isPremium=false", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.PAUSED,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("paused");
    expect(upd["isPremium"]).toBe(false);
  });

  it("IN_GRACE_PERIOD: status=grace_period", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.IN_GRACE_PERIOD,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("grace_period");
  });

  it("REVOKED: status=revoked, isPremium=false, records revokedAt", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.REVOKED,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("revoked");
    expect(upd["subscription.revokedAt"]).toBeDefined();
    expect(upd["isPremium"]).toBe(false);
  });

  it("EXPIRED: status=expired, isPremium=false, records expiredAt", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.EXPIRED,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("expired");
    expect(upd["subscription.expiredAt"]).toBeDefined();
    expect(upd["isPremium"]).toBe(false);
  });

  it("PURCHASED: status=active, isPremium=true, expiresAt advanced", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.PURCHASED,
        purchaseToken: "tok",
        subscriptionId: "family_yearly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBe("active");
    expect(upd["isPremium"]).toBe(true);
    expect(upd["subscription.expiresAt"]).toBeInstanceOf(admin.firestore.Timestamp);
  });

  it("PRICE_CHANGE_CONFIRMED: informational only, no status change but still records metadata", async () => {
    setMasterFound();
    await applyRtdnNotification({
      subscriptionNotification: {
        notificationType: RTDN_NOTIFICATION_TYPES.PRICE_CHANGE_CONFIRMED,
        purchaseToken: "tok",
        subscriptionId: "family_monthly",
      },
    });
    const upd = mockDocUpdate.mock.calls[0][0];
    expect(upd["subscription.status"]).toBeUndefined();
    expect(upd["subscription.lastNotificationType"]).toBe(RTDN_NOTIFICATION_TYPES.PRICE_CHANGE_CONFIRMED);
  });

  it("unknown notificationType returns unknown_notification_type without updating", async () => {
    setMasterFound();
    const res = await applyRtdnNotification({
      subscriptionNotification: { notificationType: 9999, purchaseToken: "tok", subscriptionId: "family_monthly" },
    });
    expect(res.handled).toBe(false);
    expect(res.reason).toBe("unknown_notification_type");
    expect(mockDocUpdate).not.toHaveBeenCalled();
  });
});
