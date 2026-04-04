import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

type StorageMap = Record<string, string>;

function loadAdminPanelTestExports(initialStorage: StorageMap = {}) {
  const scriptPath = path.join(__dirname, "..", "admin-panel", "app.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, any>();

  const documentMock: any = {
    addEventListener: jest.fn(),
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    createElement: jest.fn((tag: string) => ({
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      innerHTML: "",
      value: "",
      appendChild: jest.fn(),
      remove: jest.fn(),
      querySelector: jest.fn(() => ({
        addEventListener: jest.fn(),
      })),
      setAttribute: jest.fn(),
      select: jest.fn(),
      click: jest.fn(),
    })),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    execCommand: jest.fn(),
  };

  const context: any = {
    console,
    setTimeout,
    clearTimeout,
    Blob: function Blob(parts: any[], options: any) { return { parts, options }; },
    URL: {
      createObjectURL: jest.fn(() => "blob:test"),
      revokeObjectURL: jest.fn(),
    },
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
    ";globalThis.__adminPanelTestExports = {",
    "  sanitizeAdbSerial,",
    "  sanitizeApkPath,",
    "  buildPowerShellScript,",
    "  buildDeployCommand,",
    "  buildCommissioningSnapshot,",
    "  renderCommissioningReport,",
    "  getMissingAttestations,",
    "  updateCommissioningAttestations,",
    "  escapePowerShellString,",
    "  encodeCommandPayload,",
    "  decodeCommandPayload,",
    "  hasCompleteFirebaseConfig,",
    "  isPlaceholderFirebaseConfig,",
    "  normalizeBootstrapFirebaseConfig,",
    "  extractFirebaseConfigFromText,",
    "  extractFirebaseConfigFromGoogleServices,",
    "  isPlaceholderProjectId,",
    "  formatPythonAutomationStatus,",
    "  getPythonAutomationStatusMeta,",
    "  formatPythonAutomationType,",
    "  getPythonAutomationTypeChipClass,",
    "  getPriorityWeight,",
    "  buildKeyFingerprint,",
    "  toBase64Url,",
    "  normalizeCallableErrorCode,",
    "  normalizeAuthErrorCode,",
    "  getAccessKeyErrorHint,",
    "  getAuthErrorHint,",
    "  formatAuthDebugCode,",
    "  safeDebugStringify,",
    "  formatPythonAutomationTimestamp,",
    "  formatPythonAutomationEvidenceDetails,",
    "  buildPythonAutomationRunIndex,",
    "  buildFirebaseRecoveryCommands,",
    "  buildFirebaseRecoveryScript,",
    "  isRetryableFirebaseQueueConflict,",
    "  buildPlausibilityFindings,",
    "  computeGoLiveStatusFromData,",
    "  buildPlatformQaReadinessSummary,",
    "  renderCallableDebugInfo,",
    "  getWizardState,",
    "  saveWizardState,",
    "  getPlatformReadiness,",
    "  updatePlatformReadiness,",
    "  getPlayStoreReadinessState,",
    "  setPlayStoreReadinessState,",
    "  getCommissioningAttestations,",
    "  buildPythonEvidenceFilterToolbar,",
    "  platformReadinessItems,",
    "  buildCommandCatalog,",
    "  buildRolloutBundleScript,",
    "  buildPrioritizedActionPlanFromData,",
    "  getP0BlockCompletion,",
    "  getP0BlockerCockpitState,",
    "  setP0BlockerCockpitState,",
    "  autoSyncP0FromExistingSignals,",
    "  loadCommandBuilderConfig,",
    "  getPythonAutomationTestStatus,",
    "  getLatestPythonAutomationEvidence,",
    "  findPythonAutomationTestById,",
    "  setPythonAutomationEvidenceCache,",
    "  getTestingRegisterStatusPriority,",
    "  getTestingRegisterSeverityPriority,",
    "  formatTestingRegisterGroupTitle,",
    "  buildTestingRegisterTooltipAttr,",
    "  buildTestingRegisterMetaBadges,",
    "  buildTestingRegisterLegend,",
    "  buildTestingRegisterActionTooltip,",
    "  buildTestingRegisterDetailText,",
    "  commissioningAttestationItems,",
    "  defaultCommandBuilderConfig,",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "admin-panel/app.js" });

  return {
    exports: context.__adminPanelTestExports,
    storage,
    elements,
    context,
  };
}

