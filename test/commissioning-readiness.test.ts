/**
 * Automated tests for the Operator Dashboard commissioning & readiness checks.
 *
 * Covers:
 * - Cloud Project ID / KI-Runtime-Konfiguration validation
 * - Commissioning attestation tracking (9 manual QA sign-offs)
 * - Play-Store-Readiness checks, Privacy-Policy-URL, Support-E-Mail
 * - Go-Live Ampel computation (red / yellow / green)
 * - Prioritized action plan generation
 */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

/* ------------------------------------------------------------------ */
/*  Shared test harness (mirrors admin-panel-helpers.test.ts pattern)  */
/* ------------------------------------------------------------------ */
type StorageMap = Record<string, string>;

interface FormInputMock {
  value: string;
  tagName: string;
  style: Record<string, string>;
  addEventListener: jest.Mock;
  setAttribute: jest.Mock;
}

function makeInput(value = ""): FormInputMock {
  return {
    value,
    tagName: "INPUT",
    style: {},
    addEventListener: jest.fn(),
    setAttribute: jest.fn(),
  };
}

function loadTestExports(
  initialStorage: StorageMap = {},
  formValues: Record<string, string> = {},
) {
  const scriptPath = path.join(__dirname, "..", "admin-panel", "app.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, any>();

  // Pre-populate form elements from formValues
  for (const [id, val] of Object.entries(formValues)) {
    elements.set(id, makeInput(val));
  }

  const documentMock: any = {
    addEventListener: jest.fn(),
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    querySelectorAll: jest.fn(() => []),
    createElement: jest.fn((tag: string) => ({
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      innerHTML: "",
      value: "",
      appendChild: jest.fn(),
      remove: jest.fn(),
      querySelector: jest.fn(() => ({ addEventListener: jest.fn() })),
      setAttribute: jest.fn(),
      select: jest.fn(),
      click: jest.fn(),
    })),
    body: { appendChild: jest.fn(), removeChild: jest.fn() },
    execCommand: jest.fn(),
  };

  const context: any = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: jest.fn(),
    clearInterval: jest.fn(),
    Blob: function Blob(parts: any[], options: any) { return { parts, options }; },
    URL: { createObjectURL: jest.fn(() => "blob:test"), revokeObjectURL: jest.fn() },
    localStorage: {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => { storage.set(key, value); }),
      removeItem: jest.fn((key: string) => { storage.delete(key); }),
    },
    navigator: { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } },
    window: {},
    document: documentMock,
    confirm: jest.fn(() => true),
    alert: jest.fn(),
    firebase: {},
    auth: null,
    btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
  };
  context.window = context;
  context.globalThis = context;

  const exportTrailer = [
    "",
    ";globalThis.__testExports = {",
    "  getMissingAttestations,",
    "  getCommissioningAttestations,",
    "  updateCommissioningAttestations,",
    "  commissioningAttestationItems,",
    "  getPlayStoreReadinessState,",
    "  setPlayStoreReadinessState,",
    "  isPlaceholderFirebaseConfig,",
    "  hasCompleteFirebaseConfig,",
    "  getOperatorConfigFormValues,",
    "  buildPrioritizedActionPlanFromData,",
    "  computeGoLiveStatusFromData,",
    "  platformReadinessItems,",
    "  getPriorityWeight,",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "admin-panel/app.js" });

  return {
    exports: context.__testExports as Record<string, any>,
    storage,
    elements,
    context,
  };
}

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe("Commissioning & Readiness – automated checks", () => {
  /* -------------------------------------------------------------- */
  /*  1) Cloud Project ID                                            */
  /* -------------------------------------------------------------- */
  describe("Cloud Project ID validation", () => {
    it("reports missing Cloud Project ID when form field is empty", () => {
      const { exports } = loadTestExports();
      const config = exports.getOperatorConfigFormValues();
      expect(config.cloud.projectId).toBe("");
    });

    it("returns valid Cloud Project ID when form field is populated", () => {
      const { exports } = loadTestExports({}, {
        "cfg-cloud-project-id": "minimaster-prod",
        "cfg-cloud-region": "europe-west1",
        "cfg-cloud-appcheck": "enforced",
        "cfg-cloud-release-channel": "prod",
      });
      const config = exports.getOperatorConfigFormValues();
      expect(config.cloud.projectId).toBe("minimaster-prod");
    });
  });

  /* -------------------------------------------------------------- */
  /*  2) KI-Runtime-Konfiguration                                    */
  /* -------------------------------------------------------------- */
  describe("KI-Runtime-Konfiguration validation", () => {
    it("detects incomplete AI config (provider, model, keyRef, systemPrompt all required)", () => {
      const { exports } = loadTestExports({}, {
        "cfg-ai-provider": "gemini",
        "cfg-ai-model": "",
        "cfg-ai-temperature": "0.3",
      });
      const config = exports.getOperatorConfigFormValues();
      expect(config.ai.provider).toBe("gemini");
      expect(config.ai.model).toBe("");
      expect(config.ai.keyRef).toBe("");
      expect(config.ai.systemPrompt).toBe("");
      // These empty fields would trigger "KI-Runtime-Konfiguration vervollständigen."
      const incomplete = !config.ai.provider || !config.ai.model || !config.ai.keyRef || !config.ai.systemPrompt;
      expect(incomplete).toBe(true);
    });

    it("accepts complete AI config", () => {
      const { exports } = loadTestExports({}, {
        "cfg-ai-provider": "gemini",
        "cfg-ai-model": "gemini-3.0-flash",
        "cfg-ai-temperature": "0.3",
        "cfg-ai-endpoint": "",
        "cfg-ai-key-ref": "projects/minimaster/secrets/gemini-key",
        "cfg-ai-system-prompt": "Du bist ein Support-Assistent.",
      });
      const config = exports.getOperatorConfigFormValues();
      const complete = config.ai.provider && config.ai.model && config.ai.keyRef && config.ai.systemPrompt;
      expect(complete).toBeTruthy();
    });
  });

  /* -------------------------------------------------------------- */
  /*  3) Manuelle Freigaben (9 QA evidence items)                    */
  /* -------------------------------------------------------------- */
  describe("Commissioning attestations (9 manual QA sign-offs)", () => {
    it("lists all 9 manual attestations as missing when none are confirmed", () => {
      const { exports } = loadTestExports();
      const missing = exports.getMissingAttestations() as string[];
      expect(missing).toHaveLength(9);
      expect(missing).toContain("Firebase Authentication aktiviert");
      expect(missing).toContain("Cloud Messaging aktiviert oder bewusst nicht benötigt");
      expect(missing).toContain("Android-App com.minimaster.masterapp registriert");
      expect(missing).toContain("Android-App com.google.pairing registriert");
      expect(missing).toContain("Parent Web Panel Login geprüft");
      expect(missing).toContain("Device-Sync zwischen Parent Panel und Child geprüft");
      expect(missing).toContain("Support-Ticket-Flow geprüft");
      expect(missing).toContain("DSAR- und Audit-Flow geprüft");
      expect(missing).toContain("Storage Rules aktiv und geprüft");
    });

    it("removes confirmed attestations from the missing list", () => {
      const { exports } = loadTestExports();
      exports.updateCommissioningAttestations({
        "firebase-auth-enabled": true,
        "messaging-enabled": true,
      });
      const missing = exports.getMissingAttestations() as string[];
      expect(missing).toHaveLength(7);
      expect(missing).not.toContain("Firebase Authentication aktiviert");
      expect(missing).not.toContain("Cloud Messaging aktiviert oder bewusst nicht benötigt");
      // Still missing:
      expect(missing).toContain("Android-App com.minimaster.masterapp registriert");
      expect(missing).toContain("DSAR- und Audit-Flow geprüft");
    });

    it("returns empty list when all 9 manual attestations are confirmed", () => {
      const allKeys: Record<string, boolean> = {};
      const items = [
        "firebase-auth-enabled", "messaging-enabled", "android-master-registered", "android-child-registered",
        "parent-panel-verified",
        "device-sync-verified", "support-flow-verified", "compliance-flow-verified",
        "storage-rules-verified",
      ];
      items.forEach(k => { allKeys[k] = true; });

      const { exports } = loadTestExports({
        operatorCommissioningAttestations: JSON.stringify(allKeys),
      });
      const missing = exports.getMissingAttestations() as string[];
      expect(missing).toHaveLength(0);
    });

    it("persists attestation state through localStorage round-trip", () => {
      const { exports, storage } = loadTestExports();
      exports.updateCommissioningAttestations({ "parent-panel-verified": true });
      const raw = storage.get("operatorCommissioningAttestations");
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw!);
      expect(parsed["parent-panel-verified"]).toBe(true);

      const fresh = exports.getCommissioningAttestations();
      expect(fresh["parent-panel-verified"]).toBe(true);
    });

    it("matches exactly the 9 manual items defined in commissioningAttestationItems", () => {
      const { exports } = loadTestExports();
      const items = exports.commissioningAttestationItems as Array<{ key: string; label: string }>;
      expect(items).toHaveLength(9);
      const keys = items.map((i: any) => i.key);
      expect(keys).toContain("firebase-auth-enabled");
      expect(keys).toContain("storage-rules-verified");
      expect(keys).not.toContain("firestore-enabled");
      expect(keys).not.toContain("service-account-ready");
    });
  });

  /* -------------------------------------------------------------- */
  /*  4) Play-Store-Readiness                                        */
  /* -------------------------------------------------------------- */
  describe("Play-Store-Readiness checks", () => {
    it("starts with 8 unchecked play-store checks by default", () => {
      const { exports } = loadTestExports();
      const state = exports.getPlayStoreReadinessState();
      const openChecks = Object.entries(state.checks).filter(([, v]) => !v);
      expect(openChecks).toHaveLength(8);
    });

    it("detects missing Privacy-Policy-URL", () => {
      const { exports } = loadTestExports();
      const state = exports.getPlayStoreReadinessState();
      expect(state.privacyUrl).toBe("");
      const valid = /^https:\/\//i.test(state.privacyUrl);
      expect(valid).toBe(false);
    });

    it("detects missing Support-/Privacy-E-Mail", () => {
      const { exports } = loadTestExports();
      const state = exports.getPlayStoreReadinessState();
      expect(state.supportEmail).toBe("");
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.supportEmail);
      expect(valid).toBe(false);
    });

    it("validates a correct Privacy-Policy-URL", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {},
        privacyUrl: "https://minimaster.app/privacy",
        supportEmail: "",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(/^https:\/\//i.test(state.privacyUrl)).toBe(true);
    });

    it("rejects http:// Privacy-Policy-URL (must be https)", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {},
        privacyUrl: "http://minimaster.app/privacy",
        supportEmail: "",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(/^https:\/\//i.test(state.privacyUrl)).toBe(false);
    });

    it("validates a correct Support-E-Mail", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {},
        privacyUrl: "",
        supportEmail: "support@minimaster.app",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.supportEmail)).toBe(true);
    });

    it("rejects invalid Support-E-Mail formats", () => {
      const invalidEmails = ["", "not-an-email", "missing@", "@no-local.de", "spaces in@email.de"];
      const { exports } = loadTestExports();
      for (const email of invalidEmails) {
        exports.setPlayStoreReadinessState({ checks: {}, privacyUrl: "", supportEmail: email });
        const state = exports.getPlayStoreReadinessState();
        expect(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.supportEmail)).toBe(false);
      }
    });

    it("counts remaining open checks (partial completion)", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {
          dataSafety: true, iarc: true, listing: true,
          privacyUrlLinked: false, permissionsDeclaration: false,
          appAccessGuide: false, securityRotationDone: false, goNoGoSignedOff: false,
        },
        privacyUrl: "https://minimaster.app/privacy",
        supportEmail: "support@minimaster.app",
      });
      const state = exports.getPlayStoreReadinessState();
      const open = Object.entries(state.checks).filter(([, v]) => !v);
      expect(open).toHaveLength(5);
    });

    it("reports 0 open checks when all are completed", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {
          dataSafety: true, iarc: true, listing: true,
          privacyUrlLinked: true, permissionsDeclaration: true,
          appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true,
        },
        privacyUrl: "https://minimaster.app/privacy",
        supportEmail: "support@minimaster.app",
      });
      const state = exports.getPlayStoreReadinessState();
      const open = Object.entries(state.checks).filter(([, v]) => !v);
      expect(open).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------- */
  /*  5) Go-Live Ampel                                               */
  /* -------------------------------------------------------------- */
  describe("Go-Live Ampel (computeGoLiveStatusFromData)", () => {
    const fullChecks = {
      dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true,
      permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true,
      goNoGoSignedOff: true,
    };
    const fullPlayStore = {
      checks: fullChecks,
      privacyUrl: "https://minimaster.app/privacy",
      supportEmail: "support@minimaster.app",
    };
    const validBackend = {
      errorCount: 0,
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true, storageHealthOk: true, webControlConfigReady: true },
    };

    it("shows RED when no backend validation exists", () => {
      const { exports } = loadTestExports();
      const status = exports.computeGoLiveStatusFromData(
        exports.commissioningAttestationItems, // all missing
        {},
        { checks: {} },
        null, // no validation
      );
      expect(status.ampel).toBe("red");
      expect(status.ampelLabel).toBe("Go-Live blockiert");
      expect(status.backendReady).toBe(false);
    });

    it("shows RED when critical platform items are open", () => {
      const { exports } = loadTestExports();
      const status = exports.computeGoLiveStatusFromData(
        [], // all attestations done
        {}, // no platform items done
        fullPlayStore,
        validBackend, // backend ok
      );
      expect(status.ampel).toBe("red");
      expect(status.backendReady).toBe(true);
      expect(status.totals.doneCritical).toBe(0);
    });

    it("shows YELLOW when backend + critical done but attestations missing", () => {
      const { exports } = loadTestExports();
      // Mark all platform critical items done
      const platformState: Record<string, boolean> = {};
      for (const platform of Object.values(exports.platformReadinessItems)) {
        for (const item of (platform as any).items) {
          if (item.severity === "critical") platformState[item.key] = true;
        }
      }
      const status = exports.computeGoLiveStatusFromData(
        [{ key: "test", label: "Test missing" }], // some attestations missing
        platformState,
        fullPlayStore,
        validBackend,
      );
      expect(status.ampel).toBe("yellow");
      expect(status.ampelLabel).toBe("Teilweise bereit");
    });

    it("shows YELLOW when play-store checks incomplete", () => {
      const { exports } = loadTestExports();
      const platformState: Record<string, boolean> = {};
      for (const platform of Object.values(exports.platformReadinessItems)) {
        for (const item of (platform as any).items) {
          if (item.severity === "critical") platformState[item.key] = true;
        }
      }
      const status = exports.computeGoLiveStatusFromData(
        [],
        platformState,
        { checks: { dataSafety: true }, privacyUrl: "", supportEmail: "" }, // incomplete
        validBackend,
      );
      expect(status.ampel).toBe("yellow");
      expect(status.playStoreReady).toBe(false);
    });

    it("shows GREEN when everything is complete", () => {
      const { exports } = loadTestExports();
      // Mark ALL platform items done
      const platformState: Record<string, boolean> = {};
      for (const platform of Object.values(exports.platformReadinessItems)) {
        for (const item of (platform as any).items) {
          platformState[item.key] = true;
        }
      }
      const status = exports.computeGoLiveStatusFromData(
        [], // no missing attestations
        platformState,
        fullPlayStore,
        validBackend,
      );
      expect(status.ampel).toBe("green");
      expect(status.ampelLabel).toBe("Go-Live freigegeben");
      expect(status.backendReady).toBe(true);
      expect(status.allAttestationsOk).toBe(true);
      expect(status.playStoreReady).toBe(true);
    });

    it("tracks platform completion percentages", () => {
      const { exports } = loadTestExports();
      const status = exports.computeGoLiveStatusFromData([], {}, fullPlayStore, validBackend);
      expect(status.platformStatus.masterApp.percent).toBe(0);
      expect(status.platformStatus.masterApp.total).toBeGreaterThan(0);
      expect(status.platformStatus.childApp.percent).toBe(0);
      expect(status.platformStatus.desktop.percent).toBe(0);
    });
  });

  /* -------------------------------------------------------------- */
  /*  6) Prioritized Action Plan                                     */
  /* -------------------------------------------------------------- */
  describe("Prioritized Action Plan (buildPrioritizedActionPlanFromData)", () => {
    it("generates steps for all 8 open play-store checks", () => {
      const { exports } = loadTestExports();
      const plan = exports.buildPrioritizedActionPlanFromData(
        null, // no backend validation
        {},   // no platform readiness
        { checks: {
          dataSafety: false, iarc: false, listing: false, privacyUrlLinked: false,
          permissionsDeclaration: false, appAccessGuide: false,
          securityRotationDone: false, goNoGoSignedOff: false,
        }, privacyUrl: "", supportEmail: "" },
        [],
      );
      const playStoreSteps = plan.filter((s: any) => s.category === "Play Store");
      // 8 checks + privacy URL + support email = 10
      expect(playStoreSteps.length).toBe(10);
    });

    it("generates steps for open QA approvals", () => {
      const { exports } = loadTestExports();
      const missingAttestations = [
        { key: "firebase-auth-enabled", label: "Firebase Authentication aktiviert" },
        { key: "parent-panel-verified", label: "Parent Web Panel Login geprüft" },
        { key: "functions-enabled", label: "Cloud Functions aktiviert", automationType: "automatic", status: "fail" },
      ];
      const plan = exports.buildPrioritizedActionPlanFromData(
        { errorCount: 0, checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true, storageHealthOk: true, webControlConfigReady: true } },
        {},
        { checks: { dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true },
          privacyUrl: "https://minimaster.app/privacy", supportEmail: "support@minimaster.app" },
        missingAttestations,
      );
      const attestationSteps = plan.filter((s: any) => s.category === "Compliance");
      const automationSteps = plan.filter((s: any) => s.category === "QA-Automation");
      expect(attestationSteps).toHaveLength(2);
      expect(automationSteps).toHaveLength(1);
      expect(attestationSteps[0].title).toBe("Firebase Authentication aktiviert");
      expect(attestationSteps[1].title).toBe("Parent Web Panel Login geprüft");
      expect(automationSteps[0].title).toBe("Cloud Functions aktiviert");
      expect(automationSteps[0].severity).toBe("critical");
    });

    it("generates backend validation step when validation is null", () => {
      const { exports } = loadTestExports();
      const plan = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "", supportEmail: "" }, [],
      );
      const backendSteps = plan.filter((s: any) => s.id === "backend-validation-missing");
      expect(backendSteps).toHaveLength(1);
      expect(backendSteps[0].severity).toBe("critical");
    });

    it("generates steps for failing backend checks", () => {
      const { exports } = loadTestExports();
      const failingBackend = {
        errorCount: 2,
        checks: {
          adminAuthOk: false,
          functionsReachable: false,
          firestoreAccessOk: false,
          storageHealthOk: false,
          webControlConfigReady: false,
        },
      };
      const plan = exports.buildPrioritizedActionPlanFromData(
        failingBackend, {},
        { checks: {}, privacyUrl: "", supportEmail: "" }, [],
      );
      expect(plan.some((s: any) => s.id === "backend-admin-auth")).toBe(true);
      expect(plan.some((s: any) => s.id === "backend-functions-reachable")).toBe(true);
      expect(plan.some((s: any) => s.id === "backend-firestore-access")).toBe(true);
      expect(plan.some((s: any) => s.id === "backend-storage-health")).toBe(true);
      expect(plan.some((s: any) => s.id === "backend-web-config")).toBe(true);
    });

    it("omits backend check steps when all backend checks pass", () => {
      const { exports } = loadTestExports();
      const passingBackend = {
        errorCount: 0,
        checks: {
          adminAuthOk: true,
          functionsReachable: true,
          firestoreAccessOk: true,
          storageHealthOk: true,
          webControlConfigReady: true,
        },
      };
      const plan = exports.buildPrioritizedActionPlanFromData(
        passingBackend, {},
        { checks: {}, privacyUrl: "", supportEmail: "" }, [],
      );
      expect(plan.some((s: any) => s.id === "backend-admin-auth")).toBe(false);
      expect(plan.some((s: any) => s.id === "backend-functions-reachable")).toBe(false);
    });

    it("generates privacy-URL step only when URL is invalid", () => {
      const { exports } = loadTestExports();
      const planMissing = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "", supportEmail: "" }, [],
      );
      expect(planMissing.some((s: any) => s.id === "playstore-privacy-url-value")).toBe(true);

      const planHttp = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "http://no-ssl.de", supportEmail: "" }, [],
      );
      expect(planHttp.some((s: any) => s.id === "playstore-privacy-url-value")).toBe(true);

      const planValid = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "https://minimaster.app/privacy", supportEmail: "" }, [],
      );
      expect(planValid.some((s: any) => s.id === "playstore-privacy-url-value")).toBe(false);
    });

    it("generates email step only when email is invalid", () => {
      const { exports } = loadTestExports();
      const planMissing = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "", supportEmail: "" }, [],
      );
      expect(planMissing.some((s: any) => s.id === "playstore-support-email-value")).toBe(true);

      const planValid = exports.buildPrioritizedActionPlanFromData(
        null, {}, { checks: {}, privacyUrl: "", supportEmail: "test@test.de" }, [],
      );
      expect(planValid.some((s: any) => s.id === "playstore-support-email-value")).toBe(false);
    });

    it("sorts by severity: critical > high > medium", () => {
      const { exports } = loadTestExports();
      const plan = exports.buildPrioritizedActionPlanFromData(
        null, {},
        { checks: { dataSafety: false }, privacyUrl: "", supportEmail: "" },
        [{ key: "test", label: "Test" }],
      );
      const severities = plan.map((s: any) => s.severity);
      for (let i = 1; i < severities.length; i++) {
        const prevWeight = exports.getPriorityWeight(severities[i - 1]);
        const currWeight = exports.getPriorityWeight(severities[i]);
        expect(prevWeight).toBeGreaterThanOrEqual(currWeight);
      }
    });

    it("assigns sequential order numbers", () => {
      const { exports } = loadTestExports();
      const plan = exports.buildPrioritizedActionPlanFromData(
        null, {},
        { checks: {}, privacyUrl: "", supportEmail: "" },
        [],
      );
      plan.forEach((step: any, idx: number) => {
        expect(step.order).toBe(idx + 1);
      });
    });

    it("deduplicates steps with the same id", () => {
      const { exports } = loadTestExports();
      const plan = exports.buildPrioritizedActionPlanFromData(
        null, {},
        { checks: {}, privacyUrl: "", supportEmail: "" },
        [],
      );
      const ids = plan.map((s: any) => s.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("returns empty plan when everything is done", () => {
      const { exports } = loadTestExports();
      const fullPlatform: Record<string, boolean> = {};
      for (const platform of Object.values(exports.platformReadinessItems)) {
        for (const item of (platform as any).items) {
          fullPlatform[item.key] = true;
        }
      }
      const plan = exports.buildPrioritizedActionPlanFromData(
        { errorCount: 0, checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true, storageHealthOk: true, webControlConfigReady: true } },
        fullPlatform,
        { checks: { dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true },
          privacyUrl: "https://minimaster.app/privacy", supportEmail: "support@minimaster.app" },
        [], // no missing attestations
      );
      expect(plan).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------- */
  /*  7) Pending-Items aggregation (refreshCommissioningReport logic)*/
  /* -------------------------------------------------------------- */
  describe("Pending items aggregation", () => {
    it("collects all pending items when nothing is configured", () => {
      const { exports } = loadTestExports();
      const config = exports.getOperatorConfigFormValues();
      const playState = exports.getPlayStoreReadinessState();
      const missing = exports.getMissingAttestations() as string[];

      const pending: string[] = [];

      // Cloud Project ID
      if (!config.cloud.projectId) pending.push("Cloud Project ID setzen.");
      expect(pending).toContain("Cloud Project ID setzen.");

      // KI-Runtime
      if (!config.ai.provider || !config.ai.model || !config.ai.keyRef || !config.ai.systemPrompt) {
        pending.push("KI-Runtime-Konfiguration vervollständigen.");
      }
      expect(pending).toContain("KI-Runtime-Konfiguration vervollständigen.");

      // Attestations
      missing.forEach(item => pending.push(`QA-Nachweis offen: ${item}`));
      expect(pending.filter(p => p.startsWith("QA-Nachweis offen:"))).toHaveLength(9);

      // Play Store
      const openPlayChecks = Object.entries(playState.checks).filter(([, v]) => !v);
      if (openPlayChecks.length > 0) {
        pending.push(`Play-Store-Readiness: ${openPlayChecks.length} Pflicht-Check(s) offen.`);
      }
      expect(pending).toContain("Play-Store-Readiness: 8 Pflicht-Check(s) offen.");

      if (!playState.privacyUrl || !/^https:\/\//i.test(playState.privacyUrl)) {
        pending.push("Play-Store-Readiness: gültige Privacy-Policy-URL (https://) fehlt.");
      }
      expect(pending).toContain("Play-Store-Readiness: gültige Privacy-Policy-URL (https://) fehlt.");

      if (!playState.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playState.supportEmail)) {
        pending.push("Play-Store-Readiness: gültige Support-/Privacy-E-Mail fehlt.");
      }
      expect(pending).toContain("Play-Store-Readiness: gültige Support-/Privacy-E-Mail fehlt.");
    });

    it("clears all pending items when fully configured", () => {
      const allAttestKeys: Record<string, boolean> = {};
      [
        "firebase-auth-enabled", "messaging-enabled", "android-master-registered", "android-child-registered",
        "parent-panel-verified",
        "device-sync-verified", "support-flow-verified", "compliance-flow-verified",
        "storage-rules-verified",
      ].forEach(k => { allAttestKeys[k] = true; });

      const allPlayChecks = {
        dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true,
        permissionsDeclaration: true, appAccessGuide: true,
        securityRotationDone: true, goNoGoSignedOff: true,
      };

      const { exports } = loadTestExports(
        {
          operatorCommissioningAttestations: JSON.stringify(allAttestKeys),
          playStoreReadinessState: JSON.stringify({
            checks: allPlayChecks,
            privacyUrl: "https://minimaster.app/privacy",
            supportEmail: "support@minimaster.app",
          }),
        },
        {
          "cfg-cloud-project-id": "minimaster-prod",
          "cfg-ai-provider": "gemini",
          "cfg-ai-model": "gemini-3.0-flash",
          "cfg-ai-key-ref": "projects/minimaster/secrets/key",
          "cfg-ai-system-prompt": "Du bist ein Support-Assistent.",
          "cfg-ai-temperature": "0.3",
        },
      );

      const config = exports.getOperatorConfigFormValues();
      const playState = exports.getPlayStoreReadinessState();
      const missing = exports.getMissingAttestations() as string[];
      const pending: string[] = [];

      if (!config.cloud.projectId) pending.push("Cloud Project ID setzen.");
      if (!config.ai.provider || !config.ai.model || !config.ai.keyRef || !config.ai.systemPrompt) {
        pending.push("KI-Runtime-Konfiguration vervollständigen.");
      }
      missing.forEach(item => pending.push(`QA-Nachweis offen: ${item}`));
      const openPlayChecks = Object.entries(playState.checks).filter(([, v]) => !v);
      if (openPlayChecks.length > 0) pending.push(`Play-Store-Readiness: ${openPlayChecks.length} Pflicht-Check(s) offen.`);
      if (!playState.privacyUrl || !/^https:\/\//i.test(playState.privacyUrl)) {
        pending.push("Play-Store-Readiness: gültige Privacy-Policy-URL (https://) fehlt.");
      }
      if (!playState.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playState.supportEmail)) {
        pending.push("Play-Store-Readiness: gültige Support-/Privacy-E-Mail fehlt.");
      }

      expect(pending).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------- */
  /*  8) Edge cases                                                  */
  /* -------------------------------------------------------------- */
  describe("Edge cases", () => {
    it("handles corrupted localStorage for attestations gracefully", () => {
      const { exports } = loadTestExports({
        operatorCommissioningAttestations: "INVALID JSON{{{",
      });
      const attestations = exports.getCommissioningAttestations();
      expect(attestations).toEqual({});
      const missing = exports.getMissingAttestations();
      expect(missing).toHaveLength(9);
    });

    it("handles corrupted localStorage for play-store state gracefully", () => {
      const { exports } = loadTestExports({
        playStoreReadiness: "NOT VALID",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(state.checks).toBeDefined();
      expect(state.privacyUrl).toBe("");
      expect(state.supportEmail).toBe("");
    });

    it("treats http:// privacy URL as invalid (requires https://)", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {},
        privacyUrl: "http://example.com/privacy",
        supportEmail: "test@test.de",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(/^https:\/\//i.test(state.privacyUrl)).toBe(false);
    });

    it("accepts HTTPS with uppercase letters in URL scheme", () => {
      const { exports } = loadTestExports();
      exports.setPlayStoreReadinessState({
        checks: {},
        privacyUrl: "HTTPS://minimaster.app/privacy",
        supportEmail: "",
      });
      const state = exports.getPlayStoreReadinessState();
      expect(/^https:\/\//i.test(state.privacyUrl)).toBe(true);
    });

    it("handles partial play-store state (missing checks key)", () => {
      const { exports } = loadTestExports({
        playStoreReadinessState: JSON.stringify({ privacyUrl: "https://test.de" }),
      });
      const state = exports.getPlayStoreReadinessState();
      // Should merge defaults for checks
      expect(Object.keys(state.checks).length).toBe(8);
      expect(state.privacyUrl).toBe("https://test.de");
    });

    it("isPlaceholderFirebaseConfig detects placeholder values", () => {
      const { exports } = loadTestExports();
      expect(exports.isPlaceholderFirebaseConfig({
        apiKey: "your-api-key",
        authDomain: "your-auth-domain",
        projectId: "your_project_id",
      })).toBe(true);
    });
  });
});
