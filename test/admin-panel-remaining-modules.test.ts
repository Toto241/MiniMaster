/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Admin-Panel Remaining Modules
 *
 * Covers previously untested modules:
 *   - Tab modules: affiliate-dashboard, b2b-dashboard, pricing-management, revenue-analytics
 *   - Core modules: crypto-debug, event-delegation, global-action-bootstrap, nav-bootstrap
 */
import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

const MODULES_DIR = path.resolve(__dirname, "..", "admin-panel", "modules");

function rewriteAsCommonJS(source: string, _baseDir: string): string {
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
      (_m, name) => `module.exports.${name} =`)
    .replace(/^\s*export\s+\{([^}]+)\}\s*;?\s*$/gm, "");
}

function makeLoader(globalScope: any, registryMap?: Map<string, any>) {
  const cache = new Map<string, any>();
  const reg = registryMap || new Map<string, any>();
  function load(absPath: string) {
    if (cache.has(absPath)) return cache.get(absPath);
    const source = fs.readFileSync(absPath, "utf8");
    const dir = path.dirname(absPath);
    const transformed = rewriteAsCommonJS(source, dir);
    const moduleObj: any = { exports: {} };
    const ctx = vm.createContext({
      module: moduleObj,
      console,
      window: globalScope,
      globalThis: globalScope,
      document: globalScope.document,
      btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
      atob: (str: string) => Buffer.from(str, "base64").toString("binary"),
      __loadRelative: (spec: string) => {
        const next = path.resolve(dir, spec);
        return load(next);
      },
    });
    // Intercept register() calls from modules that register but don't export
    ctx.register = (name: string, obj: any) => { reg.set(name, obj); };
    vm.runInContext(transformed, ctx, { filename: absPath });
    cache.set(absPath, moduleObj.exports);
    return moduleObj.exports;
  }
  return { load, reg };
}

function createMockContainer() {
  const listeners = new Map<string, Array<(event?: any) => void>>();
  const el = {
    innerHTML: "",
    children: [] as any[],
    querySelector: jest.fn((selector: string) => {
      const id = selector.replace("#", "");
      return {
        addEventListener: jest.fn((eventName: string, handler: (event?: any) => void) => {
          const arr = listeners.get(id) || [];
          arr.push(handler);
          listeners.set(id, arr);
        }),
        value: "",
        textContent: "",
        checked: false,
        style: { display: "" },
      };
    }),
    querySelectorAll: jest.fn(() => []),
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    _listeners: listeners,
  };
  return el;
}

// ══════════════════════════════════════════════════════════════════════════
// TAB MODULES
// ══════════════════════════════════════════════════════════════════════════

