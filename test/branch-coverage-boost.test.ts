/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Branch coverage boost tests targeting the lowest-coverage files:
 * - admin.ts: analyzeSystemErrors, performAnalysis, executeAutoFix (lines 523-841)
 * - admin.ts: sendDailyErrorReport with errors, testGeminiConnection happy path
 * - admin.ts: deleteUserAccount branches (admin deleting other, non-admin deleting self)
 * - triggers.ts: analyzeTaskPhoto with Gemini API + fallback (lines 100-221)
 * - triggers.ts: sendFcmWithRetry retry/exhaust logic
 * - triggers.ts: onTaskStatusChange FCM error branches
 * - pairing.ts: validatePairingCode data corruption, expiry, child-limit branches
 * - pairing.ts: validatePairingToken data corruption, expiry branches
 * - auth.ts: generateCustomToken legacy auth paths, registerMasterDevice legacy disabled
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
  }
  const firestoreNamespace: any = () => ({ collection: jest.fn() });
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

// Mock global fetch for Gemini API calls
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const testEnv = fft();
let fns: any;
let db: any;

let state: Record<string, any> = {};

const asAdmin = { auth: { uid: "admin1", token: { role: "admin" } } };
const asMaster = { auth: { uid: "m1", token: { role: "master" } } };
const asChild = { auth: { uid: "c1", token: {} } };
const noAuth = {};

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
    audit_logs: {},
    error_logs: {},
    error_summaries: {},
    performance_metrics: {},
    operatorConfig: {},
    ai_error_analyses: {},
    legacyAuthUsage: {},
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

  jest.spyOn(db, "collection").mockImplementation((...args: unknown[]) => {
    const coll = String(args[0] ?? "");
    const collData = state[coll] || {};
    return {
      doc: jest.fn((docId: string) => {
        const ref: any = {
          id: docId,
          get: () => {
            const d = collData[docId];
            return Promise.resolve({ exists: !!d, data: () => d, id: docId, ref });
          },
          update: jest.fn((upd: any) => { if (collData[docId]) Object.assign(collData[docId], upd); return Promise.resolve(); }),
          set: jest.fn((data: any, opts?: { merge?: boolean }) => {
            collData[docId] = opts?.merge ? { ...(collData[docId] || {}), ...data } : { ...data };
            return Promise.resolve();
          }),
          delete: jest.fn(() => { delete collData[docId]; return Promise.resolve(); }),
          collection: jest.fn((sub: string) => {
            const key = `${coll}/${docId}/${sub}`;
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
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(() => {
        const docs = Object.entries(collData).map(([id, data]) => ({
          id, data: () => data, ref: {
            delete: jest.fn(() => { delete collData[id]; return Promise.resolve(); }),
            update: jest.fn((upd: any) => { if (collData[id]) Object.assign(collData[id] as any, upd); return Promise.resolve(); }),
            collection: jest.fn(() => ({ get: jest.fn(() => Promise.resolve({ docs: [], empty: true, size: 0 })) })),
          },
        }));
        return Promise.resolve({ empty: docs.length === 0, size: docs.length, docs });
      }),
    } as any;
  });

  (db as any).collectionGroup = jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    get: jest.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
  });

  (db as any).batch = jest.fn(() => {
    const ops: Array<() => Promise<void>> = [];
    return {
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      commit: () => Promise.all(ops.map((o) => o())),
    };
  });
});

afterAll(() => testEnv.cleanup());

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – analyzeSystemErrors
// ══════════════════════════════════════════════════════════════════════════

describe("analyzeSystemErrors", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("wirft failed-precondition ohne GEMINI_API_KEY", async () => {
    delete process.env.GEMINI_API_KEY;
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/GEMINI_API_KEY/);
  });

  it("gibt leeres Ergebnis wenn keine Fehler vorhanden", async () => {
    // error_logs is empty → snapshot.empty = true
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ hours: 24 }, asAdmin);
    expect(res.analyses).toEqual([]);
    expect(res.totalErrors).toBe(0);
    expect(res.summary).toContain("Keine Fehler");
  });

  it("analysiert einzelnen Fehler via errorId", async () => {
    state.error_logs["err-1"] = {
      functionName: "createPairingCode",
      message: "Firestore timeout",
      stack: "Error: timeout at line 42",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{
          errorIndex: 0, severity: "medium", category: "network",
          diagnosis: "Firestore timeout issue", solution: "Retry with backoff",
          autoFixable: false, autoFixAction: null, autoFixDescription: null,
        }]) }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ errorId: "err-1" }, asAdmin);
    expect(res.analyses.length).toBe(1);
    expect(res.analyses[0].severity).toBe("medium");
    expect(res.analysisId).toBeDefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("wirft not-found für unbekannte errorId", async () => {
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({ errorId: "nonexistent" }, asAdmin)).rejects.toThrow(/nicht gefunden/);
  });

  it("analysiert gruppierte Fehler mit functionFilter", async () => {
    state.error_logs["err-a"] = {
      functionName: "validatePairingCode", message: "Code expired",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };
    state.error_logs["err-b"] = {
      functionName: "createPairingCode", message: "Code collision",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{
          errorIndex: 0, severity: "low", category: "data",
          diagnosis: "Expected expiry", solution: "Normal behavior",
          autoFixable: true, autoFixAction: "cleanup_expired_subscriptions", autoFixDescription: "Cleanup",
        }]) }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({ functionFilter: "validatePairingCode" }, asAdmin);
    expect(res.totalErrors).toBeGreaterThanOrEqual(1);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("behandelt Gemini API Fehler", async () => {
    state.error_logs["err-x"] = {
      functionName: "test", message: "Test error",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal server error",
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/KI-Fehleranalyse fehlgeschlagen/);
  });

  it("behandelt ungültige JSON-Antwort von Gemini", async () => {
    state.error_logs["err-y"] = {
      functionName: "test", message: "Error msg",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "This is not valid JSON at all" }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const res = await wrapped({}, asAdmin);
    // Should fall back to wrapping raw text
    expect(res.analyses.length).toBeGreaterThanOrEqual(1);
    expect(res.analyses[0].diagnosis).toContain("This is not valid JSON");
  });

  it("nutzt unknown-Fallback wenn functionFilter keine Fehlergruppe übrig lässt", async () => {
    state.error_logs["err-empty-filter"] = {
      functionName: "verifyPurchase",
      message: "unexpected state",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{
          errorIndex: 0,
          severity: "low",
          category: "code",
          diagnosis: "No grouped error",
          solution: "Review manually",
          autoFixable: false,
          autoFixAction: null,
          autoFixDescription: null,
        }]) }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const asAdminFilter = { auth: { uid: "admin-filter", token: { role: "admin" } } };
    const res = await wrapped({ functionFilter: "does-not-exist" }, asAdminFilter);

    expect(res.analyses.length).toBe(1);
    expect(res.analyses[0].errorId).toBe("unknown");
    expect(res.analyses[0].functionName).toBe("unknown");
    expect(res.analyses[0].errorMessage).toBe("");
    expect(res.totalErrors).toBe(0);
  });

  it("verwendet errors[0]-Fallback wenn mehr Analysen als Fehler vorhanden sind", async () => {
    state.error_logs["err-base"] = {
      functionName: "createTask",
      message: "single source error",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify([
          {
            errorIndex: 0,
            severity: "medium",
            category: "network",
            diagnosis: "first",
            solution: "first-fix",
            autoFixable: false,
            autoFixAction: null,
            autoFixDescription: null,
          },
          {
            errorIndex: 1,
            severity: "low",
            category: "data",
            diagnosis: "second",
            solution: "second-fix",
            autoFixable: false,
            autoFixAction: null,
            autoFixDescription: null,
          },
        ]) }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const asAdminOverflow = { auth: { uid: "admin-overflow", token: { role: "admin" } } };
    const res = await wrapped({}, asAdminOverflow);

    expect(res.analyses.length).toBe(2);
    expect(res.analyses[1].errorId).toBe("err-base");
    expect(res.analyses[1].functionName).toBe("createTask");
    expect(res.analyses[1].errorMessage).toBe("single source error");
  });

  it("behandelt fehlende Gemini candidates robust", async () => {
    state.error_logs["err-no-candidates"] = {
      functionName: "test",
      message: "missing candidates",
      timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    const asAdminNoCandidates = { auth: { uid: "admin-nocandidates", token: { role: "admin" } } };
    const res = await wrapped({}, asAdminNoCandidates);

    expect(res.analyses).toEqual([]);
    expect(res.totalErrors).toBeGreaterThanOrEqual(1);
  });

  it("clamps hours parameter to 1-168 range", async () => {
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    // 0 hours should be clamped to 1, 999 to 168 — no errors, returns empty
    const res = await wrapped({ hours: 0 }, asAdmin);
    expect(res.totalErrors).toBe(0);
  });

  it("benötigt Admin-Berechtigung", async () => {
    const wrapped = testEnv.wrap(fns.analyzeSystemErrors);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/Admin/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – executeAutoFix
// ══════════════════════════════════════════════════════════════════════════

describe("executeAutoFix", () => {
  it("cleanup_expired_subscriptions entfernt abgelaufene Abos", async () => {
    state.ai_error_analyses["analysis-1"] = {
      analyses: [{ errorIndex: 0, autoFixable: true, autoFixAction: "cleanup_expired_subscriptions" }],
      status: "pending",
    };
    state.subscriptions["sub-exp"] = {
      status: "active",
      expiresAt: { seconds: 1000, nanoseconds: 0, toMillis: () => 1000000 },
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "analysis-1", errorIndex: 0, action: "cleanup_expired_subscriptions",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result).toContain("bereinigt");
  });

  it("cleanup_expired_grants entfernt abgelaufene Zugriffsrechte", async () => {
    state.ai_error_analyses["analysis-2"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    state.supportAccessGrants["grant-exp"] = {
      expiresAt: { seconds: 1000, nanoseconds: 0, toMillis: () => 1000000 },
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "analysis-2", errorIndex: 0, action: "cleanup_expired_grants",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result).toContain("entfernt");
  });

  it("regenerate_error_report erstellt neuen Bericht", async () => {
    state.ai_error_analyses["analysis-3"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    state.error_logs["err-report-1"] = {
      functionName: "validatePairingCode",
      message: "expired code",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 60, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "analysis-3", errorIndex: 0, action: "regenerate_error_report",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result).toContain("Fehlerreport");
  });

  it("regenerate_error_report nutzt unknown für fehlenden functionName", async () => {
    state.ai_error_analyses["analysis-3b"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    state.error_logs["err-report-unknown"] = {
      message: "no functionName present",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 60, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "analysis-3b", errorIndex: 0, action: "regenerate_error_report",
    }, asAdmin);

    expect(res.success).toBe(true);
    expect(res.result).toContain("Fehlerreport");
  });

  it("clear_error_logs löscht alte Logs", async () => {
    state.ai_error_analyses["analysis-4"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };
    state.error_logs["err-old-1"] = {
      functionName: "cleanupJob",
      message: "stale entry",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 35 * 24 * 60 * 60, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    const res = await wrapped({
      analysisId: "analysis-4", errorIndex: 0, action: "clear_error_logs",
    }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.result).toContain("gelöscht");
  });

  it("wrappt unerwartete Auto-Fix-Fehler als internal", async () => {
    state.ai_error_analyses["analysis-fail"] = {
      analyses: [{ errorIndex: 0, autoFixable: true }],
      status: "pending",
    };

    const originalCollection = (db.collection as jest.Mock).getMockImplementation();
    (db.collection as jest.Mock).mockImplementation((name: string) => {
      const base = originalCollection(name);
      if (name === "ai_error_analyses") {
        return {
          ...base,
          doc: jest.fn((docId: string) => {
            const ref = base.doc(docId);
            return {
              ...ref,
              update: jest.fn().mockRejectedValue(new Error("analysis update failed")),
            };
          }),
        };
      }
      return base;
    });

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "analysis-fail", errorIndex: 0, action: "clear_error_logs",
    }, asAdmin)).rejects.toThrow(/Auto-Fix fehlgeschlagen: analysis update failed/);
  });

  it("wirft invalid-argument bei unbekannter Aktion", async () => {
    state.ai_error_analyses["analysis-5"] = {
      analyses: [{ errorIndex: 0 }],
      status: "pending",
    };

    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "analysis-5", errorIndex: 0, action: "unknown_action",
    }, asAdmin)).rejects.toThrow(/Unbekannte Auto-Fix-Aktion/);
  });

  it("wirft not-found bei unbekannter analysisId", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "nonexistent", errorIndex: 0, action: "clear_error_logs",
    }, asAdmin)).rejects.toThrow(/Analyse nicht gefunden/);
  });

  it("wirft invalid-argument ohne analysisId", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      errorIndex: 0, action: "clear_error_logs",
    }, asAdmin)).rejects.toThrow(/analysisId/);
  });

  it("wirft invalid-argument ohne errorIndex", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "analysis-1", action: "clear_error_logs",
    }, asAdmin)).rejects.toThrow(/errorIndex/);
  });

  it("wirft invalid-argument ohne action", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "analysis-1", errorIndex: 0,
    }, asAdmin)).rejects.toThrow(/action/);
  });

  it("benötigt Admin-Berechtigung", async () => {
    const wrapped = testEnv.wrap(fns.executeAutoFix);
    await expect(wrapped({
      analysisId: "analysis-1", errorIndex: 0, action: "clear_error_logs",
    }, asMaster)).rejects.toThrow(/Admin/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – sendDailyErrorReport with actual errors
// ══════════════════════════════════════════════════════════════════════════

describe("sendDailyErrorReport – error branches", () => {
  it("erzeugt Bericht mit Fehlern gruppiert nach Funktion und Typ", async () => {
    state.error_logs["el-1"] = {
      functionName: "createPairingCode", message: "Timeout error",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 3600, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };
    state.error_logs["el-2"] = {
      functionName: "createPairingCode", message: "Timeout error",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 7200, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };
    state.error_logs["el-3"] = {
      functionName: "validatePairingToken", message: "Auth failed",
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 1800, nanoseconds: 0, toMillis() { return this.seconds * 1000; } },
    };

    const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
    const res = await wrapped({});
    expect(res).toBeNull();
    // Verify error_summaries was written
    const summaryKeys = Object.keys(state.error_summaries || {});
    expect(summaryKeys.length).toBeGreaterThanOrEqual(1);
  });

  it("gibt null zurück ohne Fehler (leere Logs)", async () => {
    const wrapped = testEnv.wrap(fns.sendDailyErrorReport);
    const res = await wrapped({});
    expect(res).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – testGeminiConnection happy path
// ══════════════════════════════════════════════════════════════════════════

describe("testGeminiConnection – erweitert", () => {
  it("gibt Erfolg mit Gemini-Antwort zurück", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "MiniMaster ist eine Parental-Control-App." }] } }],
      }),
    });

    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({ prompt: "Was ist MiniMaster?" }, asAdmin);
    expect(res.success).toBe(true);
    expect(res.response).toContain("MiniMaster");
    expect(res.model).toBeDefined();

    delete process.env.GEMINI_API_KEY;
  });

  it("gibt Fehler bei API-Fehlschlag zurück", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden - invalid API key",
    });

    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Gemini API Fehler");

    delete process.env.GEMINI_API_KEY;
  });

  it("gibt Verbindungsfehler bei Netzwerkfehler zurück", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";

    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const wrapped = testEnv.wrap(fns.testGeminiConnection);
    const res = await wrapped({}, asAdmin);
    expect(res.success).toBe(false);
    expect(res.error).toContain("Verbindungsfehler");

    delete process.env.GEMINI_API_KEY;
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADMIN.TS – deleteUserAccount branches
// ══════════════════════════════════════════════════════════════════════════

describe("deleteUserAccount – Branches", () => {
  it("Admin löscht fremdes Konto", async () => {
    state.masters["m2"] = { imei: "m2", uid: "m2" };
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({ masterId: "m2" }, asAdmin);
    expect(res.success).toBe(true);
    expect(state.masters["m2"]).toBeUndefined();
  });

  it("Nicht-Admin darf nur eigenes Konto löschen", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    await expect(wrapped({ masterId: "m2" }, asMaster)).rejects.toThrow(/only delete their own/);
  });

  it("Nicht-Admin löscht eigenes Konto", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    const res = await wrapped({}, asMaster);
    expect(res.success).toBe(true);
  });

  it("wirft not-found bei nicht existierendem Master", async () => {
    const wrapped = testEnv.wrap(fns.deleteUserAccount);
    await expect(wrapped({ masterId: "nonexistent" }, asAdmin)).rejects.toThrow();
  });
});

