/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the generic wizard progress tracker (src/wizard-progress.ts):
 * getWizardProgress / setWizardProgress / listWizardProgress.
 */
import fft from "firebase-functions-test";

// ── In-memory Firestore double ──────────────────────────────────────────────

const store: Record<string, any> = {}; // docPath -> data
const auditAdded: any[] = [];

function docRef(collection: string, id: string) {
  const path = `${collection}/${id}`;
  return {
    get: jest.fn(() => Promise.resolve({ exists: path in store, data: () => store[path] })),
    set: jest.fn((data: any, opts?: { merge?: boolean }) => {
      if (opts?.merge) {
        const prev = store[path] || {};
        // shallow merge + merge the nested `wizards` map (Firestore merge semantics)
        store[path] = {
          ...prev,
          ...data,
          wizards: { ...(prev.wizards || {}), ...(data.wizards || {}) },
        };
      } else {
        store[path] = { ...data };
      }
      return Promise.resolve();
    }),
  };
}

const mockDbObj = {
  collection: jest.fn((collection: string) => ({
    doc: jest.fn((id: string) => docRef(collection, id)),
    add: jest.fn((entry: any) => {
      if (collection === "audit_logs") auditAdded.push(entry);
      return Promise.resolve({ id: "audit-1" });
    }),
  })),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "b" })) })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toDate() { return new Date(this.seconds * 1000); }
  }
  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return { initializeApp: jest.fn(), firestore: firestoreNamespace, auth: () => ({}) };
});

const testEnv = fft();
let fns: any;

const asUser = { auth: { uid: "user-1", token: { role: "master" } } };

beforeAll(() => {
  fns = require("../index");
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(store)) delete store[k];
  auditAdded.length = 0;
});

afterAll(() => testEnv.cleanup());

describe("setWizardProgress / getWizardProgress", () => {
  it("persists and reads back progress for a known wizard", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    const res = await set(
      { wizardId: "parent-onboarding", currentStep: 2, completedSteps: [0, 1], status: "in_progress", data: { childName: "Kim" } },
      asUser
    );
    expect(res).toEqual({ ok: true, wizardId: "parent-onboarding", currentStep: 2, status: "in_progress" });
    expect(auditAdded).toHaveLength(1);
    expect(auditAdded[0].action).toBe("wizard.progress_update");

    const get = testEnv.wrap(fns.getWizardProgress);
    const got = await get({ wizardId: "parent-onboarding" }, asUser);
    expect(got.progress.currentStep).toBe(2);
    expect(got.progress.completedSteps).toEqual([0, 1]);
    expect(got.progress.status).toBe("in_progress");
    expect(got.progress.data).toEqual({ childName: "Kim" });
  });

  it("returns a fresh empty entry when nothing is saved", async () => {
    const get = testEnv.wrap(fns.getWizardProgress);
    const got = await get({ wizardId: "child-pairing" }, asUser);
    expect(got.progress).toEqual({
      wizardId: "child-pairing",
      currentStep: 0,
      completedSteps: [],
      status: "not_started",
      data: {},
      updatedAt: null,
    });
  });

  it("keeps progress for different wizards independent in one user doc", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    await set({ wizardId: "parent-onboarding", currentStep: 1 }, asUser);
    await set({ wizardId: "child-pairing", currentStep: 3 }, asUser);

    const get = testEnv.wrap(fns.getWizardProgress);
    expect((await get({ wizardId: "parent-onboarding" }, asUser)).progress.currentStep).toBe(1);
    expect((await get({ wizardId: "child-pairing" }, asUser)).progress.currentStep).toBe(3);
  });

  it("rejects unknown wizardId", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    await expect(set({ wizardId: "nope", currentStep: 0 }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
    const get = testEnv.wrap(fns.getWizardProgress);
    await expect(get({ wizardId: "nope" }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects an out-of-range currentStep", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    await expect(set({ wizardId: "setup-complete", currentStep: -1 }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
    await expect(set({ wizardId: "setup-complete", currentStep: 9999 }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects an invalid status and oversized data", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    await expect(set({ wizardId: "setup-complete", currentStep: 0, status: "bogus" }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
    const big = { blob: "x".repeat(9000) };
    await expect(set({ wizardId: "setup-complete", currentStep: 0, data: big }, asUser)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("requires authentication", async () => {
    const get = testEnv.wrap(fns.getWizardProgress);
    await expect(get({ wizardId: "setup-complete" }, {})).rejects.toHaveProperty("code", "unauthenticated");
  });
});

describe("listWizardProgress", () => {
  it("returns one summary per known wizard, defaulting to not_started", async () => {
    const list = testEnv.wrap(fns.listWizardProgress);
    const res = await list({}, asUser);
    expect(res.wizards).toHaveLength(7);
    expect(res.wizards.every((w: any) => w.status === "not_started")).toBe(true);
    expect(res.wizards.map((w: any) => w.wizardId)).toContain("setup-complete");
  });

  it("reflects saved status in the overview", async () => {
    const set = testEnv.wrap(fns.setWizardProgress);
    await set({ wizardId: "setup-complete", currentStep: 4, status: "completed" }, asUser);

    const list = testEnv.wrap(fns.listWizardProgress);
    const res = await list({}, asUser);
    const entry = res.wizards.find((w: any) => w.wizardId === "setup-complete");
    expect(entry.status).toBe("completed");
    expect(entry.currentStep).toBe(4);
  });
});
