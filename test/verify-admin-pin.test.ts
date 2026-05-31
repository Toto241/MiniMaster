import * as fs from "fs";
import * as path from "path";

describe("verifyAdminPin cloud function wiring", () => {
  const authSource = fs.readFileSync(path.join(__dirname, "..", "src", "auth.ts"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "admin-panel", "app.js"), "utf8");
  const sessionSource = fs.readFileSync(
    path.join(__dirname, "..", "admin-panel", "modules", "core", "session-manager.js"),
    "utf8"
  );

  it("exports verifyAdminPin, setOperatorAdminPin and getOperatorAdminPinStatus", () => {
    expect(authSource).toContain("export const verifyAdminPin");
    expect(authSource).toContain("export const setOperatorAdminPin");
    expect(authSource).toContain("export const getOperatorAdminPinStatus");
    expect(authSource).toContain("auth.verify_admin_pin");
  });

  it("requires admin PIN verification on T4 callables", () => {
    expect(authSource).toContain('requireAdminPinVerification(context, "resetOperatorAccounts")');
    expect(authSource).toContain('requireAdminPinVerification(context, "resetAllAuthUsers")');
  });

  it("session manager prompts for admin PIN on T4 promotion", () => {
    expect(sessionSource).toContain("promptForAdminPin");
    expect(sessionSource).toContain("_confirmAdminPin");
  });

  it("dashboard gates privileged actions with ensureOperatorTier", () => {
    expect(appSource).toContain("async function ensureOperatorTier");
    expect(appSource).toContain('ensureOperatorTier("T3")');
    expect(appSource).toContain('ensureOperatorTier("T4")');
    expect(appSource).toContain("initAdminPinCard");
    expect(appSource).toContain("getOperatorAdminPinStatus");
  });
});
