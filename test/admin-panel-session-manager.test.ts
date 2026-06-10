import * as fs from "fs";
import * as path from "path";
import { readFileSync } from "fs";
import * as vm from "vm";

const MODULES_DIR = path.resolve(__dirname, "..", "admin-panel", "modules");

function rewriteAsCommonJS(source: string): string {
  return source
    .replace(/^\s*import\s+["']([^"']+)["'];?\s*$/gm,
      (_m, spec) => `__loadRelative(${JSON.stringify(spec)});`)
    .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?\s*$/gm,
      (_m, names, spec) => {
        const cleaned = String(names).split(",").map((n) => n.trim()).filter(Boolean).join(", ");
        return `const { ${cleaned} } = __loadRelative(${JSON.stringify(spec)});`;
      })
    .replace(/^\s*export\s+function\s+([A-Za-z_$][\w$]*)/gm,
      (_m, name) => `module.exports.${name} = function ${name}`)
    .replace(/^\s*export\s+const\s+([A-Za-z_$][\w$]*)\s*=/gm,
      (_m, name) => `module.exports.${name} =`)
    .replace(/^\s*export\s+default\s+/gm, "module.exports.default = ");
}

function makeLoader(globalScope: Record<string, unknown>) {
  const cache = new Map<string, unknown>();
  function load(absPath: string) {
    if (cache.has(absPath)) return cache.get(absPath);
    const source = readFileSync(absPath, "utf8");
    const dir = path.dirname(absPath);
    const transformed = rewriteAsCommonJS(source);
    const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
    const ctx = vm.createContext({
      module: moduleObj,
      console,
      window: globalScope,
      globalThis: globalScope,
      document: globalScope.document,
      firebase: globalScope.firebase,
      setInterval: global.setInterval.bind(global),
      clearInterval: global.clearInterval.bind(global),
      __loadRelative: (spec: string) => load(path.resolve(dir, spec)),
    });
    vm.runInContext(transformed, ctx, { filename: absPath });
    cache.set(absPath, moduleObj.exports);
    return moduleObj.exports;
  }
  return load;
}

describe("admin-panel session manager (AP-N3 Phase 1)", () => {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "admin-panel", "app.js"), "utf8");
  const sessionSource = fs.readFileSync(
    path.join(__dirname, "..", "admin-panel", "modules", "core", "session-manager.js"),
    "utf8"
  );

  it("registers sessionManager on window.MM", () => {
    const globalScope: Record<string, unknown> = { document: { addEventListener() {}, removeEventListener() {} } };
    const load = makeLoader(globalScope);
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "session-manager.js"));
    expect((globalScope.MM as { sessionManager?: unknown }).sessionManager).toBeDefined();
  });

  it("app.js delegates session monitoring to sessionManager when available", () => {
    expect(appSource).toContain("function getSessionManager()");
    expect(appSource).toContain("sessionManager.start()");
    expect(appSource).toContain("sessionManager.ensureTier(\"T3\")");
  });

  it("session manager defines idle timeout, tier promotion and admin PIN helpers", () => {
    expect(sessionSource).toContain("T1_IDLE_MINUTES: 15");
    expect(sessionSource).toContain("ensureTier");
    expect(sessionSource).toContain("promptForAdminPin");
    expect(sessionSource).toContain("session-reauth-overlay");
    expect(sessionSource).toContain("session-expiry-banner");
  });

  it("setup wizards reference Phase 2 auth callables", () => {
    expect(appSource).toContain("registerAuthenticatedMaster");
    expect(appSource).toContain("pairAuthenticatedChild");
    expect(appSource).not.toMatch(/instruction:[\s\S]*registerMasterDevice/);
  });
});
