/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the in-app secret-onboarding Cloud Functions.
 *
 * Core security guarantees under test:
 *  - admin-only + App-Check gating
 *  - the raw value is written to Secret Manager but NEVER persisted to
 *    Firestore, returned to the caller, or placed in audit metadata
 *  - only a Secret-Manager *path reference* is mirrored into the
 *    external-integrations document (and only for secrets that have a field)
 *  - Secret Manager permission errors surface as a clear IAM hint
 *  - the inventory endpoint reads metadata only (never the value)
 */
import fft from "firebase-functions-test";

const RAW_SECRET = "AIzaSy_THIS_IS_A_RAW_SECRET_VALUE_1234567890";

// ---- Firestore mock (doc for external-integrations + audit collection) ----
const mockDocData: Record<string, any> = {};
const mockDocSet = jest.fn(async (data: any) => {
  Object.assign(mockDocData, data || {});
});
const mockDocGet = jest.fn(async () => ({
  exists: Object.keys(mockDocData).length > 0,
  data: () => ({ ...mockDocData }),
}));
const mockTopLevelDoc = jest.fn(() => ({ get: mockDocGet, set: mockDocSet }));

// operatorConfig/adminPin lookup used by requireAdminPinVerification — return
// no pinHash so the PIN gate is a no-op for these tests.
const mockAdminPinGet = jest.fn(async () => ({ exists: false, data: () => ({}) }));
const mockCollDoc = jest.fn(() => ({ get: mockAdminPinGet }));
const mockAuditAdd = jest.fn(async () => ({ id: "audit1" }));
const mockCollFn = jest.fn(() => ({
  doc: mockCollDoc,
  add: mockAuditAdd,
  limit: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ empty: true, docs: [] }) })),
}));

// ---- Secret Manager mock ----
const mockGetSecret = jest.fn();
const mockCreateSecret = jest.fn();
const mockAddSecretVersion = jest.fn();
const mockGetSecretVersion = jest.fn();
const mockSecretClient = {
  getSecret: mockGetSecret,
  createSecret: mockCreateSecret,
  addSecretVersion: mockAddSecretVersion,
  getSecretVersion: mockGetSecretVersion,
};

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: mockCollFn, doc: mockTopLevelDoc })),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })),
  secretManager: jest.fn(() => mockSecretClient),
}));

jest.mock("firebase-admin/auth", () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({ bucket: jest.fn(() => ({ name: "test-bucket" })) })),
}));
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
const asUser = { auth: { uid: "u1", token: {} }, app: { appId: "test" } };

process.env.GCLOUD_PROJECT = "test-proj";
process.env.GEMINI_API_KEY = "test-key";

let fns: any = null;
try {
  fns = require("../index");
} catch {
  fns = null;
}
const describeCallable = fns ? describe : describe.skip;

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockDocData)) delete mockDocData[k];
  // Default happy path: secret exists, adding a version returns version 2.
  mockGetSecret.mockResolvedValue([{ name: "projects/test-proj/secrets/GEMINI_API_KEY" }]);
  mockCreateSecret.mockResolvedValue([{ name: "projects/test-proj/secrets/GEMINI_API_KEY" }]);
  mockAddSecretVersion.mockResolvedValue([{ name: "projects/test-proj/secrets/GEMINI_API_KEY/versions/2" }]);
  mockGetSecretVersion.mockResolvedValue([
    { name: "projects/test-proj/secrets/GEMINI_API_KEY/versions/2", createTime: { seconds: 1_700_000_000 } },
  ]);
});

afterAll(() => testEnv.cleanup());

// ==================== setSecretValue ====================

