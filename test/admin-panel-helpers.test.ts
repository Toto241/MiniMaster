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
    "  updateCommissioningAttestations",
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
});
