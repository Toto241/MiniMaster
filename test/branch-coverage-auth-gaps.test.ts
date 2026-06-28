/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch-coverage: auth.ts remaining gaps
 *
 * Targets all uncovered functions and branches:
 *   - setAdminClaim: happy path, invalid uid, generic error
 *   - setUserRole: happy path, invalid uid, invalid role, generic error
 *   - bootstrapFirstAdmin: happy path, admin exists, generic error
 *   - createOperatorAccessKey: all validation branches + bootstrap
 *   - redeemOperatorAccessKey: all validation branches + expired + used key
 *   - revokeUserTokens: happy path, invalid uid, generic error
 *   - generateCustomToken: auth context + legacy paths
 *   - registerMasterDevice: all branches (LEGACY, id mismatch, existing doc, user-not-found)
 *   - resetAllAuthUsers: pagination, accessKeyCleanup error, auditLog error, failure-audit error
 *   - resetOperatorAccounts: accessKeyCleanup error branch
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue("mock-msg-id");
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: mockSend })),
}));

jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

const mockAuth: any = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ uid: "m1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-custom-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  createUser: jest.fn().mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  ),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
};

const mockDbObj = { collection: jest.fn() };
jest.mock("../firebase", () => ({
  db: jest.fn(() => mockDbObj),
  auth: jest.fn(() => mockAuth),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

jest.mock("firebase-admin", () => {
  class MockTimestamp {
    constructor(public seconds: number, public nanoseconds: number) {}
    static now() { return new MockTimestamp(Math.floor(Date.now() / 1000), 0); }
    static fromDate(d: Date) { return new MockTimestamp(Math.floor(d.getTime() / 1000), 0); }
    static fromMillis(ms: number) { return new MockTimestamp(Math.floor(ms / 1000), 0); }
    toMillis() { return this.seconds * 1000; }
    toDate() { return new Date(this.seconds * 1000); }
  }
  const firestoreNamespace: any = () => mockDbObj;
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = { serverTimestamp: () => "mock-server-timestamp" };
  return {
    initializeApp: jest.fn(),
    firestore: firestoreNamespace,
    auth: () => mockAuth,
    messaging: () => ({ send: mockSend }),
  };
});

jest.mock("googleapis", () => ({
  google: {
    auth: { GoogleAuth: jest.fn().mockImplementation(() => ({})) },
    androidpublisher: jest.fn(() => ({
      purchases: { subscriptions: { get: jest.fn() } },
    })),
  },
}));

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asSupport = { auth: { uid: "s1", token: { role: "support" } } };
const asPlainUser = { auth: { uid: "u1", token: {} } };

function resetState() {
  state = {
    masters: {
      m1: {
        imei: "m1", uid: "m1", secretKey: "secret123", fcmToken: "master-fcm-token",
        subscription: { status: "active", type: "family_monthly", childLimit: 99 },
      },
    },
    children: {
      c1: { masterImei: "m1", childImei: "c1", fcmToken: "child-fcm-token" },
    },
    pairingCodes: {},
    pairingTokens: {},
    subscriptions: {},
    supportTickets: {},
    supportAccessGrants: {},
    masterLegalConsents: {},
    legalPolicies: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    performance_metrics: {},
    operatorConfig: {},
    ai_error_analyses: {},
    legacyAuthUsage: {},
    operatorAccessKeys: {},
  };
}

beforeAll(() => {
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  resetState();

  mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
  mockAuth.getUser.mockResolvedValue({ uid: "m1", customClaims: { role: "master" } });
  mockAuth.setCustomUserClaims.mockResolvedValue(undefined);
  mockAuth.createCustomToken.mockResolvedValue("mock-custom-token");
  mockAuth.deleteUser.mockResolvedValue(undefined);
  mockAuth.revokeRefreshTokens.mockResolvedValue(undefined);
  mockAuth.createUser.mockImplementation(({ uid }: { uid: string }) =>
    Promise.resolve({ uid, customClaims: {} })
  );

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};

    const buildWhereChain = (filters: Array<{ field: string; op: string; value: unknown }>) => {
      const chain: any = {
        where: jest.fn((field: string, op: string, value: unknown) => {
          return buildWhereChain([...filters, { field, op, value }]);
        }),
        get: jest.fn(() => {
          let entries = Object.entries(collData);
          if (filters.length > 0) {
            entries = entries.filter(([, data]) => {
              return filters.every(({ field, value }) => (data as any)[field] === value);
            });
          }
          const docs = entries.map(([id, data]) => {
            const docRef: any = {
              id,
              path: `${coll}/${id}`,
              get: jest.fn(() => {
                const d = collData[id];
                return Promise.resolve({ exists: !!d, data: () => d, id, ref: docRef });
              }),
              delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            };
            return { id, exists: true, data: () => data, ref: docRef };
          });
          return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
        }),
      };
      chain.orderBy = jest.fn(() => chain);
      chain.limit = jest.fn(() => chain);
      return chain;
    };

    return {
      doc: jest.fn((docId?: string) => {
        const actualId = docId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const ref: any = {
          id: actualId,
          get: () => {
            const d = collData[actualId];
            return Promise.resolve({ exists: !!d, data: () => d, id: actualId, ref });
          },
          update: jest.fn((upd: any) => { if (collData[actualId]) Object.assign(collData[actualId], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[actualId] = opts?.merge ? { ...(collData[actualId] || {}), ...data } : { ...data };
            if (!state[coll]) state[coll] = collData;
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[actualId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${actualId}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([id, data]) => ({
                  id, data: () => data, ref: { delete: jest.fn(() => Promise.resolve()), update: jest.fn(() => Promise.resolve()) },
                })),
              })),
              doc: jest.fn((subId: string) => ({
                get: jest.fn(() => {
                  const sd = state[key]?.[subId];
                  return Promise.resolve({ exists: !!sd, data: () => sd, id: subId });
                }),
                set: jest.fn((data: any) => { state[key][subId] = data; return Promise.resolve(); }),
                update: jest.fn((upd: any) => {
                  if (state[key]?.[subId]) Object.assign(state[key][subId], upd);
                  return Promise.resolve();
                }),
              })),
              add: jest.fn((data: any) => {
                const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][id] = data;
                return Promise.resolve({ id });
              }),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        if (!state[coll]) state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn((field: string, op: string, value: unknown) => {
        return buildWhereChain([{ field, op, value }]);
      }),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn(() => buildWhereChain([])),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  (db).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db).runTransaction = jest.fn(async (callback: (tx: any) => Promise<any>) => {
    const tx = {
      get: jest.fn(async (ref: any) => {
        const snap = await ref.get();
        return snap;
      }),
      update: jest.fn((ref: any, data: any) => {
        ref.update(data);
      }),
      set: jest.fn((ref: any, data: any) => {
        ref.set(data);
      }),
    };
    return callback(tx);
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// SET ADMIN CLAIM
// ══════════════════════════════════════════════════════════════════════════

describe("setAdminClaim", () => {
  it("sets admin claim for valid uid (happy path)", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    const res = await wrapped({ uid: "target-user1" }, asAdmin);
    expect(res.message).toContain("target-user1");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("target-user1", { role: "admin" });
  });

  it("rejects when uid is missing", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects non-admin caller", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "u1" }, asMaster)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Auth service down"));
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "u1" }, asAdmin)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// SET USER ROLE
// ══════════════════════════════════════════════════════════════════════════

describe("setUserRole", () => {
  it("sets role for valid request (happy path)", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    const res = await wrapped({ uid: "u2", role: "support" }, asAdmin);
    expect(res.message).toContain("support");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("u2", { role: "support" });
  });

  it("rejects invalid uid", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "", role: "admin" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects invalid role", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "u1", role: "superuser" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects non-admin caller", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "u1", role: "support" }, asSupport)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Auth fail"));
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "u1", role: "admin" }, asAdmin)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// BOOTSTRAP FIRST ADMIN
// ══════════════════════════════════════════════════════════════════════════

describe("bootstrapFirstAdmin", () => {
  it("promotes caller when no admin exists (happy path)", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    const res = await wrapped({}, asPlainUser);
    expect(res.success).toBe(true);
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("u1", { role: "admin" });
  });

  it("rejects when admin already exists", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "existing-admin", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, asPlainUser)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("blocks a concurrent second bootstrap via the Firestore sentinel", async () => {
    // First bootstrap succeeds and writes operatorConfig/bootstrapSentinel.
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await wrapped({}, asPlainUser);

    // A second caller within the Auth-propagation window (listUsers still sees
    // no admin) must be stopped by the sentinel, not by hasAnyAdminUser().
    await expect(wrapped({}, asPlainUser)).rejects.toHaveProperty("code", "failed-precondition");
  });

  it("rejects unauthenticated caller", async () => {
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, {})).rejects.toHaveProperty("code", "unauthenticated");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.listUsers.mockRejectedValue(new Error("List users fail"));
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, asPlainUser)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CREATE OPERATOR ACCESS KEY
// ══════════════════════════════════════════════════════════════════════════

describe("createOperatorAccessKey", () => {
  const validHash = "a".repeat(64); // valid hex sha256

  it("creates key as admin (happy path)", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    const res = await wrapped({ keyHash: validHash, role: "support", ttlMinutes: 60 }, asAdmin);
    expect(res.role).toBe("support");
    expect(res.keyId).toBeDefined();
    expect(res.expiresAtMs).toBeGreaterThan(Date.now() - 1000);
  });

  it("rejects unauthenticated caller", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: validHash }, {})).rejects.toHaveProperty("code", "unauthenticated");
  });

  it("rejects invalid keyHash (not sha256)", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: "too-short" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects invalid role", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: validHash, role: "superadmin" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects invalid ttlMinutes (negative)", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: validHash, role: "admin", ttlMinutes: -1 }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects invalid ttlMinutes (too high)", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: validHash, role: "admin", ttlMinutes: 99999 }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("allows bootstrap key creation when no admin exists", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    const res = await wrapped({ keyHash: validHash, role: "admin", ttlMinutes: 30 }, asPlainUser);
    expect(res.role).toBe("admin");
  });

  it("rejects non-admin when admin exists", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "existing-admin", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: validHash, role: "admin" }, asPlainUser))
      .rejects.toHaveProperty("code", "permission-denied");
  });

  it("rejects non-admin requesting non-admin role (no bootstrap)", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    // No admin exists, but requesting "support" not "admin" → denied
    await expect(wrapped({ keyHash: validHash, role: "support" }, asPlainUser))
      .rejects.toHaveProperty("code", "permission-denied");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REDEEM OPERATOR ACCESS KEY
// ══════════════════════════════════════════════════════════════════════════

describe("redeemOperatorAccessKey", () => {
  const longKey = "x".repeat(50); // long enough to pass length check

  it("rejects unauthenticated caller", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: longKey }, {})).rejects.toHaveProperty("code", "unauthenticated");
  });

  it("rejects key shorter than 43 chars", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: "short" }, asPlainUser)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects unknown key hash (not found)", async () => {
    state.operatorAccessKeys = {};
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: longKey }, asPlainUser)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("rejects already used key", async () => {
    // We need to put a key doc whose keyHash matches sha256(longKey) into state.
    // Since sha256 is run at runtime, we mock the where-chain to return our doc.
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(longKey, "utf8").digest("hex");
    state.operatorAccessKeys = {
      key1: {
        keyHash: hash,
        role: "admin",
        usedAt: "already-used",
        expiresAt: { toMillis: () => Date.now() + 99999999 },
      },
    };
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: longKey }, asPlainUser)).rejects.toHaveProperty("code", "failed-precondition");
  });

  it("rejects expired key", async () => {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(longKey, "utf8").digest("hex");
    state.operatorAccessKeys = {
      key1: {
        keyHash: hash,
        role: "admin",
        usedAt: null,
        expiresAt: { toMillis: () => Date.now() - 99999 },
      },
    };
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: longKey }, asPlainUser)).rejects.toHaveProperty("code", "deadline-exceeded");
  });

  it("redeems valid key successfully", async () => {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(longKey, "utf8").digest("hex");
    state.operatorAccessKeys = {
      key1: {
        keyHash: hash,
        role: "support",
        usedAt: null,
        expiresAt: { toMillis: () => Date.now() + 99999999 },
      },
    };
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    const res = await wrapped({ key: longKey }, asPlainUser);
    expect(res.success).toBe(true);
    expect(res.role).toBe("support");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("u1", { role: "support" });
  });

  it("rejects key with invalid role data (corrupt doc)", async () => {
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(longKey, "utf8").digest("hex");
    state.operatorAccessKeys = {
      key1: {
        keyHash: hash,
        role: "invalid_role",
        usedAt: null,
        expiresAt: { toMillis: () => Date.now() + 99999999 },
      },
    };
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: longKey }, asPlainUser)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REVOKE USER TOKENS
// ══════════════════════════════════════════════════════════════════════════

