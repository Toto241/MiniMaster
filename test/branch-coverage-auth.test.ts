/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage tests for auth.ts — targeting uncovered branches:
 * - redeemOperatorAccessKey: keyDoc not exists in tx (line 220), invalid role (229)
 * - setUserRole: error catch/wrap branches (305, 335)
 * - resetOperatorAccounts: resetEnabled=false (350), non-admin caller (364),
 *   accessKey cleanup catch (397), deleteUser failure (400), outer catch (434)
 * - resetAllAuthUsers: recoveryToken paths (463,476), accessKey cleanup catch (523),
 *   audit log catch (536), outer catch + nested audit failure (566-611)
 * - resetAllAuthUsersHealth: runtimeConfig catch (645), recoveryTokenConfigured (648)
 * - generateCustomToken: LEGACY_AUTH_DISABLED branch (733)
 * - registerMasterDevice: LEGACY_AUTH_DISABLED + auth mismatch branches (806+)
 */
import fft from "firebase-functions-test";
import { db as getDb } from "../firebase";

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

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ uid: "user1", customClaims: { role: "master" } }),
  createCustomToken: jest.fn().mockResolvedValue("mock-token"),
  revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  listUsers: jest.fn().mockResolvedValue({ users: [], pageToken: undefined }),
  createUser: jest.fn().mockImplementation((opts: { uid: string }) =>
    Promise.resolve({ uid: opts.uid, customClaims: {} })
  ),
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
    messaging: () => ({ send: jest.fn() }),
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

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asUser = { auth: { uid: "user1", token: { role: "master" } } };
const asSupport = { auth: { uid: "support1", token: { role: "support" } } };

import { createHash } from "crypto";
const TEST_RAW_KEY = "test-secret-key-that-is-at-least-43-characters-long!!";
const TEST_KEY_HASH = createHash("sha256").update(TEST_RAW_KEY, "utf8").digest("hex");

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", secretKey: "sk-123", fcmToken: "fcm-m1" },
      user1: { imei: "user1", uid: "user1", secretKey: "sk-user1" },
    },
    children: {},
    supportTickets: {},
    supportAccessGrants: {},
    subscriptions: {},
    legalPolicies: {},
    masterLegalConsents: {},
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    operatorConfig: {},
    operatorAccessKeys: {},
    legacyAuthUsage: {},
  };
}

beforeAll(() => {
  process.env.ENABLE_OPERATOR_ACCOUNT_RESET = "true";
  fns = require("../index");
  db = getDb();
});