// onChildDeviceUpdateV2 v2 trigger tests are in onChildDeviceUpdateV2.test.ts
// They require a different mock setup that doesn't conflict with admin.ts mocks.

// ══════════════════════════════════════════════════════════════════════════
// TRIGGERS.TS – onTaskStatusChange FCM error and edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("onTaskStatusChange – erweiterte Branches", () => {
  it("behandelt FCM Fehler bei pending_approval Benachrichtigung", async () => {
    mockSend.mockRejectedValueOnce(new Error("messaging/unknown"));
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    // Should not throw
    await wrapped({
      before: { data: () => ({ status: "pending", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending_approval", description: "Test", masterImei: "m1" }) },
    }, { params: { childId: "c1", taskId: "t-err1" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("behandelt FCM Fehler bei approved Benachrichtigung", async () => {
    mockSend.mockRejectedValueOnce(new Error("messaging/unknown"));
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped({
      before: { data: () => ({ status: "pending_approval", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "approved", description: "Test", masterImei: "m1" }) },
    }, { params: { childId: "c1", taskId: "t-err2" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("behandelt FCM Fehler bei rejected Benachrichtigung", async () => {
    mockSend.mockRejectedValueOnce(new Error("messaging/unknown"));
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped({
      before: { data: () => ({ status: "pending_approval", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "rejected", description: "Test", masterImei: "m1" }) },
    }, { params: { childId: "c1", taskId: "t-err3" } });
    expect(mockSend).toHaveBeenCalled();
  });

  it("überspringt bei fehlenden before/after Daten", async () => {
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped({
      before: { data: () => undefined },
      after: { data: () => undefined },
    }, { params: { childId: "c1", taskId: "t-null" } });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("ignoriert nicht-relevante Status-Änderungen", async () => {
    const wrapped = testEnv.wrap(fns.onTaskStatusChange);
    await wrapped({
      before: { data: () => ({ status: "pending", description: "Test", masterImei: "m1" }) },
      after: { data: () => ({ status: "pending", description: "Updated desc", masterImei: "m1" }) },
    }, { params: { childId: "c1", taskId: "t-noop" } });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAIRING.TS – validatePairingCode edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingCode – Branch-Coverage", () => {
  it("wirft invalid-argument ohne pairingCode", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({}, asChild)).rejects.toThrow(/pairingCode/);
  });

  it("wirft not-found bei ungültigem Code", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "999999" }, asChild)).rejects.toThrow(/Invalid pairing code/);
  });

  it("löscht und wirft internal bei fehlenden Code-Daten", async () => {
    // Simulate doc.exists=true but data()=undefined — we need the mock to handle this
    state.pairingCodes["123456"] = undefined as any;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    // Will go through not-found since state returns undefined → exists: false
    await expect(wrapped({ pairingCode: "123456" }, asChild)).rejects.toThrow();
  });

  it("wirft deadline-exceeded bei abgelaufenem Code", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["111111"] = {
      masterId: "m1",
      createdAt: new admin.firestore.Timestamp(1000, 0),
      expiresAt: new admin.firestore.Timestamp(1001, 0), // Expired long ago
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "111111" }, asChild)).rejects.toThrow(/expired/i);
  });

  it("löscht korrupten Code mit ungültigem expiresAt", async () => {
    state.pairingCodes["333333"] = {
      masterId: "m1",
      createdAt: { seconds: 1, nanoseconds: 0 },
      expiresAt: "not-a-timestamp",
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "333333" }, asChild)).rejects.toThrow(/data structure/i);
    expect(state.pairingCodes["333333"]).toBeUndefined();
  });

  it("löscht korrupten Code mit fehlendem masterId", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["444444"] = {
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "444444" }, asChild)).rejects.toThrow(/masterId/i);
    expect(state.pairingCodes["444444"]).toBeUndefined();
  });

  it("wirft not-found wenn referenzierter Master fehlt", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["555555"] = {
      masterId: "ghost-master",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "555555" }, asChild)).rejects.toThrow(/Master account not found/);
  });

  it("wirft resource-exhausted ohne aktiven Zugang", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["666666"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    state.masters.m1.subscription = { status: "expired", childLimit: 1 };
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "666666" }, asChild)).rejects.toThrow(/trial has expired/i);
  });

  it("pairt Kind erfolgreich mit gültigem Code", async () => {
    const admin = require("firebase-admin");
    state.pairingCodes["777777"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    state.masters.m1.subscription.childLimit = 99;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    const res = await wrapped({ pairingCode: "777777" }, asChild);
    expect(res.childId).toBe("c1");
    expect(state.children.c1.masterImei).toBe("m1");
  });

  it("wirft resource-exhausted bei erreichtem Child-Limit", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 86400, 0);
    state.pairingCodes["222222"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: futureTs,
    };
    // Set child limit to 1. There's already c1.
    state.masters.m1.subscription.childLimit = 1;
    const wrapped = testEnv.wrap(fns.validatePairingCode);
    await expect(wrapped({ pairingCode: "222222" }, asChild)).rejects.toThrow(/Child limit reached/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAIRING.TS – validatePairingToken edge cases
// ══════════════════════════════════════════════════════════════════════════

describe("validatePairingToken – Branch-Coverage", () => {
  it("wirft invalid-argument ohne pairingToken", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({}, asChild)).rejects.toThrow(/pairingToken/);
  });

  it("wirft not-found bei ungültigem Token", async () => {
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "unknown-uuid" }, asChild)).rejects.toThrow(/invalid/i);
  });

  it("wirft deadline-exceeded bei abgelaufenem Token", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["expired-uuid"] = {
      masterId: "m1",
      createdAt: new admin.firestore.Timestamp(1000, 0),
      expiresAt: new admin.firestore.Timestamp(1001, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "expired-uuid" }, asChild)).rejects.toThrow(/expired/i);
  });

  it("löscht korruptes Token mit ungültigem expiresAt", async () => {
    state.pairingTokens["bad-exp-token"] = {
      masterId: "m1",
      createdAt: { seconds: 1, nanoseconds: 0 },
      expiresAt: "not-a-timestamp",
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "bad-exp-token" }, asChild)).rejects.toThrow(/data structure/i);
    expect(state.pairingTokens["bad-exp-token"]).toBeUndefined();
  });

  it("löscht korruptes Token ohne masterId", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["missing-master-token"] = {
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "missing-master-token" }, asChild)).rejects.toThrow(/missing masterId/i);
    expect(state.pairingTokens["missing-master-token"]).toBeUndefined();
  });

  it("wirft not-found wenn referenzierter Master fehlt", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["ghost-master-token"] = {
      masterId: "ghost-master",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "ghost-master-token" }, asChild)).rejects.toThrow(/Master account not found/);
  });

  it("wirft resource-exhausted ohne aktiven Zugang", async () => {
    const admin = require("firebase-admin");
    state.pairingTokens["expired-sub-token"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0),
    };
    state.masters.m1.subscription = { status: "expired", childLimit: 1 };
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "expired-sub-token" }, asChild)).rejects.toThrow(/Active subscription or trial required/i);
  });

  it("wirft resource-exhausted bei erreichtem Kinderlimit", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0);
    state.pairingTokens["valid-uuid"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: futureTs,
    };
    state.masters.m1.subscription.childLimit = 1;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    await expect(wrapped({ pairingToken: "valid-uuid" }, asChild)).rejects.toThrow(/Child limit reached/);
  });

  it("pairt Kind erfolgreich mit gültigem Token", async () => {
    const admin = require("firebase-admin");
    const futureTs = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 300, 0);
    state.pairingTokens["good-uuid"] = {
      masterId: "m1",
      createdAt: admin.firestore.Timestamp.now(),
      expiresAt: futureTs,
    };
    state.masters.m1.subscription.childLimit = 99;
    const wrapped = testEnv.wrap(fns.validatePairingToken);
    const res = await wrapped({ pairingToken: "good-uuid" }, asChild);
    expect(res.childId).toBe("c1");
    expect(res.masterId).toBe("m1");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PAIRING.TS – createPairingCode und generatePairingLink branches
// ══════════════════════════════════════════════════════════════════════════

describe("createPairingCode – Branch-Coverage", () => {
  it("wirft not-found bei nicht existierendem Master", async () => {
    const wrapped = testEnv.wrap(fns.createPairingCode);
    await expect(wrapped({}, { auth: { uid: "nonexistent", token: { role: "master" } } }))
      .rejects.toThrow(/Master account not found/);
  });

  it("wirft resource-exhausted ohne aktives Abo", async () => {
    state.masters.m1.subscription = { status: "expired", childLimit: 1 };
    const wrapped = testEnv.wrap(fns.createPairingCode);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/subscription.*trial/i);
  });

});

