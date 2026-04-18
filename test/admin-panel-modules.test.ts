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
      "encoding",
      "errorCodes",
      "format",
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

  it("Registry verweigert ungueltige Eintraege (Defensive)", () => {
    const registry = load(path.join(MODULES_DIR, "core", "registry.js"));
    expect(() => registry.register("", {})).toThrow(/nicht-leerer String/);
    expect(() => registry.register("ok", null as any)).toThrow(/exports muss ein Objekt/);
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
  });
});
