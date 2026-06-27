/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for the operator/admin callables in auth.ts that were only covered by
 * source-string assertions (verify-admin-pin.test.ts) and never actually invoked:
 *   getOperatorAdminPinStatus, setOperatorAdminPin, verifyAdminPin,
 *   migrateToFamiliesSchema, getLegacyAuthUsageStats.
 */
import fft from "firebase-functions-test";
import { db as getDb, auth as getAuth } from "../firebase";
import { hashAdminPin } from "../src/admin-pin";

jest.mock("../firebase", () => ({
  db: jest.fn(),
  auth: jest.fn(),
  storage: jest.fn(() => ({ bucket: jest.fn() })),
}));

jest.mock("firebase-admin", () => {
  const original = jest.requireActual("firebase-admin");
  class MockTimestamp {
    constructor(public seconds: number) {}
    static now() { return new MockTimestamp(1_700_000_000); }
    toMillis() { return this.seconds * 1000; }
  }
  const firestoreNamespace: any = () => ({ collection: jest.fn() });
  firestoreNamespace.Timestamp = MockTimestamp;
  firestoreNamespace.FieldValue = {
    serverTimestamp: () => "SERVER_TS",
    increment: (n: number) => ({ __inc: n }),
    arrayUnion: (...ids: string[]) => ({ __arrayUnion: ids }),
  };
  return { ...original, initializeApp: jest.fn(), firestore: firestoreNamespace };
});

const testEnv = fft();
let fns: any;
const mockDb = getDb as unknown as jest.Mock;
const mockAuth = getAuth as unknown as jest.Mock;

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } }, app: { appId: "t" } };
const asUser = { auth: { uid: "u1", token: {} }, app: { appId: "t" } };

const auditAdd = jest.fn(async () => ({ id: "audit1" }));

/** operatorConfig/adminPin-backed db with a captured set() and audit add(). */
function makeAdminPinDb(pinDocData: Record<string, unknown> | undefined, setSpy?: jest.Mock) {
  const pinDoc = {
    get: jest.fn(async () => ({ data: () => pinDocData })),
    set: setSpy ?? jest.fn(async () => undefined),
  };
  return {
    collection: jest.fn((name: string) => {
      if (name === "audit_logs") return { add: auditAdd };
      // operatorConfig + the rate-limiter collection both go through .doc()
      return { doc: jest.fn(() => pinDoc), add: auditAdd };
    }),
    // no runTransaction -> rate limiter falls back to in-memory and allows
  };
}

beforeAll(() => { fns = require("../index"); });
beforeEach(() => {
  mockDb.mockReset();
  mockAuth.mockReset();
  auditAdd.mockClear();
  mockAuth.mockReturnValue({
    getUser: jest.fn(async () => ({ customClaims: { role: "admin" } })),
    setCustomUserClaims: jest.fn(async () => undefined),
  });
});
afterAll(() => testEnv.cleanup());

describe("getOperatorAdminPinStatus", () => {
  it("reports configured=true with updatedAt when a PIN hash is stored", async () => {
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: "scrypt$s$h", updatedAt: { toMillis: () => 1700 } }));
    const res = await testEnv.wrap(fns.getOperatorAdminPinStatus)({}, asAdmin);
    expect(res.configured).toBe(true);
    expect(res.updatedAtMs).toBe(1700);
  });

  it("reports configured=false when no PIN is stored", async () => {
    mockDb.mockReturnValue(makeAdminPinDb(undefined));
    const res = await testEnv.wrap(fns.getOperatorAdminPinStatus)({}, asAdmin);
    expect(res.configured).toBe(false);
    expect(res.updatedAtMs).toBeNull();
  });

  it("rejects non-admin callers", async () => {
    mockDb.mockReturnValue(makeAdminPinDb(undefined));
    await expect(testEnv.wrap(fns.getOperatorAdminPinStatus)({}, asUser)).rejects.toThrow();
  });
});

