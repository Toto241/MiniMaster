import { readFileSync } from "fs";
import * as path from "path";

describe("web panels bootstrap-only auth", () => {
  const webControlSource = readFileSync(path.join(__dirname, "..", "web-control", "app.js"), "utf8");
  const webControlHtml = readFileSync(path.join(__dirname, "..", "web-control", "index.html"), "utf8");
  const childPanelSource = readFileSync(path.join(__dirname, "..", "child-panel", "index.html"), "utf8");

  it("disables direct legacy login in web-control", () => {
    expect(webControlSource).not.toContain("generateCustomToken({ masterImei: masterImei, secretKey: secretKey })");
    expect(webControlSource).toContain("Direct secret-key login is disabled.");
    expect(webControlHtml).not.toContain("id=\"master-imei\"");
    expect(webControlHtml).not.toContain("id=\"secret-key\"");
  });

  it("disables direct legacy login in child-panel", () => {
    expect(childPanelSource).not.toContain("const tokenFn = functions.httpsCallable(\"generateCustomToken\")");
    expect(childPanelSource).toContain("Direkte Secret-Key-Anmeldung ist deaktiviert.");
    expect(childPanelSource).not.toContain("id=\"ticket-master-imei\"");
    expect(childPanelSource).not.toContain("id=\"ticket-secret-key\"");
  });
});