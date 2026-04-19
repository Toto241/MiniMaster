import { promises as fs } from "fs";
import * as path from "path";
import * as vm from "vm";

/**
 * Welle 1 / Top-Down Step 1:
 * Validiert die neue Modul-Infrastruktur unter admin-panel/modules/.
 * Statt nativer ESM-Imports (Jest haette dafuer extra Setup gebraucht) laden wir
 * die Module in einem VM-Kontext und uebersetzen `export`/`import` zu CommonJS-
 * artigen Wrappern. Das spiegelt den realen Browser-Effekt: jedes Modul
 * registriert sich auf window.MM.
 */

const MODULES_DIR = path.resolve(__dirname, "..", "admin-panel", "modules");

function rewriteAsCommonJS(source: string, baseDir: string): string {
  return source
    .replace(/^\s*import\s+["']([^"']+)["'];?\s*$/gm,
      (_m, spec) => `__loadRelative(${JSON.stringify(spec)});`)
    .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
      (_m, names, spec) => {
        const cleaned = String(names).split(",").map(n => n.trim()).filter(Boolean).join(", ");
        return `const { ${cleaned} } = __loadRelative(${JSON.stringify(spec)});`;
      })
    .replace(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)/gm,
      (_m, name) => `module.exports.${name} = function ${name}`)
    .replace(/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/gm,
      (_m, name) => `module.exports.${name} =`);
}

function makeLoader(globalScope: any) {
  const cache = new Map<string, any>();
  function load(absPath: string) {
    if (cache.has(absPath)) return cache.get(absPath);
    const source = require("fs").readFileSync(absPath, "utf8");
    const dir = path.dirname(absPath);
    const transformed = rewriteAsCommonJS(source, dir);
    const moduleObj: any = { exports: {} };
    const ctx = vm.createContext({
      module: moduleObj,
      console,
      window: globalScope,
      globalThis: globalScope,
      btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
      atob: (str: string) => Buffer.from(str, "base64").toString("binary"),
      __loadRelative: (spec: string) => {
        const next = path.resolve(dir, spec);
        return load(next);
      },
    });
    vm.runInContext(transformed, ctx, { filename: absPath });
    cache.set(absPath, moduleObj.exports);
    return moduleObj.exports;
  }
  return load;
}