describe("revokeUserTokens", () => {
  it("revokes tokens for valid uid (happy path)", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    const res = await wrapped({ uid: "target-u1" }, asAdmin);
    expect(res.message).toContain("target-u1");
    expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith("target-u1");
  });

  it("rejects invalid uid", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "" }, asAdmin)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects non-admin", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "u1" }, asMaster)).rejects.toHaveProperty("code", "permission-denied");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.revokeRefreshTokens.mockRejectedValueOnce(new Error("Service down"));
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "u1" }, asAdmin)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GENERATE CUSTOM TOKEN
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken", () => {
  it("generates token for authenticated caller (happy path)", async () => {
    mockAuth.getUser.mockResolvedValue({ uid: "admin1", customClaims: { role: "admin" } });
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, asAdmin);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("rejects missing credentials in legacy path", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, {})).rejects.toHaveProperty("code", "unauthenticated");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("Auth service error"));
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, asAdmin)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// REGISTER MASTER DEVICE
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice", () => {
  it("registers new master (auth context, user-not-found → createUser)", async () => {
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const asNewMaster = { auth: { uid: "newmaster1", token: {} } };
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "newmaster1" }, asNewMaster);
    expect(res.masterId).toBe("newmaster1");
    expect(res.customToken).toBe("mock-custom-token");
    expect(mockAuth.createUser).toHaveBeenCalledWith({ uid: "newmaster1" });
  });

  it("returns existing master doc without recreating", async () => {
    state.masters.m1 = { imei: "m1", uid: "m1", secretKey: "s", subscription: {} };
    mockAuth.getUser.mockResolvedValue({ uid: "m1", customClaims: {} });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("rejects invalid imei", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "" }, asMaster)).rejects.toHaveProperty("code", "invalid-argument");
  });

  it("rejects id mismatch (auth.uid !== imei)", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "different-id" }, asMaster)).rejects.toHaveProperty("code", "failed-precondition");
  });

  it("succeeds with legacy path (no auth) when LEGACY_AUTH_DISABLED is false", async () => {
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "someimei" }, {});
    expect(res.masterId).toBe("someimei");
  });

  it("wraps generic error as internal", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("Unexpected auth failure"));
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "m1" }, asMaster)).rejects.toHaveProperty("code", "internal");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RESET ALL AUTH USERS – pagination + error branches
// ══════════════════════════════════════════════════════════════════════════