describe("setOperatorAdminPin", () => {
  it("sets a new PIN when none exists", async () => {
    const setSpy = jest.fn(async () => undefined);
    mockDb.mockReturnValue(makeAdminPinDb(undefined, setSpy));
    const res = await testEnv.wrap(fns.setOperatorAdminPin)({ pin: "123456" }, asAdmin);
    expect(res).toEqual({ success: true, configured: true });
    expect(setSpy).toHaveBeenCalled();
  });

  it("requires a pin", async () => {
    mockDb.mockReturnValue(makeAdminPinDb(undefined));
    await expect(testEnv.wrap(fns.setOperatorAdminPin)({}, asAdmin)).rejects.toThrow(/pin ist erforderlich/);
  });

  it("requires currentPin to replace an existing PIN", async () => {
    const existing = await hashAdminPin("111111");
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: existing }));
    await expect(
      testEnv.wrap(fns.setOperatorAdminPin)({ pin: "222222" }, asAdmin)
    ).rejects.toThrow(/currentPin ist erforderlich/);
  });

  it("rejects a wrong currentPin", async () => {
    const existing = await hashAdminPin("111111");
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: existing }));
    await expect(
      testEnv.wrap(fns.setOperatorAdminPin)({ pin: "222222", currentPin: "999999" }, asAdmin)
    ).rejects.toThrow(/Aktuelle Admin-PIN ist falsch/);
  });

  it("replaces the PIN when the correct currentPin is supplied", async () => {
    const existing = await hashAdminPin("111111");
    const setSpy = jest.fn(async () => undefined);
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: existing }, setSpy));
    const res = await testEnv.wrap(fns.setOperatorAdminPin)({ pin: "222222", currentPin: "111111" }, asAdmin);
    expect(res.success).toBe(true);
    expect(setSpy).toHaveBeenCalled();
  });
});

describe("verifyAdminPin", () => {
  it("fails when no PIN is configured", async () => {
    mockDb.mockReturnValue(makeAdminPinDb(undefined));
    await expect(testEnv.wrap(fns.verifyAdminPin)({ pin: "123456" }, asAdmin)).rejects.toThrow(/noch keine Admin-PIN/);
  });

  it("rejects a wrong PIN", async () => {
    const stored = await hashAdminPin("123456");
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: stored }));
    await expect(testEnv.wrap(fns.verifyAdminPin)({ pin: "000000" }, asAdmin)).rejects.toThrow(/Admin-PIN ist falsch/);
  });

  it("verifies a correct PIN and stamps admin_verified_at", async () => {
    const stored = await hashAdminPin("123456");
    const setClaims = jest.fn(async () => undefined);
    mockAuth.mockReturnValue({ getUser: jest.fn(async () => ({ customClaims: {} })), setCustomUserClaims: setClaims });
    mockDb.mockReturnValue(makeAdminPinDb({ pinHash: stored }));
    const res = await testEnv.wrap(fns.verifyAdminPin)({ pin: "123456" }, asAdmin);
    expect(res.success).toBe(true);
    expect(typeof res.verifiedAt).toBe("number");
    expect(setClaims).toHaveBeenCalledWith("admin1", expect.objectContaining({ admin_verified_at: expect.any(Number) }));
  });
});

