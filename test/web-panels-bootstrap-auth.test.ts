import { readFileSync } from "fs";
import * as path from "path";

describe("web panels bootstrap-only auth", () => {
  const webControlSource = readFileSync(path.join(__dirname, "..", "web-control", "app.js"), "utf8");
  const webControlHtml = readFileSync(path.join(__dirname, "..", "web-control", "index.html"), "utf8");
  const parentPanelHtml = readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const parentPanelApp = readFileSync(path.join(__dirname, "..", "parent-panel", "app.js"), "utf8");
  const childPanelHtml = readFileSync(path.join(__dirname, "..", "child-panel", "index.html"), "utf8");
  const childPanelApp = readFileSync(path.join(__dirname, "..", "child-panel", "app.js"), "utf8");

  it("disables direct legacy login in web-control (Stage 2 cutover)", () => {
    expect(webControlSource).not.toContain("generateCustomToken({ masterImei: masterImei, secretKey: secretKey })");
    // Stage 2: the dummy `login()` function and its disabled-message string
    // were removed entirely. The HTML form already had no secret-key input
    // (the legal-gate explains via prose). Verify both stay clean.
    expect(webControlSource).not.toMatch(/^function login\s*\(/m);
    expect(webControlSource).not.toMatch(/getElementById\(\s*['"]secret-key['"]\s*\)/);
    expect(webControlHtml).not.toContain("id=\"master-imei\"");
    expect(webControlHtml).not.toContain("id=\"secret-key\"");
    // The legal-gate prose still informs the user that secret-key login is gone:
    expect(webControlHtml).toContain("akzeptiert keine Secret-Key-Anmeldung");
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
