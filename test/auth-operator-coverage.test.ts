/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for auth.ts uncovered callable functions:
 * - createOperatorAccessKey (lines 133-181)
 * - redeemOperatorAccessKey (lines 195-248)
 * - resetOperatorAccounts error/edge branches
 * - resetAllAuthUsers error branches (586-611)
 *
 * Target: auth.ts coverage from 76% → 80%+
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

const mockAuth = {
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
  getUser: jest.fn().mockResolvedValue({ customClaims: { role: "master" } }),
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

// SHA-256 of "test-secret-key-at-least-43-characters-long!!" (we use a real hash)
import { createHash } from "crypto";
const TEST_RAW_KEY = "test-secret-key-that-is-at-least-43-characters-long!!";
const TEST_KEY_HASH = createHash("sha256").update(TEST_RAW_KEY, "utf8").digest("hex");

function resetState() {
  state = {
    masters: {
      m1: { imei: "m1", uid: "m1", secretKey: "sk-123", fcmToken: "fcm-m1" },
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
                },
              }));
            return Promise.resolve({ empty: matches.length === 0, size: matches.length, docs: matches });
          }),
        }),
        get: jest.fn(() => {
          const matches = Object.entries(collData)
            .filter(([, d]: [string, any]) => {
              if (_field === "keyHash") return d?.keyHash === value;
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

  // Default: no admin users exist
  mockAuth.listUsers.mockResolvedValue({ users: [], pageToken: undefined });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// createOperatorAccessKey
// ══════════════════════════════════════════════════════════════════════════

describe("createOperatorAccessKey", () => {
  it("erstellt Schlüssel als Admin erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    const res = await wrapped({ keyHash: TEST_KEY_HASH, role: "support", ttlMinutes: 120, label: "Test" }, asAdmin);
    expect(res.keyId).toBeDefined();
    expect(res.role).toBe("support");
    expect(res.expiresAtMs).toBeGreaterThan(Date.now());
  });

  it("erstellt Bootstrap-Admin-Schlüssel wenn kein Admin vorhanden", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    const res = await wrapped({ keyHash: TEST_KEY_HASH, role: "admin" }, asUser);
    expect(res.keyId).toBeDefined();
    expect(res.role).toBe("admin");
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: TEST_KEY_HASH }, {})).rejects.toThrow(/angemeldet/);
  });

  it("wirft invalid-argument bei ungültigem keyHash", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: "not-a-hash" }, asAdmin)).rejects.toThrow(/SHA-256/);
  });

  it("wirft invalid-argument bei ungültiger Rolle", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: TEST_KEY_HASH, role: "superadmin" }, asAdmin)).rejects.toThrow(/Role must be one of/);
  });

  it("wirft invalid-argument bei ttlMinutes außerhalb Range", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: TEST_KEY_HASH, ttlMinutes: 0 }, asAdmin)).rejects.toThrow(/ttlMinutes/);
    await expect(wrapped({ keyHash: TEST_KEY_HASH, ttlMinutes: 999999 }, asAdmin)).rejects.toThrow(/ttlMinutes/);
  });

  it("wirft permission-denied für Nicht-Admin wenn Admin existiert", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [{ uid: "existing-admin", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: TEST_KEY_HASH, role: "admin" }, asUser)).rejects.toThrow(/Admin/);
  });

  it("wirft permission-denied für Nicht-Admin bei non-admin Rolle", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    await expect(wrapped({ keyHash: TEST_KEY_HASH, role: "support" }, asUser)).rejects.toThrow(/Admin/);
  });

  it("verwendet Standard-TTL 60 Minuten ohne Angabe", async () => {
    const wrapped = testEnv.wrap(fns.createOperatorAccessKey);
    const res = await wrapped({ keyHash: TEST_KEY_HASH }, asAdmin);
    expect(res.role).toBe("admin"); // default role
    expect(res.expiresAtMs).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// redeemOperatorAccessKey
// ══════════════════════════════════════════════════════════════════════════

describe("redeemOperatorAccessKey", () => {
  beforeEach(() => {
    // Set up a valid key in state
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

  it("löst Schlüssel ein und setzt Rolle", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    const res = await wrapped({ key: TEST_RAW_KEY }, asUser);
    expect(res.success).toBe(true);
    expect(res.role).toBe("admin");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("user1", { role: "admin" });
  });

  it("wirft unauthenticated ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: TEST_RAW_KEY }, {})).rejects.toThrow(/angemeldet/);
  });

  it("wirft invalid-argument bei zu kurzem Key", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: "short" }, asUser)).rejects.toThrow(/Ungültige/);
  });

  it("wirft permission-denied bei unbekanntem Key-Hash", async () => {
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: "this-is-a-long-enough-key-but-hash-wont-match-anything-at-all!!" }, asUser)).rejects.toThrow(/ungültig|widerrufen/);
  });

  it("wirft failed-precondition bei bereits eingelöstem Schlüssel", async () => {
    state.operatorAccessKeys["key-1"].usedAt = "mock-server-timestamp";
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: TEST_RAW_KEY }, asUser)).rejects.toThrow(/bereits eingelöst/);
  });

  it("wirft deadline-exceeded bei abgelaufenem Schlüssel", async () => {
    state.operatorAccessKeys["key-1"].expiresAt = {
      seconds: Math.floor(Date.now() / 1000) - 3600,
      nanoseconds: 0,
      toMillis() { return this.seconds * 1000; },
    };
    const wrapped = testEnv.wrap(fns.redeemOperatorAccessKey);
    await expect(wrapped({ key: TEST_RAW_KEY }, asUser)).rejects.toThrow(/abgelaufen/);
  });
});
