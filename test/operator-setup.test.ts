/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests für getOperatorSetupStatus + setOperatorSetupChecklistItem.
 */
import fft from "firebase-functions-test";

const mockDocData: Record<string, any> = {};
const mockDocSet = jest.fn(async (data: any, opts?: { merge?: boolean }) => {
  if (opts?.merge) {
    Object.assign(mockDocData, data);
  } else {
    for (const k of Object.keys(mockDocData)) delete mockDocData[k];
    Object.assign(mockDocData, data);
  }
});
const mockDocGet = jest.fn(async () => ({
  exists: Object.keys(mockDocData).length > 0,
  data: () => ({ items: (mockDocData as any).items || {} }),
}));
const mockDocFn = jest.fn(() => ({ get: mockDocGet, set: mockDocSet }));

const mockCollLimitGet = jest.fn().mockResolvedValue({ empty: true, docs: [] });
const mockCollFn = jest.fn(() => ({
  limit: jest.fn(() => ({ get: mockCollLimitGet })),
}));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({
    collection: mockCollFn,
    doc: mockDocFn,
  })),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => ({})),
}));
jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn() })),
}));

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
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNs,
  };
});

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({ purchases: { subscriptions: { get: jest.fn() } } })),
  },
}));

const testEnv = fft();

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "test" } };
const asUser  = { auth: { uid: "u1", token: {} }, app: { appId: "test" } };

let fns: any;

beforeAll(() => {
  process.env.GEMINI_API_KEY = "test-key";
  fns = require("../index");
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockDocData)) delete mockDocData[k];
  delete process.env.PLAY_BILLING_PUBSUB_TOPIC;
  delete process.env.ADMIN_RECOVERY_TOKEN;
  delete process.env.ADMIN_RECOVERY_TOKEN_ROTATED_AT;
});

afterAll(() => testEnv.cleanup());

describe("getOperatorSetupStatus", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    await expect(wrapped({}, asUser)).rejects.toThrow();
  });

  it("returns aggregated status for admin and lists secret presence", async () => {
    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res).toBeTruthy();
    expect(res.readiness).toMatch(/^(ready|near-ready|not-ready)$/);
    expect(res.secrets).toBeDefined();
    expect(res.secrets.GEMINI_API_KEY).toBe(true);
    expect(res.secrets.PLAY_BILLING_PUBSUB_TOPIC).toBe(false);
    expect(res.rtdn.topic).toBe("play-billing-notifications");
    expect(res.rtdn.topicConfigured).toBe(false);
    expect(Array.isArray(res.manualChecklist.items)).toBe(true);
    expect(res.manualChecklist.requiredTotal).toBeGreaterThan(0);
    expect(res.manualChecklist.requiredDone).toBe(0);
  });

  it("flags overdue recovery-token rotation", async () => {
    process.env.ADMIN_RECOVERY_TOKEN = "abc";
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    process.env.ADMIN_RECOVERY_TOKEN_ROTATED_AT = oldDate;
    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res.recoveryToken.status).toBe("overdue");
    expect(res.recoveryToken.tokenCount).toBe(1);
  });

  it("reports configured pubsub topic via env var", async () => {
    process.env.PLAY_BILLING_PUBSUB_TOPIC = "custom-topic";
    const wrapped = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrapped({}, asAdmin);
    expect(res.rtdn.topic).toBe("custom-topic");
    expect(res.rtdn.topicConfigured).toBe(true);
  });
});

describe("setOperatorSetupChecklistItem", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.setOperatorSetupChecklistItem);
    await expect(wrapped({ itemId: "play_developer_account", done: true }, asUser)).rejects.toThrow();
  });

  it("rejects unknown item ids", async () => {
    const wrapped = testEnv.wrap(fns.setOperatorSetupChecklistItem);
    await expect(wrapped({ itemId: "does_not_exist", done: true }, asAdmin)).rejects.toThrow(/Unknown checklist itemId/);
  });

  it("rejects invalid payloads", async () => {
    const wrapped = testEnv.wrap(fns.setOperatorSetupChecklistItem);
    await expect(wrapped({ itemId: "play_developer_account" } as any, asAdmin)).rejects.toThrow(/required/);
  });

  it("persists a done flag and integrates with status output", async () => {
    const wrappedSet = testEnv.wrap(fns.setOperatorSetupChecklistItem);
    await wrappedSet({ itemId: "play_developer_account", done: true, note: "Verträge unterzeichnet 2026-04-18" }, asAdmin);
    expect(mockDocSet).toHaveBeenCalled();
    const lastCall = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(lastCall["items.play_developer_account"].done).toBe(true);
    expect(lastCall["items.play_developer_account"].note).toContain("unterzeichnet");

    // simulate that doc.get returns the persisted item now
    (mockDocData as any).items = {
      play_developer_account: { done: true, doneAt: "2026-04-18T00:00:00.000Z", doneBy: "admin1", note: "ok" },
    };

    const wrappedStatus = testEnv.wrap(fns.getOperatorSetupStatus);
    const res = await wrappedStatus({}, asAdmin);
    const item = res.manualChecklist.items.find((i: any) => i.id === "play_developer_account");
    expect(item.done).toBe(true);
    expect(res.manualChecklist.requiredDone).toBe(1);
  });
});