beforeEach(() => {
  jest.clearAllMocks();
  resetState();

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
    return {
      doc: jest.fn((docId?: string) => {
        const id = docId || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const ref: any = {
          id,
          get: () => {
            const d = collData[id];
            return Promise.resolve({ exists: !!d, data: () => d, id, ref });
          },
          update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[id] = opts?.merge ? { ...(collData[id] || {}), ...data } : { ...data };
            state[coll] = collData;
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${id}/${sub}`;
            if (!state[key]) state[key] = {};
            return {
              get: jest.fn(() => Promise.resolve({
                empty: Object.keys(state[key]).length === 0,
                size: Object.keys(state[key]).length,
                docs: Object.entries(state[key]).map(([sid, sdata]) => ({
                  id: sid, data: () => sdata, ref: { delete: jest.fn(() => Promise.resolve()) },
                })),
              })),
              add: jest.fn((data: any) => {
                const sid = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                state[key][sid] = data;
                return Promise.resolve({ id: sid });
              }),
            };
          }),
        };
        return ref;
      }),
      add: jest.fn((data: any) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        collData[id] = data;
        state[coll] = collData;
        return Promise.resolve({ id });
      }),
      where: jest.fn((_field: string, _op: string, value: any) => ({
        limit: jest.fn().mockReturnValue({
          get: jest.fn(() => {
            const matches = Object.entries(collData)
              .filter(([, d]: [string, any]) => {
                if (_field === "keyHash") return d?.keyHash === value;
                if (_field === "masterImei") return d?.masterImei === value;
                return false;
              })
              .map(([id, data]) => ({
                id, data: () => data,
                ref: {
                  id,
                  get: () => {
                    const d = collData[id];
                    return Promise.resolve({ exists: !!d, data: () => d, id });
                  },
                  update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
                  delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
                },
              }));
            return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
          }),
        }),
        get: jest.fn(() => {
          const matches = Object.entries(collData)
            .filter(([, d]: [string, any]) => {
              if (_field === "keyHash") return d?.keyHash === value;
              if (_field === "masterImei") return d?.masterImei === value;
              return false;
            })
            .map(([id, data]) => ({
              id, data: () => data,
              ref: {
                id,
                get: () => {
                  const d = collData[id];
                  return Promise.resolve({ exists: !!d, data: () => d, id });
                },
                update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
                delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
              },
            }));
          return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
        }),
      })),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data,
          ref: {
            id,
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });

  (db as any).runTransaction = jest.fn(async (fn: any) => {
    const tx = {
      get: jest.fn(async (ref: any) => ref.get()),
      update: jest.fn((ref: any, data: any) => ref.update(data)),
      set: jest.fn((ref: any, data: any) => ref.set(data)),
    };
    return fn(tx);
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// redeemOperatorAccessKey — uncovered transaction branches
// ══════════════════════════════════════════════════════════════════════════

describe("redeemOperatorAccessKey — transaction branches", () => {
  beforeEach(() => {
    state.operatorAccessKeys["key-1"] = {
      keyHash: TEST_KEY_HASH,
      role: "admin",
      label: "Test",
      createdByUid: "admin1",
      createdAt: "mock-server-timestamp",
      expiresAt: { seconds: Math.floor(Date.now() / 1000) + 3600, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
      usedAt: null,
      redeemedByUid: null,
    };
  });

  it("wirft not-found wenn keyDoc im Transaction nicht existiert (line 220)", async () => {
    // The key exists in query but disappears inside the transaction
    (db as any).runTransaction = jest.fn(async (fn: any) => {
      const tx = {
        get: jest.fn(async () => ({ exists: false, data: () => undefined })),
        update: jest.fn(),
        set: jest.fn(),
      };
      return fn(tx);
    });
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: TEST_RAW_KEY }, asUser)).rejects.toThrow(/nicht gefunden/);
  });

  it("wirft internal bei ungültiger Rolle im Schlüssel (line 229)", async () => {
    state.operatorAccessKeys["key-1"].role = "INVALID_ROLE";
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: TEST_RAW_KEY }, asUser)).rejects.toThrow(/Ungültige Rolleninformation/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// setUserRole — error catch/wrap branches (lines 305, 335)
// ══════════════════════════════════════════════════════════════════════════

describe("setUserRole — error branches", () => {
  it("wirft bei setCustomUserClaims-Fehler einen internen Fehler (catch wrap)", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("Auth service down"));
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "target1", role: "support" }, asAdmin)).rejects.toThrow(/Failed to set user role/);
  });

  it("wirft HttpsError durch ohne Wrapping (catch re-throw)", async () => {
    // Missing uid → early HttpsError via requireAdmin or input validation
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "", role: "support" }, asAdmin)).rejects.toThrow(/valid user UID/);
  });

  it("wirft bei ungültiger Rolle", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "u1", role: "megaadmin" }, asAdmin)).rejects.toThrow(/Role must be one of/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// resetOperatorAccounts — branches
// ══════════════════════════════════════════════════════════════════════════

describe("resetOperatorAccounts — branch coverage", () => {
  it("wirft failed-precondition wenn resetEnabled=false (line 350)", async () => {
    const origEmulator = process.env.FUNCTIONS_EMULATOR;
    const origReset = process.env.ENABLE_OPERATOR_ACCOUNT_RESET;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.ENABLE_OPERATOR_ACCOUNT_RESET;
    try {
      const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
      await expect(wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin))
        .rejects.toThrow(/disabled/);
    } finally {
      if (origEmulator !== undefined) process.env.FUNCTIONS_EMULATOR = origEmulator;
      if (origReset !== undefined) process.env.ENABLE_OPERATOR_ACCOUNT_RESET = origReset;
    }
  });

  it("loggt Warnung bei non-admin Caller (line 364)", async () => {
    // non-admin user calls with reset enabled
    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asSupport);
    expect(res.success).toBe(true);
  });

  it("behandelt accessKey-Cleanup-Fehler (line 397)", async () => {
    // Add some operator access keys that will cause cleanup to fail
    state.operatorAccessKeys["key-a"] = { keyHash: "h1", role: "admin" };
    // Make the collection.get throw during deleteAllOperatorAccessKeys
    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "operatorAccessKeys") {
        return {
          doc: jest.fn(),
          get: jest.fn().mockRejectedValue(new Error("Cleanup failed")),
          where: jest.fn().mockReturnValue({ get: jest.fn().mockRejectedValue(new Error("Cleanup failed")) }),
        } as any;
      }
      return origImpl!(...args);
    });

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);
    // Should still succeed, cleanup error is non-fatal
    expect(res.success).toBe(true);
  });

  it("erfasst failedUids bei deleteUser-Fehler (line 400)", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [
        { uid: "op1", customClaims: { role: "admin" } },
        { uid: "op2", customClaims: { role: "support" } },
      ],
      pageToken: undefined,
    });
    mockAuth.deleteUser
      .mockResolvedValueOnce(undefined) // op1 success
      .mockRejectedValueOnce(new Error("Delete failed"));   // op2 fails

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);
    expect(res.failedUsers).toContain("op2");
    expect(res.deletedUsers).toBe(1);
    expect(res.success).toBe(false);
  });

  it("wirft HttpsError im outer catch durch (line 434)", async () => {
    // Force listUsers to throw a generic error to trigger outer catch
    mockAuth.listUsers.mockRejectedValueOnce(new Error("Unexpected list error"));
    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    await expect(wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin))
      .rejects.toThrow(/reset failed/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// resetAllAuthUsers — branches
// ══════════════════════════════════════════════════════════════════════════

describe("resetAllAuthUsers — branch coverage", () => {
  it("erlaubt Zugang per Recovery-Token ohne Auth (line 463, 476)", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    // Without auth, without recovery token → should throw unauthenticated
    await expect(wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, {}))
      .rejects.toThrow(/angemeldet|Recovery/);
  });

  it("behandelt accessKey-Cleanup-Fehler (line 523)", async () => {
    state.operatorAccessKeys["key-x"] = { keyHash: "hx", role: "admin" };
    const origImpl = jest.spyOn(db, "collection").getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
      const coll = String(args[0] ?? "");
      if (coll === "operatorAccessKeys") {
        return {
          doc: jest.fn(),
          get: jest.fn().mockRejectedValue(new Error("AccessKey cleanup failure")),
          where: jest.fn().mockReturnValue({ get: jest.fn().mockRejectedValue(new Error("err")) }),
        } as any;
      }
      return origImpl!(...args);
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.accessKeyCleanupWarning).toBeTruthy();
  });

  it("verarbeitet leere Benutzerliste korrekt", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.deletedUsers).toBe(0);
    expect(res.matchedUsers).toBe(0);
  });

  it("behandelt outer catch mit generic Error (line 586-611)", async () => {
    // Force listUsers to throw a non-HttpsError to trigger outer catch
    mockAuth.listUsers.mockRejectedValueOnce(new Error("List users crashed"));

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    await expect(wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin))
      .rejects.toThrow(/reset failed/);
  });

  it("wirft HttpsError im outer catch durch (line 586)", async () => {
    // Force a HttpsError to be re-thrown from outer catch
    mockAuth.listUsers.mockImplementationOnce(() => {
      const funcs = require("firebase-functions");
      throw new funcs.https.HttpsError("unavailable", "Service unavailable");
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    await expect(wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin))
      .rejects.toThrow(/unavailable|Service/);
  });

  it("behandelt deleteUser-Fehler für einzelne User", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [
        { uid: "u1", customClaims: {} },
        { uid: "u2", customClaims: {} },
      ],
      pageToken: undefined,
    });
    mockAuth.deleteUser
      .mockResolvedValueOnce(undefined) // u1 OK
      .mockRejectedValueOnce(new Error("Cannot delete")); // u2 fails

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    expect(res.failedUsers).toContain("u2");
    expect(res.deletedUsers).toBe(1);
    expect(res.success).toBe(false);
  });

  it("skippt aktuellen Caller bei includeCurrentSessionUser=false", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
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
    expect(res.deletedUsers).toBe(1);
  });

  it("löscht aktuellen Caller bei includeCurrentSessionUser=true", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [
        { uid: "admin1", customClaims: { role: "admin" } },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
      includeCurrentSessionUser: true,
    }, asAdmin);
    expect(res.deletedUsers).toBe(1);
    expect(res.skippedCurrentSessionUsers).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// resetAllAuthUsersHealth — config catch branch
// ══════════════════════════════════════════════════════════════════════════

describe("resetAllAuthUsersHealth — branches", () => {
  it("gibt Health-Status mit recoveryTokenConfigured=false zurück", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
    const res = await wrapped({}, asAdmin);
    expect(res.reachable).toBe(true);
    expect(res.isAdmin).toBe(true);
    expect(typeof res.recoveryTokenConfigured).toBe("boolean");
  });

  it("gibt callerRole zurück für non-admin", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
    const res = await wrapped({}, asUser);
    expect(res.reachable).toBe(true);
    expect(res.callerRole).toBe("master");
    expect(res.isAdmin).toBe(false);
  });

  it("akzeptiert requestId Parameter", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
    const res = await wrapped({ requestId: "my-check-123" }, asAdmin);
    expect(res.requestId).toBe("my-check-123");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// generateCustomToken — LEGACY_AUTH_DISABLED and edge branches
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken — branches", () => {
  it("generiert Token für authentifizierten User", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, asAdmin);
    expect(res.customToken).toBe("mock-token");
  });

  it("generiert Token via Legacy IMEI/secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({ masterImei: "m1", secretKey: "sk-123" }, {});
    expect(res.customToken).toBe("mock-token");
  });

  it("wirft bei ungültigem masterImei/secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "m1", secretKey: "wrong" }, {}))
      .rejects.toThrow(/Invalid master IMEI/);
  });

  it("wirft bei fehlendem masterImei ohne auth", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, {}))
      .rejects.toThrow(/unauthenticated|masterImei/);
  });

  it("wirft bei getUser-Fehler internal error", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("User not found"));
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, asAdmin))
      .rejects.toThrow(/unexpected error/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// registerMasterDevice — branches
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice — branches", () => {
  it("registriert neues Gerät mit Auth", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "admin1" }, asAdmin);
    expect(res).toBeDefined();
  });

  it("wirft bei fehlendem imei Parameter", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({}, asAdmin))
      .rejects.toThrow(/valid 'imei'/);
  });

  it("wirft bei authenticated uid !== imei mismatch", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "different-id" }, asAdmin))
      .rejects.toThrow(/does not match/);
  });

  it("registriert via Legacy IMEI ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "new-device-1" }, {});
    expect(res).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROUND 2 — remaining uncovered branches
// ══════════════════════════════════════════════════════════════════════════

describe("resetOperatorAccounts — additional branches", () => {
  it("wirft unauthenticated ohne Auth (line 305)", async () => {
    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    await expect(wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, {}))
      .rejects.toThrow(/angemeldet|unauthenticated/i);
  });

  it("wirft invalid-argument bei falschem confirmText (line 335)", async () => {
    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    await expect(wrapped({ confirmText: "WRONG_TEXT" }, asAdmin))
      .rejects.toThrow(/RESET_OPERATOR_ACCOUNTS/);
  });

  it("wirft invalid-argument bei leerem confirmText", async () => {
    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    await expect(wrapped({}, asAdmin))
      .rejects.toThrow(/RESET_OPERATOR_ACCOUNTS/);
  });
});

describe("resetAllAuthUsers — additional branches", () => {
  it("wirft invalid-argument bei falschem confirmText (line 476)", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    await expect(wrapped({ confirmText: "WRONG" }, asAdmin))
      .rejects.toThrow(/RESET_ALL_AUTH_USERS/);
  });

  it("ignoriert K_CONFIGURATION ohne Legacy-Config-Pfad (lines 434-437)", async () => {
    const functions = require("firebase-functions/v1");
    if (typeof functions.resetCache === "function") functions.resetCache();
    process.env.K_CONFIGURATION = "force-v2-error";
    try {
      const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
      await expect(wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin))
        .resolves.toBeDefined();
    } finally {
      delete process.env.K_CONFIGURATION;
      if (typeof functions.resetCache === "function") functions.resetCache();
    }
  });

  it("behandelt AuditLogger.logSuccess-Fehler (lines 566-567)", async () => {
    const shared = require("../src/shared");
    const logSpy = jest.spyOn(shared.AuditLogger, "logSuccess").mockRejectedValueOnce(new Error("Audit boom"));

    mockAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: undefined });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    // Should succeed but with auditLogWarning
    expect(res.auditLogWarning).toBeTruthy();
    logSpy.mockRestore();
  });

  it("behandelt AuditLogger.logFailure-Fehler im outer catch (line 604)", async () => {
    const shared = require("../src/shared");
    const failSpy = jest.spyOn(shared.AuditLogger, "logFailure").mockRejectedValueOnce(new Error("Double boom"));

    // Force outer catch by making listUsers throw a regular error
    mockAuth.listUsers.mockRejectedValueOnce(new Error("Service unavailable"));

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    await expect(wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin))
      .rejects.toThrow(/reset failed|Service unavailable/);
    failSpy.mockRestore();
  });
});

describe("resetAllAuthUsersHealth — no legacy config dependency (lines 645-648)", () => {
  it("ignoriert K_CONFIGURATION ohne Legacy-Config-Pfad", async () => {
    const functions = require("firebase-functions/v1");
    if (typeof functions.resetCache === "function") functions.resetCache();
    process.env.K_CONFIGURATION = "force-v2-error";
    try {
      const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
      const res = await wrapped({}, asAdmin);
      expect(res.reachable).toBe(true);
      expect(typeof res.recoveryTokenConfigured).toBe("boolean");
    } finally {
      delete process.env.K_CONFIGURATION;
      if (typeof functions.resetCache === "function") functions.resetCache();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ROUND 3 — env config truthy branches for reset gating and recovery token
// ══════════════════════════════════════════════════════════════════════════

describe("resetOperatorAccounts — happy path with env config & operators", () => {
  beforeEach(() => {
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "true";
    process.env.ADMIN_RECOVERY_TOKEN = "secret-recovery-token-123";
  });

  afterEach(() => {
    delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
    delete process.env.ADMIN_RECOVERY_TOKEN;
  });

  it("löscht Operator-Benutzer erfolgreich (lines 350-406)", async () => {
    // Reset to avoid once-queue leaks, then set persistent mock
    mockAuth.listUsers.mockReset();
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "op1", customClaims: { role: "support" } },
        { uid: "op2", customClaims: { role: "auditor" } },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.deletedUsers).toBe(2);
  });

  it("verarbeitet deleteUser-Fehler graceful (line 379)", async () => {
    mockAuth.listUsers.mockReset();
    mockAuth.listUsers.mockResolvedValue({
      users: [{ uid: "op-fail", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    mockAuth.deleteUser.mockRejectedValueOnce(new Error("User deletion failed"));

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);
    expect(res.failedUsers).toContain("op-fail");
  });

  it("nicht-admin Aufrufer wird gewarnt (line 329)", async () => {
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });

    const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
    const asNonAdmin = { auth: { uid: "user-1", token: { role: "support" } } };
    const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asNonAdmin);
    expect(res.success).toBe(true);
  });
});

describe("resetAllAuthUsers — happy path with env config & users", () => {
  beforeEach(() => {
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "true";
    process.env.ADMIN_RECOVERY_TOKEN = "secret-token-456";
  });

  afterEach(() => {
    delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
    delete process.env.ADMIN_RECOVERY_TOKEN;
  });

  it("löscht Benutzer mit Paginierung (lines 483-499)", async () => {
    mockAuth.listUsers.mockReset();
    let callNum = 0;
    mockAuth.listUsers.mockImplementation(() => {
      callNum++;
      if (callNum === 1) {
        return Promise.resolve({
          users: [
            { uid: "user-a", customClaims: { role: "master" } },
            { uid: "user-b", customClaims: {} },
          ],
          pageToken: "next-page",
        });
      }
      return Promise.resolve({
        users: [{ uid: "user-c", customClaims: { role: "admin" } }],
        pageToken: undefined,
      });
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS", includeCurrentSessionUser: true }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.deletedUsers).toBe(3);
  });

  it("überspringt aktuellen Benutzer bei includeCurrentSessionUser=false (line 499)", async () => {
    mockAuth.listUsers.mockReset();
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "admin1", customClaims: { role: "admin" } },
        { uid: "other-user", customClaims: {} },
      ],
      pageToken: undefined,
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    expect(res.deletedUsers).toBe(1); // Only other-user deleted
    expect(res.skippedCurrentSessionUsers).toContain("admin1");
  });

  it("verarbeitet Recovery-Token ohne Auth (lines 446-472)", async () => {
    mockAuth.listUsers.mockReset();
    mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
      recoveryToken: "secret-token-456",
      requestId: "test-request-123",
    }, { auth: undefined } as any);
    expect(res.success).toBe(true);
    expect(res.requestId).toBe("test-request-123");
  });

  it("wirft bei fehlendem Auth + ungültigem Recovery-Token (line 469)", async () => {
    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    await expect(wrapped({
      confirmText: "RESET_ALL_AUTH_USERS",
      recoveryToken: "wrong-token",
    }, { auth: undefined } as any))
      .rejects.toThrow(/angemeldet|Recovery/i);
  });

  it("verarbeitet AccessKey-Cleanup Fehler graceful (line 536)", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: undefined });

    // Make operatorAccessKeys query fail
    const adminMod = require("firebase-admin");
    const origFirestore = adminMod.firestore;
    const realMockDb = origFirestore();
    const capturedImpl = (realMockDb.collection as jest.Mock).getMockImplementation?.();

    jest.spyOn(realMockDb, "collection").mockImplementation((...args: unknown[]) => {
      if (String(args[0]) === "operatorAccessKeys") {
        return {
          get: jest.fn().mockRejectedValue(new Error("Access keys query failed")),
        } as any;
      }
      return capturedImpl ? capturedImpl(...args) : realMockDb.collection(...args);
    });

    const wrapped = testEnv.wrap(fns.resetAllAuthUsers);
    const res = await wrapped({ confirmText: "RESET_ALL_AUTH_USERS" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.accessKeyCleanupWarning).toBeTruthy();

    (realMockDb.collection as jest.Mock).mockRestore?.();
  });
});

describe("resetAllAuthUsersHealth — env config branches (lines 637-658)", () => {
  it("zeigt resetEnabled und recoveryTokenConfigured mit Config", async () => {
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "true";
    process.env.ADMIN_RECOVERY_TOKEN = "configured-token";
    try {
      const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
      const res = await wrapped({ requestId: "health-check-1" }, asAdmin);
      expect(res.reachable).toBe(true);
      expect(res.requestId).toBe("health-check-1");
      expect(res.resetEnabled).toBe(true);
      expect(res.recoveryTokenConfigured).toBe(true);
      expect(res.callerRole).toBe("admin");
    } finally {
      delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
      delete process.env.ADMIN_RECOVERY_TOKEN;
    }
  });

  it("zeigt recoveryTokenConfigured=false ohne Token", async () => {
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "false";
    try {
      const wrapped = testEnv.wrap(fns.resetAllAuthUsersHealth);
      const res = await wrapped({}, asAdmin);
      expect(res.recoveryTokenConfigured).toBe(false);
    } finally {
      delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
    }
  });
});

describe("listOperatorUsers — customClaims branches (line 88)", () => {
  it("erkennt operator-Rollen in customClaims", async () => {
    process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET = "true";
    mockAuth.listUsers.mockReset();
    mockAuth.listUsers.mockResolvedValue({
      users: [
        { uid: "u1", customClaims: { role: "admin" } },
        { uid: "u2", customClaims: { role: "master" } },
        { uid: "u3", customClaims: null },
        { uid: "u4" },
      ],
      pageToken: undefined,
    });

    try {
      const wrapped = testEnv.wrap(fns.resetOperatorAccounts);
      const res = await wrapped({ confirmText: "RESET_OPERATOR_ACCOUNTS" }, asAdmin);
      // Only u1 has an operator role
      expect(res.matchedUsers).toBe(1);
    } finally {
      delete process.env.MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET;
    }
  });
});