describe("admin-panel tab modules", () => {
  let globalScope: any;
  let load: (absPath: string) => any;

  beforeEach(() => {
    globalScope = {
      document: {
        getElementById: jest.fn(() => ({
          innerHTML: "",
          textContent: "",
          value: "",
          style: { display: "" },
          addEventListener: jest.fn(),
          appendChild: jest.fn(),
        })),
        createElement: jest.fn((tag: string) => ({
          tagName: tag.toUpperCase(),
          textContent: "",
          innerHTML: "",
          className: "",
          classList: { add: jest.fn(), remove: jest.fn() },
          style: {},
          dataset: {},
          setAttribute: jest.fn(),
          appendChild: jest.fn(),
          addEventListener: jest.fn(),
        })),
        addEventListener: jest.fn(),
      },
      callFunctionCalls: [] as Array<{ name: string; data: any }>,
    };
    globalScope.window = globalScope;
    globalScope.globalThis = globalScope;
    globalScope.window.callFunction = jest.fn((name: string, data: any) => {
      globalScope.callFunctionCalls.push({ name, data });
      return Promise.resolve({ data: { affiliates: [], organizations: [], pricing: {} } });
    });
    ({ load } = makeLoader(globalScope));
  });

  it("affiliate-dashboard creates expected HTML structure", () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "affiliate-dashboard.js"));
    const container = createMockContainer();
    mod.createAffiliateDashboard(container);

    expect(container.innerHTML).toContain("Affiliate Program");
    expect(container.innerHTML).toContain("aff-table");
    expect(container.innerHTML).toContain("aff-kpis");
    expect(container.innerHTML).toContain("aff-status-filter");
    expect(container.innerHTML).toContain("aff-search");
    expect(container.querySelector).toHaveBeenCalledWith("#aff-refresh");
    expect(container.querySelector).toHaveBeenCalledWith("#aff-payout");
  });

  it("b2b-dashboard creates expected HTML structure", () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "b2b-dashboard.js"));
    const container = createMockContainer();
    mod.createB2BDashboard(container);

    expect(container.innerHTML).toContain("B2B Organizations");
    expect(container.innerHTML).toContain("b2b-table");
    expect(container.innerHTML).toContain("b2b-kpis");
    expect(container.innerHTML).toContain("b2b-status-filter");
    expect(container.innerHTML).toContain("b2b-type-filter");
    expect(container.querySelector).toHaveBeenCalledWith("#b2b-refresh");
    expect(container.querySelector).toHaveBeenCalledWith("#b2b-create");
  });

  it("pricing-management creates expected HTML structure", () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "pricing-management.js"));
    const container = createMockContainer();
    mod.createPricingManagement(container);

    expect(container.innerHTML).toContain("Pricing Management");
    expect(container.innerHTML).toContain("b2c-pricing");
    expect(container.innerHTML).toContain("b2b-pricing");
    expect(container.innerHTML).toContain("affiliate-config");
    expect(container.querySelector).toHaveBeenCalledWith("#pricing-refresh");
  });

  it("revenue-analytics creates expected HTML structure", () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "revenue-analytics.js"));
    const container = createMockContainer();
    mod.createRevenueAnalytics(container);

    expect(container.innerHTML).toContain("Revenue Analytics");
    expect(container.innerHTML).toContain("revenue-kpis");
    expect(container.innerHTML).toContain("platform-table");
    expect(container.innerHTML).toContain("tier-table");
    expect(container.innerHTML).toContain("b2b-revenue-table");
    expect(container.innerHTML).toContain("aff-revenue-table");
    expect(container.querySelector).toHaveBeenCalledWith("#revenue-refresh");
    expect(container.querySelector).toHaveBeenCalledWith("#revenue-period");
    expect(container.querySelector).toHaveBeenCalledWith("#revenue-platform");
  });

  it("affiliate-dashboard calls listAffiliates on load", async () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "affiliate-dashboard.js"));
    const container = createMockContainer();
    globalScope.window.callFunction = jest.fn((name: string) => {
      globalScope.callFunctionCalls.push({ name });
      return Promise.resolve({ data: { affiliates: [] } });
    });
    mod.createAffiliateDashboard(container);
    // wait for async loadAffiliateData
    await new Promise((r) => setTimeout(r, 50));
    expect(globalScope.callFunctionCalls.some((c: any) => c.name === "listAffiliates")).toBe(true);
  });

  it("b2b-dashboard calls listB2BOrganizations on load", async () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "b2b-dashboard.js"));
    const container = createMockContainer();
    globalScope.window.callFunction = jest.fn((name: string) => {
      globalScope.callFunctionCalls.push({ name });
      return Promise.resolve({ data: { organizations: [] } });
    });
    mod.createB2BDashboard(container);
    await new Promise((r) => setTimeout(r, 50));
    expect(globalScope.callFunctionCalls.some((c: any) => c.name === "listB2BOrganizations")).toBe(true);
  });

  it("pricing-management calls getPricingConfig on load", async () => {
    const mod = load(path.join(MODULES_DIR, "tabs", "pricing-management.js"));
    const container = createMockContainer();
    globalScope.window.callFunction = jest.fn((name: string) => {
      globalScope.callFunctionCalls.push({ name });
      return Promise.resolve({ data: { b2c: [], b2b: [], affiliate: {} } });
    });
    mod.createPricingManagement(container);
    await new Promise((r) => setTimeout(r, 50));
    expect(globalScope.callFunctionCalls.some((c: any) => c.name === "getPricingConfig")).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// CORE MODULES
// ══════════════════════════════════════════════════════════════════════════

describe("admin-panel core modules", () => {
  let globalScope: any;
  let load: (absPath: string) => any;

  beforeEach(() => {
    globalScope = {} as any;
    const loader = makeLoader(globalScope);
    load = loader.load;
  });

  it("crypto-debug exports base64url, fingerprint, stringify, priority", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    const mod = load(path.join(MODULES_DIR, "core", "crypto-debug.js"));
    expect(typeof mod.toBase64Url).toBe("function");
    expect(typeof mod.buildKeyFingerprint).toBe("function");
    expect(typeof mod.safeDebugStringify).toBe("function");
    expect(typeof mod.getPriorityWeight).toBe("function");

    // toBase64Url
    const bytes = new Uint8Array([0xff, 0xfb, 0x00, 0x10, 0x20]);
    expect(mod.toBase64Url(bytes)).not.toMatch(/[+/=]/);

    // buildKeyFingerprint
    expect(mod.buildKeyFingerprint("a".repeat(64))).toMatch(/^[a-f0-9]{12}\.\.\.[a-f0-9]{8}$/);
    expect(mod.buildKeyFingerprint("short")).toBe("unbekannt");
    expect(mod.buildKeyFingerprint("GGGG".repeat(16))).toBe("unbekannt"); // 64 chars but invalid hex

    // safeDebugStringify
    expect(mod.safeDebugStringify({ a: 1 })).toContain("\"a\": 1");
    expect(mod.safeDebugStringify(BigInt(1))).toBe("1"); // falls kein Fehler, sondern String

    // getPriorityWeight
    expect(mod.getPriorityWeight("critical")).toBe(300);
    expect(mod.getPriorityWeight("high")).toBe(200);
    expect(mod.getPriorityWeight("medium")).toBe(100);
    expect(mod.getPriorityWeight("low")).toBe(50);
    expect(mod.getPriorityWeight("unknown")).toBe(50);
  });

  it("event-delegation resolves handlers and creates delegated click handler", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    const mod = load(path.join(MODULES_DIR, "core", "event-delegation.js"));
    expect(typeof mod.createDelegatedClickHandler).toBe("function");
    expect(typeof mod.attachDelegatedClicks).toBe("function");

    // Handler resolution
    globalScope.testHandler = jest.fn();
    const handler = mod.createDelegatedClickHandler({ lookup: globalScope, attribute: "data-action" });

    const mockTarget = {
      getAttribute: jest.fn((attr: string) => attr === "data-action" ? "testHandler" : null),
    };
    const mockEvent = {
      target: { closest: jest.fn(() => mockTarget) },
      preventDefault: jest.fn(),
    };

    const result = handler(mockEvent);
    expect(result).toBe(true);
    expect(globalScope.testHandler).toHaveBeenCalled();
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it("event-delegation returns false when no matching target", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    const mod = load(path.join(MODULES_DIR, "core", "event-delegation.js"));
    const handler = mod.createDelegatedClickHandler({});

    const mockEvent = { target: { closest: jest.fn(() => null) } };
    expect(handler(mockEvent)).toBe(false);
  });

  it("global-action-bootstrap parses args and resolves actions", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "global-action-bootstrap.js"));
    const mod = globalScope.MM?.get("globalActionBootstrap");
    expect(mod).toBeDefined();
    expect(typeof mod.bind).toBe("function");
    expect(typeof mod._onDocClick).toBe("function");
    expect(typeof mod._parseArgs).toBe("function");

    // _parseArgs
    expect(mod._parseArgs(null)).toEqual([]);
    expect(mod._parseArgs("")).toEqual([]);
    expect(mod._parseArgs("[\"a\", 1]")).toEqual(["a", 1]);
    expect(mod._parseArgs("plain")).toEqual(["plain"]);
    expect(mod._parseArgs("{\"x\":1}")).toEqual([{"x":1}]);

    // _onDocClick with valid action
    globalScope.testAction = jest.fn();
    const target = {
      getAttribute: jest.fn((attr: string) => {
        if (attr === "data-action") return "testAction";
        if (attr === "data-args") return "[\"arg1\", 2]";
        return null;
      }),
    };
    const event = {
      target: { closest: jest.fn(() => target) },
      preventDefault: jest.fn(),
    };
    mod._onDocClick(event);
    expect(globalScope.testAction).toHaveBeenCalledWith("arg1", 2);
  });

  it("global-action-bootstrap skips reserved actions", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "global-action-bootstrap.js"));
    const mod = globalScope.MM?.get("globalActionBootstrap");
    globalScope.logout = jest.fn();
    const target = {
      getAttribute: jest.fn((attr: string) => attr === "data-action" ? "logout" : null),
    };
    const event = {
      target: { closest: jest.fn(() => target) },
      preventDefault: jest.fn(),
    };
    mod._onDocClick(event);
    expect(globalScope.logout).not.toHaveBeenCalled();
  });

  it("nav-bootstrap resolves switchTab and logout from window", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "nav-bootstrap.js"));
    const mod = globalScope.MM?.get("navBootstrap");
    expect(mod).toBeDefined();
    expect(typeof mod.bind).toBe("function");
    expect(typeof mod._onNavClick).toBe("function");
    expect(typeof mod._onLogoutClick).toBe("function");

    // _onNavClick
    globalScope.switchTab = jest.fn();
    const navTarget = {
      getAttribute: jest.fn((attr: string) => attr === "data-tab" ? "qa" : null),
    };
    const navEvent = {
      target: { closest: jest.fn(() => navTarget) },
    };
    mod._onNavClick(navEvent);
    expect(globalScope.switchTab).toHaveBeenCalledWith("qa", { target: navTarget });

    // _onLogoutClick
    globalScope.logout = jest.fn();
    const logoutTarget = {
      getAttribute: jest.fn((attr: string) => attr === "data-action" ? "logout" : null),
    };
    const logoutEvent = {
      target: { closest: jest.fn(() => logoutTarget) },
      preventDefault: jest.fn(),
    };
    mod._onLogoutClick(logoutEvent);
    expect(globalScope.logout).toHaveBeenCalled();
    expect(logoutEvent.preventDefault).toHaveBeenCalled();
  });
});
