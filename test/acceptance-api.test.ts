import * as admin from "firebase-admin";

// Mocks initialisieren (müssen vor dem Import der zu testenden Module stehen)
const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockOrderBy = jest.fn();
const mockLimit = jest.fn();
const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDb = jest.fn(() => ({
  collection: mockCollection,
}));

jest.mock("../firebase", () => ({ db: mockDb }));

const mockLog = jest.fn();
jest.mock("../src/shared", () => ({
  requireAdmin: (ctx: any) => {
    if (!ctx?.auth?.token?.admin) throw new Error("Forbidden");
  },
  AuditLogger: { log: mockLog },
}));

// Firebase-Functions Mock — factory function damit HttpsError ein echter Konstruktor ist
jest.mock("firebase-functions/v1", () => {
  const actual = jest.requireActual("firebase-functions/v1");
  return {
    ...actual,
    https: {
      ...actual.https,
      onCall: jest.fn((handler: any) => handler),
      HttpsError: class HttpsError extends Error {
        code: string;
        constructor(code: string, message: string) {
          super(message);
          this.code = code;
          this.name = "HttpsError";
        }
      },
    },
  };
});

// Admin Mock
jest.mock("firebase-admin", () => ({
  firestore: {
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), _seconds: Math.floor(Date.now() / 1000) }),
      fromMillis: (ms: number) => ({ toMillis: () => ms, _seconds: Math.floor(ms / 1000) }),
    },
  },
}));

// Nun die zu testenden Module laden
import { getAcceptanceStatus, submitAcceptanceRun, checkAcceptanceGates } from "../src/acceptance";