describe("admin-panel module bootstrap (Welle 1)", () => {
  let globalScope: any;
  let load: (absPath: string) => any;

  beforeEach(() => {
    globalScope = {} as any;
    load = makeLoader(globalScope);
  });

  it("registry.js initialisiert window.MM mit register/get/list", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    expect(globalScope.MM).toBeDefined();
    expect(typeof globalScope.MM.register).toBe("function");
    expect(typeof globalScope.MM.get).toBe("function");
    expect(typeof globalScope.MM.list).toBe("function");
    expect(globalScope.MM.list()).toEqual([]);
  });

  it("sanitize.js registriert sich als window.MM.sanitize", () => {
    load(path.join(MODULES_DIR, "core", "sanitize.js"));
    expect(globalScope.MM.sanitize).toBeDefined();
    expect(globalScope.MM.list()).toContain("sanitize");
    expect(globalScope.MM.get("sanitize")).toBe(globalScope.MM.sanitize);
  });

  it("sanitize.adbSerial verhaelt sich identisch zur Original-Implementierung in app.js", () => {
    load(path.join(MODULES_DIR, "core", "sanitize.js"));
    const { adbSerial } = globalScope.MM.sanitize;
    expect(adbSerial("emulator-5554")).toBe("emulator-5554");
    expect(adbSerial("serial;rm -rf /")).toBe("");
    expect(adbSerial("")).toBe("");
    expect(adbSerial(undefined)).toBe("");
  });

  it("sanitize.apkPath verhaelt sich identisch zur Original-Implementierung in app.js", () => {
    load(path.join(MODULES_DIR, "core", "sanitize.js"));
    const { apkPath } = globalScope.MM.sanitize;
    expect(apkPath("builds/app-release.apk", "fallback.apk")).toBe("builds/app-release.apk");
    expect(apkPath("bad\npath.apk", "fallback.apk")).toBe("fallback.apk");
    expect(apkPath("", "fallback.apk")).toBe("fallback.apk");
    expect(apkPath("readme.md", "fallback.apk")).toBe("fallback.apk");
  });

  it("modules/index.js bootstrappt registry + sanitize + command + format + automationMeta + encoding gemeinsam", () => {
    load(path.join(MODULES_DIR, "index.js"));
    expect(globalScope.MM.list().sort()).toEqual([
      "automationMeta",
      "command",
      "commissioningPending",
      "commissioningQa",
      "cryptoDebug",
      "dates",
      "effectivePlatformState",
      "encoding",
      "errorCodes",
      "eventDelegation",
      "firebaseConfig",
      "firebaseDeployment",
      "firebaseRecovery",
      "format",
      "legalPlaystore",
      "navBootstrap",
      "operatorAssistant",
      "operatorConfig",
      "operatorEffective",
      "platformQaReadiness",
      "pythonAutomationActions",
      "qaTestingRegister",
      "sanitize",
      "security",
      "testingRegisterInsights",
      "testingRegisterPriorities",
    ]);
    expect(typeof globalScope.MM.bootstrappedAt).toBe("number");
  });

  it("command.js registriert sich und baut PowerShell-Skripte mit Stop-Preference", () => {
    load(path.join(MODULES_DIR, "core", "command.js"));
    const cmd = globalScope.MM.command;
    expect(cmd).toBeDefined();
    expect(cmd.buildPowerShellScript("Get-ChildItem", undefined)).toBe(
      [
        '$ErrorActionPreference = "Stop"',
        "Get-ChildItem",
      ].join("\n"),
    );
    expect(cmd.buildPowerShellScript("Get-ChildItem", "D:\\Tools\\MiniMaster")).toBe(
      [
        '$ErrorActionPreference = "Stop"',
        'Set-Location -Path "D:\\Tools\\MiniMaster"',
        "Get-ChildItem",
      ].join("\n"),
    );
  });

  it("command.js encode/decode ist roundtrip-stabil und URL-sicher", () => {
    load(path.join(MODULES_DIR, "core", "command.js"));
    const cmd = globalScope.MM.command;
    const payload = { id: "abc", text: "hallo & welt", list: [1, 2, 3] };
    const encoded = cmd.encodePayload(payload);
    expect(encoded).not.toMatch(/[\s&"']/);
    expect(cmd.decodePayload(encoded)).toEqual(payload);
  });

  it("command.js liefert identische Ergebnisse wie app.js (Paritaet)", () => {
    load(path.join(MODULES_DIR, "core", "command.js"));
    const cmd = globalScope.MM.command;
    // Nutze die existierenden Originalfunktionen aus app.js via Test-Harness.
    // Lazy-Require, um den schweren Harness-Setup-Overhead nur fuer diesen Test zu zahlen.
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const samples = [
      { command: "Get-ChildItem", cwd: undefined },
      { command: "npm test", cwd: "D:\\Tools\\MiniMaster" },
      { command: 'Write-Host "hi"', cwd: "C:/with spaces/path" },
    ];
    for (const sample of samples) {
      expect(cmd.buildPowerShellScript(sample.command, sample.cwd)).toBe(
        appJs.buildPowerShellScript(sample.command, sample.cwd),
      );
    }

    const payloads = [
      { a: 1 },
      { msg: "umlauts: aeoeue", n: 42 },
      { list: [1, "two", { nested: true }] },
    ];
    for (const p of payloads) {
      expect(cmd.encodePayload(p)).toBe(appJs.encodeCommandPayload(p));
      expect(cmd.decodePayload(appJs.encodeCommandPayload(p))).toEqual(p);
    }
  });

  it("format.js timestamp-Helper geben Fallbacks zurueck und akzeptieren ISO-Eingaben", () => {
    load(path.join(MODULES_DIR, "core", "format.js"));
    const fmt = globalScope.MM.format;
    expect(fmt).toBeDefined();
    expect(fmt.qaRefreshTimestamp(undefined)).toBe("noch nicht");
    expect(fmt.qaRefreshTimestamp("")).toBe("noch nicht");
    expect(fmt.pythonAutomationTimestamp(null)).toBe("noch nicht protokolliert");
    expect(fmt.timestamp("not-a-date", "fallback")).toBe("not-a-date");
    // valides Datum -> nicht leer und nicht der Fallback
    const formatted = fmt.timestamp("2026-04-18T10:00:00Z", "fallback");
    expect(formatted).not.toBe("fallback");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("format.pythonAutomationTimestamp ist paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "format.js"));
    const fmt = globalScope.MM.format;
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();
    const samples = [undefined, null, "", "2026-04-18T10:00:00Z", "broken"];
    for (const value of samples) {
      expect(fmt.pythonAutomationTimestamp(value)).toBe(
        appJs.formatPythonAutomationTimestamp(value),
      );
    }
  });

  it("automation-meta.js Status- und Typ-Helfer sind paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "automation-meta.js"));
    const meta = globalScope.MM.automationMeta;
    expect(meta).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const statusSamples = ["pass", "manual_required", "fail", "not_run", "weird", undefined];
    for (const status of statusSamples) {
      expect(meta.status(status)).toBe(appJs.formatPythonAutomationStatus(status));
      expect(meta.statusMeta(status)).toEqual(appJs.getPythonAutomationStatusMeta(status));
    }

    const typeSamples: Array<[string, string]> = [
      ["command", ""],
      ["documented", ""],
      ["manual", ""],
      ["", "repo-test"],
      ["", "device-suite"],
      ["", "static-analysis"],
      ["", "docs-validation"],
      ["", "playstore-readiness"],
      ["unknown", "unknown-source"],
    ];
    for (const [type, source] of typeSamples) {
      expect(meta.type(type, source)).toBe(appJs.formatPythonAutomationType(type, source));
      expect(meta.typeChipClass(type, source)).toBe(
        appJs.getPythonAutomationTypeChipClass(type, source),
      );
    }
  });

  it("encoding.js Helfer sind paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "encoding.js"));
    const enc = globalScope.MM.encoding;
    expect(enc).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const inlineSamples = [undefined, null, "", "abc", "hallo welt 'X'", "&=?#"];
    for (const value of inlineSamples) {
      expect(enc.encodeInlineArgument(value)).toBe(appJs.encodeInlineArgument(value));
      const encoded = enc.encodeInlineArgument(value);
      expect(enc.decodeInlineArgument(encoded)).toBe(appJs.decodeInlineArgument(encoded));
    }

    const debugSamples: any[] = [
      undefined,
      null,
      42,
      "string",
      { a: 1, b: [2, 3] },
    ];
    for (const value of debugSamples) {
      expect(enc.safeDebugStringify(value)).toBe(appJs.safeDebugStringify(value));
    }
    // toBase64Url: simple bytes -> URL-safe ohne Padding/Plus/Slash
    const bytes = new Uint8Array([0xff, 0xfb, 0x00, 0x10, 0x20]);
    expect(enc.toBase64Url(bytes)).toBe(appJs.toBase64Url(bytes));
    expect(enc.toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it("error-codes.js Normalisierung und Hint-Maps sind paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "error-codes.js"));
    const ec = globalScope.MM.errorCodes;
    expect(ec).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const codeSamples = [
      undefined,
      null,
      {},
      { code: "" },
      { code: "PERMISSION-DENIED" },
      { code: "functions/permission-denied" },
      { code: "auth/wrong-password" },
      { code: "  unauthenticated  " },
    ];
    for (const sample of codeSamples) {
      expect(ec.normalizeCallable(sample)).toBe(appJs.normalizeCallableErrorCode(sample));
      expect(ec.normalizeAuth(sample)).toBe(appJs.normalizeAuthErrorCode(sample));
    }

    const accessKeyCases: Array<[any, string | undefined]> = [
      [{ code: "invalid-argument" }, undefined],
      [{ code: "permission-denied" }, undefined],
      [{ code: "deadline-exceeded" }, undefined],
      [{ code: "internal" }, undefined],
      [{ code: "totally-unknown" }, undefined],
      [{}, "Unexpected token at position 1"],
      [{ code: "not-found" }, "JSON parse error"],
    ];
    for (const [error, fallback] of accessKeyCases) {
      expect(ec.accessKeyHint(error, fallback)).toEqual(
        appJs.getAccessKeyErrorHint(error, fallback),
      );
    }

    const authCases: Array<[any, string | undefined, string | undefined]> = [
      [{ code: "auth/wrong-password" }, undefined, "login"],
      [{ code: "auth/email-already-in-use" }, undefined, "registration"],
      [{ code: "permission-denied" }, undefined, "providerCheck"],
      [{ code: "totally-unknown" }, undefined, "reset"],
      [{ code: "totally-unknown" }, undefined, "unknownScope"],
      [{}, "Unexpected token in JSON", "login"],
    ];
    for (const [error, fallback, scope] of authCases) {
      expect(ec.authHint(error, fallback, scope)).toEqual(
        appJs.getAuthErrorHint(error, fallback, scope),
      );
    }
  });

  it("security.js buildKeyFingerprint ist paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "security.js"));
    const sec = globalScope.MM.security;
    expect(sec).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const samples = [
      "",
      undefined,
      null,
      "TOO-SHORT",
      "GGGG".repeat(16), // 64 chars but invalid hex
      "a".repeat(64),
      "ABCDEF1234567890".repeat(4), // 64 hex chars, mixed case
      "  " + "f".repeat(64) + "  ",
    ];
    for (const value of samples) {
      expect(sec.buildKeyFingerprint(value)).toBe(appJs.buildKeyFingerprint(value));
    }
    // Pruefe das Format des gueltigen Fingerprints exemplarisch.
    const fp = sec.buildKeyFingerprint("a".repeat(64));
    expect(fp).toMatch(/^[a-f0-9]{12}\.\.\.[a-f0-9]{8}$/);
  });

  it("firebase-config.js Bootstrap-Helfer sind paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "firebase-config.js"));
    const fc = globalScope.MM.firebaseConfig;
    expect(fc).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const validConfig = {
      apiKey: "AIzaSy-real",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo-1234",
      storageBucket: "demo-1234.appspot.com",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef",
    };
    const placeholderConfig = {
      apiKey: "your-api-key",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project",
      storageBucket: "your-project.appspot.com",
      messagingSenderId: "0",
      appId: "your-app-id",
    };
    const incompleteConfig = { apiKey: "x" };

    const configSamples = [null, undefined, {}, validConfig, placeholderConfig, incompleteConfig];
    for (const cfg of configSamples) {
      expect(fc.hasComplete(cfg)).toBe(appJs.hasCompleteFirebaseConfig(cfg));
      expect(fc.isPlaceholder(cfg)).toBe(appJs.isPlaceholderFirebaseConfig(cfg));
      expect(fc.normalizeBootstrap(cfg)).toEqual(appJs.normalizeBootstrapFirebaseConfig(cfg));
    }

    const textSamples = [
      "",
      "kein json hier",
      JSON.stringify(validConfig),
      `const firebaseConfig = ${JSON.stringify(validConfig).replace(/"([A-Za-z]+)":/g, "$1:")};`,
      "{ broken: ",
    ];
    for (const text of textSamples) {
      expect(fc.extractFromText(text)).toEqual(appJs.extractFirebaseConfigFromText(text));
    }

    const googleServices = {
      project_info: {
        project_id: "demo-1234",
        storage_bucket: "demo-1234.appspot.com",
        project_number: "1234567890",
      },
      client: [
        {
          client_info: {
            android_client_info: { package_name: "com.example.other" },
            mobilesdk_app_id: "1:1234567890:android:other",
          },
          api_key: [{ current_key: "AIzaOther" }],
        },
        {
          client_info: {
            android_client_info: { package_name: "com.google.pairing" },
            mobilesdk_app_id: "1:1234567890:android:pairing",
          },
          api_key: [{ current_key: "AIzaPairing" }],
        },
      ],
    };
    const meta1: any = {};
    const meta2: any = {};
    expect(fc.extractFromGoogleServices(googleServices, meta1))
      .toEqual(appJs.extractFirebaseConfigFromGoogleServices(googleServices, meta2));
    expect(meta1).toEqual(meta2);
    expect(fc.extractFromGoogleServices(null)).toBeNull();
    expect(fc.extractFromGoogleServices({ project_info: googleServices.project_info, client: [] })).toBeNull();

    const projectIds = ["", "  ", "your-project-id", "  YOUR-PROJECT-foo  ", "real-project"];
    for (const pid of projectIds) {
      expect(fc.isPlaceholderProjectId(pid)).toBe(appJs.isPlaceholderProjectId(pid));
    }
  });

  it("dates.js toDateSafe ist paritaetisch zu app.js", () => {
    load(path.join(MODULES_DIR, "core", "dates.js"));
    const d = globalScope.MM.dates;
    expect(d).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const fixedDate = new Date("2026-04-18T10:00:00Z");
    const samples: any[] = [
      null,
      undefined,
      "",
      0,
      "2026-04-18T10:00:00Z",
      1700000000000,
      "kein-datum",
      fixedDate,
      { seconds: 1700000000, nanoseconds: 500000000 },
      { _seconds: 1700000000, _nanoseconds: 500000000 },
      { toDate: () => fixedDate },
      { foo: "bar" },
    ];
    for (const value of samples) {
      const a = d.toDateSafe(value);
      const b = appJs.toDateSafe(value);
      if (a === null) {
        expect(b).toBeNull();
      } else {
        expect(b).not.toBeNull();
        expect(a.getTime()).toBe(b.getTime());
      }
    }
  });

  it("Registry verweigert ungueltige Eintraege (Defensive)", () => {
    const registry = load(path.join(MODULES_DIR, "core", "registry.js"));
    expect(() => registry.register("", {})).toThrow(/nicht-leerer String/);
    expect(() => registry.register("ok", null as any)).toThrow(/exports muss ein Objekt/);
  });

  it("legal-playstore.js Pure Helfer sind paritaetisch zu app.js (Welle 2 Step 1)", () => {
    load(path.join(MODULES_DIR, "tabs", "legal-playstore.js"));
    const lp = globalScope.MM.legalPlaystore;
    expect(lp).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Storage-Konstanten + Default-Schluessel
    expect(lp.storageKey).toBe("playStoreReadinessState");
    expect(lp.checkKeys).toEqual([
      "dataSafety", "iarc", "listing", "privacyUrlLinked",
      "permissionsDeclaration", "appAccessGuide",
      "securityRotationDone", "goNoGoSignedOff",
    ]);

    // In-Memory-Storage-Mock fuer load/save
    const memStore = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memStore.has(k) ? memStore.get(k)! : null,
      setItem: (k: string, v: string) => { memStore.set(k, v); },
      removeItem: (k: string) => { memStore.delete(k); },
    };
    expect(lp.load(storage)).toEqual(lp.defaultState());
    const sample = {
      checks: { dataSafety: true, iarc: true, listing: false, privacyUrlLinked: true,
                permissionsDeclaration: true, appAccessGuide: true,
                securityRotationDone: true, goNoGoSignedOff: false },
      privacyUrl: "https://example.org/privacy",
      supportEmail: "support@example.org",
      listingUrl: "https://play.google.com/listing",
      releaseNotes: "Erste Veroeffentlichung",
      updatedAt: "2026-04-01T10:00:00.000Z",
    };
    lp.save(sample, storage);
    expect(JSON.parse(memStore.get("playStoreReadinessState")!)).toEqual(sample);
    expect(lp.load(storage)).toEqual(sample);

    // Korruptes Storage faellt auf Defaults zurueck
    memStore.set("playStoreReadinessState", "{not-json");
    expect(lp.load(storage)).toEqual(lp.defaultState());

    // buildEffective: Recommendations als Fallback
    const effEmpty = lp.buildEffective(lp.defaultState());
    expect(effEmpty.privacyUrl).toBe(lp.recommendedPrivacyUrl);
    expect(effEmpty.supportEmail).toBe(lp.recommendedSupportEmail);
    const effFilled = lp.buildEffective(sample);
    expect(effFilled.privacyUrl).toBe(sample.privacyUrl);
    expect(effFilled.supportEmail).toBe(sample.supportEmail);
    // Hinweis: app.js exportiert buildEffectivePlayStoreReadinessState im Test-
    // Harness nicht, daher Paritaet ueber Implementierungs-Spiegelung verifiziert.
    void appJs;

    // validateForSave deckt drei Klassen ab
    expect(lp.validateForSave(null).ok).toBe(false);
    expect(lp.validateForSave({ privacyUrl: "http://insecure", supportEmail: "x@y.z" }))
      .toEqual({ ok: false, code: "invalid-privacy-url", message: expect.any(String) });
    expect(lp.validateForSave({ privacyUrl: "https://ok.io", supportEmail: "kein-mail" }))
      .toEqual({ ok: false, code: "invalid-email", message: expect.any(String) });
    expect(lp.validateForSave({ privacyUrl: "https://ok.io", supportEmail: "user@example.io" }))
      .toEqual({ ok: true });

    // computeReadiness
    expect(lp.computeReadiness(lp.defaultState())).toEqual({ total: 8, completed: 0, ready: false });
    const allChecked = lp.defaultState();
    for (const k of lp.checkKeys) allChecked.checks[k] = true;
    expect(lp.computeReadiness(allChecked)).toEqual({ total: 8, completed: 8, ready: false });
    allChecked.privacyUrl = "https://ok.io";
    allChecked.supportEmail = "x@y.z";
    expect(lp.computeReadiness(allChecked)).toEqual({ total: 8, completed: 8, ready: true });

    // Reviewer-Guide ist deterministisch (Datum injizierbar)
    const guide = lp.buildReviewerGuide(sample, { date: "01.04.2026" });
    expect(guide).toContain("Stand: 01.04.2026");
    expect(guide).toContain("Privacy Policy");
    expect(guide).toContain("https://example.org/privacy");
    expect(guide).toContain("support@example.org");
    expect(guide).toContain("Erste Veroeffentlichung");
    // Fallback-Texte bei leerem State
    const fallbackGuide = lp.buildReviewerGuide(lp.defaultState(), { date: "x" });
    expect(fallbackGuide).toContain("(nicht eingetragen)");
    expect(fallbackGuide).toContain("(keine Hinweise)");

    // ExportPayload
    const payload = lp.buildExportPayload(sample, { exportedAt: "2026-04-01T00:00:00.000Z" });
    expect(payload).toMatchObject({
      exportedAt: "2026-04-01T00:00:00.000Z",
      tool: "MiniMaster Admin Panel",
      type: "play-store-readiness",
      privacyUrl: sample.privacyUrl,
    });
  });

  it("qa-testing-register.js Pure Helfer sind paritaetisch zu app.js (Welle 2 Step 2)", () => {
    load(path.join(MODULES_DIR, "tabs", "qa-testing-register.js"));
    const qa = globalScope.MM.qaTestingRegister;
    expect(qa).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Direkte Paritaet zu im Harness exportierten Originalen
    const statuses = ["fail", "manual_required", "not_run", "pass", "", null, undefined, "unknown"];
    for (const s of statuses) {
      expect(qa.isOpenStatus(s)).toBe(appJs.isOpenTestingRegisterStatus(s));
      expect(qa.statusPriority(s)).toBe(appJs.getTestingRegisterStatusPriority(s));
    }
    const severities = ["critical", "high", "medium", "low", "", null, undefined, "trivial"];
    for (const sev of severities) {
      expect(qa.severityPriority(sev)).toBe(appJs.getTestingRegisterSeverityPriority(sev));
    }
    const items = [
      { id: "x", title: "Privacy Policy URL fehlt", groupTitle: "Recht" },
      { id: "y", details: "Reviewer access guide" },
      { id: "z", title: "Backups testen", groupTitle: "Daten" },
      { id: "store", groupId: "play-store", title: "Listing pruefen" },
      { id: "iarc-1", title: "IARC Altersfreigabe" },
      null,
      {},
    ];
    for (const item of items) {
      expect(qa.isPlayStoreItem(item)).toBe(appJs.isPlayStoreTestingRegisterItem(item));
      expect(qa.formatGroupTitle(item || {})).toBe(appJs.formatTestingRegisterGroupTitle(item || {}));
    }

    // Konstanten-Set
    expect(qa.openStatuses).toEqual(["fail", "manual_required", "not_run"]);
    expect(qa.primaryFilterTypes.has("playStoreBlocking")).toBe(true);
    expect(qa.primaryFilterTypes.has("unknown-mode")).toBe(false);

    // formatSourceLabel + sourceChipClass (Implementations-Spiegelung)
    const sources = [
      "register-derivative", "repo-test", "device-suite", "static-analysis",
      "docs-validation", "playstore-readiness", "command", "manual", "docs",
      "custom-x", "", null, undefined,
    ];
    expect(qa.formatSourceLabel("manual")).toBe("Quelle: Manueller Nachweis");
    expect(qa.formatSourceLabel("custom-x")).toBe("Quelle: custom-x");
    expect(qa.formatSourceLabel("")).toBe("");
    for (const src of sources) {
      const label = qa.formatSourceLabel(src);
      expect(typeof label).toBe("string");
      const chip = qa.sourceChipClass(src);
      expect(chip.startsWith("python-automation-chip-")).toBe(true);
    }

    // itemById
    const payload = { items: [{ id: "a" }, { id: "b" }, { id: "c" }] };
    expect(qa.itemById("b", payload)).toEqual({ id: "b" });
    expect(qa.itemById("nope", payload)).toBeNull();
    expect(qa.itemById("a", null)).toBeNull();
    expect(qa.itemById(null, payload)).toBeNull();

    // isReleaseBlockerOpen
    expect(qa.isReleaseBlockerOpen(null)).toBe(false);
    expect(qa.isReleaseBlockerOpen({ blockingForRelease: false })).toBe(false);
    expect(qa.isReleaseBlockerOpen({ blockingForRelease: true, hasSuccessfulRun: true, status: "pass" })).toBe(false);
    expect(qa.isReleaseBlockerOpen({ blockingForRelease: true, hasSuccessfulRun: true, status: "fail" })).toBe(true);
    expect(qa.isReleaseBlockerOpen({ blockingForRelease: true, hasSuccessfulRun: false, status: "pass" })).toBe(true);
    expect(qa.isReleaseBlockerOpen({ blockingForRelease: true, hasSuccessfulRun: true, status: "pass", staleEvidence: true })).toBe(true);

    // parseTimestamp + formatAge mit injizierbarem Now
    expect(qa.parseTimestamp("")).toBeNull();
    expect(qa.parseTimestamp("kein-datum")).toBeNull();
    const parsedTs = qa.parseTimestamp("2026-04-18T00:00:00.000Z");
    expect(parsedTs).not.toBeNull();
    // Cross-Realm: instanceof Date schlaegt im VM-Kontext fehl, daher Duck-Type-Check.
    expect(typeof parsedTs.getTime).toBe("function");
    expect(parsedTs.getTime()).toBe(new Date("2026-04-18T00:00:00.000Z").getTime());

    const NOW = new Date("2026-04-18T12:00:00.000Z").getTime();
    expect(qa.formatAge("", NOW)).toBe("noch kein Zeitstempel");
    expect(qa.formatAge("2026-04-18T08:00:00.000Z", NOW)).toBe("heute aktualisiert");
    expect(qa.formatAge("2026-04-17T06:00:00.000Z", NOW)).toBe("vor 1 Tag aktualisiert");
    expect(qa.formatAge("2026-04-10T00:00:00.000Z", NOW)).toBe("vor 8 Tagen aktualisiert");
    expect(qa.formatAge("2026-03-10T00:00:00.000Z", NOW)).toBe("vor 1 Monat aktualisiert");
    expect(qa.formatAge("2025-10-01T00:00:00.000Z", NOW)).toBe("vor 6 Monaten aktualisiert");

    // escapeText
    expect(qa.escapeText("<a href=\"x\">'&'</a>")).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(qa.escapeText(null)).toBe("");
    expect(qa.escapeText(undefined)).toBe("");
    expect(qa.escapeText(42 as unknown as string)).toBe("42");
  });

  it("firebase-deployment.js Pure Helfer sind paritaetisch zu app.js (Welle 2 Step 3)", () => {
    load(path.join(MODULES_DIR, "tabs", "firebase-deployment.js"));
    const fd = globalScope.MM.firebaseDeployment;
    expect(fd).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // buildRecoveryCommands
    const projectIds = ["mm-prod", "test-project-123", "x", ""];
    for (const pid of projectIds) {
      expect(fd.buildRecoveryCommands(pid)).toEqual(appJs.buildFirebaseRecoveryCommands(pid));
      expect(fd.buildRecoveryScript(pid)).toBe(appJs.buildFirebaseRecoveryScript(pid));
    }
    expect(fd.buildRecoveryCommands("mm-prod")).toEqual([
      "npm install",
      "firebase use mm-prod",
      "firebase deploy --only firestore:rules,firestore:indexes,storage",
      "firebase deploy --only functions",
    ]);
    expect(fd.buildRecoveryScript("mm-prod").split("\n")).toHaveLength(4);

    // buildDeployCommand
    expect(fd.buildDeployCommand("mm-prod")).toBe(appJs.buildDeployCommand("mm-prod"));
    expect(fd.buildDeployCommand("")).toBe(appJs.buildDeployCommand(""));
    expect(fd.buildDeployCommand(null)).toBe(appJs.buildDeployCommand(null));
    expect(fd.buildDeployCommand(undefined)).toBe(appJs.buildDeployCommand(undefined));
    expect(fd.buildDeployCommand("  spaced  ")).toBe(appJs.buildDeployCommand("  spaced  "));
    expect(fd.buildDeployCommand("mm-prod")).toBe(
      "firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting --project mm-prod",
    );
    expect(fd.buildDeployCommand("")).toBe(
      "firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting",
    );

    // isRetryableQueueConflict
    const cases: Array<[string, string, number, boolean]> = [
      ["firebase deploy --only functions", "HTTP Error: 409", 1, true],
      ["firebase deploy --only functions", "Unable to queue the operation", 2, true],
      ["firebase deploy --only functions", "OK", 0, false],
      ["firebase deploy --only functions", "Some other error", 1, false],
      ["npm install", "HTTP Error: 409", 1, false],
      ["", "HTTP Error: 409", 1, false],
      ["FIREBASE DEPLOY", "http error: 409", 1, true],
    ];
    for (const [cmd, out, code, expected] of cases) {
      expect(fd.isRetryableQueueConflict(cmd, out, code)).toBe(expected);
      expect(fd.isRetryableQueueConflict(cmd, out, code)).toBe(
        appJs.isRetryableFirebaseQueueConflict(cmd, out, code),
      );
    }
  });

  it("commissioning-pending.js Pure Helfer sind paritaetisch zu app.js (Welle 2 Step 4)", () => {
    load(path.join(MODULES_DIR, "tabs", "commissioning-pending.js"));
    const cp = globalScope.MM.commissioningPending;
    expect(cp).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // isCoveredCommissioningPendingItem ist im Harness NICHT exportiert -
    // Implementations-Spiegelung gegen die im Original definierten Strings
    // (Z.8775-8787 in admin-panel/app.js).
    expect(cp.isCoveredItem("Cloud Project ID setzen.")).toBe(true);
    expect(cp.isCoveredItem("KI-Runtime-Konfiguration vervollst\u00e4ndigen.")).toBe(true);
    expect(cp.isCoveredItem("KI-Konfiguration im Runtime-Block vollst\u00e4ndig ausf\u00fcllen (apiKey).")).toBe(true);
    expect(cp.isCoveredItem("QA-Freigabe offen: Datensicherung")).toBe(true);
    expect(cp.isCoveredItem("QA-Nachweis offen: Backup-Drill")).toBe(true);
    expect(cp.isCoveredItem("Play-Store-Readiness: Privacy Policy URL fehlt")).toBe(true);
    expect(cp.isCoveredItem("  Cloud Project ID setzen.  ")).toBe(true); // trim
    expect(cp.isCoveredItem("Firebase-Webkonfiguration lokal speichern.")).toBe(false);
    expect(cp.isCoveredItem("Operator-PIN festlegen.")).toBe(false);
    expect(cp.isCoveredItem("")).toBe(false);
    expect(cp.isCoveredItem("   ")).toBe(false);
    expect(cp.isCoveredItem(null)).toBe(false);
    expect(cp.isCoveredItem(undefined)).toBe(false);

    // filterVisibleCommissioningPendingItems IST im Harness exportiert -
    // Paritaet direkt pruefbar.
    const all = [
      "Cloud Project ID setzen.",
      "Firebase-Webkonfiguration lokal speichern.",
      "QA-Freigabe offen: Datensicherung",
      "Operator-PIN festlegen.",
      "Play-Store-Readiness: Privacy Policy URL fehlt",
    ];
    expect(cp.filterVisibleItems(all)).toEqual(appJs.filterVisibleCommissioningPendingItems(all));
    expect(cp.filterVisibleItems(all)).toEqual([
      "Firebase-Webkonfiguration lokal speichern.",
      "Operator-PIN festlegen.",
    ]);
    expect(cp.filterVisibleItems(null)).toEqual([]);
    expect(cp.filterVisibleItems(undefined)).toEqual([]);
    expect(cp.filterVisibleItems("not-array" as unknown as string[])).toEqual([]);
    expect(cp.filterVisibleItems([])).toEqual([]);

    // Konstanten
    expect(cp.coveredExact.has("Cloud Project ID setzen.")).toBe(true);
    expect(cp.coveredPrefixes).toContain("QA-Freigabe offen:");
    expect(cp.coveredPrefixes).toContain("Play-Store-Readiness:");
  });

  it("operator-config.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 5)", () => {
    // Modul importiert intern aus core/firebase-config.js; vorab laden
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "firebase-config.js"));
    load(path.join(MODULES_DIR, "tabs", "operator-config.js"));
    const oc = globalScope.MM.operatorConfig;
    expect(oc).toBeDefined();
    expect(typeof oc.buildGuidance).toBe("function");
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    const cases = [
      // 1. Beides leer
      { config: { cloud: { projectId: "" }, ai: {} }, bootstrap: {} },
      // 2. Nur Bootstrap-Project
      { config: { cloud: { projectId: "" }, ai: {} }, bootstrap: { projectId: "boot-prod", apiKey: "k", authDomain: "a", storageBucket: "s", messagingSenderId: "m", appId: "x" } },
      // 3. Match Project, AI komplett gemini mit projectId-keyref
      {
        config: {
          cloud: { projectId: "mm-prod" },
          ai: { provider: "gemini", model: "gemini-1.5", keyRef: "projects/mm-prod/secrets/k", systemPrompt: "Du bist Helfer." },
        },
        bootstrap: { projectId: "mm-prod", apiKey: "k", authDomain: "a", storageBucket: "s", messagingSenderId: "m", appId: "x" },
      },
      // 4. Project-ID-Mismatch
      {
        config: {
          cloud: { projectId: "mm-prod" },
          ai: { provider: "openai", model: "gpt-x", keyRef: "k", systemPrompt: "p" },
        },
        bootstrap: { projectId: "boot-prod" },
      },
      // 5. Gemini-keyref ohne project
      {
        config: {
          cloud: { projectId: "mm-prod" },
          ai: { provider: "Gemini", model: "g", keyRef: "global-secret", systemPrompt: "p" },
        },
        bootstrap: { projectId: "mm-prod" },
      },
      // 6. Teilweise AI
      {
        config: {
          cloud: { projectId: "mm-prod" },
          ai: { provider: "gemini", model: "", keyRef: "k", systemPrompt: "" },
        },
        bootstrap: { projectId: "mm-prod" },
      },
      // 7. null/undefined defensive
      { config: null, bootstrap: null },
    ];

    for (const c of cases) {
      const got = oc.buildGuidance(c.config, c.bootstrap);
      const expected = appJs.buildOperatorConfigGuidance(c.config, c.bootstrap);
      expect(got).toEqual(expected);
    }

    // Konkrete Inhalte fuer Fall 3 (alles ok)
    const ok = oc.buildGuidance(cases[2].config, cases[2].bootstrap);
    expect(ok.isReady).toBe(true);
    expect(ok.projectId).toBe("mm-prod");
    expect(ok.bootstrapProjectId).toBe("mm-prod");
    expect(ok.aiProvider).toBe("gemini");
    expect(ok.items).toHaveLength(2); // cloud + ai

    // Fall 5: zusaetzlicher keyref-mismatch
    const mism = oc.buildGuidance(cases[4].config, cases[4].bootstrap);
    expect(mism.items.find((i: any) => i.id === "ai-keyref-project-mismatch")).toBeTruthy();
    expect(mism.isReady).toBe(false);

    // Fall 7: defensive Null
    const def = oc.buildGuidance(null, null);
    expect(def.projectId).toBe("");
    expect(def.bootstrapProjectId).toBe("");
    expect(def.items.length).toBeGreaterThanOrEqual(2);
  });

  it("operator-effective.js Pure Helfer (Welle 2 Step 6)", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "firebase-config.js"));
    load(path.join(MODULES_DIR, "tabs", "operator-effective.js"));
    const oe = globalScope.MM.operatorEffective;
    expect(oe).toBeDefined();
    expect(typeof oe.buildEffective).toBe("function");
    expect(oe.defaults.cloud.region).toBe("europe-west1");
    expect(oe.defaults.ai.provider).toBe("gemini");

    // 1. Komplett leer -> alle Defaults
    const empty = oe.buildEffective(null, null);
    expect(empty.cloud.projectId).toBe("");
    expect(empty.cloud.region).toBe("europe-west1");
    expect(empty.cloud.appCheckMode).toBe("enforced");
    expect(empty.cloud.releaseChannel).toBe("prod");
    expect(empty.ai.provider).toBe("gemini");
    expect(empty.ai.model).toBe("gemini-3.0-flash");
    expect(empty.ai.temperature).toBe(0.3);
    expect(empty.ai.endpoint).toBe("");
    expect(empty.ai.keyRef).toBe(""); // ohne projectId keine Empfehlung

    // 2. Nur Bootstrap-projectId -> wird in cloud.projectId uebernommen
    const fromBootstrap = oe.buildEffective(
      {},
      { projectId: "boot-prod", apiKey: "k", authDomain: "a", storageBucket: "s", messagingSenderId: "m", appId: "x" },
    );
    expect(fromBootstrap.cloud.projectId).toBe("boot-prod");
    expect(fromBootstrap.ai.keyRef).toBe(
      "projects/boot-prod/secrets/gemini-api-key/versions/latest",
    );

    // 3. Runtime-projectId hat Vorrang vor Bootstrap
    const withRuntime = oe.buildEffective(
      { cloud: { projectId: "runtime-prod" }, ai: {} },
      { projectId: "boot-prod" },
    );
    expect(withRuntime.cloud.projectId).toBe("runtime-prod");
    expect(withRuntime.ai.keyRef).toBe(
      "projects/runtime-prod/secrets/gemini-api-key/versions/latest",
    );

    // 4. Placeholder-projectId (your-project) wird ignoriert
    const placeholder = oe.buildEffective(
      { cloud: { projectId: "your-project-id" }, ai: {} },
      { projectId: "boot-prod" },
    );
    expect(placeholder.cloud.projectId).toBe("boot-prod");

    // 5. Custom keyRef bleibt erhalten
    const withKey = oe.buildEffective(
      { cloud: { projectId: "p1" }, ai: { keyRef: "custom-secret-ref" } },
      null,
    );
    expect(withKey.ai.keyRef).toBe("custom-secret-ref");

    // 6. Invalid temperature faellt auf default
    const badTemp = oe.buildEffective(
      { cloud: {}, ai: { temperature: "not-a-number" } },
      null,
    );
    expect(badTemp.ai.temperature).toBe(0.3);
    const validTemp = oe.buildEffective(
      { cloud: {}, ai: { temperature: "0.7" } },
      null,
    );
    expect(validTemp.ai.temperature).toBe(0.7);

    // 7. Trim und Default-Fallbacks fuer Strings
    const padded = oe.buildEffective(
      { cloud: { region: "  ", appCheckMode: "audit", releaseChannel: "  " }, ai: { provider: "  ", model: "  ", systemPrompt: "  ", endpoint: "  https://x  " } },
      null,
    );
    expect(padded.cloud.region).toBe("europe-west1");
    expect(padded.cloud.appCheckMode).toBe("audit");
    expect(padded.cloud.releaseChannel).toBe("prod");
    expect(padded.ai.provider).toBe("gemini");
    expect(padded.ai.model).toBe("gemini-3.0-flash");
    expect(padded.ai.endpoint).toBe("https://x");
    expect(padded.ai.systemPrompt.length).toBeGreaterThan(20);
  });

  it("operator-assistant.js Pure Helfer (Welle 2 Step 7)", () => {
    load(path.join(MODULES_DIR, "tabs", "operator-assistant.js"));
    const oa = globalScope.MM.operatorAssistant;
    expect(oa).toBeDefined();
    expect(typeof oa.generate).toBe("function");
    expect(typeof oa.classify).toBe("function");
    expect(Array.isArray(oa.topics)).toBe(true);
    expect(oa.topics).toHaveLength(13);

    // Hinweis: Keywords koennen sich ueberlappen (z.B. "config" aus firebase
    // matcht auch "configuration" aus runtime). Wir pruefen daher nur, dass
    // jedes Keyword UEBERHAUPT klassifiziert wird (kein null), nicht zu
    // welchem Topic - das verhalten ist deterministisch durch Reihenfolge.
    for (const topic of oa.topics) {
      for (const kw of topic.keywords) {
        const got = oa.classify(`Hilfe zu ${kw} bitte`);
        expect(got).not.toBeNull();
      }
    }

    // Konkrete Treffer
    expect(oa.generate("Wie pruefe ich Admin-Claims?")).toMatch(/Admin-Rechte/);
    expect(oa.generate("Firebase config laden")).toMatch(/Firebase-Integration/);
    expect(oa.generate("Wann mache ich go live?")).toMatch(/Inbetriebnahme im Panel/);
    expect(oa.generate("DSAR Audit-Log Export")).toMatch(/Compliance-Flow/);
    expect(oa.generate("Pairing Token erneuern")).toMatch(/Pairing-/);
    expect(oa.generate("Performance Metrik")).toMatch(/Performance:/);

    // Reihenfolge: "config" (firebase) vor "configuration" (runtime), aber
    // "runtime" allein muss runtime liefern; "configuration" enthaelt "config"
    // -> firebase-Topic gewinnt deterministisch (gleich wie Original-If-Kette)
    expect(oa.classify("configuration").id).toBe("firebase");
    expect(oa.classify("runtime").id).toBe("runtime");
    expect(oa.classify("cloud-dienst").id).toBe("runtime");

    // Fallback
    const fb = oa.generate("Voellig fremder Begriff xyz");
    expect(fb).toBe(oa.fallback);
    expect(fb).toMatch(/^Empfohlener Ablauf/);

    // Defensive
    expect(oa.classify("")).toBeNull();
    expect(oa.classify(null)).toBeNull();
    expect(oa.classify(undefined)).toBeNull();
    expect(oa.generate("")).toBe(oa.fallback);
    expect(oa.generate(null)).toBe(oa.fallback);

    // Case-Insensitiv
    expect(oa.classify("ADMIN").id).toBe("admin");
    expect(oa.classify("Firestore").id).toBe("firestore");

    // Umlaute (Geraet)
    expect(oa.classify("Ger\u00e4te \u00fcbersicht").id).toBe("device");

    // Topics-Form
    for (const t of oa.topics) {
      expect(typeof t.id).toBe("string");
      expect(Array.isArray(t.keywords)).toBe(true);
      expect(t.keywords.length).toBeGreaterThan(0);
      expect(typeof t.answer).toBe("string");
      expect(t.answer.length).toBeGreaterThan(20);
    }
  });

  it("platform-qa-readiness.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 8)", () => {
    load(path.join(MODULES_DIR, "tabs", "platform-qa-readiness.js"));
    const pq = globalScope.MM.platformQaReadiness;
    expect(pq).toBeDefined();
    expect(typeof pq.buildSummary).toBe("function");
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Empty
    const empty = pq.buildSummary({ items: [] });
    expect(empty.hasData).toBe(false);
    expect(empty.totals.totalAll).toBe(0);
    expect(empty.platformStatus.masterApp.percent).toBe(0);
    expect(empty.platformStatus.masterApp.label).toMatch(/MasterApp/);

    // Mit Items: 2 master critical (1 pass), 1 master high (pass),
    // 1 master low (fail), 2 child low (1 pass), 0 desktop
    const payload = {
      items: [
        { id: "x1", groupId: "functional-readiness-masterapp", severity: "critical", status: "pass" },
        { id: "x2", groupId: "static-readiness-masterapp", severity: "critical", status: "fail" },
        { id: "x3", groupId: "functional-readiness-masterapp", severity: "high", status: "pass" },
        { id: "x4", groupId: "functional-readiness-masterapp", severity: "low", status: "fail" },
        { id: "y1", groupId: "functional-readiness-childapp", severity: "low", status: "pass" },
        { id: "y2", groupId: "static-readiness-childapp", severity: "low", status: "fail" },
        { id: "z1", groupId: "irrelevant-group", severity: "critical", status: "pass" },
      ],
    };
    const summary = pq.buildSummary(payload);

    // Direkte Paritaet zur Original-Implementierung
    expect(summary).toEqual(appJs.buildPlatformQaReadinessSummary(payload));

    // Konkretes
    expect(summary.hasData).toBe(true);
    expect(summary.totals).toEqual({
      totalAll: 6,
      doneAll: 3,
      totalCritical: 2,
      doneCritical: 1,
      totalHigh: 1,
      doneHigh: 1,
    });
    expect(summary.platformStatus.masterApp).toEqual({
      label: "MasterApp (Eltern-Android)",
      total: 4,
      done: 2,
      critical: 2,
      criticalDone: 1,
      high: 1,
      highDone: 1,
      percent: 50,
      source: "qa-register",
    });
    expect(summary.platformStatus.childApp.percent).toBe(50);
    expect(summary.platformStatus.desktop.total).toBe(0);
    expect(summary.platformStatus.desktop.percent).toBe(0);

    // Defensive
    expect(pq.buildSummary(null).hasData).toBe(false);
    expect(pq.buildSummary({}).hasData).toBe(false);
    expect(pq.buildSummary({ items: "not-array" as any }).hasData).toBe(false);

    // Injizierbare Groups
    const customGroups = {
      onlyMaster: { label: "Only Master", groupIds: ["functional-readiness-masterapp"] },
    };
    const custom = pq.buildSummary(payload, customGroups);
    expect(Object.keys(custom.platformStatus)).toEqual(["onlyMaster"]);
    expect(custom.platformStatus.onlyMaster.total).toBe(3);
    expect(custom.platformStatus.onlyMaster.done).toBe(2);
    expect(custom.totals.totalAll).toBe(3);
  });

  it("effective-platform-state.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 9)", () => {
    load(path.join(MODULES_DIR, "tabs", "effective-platform-state.js"));
    const eps = globalScope.MM.effectivePlatformState;
    expect(eps).toBeDefined();
    expect(typeof eps.buildEffective).toBe("function");
    expect(eps.defaultMapping).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Empty payload - keine Veraenderung
    expect(eps.buildEffective({}, { items: [] })).toEqual({});
    expect(eps.buildEffective(null, null)).toEqual({});

    // Existing-Truthy bleibt erhalten, keine Ueberschreibung
    const preset = { "ma-pairing-works": "manual-set" };
    const out1 = eps.buildEffective(preset, { items: [] });
    expect(out1["ma-pairing-works"]).toBe("manual-set");

    // Pass setzt Legacy-Key
    const payload = {
      items: [
        { id: "ma-pairing-works", status: "pass" },
        { id: "static-ma-appcheck", status: "pass" },
        { id: "ma-fcm-working", status: "fail" },
        { id: "ca-overlay-secure", status: "pass" },
      ],
    };
    const out2 = eps.buildEffective({}, payload);
    expect(out2["ma-pairing-works"]).toBe(true);
    // OR-Logik: einer von beiden QA-IDs reicht
    expect(out2["ma-firebase-appcheck"]).toBe(true);
    // Fail setzt nicht
    expect(out2["ma-fcm-working"]).toBeUndefined();
    expect(out2["ca-overlay-secure"]).toBe(true);

    // Direkte Paritaet zur Original-Implementierung
    expect(out2).toEqual(appJs.buildEffectivePlatformState({}, payload));

    // Custom-Mapping injizierbar
    const custom = { foo: ["only-id"] };
    const customOut = eps.buildEffective({}, { items: [{ id: "only-id", status: "pass" }] }, custom);
    expect(customOut.foo).toBe(true);
    expect(Object.keys(customOut)).toEqual(["foo"]);
  });

  it("commissioning-qa.js Pure Helfer (Welle 2 Step 10)", () => {
    load(path.join(MODULES_DIR, "tabs", "commissioning-qa.js"));
    const cq = globalScope.MM.commissioningQa;
    expect(cq).toBeDefined();
    expect(typeof cq.summarizeApprovals).toBe("function");
    expect(typeof cq.buildValidationSummary).toBe("function");
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // summarizeApprovals: leer & defensiv
    expect(cq.summarizeApprovals(null)).toEqual({
      items: [],
      confirmed: [],
      open: [],
      totalCount: 0,
      confirmedCount: 0,
      openCount: 0,
    });
    expect(cq.summarizeApprovals("nope" as any).totalCount).toBe(0);

    // summarizeApprovals: gemischt
    const items = [
      { id: "a", status: "pass" },
      { id: "b", status: "fail" },
      { id: "c", status: "not_run" },
      { id: "d", status: "pass" },
      { id: "e" }, // status undefined => open
    ];
    const sum = cq.summarizeApprovals(items);
    expect(sum.totalCount).toBe(5);
    expect(sum.confirmedCount).toBe(2);
    expect(sum.openCount).toBe(3);
    expect(sum.confirmed.map((x: any) => x.id)).toEqual(["a", "d"]);
    expect(sum.open.map((x: any) => x.id)).toEqual(["b", "c", "e"]);

    // buildValidationSummary: empty -> null
    expect(cq.buildValidationSummary([])).toBeNull();
    expect(cq.buildValidationSummary(null)).toBeNull();

    // buildValidationSummary: aggregierend + Paritaet zur Original-Implementierung
    const results = [
      { check: "Admin Authentication", status: "ok" },
      { check: "Firestore Collection: users", status: "ok" },
      { check: "Firestore Collection: tasks", status: "ok" },
      { check: "Function (createTask)", status: "ok" },
      { check: "Function (issueToken)", status: "warn" },
      { check: "Backend Storage Health", status: "ok" },
      { check: "AI Secret Configuration", status: "error" },
      { check: "Shared Web-Control Firebase Config", status: "ok" },
    ];
    const v = cq.buildValidationSummary(results);
    expect(v.ok).toBe(6);
    expect(v.warn).toBe(1);
    expect(v.errorCount).toBe(1);
    expect(v.checks.adminAuthOk).toBe(true);
    expect(v.checks.firestoreAccessOk).toBe(true);
    expect(v.checks.functionsReachable).toBe(true);
    expect(v.checks.storageHealthOk).toBe(true);
    expect(v.checks.aiConfigured).toBe(false);
    expect(v.checks.webControlConfigReady).toBe(true);

    // Direkte Paritaet
    expect(v).toEqual(appJs.buildValidationSummaryFromResults(results));

    // Failure-Pfade in checks
    const failResults = [
      { check: "Firestore Collection: users", status: "ok" },
      { check: "Firestore Collection: tasks", status: "error" },
      { check: "Function (foo)", status: "error" },
    ];
    const v2 = cq.buildValidationSummary(failResults);
    expect(v2.checks.firestoreAccessOk).toBe(false);
    expect(v2.checks.functionsReachable).toBe(false);
    expect(v2).toEqual(appJs.buildValidationSummaryFromResults(failResults));
  });

  it("python-automation-actions.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 11)", () => {
    load(path.join(MODULES_DIR, "tabs", "python-automation-actions.js"));
    const paa = globalScope.MM.pythonAutomationActions;
    expect(paa).toBeDefined();
    expect(typeof paa.buildActions).toBe("function");
    expect(typeof paa.isOpenStatus).toBe("function");
    expect(typeof paa.isPlayStoreItem).toBe("function");
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Predicates
    expect(paa.isOpenStatus("fail")).toBe(true);
    expect(paa.isOpenStatus("manual_required")).toBe(true);
    expect(paa.isOpenStatus("not_run")).toBe(true);
    expect(paa.isOpenStatus("pass")).toBe(false);
    expect(paa.isOpenStatus(undefined)).toBe(true); // default not_run

    expect(paa.isPlayStoreItem({ groupId: "playstore-checks" })).toBe(true);
    expect(paa.isPlayStoreItem({ title: "Reviewer Notes" })).toBe(true);
    expect(paa.isPlayStoreItem({ details: "Privacy Policy URL" })).toBe(true);
    expect(paa.isPlayStoreItem({ id: "store-listing-screens", details: "store listing screenshots required" })).toBe(true);
    expect(paa.isPlayStoreItem({ groupId: "unrelated" })).toBe(false);
    expect(paa.isPlayStoreItem(null)).toBe(false);

    // buildActions: null run -> []
    expect(paa.buildActions(null)).toEqual([]);

    // No issues -> []
    expect(paa.buildActions({ evaluation: { checks: [] } }, { items: [] })).toEqual([]);

    // Runtime + Evidence + Play-Store
    const run = {
      evaluation: {
        checks: [
          { id: "cloud-project-id", title: "Cloud Project ID", status: "fail" },
          { id: "ai-runtime-config", title: "AI Runtime Config", status: "not_run" },
          { id: "app-check-mode", title: "App Check Mode", status: "pass" },
          { id: "other-check", title: "Other", status: "fail" },
        ],
      },
      evidenceCoverage: { counts: { uncovered: 2, failed: 1 } },
    };
    const payload = {
      items: [
        { id: "playstore-listing", groupId: "playstore", status: "fail" },
        { id: "iarc-cert", groupId: "release", title: "IARC Certificate", status: "manual_required" },
        { id: "playstore-done", groupId: "playstore", status: "pass" }, // closed -> nicht zaehlen
        { id: "unrelated", status: "fail" },
      ],
    };
    const actions = paa.buildActions(run, payload);
    expect(actions.map((a: any) => a.id)).toEqual(["runtime", "evidence", "playstore"]);
    expect(actions[0].detail).toContain("Cloud Project ID");
    expect(actions[0].detail).toContain("AI Runtime Config");
    expect(actions[0].detail).not.toContain("App Check Mode"); // pass
    expect(actions[1].detail).toContain("3"); // 2+1
    expect(actions[2].detail).toContain("2"); // 2 offene playstore items

    // Direkte Paritaet zur Original-Implementierung
    expect(actions).toEqual(appJs.buildPythonAutomationRunActionSummary(run, payload));

    // Nur Evidence offen
    const evOnly = paa.buildActions({ evaluation: { checks: [] }, evidenceCoverage: { counts: { uncovered: 1, failed: 0 } } }, { items: [] });
    expect(evOnly.map((a: any) => a.id)).toEqual(["evidence"]);
  });

  it("event-delegation.js delegiert Klicks ueber data-action (Welle 3 Vorbereitung)", () => {
    load(path.join(MODULES_DIR, "core", "event-delegation.js"));
    const ed = globalScope.MM.eventDelegation;
    expect(ed).toBeDefined();
    expect(typeof ed.createDelegatedClickHandler).toBe("function");
    expect(typeof ed.attachDelegatedClicks).toBe("function");

    // jsdom-aehnliche Mock-Knoten
    const calls: string[] = [];
    const lookup: Record<string, (this: any, ev: any) => void> = {
      doFoo() { calls.push("foo"); },
      doBar(this: any) { calls.push("bar:" + (this?.dataset?.action || "?")); },
    };

    function makeNode(action?: string) {
      const node: any = {
        dataset: action ? { action } : {},
        getAttribute(name: string) { return name === "data-action" ? (action || null) : null; },
        // closest gibt sich selbst zurueck wenn das Attribut passt
        closest(selector: string) {
          if (selector === "[data-action]" && action) return node;
          return null;
        },
      };
      return node;
    }

    const handler = ed.createDelegatedClickHandler({ lookup });

    // Match -> Handler laeuft, preventDefault wird aufgerufen
    let prevented = false;
    const evMatch = {
      target: makeNode("doFoo"),
      preventDefault() { prevented = true; },
    };
    expect(handler(evMatch)).toBe(true);
    expect(calls).toEqual(["foo"]);
    expect(prevented).toBe(true);

    // this-Bindung an Target
    const evBar = {
      target: makeNode("doBar"),
      preventDefault() { /* noop */ },
    };
    handler(evBar);
    expect(calls).toEqual(["foo", "bar:doBar"]);

    // No data-action -> nichts passiert, kein preventDefault
    let prevented2 = false;
    const evNone = {
      target: makeNode(),
      preventDefault() { prevented2 = true; },
    };
    expect(handler(evNone)).toBe(false);
    expect(prevented2).toBe(false);

    // Unknown handler-Name -> ignoriert (defensiv)
    const evUnknown = {
      target: makeNode("doMissing"),
      preventDefault() { /* noop */ },
    };
    expect(handler(evUnknown)).toBe(false);

    // Custom-Attribut
    const handler2 = ed.createDelegatedClickHandler({ lookup, attribute: "data-cmd" });
    const node2: any = {
      getAttribute(name: string) { return name === "data-cmd" ? "doFoo" : null; },
      closest(selector: string) { return selector === "[data-cmd]" ? node2 : null; },
    };
    handler2({ target: node2, preventDefault() {} });
    expect(calls).toContain("foo");

    // attachDelegatedClicks gibt detach zurueck (mit fake root)
    let added = 0;
    let removed = 0;
    const fakeRoot: any = {
      addEventListener() { added++; },
      removeEventListener() { removed++; },
    };
    const detach = ed.attachDelegatedClicks(fakeRoot, { lookup });
    expect(added).toBe(1);
    expect(typeof detach).toBe("function");
    detach();
    expect(removed).toBe(1);

    // Falscher root -> noop
    const noop = ed.attachDelegatedClicks(null);
    expect(typeof noop).toBe("function");
    noop(); // soll nicht werfen
  });

  it("nav-bootstrap.js verdrahtet Tab-Wechsel und Logout per Event-Delegation (F6 Stufe 1)", () => {
    // Document-Stub: getElementById findet nav + logout, beide verbinden sich.
    const navListeners: Array<(ev: any) => void> = [];
    const logoutListeners: Array<(ev: any) => void> = [];
    const nav = {
      addEventListener(type: string, fn: (ev: any) => void) {
        if (type === "click") navListeners.push(fn);
      },
    };
    const logoutBtn = {
      addEventListener(type: string, fn: (ev: any) => void) {
        if (type === "click") logoutListeners.push(fn);
      },
    };
    const docListeners: Array<{ type: string; fn: () => void }> = [];
    const fakeDocument: any = {
      readyState: "complete",
      getElementById(id: string) {
        if (id === "dashboard-nav") return nav;
        if (id === "logout-btn") return logoutBtn;
        return null;
      },
      addEventListener(type: string, fn: () => void) { docListeners.push({ type, fn }); },
    };

    const switchCalls: Array<{ tab: string; targetTag: string }> = [];
    const logoutCalls: number[] = [];
    globalScope.document = fakeDocument;
    globalScope.switchTab = (tab: string, evt: any) => {
      switchCalls.push({ tab, targetTag: evt?.target?.tagName || "?" });
    };
    globalScope.logout = () => { logoutCalls.push(Date.now()); };

    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "nav-bootstrap.js"));

    expect(globalScope.MM.navBootstrap).toBeDefined();
    expect(navListeners.length).toBe(1);
    expect(logoutListeners.length).toBe(1);

    // Klick auf Nav-Tab "users" -> switchTab("users", { target: button })
    const buttonNode: any = {
      tagName: "BUTTON",
      getAttribute(name: string) { return name === "data-tab" ? "users" : null; },
      closest(selector: string) { return selector === "[data-tab]" ? buttonNode : null; },
    };
    navListeners[0]({ target: buttonNode });
    expect(switchCalls).toEqual([{ tab: "users", targetTag: "BUTTON" }]);

    // Klick irgendwo im Nav ohne data-tab -> ignoriert
    navListeners[0]({ target: { closest: () => null } });
    expect(switchCalls.length).toBe(1);

    // Klick auf Logout
    let prevented = false;
    const logoutNode: any = {
      getAttribute(name: string) { return name === "data-action" ? "logout" : null; },
      closest(selector: string) { return selector === "[data-action='logout']" ? logoutNode : null; },
    };
    logoutListeners[0]({ target: logoutNode, preventDefault() { prevented = true; } });
    expect(logoutCalls.length).toBe(1);
    expect(prevented).toBe(true);

    // Idempotenz: erneutes _bind() bindet nicht doppelt
    globalScope.MM.navBootstrap.bind();
    expect(navListeners.length).toBe(1);
  });

  it("index.html bindet alle Top-Level-Navigations-Tabs per data-tab statt onclick", async () => {
    const html = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "index.html"), "utf8"
    );
    const navMatch = html.match(/<nav id="dashboard-nav"[\s\S]*?<\/nav>/);
    expect(navMatch).not.toBeNull();
    const nav = navMatch![0];
    expect(nav).not.toMatch(/onclick="switchTab/);
    const dataTabs = (nav.match(/data-tab="/g) || []).length;
    expect(dataTabs).toBeGreaterThanOrEqual(14);
    // Logout-Button verwendet data-action statt onclick
    expect(html).toMatch(/id="logout-btn"[\s\S]*?data-action="logout"/);
    expect(html).not.toMatch(/id="logout-btn"[\s\S]*?onclick="logout/);
  });

  it("testing-register-insights.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 12)", () => {
    load(path.join(MODULES_DIR, "tabs", "testing-register-insights.js"));
    const tri = globalScope.MM.testingRegisterInsights;
    expect(tri).toBeDefined();
    expect(typeof tri.buildDuplicates).toBe("function");
    expect(typeof tri.buildManual).toBe("function");
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Duplicates: defensiv
    expect(tri.buildDuplicates(null)).toEqual({ count: 0, sourceCount: 0, entries: [] });
    expect(tri.buildDuplicates({})).toEqual({ count: 0, sourceCount: 0, entries: [] });
    expect(tri.buildDuplicates({ duplicateInsights: { entries: "nope" as any } }).entries).toEqual([]);

    // Duplicates: voll
    const dupPayload = {
      duplicateInsights: {
        count: 3,
        sourceCount: 7,
        entries: [{ id: "a" }, { id: "b" }],
      },
    };
    const dup = tri.buildDuplicates(dupPayload);
    expect(dup).toEqual({ count: 3, sourceCount: 7, entries: dupPayload.duplicateInsights.entries });
    // Paritaet
    expect(dup).toEqual(appJs.buildTestingRegisterDuplicateInsights(dupPayload));

    // Manual: defensiv
    expect(tri.buildManual(null)).toEqual({
      total: 0, physical: 0, backlog: 0, external: 0, wave1: 0, wave2: 0,
    });

    // Manual: voll
    const manPayload = {
      manualInsights: {
        total: 12,
        buckets: {
          "physical-manual": { count: 4 },
          "automation-backlog": { count: 5 },
          "external-evidence": { count: 3 },
        },
        waves: {
          "wave-1": { count: 7 },
          "wave-2": { count: 5 },
        },
      },
    };
    const man = tri.buildManual(manPayload);
    expect(man).toEqual({ total: 12, physical: 4, backlog: 5, external: 3, wave1: 7, wave2: 5 });
    // Paritaet
    expect(man).toEqual(appJs.buildTestingRegisterManualInsights(manPayload));

    // Manual: Number-Coercion ueber String-Werte
    const coerced = tri.buildManual({
      manualInsights: {
        total: "9",
        buckets: { "physical-manual": { count: "2" } },
        waves: {},
      },
    });
    expect(coerced.total).toBe(9);
    expect(coerced.physical).toBe(2);
  });

  it("testing-register-priorities.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 13)", () => {
    load(path.join(MODULES_DIR, "tabs", "testing-register-priorities.js"));
    const trp = globalScope.MM.testingRegisterPriorities;
    expect(trp).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // Status-Priority
    const statuses = ["fail", "manual_required", "not_run", "pass", "unknown", undefined];
    for (const s of statuses) {
      expect(trp.statusPriority(s)).toBe(appJs.getTestingRegisterStatusPriority(s));
    }
    // Konkret
    expect(trp.statusPriority("fail")).toBe(0);
    expect(trp.statusPriority("pass")).toBe(3);
    expect(trp.statusPriority("xyz")).toBe(4);

    // Severity-Priority
    const sevs = ["critical", "high", "medium", "low", "info", undefined];
    for (const s of sevs) {
      expect(trp.severityPriority(s)).toBe(appJs.getTestingRegisterSeverityPriority(s));
    }
    expect(trp.severityPriority("critical")).toBe(0);
    expect(trp.severityPriority("low")).toBe(3);

    // formatGroupTitle
    expect(trp.formatGroupTitle({ groupTitle: "Auth", groupId: "x" })).toBe("Auth");
    expect(trp.formatGroupTitle({ groupTitle: "X", groupId: "repo-tests-unsupported" })).toBe("Unsupported: X");
    expect(trp.formatGroupTitle({ groupTitle: "Y", groupId: "g", blockingForRelease: true })).toBe("Release: Y");
    expect(trp.formatGroupTitle({})).toBe("-");
    // Paritaet
    const cases = [
      {},
      { groupTitle: "Auth" },
      { groupTitle: "X", groupId: "repo-tests-unsupported" },
      { groupTitle: "Y", blockingForRelease: true },
      { groupTitle: "Z", groupId: "repo-tests-unsupported", blockingForRelease: true },
    ];
    for (const c of cases) {
      expect(trp.formatGroupTitle(c)).toBe(appJs.formatTestingRegisterGroupTitle(c));
    }

    // actionLabel - alle Pfade
    expect(trp.actionLabel({ action: "suite-run" })).toBe("Suite-Start");
    expect(trp.actionLabel({ action: "protocol" })).toBe("Nachweis-Protokoll");
    expect(trp.actionLabel({ action: "external-protocol" })).toBe("Externer Lauf + Nachweis");
    expect(trp.actionLabel({ source: "repo-test" })).toBe("Repository-Tests pr\u00fcfen");
    expect(trp.actionLabel({ source: "docs-validation" })).toBe("Dokument-Check ausf\u00fchren");
    expect(trp.actionLabel({ source: "static-analysis" })).toBe("Static-Checks ausf\u00fchren");
    expect(trp.actionLabel({})).toBe("Python-Commissioning-Lauf");
    expect(trp.actionLabel(null)).toBe("Python-Commissioning-Lauf");
    // Paritaet
    const labelCases = [
      {}, null,
      { action: "suite-run" },
      { action: "protocol" },
      { action: "external-protocol" },
      { source: "repo-test" },
      { source: "docs-validation" },
      { source: "static-analysis" },
      { action: "suite-run", source: "repo-test" }, // action gewinnt
    ];
    for (const c of labelCases) {
      expect(trp.actionLabel(c)).toBe(appJs.getTestingRegisterActionLabel(c));
    }
  });

  it("crypto-debug.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 14)", () => {
    load(path.join(MODULES_DIR, "core", "crypto-debug.js"));
    const cd = globalScope.MM.cryptoDebug;
    expect(cd).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // toBase64Url
    expect(cd.toBase64Url([])).toBe("");
    // bytes [0xff, 0xff] -> "//8=" -> base64url "__8"
    expect(cd.toBase64Url([0xff, 0xff])).toBe("__8");
    // bytes [0x3e, 0x3f] -> "Pj8=" -> "Pj8"
    expect(cd.toBase64Url([0x3e, 0x3f])).toBe("Pj8");
    // Paritaet (Uint8Array)
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    expect(cd.toBase64Url(bytes)).toBe(appJs.toBase64Url(bytes));

    // buildKeyFingerprint
    expect(cd.buildKeyFingerprint("")).toBe("unbekannt");
    expect(cd.buildKeyFingerprint("not-hex")).toBe("unbekannt");
    expect(cd.buildKeyFingerprint("a".repeat(63))).toBe("unbekannt");
    const valid = "a".repeat(56) + "b".repeat(8);
    expect(cd.buildKeyFingerprint(valid)).toBe("aaaaaaaaaaaa...bbbbbbbb");
    // case-insensitiv & trim
    expect(cd.buildKeyFingerprint("  " + valid.toUpperCase() + "  ")).toBe("aaaaaaaaaaaa...bbbbbbbb");
    // Paritaet
    expect(cd.buildKeyFingerprint(valid)).toBe(appJs.buildKeyFingerprint(valid));
    expect(cd.buildKeyFingerprint("xyz")).toBe(appJs.buildKeyFingerprint("xyz"));

    // safeDebugStringify
    expect(cd.safeDebugStringify({ a: 1, b: "x" })).toBe(JSON.stringify({ a: 1, b: "x" }, null, 2));
    expect(cd.safeDebugStringify(null)).toBe("null");
    expect(cd.safeDebugStringify(42)).toBe("42");
    // Circular -> Fallback auf String(value)
    const circular: any = { name: "x" };
    circular.self = circular;
    const out = cd.safeDebugStringify(circular);
    expect(typeof out).toBe("string");
    expect(out).toBe(appJs.safeDebugStringify(circular));

    // getPriorityWeight
    expect(cd.getPriorityWeight("critical")).toBe(300);
    expect(cd.getPriorityWeight("high")).toBe(200);
    expect(cd.getPriorityWeight("medium")).toBe(100);
    expect(cd.getPriorityWeight("low")).toBe(50);
    expect(cd.getPriorityWeight("anything")).toBe(50);
    expect(cd.getPriorityWeight(undefined)).toBe(50);
    // Paritaet
    for (const s of ["critical", "high", "medium", "low", "info", undefined]) {
      expect(cd.getPriorityWeight(s)).toBe(appJs.getPriorityWeight(s));
    }
  });

  it("firebase-recovery.js Pure Helfer ist paritaetisch zu app.js (Welle 2 Step 15)", () => {
    load(path.join(MODULES_DIR, "tabs", "firebase-recovery.js"));
    const fr = globalScope.MM.firebaseRecovery;
    expect(fr).toBeDefined();
    const { loadAdminPanelTestExports } = require("./utils/admin-panel-test-harness");
    const { exports: appJs } = loadAdminPanelTestExports();

    // buildCommands: 4 Zeilen, projectId interpoliert
    const cmds = fr.buildCommands("my-proj");
    expect(cmds).toEqual([
      "npm install",
      "firebase use my-proj",
      "firebase deploy --only firestore:rules,firestore:indexes,storage",
      "firebase deploy --only functions",
    ]);
    // Paritaet
    expect(cmds).toEqual(appJs.buildFirebaseRecoveryCommands("my-proj"));

    // buildScript = join("\n")
    const script = fr.buildScript("p2");
    expect(script).toBe(fr.buildCommands("p2").join("\n"));
    expect(script).toBe(appJs.buildFirebaseRecoveryScript("p2"));

    // isRetryableConflict
    // code 0 -> nie retry
    expect(fr.isRetryableConflict("firebase deploy", "HTTP Error: 409", 0)).toBe(false);
    // command nicht firebase deploy
    expect(fr.isRetryableConflict("npm install", "HTTP Error: 409", 1)).toBe(false);
    // ohne 409/queue
    expect(fr.isRetryableConflict("firebase deploy", "permission denied", 1)).toBe(false);
    // 409 -> retry
    expect(fr.isRetryableConflict("firebase deploy --only functions", "HTTP Error: 409 - conflict", 1)).toBe(true);
    // queue-Hinweis -> retry
    expect(fr.isRetryableConflict("firebase deploy", "Unable to queue the operation", 7)).toBe(true);
    // Case-Insensitivitaet
    expect(fr.isRetryableConflict("FIREBASE DEPLOY", "http error: 409", 1)).toBe(true);
    // null defensiv
    expect(fr.isRetryableConflict(null, null, 1)).toBe(false);

    // Paritaets-Tabelle
    const cases = [
      ["firebase deploy", "HTTP Error: 409", 0],
      ["firebase deploy", "HTTP Error: 409", 1],
      ["firebase deploy", "Unable to queue the operation", 1],
      ["npm install", "HTTP Error: 409", 1],
      ["firebase deploy", "permission denied", 1],
      ["FIREBASE DEPLOY", "http error: 409", 1],
      [null, null, 1],
    ];
    for (const [c, o, code] of cases) {
      expect(fr.isRetryableConflict(c, o, code)).toBe(appJs.isRetryableFirebaseQueueConflict(c, o, code));
    }
  });
});