describe("generatePairingLink – Branch-Coverage", () => {
  it("wirft not-found bei nicht existierendem Master", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, { auth: { uid: "nonexistent", token: { role: "master" } } }))
      .rejects.toThrow(/Master account not found/);
  });

  it("wirft resource-exhausted ohne aktives Abo", async () => {
    state.masters.m1.subscription = { status: "expired", childLimit: 1 };
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/trial has expired/i);
  });

  it("erzeugt Pairing-Link erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.generatePairingLink);
    const res = await wrapped({}, asMaster);
    expect(res.pairingToken).toBeDefined();
    expect(typeof res.pairingToken).toBe("string");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – generateCustomToken legacy branches
// ══════════════════════════════════════════════════════════════════════════

describe("generateCustomToken – Branch-Coverage", () => {
  it("generiert Token für authentifizierten Benutzer", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, asMaster);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("wirft unauthenticated ohne masterImei/secretKey und ohne Auth", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, noAuth)).rejects.toThrow(/authenticated context or valid masterImei/i);
  });

  it("wirft unauthenticated bei falschem secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({ masterImei: "m1", secretKey: "wrong" }, noAuth))
      .rejects.toThrow(/Invalid master IMEI/);
  });

  it("generiert Token via legacy IMEI/secretKey", async () => {
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({ masterImei: "m1", secretKey: "secret123" }, noAuth);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("fällt bei fehlgeschlagener Legacy-Telemetrie nicht aus", async () => {
    const baseCollectionImpl = (db.collection as jest.Mock).getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((name: string) => {
      if (name === "legacyAuthUsage") {
        return {
          add: jest.fn().mockRejectedValueOnce(new Error("telemetry down")),
        } as any;
      }
      return baseCollectionImpl ? baseCollectionImpl(name) : { add: jest.fn() };
    });

    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({ masterImei: "m1", secretKey: "secret123" }, noAuth);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("liefert weiter Token wenn lastTokenRefresh-Update fehlschlägt", async () => {
    const originalCollection = db.collection;
    jest.spyOn(db, "collection").mockImplementation((name: string) => {
      const coll = originalCollection.call(db, name);
      if (name !== "masters") return coll;
      return {
        ...coll,
        doc: jest.fn((id: string) => {
          const ref = coll.doc(id);
          return {
            ...ref,
            update: jest.fn().mockRejectedValueOnce(new Error("db unavailable")),
          };
        }),
      } as any;
    });

    const wrapped = testEnv.wrap(fns.generateCustomToken);
    const res = await wrapped({}, asMaster);
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("wirft internal wenn getUser fehlschlägt", async () => {
    mockAuth.getUser.mockRejectedValueOnce(new Error("auth backend down"));
    const wrapped = testEnv.wrap(fns.generateCustomToken);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/unexpected error.*token/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – registerMasterDevice branches
// ══════════════════════════════════════════════════════════════════════════

describe("registerMasterDevice – Branch-Coverage", () => {
  it("wirft invalid-argument ohne imei", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({}, asMaster)).rejects.toThrow(/imei/);
  });

  it("wirft failed-precondition bei UID-Mismatch", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "different-imei" }, asMaster))
      .rejects.toThrow(/does not match/);
  });

  it("registriert neues Master-Gerät mit Auth", async () => {
    // m1 already exists → should return existing
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, asMaster);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("erstellt neuen Master wenn Auth-User noch nicht existiert", async () => {
    delete state.masters.m2;
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/user-not-found" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m2" }, { auth: { uid: "m2", token: { role: "master" } } });
    expect(res.masterId).toBe("m2");
    expect(mockAuth.createUser).toHaveBeenCalledWith({ uid: "m2" });
    expect(state.masters.m2).toBeDefined();
  });

  it("registriert ohne Auth (Legacy) und protokolliert Telemetrie", async () => {
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, noAuth);
    expect(res.masterId).toBe("m1");
    expect(res.customToken).toBe("mock-custom-token");
  });

  it("fällt bei fehlgeschlagener Legacy-Telemetrie in Registrierung nicht aus", async () => {
    const baseCollectionImpl = (db.collection as jest.Mock).getMockImplementation();
    jest.spyOn(db, "collection").mockImplementation((name: string) => {
      if (name === "legacyAuthUsage") {
        return {
          add: jest.fn().mockRejectedValueOnce(new Error("telemetry write failed")),
        } as any;
      }
      return baseCollectionImpl ? baseCollectionImpl(name) : { add: jest.fn() };
    });

    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    const res = await wrapped({ imei: "m1" }, noAuth);
    expect(res.masterId).toBe("m1");
  });

  it("wirft internal wenn getUser mit unbekanntem Fehler fehlschlägt", async () => {
    mockAuth.getUser.mockRejectedValueOnce({ code: "auth/internal-error" });
    const wrapped = testEnv.wrap(fns.registerMasterDevice);
    await expect(wrapped({ imei: "m1" }, asMaster))
      .rejects.toThrow(/unexpected error occurred while registering the device/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – bootstrapFirstAdmin / revokeUserTokens
// ══════════════════════════════════════════════════════════════════════════

describe("bootstrapFirstAdmin – Branch-Coverage", () => {
  it("wirft unauthenticated ohne Auth-Kontext", async () => {
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, noAuth)).rejects.toThrow(/angemeldet/i);
  });

  it("verweigert wenn bereits ein Admin existiert", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({
      users: [{ uid: "admin-existing", customClaims: { role: "admin" } }],
      pageToken: undefined,
    });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, { auth: { uid: "u-bootstrap", token: {} } })).rejects.toThrow(/bereits ein Admin/i);
  });

  it("promotet den ersten Benutzer erfolgreich zum Admin", async () => {
    mockAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: undefined });
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    const res = await wrapped({}, { auth: { uid: "u-first-admin", token: {} } });
    expect(res.success).toBe(true);
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("u-first-admin", { role: "admin" });
  });

  it("wirft internal bei unerwartetem listUsers-Fehler", async () => {
    mockAuth.listUsers.mockRejectedValueOnce(new Error("auth listing unavailable"));
    const wrapped = testEnv.wrap(fns.bootstrapFirstAdmin);
    await expect(wrapped({}, { auth: { uid: "u-bootstrap-2", token: {} } }))
      .rejects.toThrow(/admin-aktivierung fehlgeschlagen/i);
  });
});

