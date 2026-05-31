import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

describe("Auth migration phase 2 — client completion", () => {
  it("masterApp registers via registerAuthenticatedMaster without persisting secretKey", () => {
    const masterVm = read("masterApp/src/main/java/com/minimaster/masterapp/MasterViewModel.kt");
    const credentials = read("masterApp/src/main/java/com/minimaster/masterapp/MasterCredentialsRepository.kt");

    expect(masterVm).toContain('getHttpsCallable("registerAuthenticatedMaster")');
    expect(masterVm).not.toContain('getHttpsCallable("registerMasterDevice")');
    expect(masterVm).toContain("signInAnonymously()");
    expect(credentials).toContain("getMasterId");
    expect(credentials).toContain("saveMasterId");
    expect(credentials).toContain("purgeLegacySecretKey");
    expect(credentials).not.toMatch(/putString\("secret_key"/);
    expect(credentials).not.toContain("saveCredentials");
  });

  it("childApp pairs via pairAuthenticatedChild without IMEI payload", () => {
    const pairingVm = read("childApp/src/main/java/com/google/pairing/PairingViewModel.kt");
    const pairingScreen = read("childApp/src/main/java/com/google/pairing/PairingScreen.kt");

    expect(pairingVm).toContain('getHttpsCallable("pairAuthenticatedChild")');
    expect(pairingVm).toContain("signInAnonymously()");
    expect(pairingVm).not.toMatch(/validateToken\s*\(\s*token:\s*String,\s*childImei:\s*String\s*\)/);
    expect(pairingScreen).not.toContain("Child IMEI");
  });

  it("web-control uses bootstrap/custom-token auth only (no secretKey login)", () => {
    const webControl = read("web-control/app.js");
    expect(webControl).toContain("redeemMasterWebBootstrapToken");
    expect(webControl).toContain("signInWithCustomToken");
    expect(webControl).not.toContain("generateCustomToken({ masterImei: masterImei, secretKey: secretKey })");
  });

  it("iOS parent AuthService uses registerAuthenticatedMaster without local secretKey storage", () => {
    const authService = read("iosMasterApp/Sources/MiniMasterParent/Services/AuthService.swift");
    expect(authService).toContain("registerAuthenticatedMaster");
    expect(authService).not.toMatch(/let secretKey|var secretKey|secretKey\s*=/);
    expect(authService).not.toContain("KeychainHelper");
  });
});