describe("migrateToFamiliesSchema", () => {
  function makeMigrationDb(opts: { masters: Array<{ id: string; data: any }>; families: Record<string, any>; childIds: string[]; mastersThrows?: boolean }) {
    const familyUpdate = jest.fn(async () => undefined);
    const db: any = {
      collection: jest.fn((name: string) => {
        if (name === "masters") {
          return { get: jest.fn(async () => {
            if (opts.mastersThrows) throw new Error("masters read failed");
            return { docs: opts.masters.map((m) => ({ id: m.id, data: () => m.data })) };
          }) };
        }
        if (name === "families") {
          return { doc: jest.fn((id: string) => ({
            get: jest.fn(async () => ({ exists: opts.families[id] !== undefined })),
            set: jest.fn(async (d: any) => { opts.families[id] = d; }),
            update: familyUpdate,
          })) };
        }
        if (name === "children") {
          return { where: jest.fn(() => ({ get: jest.fn(async () => ({ docs: opts.childIds.map((id) => ({ id })) })) })) };
        }
        return { add: auditAdd, doc: jest.fn() };
      }),
    };
    return { db, familyUpdate };
  }

  it("creates a family and links children for a new master", async () => {
    const { db, familyUpdate } = makeMigrationDb({
      masters: [{ id: "m1", data: { deviceName: "Mama" } }],
      families: {},
      childIds: ["c1", "c2"],
    });
    mockDb.mockReturnValue(db);
    const res = await testEnv.wrap(fns.migrateToFamiliesSchema)(undefined, asAdmin);
    expect(res.familiesCreated).toBe(1);
    expect(res.childrenLinked).toBe(2);
    expect(familyUpdate).toHaveBeenCalled();
  });

  it("is idempotent: skips creation when the family already exists and has no children", async () => {
    const { db } = makeMigrationDb({
      masters: [{ id: "m1", data: {} }],
      families: { m1: { existing: true } },
      childIds: [],
    });
    mockDb.mockReturnValue(db);
    const res = await testEnv.wrap(fns.migrateToFamiliesSchema)(undefined, asAdmin);
    expect(res.familiesCreated).toBe(0);
    expect(res.childrenLinked).toBe(0);
  });

  it("wraps a top-level failure as internal", async () => {
    const { db } = makeMigrationDb({ masters: [], families: {}, childIds: [], mastersThrows: true });
    mockDb.mockReturnValue(db);
    await expect(testEnv.wrap(fns.migrateToFamiliesSchema)(undefined, asAdmin)).rejects.toThrow(/Migration failed/);
  });
});

describe("getLegacyAuthUsageStats", () => {
  function makeLegacyDb(usageByDate: Record<string, any[]>, throwsForAll = false) {
    return {
      collection: jest.fn((name: string) => {
        if (name === "legacy_auth_usage") {
          return { doc: jest.fn((date: string) => ({
            collection: jest.fn(() => ({
              get: jest.fn(async () => {
                if (throwsForAll) throw new Error("read failed");
                const users = usageByDate[date] || [];
                return {
                  size: users.length,
                  forEach: (cb: (d: any) => void) => users.forEach((u) => cb({ data: () => u })),
                };
              }),
            })),
          })) };
        }
        return { add: auditAdd };
      }),
    };
  }

  it("aggregates daily usage and computes cutover readiness", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockDb.mockReturnValue(makeLegacyDb({ [today]: [{ count: 3 }, { count: 2 }] }));
    const res = await testEnv.wrap(fns.getLegacyAuthUsageStats)({ days: 14 }, asAdmin);
    expect(res.days).toBe(14);
    expect(res.daily).toHaveLength(14);
    expect(res.summary.totalCalls).toBe(5);
    expect(res.summary.cutoverReady).toBe(false); // usage present
  });

  it("clamps days to 30 and tolerates read errors per day", async () => {
    mockDb.mockReturnValue(makeLegacyDb({}, true));
    const res = await testEnv.wrap(fns.getLegacyAuthUsageStats)({ days: 999 }, asAdmin);
    expect(res.days).toBe(30);
    expect(res.summary.totalCalls).toBe(0);
    expect(res.summary.cutoverReady).toBe(true); // 0 calls, >=14 days
  });

  it("defaults to a 14-day window when days is omitted", async () => {
    mockDb.mockReturnValue(makeLegacyDb({}));
    const res = await testEnv.wrap(fns.getLegacyAuthUsageStats)({}, asAdmin);
    expect(res.days).toBe(14);
  });
});
