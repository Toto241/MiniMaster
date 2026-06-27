/**
 * Branch coverage wave 14 — security-relevant helpers with low function coverage.
 *
 * Targets the Firestore/auth-backed paths and rejection branches of:
 *  - src/admin-pin.ts  (verifyAdminPinHash reject branches, stored-hash lookup,
 *                       persistence, verification freshness, claim merge)
 *  - src/rate-limiter.ts (Firestore allow/block/increment, memory fallback,
 *                         requireRateLimit throw, metrics, legacy window reset)
 *
 * Pure crypto/format paths are already covered by test/admin-pin.test.ts and
 * test/coverage-gap-fillers.test.ts; this file only fills the remaining gaps.
 */

jest.mock("../firebase", () => ({
  db: jest.fn(),
  auth: jest.fn(),
}));

import { db, auth } from "../firebase";
import {
  verifyAdminPinHash,
  hashAdminPin,
  getStoredAdminPinHash,
  isAdminPinConfigured,
  persistAdminPinHash,
  getAdminVerificationAgeMinutes,
  requireAdminPinVerification,
  mergeOperatorCustomClaims,
} from "../src/admin-pin";
import {
  checkDistributedRateLimit,
  requireRateLimit,
  getRateLimitMetrics,
  checkRateLimitLegacy,
} from "../src/rate-limiter";

const mockDb = db as jest.Mock;
const mockAuth = auth as jest.Mock;

/** Build a db() mock whose operatorConfig doc returns the given data + captures set(). */
function mockOperatorConfigDoc(data: Record<string, unknown> | undefined, setSpy?: jest.Mock) {
  const docApi = {
    get: jest.fn(async () => ({ data: () => data })),
    set: setSpy ?? jest.fn(async () => undefined),
  };
  mockDb.mockReturnValue({
    collection: jest.fn(() => ({ doc: jest.fn(() => docApi) })),
  });
  return docApi;
}

beforeEach(() => {
  mockDb.mockReset();
  mockAuth.mockReset();
});

describe("admin-pin: verifyAdminPinHash rejection branches", () => {
  it("returns false for a hash without three $-segments", async () => {
    await expect(verifyAdminPinHash("123456", "not-a-valid-hash")).resolves.toBe(false);
  });

  it("returns false when the algorithm prefix is not scrypt", async () => {
    await expect(verifyAdminPinHash("123456", "md5$abcd$ef01")).resolves.toBe(false);
  });

  it("returns false when the stored digest length differs", async () => {
    // valid shape, scrypt prefix, but digest is far shorter than SCRYPT_KEY_LEN (64 bytes)
    await expect(verifyAdminPinHash("123456", "scrypt$abcd$00")).resolves.toBe(false);
  });
});

describe("admin-pin: stored hash lookup", () => {
  it("returns the stored hash when present", async () => {
    const real = await hashAdminPin("123456");
    mockOperatorConfigDoc({ pinHash: real });
    await expect(getStoredAdminPinHash()).resolves.toBe(real);
    await expect(isAdminPinConfigured()).resolves.toBe(true);
  });

  it("returns null when pinHash is an empty string", async () => {
    mockOperatorConfigDoc({ pinHash: "" });
    await expect(getStoredAdminPinHash()).resolves.toBeNull();
    await expect(isAdminPinConfigured()).resolves.toBe(false);
  });

  it("returns null when the document has no pinHash", async () => {
    mockOperatorConfigDoc(undefined);
    await expect(getStoredAdminPinHash()).resolves.toBeNull();
  });
});

describe("admin-pin: persistence", () => {
  it("writes the hash with scrypt metadata and merge", async () => {
    const setSpy = jest.fn(async () => undefined);
    mockOperatorConfigDoc(undefined, setSpy);
    await persistAdminPinHash("scrypt$salt$digest", "op-uid-1");
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [payload, options] = setSpy.mock.calls[0];
    expect(payload).toMatchObject({
      pinHash: "scrypt$salt$digest",
      updatedByUid: "op-uid-1",
      version: 1,
      algorithm: "scrypt",
    });
    expect(options).toEqual({ merge: true });
  });
});

describe("admin-pin: verification age + enforcement", () => {
  it("returns null age when the claim is missing", () => {
    const context = { auth: { uid: "op-1", token: {} } } as never;
    expect(getAdminVerificationAgeMinutes(context)).toBeNull();
  });

  it("returns a numeric age when the claim is present", () => {
    const verifiedAt = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
    const context = { auth: { uid: "op-1", token: { admin_verified_at: verifiedAt } } } as never;
    const age = getAdminVerificationAgeMinutes(context);
    expect(age).not.toBeNull();
    expect(age as number).toBeGreaterThanOrEqual(1.9);
    expect(age as number).toBeLessThan(3);
  });

  it("is a no-op when no admin PIN is configured", async () => {
    mockOperatorConfigDoc(undefined);
    const context = { auth: { uid: "op-1", token: {} } } as never;
    await expect(requireAdminPinVerification(context, "deleteAccount")).resolves.toBeUndefined();
  });

  it("throws when a PIN is configured but verification is stale", async () => {
    mockOperatorConfigDoc({ pinHash: "scrypt$salt$digest" });
    const verifiedAt = Math.floor(Date.now() / 1000) - 45 * 60; // 45 min ago
    const context = { auth: { uid: "op-1", token: { admin_verified_at: verifiedAt } } } as never;
    await expect(requireAdminPinVerification(context, "deleteAccount")).rejects.toThrow(
      /Admin-PIN-Bestätigung erforderlich/
    );
  });

  it("passes when a PIN is configured and verification is fresh", async () => {
    mockOperatorConfigDoc({ pinHash: "scrypt$salt$digest" });
    const verifiedAt = Math.floor(Date.now() / 1000) - 60; // 1 min ago
    const context = { auth: { uid: "op-1", token: { admin_verified_at: verifiedAt } } } as never;
    await expect(requireAdminPinVerification(context, "deleteAccount")).resolves.toBeUndefined();
  });
});

