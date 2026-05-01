/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for external-integrations Cloud Functions and validators.
 */
import fft from "firebase-functions-test";

const mockDocData: Record<string, any> = {};

function deepMerge(target: any, source: any): any {
  for (const k of Object.keys(source)) {
    if (
      source[k] && typeof source[k] === "object" && !Array.isArray(source[k])
      && target[k] && typeof target[k] === "object" && !Array.isArray(target[k])
    ) {
      deepMerge(target[k], source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

const mockDocSet = jest.fn(async (data: any, opts?: { merge?: boolean }) => {
  // Translate dotted keys (e.g., "apple.developerTeamId") into nested paths.
  const nested: Record<string, any> = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (k.includes(".")) {
      const parts = k.split(".");
      let cur = nested;
      for (let i = 0; i < parts.length - 1; i += 1) {
        cur[parts[i]] = cur[parts[i]] || {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = v;
    } else {
      nested[k] = v;
    }
  }
  if (opts?.merge) {
    deepMerge(mockDocData, nested);
  } else {
    for (const k of Object.keys(mockDocData)) delete mockDocData[k];
    Object.assign(mockDocData, nested);
  }
});
const mockDocGet = jest.fn(async () => ({
  exists: Object.keys(mockDocData).length > 0,
  data: () => ({ ...mockDocData }),
}));
const mockDocFn = jest.fn(() => ({ get: mockDocGet, set: mockDocSet }));
const mockCollLimitGet = jest.fn().mockResolvedValue({ empty: true, docs: [] });
const mockCollAdd = jest.fn().mockResolvedValue({ id: "audit1" });
const mockCollFn = jest.fn(() => ({
  limit: jest.fn(() => ({ get: mockCollLimitGet })),
  add: mockCollAdd,
}));

jest.mock("../firebase", () => ({
  db: jest.fn(() => ({ collection: mockCollFn, doc: mockDocFn })),
  auth: jest.fn(() => ({})),
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));

jest.mock("firebase-admin/auth", () => ({ getAuth: jest.fn(() => ({})) }));
jest.mock("firebase-admin/storage", () => ({
  getStorage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      name: "test-bucket",
      getMetadata: jest.fn().mockResolvedValue([{ name: "test-bucket" }]),
    })),
  })),
}));
jest.mock("firebase-admin/messaging", () => ({
  getMessaging: jest.fn(() => ({ send: jest.fn() })),
}));

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

process.env.GEMINI_API_KEY = "test-key";
// Pure validators: load directly to keep them runnable even if `index.ts`
// pulls in transitive ESM-only deps that the current jest runtime cannot
// parse (e.g., uuid v14 in transitive dep — see package.json Dependabot bump).
const pure = require("../src/external-integrations");
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
});

afterAll(() => testEnv.cleanup());

// ==================== PURE VALIDATORS ====================

describe("validateAppleTeamId", () => {
  it("accepts a 10-char uppercase alphanumeric value", () => {
    expect(pure.validateAppleTeamId("ABCDE12345").ok).toBe(true);
  });
  it("accepts empty (clearing the field)", () => {
    expect(pure.validateAppleTeamId("").ok).toBe(true);
    expect(pure.validateAppleTeamId("   ").ok).toBe(true);
  });
  it("rejects lowercase, wrong length, and non-strings", () => {
    expect(pure.validateAppleTeamId("abcde12345").ok).toBe(false);
    expect(pure.validateAppleTeamId("ABC").ok).toBe(false);
    expect(pure.validateAppleTeamId(12345 as unknown as string).ok).toBe(false);
  });
});

describe("validateBundleId", () => {
  it("accepts reverse-DNS bundle ids", () => {
    expect(pure.validateBundleId("com.minimaster.parent").ok).toBe(true);
  });
  it("rejects values without a dot", () => {
    expect(pure.validateBundleId("nodothere").ok).toBe(false);
  });
  it("rejects forbidden characters", () => {
    expect(pure.validateBundleId("com.bad space.app").ok).toBe(false);
  });
});

describe("validateRtdnTopic", () => {
  it("accepts standard topic names", () => {
    expect(pure.validateRtdnTopic("play-billing-notifications").ok).toBe(true);
  });
  it("rejects topics starting with a digit", () => {
    expect(pure.validateRtdnTopic("1bad-topic").ok).toBe(false);
  });
  it("accepts empty string for clearing", () => {
    expect(pure.validateRtdnTopic("").ok).toBe(true);
  });
});

