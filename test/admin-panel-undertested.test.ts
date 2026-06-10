import { readFileSync } from "fs";
import * as path from "path";
import * as vm from "vm";

/**
 * Tests for undertested admin-panel modules.
 * Covers tabs/qa-release-workspace.js, affiliate-dashboard.js, b2b-dashboard.js,
 * pricing-management.js, and revenue-analytics.js which previously had 0 test coverage.
 */

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
      (_m, name) => `module.exports.${name} =`);
}

function makeLoader(globalScope: any) {
  const cache = new Map<string, any>();
  function load(absPath: string) {
    if (cache.has(absPath)) return cache.get(absPath);
    const source = readFileSync(absPath, "utf8");
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

describe("qa-release-workspace.js (Welle 3 - 0 coverage gap)", () => {
  let globalScope: any;
  let load: (absPath: string) => any;

  beforeEach(() => {
    globalScope = {} as any;
    load = makeLoader(globalScope);
  });

  it("registriert sich als MM.qaReleaseWorkspace mit allen Funktionen", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    expect(qa).toBeDefined();
    expect(typeof qa.buildViewModel).toBe("function");
    expect(typeof qa.findBlocker).toBe("function");
    expect(typeof qa.buildClipboardPayload).toBe("function");
    expect(typeof qa.buildNextAction).toBe("function");
  });

  it("buildNextAction erzeugt suite-run Aktion mit Prereqs", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;

    const suiteRun = qa.buildNextAction({ action: "suite-run", suiteRef: "s-1" });
    expect(suiteRun.kind).toBe("suite-run");
    expect(suiteRun.suiteId).toBe("s-1");
    expect(suiteRun.label).toBe("Suite erneut ausführen");

    const suiteRunBlocked = qa.buildNextAction({ action: "suite-run", suiteRef: "s-2", prereqsMet: false, prereqReason: "ADB offline" });
    expect(suiteRunBlocked.label).toBe("Voraussetzungen prüfen");
    expect(suiteRunBlocked.detail).toContain("ADB offline");
  });

  it("buildNextAction erzeugt protocol Aktion", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const protocol = qa.buildNextAction({ action: "protocol", id: "t-1", evidenceTargetId: "et-1" });
    expect(protocol.kind).toBe("protocol");
    expect(protocol.testId).toBe("et-1");
    expect(protocol.label).toBe("Manuellen Nachweis erfassen");
  });

  it("buildNextAction erzeugt emulator-lab bei Geräte-Problemen", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const emu = qa.buildNextAction({ prereqReason: "Emulator nicht erreichbar, ADB disconnected" });
    expect(emu.kind).toBe("emulator-lab");
    expect(emu.label).toBe("Emulator-/Gerätestatus prüfen");
  });

  it("buildNextAction Fallback ist inspect", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const fallback = qa.buildNextAction({ details: "Something broke" });
    expect(fallback.kind).toBe("inspect");
    expect(fallback.detail).toBe("Something broke");
    expect(qa.buildNextAction(null).kind).toBe("inspect");
  });

  it("buildViewModel erzeugt korrekte Metriken aus Payload", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;

    const payload = {
      generatedAt: "2026-05-18T10:00:00Z",
      summary: {
        blockingCount: 3,
        staleEvidenceCount: 2,
        runningJobs: 1,
        queuedJobs: 4,
        failedJobs: 0,
        activeEmulators: 2,
        activeAgents: 5,
        criticalIssues: 1,
        systemHealth: "degraded",
      },
      blockers: [
        { id: "b1", title: "Blocker A", severity: "critical", status: "fail" },
        { id: "b2", title: "Blocker B", severity: "high", status: "not_run" },
      ],
      recentFailures: [{ id: "f1" }],
      queue: [{ id: "q1" }],
      jobs: [{ id: "j1" }],
      errors: [{ id: "e1" }],
      agentWorkspace: { agents: [{ id: "a1" }], synthesis: "ok" },
      emulators: { summary: { runningCount: 7 } },
      health: { systemHealth: "OK" },
      agentCore: { status: "running" },
    };

    const vm = qa.buildViewModel(payload);
    expect(vm.generatedAt).toBe("2026-05-18T10:00:00Z");
    expect(vm.blockers).toHaveLength(2);
    expect(vm.blockers[0].nextAction).toBeDefined();
    expect(vm.recentFailures).toHaveLength(1);
    expect(vm.agents).toHaveLength(1);
    expect(vm.synthesis).toBe("ok");
    expect(vm.emulators.summary.runningCount).toBe(7);
    expect(vm.agentCore.status).toBe("running");

    // Metrics
    const byId = Object.fromEntries(vm.metrics.map((m: any) => [m.id, m]));
    expect(byId["release-blockers"].value).toBe(3);
    expect(byId["release-blockers"].tone).toBe("danger");
    expect(byId["stale-evidence"].value).toBe(2);
    expect(byId["stale-evidence"].tone).toBe("warning");
    expect(byId["running-jobs"].value).toBe(1);
    expect(byId["running-jobs"].tone).toBe("info");
    expect(byId["queued-jobs"].value).toBe(4);
    expect(byId["queued-jobs"].tone).toBe("warning");
    expect(byId["failed-jobs"].value).toBe(0);
    expect(byId["failed-jobs"].tone).toBe("success");
    expect(byId["active-emulators"].value).toBe(2); // summary.activeEmulators takes precedence
    expect(byId["agents"].value).toBe(5); // from summary.activeAgents
    expect(byId["critical-errors"].value).toBe(1);
    expect(byId["critical-errors"].tone).toBe("danger");
    expect(byId["health"].value).toBe("degraded"); // summary.systemHealth takes precedence
    expect(byId["health"].tone).toBe("warning");
  });

  it("buildViewModel ist defensiv bei fehlenden Daten", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const vm = qa.buildViewModel(null);
    expect(vm.blockers).toEqual([]);
    expect(vm.metrics).toHaveLength(9);
    expect(vm.generatedAt).toBe("");
  });

  it("findBlocker sucht korrekt in blockers", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const payload = {
      blockers: [
        { id: "x1", title: "A", severity: "critical", status: "fail" },
        { id: "x2", title: "B", severity: "high", status: "pass" },
      ],
    };
    expect(qa.findBlocker(payload, "x1")?.title).toBe("A");
    expect(qa.findBlocker(payload, "x2")?.title).toBe("B");
    expect(qa.findBlocker(payload, "nope")).toBeNull();
    expect(qa.findBlocker(null, "x1")).toBeNull();
  });

  it("buildClipboardPayload erzeugt kompaktes Format", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const blocker = {
      id: "b1",
      title: "Test",
      status: "fail",
      severity: "critical",
      groupTitle: "QA",
      suiteRef: "suite-1",
      updatedAt: "2026-05-18",
      details: "Details here",
      nextAction: { label: "Do it", detail: "Do this" },
      documentation: "docs",
    };
    const compact = qa.buildClipboardPayload(blocker, "compact");
    expect(compact).toContain("Titel: Test");
    expect(compact).toContain("Status: fail");
    expect(compact).toContain("Severity: critical");
    expect(compact).toContain("Suite: suite-1");
    expect(compact).toContain("Nächste Aktion: Do it");
    expect(compact).toContain("Dokumentation: docs");
  });

  it("buildClipboardPayload erzeugt github Format", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const blocker = { id: "b1", title: "Bug", status: "fail", severity: "high" };
    const gh = qa.buildClipboardPayload(blocker, "github");
    expect(gh).toContain("## Bug");
    expect(gh).toContain("- Status: fail");
    expect(gh).toContain("### Details");
    expect(gh).toContain("### Nächste Aktion");
    expect(gh).toContain("### Dokumentation");
  });

  it("buildClipboardPayload erzeugt ai Format", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const blocker = { id: "b1", title: "Bug", prereqsMet: false, prereqReason: "missing adb" };
    const ai = qa.buildClipboardPayload(blocker, "ai");
    expect(ai).toContain("Analysiere folgenden MiniMaster Release-Blocker");
    expect(ai).toContain("PrereqsMet: false");
    expect(ai).toContain("PrereqReason: missing adb");
  });

  it("buildClipboardPayload erzeugt debug Format als JSON", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const blocker = { id: "b1", title: "Bug" };
    const debug = qa.buildClipboardPayload(blocker, "debug");
    expect(JSON.parse(debug)).toEqual(blocker);
  });

  it("buildClipboardPayload Default ist compact", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const payload = qa.buildClipboardPayload({ id: "x" });
    expect(payload).toContain("Titel: x");
  });

  it("blockers werden nach Severity > Status > Title sortiert", () => {
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "tabs", "qa-release-workspace.js"));
    const qa = globalScope.MM.qaReleaseWorkspace;
    const payload = {
      blockers: [
        { id: "c", title: "C", severity: "medium", status: "fail" },
        { id: "a", title: "A", severity: "critical", status: "not_run" },
        { id: "b", title: "B", severity: "critical", status: "fail" },
      ],
    };
    const vm = qa.buildViewModel(payload);
    expect(vm.blockers.map((b: any) => b.id)).toEqual(["b", "a", "c"]);
  });
});

