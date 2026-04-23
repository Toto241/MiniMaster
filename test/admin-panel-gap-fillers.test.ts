/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Admin-Panel Gap Fillers
 *
 * Covers untested critical areas of admin-panel/app.js:
 *   - P0 Blocker / Go-Live status computation
 *   - Wizard state persistence
 *   - Commissioning snapshot
 *   - Auth mode switching
 *   - Firebase config helpers
 */
import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel gap fillers", () => {
  // ═══════════════════════════════════════════════════════════════════════
  // P0 BLOCKER / GO-LIVE STATUS
  // ═══════════════════════════════════════════════════════════════════════

  describe("getP0BlockCompletion", () => {
    it("returns all false when state is empty", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.getP0BlockCompletion({ checks: {} });
      expect(result.completedBlocks).toBe(0);
      expect(result.totalBlocks).toBe(4);
      expect(result.allDone).toBe(false);
      expect(result.blocks.security).toBe(false);
      expect(result.blocks.deviceValidation).toBe(false);
      expect(result.blocks.roster).toBe(false);
      expect(result.blocks.releaseEvidence).toBe(false);
    });

    it("counts security block when both key checks pass", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.getP0BlockCompletion({
        checks: { keyRotationDone: true, keyRestrictionsDone: true },
      });
      expect(result.blocks.security).toBe(true);
      expect(result.completedBlocks).toBe(1);
    });

    it("counts deviceValidation block when oemDeviceTests passes", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.getP0BlockCompletion({
        checks: { oemDeviceTests: true },
      });
      expect(result.blocks.deviceValidation).toBe(true);
      expect(result.completedBlocks).toBe(1);
    });

    it("counts roster block when rosterAssigned passes", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.getP0BlockCompletion({
        checks: { rosterAssigned: true },
      });
      expect(result.blocks.roster).toBe(true);
      expect(result.completedBlocks).toBe(1);
    });

    it("counts releaseEvidence only when all 4 sub-checks pass", () => {
      const { exports } = loadAdminPanelTestExports();
      const partial = exports.getP0BlockCompletion({
        checks: { legacyAuthSnapshot: true, codeqlLinked: true, androidCiLinked: true },
      });
      expect(partial.blocks.releaseEvidence).toBe(false);
      expect(partial.completedBlocks).toBe(0);

      const complete = exports.getP0BlockCompletion({
        checks: {
          legacyAuthSnapshot: true,
          codeqlLinked: true,
          androidCiLinked: true,
          deploymentReference: true,
        },
      });
      expect(complete.blocks.releaseEvidence).toBe(true);
      expect(complete.completedBlocks).toBe(1);
    });

    it("returns allDone=true only when every block is complete", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.getP0BlockCompletion({
        checks: {
          keyRotationDone: true,
          keyRestrictionsDone: true,
          oemDeviceTests: true,
          rosterAssigned: true,
          legacyAuthSnapshot: true,
          codeqlLinked: true,
          androidCiLinked: true,
          deploymentReference: true,
        },
      });
      expect(result.allDone).toBe(true);
      expect(result.completedBlocks).toBe(4);
    });
  });

  describe("computeGoLiveStatusFromData", () => {
    it("returns red ampel when validation is null", () => {
      const { exports } = loadAdminPanelTestExports();
      const status = exports.computeGoLiveStatusFromData([], {}, {}, null, null);
      expect(status.ampel).toBe("red");
      expect(status.backendReady).toBe(false);
    });

    it("returns red ampel when validation has errors", () => {
      const { exports } = loadAdminPanelTestExports();
      const validation = { errorCount: 2, checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true } };
      const status = exports.computeGoLiveStatusFromData([], {}, {}, validation, null);
      expect(status.ampel).toBe("red");
      expect(status.backendReady).toBe(false);
    });

    it("returns red ampel when required backend checks fail", () => {
      const { exports } = loadAdminPanelTestExports();
      const validation = { errorCount: 0, checks: { adminAuthOk: false, functionsReachable: true, firestoreAccessOk: true } };
      const status = exports.computeGoLiveStatusFromData([], {}, {}, validation, null);
      expect(status.ampel).toBe("red");
      expect(status.backendReady).toBe(false);
    });

    it("returns green ampel when everything is ready", () => {
      const { exports } = loadAdminPanelTestExports();
      const validation = { errorCount: 0, checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true } };
      const playStoreState = { checks: { dataSafety: true, privacyUrlLinked: true, iarc: true, listing: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true }, privacyUrl: "https://x", supportEmail: "a@b.c" };
      // Provide a platformQaSummary so the function skips iterating over platformReadinessItems
      const platformQaSummary = {
        hasData: true,
        totals: { totalAll: 4, doneAll: 4, totalCritical: 2, doneCritical: 2, totalHigh: 2, doneHigh: 2 },
        platformStatus: {},
      };
      const status = exports.computeGoLiveStatusFromData([], {}, playStoreState, validation, platformQaSummary);
      expect(status.ampel).toBe("green");
      expect(status.backendReady).toBe(true);
      expect(status.playStoreReady).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // WIZARD STATE
  // ═══════════════════════════════════════════════════════════════════════

  describe("wizard state persistence", () => {
    it("getWizardState returns default when nothing saved", () => {
      const { exports } = loadAdminPanelTestExports();
      const state = exports.getWizardState("masterApp");
      expect(state).toEqual({ currentStep: 0, completed: {} });
    });

    it("saveWizardState persists and getWizardState reads back", () => {
      const { exports, storage } = loadAdminPanelTestExports();
      exports.saveWizardState("masterApp", { currentStep: 3, completed: { 0: true, 1: true } });
      const state = exports.getWizardState("masterApp");
      expect(state.currentStep).toBe(3);
      expect(state.completed[0]).toBe(true);
      expect(state.completed[1]).toBe(true);
      // Verify it actually hit localStorage
      expect(storage.get("operatorSetupWizardState")).toContain("masterApp");
    });

    it("saveWizardState isolates different wizardIds", () => {
      const { exports } = loadAdminPanelTestExports();
      exports.saveWizardState("masterApp", { currentStep: 2, completed: {} });
      exports.saveWizardState("childApp", { currentStep: 5, completed: {} });
      expect(exports.getWizardState("masterApp").currentStep).toBe(2);
      expect(exports.getWizardState("childApp").currentStep).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // COMMISSIONING SNAPSHOT
  // ═══════════════════════════════════════════════════════════════════════

  describe("buildCommissioningSnapshot", () => {
    it("returns pending state when report is null", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot(null);
      expect(snapshot.pendingCount).toBe(0);
      expect(snapshot.validationState).toBe("Validation ausstehend");
      expect(snapshot.confirmedAttestations).toBe(0);
    });

    it("reflects validation errors when present", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot({
        validationSummary: { errorCount: 3, warn: 1, ok: 5 },
        pending: [],
      });
      expect(snapshot.validationState).toBe("3 kritische Findings");
    });

    it("reflects warnings when no errors", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot({
        validationSummary: { errorCount: 0, warn: 2, ok: 5 },
        pending: [],
      });
      expect(snapshot.validationState).toBe("2 Warnungen offen");
    });

    it("shows green when no errors or warnings", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot({
        validationSummary: { errorCount: 0, warn: 0, ok: 5 },
        pending: [],
      });
      expect(snapshot.validationState).toBe("Validierung vollständig grün");
    });

    it("counts only visible pending items", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot({
        validationSummary: { errorCount: 0, warn: 0, ok: 5 },
        pending: [
          "Cloud Project ID setzen.",          // covered -> invisible
          "Firebase-Webkonfiguration lokal speichern.", // visible
          "Operator-PIN festlegen.",           // visible
        ],
      });
      expect(snapshot.pendingCount).toBe(2);
    });

    it("includes a valid ISO timestamp", () => {
      const { exports } = loadAdminPanelTestExports();
      const snapshot = exports.buildCommissioningSnapshot({ pending: [] });
      expect(snapshot.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AUTH MODE SWITCHING
  // ═══════════════════════════════════════════════════════════════════════

  describe("showAuthMode", () => {
    it("toggles visibility between login and register forms", () => {
      const { exports, elements } = loadAdminPanelTestExports();
      const makeEl = (display: string) => ({
        style: { display },
        classList: { add: jest.fn(), remove: jest.fn() },
      });
      elements.set("login-form", makeEl("block"));
      elements.set("register-form", makeEl("none"));
      elements.set("toggle-register", makeEl("block"));
      elements.set("toggle-login", makeEl("block"));

      exports.showAuthMode("register");
      expect(elements.get("login-form").style.display).toBe("none");
      expect(elements.get("register-form").style.display).toBe("flex");

      exports.showAuthMode("login");
      expect(elements.get("login-form").style.display).toBe("flex");
      expect(elements.get("register-form").style.display).toBe("none");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FIREBASE CONFIG HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  describe("Firebase config helpers", () => {
    it("hasCompleteFirebaseConfig requires all 6 fields", () => {
      const { exports } = loadAdminPanelTestExports();
      expect(exports.hasCompleteFirebaseConfig({})).toBe(false);
      expect(exports.hasCompleteFirebaseConfig({ apiKey: "x" })).toBe(false);
      expect(exports.hasCompleteFirebaseConfig({
        apiKey: "x", authDomain: "x", projectId: "x", storageBucket: "x", messagingSenderId: "x", appId: "x",
      })).toBe(true);
    });

    it("isPlaceholderFirebaseConfig detects placeholder values", () => {
      const { exports } = loadAdminPanelTestExports();
      expect(exports.isPlaceholderFirebaseConfig({ apiKey: "your-api-key", authDomain: "x", projectId: "x", storageBucket: "x", messagingSenderId: "x", appId: "x" })).toBe(true);
      expect(exports.isPlaceholderFirebaseConfig({ apiKey: "AIza-real", authDomain: "x", projectId: "x", storageBucket: "x", messagingSenderId: "x", appId: "x" })).toBe(false);
    });

    it("normalizeBootstrapFirebaseConfig fills defaults and trims", () => {
      const { exports } = loadAdminPanelTestExports();
      const result = exports.normalizeBootstrapFirebaseConfig({
        apiKey: "  k  ", authDomain: "  d  ", projectId: "  p  ",
        storageBucket: "", messagingSenderId: "", appId: "",
      });
      expect(result.apiKey).toBe("k");
      expect(result.authDomain).toBe("d");
      expect(result.projectId).toBe("p");
      expect(result.storageBucket).toBe("");
    });

    it("extractFirebaseConfigFromText parses JSON and JS-object syntax", () => {
      const { exports } = loadAdminPanelTestExports();
      const json = JSON.stringify({ apiKey: "k", authDomain: "d", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "a" });
      expect(exports.extractFirebaseConfigFromText(json)).toEqual({
        apiKey: "k", authDomain: "d", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "a",
      });

      const jsObj = `const firebaseConfig = { apiKey: "k", authDomain: "d", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "a" };`;
      expect(exports.extractFirebaseConfigFromText(jsObj)).toEqual({
        apiKey: "k", authDomain: "d", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "a",
      });
    });

    it("isPlaceholderProjectId detects placeholder project IDs", () => {
      const { exports } = loadAdminPanelTestExports();
      expect(exports.isPlaceholderProjectId("your-project-id")).toBe(true);
      expect(exports.isPlaceholderProjectId("YOUR-PROJECT-ID")).toBe(true);
      expect(exports.isPlaceholderProjectId("real-project")).toBe(false);
      expect(exports.isPlaceholderProjectId("")).toBe(true);
    });
  });
});
