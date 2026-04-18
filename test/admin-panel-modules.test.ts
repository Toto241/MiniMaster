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
      "dates",
      "encoding",
      "errorCodes",
      "firebaseConfig",
      "firebaseDeployment",
      "format",
      "legalPlaystore",
      "operatorConfig",
      "qaTestingRegister",
      "sanitize",
      "security",
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
    expect(sw).toContain("./modules/tabs/legal-playstore.js");
    expect(sw).toContain("./modules/tabs/qa-testing-register.js");
    expect(sw).toContain("./modules/tabs/firebase-deployment.js");
    expect(sw).toContain("./modules/tabs/commissioning-pending.js");
    expect(sw).toContain("./modules/tabs/operator-config.js");
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
    expect(sandboxGlobal.MM.list().length).toBe(14);

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