describe("admin-panel module wiring", () => {
  it("index.html laedt modules/index.js VOR app.js", async () => {
    const html = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "index.html"),
      "utf8",
    );
    const moduleIndex = html.indexOf("modules/index.js");
    const appIndex = html.indexOf('src="app.js');
    expect(moduleIndex).toBeGreaterThan(0);
    expect(appIndex).toBeGreaterThan(moduleIndex);
  });

  it("service-worker cached die neuen Module-Assets", async () => {
    const sw = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "service-worker.js"),
      "utf8",
    );
    expect(sw).toContain("./modules/index.js");
    expect(sw).toContain("./modules/core/registry.js");
    expect(sw).toContain("./modules/core/sanitize.js");
    expect(sw).toContain("./modules/core/command.js");
    expect(sw).toContain("./modules/core/format.js");
    expect(sw).toContain("./modules/core/automation-meta.js");
    expect(sw).toContain("./modules/core/encoding.js");
    expect(sw).toContain("./modules/core/error-codes.js");
    expect(sw).toContain("./modules/core/security.js");
    expect(sw).toContain("./modules/core/firebase-config.js");
    expect(sw).toContain("./modules/core/dates.js");
    expect(sw).toContain("./modules/core/event-delegation.js");
    expect(sw).toContain("./modules/core/nav-bootstrap.js");
    expect(sw).toContain("./modules/core/crypto-debug.js");
    expect(sw).toContain("./modules/tabs/legal-playstore.js");
    expect(sw).toContain("./modules/tabs/qa-testing-register.js");
    expect(sw).toContain("./modules/tabs/firebase-deployment.js");
    expect(sw).toContain("./modules/tabs/firebase-recovery.js");
    expect(sw).toContain("./modules/tabs/commissioning-pending.js");
    expect(sw).toContain("./modules/tabs/operator-config.js");
    expect(sw).toContain("./modules/tabs/operator-effective.js");
    expect(sw).toContain("./modules/tabs/operator-assistant.js");
    expect(sw).toContain("./modules/tabs/platform-qa-readiness.js");
    expect(sw).toContain("./modules/tabs/effective-platform-state.js");
    expect(sw).toContain("./modules/tabs/commissioning-qa.js");
    expect(sw).toContain("./modules/tabs/python-automation-actions.js");
    expect(sw).toContain("./modules/tabs/testing-register-insights.js");
    expect(sw).toContain("./modules/tabs/testing-register-priorities.js");
  });

  it("MM-Fassade in app.js wird via DOMContentLoaded installiert (Browser-Reihenfolge)", async () => {
    const appJs = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "app.js"),
      "utf8",
    );
    // Klassisches <script src="app.js"> laeuft VOR <script type="module"> (deferred).
    // Daher MUSS die Fassade erst nach DOMContentLoaded greifen, sonst ist window.MM
    // beim direkten IIFE-Aufruf noch nicht registriert und alle Swaps verpuffen still.
    expect(appJs).toContain("function _mmInstallFacade()");
    expect(appJs).toMatch(/addEventListener\(\s*"DOMContentLoaded"\s*,\s*_mmInstallFacade/);
    // Negative Garantie: kein direkter IIFE-Aufruf der alten Variante.
    expect(appJs).not.toContain("(function installMMFacade()");
    // Substituierte Funktionen muessen alle 9 Module abdecken.
    const swaps = [
      "MM.sanitize",
      "MM.command",
      "MM.format",
      "MM.automationMeta",
      "MM.encoding",
      "MM.errorCodes",
      "MM.security",
      "MM.firebaseConfig",
      "MM.dates",
    ];
    for (const expr of swaps) {
      expect(appJs).toContain(expr);
    }
  });

  it("Fassade swappt 27 Funktionen in simulierter Browser-Reihenfolge", async () => {
    // Simuliere: 1. app.js parst & deklariert Originale, 2. Module registrieren MM,
    // 3. DOMContentLoaded -> _mmInstallFacade ersetzt globale Funktionsbindings.
    const sandboxGlobal: any = {};
    const sandboxLoad = makeLoader(sandboxGlobal);
    sandboxLoad(path.join(MODULES_DIR, "index.js"));
    expect(sandboxGlobal.MM).toBeDefined();
    expect(sandboxGlobal.MM.list().length).toBe(26);

    // Pruefe: facade-Aufruf gegen ein dummy-Originalset zeigt, dass swap stattfindet.
    // Wir pruefen das hier rein deklarativ: jede der 27 Funktionen taucht im app.js
    // sowohl als Original-Definition als auch als swap-Eintrag auf.
    const appJs = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "app.js"),
      "utf8",
    );
    const expected = [
      "sanitizeAdbSerial", "sanitizeApkPath", "escapePowerShellString",
      "buildPowerShellScript", "encodeCommandPayload", "decodeCommandPayload",
      "formatQaRefreshTimestamp", "formatPythonAutomationTimestamp",
      "formatPythonAutomationStatus", "getPythonAutomationStatusMeta",
      "formatPythonAutomationType", "getPythonAutomationTypeChipClass",
      "toBase64Url", "encodeInlineArgument", "decodeInlineArgument", "safeDebugStringify",
      "normalizeCallableErrorCode", "normalizeAuthErrorCode",
      "getAccessKeyErrorHint", "getAuthErrorHint",
      "buildKeyFingerprint",
      "hasCompleteFirebaseConfig", "isPlaceholderFirebaseConfig",
      "normalizeBootstrapFirebaseConfig", "extractFirebaseConfigFromText",
      "extractFirebaseConfigFromGoogleServices", "isPlaceholderProjectId",
      "toDateSafe",
    ];
    for (const fn of expected) {
      expect(appJs).toMatch(new RegExp(`swap\\("${fn}"`));
    }
  });

  it("Jeder swap('X', ...) Eintrag in app.js hat eine korrespondierende Top-Level-Funktion", async () => {
    // Diese Garantie verhindert, dass Modul-Schluessel und globaler Funktionsname
    // auseinanderlaufen (z.B. MM.command.encodePayload swappt encodeCommandPayload,
    // nicht encodePayload). Falsche Namen wuerden im Browser still per ReferenceError
    // verschluckt und alle Substitutionen waeren effektlos.
    const appJs = await fs.readFile(
      path.resolve(__dirname, "..", "admin-panel", "app.js"),
      "utf8",
    );
    const swapNames = Array.from(appJs.matchAll(/\bswap\("([A-Za-z_$][\w$]*)"/g)).map(m => m[1]);
    expect(swapNames.length).toBeGreaterThanOrEqual(28);
    const missing: string[] = [];
    for (const name of swapNames) {
      const re = new RegExp(`^function ${name}\\b`, "m");
      if (!re.test(appJs)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});
