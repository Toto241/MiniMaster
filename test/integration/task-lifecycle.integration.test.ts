/* eslint-disable @typescript-eslint/no-require-imports */
import fft from "firebase-functions-test";

const taskState: Record<string, any> = {
  task1: { status: "pending" },
};

const mockTaskRef = {
  get: jest.fn(async () => ({ exists: true, data: () => ({ ...taskState.task1 }) })),
  update: jest.fn(async (data: Record<string, unknown>) => {
    taskState.task1 = { ...taskState.task1, ...data };
  }),
};

const mockChildDoc = {
  get: jest.fn(async () => ({ exists: true, data: () => ({ masterImei: "m1" }) })),
  collection: jest.fn(() => ({ doc: jest.fn(() => mockTaskRef) })),
};

const mockMasterDoc = {
  get: jest.fn(async () => ({ exists: true, data: () => ({}) })),
};

const mockDb = {
  collection: jest.fn((name: string) => ({
    doc: jest.fn((id: string) => {
      if (name === "masters") return mockMasterDoc;
      if (name === "children" && id === "c1") return mockChildDoc;
      return mockChildDoc;
    }),
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
        fromDate: jest.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 })),
      },
      FieldValue: {
        serverTimestamp: jest.fn(() => "server-ts"),
      },
    },
  };
});

const testEnv = fft();
const fns = require("../../index");

describe("integration: task lifecycle", () => {
  afterAll(() => testEnv.cleanup());

  beforeEach(() => {
    taskState.task1 = { status: "pending" };
    jest.clearAllMocks();
  });

  it("durchläuft pending -> pending_approval -> approved", async () => {
    const completeTask = testEnv.wrap(fns.completeTask);
    const approveTask = testEnv.wrap(fns.approveTask);

    const completeRes = await completeTask(
      { taskId: "task1", photoUrl: "https://firebasestorage.googleapis.com/v0/b/minimaster/o/children%2Fc1%2Fphotos%2Fproof.jpg" },
      { auth: { uid: "c1", token: {} } }
    );

    expect(completeRes).toEqual({ success: true });
    expect(taskState.task1.status).toBe("pending_approval");

    const approveRes = await approveTask(
      { childId: "c1", taskId: "task1" },
      { auth: { uid: "m1", token: { role: "master" } } }
    );

    expect(approveRes).toEqual({ success: true });
    expect(taskState.task1.status).toBe("approved");
  });
});