describe("Acceptance Cloud Functions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeAdminContext(uid = "admin-123") {
    return { auth: { uid, token: { admin: true } } };
  }

  function makeNonAdminContext() {
    return { auth: { uid: "user-456", token: { admin: false } } };
  }

  function setupFirestoreDoc(data: any) {
    mockCollection.mockReturnValue({
      doc: mockDoc,
      orderBy: mockOrderBy,
    });
    mockOrderBy.mockReturnValue({
      limit: mockLimit,
    });
    mockLimit.mockReturnValue({
      get: mockGet,
    });
    mockGet.mockResolvedValue({
      empty: !data,
      docs: data ? [{
        data: () => data,
      }] : [],
    });
    mockDoc.mockReturnValue({
      set: mockSet,
    });
  }

  describe("getAcceptanceStatus", () => {
    it("erfordert Admin-Rechte", async () => {
      await expect(getAcceptanceStatus({}, makeNonAdminContext())).rejects.toThrow("Forbidden");
    });

    it("gibt 'unknown' zurück wenn kein Run vorhanden", async () => {
      setupFirestoreDoc(null);
      const result = await getAcceptanceStatus({}, makeAdminContext());
      expect(result.status).toBe("unknown");
      expect(result.lastRun).toBeNull();
    });

    it("berechnet Gates korrekt bei erfolgreichem Run", async () => {
      setupFirestoreDoc({
        runId: "acc-test-1",
        startedAt: admin.firestore.Timestamp.now(),
        status: "success",
        triggeredBy: "admin-123",
        results: {
          lint: { passed: true, errors: 0, warnings: 2, durationMs: 1500 },
          build: { passed: true, durationMs: 8000 },
          test: { passed: true, suitesTotal: 91, suitesPassed: 91, testsTotal: 2474, testsPassed: 2474, durationMs: 45000 },
          coverage: { branches: 88, functions: 92, lines: 95, statements: 95 },
        },
        logs: [],
      });
      const result = await getAcceptanceStatus({}, makeAdminContext());
      expect(result.status).toBe("success");
      expect(result.gates.lintClean).toBe(true);
      expect(result.gates.buildPassed).toBe(true);
      expect(result.gates.allTestsPassed).toBe(true);
      expect(result.gates.coverageBranches).toBe(true);
      expect(result.gates.coverageFunctions).toBe(true);
      expect(result.gates.coverageLines).toBe(true);
      expect(result.gates.coverageStatements).toBe(true);
      expect(result.allGatesPassed).toBe(true);
    });

    it("erkennt fehlgeschlagene Gates", async () => {
      setupFirestoreDoc({
        runId: "acc-test-2",
        startedAt: admin.firestore.Timestamp.now(),
        status: "failed",
        triggeredBy: "admin-123",
        results: {
          lint: { passed: false, errors: 3, warnings: 0, durationMs: 1200 },
          build: { passed: true, durationMs: 7000 },
          test: { passed: false, suitesTotal: 91, suitesPassed: 89, testsTotal: 2474, testsPassed: 2400, durationMs: 45000 },
          coverage: { branches: 85, functions: 88, lines: 92, statements: 92 },
        },
        logs: [],
      });
      const result = await getAcceptanceStatus({}, makeAdminContext());
      expect(result.gates.lintClean).toBe(false);
      expect(result.gates.allTestsPassed).toBe(false);
      expect(result.gates.coverageBranches).toBe(false);
      expect(result.gates.coverageFunctions).toBe(false);
      expect(result.allGatesPassed).toBe(false);
    });
  });

  describe("submitAcceptanceRun", () => {
    it("erfordert Admin-Rechte", async () => {
      await expect(submitAcceptanceRun({ runId: "x", results: {} }, makeNonAdminContext())).rejects.toThrow("Forbidden");
    });

    it("validiert erforderliche Felder", async () => {
      setupFirestoreDoc(null);
      await expect(submitAcceptanceRun({ runId: "x" }, makeAdminContext())).rejects.toThrow();
    });

    it("schreibt Run in Firestore und Audit-Log", async () => {
      setupFirestoreDoc(null);
      const payload = {
        runId: "acc-submit-1",
        startedAt: Date.now() - 60000,
        completedAt: Date.now(),
        status: "success",
        triggeredBy: "ci-pipeline",
        results: {
          lint: { passed: true, errors: 0, warnings: 0, durationMs: 1000 },
          build: { passed: true, durationMs: 5000 },
          test: { passed: true, suitesTotal: 91, suitesPassed: 91, testsTotal: 2474, testsPassed: 2474, durationMs: 40000 },
        },
        logs: ["Start", "Done"],
      };
      const result = await submitAcceptanceRun(payload, makeAdminContext());
      expect(result.success).toBe(true);
      expect(result.runId).toBe("acc-submit-1");
      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(mockLog).toHaveBeenCalledWith("acceptance.run_submitted", "admin-123", "admin", "acc-submit-1", "acceptance_run", "success", expect.objectContaining({
        allPassed: true,
      }));
    });
  });

  describe("checkAcceptanceGates", () => {
    it("erfordert Admin-Rechte", async () => {
      await expect(checkAcceptanceGates({}, makeNonAdminContext())).rejects.toThrow("Forbidden");
    });

    it("gibt 'gatesAvailable: false' wenn kein Run vorhanden", async () => {
      setupFirestoreDoc(null);
      const result = await checkAcceptanceGates({}, makeAdminContext());
      expect(result.gatesAvailable).toBe(false);
    });

    it("berechnet alle Gates korrekt", async () => {
      setupFirestoreDoc({
        runId: "acc-gates-1",
        startedAt: admin.firestore.Timestamp.now(),
        status: "success",
        triggeredBy: "admin-123",
        results: {
          lint: { passed: true, errors: 0, warnings: 1, durationMs: 1400 },
          build: { passed: true, durationMs: 7500 },
          test: { passed: true, suitesTotal: 91, suitesPassed: 91, testsTotal: 2474, testsPassed: 2474, durationMs: 42000 },
          coverage: { branches: 88, functions: 91, lines: 95, statements: 95 },
        },
        logs: [],
      });
      const result = await checkAcceptanceGates({}, makeAdminContext());
      expect(result.gatesAvailable).toBe(true);
      expect(result.gates.lintClean).toBe(true);
      expect(result.gates.buildPassed).toBe(true);
      expect(result.gates.allTestsPassed).toBe(true);
      expect(result.gates.coverageBranches).toBe(true);
      expect(result.gates.coverageFunctions).toBe(true);
      expect(result.gates.coverageLines).toBe(true);
      expect(result.gates.coverageStatements).toBe(true);
      expect(result.allGatesPassed).toBe(true);
      expect(result.thresholds).toMatchObject({
        branches: 87,
        functions: 90,
        lines: 94,
        statements: 94,
        testSuites: 91,
        lintErrors: 0,
      });
    });
  });
});
