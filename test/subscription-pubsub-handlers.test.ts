/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the previously-untested pubsub/scheduled handlers in subscription.ts:
 *   onPlayBillingNotification (Play RTDN webhook)
 *   reverifyActiveSubscriptions (daily re-verification sweep)
 * Both are thin wrappers that decode/aggregate and delegate to already-tested
 * core functions; here we cover the wrapper paths (empty payload, success,
 * swallowed error).
 */
import fft from "firebase-functions-test";

let queryDocs: any[] = [];
let queryThrows = false;
function makeQuery() {
  const q: any = {};
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.get = jest.fn(async () => {
    if (queryThrows) throw new Error("firestore query failed");
    return { empty: queryDocs.length === 0, size: queryDocs.length, docs: queryDocs };
  });
  return q;
}

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: jest.fn(() => makeQuery()) })),
  auth: jest.fn(() => ({})),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number) {}
    static now() { return new MockTimestamp(1_700_000_000); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000)); }
    toMillis() { return this.seconds * 1000; }
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

import { onPlayBillingNotification, reverifyActiveSubscriptions } from "../src/subscription";

const testEnv = fft();

function encodeRtdn(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

beforeEach(() => {
  queryDocs = [];
  queryThrows = false;
});
afterAll(() => testEnv.cleanup());

describe("onPlayBillingNotification", () => {
  it("returns null and warns on an empty/undecodable payload", async () => {
    const wrapped = testEnv.wrap(onPlayBillingNotification);
    await expect(wrapped({ data: undefined } as any)).resolves.toBeNull();
  });

  it("processes a decodable notification (master-not-found path)", async () => {
    queryDocs = []; // applyRtdnNotification -> master_not_found, no throw
    const wrapped = testEnv.wrap(onPlayBillingNotification);
    const data = encodeRtdn({
      packageName: "com.minimaster.masterapp",
      subscriptionNotification: { notificationType: 2, purchaseToken: "tok", subscriptionId: "single_child_monthly" },
    });
    await expect(wrapped({ data } as any)).resolves.toBeNull();
  });

  it("swallows downstream processing errors so Pub/Sub does not retry", async () => {
    queryThrows = true; // applyRtdnNotification throws -> handler catch
    const wrapped = testEnv.wrap(onPlayBillingNotification);
    const data = encodeRtdn({
      subscriptionNotification: { notificationType: 2, purchaseToken: "tok", subscriptionId: "single_child_monthly" },
    });
    await expect(wrapped({ data } as any)).resolves.toBeNull();
  });
});

describe("reverifyActiveSubscriptions", () => {
  it("completes a no-op sweep when there are no active subscriptions", async () => {
    queryDocs = [];
    const wrapped = testEnv.wrap(reverifyActiveSubscriptions);
    await expect(wrapped({} as any)).resolves.toBeNull();
  });

  it("swallows a failing sweep without throwing", async () => {
    queryThrows = true;
    const wrapped = testEnv.wrap(reverifyActiveSubscriptions);
    await expect(wrapped({} as any)).resolves.toBeNull();
  });
});
