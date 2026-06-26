/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the getTasksForChild callable (previously uncovered).
 * Covers the authorization branches (child vs owning master vs neither),
 * the limit default/explicit branches, the not-found path, and the per-field
 * type-normalisation branches in the task-mapping closure.
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

jest.mock("../firebase", () => ({
  db: jest.fn(),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({ bucket: jest.fn() })),
}));

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { const d = new Date(); return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
  }
  const firestoreNamespace = () => ({ collection: jest.fn() });
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return { ...original, initializeApp: jest.fn(), firestore: firestoreNamespace };
});

const testEnv = fft();
let fns: any;
const mockDb = getDb as unknown as jest.Mock;

function makeDb(opts: { childExists?: boolean; childData?: any; taskDocs?: any[] }) {
  const tasksQuery: any = {
    orderBy: jest.fn(() => tasksQuery),
    limit: jest.fn(() => tasksQuery),
    get: jest.fn(async () => ({
      docs: (opts.taskDocs ?? []).map((t, i) => ({ id: t.id ?? `task-${i}`, data: () => t })),
    })),
  };
  const childRef = {
    get: jest.fn(async () => ({ exists: opts.childExists ?? true, data: () => opts.childData })),
    collection: jest.fn(() => tasksQuery),
  };
  return { collection: jest.fn(() => ({ doc: jest.fn(() => childRef) })) };
}

const asOwningMaster = { auth: { uid: "m1", token: { role: "master" } }, app: { appId: "t" } };
const asChildSelf = { auth: { uid: "c1", token: {} }, app: { appId: "t" } };
const asStranger = { auth: { uid: "other", token: { role: "master" } }, app: { appId: "t" } };

beforeAll(() => {
  fns = require("../index");
});
beforeEach(() => {
  mockDb.mockReset();
});

describe("getTasksForChild", () => {
  it("returns tasks for the owning master, normalising field types", async () => {
    mockDb.mockReturnValue(makeDb({
      childData: { masterImei: "m1" },
      taskDocs: [
        // fully-typed task -> 'left' branch of every typeof check
        {
          id: "full", description: "Clean room", status: "open", photoUrl: "https://x/p.jpg",
          deadline: 123, createdAt: 1, completedAt: 2, updatedAt: 3,
          unlockDuration: 600, unlockUntil: 4, rejectionReason: "n/a", aiAnalysis: { ok: true },
        },
        // sparse task with wrong/missing types -> default branch of every check
        { id: "sparse" },
      ],
    }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    const res = await wrapped({ childId: "c1" }, asOwningMaster);

    expect(res.tasks).toHaveLength(2);
    const full = res.tasks.find((t: any) => t.id === "full");
    expect(full.description).toBe("Clean room");
    expect(full.photoUrl).toBe("https://x/p.jpg");
    expect(full.unlockDuration).toBe(600);
    const sparse = res.tasks.find((t: any) => t.id === "sparse");
    expect(sparse.description).toBe("");
    expect(sparse.status).toBe("");
    expect(sparse.photoUrl).toBeNull();
    expect(sparse.unlockDuration).toBeNull();
    expect(sparse.rejectionReason).toBeNull();
  });

  it("allows the child device to read its own tasks", async () => {
    mockDb.mockReturnValue(makeDb({ childData: { masterImei: "m1" }, taskDocs: [] }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    const res = await wrapped({ childId: "c1" }, asChildSelf);
    expect(res.tasks).toEqual([]);
  });

  it("honours an explicit valid limit (validateNumber branch)", async () => {
    mockDb.mockReturnValue(makeDb({ childData: { masterImei: "m1" }, taskDocs: [] }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    const res = await wrapped({ childId: "c1", limit: 10 }, asOwningMaster);
    expect(res.tasks).toEqual([]);
  });

  it("rejects an out-of-range limit", async () => {
    mockDb.mockReturnValue(makeDb({ childData: { masterImei: "m1" } }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    await expect(wrapped({ childId: "c1", limit: 9999 }, asOwningMaster)).rejects.toThrow();
  });

  it("throws not-found when the child does not exist", async () => {
    mockDb.mockReturnValue(makeDb({ childExists: false }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    await expect(wrapped({ childId: "c1" }, asOwningMaster)).rejects.toThrow(/not found/i);
  });

  it("denies a caller that is neither the child nor the owning master", async () => {
    mockDb.mockReturnValue(makeDb({ childData: { masterImei: "m1" } }));
    const wrapped = testEnv.wrap(fns.getTasksForChild);
    await expect(wrapped({ childId: "c1" }, asStranger)).rejects.toThrow(/authorized|permission/i);
  });
});