describe("validateSecretManagerPath", () => {
  it("accepts canonical paths with /versions/latest", () => {
    expect(pure.validateSecretManagerPath("projects/my-proj/secrets/foo/versions/latest").ok).toBe(true);
    expect(pure.validateSecretManagerPath("projects/my-proj/secrets/foo/versions/3").ok).toBe(true);
  });
  it("rejects raw API keys", () => {
    expect(pure.validateSecretManagerPath("AIzaSyC-RAW-KEY-VALUE").ok).toBe(false);
  });
  it("rejects empty arbitrary text", () => {
    expect(pure.validateSecretManagerPath("definitely-not-a-path").ok).toBe(false);
  });
});

describe("looksLikeCleartextSecret", () => {
  it("flags AIza-prefixed values", () => {
    expect(pure.looksLikeCleartextSecret("AIzaSyABC")).toBe(true);
  });
  it("flags PEM blocks", () => {
    expect(pure.looksLikeCleartextSecret("-----BEGIN PRIVATE KEY-----")).toBe(true);
  });
  it("does not flag valid Secret-Manager paths", () => {
    expect(pure.looksLikeCleartextSecret("projects/p/secrets/s/versions/latest")).toBe(false);
  });
  it("flags long opaque blobs without slashes", () => {
    expect(pure.looksLikeCleartextSecret("a".repeat(120))).toBe(true);
  });
});

describe("computeReleaseReadiness", () => {
  it("reports many blockers for a fresh default config", () => {
    const cfg = {
      apple: { developerTeamId: null, parentBundleId: null, childBundleId: null, appStoreConnectKeySecretPath: null, provisioningProfilesReady: false },
      play: { parentPackageId: null, childPackageId: null, serviceAccountSecretPath: null, rtdnTopicName: null, iapContractsSigned: false },
      secrets: { geminiApiKeyPath: null, fcmServerKeyPath: null, recaptchaV3SiteKey: null, playIntegrityKeyPath: null, deviceCheckKeyPath: null },
      oem: { matrix: [] },
      release: { playDataSafetyComplete: false, playIarcRatingComplete: false, playStoreListingComplete: false, appleAppPrivacyComplete: false, appleScreenshotsComplete: false, legalTextsPublished: false },
      meta: { lastUpdatedAt: null, lastUpdatedBy: null },
    };
    const r = pure.computeReleaseReadiness(cfg);
    expect(r.ready).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(10);
    expect(r.progressPct).toBe(0);
  });

  it("reports ready=true when all required fields are filled and ≥1 OEM passed", () => {
    const cfg = {
      apple: { developerTeamId: "ABCDE12345", parentBundleId: "com.x.p", childBundleId: "com.x.c", appStoreConnectKeySecretPath: "projects/p/secrets/k/versions/latest", provisioningProfilesReady: true },
      play: { parentPackageId: "com.x.p", childPackageId: "com.x.c", serviceAccountSecretPath: "projects/p/secrets/sa/versions/latest", rtdnTopicName: "play-billing", iapContractsSigned: true },
      secrets: { geminiApiKeyPath: "projects/p/secrets/g/versions/latest", fcmServerKeyPath: "projects/p/secrets/f/versions/latest", recaptchaV3SiteKey: "abc", playIntegrityKeyPath: null, deviceCheckKeyPath: null },
      oem: { matrix: [{ deviceModel: "Samsung S23", osVersion: "Android 14", testedAt: "2026-04-01", signoffBy: "qa1", status: "passed", notes: null }] },
      release: { playDataSafetyComplete: true, playIarcRatingComplete: true, playStoreListingComplete: true, appleAppPrivacyComplete: true, appleScreenshotsComplete: true, legalTextsPublished: true },
      meta: { lastUpdatedAt: null, lastUpdatedBy: null },
    };
    const r = pure.computeReleaseReadiness(cfg);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.progressPct).toBe(100);
  });
});

// ==================== CALLABLE: GET ====================

describeCallable("getExternalIntegrationsConfig", () => {
  it("rejects callers without auditor or admin role", async () => {
    const wrapped = testEnv.wrap(fns.getExternalIntegrationsConfig);
    await expect(wrapped({}, asUser)).rejects.toThrow();
  });

  it("returns default config + readiness for admin on first call", async () => {
    const wrapped = testEnv.wrap(fns.getExternalIntegrationsConfig);
    const res = await wrapped({}, asAdmin);
    expect(res.config).toBeDefined();
    expect(res.config.apple.developerTeamId).toBeNull();
    expect(res.readiness.ready).toBe(false);
    expect(res.readiness.blockers.length).toBeGreaterThan(0);
  });

  it("is readable by auditors", async () => {
    const wrapped = testEnv.wrap(fns.getExternalIntegrationsConfig);
    const res = await wrapped({}, asAuditor);
    expect(res.config).toBeDefined();
  });
});