describe("resetAllAuthUsers – deeper branches", () => {
  beforeEach(() => {
    process.env.ENABLE_OPERATOR_ACCOUNT_RESET = "true";
  });
  afterEach(() => {
    delete process.env.ENABLE_OPERATOR_ACCOUNT_RESET;
  });

  it("handles pagination (two pages of users)", async () => {
    const page1Users = [
      { uid: "u1", customClaims: {} },
      { uid: "u2", customClaims: {} },
    ];
    const page2Users = [
      { uid: "u3", customClaims: {} },
    ];
    mockAuth.listUsers
      .mockResolvedValueOnce({ users: page1Users, pageToken: "next-page" })
      .mockResolvedValueOnce({ users: page2Users, pageToken: undefined });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
      includeCurrentSessionUser: true,
    }, asAdmin);

    expect(res.matchedUsers).toBe(3);
    expect(res.deletedUsers).toBe(3);
    expect(mockAuth.listUsers).toHaveBeenCalledTimes(2);
  });

  it("catches deleteAllOperatorAccessKeys error (non-fatal)", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });

    // Make operatorAccessKeys.limit().get() throw
    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "operatorAccessKeys") {
        return {
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockRejectedValue(new Error("Access keys cleanup failed")),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: jest.fn(), update: jest.fn(), delete: jest.fn(),
          }),
        } as any;
      }
      return origImpl!.call(db, ...args);
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
    }, asAdmin);

    expect(res.success).toBe(true);
    expect(res.accessKeyCleanupWarning).toContain("Access keys cleanup failed");
  });

  it("skips current session user when includeCurrentSessionUser=false", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "admin1", customClaims: { role: "admin" } },
        { uid: "other", customClaims: {} },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
      includeCurrentSessionUser: false,
    }, asAdmin);

    expect(res.skippedCurrentSessionUsers).toContain("admin1");
    expect(res.deletedUsers).toBe(1); // only "other"
  });
});

