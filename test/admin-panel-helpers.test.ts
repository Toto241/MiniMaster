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

    exports.updateCommissioningAttestations({ "firebase-auth-enabled": true, "firestore-enabled": true });
    const missing = exports.getMissingAttestations();

    expect(JSON.parse(storage.get("operatorCommissioningAttestations") || "{}")).toMatchObject({
      "firebase-auth-enabled": true,
      "firestore-enabled": true,
    });
    expect(missing).not.toContain("Firebase Authentication aktiviert");
    expect(missing).toContain("Cloud Functions aktiviert");
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
      attestations: { "firebase-auth-enabled": true, "firestore-enabled": true },
      pending: ["Storage-Bucket prüfen"],
    };

    const snapshot = exports.buildCommissioningSnapshot(report);
    exports.renderCommissioningReport(report);

    expect(snapshot.confirmedAttestations).toBe(2);
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.validationState).toContain("Warnungen");
    expect(reportEl.innerHTML).toContain("Bestätigte Freigaben:");
    expect(reportEl.innerHTML).toContain("Aktualisiert:");
    expect(reportEl.innerHTML).toContain("demo-project");
  });

  // ── escapePowerShellString ──
  it("escapes backticks and double quotes for PowerShell", () => {
    const { exports } = loadAdminPanelTestExports();
    expect(exports.escapePowerShellString('hello "world"')).toBe('hello `"world`"');
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
    expect(exports.formatPythonAutomationStatus("manual_required")).toBe("🟡 MANUELL");
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
    expect(manual.label).toBe("MANUELL");

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
    expect(exports.safeDebugStringify({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(exports.safeDebugStringify("text")).toBe('"text"');

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
});