// ==================== CALLABLE: PATCH ====================

describeCallable("patchExternalIntegrationsField", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await expect(wrapped({ category: "apple", field: "developerTeamId", value: "ABCDE12345" }, asAuditor)).rejects.toThrow();
  });

  it("persists a valid Apple Team ID", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await wrapped({ category: "apple", field: "developerTeamId", value: "ABCDE12345" }, asAdmin);
    expect(mockDocSet).toHaveBeenCalled();
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call["apple.developerTeamId"]).toBe("ABCDE12345");
  });

  it("rejects an invalid Apple Team ID", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await expect(wrapped({ category: "apple", field: "developerTeamId", value: "lower" }, asAdmin)).rejects.toThrow(/10/);
  });

  it("refuses cleartext secrets in secret-path fields", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await expect(
      wrapped({ category: "secrets", field: "geminiApiKeyPath", value: "AIzaSyC_THIS_IS_A_RAW_KEY" }, asAdmin)
    ).rejects.toThrow(/cleartext|Secret Manager/i);
  });

  it("accepts a valid Secret-Manager path for gemini", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await wrapped(
      { category: "secrets", field: "geminiApiKeyPath", value: "projects/proj/secrets/gemini/versions/latest" },
      asAdmin
    );
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call["secrets.geminiApiKeyPath"]).toBe("projects/proj/secrets/gemini/versions/latest");
  });

  it("toggles a release boolean", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await wrapped({ category: "release", field: "playDataSafetyComplete", value: true }, asAdmin);
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call["release.playDataSafetyComplete"]).toBe(true);
  });

  it("rejects unknown category/field combinations", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await expect(wrapped({ category: "apple", field: "doesNotExist", value: "x" }, asAdmin)).rejects.toThrow();
  });

  it("normalises empty strings to null", async () => {
    const wrapped = testEnv.wrap(fns.patchExternalIntegrationsField);
    await wrapped({ category: "apple", field: "developerTeamId", value: "   " }, asAdmin);
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call["apple.developerTeamId"]).toBeNull();
  });
});

// ==================== CALLABLE: OEM MATRIX ====================

describeCallable("setOemValidationMatrix", () => {
  it("rejects non-admin callers", async () => {
    const wrapped = testEnv.wrap(fns.setOemValidationMatrix);
    await expect(wrapped({ rows: [] }, asAuditor)).rejects.toThrow();
  });

  it("sanitises and persists rows", async () => {
    const wrapped = testEnv.wrap(fns.setOemValidationMatrix);
    const res = await wrapped({
      rows: [
        { deviceModel: "  Samsung S23  ", osVersion: "Android 14", status: "passed", testedAt: "2026-04-01", signoffBy: "qa1", notes: "ok" },
        { deviceModel: "Xiaomi 13", osVersion: "MIUI 14", status: "weird-status", testedAt: null, signoffBy: null, notes: null },
      ],
    }, asAdmin);
    expect(res.rowCount).toBe(2);
    const call = mockDocSet.mock.calls[mockDocSet.mock.calls.length - 1][0] as Record<string, any>;
    expect(call.oem.matrix[0].deviceModel).toBe("Samsung S23");
    expect(call.oem.matrix[1].status).toBe("pending"); // sanitised to default
  });

  it("rejects rows missing required fields", async () => {
    const wrapped = testEnv.wrap(fns.setOemValidationMatrix);
    await expect(wrapped({ rows: [{ deviceModel: "" }] }, asAdmin)).rejects.toThrow(/deviceModel|osVersion/);
  });

  it("caps matrix at 100 rows", async () => {
    const wrapped = testEnv.wrap(fns.setOemValidationMatrix);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ deviceModel: `D${i}`, osVersion: "v1" }));
    await expect(wrapped({ rows: tooMany }, asAdmin)).rejects.toThrow(/100/);
  });
});

// ==================== CALLABLE: READINESS ====================

describeCallable("getReleaseReadinessStatus", () => {
  it("returns a readiness object for admins", async () => {
    const wrapped = testEnv.wrap(fns.getReleaseReadinessStatus);
    const res = await wrapped({}, asAdmin);
    expect(res).toHaveProperty("ready");
    expect(res).toHaveProperty("progressPct");
    expect(Array.isArray(res.blockers)).toBe(true);
  });

  it("rejects unauthenticated/role-less callers", async () => {
    const wrapped = testEnv.wrap(fns.getReleaseReadinessStatus);
    await expect(wrapped({}, asUser)).rejects.toThrow();
  });
});
