import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("ios AuthService contract migration", () => {
  it("AuthService consumes registerAuthenticatedMaster masterId response instead of secretKey", async () => {
    const source = await readUtf8("iosMasterApp/Sources/MiniMasterParent/Services/AuthService.swift");
    expect(source).toContain("let masterId = data[\"masterId\"] as? String");
    expect(source).toContain("functions.httpsCallable(\"registerAuthenticatedMaster\").call(params)");
    expect(source).not.toContain("signIn(withCustomToken");
    expect(source).not.toContain("let secretKey = data[\"secretKey\"] as? String");
    expect(source).not.toContain("httpsCallable(\"generateCustomToken\")");
    expect(source).not.toContain("KeychainHelper");
  });

  it("iOS README documents authenticated registration flow and no legacy secretKey login", async () => {
    const readme = await readUtf8("iosMasterApp/README.md");
    expect(readme).toContain("registerAuthenticatedMaster(deviceId, deviceName?)");
    expect(readme).toContain("{ masterId }");
    expect(readme).toContain("FirebaseAuth-Sessionpersistenz");
    expect(readme).not.toContain("registerMasterDevice(name) → { imei, secretKey }");
    expect(readme).not.toContain("{ masterId, customToken }");
    expect(readme).not.toContain("login(imei, secretKey, appVersion)");
    expect(readme).not.toContain("KeychainHelper.shared.load");
  });
});
