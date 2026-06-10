import { readFileSync } from "fs";
import * as path from "path";
import * as vm from "vm";

/**
 * Tests for admin-panel auto-management core module.
 * Covers ErrorWatcher, GeminiDiagnose, ActionPlanner, ManualGate,
 * StateMachine, Config, SystemHealth, and Logging.
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
      (_m, name) => `module.exports.${name} =`)
    .replace(/^\s*export\s+default\s+([A-Za-z_$][\w$]*);?\s*$/gm,
      (_m, name) => `module.exports = ${name};`)
    .replace(/^\s*export\s+default\s*\{[\s\S]*?\};?\s*$/gm,
      (_m) => "module.exports = {};");
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
      localStorage: globalScope.localStorage,
      setInterval: globalScope.setInterval,
      clearInterval: globalScope.clearInterval,
      fetch: globalScope.fetch,
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

function makeMockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem(key: string) { return store[key] || null; },
    setItem(key: string, value: string) { store[key] = value; },
    removeItem(key: string) { delete store[key]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); },
    _dump() { return { ...store }; },
  };
}

describe("auto-management.js core module", () => {
  let globalScope: any;
  let load: (absPath: string) => any;
  let localStorageMock: ReturnType<typeof makeMockLocalStorage>;

  let intervals: any[] = [];

  beforeEach(() => {
    localStorageMock = makeMockLocalStorage();
    intervals = [];
    globalScope = {
      localStorage: localStorageMock,
      setInterval: (fn: any, ms: number) => {
        const id = setInterval(() => fn(), ms);
        intervals.push(id);
        return id;
      },
      clearInterval: (id: any) => clearInterval(id),
      fetch: jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) }),
    } as any;
    load = makeLoader(globalScope);
    load(path.join(MODULES_DIR, "core", "registry.js"));
    load(path.join(MODULES_DIR, "core", "auto-management.js"));
  });

  afterEach(() => {
    intervals.forEach((id) => clearInterval(id));
    intervals = [];
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  const getAuto = () => globalScope.MM.autoManagement;

  // ======================== ErrorWatcher ========================

  describe("ErrorWatcher", () => {
    it("startErrorWatcher startet einen Interval", () => {
      const auto = getAuto();
      const fetchFn = jest.fn().mockResolvedValue([]);
      expect(() => auto.startErrorWatcher(100, fetchFn)).not.toThrow();
      auto.stopErrorWatcher();
    });

    it("stopErrorWatcher beendet den Interval", () => {
      const auto = getAuto();
      const fetchFn = jest.fn().mockResolvedValue([]);
      auto.startErrorWatcher(100, fetchFn);
      expect(() => auto.stopErrorWatcher()).not.toThrow();
    });

    it("onNewErrors ruft Callback bei neuen Fehlern auf", async () => {
      const auto = getAuto();
      const errors = [{ timestamp: new Date().toISOString(), message: "Test" }];
      const fetchFn = jest.fn().mockResolvedValue(errors);
      const cb = jest.fn();

      auto.onNewErrors(cb);
      auto.startErrorWatcher(50, fetchFn);
      await new Promise(r => setTimeout(r, 150));
      auto.stopErrorWatcher();

      expect(cb).toHaveBeenCalled();
      expect(cb.mock.calls[0][0]).toEqual(errors);
    });

    it("Callback-Unsubscription funktioniert", async () => {
      const auto = getAuto();
      const errors = [{ timestamp: new Date().toISOString(), message: "Test" }];
      const fetchFn = jest.fn().mockResolvedValue(errors);
      const cb = jest.fn();

      const unsub = auto.onNewErrors(cb);
      unsub();
      auto.startErrorWatcher(50, fetchFn);
      await new Promise(r => setTimeout(r, 150));
      auto.stopErrorWatcher();

      expect(cb).not.toHaveBeenCalled();
    });

    it("fetchFn-Fehler werden geloggt", async () => {
      const auto = getAuto();
      const fetchFn = jest.fn().mockRejectedValue(new Error("Netzwerkfehler"));
      auto.startErrorWatcher(50, fetchFn);
      await new Promise(r => setTimeout(r, 150));
      auto.stopErrorWatcher();

      const logs = auto.getLogs();
      const failureLog = logs.find((l: any) => l.type === "error-watcher-failure");
      expect(failureLog).toBeDefined();
      expect(failureLog.message).toContain("Netzwerkfehler");
    });
  });

  // ======================== GeminiDiagnose ========================

  describe("GeminiDiagnose", () => {
    it("buildPrompt ersetzt {{ERROR_CONTEXT}}", () => {
      const auto = getAuto();
      const template = "Fehler: {{ERROR_CONTEXT}} Ende";
      const prompt = auto.buildPrompt(template, "Testfehler");
      expect(prompt).toBe("Fehler: Testfehler Ende");
    });

    it("buildPrompt serialisiert Objekte", () => {
      const auto = getAuto();
      const template = "Ctx: {{ERROR_CONTEXT}}";
      const prompt = auto.buildPrompt(template, { code: 500, msg: "Err" });
      expect(prompt).toContain("500");
      expect(prompt).toContain("Err");
    });

    it("callGeminiProxy nutzt Callable-Proxy wenn verfügbar", async () => {
      const auto = getAuto();
      const proxyResult = { text: "{\"diagnosis\":\"OK\"}", data: { text: "{\"diagnosis\":\"OK\"}" } };
      const proxyCallable = jest.fn().mockResolvedValue(proxyResult);

      const result = await auto.callGeminiProxy(
        { prompt: "Test", model: "gemini-test" },
        { proxyCallable, apiKey: null, model: "gemini-test", passphrase: null }
      );
      expect(proxyCallable).toHaveBeenCalled();
      expect(result.data || result).toEqual(proxyResult.data || proxyResult);
    });

    it("callGeminiProxy wirft Fehler ohne Proxy und ohne Key", async () => {
      const auto = getAuto();
      await expect(
        auto.callGeminiProxy(
          { prompt: "Test" },
          { proxyCallable: null, apiKey: null, model: "gemini-test", passphrase: null }
        )
      ).rejects.toThrow("Kein API-Key konfiguriert");
    });

    it("callGeminiProxy verwendet direkten Aufruf mit verschlüsseltem Key", async () => {
      const auto = getAuto();
      globalScope.fetch = (_url: string, _opts: any) => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "{\"diagnosis\":\"OK\"}" }] } }] }),
        text: () => Promise.resolve(""),
      });

      const encrypted = auto.storeApiKey("test-key-123", "passphrase");
      const result = await auto.callGeminiProxy(
        { prompt: "Test" },
        { proxyCallable: null, apiKey: encrypted, model: "gemini-test", passphrase: "passphrase" }
      );
      expect(result).toBeDefined();
    });

    it("diagnoseError parsed gültiges JSON", async () => {
      const auto = getAuto();
      globalScope.fetch = (_url: string, _opts: any) => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "{\"diagnosis\":\"Test-Diagnose\",\"severity\":\"low\",\"recommendedAction\":\"none\",\"reasoning\":\"R\",\"fallback\":\"F\"}" }] } }] }),
        text: () => Promise.resolve(""),
      });

      const encrypted = auto.storeApiKey("test-key", "pass");
      const result = await auto.diagnoseError({ msg: "Error" }, {
        proxyCallable: null, apiKey: encrypted, model: "gemini-test", passphrase: "pass"
      });
      expect(result.diagnosis).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result._logId).toBeDefined();
    });

    it("diagnoseError fällt bei ungültigem JSON zurück", async () => {
      const auto = getAuto();
      globalScope.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "kein json" }] } }] }),
        text: () => Promise.resolve(""),
      });

      const encrypted = auto.storeApiKey("test-key", "pass");
      const result = await auto.diagnoseError({ msg: "Error" }, {
        proxyCallable: null, apiKey: encrypted, model: "gemini-test", passphrase: "pass"
      });
      expect(result.diagnosis).toContain("Fehler bei der Gemini-Analyse");
      expect(result.severity).toBe("medium");
    });

    it("diagnoseError loggt Prompt und Antwort", async () => {
      const auto = getAuto();
      globalScope.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: "{\"diagnosis\":\"OK\"}" }] } }] }),
        text: () => Promise.resolve(""),
      });

      const encrypted = auto.storeApiKey("test-key", "pass");
      await auto.diagnoseError({ msg: "Error" }, {
        proxyCallable: null, apiKey: encrypted, model: "gemini-test", passphrase: "pass"
      });
      const logs = auto.getLogs({ type: "gemini-diagnose" });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].prompt).toContain("Error");
    });
  });

  // ======================== ActionPlanner ========================

  describe("ActionPlanner", () => {
    it("planAction erzeugt Aktion mit ID", () => {
      const auto = getAuto();
      const diagnosis = {
        type: "restart-service",
        recommendedAction: "restart-service",
        severity: "high",
        diagnosis: "D",
        reasoning: "R",
        fallback: "F",
        _logId: "log-1",
      };
      const action = auto.planAction(diagnosis, { msg: "Err" });
      expect(action.id).toBeDefined();
      expect(action.type).toBe("restart-service");
      expect(action.severity).toBe("high");
      expect(action._logId).toBe("log-1");
    });

    it("validateAction akzeptiert gültige Aktionen", () => {
      const auto = getAuto();
      expect(auto.validateAction({ recommendedAction: "restart-service" })).toBe(true);
      expect(auto.validateAction({ recommendedAction: "none" })).toBe(true);
      expect(auto.validateAction({ recommendedAction: "invalid" })).toBe(false);
    });

    it("planAction fällt auf 'none' bei ungültiger Aktion zurück", () => {
      const auto = getAuto();
      const diagnosis = {
        recommendedAction: "invalid-action",
        severity: "high",
        diagnosis: "D",
        reasoning: "R",
        fallback: "F",
      };
      const action = auto.planAction(diagnosis, { msg: "Err" });
      expect(action.type).toBe("none");
      expect(action.reasoning).toContain("Ungültige Aktion");
    });
  });

  // ======================== ManualGate ========================

  describe("ManualGate", () => {
    it("queuePendingAction fügt Aktion hinzu", () => {
      const auto = getAuto();
      const action = {
        id: "a-1",
        type: "restart-service",
        severity: "high",
        diagnosis: "D",
        reasoning: "R",
        fallback: "F",
        originalError: {},
        createdAt: new Date().toISOString(),
      };
      const queued = auto.queuePendingAction(action);
      expect(queued.id).toBe("a-1");
      expect(auto.getPendingActions()).toHaveLength(1);
    });

    it("getPendingActions gibt leeres Array zurück wenn nichts pending", () => {
      const auto = getAuto();
      expect(auto.getPendingActions()).toEqual([]);
    });

    it("removePendingAction entfernt Aktion", () => {
      const auto = getAuto();
      auto.queuePendingAction({ id: "a-1", type: "restart-service", severity: "high", diagnosis: "D", reasoning: "R", fallback: "F", originalError: {}, createdAt: new Date().toISOString() });
      const removed = auto.removePendingAction("a-1");
      expect(removed).toBe(true);
      expect(auto.getPendingActions()).toHaveLength(0);
    });

    it("approveAction führt Executor aus", () => {
      const auto = getAuto();
      const action = { id: "a-1", type: "restart-service", severity: "high", diagnosis: "D", reasoning: "R", fallback: "F", originalError: {}, createdAt: new Date().toISOString() };
      auto.queuePendingAction(action);
      const executor = jest.fn().mockResolvedValue(undefined);
      const result = auto.approveAction("a-1", executor);
      expect(result.success).toBe(true);
      expect(result.action.id).toBe("a-1");
    });

    it("approveAction gibt Fehler wenn Aktion nicht gefunden", () => {
      const auto = getAuto();
      const result = auto.approveAction("missing-id", null);
      expect(result.success).toBe(false);
      expect(result.error).toContain("nicht in der Warteschlange");
    });

    it("rejectAction entfernt Aktion mit Grund", () => {
      const auto = getAuto();
      const action = { id: "a-1", type: "restart-service", severity: "high", diagnosis: "D", reasoning: "R", fallback: "F", originalError: {}, createdAt: new Date().toISOString() };
      auto.queuePendingAction(action);
      const result = auto.rejectAction("a-1", "Nicht notwendig");
      expect(result.success).toBe(true);
      expect(auto.getPendingActions()).toHaveLength(0);
    });

    it("rejectAction gibt Fehler bei fehlender Aktion", () => {
      const auto = getAuto();
      const result = auto.rejectAction("missing", "Grund");
      expect(result.success).toBe(false);
      expect(result.error).toContain("nicht in der Warteschlange");
    });

    it("approveAction triggert StateMachine-Transition", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      auto.transitionStateMachine(sm.id, "analyzing");
      auto.transitionStateMachine(sm.id, "pending-approval");
      const action = { id: "a-sm", type: "restart-service", severity: "high", diagnosis: "D", reasoning: "R", fallback: "F", originalError: {}, createdAt: new Date().toISOString(), _stateMachineId: sm.id };
      auto.queuePendingAction(action);
      const executor = () => Promise.resolve(undefined);
      const result = auto.approveAction("a-sm", executor);
      expect(result.success).toBe(true);
      const updated = auto.getStateMachine(sm.id);
      expect(updated.state).toBe("executing");
    });
  });

  // ======================== StateMachine ========================

  describe("StateMachine", () => {
    it("createStateMachine erzeugt Machine mit detected State", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      expect(sm.id).toBeDefined();
      expect(sm.state).toBe("detected");
      expect(sm.history).toHaveLength(1);
    });

    it("getStateMachine gibt Machine zurück", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      const fetched = auto.getStateMachine(sm.id);
      expect(fetched.id).toBe(sm.id);
    });

    it("listStateMachines gibt alle Machines zurück", () => {
      const auto = getAuto();
      auto.createStateMachine({ error: "a" });
      auto.createStateMachine({ error: "b" });
      const all = auto.listStateMachines();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it("transitionStateMachine führt gültige Transition aus", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      const result = auto.transitionStateMachine(sm.id, "analyzing");
      expect(result.success).toBe(true);
      expect(result.stateMachine.state).toBe("analyzing");
    });

    it("transitionStateMachine verweigert ungültige Transition", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      const result = auto.transitionStateMachine(sm.id, "completed");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Ungültiger Zustandsübergang");
    });

    it("dismissStateMachine setzt auf dismissed", () => {
      const auto = getAuto();
      const sm = auto.createStateMachine({ error: "test" });
      auto.transitionStateMachine(sm.id, "analyzing");
      const result = auto.dismissStateMachine(sm.id, "Manuell geschlossen");
      expect(result.success).toBe(true);
      expect(result.stateMachine.state).toBe("dismissed");
    });

    it("listStateMachines filtert nach State", () => {
      const auto = getAuto();
      auto.createStateMachine({ error: "a" });
      const sm = auto.createStateMachine({ error: "b" });
      auto.transitionStateMachine(sm.id, "analyzing");
      const analyzing = auto.listStateMachines({ state: "analyzing" });
      expect(analyzing.length).toBe(1);
    });

    it("listStateMachines filtert nach since", () => {
      const auto = getAuto();
      auto.createStateMachine({ error: "old" });
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const filtered = auto.listStateMachines({ since: future });
      expect(filtered.length).toBe(0);
    });
  });

  // ======================== Config ========================

  describe("Config", () => {
    it("setGeminiConfig speichert und merged Konfiguration", () => {
      const auto = getAuto();
      auto.setGeminiConfig({ model: "custom-model" });
      const cfg = auto.getGeminiConfig();
      expect(cfg.model).toBe("custom-model");
    });

    it("getGeminiConfig gibt Defaults zurück", () => {
      const auto = getAuto();
      const cfg = auto.getGeminiConfig();
      expect(cfg.model).toBe("gemini-3.0-flash");
      expect(cfg.autoMode).toBe(false);
      expect(cfg.promptTemplate).toContain("{{ERROR_CONTEXT}}");
    });

    it("storeApiKey verschlüsselt und loadApiKey entschlüsselt", () => {
      const auto = getAuto();
      const encrypted = auto.storeApiKey("secret-key", "passphrase");
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe("secret-key");

      const decrypted = auto.loadApiKey("passphrase");
      expect(decrypted).toBe("secret-key");
    });

    it("loadApiKey gibt 'encrypted' ohne Passphrase zurück", () => {
      const auto = getAuto();
      auto.storeApiKey("secret", "pass");
      const result = auto.loadApiKey(null);
      expect(result).toBe("encrypted");
    });

    it("loadApiKey gibt null zurück wenn kein Key gespeichert", () => {
      const auto = getAuto();
      expect(auto.loadApiKey("pass")).toBeNull();
    });

    it("clearApiKey löscht gespeicherten Key", () => {
      const auto = getAuto();
      auto.storeApiKey("secret", "pass");
      auto.clearApiKey();
      expect(auto.loadApiKey("pass")).toBeNull();
    });

    it("storeApiKey wirft Fehler ohne Passphrase", () => {
      const auto = getAuto();
      expect(() => auto.storeApiKey("key", "")).toThrow("Passphrase erforderlich");
    });
  });

  // ======================== SystemHealth ========================

  describe("SystemHealth", () => {
    it("computeSystemHealth gibt healthy bei leerem System", () => {
      const auto = getAuto();
      const health = auto.computeSystemHealth([], [], []);
      expect(health.status).toBe("healthy");
      expect(health.activeAutomations).toBe(0);
      expect(health.pendingApprovals).toBe(0);
    });

    it("computeSystemHealth erkennt critical bei kritischen Pending", () => {
      const auto = getAuto();
      const health = auto.computeSystemHealth(
        [],
        [{ severity: "critical" }],
        []
      );
      expect(health.status).toBe("critical");
      expect(health.criticalPending).toBe(1);
    });

    it("computeSystemHealth erkennt degraded bei high Pending", () => {
      const auto = getAuto();
      const health = auto.computeSystemHealth(
        [],
        [{ severity: "high" }],
        []
      );
      expect(health.status).toBe("degraded");
      expect(health.highPending).toBe(1);
    });

    it("computeSystemHealth erkennt degraded bei vielen Fehlern", () => {
      const auto = getAuto();
      const logs = Array.from({ length: 3 }, (_, i) => ({
        type: "execution-failure",
        timestamp: new Date().toISOString(),
        id: `f-${i}`,
      }));
      const health = auto.computeSystemHealth([], [], logs);
      expect(health.status).toBe("degraded");
      expect(health.failedExecutions24h).toBe(3);
    });

    it("computeSystemHealth erkennt critical bei sehr vielen Fehlern", () => {
      const auto = getAuto();
      const logs = Array.from({ length: 6 }, (_, i) => ({
        type: "execution-failure",
        timestamp: new Date().toISOString(),
        id: `f-${i}`,
      }));
      const health = auto.computeSystemHealth([], [], logs);
      expect(health.status).toBe("critical");
      expect(health.failedExecutions24h).toBe(6);
    });

    it("computeSystemHealth zählt aktive Machines", () => {
      const auto = getAuto();
      const machines = [
        { state: "detected" },
        { state: "analyzing" },
        { state: "completed" },
        { state: "rejected" },
      ];
      const health = auto.computeSystemHealth(machines, [], []);
      expect(health.activeAutomations).toBe(2);
      expect(health.totalMachines).toBe(4);
    });

    it("computeSystemHealth setzt lastUpdated", () => {
      const auto = getAuto();
      const before = new Date().toISOString();
      const health = auto.computeSystemHealth([], [], []);
      expect(new Date(health.lastUpdated).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  // ======================== Logging ========================

  describe("Logging", () => {
    it("appendLog erzeugt Eintrag mit ID und Timestamp", () => {
      const auto = getAuto();
      const log = auto.appendLog({ type: "test", message: "M" });
      expect(log.id).toBeDefined();
      expect(log.timestamp).toBeDefined();
      expect(log.type).toBe("test");
    });

    it("getLogs gibt alle Logs zurück", () => {
      const auto = getAuto();
      auto.appendLog({ type: "a" });
      auto.appendLog({ type: "b" });
      const logs = auto.getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it("getLogs filtert nach type", () => {
      const auto = getAuto();
      auto.appendLog({ type: "special" });
      auto.appendLog({ type: "other" });
      const filtered = auto.getLogs({ type: "special" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe("special");
    });

    it("getLogs filtert nach stateMachineId", () => {
      const auto = getAuto();
      auto.appendLog({ type: "sm", stateMachineId: "sm-1" });
      auto.appendLog({ type: "sm", stateMachineId: "sm-2" });
      const filtered = auto.getLogs({ stateMachineId: "sm-1" });
      expect(filtered.length).toBe(1);
    });

    it("getLogs filtert nach since", () => {
      const auto = getAuto();
      auto.appendLog({ type: "old" });
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const filtered = auto.getLogs({ since: future });
      expect(filtered.length).toBe(0);
    });

    it("Logs werden auf 500 Einträge begrenzt", () => {
      const auto = getAuto();
      for (let i = 0; i < 510; i++) {
        auto.appendLog({ type: "flood", index: i });
      }
      const logs = auto.getLogs();
      expect(logs.length).toBe(500);
    });
  });

  // ======================== Konstanten ========================

  describe("Konstanten", () => {
    it("exportiert VALID_ACTIONS", () => {
      const auto = getAuto();
      expect(auto.VALID_ACTIONS).toContain("restart-service");
      expect(auto.VALID_ACTIONS).toContain("none");
    });

    it("exportiert STATE_TRANSITIONS", () => {
      const auto = getAuto();
      expect(auto.STATE_TRANSITIONS.detected).toContain("analyzing");
      expect(auto.STATE_TRANSITIONS.completed).toEqual([]);
    });

    it("exportiert DEFAULT_PROMPT_TEMPLATE", () => {
      const auto = getAuto();
      expect(auto.DEFAULT_PROMPT_TEMPLATE).toContain("{{ERROR_CONTEXT}}");
    });

    it("exportiert DEFAULT_MODEL", () => {
      const auto = getAuto();
      expect(auto.DEFAULT_MODEL).toBe("gemini-3.0-flash");
    });
  });
});
