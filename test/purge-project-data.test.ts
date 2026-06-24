/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the project-wide data purge callable `purgeAllProjectData` (auth.ts).
 *
 * Verifies the destructive-reset gating (enable flag, admin/recovery-token,
 * confirmation phrase) and the actual wipe behaviour across Firestore
 * collections, Cloud Storage objects and Firebase Auth users.
 */
import fft from "firebase-functions-test";

// ── In-memory Firestore / Storage / Auth doubles ────────────────────────────

let collections: string[] = [];
const recursiveDeleted: string[] = [];
const auditAdded: any[] = [];

const mockGetFiles = jest.fn().mockResolvedValue([[{ name: "a.jpg" }, { name: "b.jpg" }]]);
const mockDeleteFiles = jest.fn().mockResolvedValue(undefined);

const mockDbObj: any = {
  listCollections: jest.fn(() =>
    Promise.resolve(collections.map((id) => ({ id })))
  ),
  recursiveDelete: jest.fn((ref: any) => {
    recursiveDeleted.push(ref.id);
    return Promise.resolve();
  }),
  collection: jest.fn((name: string) => ({
    // AuditLogger.add -> audit_logs
    add: jest.fn((entry: any) => {
      if (name === "audit_logs") auditAdded.push(entry);
      return Promise.resolve({ id: "audit-1" });
    }),
    // getStoredAdminPinHash -> operatorConfig/<doc>.get()
    doc: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({ exists: false, data: () => undefined })),
    })),
  })),
};

const mockAuth = {
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
  deleteUser: jest.fn().mockResolvedValue(undefined),
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getFiles: mockGetFiles,
      deleteFiles: mockDeleteFiles,
    })),
  })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(date: Date) { return new MockTimestamp(Math.floor(date.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace = () => mockDbObj;
  (firestoreNamespace as any).Timestamp = MockTimestamp;
  (firestoreNamespace as any).FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
  };
});

const testEnv = fft();
let fns: any;

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };

beforeAll(() => {
  fns = require("../index");
});

beforeEach(() => {
  jest.clearAllMocks();
  collections = ["masters", "children", "audit_logs", "subscriptions"];
  recursiveDeleted.length = 0;
  auditAdded.length = 0;
  mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
  process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "true";
});

afterEach(() => {
  delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
  delete process.env.ADMIN_RECOVERY_TOKEN;
});

afterAll(() => testEnv.cleanup());

describe("purgeAllProjectData", () => {
  it("wipes all Firestore collections, storage objects and auth users", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "admin1", customClaims: { role: "admin" } },
        { uid: "child1", customClaims: {} },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    const res = await wrapped(
      { confirmText: "DELETE_ALL_PROJECT_DATA", includeCurrentSessionUser: true },
      asAdmin
    );

    expect(res.success).toBe(true);
    expect(res.collectionsCleared).toEqual(["masters", "children", "audit_logs", "subscriptions"]);
    expect(res.collectionsClearedCount).toBe(4);
    expect(recursiveDeleted).toEqual(["masters", "children", "audit_logs", "subscriptions"]);
    expect(res.storageFilesDeleted).toBe(2);
    expect(mockDeleteFiles).toHaveBeenCalledWith({ force: true });
    expect(res.deletedUsers).toBe(2);
    // Purge is audit-logged afterwards.
    expect(auditAdded.length).toBe(1);
    expect(auditAdded[0].action).toBe("admin.purge_project_data");
  });

  it("preserves the current session user by default", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "admin1", customClaims: { role: "admin" } },
        { uid: "other", customClaims: {} },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    const res = await wrapped({ confirmText: "DELETE_ALL_PROJECT_DATA" }, asAdmin);

    expect(res.deletedUsers).toBe(1);
    expect(res.skippedCurrentSessionUsers).toContain("admin1");
  });

  it("can skip auth user deletion via includeAuthUsers=false", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "x", customClaims: {} }],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    const res = await wrapped(
      { confirmText: "DELETE_ALL_PROJECT_DATA", includeAuthUsers: false },
      asAdmin
    );

    expect(res.includeAuthUsers).toBe(false);
    expect(res.deletedUsers).toBe(0);
    expect(mockAuth.deleteUser).not.toHaveBeenCalled();
    // Firestore + storage are still wiped.
    expect(recursiveDeleted.length).toBe(4);
  });

  it("rejects a wrong confirmation phrase", async () => {
    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    await expect(
      wrapped({ confirmText: "delete everything" }, asAdmin)
    ).rejects.toHaveProperty("code", "invalid-argument");
    expect(recursiveDeleted.length).toBe(0);
  });

  it("rejects non-admin callers without a recovery token", async () => {
    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    await expect(
      wrapped({ confirmText: "DELETE_ALL_PROJECT_DATA" }, { auth: { uid: "u1", token: { role: "master" } } })
    ).rejects.toHaveProperty("code", "permission-denied");
  });

  it("is disabled when the reset feature flag is off", async () => {
    delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    await expect(
      wrapped({ confirmText: "DELETE_ALL_PROJECT_DATA" }, asAdmin)
    ).rejects.toHaveProperty("code", "failed-precondition");
  });

  it("accepts a valid recovery token without an authenticated caller", async () => {
    process.env.ADMIN_RECOVERY_TOKEN = "recovery-xyz";
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "u", customClaims: {} }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    const res = await wrapped(
      { confirmText: "DELETE_ALL_PROJECT_DATA", recoveryToken: "recovery-xyz" },
      { auth: undefined } as any
    );
    expect(res.success).toBe(true);
    expect(res.deletedUsers).toBe(1);
  });

  it("reports a storage warning when the bucket is unreachable", async () => {
    mockDeleteFiles.mockRejectedValueOnce(new Error("bucket missing"));
    const wrapped = testEnv.wrap(fns.purgeAllProjectData);
    const res = await wrapped({ confirmText: "DELETE_ALL_PROJECT_DATA", includeAuthUsers: false }, asAdmin);
    expect(res.storageWarning).toContain("bucket missing");
    // Firestore wipe still succeeds.
    expect(res.collectionsClearedCount).toBe(4);
  });
});
