import * as fs from "fs";
import * as path from "path";

describe("Android security configuration", () => {
  const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

  it("keeps debug receivers out of main manifests and disables backup", () => {
    const childMainManifest = read("childApp", "src", "main", "AndroidManifest.xml");
    const masterMainManifest = read("masterApp", "src", "main", "AndroidManifest.xml");

    expect(childMainManifest).toContain("android:allowBackup=\"false\"");
    expect(masterMainManifest).toContain("android:allowBackup=\"false\"");
    expect(childMainManifest).not.toContain("DebugBroadcastReceiver");
    expect(masterMainManifest).not.toContain("DebugBroadcastReceiver");
  });

  it("registers debug receivers only in debug manifests with exported false", () => {
    const childDebugManifest = read("childApp", "src", "debug", "AndroidManifest.xml");
    const masterDebugManifest = read("masterApp", "src", "debug", "AndroidManifest.xml");

    expect(childDebugManifest).toContain("DebugBroadcastReceiver");
    expect(masterDebugManifest).toContain("DebugBroadcastReceiver");
    expect(childDebugManifest).toContain("android:exported=\"false\"");
    expect(masterDebugManifest).toContain("android:exported=\"false\"");
  });
});