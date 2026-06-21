import { readFileSync } from "fs";
import * as path from "path";

describe("Additional Panels CSP Hardening", () => {
  const adminPanelLogsHtml = readFileSync(path.join(__dirname, "..", "admin-panel", "logs.html"), "utf8");
  const adminPanelLogsJs = readFileSync(path.join(__dirname, "..", "admin-panel", "logs.js"), "utf8");
  const startHtml = readFileSync(path.join(__dirname, "..", "start.html"), "utf8");
  const startJs = readFileSync(path.join(__dirname, "..", "start.js"), "utf8");
  const parentPanelHtml = readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const launcherHtml = readFileSync(path.join(__dirname, "..", "desktop", "launcher.html"), "utf8");
  const launcherJs = readFileSync(path.join(__dirname, "..", "desktop", "launcher.js"), "utf8");
  const adminModulesIndex = readFileSync(path.join(__dirname, "..", "admin-panel", "modules", "index.js"), "utf8");
  const cspRuntimeMigrator = readFileSync(
    path.join(__dirname, "..", "admin-panel", "modules", "core", "csp-runtime-migrator.js"),
    "utf8"
  );

  describe("admin-panel/logs.html", () => {
    it("removes all inline onclick handlers from logs.html", () => {
      expect(adminPanelLogsHtml).not.toMatch(/onclick\s*=/i);
    });

    it("replaces inline style display:none with is-hidden class", () => {
      expect(adminPanelLogsHtml).not.toContain("style=\"display:none\"");
      expect(adminPanelLogsHtml).toContain("is-hidden");
    });

    it("has event binding functions in logs.js", () => {
      expect(adminPanelLogsJs).toContain("bindLogsUiActions");
      expect(adminPanelLogsJs).toContain("addEventListener");
    });
  });

  describe("start.html bootstrap page", () => {
    it("removes all inline onclick handlers from start.html", () => {
      expect(startHtml).not.toMatch(/onclick\s*=/i);
    });

    it("removes all inline style attributes from start.html", () => {
      expect(startHtml).not.toMatch(/style\s*=\s*"/i);
    });

    it("references external start.js file", () => {
      expect(startHtml).toContain("<script src=\"./start.js\"></script>");
    });

    it("has event binding functions in start.js", () => {
      expect(startJs).toContain("bindStartPageUiActions");
    });
  });

  describe("desktop/launcher.html", () => {
    it("removes inline script from launcher.html", () => {
      expect(launcherHtml).not.toContain("idleTimeoutMs");
    });

    it("references external launcher.js file", () => {
      expect(launcherHtml).toContain("<script src=\"./launcher.js\"></script>");
    });

    it("has idle timeout setup in launcher.js", () => {
      expect(launcherJs).toContain("idleTimeoutMs");
    });
  });

  describe("parent-panel/index.html", () => {
    it("uses SRI for Firebase App Check like the other web panels", () => {
      expect(parentPanelHtml).toContain("firebase-app-check-compat.js");
      expect(parentPanelHtml).toContain("integrity=\"sha384-HTm9DHQcJ0avSI5BWVmeKtm3+YULHbl/wgtLQaMGgYEZLQ8cINY+UF+ZsliUaBvK\"");
      expect(parentPanelHtml).toContain("crossorigin=\"anonymous\"");
    });
  });

  describe("admin-panel generated DOM CSP compatibility", () => {
    it("loads the runtime migrator before legacy app.js executes", () => {
      expect(adminModulesIndex).toContain("import \"./core/csp-runtime-migrator.js\";");
    });

    it("migrates generated inline events without eval or new Function", () => {
      expect(cspRuntimeMigrator).toContain("onclick");
      expect(cspRuntimeMigrator).toContain("onchange");
      expect(cspRuntimeMigrator).toContain("MutationObserver");
      expect(cspRuntimeMigrator).toContain("addEventListener");
      expect(cspRuntimeMigrator).not.toContain("new Function");
      expect(cspRuntimeMigrator).not.toContain("eval(");
    });

    it("migrates generated inline styles into stylesheet-backed classes", () => {
      expect(cspRuntimeMigrator).toContain("insertRule");
      expect(cspRuntimeMigrator).toContain("removeAttribute(\"style\")");
      expect(cspRuntimeMigrator).toContain("mm-csp-style-");
    });
  });
});
