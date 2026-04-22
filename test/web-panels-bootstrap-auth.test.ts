import { readFileSync } from "fs";
import * as path from "path";

describe("web panels bootstrap-only auth", () => {
  const webControlSource = readFileSync(path.join(__dirname, "..", "web-control", "app.js"), "utf8");
  const webControlHtml = readFileSync(path.join(__dirname, "..", "web-control", "index.html"), "utf8");
  const parentPanelHtml = readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const parentPanelApp = readFileSync(path.join(__dirname, "..", "parent-panel", "app.js"), "utf8");
  const childPanelHtml = readFileSync(path.join(__dirname, "..", "child-panel", "index.html"), "utf8");
  const childPanelApp = readFileSync(path.join(__dirname, "..", "child-panel", "app.js"), "utf8");

  it("disables direct legacy login in web-control", () => {
    expect(webControlSource).not.toContain("generateCustomToken({ masterImei: masterImei, secretKey: secretKey })");
    expect(webControlSource).toContain("Direct secret-key login is disabled.");
    expect(webControlHtml).not.toContain("id=\"master-imei\"");
    expect(webControlHtml).not.toContain("id=\"secret-key\"");
  });

  it("disables direct legacy login in child-panel", () => {
    expect(childPanelApp).not.toContain("const tokenFn = functions.httpsCallable(\"generateCustomToken\")");
    expect(childPanelApp).toContain("Direkte Secret-Key-Anmeldung ist deaktiviert.");
    expect(childPanelHtml).not.toContain("id=\"ticket-master-imei\"");
    expect(childPanelHtml).not.toContain("id=\"ticket-secret-key\"");
  });

  it("disables direct legacy login in parent-panel", () => {
    expect(parentPanelApp).not.toContain("const tokenFn = functions.httpsCallable(\"generateCustomToken\")");
    expect(parentPanelApp).toContain("Direkte Secret-Key-Anmeldung ist deaktiviert.");
    expect(parentPanelHtml).not.toContain("id=\"ticket-master-imei\"");
    expect(parentPanelHtml).not.toContain("id=\"ticket-secret-key\"");
  });
});