describe("admin-panel helper functions", () => {
  it("sanitizes ADB serials and APK paths safely", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(exports.sanitizeAdbSerial("emulator-5554")).toBe("emulator-5554");
    expect(exports.sanitizeAdbSerial("serial;rm -rf /")).toBe("");
    expect(exports.sanitizeApkPath("builds/app-release.apk", "fallback.apk")).toBe("builds/app-release.apk");
    expect(exports.sanitizeApkPath("bad\npath.apk", "fallback.apk")).toBe("fallback.apk");
  });

  it("builds PowerShell deploy scripts with project scoping", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(exports.buildDeployCommand("demo-project")).toContain("--project demo-project");
    expect(exports.buildPowerShellScript("firebase deploy", "C:/MiniMaster")).toContain("Set-Location -Path \"C:/MiniMaster\"");
  });

  it("tracks commissioning attestations and missing checklist items", () => {
    const { exports, storage } = loadAdminPanelTestExports();

    exports.updateCommissioningAttestations({ "firebase-auth-enabled": true, "messaging-enabled": true });
    const missing = exports.getMissingAttestations();

    expect(JSON.parse(storage.get("operatorCommissioningAttestations") || "{}")).toMatchObject({
      "firebase-auth-enabled": true,
      "messaging-enabled": true,
    });
    expect(missing).not.toContain("Firebase Authentication aktiviert");
    expect(missing).not.toContain("Cloud Messaging aktiviert oder bewusst nicht benötigt");
    expect(missing).toContain("Parent Web Panel Login geprüft");
  });

  it("prefers QA evidence over stale local attestation state", () => {
    const { exports } = loadAdminPanelTestExports({
      operatorCommissioningAttestations: JSON.stringify({ "parent-panel-verified": true }),
    });

    exports.setPythonAutomationEvidenceCache({
      entries: [],
      latestByTestId: {
        "parent-panel-verified": {
          status: "fail",
          createdAt: "2026-04-04T10:00:00Z",
        },
      },
    });

    const attestations = exports.getCommissioningAttestations();
    const missing = exports.getMissingAttestations();

    expect(attestations["parent-panel-verified"]).toBe(false);
    expect(missing).toContain("Parent Web Panel Login geprüft");
  });

  it("renders a commissioning snapshot into the report", () => {
    const { exports, elements } = loadAdminPanelTestExports({
      operatorCommissioningAttestations: JSON.stringify({ "firebase-auth-enabled": true }),
    });
    const reportEl = { innerHTML: "" };
    elements.set("commissioning-report", reportEl);

    const report = {
      projectId: "demo-project",
      firebaseConfigured: true,
      webControlConfigured: true,
      runtimeConfigured: true,
      validationSummary: { ok: 8, warn: 1, errorCount: 0 },
      deployCommand: "firebase deploy --only functions --project demo-project",
      roleAssignments: [{ uid: "support-1", role: "support" }],
      attestations: { "firebase-auth-enabled": true, "messaging-enabled": true },
      qaApprovals: [
        { id: "firebase-auth-enabled", title: "Firebase Authentication aktiviert", automationType: "manual", status: "pass" },
        { id: "firestore-enabled", title: "Firestore aktiviert", automationType: "automatic", status: "pass" },
        { id: "service-account-ready", title: "serviceAccountKey.json lokal für setup-admin verfügbar", automationType: "automatic", status: "not_run" },
      ],
      pending: ["QA-Freigabe offen: serviceAccountKey.json lokal für setup-admin verfügbar"],
    };

    const snapshot = exports.buildCommissioningSnapshot(report);
    exports.renderCommissioningReport(report);

    expect(snapshot.confirmedAttestations).toBe(2);
    expect(snapshot.totalApprovals).toBe(3);
    expect(snapshot.openApprovals).toBe(1);
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.validationState).toContain("Warnungen");
    expect(reportEl.innerHTML).toContain("Bestätigte Freigaben:");
    expect(reportEl.innerHTML).toContain("2 / 3");
    expect(reportEl.innerHTML).toContain("Aktualisiert:");
    expect(reportEl.innerHTML).toContain("demo-project");
  });

  // ── escapePowerShellString ──
  it("escapes backticks and double quotes for PowerShell", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.escapePowerShellString("hello \"world\"")).toBe("hello `\"world`\"");
    expect(exports.escapePowerShellString("back`tick")).toBe("back``tick");
    expect(exports.escapePowerShellString("")).toBe("");
    expect(exports.escapePowerShellString(null)).toBe("");
    expect(exports.escapePowerShellString(undefined)).toBe("");
  });

  // ── encodeCommandPayload / decodeCommandPayload ──
  it("round-trips command payloads through encode/decode", () => {
    const { exports } = loadAdminPanelTestExports();
    const payload = { command: "firebase deploy", cwd: "/app", id: "deploy-1" };
    const encoded = exports.encodeCommandPayload(payload);
    expect(typeof encoded).toBe("string");
    const decoded = exports.decodeCommandPayload(encoded);
    expect(decoded).toEqual(payload);
  });

  // ── hasCompleteFirebaseConfig ──
  it("validates complete Firebase config objects", () => {
    const { exports } = loadAdminPanelTestExports();
    const validConfig = {
      apiKey: "AIzaSyTest",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
      storageBucket: "test.appspot.com",
      messagingSenderId: "123456",
      appId: "1:123:web:abc",
    };
    expect(exports.hasCompleteFirebaseConfig(validConfig)).toBe(true);
    expect(exports.hasCompleteFirebaseConfig(null)).toBe(false);
    expect(exports.hasCompleteFirebaseConfig({})).toBe(false);
    expect(exports.hasCompleteFirebaseConfig({ ...validConfig, apiKey: "" })).toBe(false);
    expect(exports.hasCompleteFirebaseConfig({ ...validConfig, apiKey: "  " })).toBe(false);
    expect(exports.hasCompleteFirebaseConfig("string")).toBe(false);
  });

  // ── isPlaceholderFirebaseConfig ──
  it("detects placeholder Firebase config values", () => {
    const { exports } = loadAdminPanelTestExports();
    const realConfig = {
      apiKey: "AIzaSyTest",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
      storageBucket: "test.appspot.com",
      messagingSenderId: "123456",
      appId: "1:123:web:abc",
    };
    expect(exports.isPlaceholderFirebaseConfig(realConfig)).toBe(false);
    expect(exports.isPlaceholderFirebaseConfig({ ...realConfig, projectId: "your-project-id" })).toBe(true);
    expect(exports.isPlaceholderFirebaseConfig({ ...realConfig, apiKey: "your_project_key" })).toBe(true);
    expect(exports.isPlaceholderFirebaseConfig(null)).toBe(true);
    expect(exports.isPlaceholderFirebaseConfig({})).toBe(true);
  });

  // ── normalizeBootstrapFirebaseConfig ──
  it("normalizes and trims Firebase config fields", () => {
    const { exports } = loadAdminPanelTestExports();
    const raw = {
      apiKey: "  AIzaSy  ",
      authDomain: " test.firebaseapp.com ",
      projectId: "  test ",
      storageBucket: " bucket ",
      messagingSenderId: " 123 ",
      appId: " app ",
    };
    const result = exports.normalizeBootstrapFirebaseConfig(raw);
    expect(result).toEqual({
      apiKey: "AIzaSy",
      authDomain: "test.firebaseapp.com",
      projectId: "test",
      storageBucket: "bucket",
      messagingSenderId: "123",
      appId: "app",
    });
    expect(exports.normalizeBootstrapFirebaseConfig(null)).toBeNull();
    expect(exports.normalizeBootstrapFirebaseConfig("string")).toBeNull();
  });

  // ── extractFirebaseConfigFromText ──
  it("extracts Firebase config from JSON text", () => {
    const { exports } = loadAdminPanelTestExports();
    const jsonText = JSON.stringify({
      apiKey: "AIzaSyTest",
      authDomain: "test.firebaseapp.com",
      projectId: "test-project",
      storageBucket: "test.appspot.com",
      messagingSenderId: "123456",
      appId: "1:123:web:abc",
    });
    const result = exports.extractFirebaseConfigFromText(`const config = ${jsonText};`);
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe("test-project");

    expect(exports.extractFirebaseConfigFromText("")).toBeNull();
    expect(exports.extractFirebaseConfigFromText(null as any)).toBeNull();
    expect(exports.extractFirebaseConfigFromText("no-json-here")).toBeNull();
  });

  // ── extractFirebaseConfigFromText with JS object literal ──
  it("extracts Firebase config from JS object literal syntax", () => {
    const { exports } = loadAdminPanelTestExports();
    const jsLiteral = `const config = {
      apiKey: 'AIzaSyTest',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      storageBucket: 'test.appspot.com',
      messagingSenderId: '123456',
      appId: '1:123:web:abc'
    };`;
    const result = exports.extractFirebaseConfigFromText(jsLiteral);
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("AIzaSyTest");
  });

  // ── extractFirebaseConfigFromGoogleServices ──
  it("extracts Firebase config from google-services.json format", () => {
    const { exports } = loadAdminPanelTestExports();
    const googleServices = {
      project_info: {
        project_id: "test-project",
        storage_bucket: "test.appspot.com",
        project_number: "123456",
      },
      client: [{
        client_info: {
          mobilesdk_app_id: "1:123:android:abc",
          android_client_info: { package_name: "com.google.pairing" },
        },
        api_key: [{ current_key: "AIzaSyTest" }],
      }],
    };
    const meta: any = {};
    const result = exports.extractFirebaseConfigFromGoogleServices(googleServices, meta);
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe("test-project");
    expect(result!.authDomain).toBe("test-project.firebaseapp.com");
    expect(meta.format).toBe("google-services.json");
    expect(meta.packageName).toBe("com.google.pairing");

    expect(exports.extractFirebaseConfigFromGoogleServices(null)).toBeNull();
    expect(exports.extractFirebaseConfigFromGoogleServices({ project_info: null, client: [] })).toBeNull();
  });

  // ── isPlaceholderProjectId ──
  it("detects placeholder project IDs", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.isPlaceholderProjectId("your-project-id")).toBe(true);
    expect(exports.isPlaceholderProjectId("")).toBe(true);
    expect(exports.isPlaceholderProjectId(null)).toBe(true);
    expect(exports.isPlaceholderProjectId(undefined)).toBe(true);
    expect(exports.isPlaceholderProjectId("my-real-project")).toBe(false);
  });

  // ── formatPythonAutomationStatus ──
  it("maps Python automation status codes to labels", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.formatPythonAutomationStatus("pass")).toBe("✅ PASS");
    expect(exports.formatPythonAutomationStatus("manual_required")).toBe("🟡 NACHWEIS OFFEN");
    expect(exports.formatPythonAutomationStatus("fail")).toBe("❌ FAIL");
    expect(exports.formatPythonAutomationStatus("not_run")).toBe("⏸ NOCH NICHT GELAUFEN");
    expect(exports.formatPythonAutomationStatus("unknown")).toBe("ℹ️ UNBEKANNT");
  });

  // ── getPythonAutomationStatusMeta ──
  it("returns status meta with label, className and cardClass", () => {
    const { exports } = loadAdminPanelTestExports();
    const pass = exports.getPythonAutomationStatusMeta("pass");
    expect(pass.label).toBe("PASS");
    expect(pass.className).toBe("python-status-pass");
    expect(pass.cardClass).toBe("status-pass");

    const manual = exports.getPythonAutomationStatusMeta("manual_required");
  expect(manual.label).toBe("NACHWEIS OFFEN");

    const fail = exports.getPythonAutomationStatusMeta("fail");
    expect(fail.label).toBe("FAIL");

    const other = exports.getPythonAutomationStatusMeta("something");
    expect(other.label).toBe("OFFEN");
    expect(other.cardClass).toBe("status-not_run");
  });

  // ── formatPythonAutomationType / getPythonAutomationTypeChipClass ──
  it("maps Python automation types to labels and CSS classes", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.formatPythonAutomationType("command")).toBe("Lokales Gate-Kommando");
    expect(exports.formatPythonAutomationType("documented")).toBe("Dokumentierter Testplan");
    expect(exports.formatPythonAutomationType("manual")).toBe("Manueller Nachweis");
    expect(exports.formatPythonAutomationType("auto")).toBe("Automatisch bewertet");

    expect(exports.getPythonAutomationTypeChipClass("command")).toBe("python-automation-chip-command");
    expect(exports.getPythonAutomationTypeChipClass("documented")).toBe("python-automation-chip-documented");
    expect(exports.getPythonAutomationTypeChipClass("manual")).toBe("python-automation-chip-manual");
    expect(exports.getPythonAutomationTypeChipClass("auto")).toBe("python-automation-chip-auto");
  });

  // ── getPriorityWeight ──
  it("returns correct priority weights for severity levels", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.getPriorityWeight("critical")).toBe(300);
    expect(exports.getPriorityWeight("high")).toBe(200);
    expect(exports.getPriorityWeight("medium")).toBe(100);
    expect(exports.getPriorityWeight("low")).toBe(50);
    expect(exports.getPriorityWeight("")).toBe(50);
  });

  // ── buildKeyFingerprint ──
  it("formats key hashes as fingerprint strings", () => {
    const { exports } = loadAdminPanelTestExports();
    const hash64 = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    expect(exports.buildKeyFingerprint(hash64)).toBe("a1b2c3d4e5f6...e5f6a1b2");
    expect(exports.buildKeyFingerprint("tooshort")).toBe("unbekannt");
    expect(exports.buildKeyFingerprint("")).toBe("unbekannt");
    expect(exports.buildKeyFingerprint(null)).toBe("unbekannt");
  });

  // ── toBase64Url ──
  it("encodes byte arrays to base64url", () => {
    const { exports } = loadAdminPanelTestExports();
    const bytes = [72, 101, 108, 108, 111]; // "Hello"
    const result = exports.toBase64Url(bytes);
    expect(result).toBe("SGVsbG8");
    expect(result).not.toContain("+");
    expect(result).not.toContain("/");
    expect(result).not.toContain("=");
  });

  // ── normalizeCallableErrorCode / normalizeAuthErrorCode ──
  it("normalizes callable and auth error codes", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.normalizeCallableErrorCode({ code: "functions/not-found" })).toBe("not-found");
    expect(exports.normalizeCallableErrorCode({ code: "permission-denied" })).toBe("permission-denied");
    expect(exports.normalizeCallableErrorCode({ code: "  Functions/INTERNAL " })).toBe("internal");
    expect(exports.normalizeCallableErrorCode({})).toBe("");
    expect(exports.normalizeCallableErrorCode(null)).toBe("");

    expect(exports.normalizeAuthErrorCode({ code: "functions/unauthenticated" })).toBe("unauthenticated");
    expect(exports.normalizeAuthErrorCode({ code: "auth/wrong-password" })).toBe("auth/wrong-password");
    expect(exports.normalizeAuthErrorCode({})).toBe("");
  });

  // ── getAccessKeyErrorHint ──
  it("returns appropriate error hints for access key errors", () => {
    const { exports } = loadAdminPanelTestExports();
    const invalid = exports.getAccessKeyErrorHint({ code: "functions/invalid-argument" }, "bad input");
    expect(invalid.title).toBe("Ungültige Eingabe");
    expect(invalid.tip).toBeTruthy();

    const expired = exports.getAccessKeyErrorHint({ code: "deadline-exceeded" }, "");
    expect(expired.title).toBe("Schlüssel abgelaufen");

    const jsonError = exports.getAccessKeyErrorHint({}, "Unexpected token < in JSON");
    expect(jsonError.title).toBe("Dateiformat ungültig");

    const unknown = exports.getAccessKeyErrorHint({ code: "some-random-code" }, "oops");
    expect(unknown.title).toBe("Allgemeiner Fehler");
  });

  // ── getAuthErrorHint ──
  it("returns appropriate error hints for auth errors", () => {
    const { exports } = loadAdminPanelTestExports();
    const emailUsed = exports.getAuthErrorHint({ code: "auth/email-already-in-use" }, "", "registration");
    expect(emailUsed.title).toBe("E-Mail bereits vergeben");

    const weakPwd = exports.getAuthErrorHint({ code: "auth/weak-password" }, "", "registration");
    expect(weakPwd.title).toBe("Passwort zu schwach");

    const jsonBroken = exports.getAuthErrorHint({}, "Unexpected token", "login");
    expect(jsonBroken.title).toBe("Datenformat ungültig");

    const scopeFallback = exports.getAuthErrorHint({ code: "some/unknown" }, "", "login");
    expect(scopeFallback.title).toBe("Anmeldung fehlgeschlagen");

    const regFallback = exports.getAuthErrorHint({ code: "nope" }, "", "registration");
    expect(regFallback.title).toBe("Registrierung fehlgeschlagen");

    const genericFallback = exports.getAuthErrorHint({ code: "nope" }, "", undefined);
    expect(genericFallback.title).toBe("Allgemeiner Fehler");
  });

  // ── formatAuthDebugCode ──
  it("formats authentication debug code as HTML", () => {
    const { exports } = loadAdminPanelTestExports();
    const result = exports.formatAuthDebugCode({ code: "auth/wrong-password" });
    expect(result).toContain("<code>");
    expect(result).toContain("Technischer Fehlercode");
    expect(exports.formatAuthDebugCode({})).toBe("");
    expect(exports.formatAuthDebugCode(null)).toBe("");
  });

  // ── safeDebugStringify ──
  it("safely stringifies values with fallback", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.safeDebugStringify({ a: 1 })).toBe("{\n  \"a\": 1\n}");
    expect(exports.safeDebugStringify("text")).toBe("\"text\"");

    const circular: any = {};
    circular.self = circular;
    expect(exports.safeDebugStringify(circular)).toBe("[object Object]");
  });

  // ── formatPythonAutomationTimestamp ──
  it("formats timestamps in de-DE locale or returns fallback", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.formatPythonAutomationTimestamp(null)).toBe("noch nicht protokolliert");
    expect(exports.formatPythonAutomationTimestamp("")).toBe("noch nicht protokolliert");
    expect(exports.formatPythonAutomationTimestamp("not-a-date")).toBe("not-a-date");
    const formatted = exports.formatPythonAutomationTimestamp("2025-06-15T10:30:00Z");
    expect(formatted).toBeTruthy();
    expect(formatted).not.toBe("noch nicht protokolliert");
  });

  // ── formatPythonAutomationEvidenceDetails ──
  it("builds evidence detail strings from entry objects", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.formatPythonAutomationEvidenceDetails(null)).toBe("");
    expect(exports.formatPythonAutomationEvidenceDetails({})).toBe("");
    expect(exports.formatPythonAutomationEvidenceDetails({ operator: "Admin" })).toBe("durch Admin");
    expect(exports.formatPythonAutomationEvidenceDetails({
      operator: "Admin",
      evidenceRef: "EV-001",
      notes: "Alles ok",
    })).toBe("durch Admin · Evidenz EV-001 · Alles ok");
    expect(exports.formatPythonAutomationEvidenceDetails({
      evidenceRef: "REF",
    })).toBe("Evidenz REF");
  });

  // ── buildPythonAutomationRunIndex ──
  it("builds a run index Map from evaluation checks and commands", () => {
    const { exports } = loadAdminPanelTestExports();
    const run = {
      finishedAt: "2025-06-15T12:00:00Z",
      startedAt: "2025-06-15T11:50:00Z",
      evaluation: {
        checks: [
          { id: "chk-1", status: "pass", details: "OK" },
          { id: "chk-2", status: "fail", details: "Missing" },
          { id: null },
        ],
      },
      commands: {
        results: [
          { id: "cmd-1", status: "pass", code: 0, output: "done" },
          { id: "cmd-2", status: "fail", code: 1 },
        ],
      },
    };

    const index = exports.buildPythonAutomationRunIndex(run);
    expect(typeof index.get).toBe("function");
    expect(index.get("chk-1").status).toBe("pass");
    expect(index.get("chk-2").details).toBe("Missing");
    expect(index.get("cmd-1").source).toBe("command");
    expect(index.get("cmd-1").details).toContain("Exit-Code 0");
    expect(index.get("cmd-2").details).toContain("Exit-Code 1");
    expect(index.has(null)).toBe(false);

    const emptyIndex = exports.buildPythonAutomationRunIndex(null);
    expect(typeof emptyIndex.get).toBe("function");
    expect(emptyIndex.size).toBe(0);
  });

  // ── buildFirebaseRecoveryCommands / buildFirebaseRecoveryScript ──
  it("builds Firebase recovery commands for a project", () => {
    const { exports } = loadAdminPanelTestExports();
    const cmds = exports.buildFirebaseRecoveryCommands("my-project");
    expect(cmds).toHaveLength(4);
    expect(cmds[0]).toBe("npm install");
    expect(cmds[1]).toContain("my-project");
    expect(cmds[2]).toContain("firestore:rules");
    expect(cmds[3]).toContain("functions");

    const script = exports.buildFirebaseRecoveryScript("my-project");
    expect(script).toContain("npm install");
    expect(script).toContain("my-project");
    expect(script.split("\n")).toHaveLength(4);
  });

  // ── isRetryableFirebaseQueueConflict ──
  it("detects retryable Firebase deploy 409 conflicts", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.isRetryableFirebaseQueueConflict("firebase deploy", "HTTP Error: 409", 1)).toBe(true);
    expect(exports.isRetryableFirebaseQueueConflict("firebase deploy --only functions", "Unable to queue the operation", 1)).toBe(true);
    expect(exports.isRetryableFirebaseQueueConflict("firebase deploy", "HTTP Error: 409", 0)).toBe(false);
    expect(exports.isRetryableFirebaseQueueConflict("npm install", "HTTP Error: 409", 1)).toBe(false);
    expect(exports.isRetryableFirebaseQueueConflict("firebase deploy", "Success", 1)).toBe(false);
  });

  // ── renderCallableDebugInfo ──
  it("renders callable debug info HTML with error details", () => {
    const { exports } = loadAdminPanelTestExports();
    // escapeHtml uses DOM textContent→innerHTML which is a no-op in mock,
    // so we verify structure rather than escaped content
    const html = exports.renderCallableDebugInfo(
      { code: "functions/not-found", message: "Doc missing", details: { docId: "abc" } },
      { functionName: "getChild", requestId: "req-123" },
    );
    expect(html).toContain("Debug-Info");
    expect(html).toContain("Funktion:");
    expect(html).toContain("Request-ID:");
    expect(html).toContain("Fehlercode (normalisiert):");
    expect(html).toContain("Server-Details");

    const minimal = exports.renderCallableDebugInfo({});
    expect(minimal).toContain("Debug-Info");
    expect(minimal).not.toContain("Server-Details");
  });

  // ── buildPlausibilityFindings ──
  it("detects cross-platform plausibility inconsistencies", () => {
    const { exports } = loadAdminPanelTestExports();

    // lock/unlock without accessibility → error
    const findings1 = exports.buildPlausibilityFindings(
      {},
      { "ma-lock-unlock": true },
      {},
      {},
    );
    expect(findings1.some((f: any) => f.severity === "error" && f.text.includes("AccessibilityService"))).toBe(true);

    // app-blocking without overlay security → error
    const findings2 = exports.buildPlausibilityFindings(
      {},
      { "ca-app-blocking-effective": true },
      {},
      {},
    );
    expect(findings2.some((f: any) => f.severity === "error" && f.text.includes("Overlay"))).toBe(true);
    expect(findings2.some((f: any) => f.severity === "error" && f.text.includes("Deinstallationsschutz"))).toBe(true);

    // accessibility without settings protection → error
    const findings3 = exports.buildPlausibilityFindings(
      {},
      { "ca-accessibility-active": true },
      {},
      {},
    );
    expect(findings3.some((f: any) => f.severity === "error" && f.text.includes("Settings-Schutz"))).toBe(true);

    // auto-update without code-signing → error
    const findings4 = exports.buildPlausibilityFindings(
      {},
      { "dt-auto-update": true },
      {},
      {},
    );
    expect(findings4.some((f: any) => f.severity === "error" && f.text.includes("Code-Signing"))).toBe(true);

    // AI provider without keyRef → warning
    const findings5 = exports.buildPlausibilityFindings(
      {},
      {},
      { ai: { provider: "gemini" } },
      {},
    );
    expect(findings5.some((f: any) => f.severity === "warn" && f.text.includes("Secret-Referenz"))).toBe(true);

    // all consistent → ok
    const findings6 = exports.buildPlausibilityFindings({}, {}, {}, {});
    expect(findings6).toHaveLength(1);
    expect(findings6[0].severity).toBe("ok");
  });

  it("detects attestation vs platform state mismatches", () => {
    const { exports } = loadAdminPanelTestExports();
    const findings = exports.buildPlausibilityFindings(
      {
        "android-master-registered": true,
        "android-child-registered": true,
        "parent-panel-verified": true,
        "device-sync-verified": true,
      },
      {},
      {},
      {},
    );
    expect(findings.filter((f: any) => f.severity === "warn").length).toBeGreaterThanOrEqual(4);
    expect(findings.some((f: any) => f.text.includes("Registrierungs-Flow"))).toBe(true);
    expect(findings.some((f: any) => f.text.includes("Pairing-Flow"))).toBe(true);
    expect(findings.some((f: any) => f.text.includes("Desktop-Login"))).toBe(true);
    expect(findings.some((f: any) => f.text.includes("FCM-Sync"))).toBe(true);
  });

  it("detects FCM chain break and subscription enforcement gap", () => {
    const { exports } = loadAdminPanelTestExports();
    const findings = exports.buildPlausibilityFindings(
      {},
      { "ma-fcm-working": true, "ma-subscription-check": true },
      {},
      {},
    );
    expect(findings.some((f: any) => f.severity === "error" && f.text.includes("Push-Kette"))).toBe(true);
    expect(findings.some((f: any) => f.severity === "warn" && f.text.includes("Free-Tier-Limit"))).toBe(true);
  });

  it("detects desktop credential security gap", () => {
    const { exports } = loadAdminPanelTestExports();
    const findings = exports.buildPlausibilityFindings(
      {},
      { "dt-parent-panel-login": true },
      {},
      {},
    );
    expect(findings.some((f: any) => f.severity === "error" && f.text.includes("Credentials unsicher"))).toBe(true);
  });

  // ── computeGoLiveStatusFromData ──
  it("returns red ampel when backend validation is missing", () => {
    const { exports } = loadAdminPanelTestExports();
    const result = exports.computeGoLiveStatusFromData(
      ["Missing item"],
      {},
      { checks: {}, privacyUrl: "", supportEmail: "" },
      null,
    );
    expect(result.ampel).toBe("red");
    expect(result.backendReady).toBe(false);
    expect(result.allAttestationsOk).toBe(false);
  });

  it("returns red ampel when critical platform items are open", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      errorCount: 0,
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true },
    };
    const result = exports.computeGoLiveStatusFromData(
      [],
      {}, // no platform items done
      { checks: {}, privacyUrl: "", supportEmail: "" },
      validation,
    );
    expect(result.ampel).toBe("red");
    expect(result.backendReady).toBe(true);
    expect(result.ampelDescription).toContain("kritische");
  });

  it("returns yellow ampel when backend + critical OK but high items open", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      errorCount: 0,
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true },
    };
    // mark all critical platform items as done, but leave high/medium undone
    const platformState: Record<string, boolean> = {};
    for (const platform of Object.values(exports.platformReadinessItems)) {
      for (const item of (platform as any).items) {
        if (item.severity === "critical") {
          platformState[item.key] = true;
        }
      }
    }
    const playStore = {
      checks: { dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true },
      privacyUrl: "https://example.com/privacy",
      supportEmail: "support@example.com",
    };
    const result = exports.computeGoLiveStatusFromData([], platformState, playStore, validation);
    expect(result.ampel).toBe("yellow");
    expect(result.ampelLabel).toBe("Teilweise bereit");
  });

  it("returns green ampel when everything is complete", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      errorCount: 0,
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true },
    };
    const platformState: Record<string, boolean> = {};
    for (const platform of Object.values(exports.platformReadinessItems)) {
      for (const item of (platform as any).items) {
        platformState[item.key] = true;
      }
    }
    const playStore = {
      checks: { dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true },
      privacyUrl: "https://example.com/privacy",
      supportEmail: "support@example.com",
    };
    const result = exports.computeGoLiveStatusFromData([], platformState, playStore, validation);
    expect(result.ampel).toBe("green");
    expect(result.ampelLabel).toBe("Go-Live freigegeben");
    expect(result.playStoreReady).toBe(true);
    expect(result.totals.doneAll).toBe(result.totals.totalAll);
  });

  it("returns yellow with play store hint when play store not ready", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      errorCount: 0,
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true },
    };
    const platformState: Record<string, boolean> = {};
    for (const platform of Object.values(exports.platformReadinessItems)) {
      for (const item of (platform as any).items) {
        platformState[item.key] = true;
      }
    }
    const playStore = {
      checks: { dataSafety: true },
      privacyUrl: "",
      supportEmail: "",
    };
    const result = exports.computeGoLiveStatusFromData([], platformState, playStore, validation);
    expect(result.ampel).toBe("yellow");
    expect(result.playStoreReady).toBe(false);
    expect(result.ampelDescription).toContain("Play-Store");
  });

  it("builds platform QA readiness summary from testing register items", () => {
    const { exports } = loadAdminPanelTestExports();
    const summary = exports.buildPlatformQaReadinessSummary({
      items: [
        { id: "static-ma-proguard-enabled", groupId: "static-readiness-masterapp", severity: "critical", status: "pass" },
        { id: "ma-task-create", groupId: "functional-readiness-masterapp", severity: "high", status: "not_run" },
        { id: "ca-fcm-sync", groupId: "functional-readiness-childapp", severity: "critical", status: "manual_required" },
        { id: "static-dt-csp", groupId: "static-readiness-desktop", severity: "critical", status: "pass" },
      ],
    });

    expect(summary.hasData).toBe(true);
    expect(summary.platformStatus.masterApp.total).toBe(2);
    expect(summary.platformStatus.masterApp.done).toBe(1);
    expect(summary.platformStatus.masterApp.critical).toBe(1);
    expect(summary.platformStatus.masterApp.high).toBe(1);
    expect(summary.platformStatus.childApp.total).toBe(1);
    expect(summary.platformStatus.childApp.done).toBe(0);
    expect(summary.platformStatus.desktop.total).toBe(1);
    expect(summary.totals.totalAll).toBe(4);
    expect(summary.totals.doneAll).toBe(2);
    expect(summary.totals.totalCritical).toBe(3);
    expect(summary.totals.doneCritical).toBe(2);
  });

  // ── Wizard State (localStorage-basiert) ──
  it("manages wizard state through localStorage", () => {
    const { exports } = loadAdminPanelTestExports();
    const initial = exports.getWizardState("masterApp");
    expect(initial).toEqual({ currentStep: 0, completed: {} });

    exports.saveWizardState("masterApp", { currentStep: 2, completed: { 0: true, 1: true } });
    const saved = exports.getWizardState("masterApp");
    expect(saved.currentStep).toBe(2);
    expect(saved.completed[0]).toBe(true);
    expect(saved.completed[1]).toBe(true);

    const other = exports.getWizardState("childApp");
    expect(other).toEqual({ currentStep: 0, completed: {} });
  });

  // ── Platform readiness state ──
  it("manages platform readiness through localStorage", () => {
    const { exports } = loadAdminPanelTestExports();
    const initial = exports.getPlatformReadiness();
    expect(initial).toEqual({});

    exports.updatePlatformReadiness({ "ma-registration-flow": true, "ma-pairing-works": true });
    const updated = exports.getPlatformReadiness();
    expect(updated["ma-registration-flow"]).toBe(true);
    expect(updated["ma-pairing-works"]).toBe(true);
  });

  // ── PlayStore readiness state ──
  it("manages Play Store readiness state through localStorage", () => {
    const { exports } = loadAdminPanelTestExports();
    const initial = exports.getPlayStoreReadinessState();
    expect(initial.checks.dataSafety).toBe(false);
    expect(initial.privacyUrl).toBe("");

    exports.setPlayStoreReadinessState({
      checks: { dataSafety: true, iarc: false, listing: false, privacyUrlLinked: false, permissionsDeclaration: false, appAccessGuide: false, securityRotationDone: false, goNoGoSignedOff: false },
      privacyUrl: "https://example.com/privacy",
      supportEmail: "test@example.com",
      listingUrl: "",
      releaseNotes: "",
      updatedAt: null,
    });
    const updated = exports.getPlayStoreReadinessState();
    expect(updated.checks.dataSafety).toBe(true);
    expect(updated.privacyUrl).toBe("https://example.com/privacy");
  });

  // ── buildPythonEvidenceFilterToolbar ──
  it("builds evidence filter toolbar HTML from entries", () => {
    const { exports } = loadAdminPanelTestExports();
    const entries = [
      { testId: "test-1", testTitle: "Prüffall A" },
      { testId: "test-2", testTitle: "Prüffall B" },
      { testId: "test-1", testTitle: "Prüffall A" }, // duplicate
      { testId: null },
    ];
    const html = exports.buildPythonEvidenceFilterToolbar(entries);
    expect(html).toContain("python-evidence-filter-bar");
    expect(html).toContain("Alle");
    expect(html).toContain("Pass");
    expect(html).toContain("Fail");

    const emptyHtml = exports.buildPythonEvidenceFilterToolbar([]);
    expect(emptyHtml).toContain("python-evidence-filter-bar");

    const nullHtml = exports.buildPythonEvidenceFilterToolbar(null);
    expect(nullHtml).toContain("python-evidence-filter-bar");
  });

  // ── computeGoLiveStatus platform totals verification ──
  it("correctly counts platform items by severity", () => {
    const { exports } = loadAdminPanelTestExports();
    const result = exports.computeGoLiveStatusFromData(
      [],
      {},
      { checks: {}, privacyUrl: "", supportEmail: "" },
      null,
    );
    // Verify platform status has all 3 platforms
    expect(result.platformStatus.masterApp).toBeDefined();
    expect(result.platformStatus.childApp).toBeDefined();
    expect(result.platformStatus.desktop).toBeDefined();

    // All percents should be 0% since no items done
    expect(result.platformStatus.masterApp.percent).toBe(0);
    expect(result.platformStatus.childApp.percent).toBe(0);
    expect(result.platformStatus.desktop.percent).toBe(0);

    // Totals should be > 0
    expect(result.totals.totalAll).toBeGreaterThan(40);
    expect(result.totals.totalCritical).toBeGreaterThan(10);
    expect(result.totals.doneAll).toBe(0);
  });

  // ── buildCommandCatalog ──
  it("generates command catalog with sanitized parameters", () => {
    const { exports } = loadAdminPanelTestExports();
    const commands = exports.buildCommandCatalog("my-project");
    expect(Array.isArray(commands)).toBe(true);
    expect(commands.length).toBeGreaterThan(30);

    // Every entry must have required fields
    for (const cmd of commands) {
      expect(cmd.id).toBeDefined();
      expect(cmd.label).toBeDefined();
      expect(cmd.command).toBeDefined();
    }

    // Project suffix should appear in deploy commands
    const deployFull = commands.find((c: any) => c.id === "firebase-deploy-full");
    expect(deployFull).toBeDefined();
    expect(deployFull.command).toContain("my-project");

    // ADB commands should exist
    const adbDevices = commands.find((c: any) => c.id === "android-adb-devices");
    expect(adbDevices).toBeDefined();
    expect(adbDevices.command).toContain("adb devices");

    // Preflight installs
    const preflight = commands.find((c: any) => c.id === "preflight-install");
    expect(preflight.command).toContain("npm install");
    expect(preflight.command).toContain("npm test");
  });

  it("generates command catalog with fallback project from firebaseConfig", () => {
    const { exports } = loadAdminPanelTestExports();
    const commands = exports.buildCommandCatalog("");
    const deployFunctions = commands.find((c: any) => c.id === "firebase-deploy-functions");
    expect(deployFunctions).toBeDefined();
    // Falls back to firebaseConfig.projectId ("your-project-id")
    expect(deployFunctions.command).toContain("your-project-id");
  });

  // ── buildRolloutBundleScript ──
  it("builds rollout bundle script with header and command blocks", () => {
    const { exports } = loadAdminPanelTestExports();
    const script = exports.buildRolloutBundleScript("test-proj");
    expect(script).toContain("$ErrorActionPreference");
    expect(script).toContain("MiniMaster Rollout Bundle");
    expect(script).toContain("Set-Location");
    // Should contain command blocks from the catalog
    expect(script).toContain("Projekt vorbereiten");
    expect(script).toContain("Firebase CLI");
  });

  // ── buildPrioritizedActionPlanFromData ──
  it("generates empty action plan when everything is complete", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      checks: {
        adminAuthOk: true,
        functionsReachable: true,
        firestoreAccessOk: true,
        storageHealthOk: true,
        webControlConfigReady: true,
      },
    };
    const platformState: Record<string, boolean> = {};
    for (const platform of Object.values(exports.platformReadinessItems)) {
      for (const item of (platform as any).items) {
        platformState[item.key] = true;
      }
    }
    const playStore = {
      checks: { dataSafety: true, iarc: true, listing: true, privacyUrlLinked: true, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: true },
      privacyUrl: "https://example.com/privacy",
      supportEmail: "test@example.com",
    };
    const plan = exports.buildPrioritizedActionPlanFromData(validation, platformState, playStore, []);
    expect(plan).toHaveLength(0);
  });

  it("generates prioritized steps sorted by severity", () => {
    const { exports } = loadAdminPanelTestExports();
    const plan = exports.buildPrioritizedActionPlanFromData(
      null, // no validation → critical step
      {},   // no platform items → many steps
      { checks: {}, privacyUrl: "", supportEmail: "" }, // play store incomplete
      [{ key: "test-att", label: "Test Attestation" }], // one missing attestation
    );
    expect(plan.length).toBeGreaterThan(10);

    // First step must be critical (highest severity)
    expect(plan[0].severity).toBe("critical");
    expect(plan[0].order).toBe(1);

    // Must contain backend validation missing step
    expect(plan.some((s: any) => s.id === "backend-validation-missing")).toBe(true);

    // Must be deduplicated and ordered
    const ids = plan.map((s: any) => s.id);
    expect(ids.length).toBe(new Set(ids).size);

    // Verify severity ordering: critical before high before medium
    let lastWeight = Infinity;
    for (const step of plan) {
      const w = exports.getPriorityWeight(step.severity);
      expect(w).toBeLessThanOrEqual(lastWeight);
      if (w < lastWeight) lastWeight = w;
    }
  });

  it("action plan includes play store steps when checks missing", () => {
    const { exports } = loadAdminPanelTestExports();
    const validation = {
      checks: { adminAuthOk: true, functionsReachable: true, firestoreAccessOk: true, storageHealthOk: true, webControlConfigReady: true },
    };
    const platformState: Record<string, boolean> = {};
    for (const platform of Object.values(exports.platformReadinessItems)) {
      for (const item of (platform as any).items) {
        platformState[item.key] = true;
      }
    }
    const plan = exports.buildPrioritizedActionPlanFromData(
      validation,
      platformState,
      { checks: { dataSafety: false }, privacyUrl: "", supportEmail: "" },
      [],
    );
    expect(plan.some((s: any) => s.id === "playstore-dataSafety")).toBe(true);
    expect(plan.some((s: any) => s.id === "playstore-privacy-url-value")).toBe(true);
    expect(plan.some((s: any) => s.id === "playstore-support-email-value")).toBe(true);
  });

  // ── getP0BlockCompletion ──
  it("computes P0 blocker completion from state checks", () => {
    const { exports } = loadAdminPanelTestExports();
    const empty = exports.getP0BlockCompletion({ checks: {} });
    expect(empty.completedBlocks).toBe(0);
    expect(empty.totalBlocks).toBe(4);
    expect(empty.allDone).toBe(false);
    expect(empty.blocks.security).toBe(false);

    const partial = exports.getP0BlockCompletion({
      checks: {
        keyRotationDone: true,
        keyRestrictionsDone: true,
        rosterAssigned: true,
      },
    });
    expect(partial.blocks.security).toBe(true);
    expect(partial.blocks.roster).toBe(true);
    expect(partial.blocks.deviceValidation).toBe(false);
    expect(partial.blocks.releaseEvidence).toBe(false);
    expect(partial.completedBlocks).toBe(2);

    const full = exports.getP0BlockCompletion({
      checks: {
        keyRotationDone: true, keyRestrictionsDone: true,
        oemDeviceTests: true,
        rosterAssigned: true,
        legacyAuthSnapshot: true, codeqlLinked: true, androidCiLinked: true, deploymentReference: true,
      },
    });
    expect(full.allDone).toBe(true);
    expect(full.completedBlocks).toBe(4);
  });

  // ── P0 Blocker Cockpit State (localStorage) ──
  it("manages P0 blocker cockpit state through localStorage", () => {
    const { exports } = loadAdminPanelTestExports();
    const initial = exports.getP0BlockerCockpitState();
    expect(initial.checks.keyRotationDone).toBe(false);
    expect(initial.checks.rosterAssigned).toBe(false);
    expect(initial.notes).toBe("");

    exports.setP0BlockerCockpitState({
      checks: { ...initial.checks, keyRotationDone: true, rosterAssigned: true },
      keyEvidence: "Rotiert am 2026-03-20",
      notes: "Test",
      updatedAt: "2026-03-20T10:00:00Z",
    });
    const updated = exports.getP0BlockerCockpitState();
    expect(updated.checks.keyRotationDone).toBe(true);
    expect(updated.checks.rosterAssigned).toBe(true);
    expect(updated.keyEvidence).toBe("Rotiert am 2026-03-20");
    expect(updated.notes).toBe("Test");
  });

  // ── autoSyncP0FromExistingSignals ──
  it("syncs P0 blocker checks from Play Store and attestation signals", () => {
    const { exports } = loadAdminPanelTestExports();
    // Set up Play Store with some checks done
    exports.setPlayStoreReadinessState({
      checks: { dataSafety: true, iarc: true, listing: false, privacyUrlLinked: false, permissionsDeclaration: true, appAccessGuide: true, securityRotationDone: true, goNoGoSignedOff: false },
      privacyUrl: "https://example.com/p",
      supportEmail: "s@e.com",
    });

    const synced = exports.autoSyncP0FromExistingSignals();
    expect(synced.checks.keyRotationDone).toBe(true);
    expect(synced.checks.keyRestrictionsDone).toBe(true);
  });

  // ── loadCommandBuilderConfig ──
  it("loads command builder config with defaults from localStorage", () => {
    const { exports } = loadAdminPanelTestExports();
    const config = exports.loadCommandBuilderConfig();
    expect(config.workspacePath).toBe(exports.defaultCommandBuilderConfig.workspacePath);
    expect(config.masterApkPath).toContain("masterApp");
    expect(config.childApkPath).toContain("childApp");
  });

  it("merges stored command builder config with defaults", () => {
    const { exports } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({ workspacePath: "D:\\Custom\\Path", firstAdminEmail: "admin@test.de" }),
    });
    const config = exports.loadCommandBuilderConfig();
    expect(config.workspacePath).toBe("D:\\Custom\\Path");
    expect(config.firstAdminEmail).toBe("admin@test.de");
    // Defaults should still fill in the rest
    expect(config.masterApkPath).toContain("masterApp");
  });

  // ── getPythonAutomationTestStatus ──
  it("returns mapped status when run index has entry", () => {
    const { exports } = loadAdminPanelTestExports();
    const runIndex = new Map([["test-1", { status: "pass", details: "OK", source: "evaluation" }]]);
    const result = exports.getPythonAutomationTestStatus({ id: "test-1" }, {}, runIndex);
    expect(result.status).toBe("pass");
    expect(result.source).toBe("evaluation");
  });

  it("returns evidence status when no run index but evidence exists", () => {
    const { exports } = loadAdminPanelTestExports();
    exports.setPythonAutomationEvidenceCache({
      entries: [{ testId: "ev-1", status: "pass", details: "Manueller Nachweis" }],
      latestByTestId: { "ev-1": { testId: "ev-1", status: "pass", details: "Manueller Nachweis", createdAt: "2026-03-20" } },
    });
    const runIndex = new Map();
    const result = exports.getPythonAutomationTestStatus({ id: "ev-1" }, null, runIndex);
    expect(result.status).toBe("pass");
    expect(result.source).toBe("evidence");
    expect(result.evidence).toBeDefined();
  });

  it("returns not_run for documented tests without evidence", () => {
    const { exports } = loadAdminPanelTestExports();
    const runIndex = new Map();
    const result = exports.getPythonAutomationTestStatus(
      { id: "undocumented-1", automationType: "documented", source: "manual" },
      null,
      runIndex,
    );
    expect(result.status).toBe("not_run");
    expect(result.details).toContain("Dokumentierter Testplan");
  });

  it("returns not_run for command tests when commands not executed", () => {
    const { exports } = loadAdminPanelTestExports();
    const runIndex = new Map();
    const run = { commands: { executed: false }, finishedAt: "2026-03-20" };
    const result = exports.getPythonAutomationTestStatus(
      { id: "cmd-1", automationType: "command", source: "cli" },
      run,
      runIndex,
    );
    expect(result.status).toBe("not_run");
    expect(result.details).toContain("deaktiviert");
  });

  it("returns not_run with fallback for command tests when executed but not reached", () => {
    const { exports } = loadAdminPanelTestExports();
    const runIndex = new Map();
    const run = { commands: { executed: true }, finishedAt: "2026-03-20" };
    const result = exports.getPythonAutomationTestStatus(
      { id: "cmd-2", automationType: "command", source: "cli" },
      run,
      runIndex,
    );
    expect(result.status).toBe("not_run");
    expect(result.details).toContain("Fail-Fast");
  });

  it("prioritizes testing register statuses and severities", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(exports.getTestingRegisterStatusPriority("fail")).toBeLessThan(exports.getTestingRegisterStatusPriority("pass"));
    expect(exports.getTestingRegisterSeverityPriority("critical")).toBeLessThan(exports.getTestingRegisterSeverityPriority("medium"));
  });

  it("formats testing register metadata for group and detail display", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(
      exports.formatTestingRegisterGroupTitle({
        groupTitle: "Repo-Tests: Unsupported / Not Yet Mapped",
        groupId: "repo-tests-unsupported",
      }),
    ).toContain("Unsupported");

    const detail = exports.buildTestingRegisterDetailText({
      details: "Letzter Lauf fehlgeschlagen",
      environment: "android",
      linkedSuite: "android-usb-master",
      linkedCommand: "./gradlew :masterApp:connectedDebugAndroidTest",
      evidenceRequired: true,
      knownConstraints: "ADB erforderlich",
    });

    expect(detail).toContain("Umgebung: android");
    expect(detail).toContain("Suite: android-usb-master");
    expect(detail).toContain("Kommando");
    expect(detail).toContain("Evidenz erforderlich");
    expect(detail).toContain("ADB erforderlich");
  });

  it("builds testing register tooltip attributes, badges and legend", () => {
    const { exports } = loadAdminPanelTestExports();

    const tooltipAttr = exports.buildTestingRegisterTooltipAttr("Verknuepfte Suite starten", "Suite starten");
    expect(tooltipAttr).toContain("title=");
    expect(tooltipAttr).toContain("aria-label=");

    const badges = exports.buildTestingRegisterMetaBadges({
      severity: "critical",
      owner: "QA Automation",
      blockingForRelease: true,
      staleEvidence: true,
      groupId: "repo-tests-unsupported",
    });
    expect(badges).toContain("Prioritaet");
    expect(badges).toContain("Verantwortlich");
    expect(badges).toContain("Release-Blocker");
    expect(badges).toContain("Unsupported");

    const legend = exports.buildTestingRegisterLegend();
    expect(legend).toContain("Register-Legende");
    expect(legend).toContain("Owner");
  });

  it("explains testing register actions via tooltips", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(exports.buildTestingRegisterActionTooltip({ action: "protocol" })).toContain("Nachweis");
    expect(exports.buildTestingRegisterActionTooltip({ action: "suite-run", prereqsMet: false, prereqReason: "ADB fehlt" })).toContain("ADB fehlt");
    expect(exports.buildTestingRegisterActionTooltip({ action: "suite-run", linkedCommand: "npm test" })).toContain("npm test");
  });

  // ── findPythonAutomationTestById ──
  it("returns null for missing test id or empty catalog", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.findPythonAutomationTestById(null)).toBeNull();
    expect(exports.findPythonAutomationTestById("nonexistent")).toBeNull();
  });

  // ── commissioningAttestationItems constant ──
  it("has commissioning attestation items with required fields", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(Array.isArray(exports.commissioningAttestationItems)).toBe(true);
    expect(exports.commissioningAttestationItems.length).toBeGreaterThan(5);
    for (const item of exports.commissioningAttestationItems) {
      expect(item.key).toBeDefined();
      expect(item.label).toBeDefined();
      expect(typeof item.key).toBe("string");
      expect(typeof item.label).toBe("string");
    }
  });
});