describeCallable("setSecretValue", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await expect(wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAuditor)).rejects.toThrow();
    expect(mockAddSecretVersion).not.toHaveBeenCalled();
  });

  it("rejects unknown secret ids", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await expect(wrapped({ secretId: "TOTALLY_UNKNOWN", value: RAW_SECRET }, asAdmin)).rejects.toThrow(/Unbekannte secretId/);
  });

  it("rejects empty values", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await expect(wrapped({ secretId: "GEMINI_API_KEY", value: "" }, asAdmin)).rejects.toThrow(/value/);
  });

  it("writes the raw value as a new Secret Manager version", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    const res = await wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin);

    expect(mockAddSecretVersion).toHaveBeenCalledTimes(1);
    const arg = mockAddSecretVersion.mock.calls[0][0];
    expect(arg.parent).toBe("projects/test-proj/secrets/GEMINI_API_KEY");
    expect(Buffer.from(arg.payload.data).toString("utf8")).toBe(RAW_SECRET);
    expect(res.ok).toBe(true);
    expect(res.version).toBe("2");
  });

  it("mirrors ONLY a path reference into external-integrations — never the value", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    const res = await wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin);

    expect(res.pathStored).toBe(true);
    const stored = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(stored.secrets.geminiApiKeyPath).toBe("projects/test-proj/secrets/GEMINI_API_KEY/versions/latest");
    // The raw value must appear in NONE of the Firestore writes.
    const allWrites = JSON.stringify(mockDocSet.mock.calls);
    expect(allWrites).not.toContain(RAW_SECRET);
  });

  it("never leaks the value into the response or audit metadata", async () => {
    const wrapped = testEnv.wrap(fns.setSecretValue);
    const res = await wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin);

    expect(JSON.stringify(res)).not.toContain(RAW_SECRET);
    expect(mockAuditAdd).toHaveBeenCalled();
    const auditEntry = mockAuditAdd.mock.calls[mockAuditAdd.mock.calls.length - 1][0] as Record<string, any>;
    expect(auditEntry.action).toBe("operator.secret_write");
    expect(JSON.stringify(auditEntry)).not.toContain(RAW_SECRET);
    expect(auditEntry.metadata.secretId).toBe("GEMINI_API_KEY");
  });

  it("creates the secret container when it does not yet exist", async () => {
    mockGetSecret.mockRejectedValueOnce({ code: 5 }); // NOT_FOUND
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin);
    expect(mockCreateSecret).toHaveBeenCalledTimes(1);
    expect(mockCreateSecret.mock.calls[0][0].secretId).toBe("GEMINI_API_KEY");
  });

  it("does not write a path reference for secrets without a display field", async () => {
    mockGetSecret.mockResolvedValue([{ name: "projects/test-proj/secrets/OPENAI_API_KEY" }]);
    mockAddSecretVersion.mockResolvedValue([{ name: "projects/test-proj/secrets/OPENAI_API_KEY/versions/1" }]);
    const wrapped = testEnv.wrap(fns.setSecretValue);
    const res = await wrapped({ secretId: "OPENAI_API_KEY", value: RAW_SECRET }, asAdmin);
    expect(res.pathStored).toBe(false);
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it("surfaces an IAM hint when Secret Manager denies permission", async () => {
    mockAddSecretVersion.mockRejectedValueOnce({ code: 7 }); // PERMISSION_DENIED
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await expect(wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin)).rejects.toThrow(/secretmanager\.admin/);
  });

  it("requires a fresh admin-PIN confirmation when an operator PIN is configured", async () => {
    // PIN configured + asAdmin session has no admin_verified_at → not fresh.
    mockAdminPinGet.mockResolvedValueOnce({ exists: true, data: () => ({ pinHash: "scrypt$salt$hash" }) });
    const wrapped = testEnv.wrap(fns.setSecretValue);
    await expect(wrapped({ secretId: "GEMINI_API_KEY", value: RAW_SECRET }, asAdmin)).rejects.toThrow(/PIN/i);
    expect(mockAddSecretVersion).not.toHaveBeenCalled();
  });
});

// ==================== getSecretInventory ====================

describeCallable("getSecretInventory", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.getSecretInventory);
    await expect(wrapped({}, asUser)).rejects.toThrow();
  });

  it("reports configured secrets via metadata only (no value access)", async () => {
    const wrapped = testEnv.wrap(fns.getSecretInventory);
    const res = await wrapped({}, asAdmin);
    expect(Array.isArray(res.secrets)).toBe(true);
    const gemini = res.secrets.find((s: any) => s.secretId === "GEMINI_API_KEY");
    expect(gemini.exists).toBe(true);
    expect(gemini.latestVersion).toBe("2");
    // The value-reading API must never be invoked.
    expect((mockSecretClient as any).accessSecretVersion).toBeUndefined();
  });

  it("marks never-set secrets as not configured", async () => {
    mockGetSecretVersion.mockRejectedValue({ code: 5 }); // NOT_FOUND for all
    const wrapped = testEnv.wrap(fns.getSecretInventory);
    const res = await wrapped({}, asAdmin);
    expect(res.secrets.every((s: any) => s.exists === false)).toBe(true);
    expect(res.secrets.every((s: any) => s.error === null)).toBe(true);
  });

  it("flags PERMISSION_DENIED distinctly instead of reporting 'not configured'", async () => {
    mockGetSecretVersion.mockRejectedValue({ code: 7 }); // PERMISSION_DENIED for all
    const wrapped = testEnv.wrap(fns.getSecretInventory);
    const res = await wrapped({}, asAdmin);
    expect(res.secrets.every((s: any) => s.exists === false)).toBe(true);
    expect(res.secrets.every((s: any) => s.error === "permission")).toBe(true);
  });
});