describe("admin-pin: custom claim merge", () => {
  it("merges the patch over existing claims and persists", async () => {
    const getUser = jest.fn(async () => ({ customClaims: { role: "operator", existing: true } }));
    const setCustomUserClaims = jest.fn(async () => undefined);
    mockAuth.mockReturnValue({ getUser, setCustomUserClaims });

    const merged = await mergeOperatorCustomClaims("op-2", { admin_verified_at: 123 });
    expect(setCustomUserClaims).toHaveBeenCalledWith("op-2", {
      role: "operator",
      existing: true,
      admin_verified_at: 123,
    });
    expect(merged).toEqual({ role: "operator", existing: true, admin_verified_at: 123 });
  });

  it("handles a user with no existing claims", async () => {
    const getUser = jest.fn(async () => ({}));
    const setCustomUserClaims = jest.fn(async () => undefined);
    mockAuth.mockReturnValue({ getUser, setCustomUserClaims });

    const merged = await mergeOperatorCustomClaims("op-3", { support: true });
    expect(merged).toEqual({ support: true });
  });
});

/** Build a db() mock for the rate limiter with a runTransaction-backed counter doc. */
function mockRateLimitDb(opts: {
  docData?: Record<string, unknown> | null;
  transactionThrows?: boolean;
}) {
  const setSpy = jest.fn();
  const tx = {
    get: jest.fn(async () => ({
      exists: opts.docData != null,
      data: () => opts.docData ?? null,
    })),
    set: setSpy,
  };
  mockDb.mockReturnValue({
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ id: "doc" })) })),
    runTransaction: jest.fn(async (cb: (t: typeof tx) => unknown) => {
      if (opts.transactionThrows) throw new Error("firestore unavailable");
      return cb(tx);
    }),
  });
  return { tx, setSpy };
}

describe("rate-limiter: Firestore enforcement", () => {
  it("allows and opens a fresh window when no counter exists", async () => {
    mockRateLimitDb({ docData: null });
    const result = await checkDistributedRateLimit("user-a", "lock", "master");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(30); // master_lock default
    expect(result.remaining).toBe(29);
  });

  it("increments within an existing window", async () => {
    mockRateLimitDb({ docData: { windowStart: Date.now(), count: 1 } });
    const result = await checkDistributedRateLimit("user-b", "lock", "master");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(28);
  });

  it("blocks when the window count reaches the limit", async () => {
    mockRateLimitDb({ docData: { windowStart: Date.now(), count: 9999 } });
    const result = await checkDistributedRateLimit("user-c", "lock", "master");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("falls back to in-memory limiting when the transaction fails", async () => {
    mockRateLimitDb({ transactionThrows: true });
    const result = await checkDistributedRateLimit("user-d-unique", "default", "child");
    expect(result.allowed).toBe(true); // first memory hit is always allowed
    expect(result.limit).toBe(120); // child_default
  });

  it("uses the generic fallback config for an unknown role/action", async () => {
    mockRateLimitDb({ docData: null });
    const result = await checkDistributedRateLimit("user-e", "default", "master");
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(60); // master_default
  });
});

describe("rate-limiter: requireRateLimit", () => {
  it("returns the result when allowed", async () => {
    mockRateLimitDb({ docData: null });
    await expect(requireRateLimit("user-f", "lock", "master")).resolves.toMatchObject({ allowed: true });
  });

  it("throws resource-exhausted when blocked", async () => {
    mockRateLimitDb({ docData: { windowStart: Date.now(), count: 9999 } });
    await expect(requireRateLimit("user-g", "lock", "master")).rejects.toThrow(/Rate limit exceeded/);
  });
});

describe("rate-limiter: metrics", () => {
  it("aggregates blocked users by action from document ids", async () => {
    mockDb.mockReturnValue({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => ({
              size: 3,
              docs: [
                { id: "master:lock:u1" },
                { id: "master:lock:u2" },
                { id: "child:heartbeat:u3" },
              ],
            })),
          })),
        })),
      })),
    });
    const metrics = await getRateLimitMetrics();
    expect(metrics.blockedUsers).toBe(3);
    expect(metrics.topActions[0]).toEqual({ action: "lock", count: 2 });
  });

  it("returns safe defaults when the query fails", async () => {
    mockDb.mockReturnValue({
      collection: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(async () => {
              throw new Error("query failed");
            }),
          })),
        })),
      })),
    });
    const metrics = await getRateLimitMetrics();
    expect(metrics.blockedUsers).toBe(0);
    expect(metrics.topActions).toEqual([]);
  });
});

describe("rate-limiter: legacy window reset", () => {
  it("resets the counter once the window has elapsed", () => {
    const nowSpy = jest.spyOn(Date, "now");
    try {
      nowSpy.mockReturnValue(1_000_000);
      // First call seeds the window.
      expect(() => checkRateLimitLegacy("legacy-user", "legacy-action", 2, 60000)).not.toThrow();
      expect(() => checkRateLimitLegacy("legacy-user", "legacy-action", 2, 60000)).not.toThrow();
      // Advance beyond the window — the next call must reset rather than throw.
      nowSpy.mockReturnValue(1_000_000 + 60001);
      expect(() => checkRateLimitLegacy("legacy-user", "legacy-action", 2, 60000)).not.toThrow();
    } finally {
      nowSpy.mockRestore();
    }
  });
});