// ══════════════════════════════════════════════════════════════════════════
// RESET OPERATOR ACCOUNTS – accessKey cleanup error
// ══════════════════════════════════════════════════════════════════════════

describe("resetOperatorAccounts – accessKey cleanup error branch", () => {
  beforeEach(() => {
    process.env.ENABLE_OPERATOR_ACCOUNT_RESET = "true";
  });
  afterEach(() => {
    delete process.env.ENABLE_OPERATOR_ACCOUNT_RESET;
  });

  it("continues when deleteAllOperatorAccessKeys throws (non-fatal)", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });

    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "operatorAccessKeys") {
        return {
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockRejectedValue(new Error("Cleanup boom")),
          }),
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ exists: false }),
            set: jest.fn(), update: jest.fn(), delete: jest.fn(),
          }),
        } as any;
      }
      return origImpl!.call(db, ...args);
    });

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);

    expect(res.success).toBe(true);
    expect(res.accessKeysDeleted).toBe(0);
  });

  it("handles user delete failure (failedUids list)", async () => {
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "op1", customClaims: { role: "support" } }],
      pageToken: undefined,
    });
    mockAuth.deleteUser.mockRejectedValueOnce(new Error("Cannot delete op1"));

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);

    expect(res.success).toBe(false);
    expect(res.failedUsers).toContain("op1");
  });
});