describe("UI dashboard modules (Welle 3 - structural coverage)", () => {
  let globalScope: any;
  let load: (absPath: string) => any;

  beforeEach(() => {
    globalScope = {} as any;
    load = makeLoader(globalScope);
  });

  function mockDocument() {
    const byId = new Map<string, any>();
    const doc: any = {
      createElement(tag: string) {
        const el: any = { tagName: tag.toUpperCase(), children: [], attributes: {} as Record<string, string> };
        el.setAttribute = (name: string, value: string) => { el.attributes[name] = value; };
        el.getAttribute = (name: string) => el.attributes[name] || null;
        el.appendChild = (child: any) => { el.children.push(child); return child; };
        el.querySelector = (_sel: string) => null;
        el.querySelectorAll = (_sel: string) => [];
        el.addEventListener = () => {};
        el.removeEventListener = () => {};
        el.innerHTML = "";
        el.textContent = "";
        el.value = "";
        return el;
      },
      getElementById(id: string) {
        if (!byId.has(id)) {
          const el = doc.createElement("div");
          el.id = id;
          byId.set(id, el);
        }
        return byId.get(id);
      },
    };
    return doc;
  }

  it("affiliate-dashboard.js exportiert createAffiliateDashboard", () => {
    const doc = mockDocument();
    globalScope.document = doc;
    globalScope.callFunction = () => Promise.resolve({ data: { affiliates: [] } });
    globalScope.confirm = () => true;
    globalScope.alert = () => {};
    const exports = load(path.join(MODULES_DIR, "tabs", "affiliate-dashboard.js"));
    expect(typeof exports.createAffiliateDashboard).toBe("function");
  });

  it("b2b-dashboard.js exportiert createB2BDashboard", () => {
    const doc = mockDocument();
    globalScope.document = doc;
    globalScope.callFunction = () => Promise.resolve({ data: { organizations: [] } });
    globalScope.alert = () => {};
    const exports = load(path.join(MODULES_DIR, "tabs", "b2b-dashboard.js"));
    expect(typeof exports.createB2BDashboard).toBe("function");
  });

  it("pricing-management.js exportiert createPricingManagement", () => {
    const doc = mockDocument();
    globalScope.document = doc;
    globalScope.callFunction = () => Promise.resolve({ data: {} });
    const exports = load(path.join(MODULES_DIR, "tabs", "pricing-management.js"));
    expect(typeof exports.createPricingManagement).toBe("function");
  });

  it("revenue-analytics.js exportiert createRevenueAnalytics", () => {
    const doc = mockDocument();
    globalScope.document = doc;
    globalScope.callFunction = () => Promise.resolve({ data: {} });
    globalScope.db = {
      collection: () => ({
        get: () => Promise.resolve({ forEach: () => {} }),
        where: () => ({
          get: () => Promise.resolve({ forEach: () => {} }),
        }),
      }),
    };
    const exports = load(path.join(MODULES_DIR, "tabs", "revenue-analytics.js"));
    expect(typeof exports.createRevenueAnalytics).toBe("function");
  });
});