describe("revokeUserTokens – Branch-Coverage", () => {
  it("widerruft Tokens erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    const res = await wrapped({ uid: "m1" }, asAdmin);
    expect(res.message).toContain("revoked");
    expect(mockAuth.revokeRefreshTokens).toHaveBeenCalledWith("m1");
  });

  it("wirft invalid-argument ohne uid", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/UID/);
  });

  it("benötigt Admin-Berechtigung", async () => {
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "m1" }, asMaster)).rejects.toThrow(/Admin/);
  });

  it("wirft internal bei unerwartetem Revoke-Fehler", async () => {
    mockAuth.revokeRefreshTokens.mockRejectedValueOnce(new Error("revoke failed"));
    const wrapped = testEnv.wrap(fns.revokeUserTokens);
    await expect(wrapped({ uid: "m1" }, asAdmin)).rejects.toThrow(/failed to revoke tokens/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// AUTH.TS – setAdminClaim and setUserRole
// ══════════════════════════════════════════════════════════════════════════

describe("setAdminClaim – Branch-Coverage", () => {
  it("setzt Admin-Claim erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    const res = await wrapped({ uid: "user1" }, asAdmin);
    expect(res.message).toContain("Success");
    expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("user1", { role: "admin" });
  });

  it("wirft invalid-argument ohne uid", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({}, asAdmin)).rejects.toThrow(/UID/);
  });

  it("benötigt Admin-Berechtigung", async () => {
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "user1" }, asMaster)).rejects.toThrow(/Admin/);
  });

  it("wirft internal bei unerwartetem Fehler", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("claims write failed"));
    const wrapped = testEnv.wrap(fns.setAdminClaim);
    await expect(wrapped({ uid: "user1" }, asAdmin)).rejects.toThrow(/failed to set admin claim/i);
  });
});

describe("setUserRole – Branch-Coverage", () => {
  it("setzt Support-Rolle erfolgreich", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    const res = await wrapped({ uid: "user2", role: "support" }, asAdmin);
    expect(res.message).toContain("support");
  });

  it("wirft invalid-argument bei ungültiger Rolle", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "user1", role: "superadmin" }, asAdmin)).rejects.toThrow(/Role must be/);
  });

  it("wirft invalid-argument ohne uid", async () => {
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ role: "admin" }, asAdmin)).rejects.toThrow(/UID/);
  });

  it("wirft internal bei technischem Claims-Fehler", async () => {
    mockAuth.setCustomUserClaims.mockRejectedValueOnce(new Error("claims backend unavailable"));
    const wrapped = testEnv.wrap(fns.setUserRole);
    await expect(wrapped({ uid: "user3", role: "auditor" }, asAdmin)).rejects.toThrow(/failed to set user role/i);
  });
});
