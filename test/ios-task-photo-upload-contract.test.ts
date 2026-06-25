import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

/**
 * Static source-contract test for the iOS child task photo-proof upload (A2).
 *
 * No Xcode/macOS in CI — these assertions guard the wiring that lets the iOS
 * child app upload a proof photo and call `completeTask`, mirroring Android.
 * Actual runtime behaviour (PhotosPicker, Storage upload, parent review) must
 * be validated on a Mac + device.
 */
describe("iOS child task photo upload contract", () => {
  it("child app target links FirebaseStorage and compiles PhotoProofService", () => {
    const pkg = read("iosChildApp/Package.swift");
    expect(pkg).toContain(".product(name: \"FirebaseStorage\", package: \"firebase-ios-sdk\")");
    // PhotoProofService lives inside the target so SwiftPM/xcodebuild compiles it.
    expect(() =>
      read("iosChildApp/Sources/MiniMasterChild/Services/PhotoProofService.swift")
    ).not.toThrow();
  });

  it("MainChildView presents a proof sheet and a per-task proof trigger", () => {
    const view = read("iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift");
    expect(view).toContain(".sheet(item: $proofTask)");
    expect(view).toContain("TaskProofView(");
    // Proof button only for pending tasks.
    expect(view).toContain("if task.status == \"pending\"");
    expect(view).toContain("onSubmitProof");
  });

  it("TaskProofView uses PhotosPicker and delegates upload to PhotoProofService", () => {
    const proof = read("iosChildApp/Sources/MiniMasterChild/Views/TaskProofView.swift");
    expect(proof).toContain("PhotosPicker");
    expect(proof).toContain("@StateObject private var proofService = PhotoProofService()");
    expect(proof).toContain("proofService.uploadProof(image: image, childId: childId, taskId: task.id)");
  });

  it("shared PhotoProofService matches the completeTask backend contract", () => {
    const svc = read("iosChildApp/Sources/MiniMasterChild/Services/PhotoProofService.swift");
    expect(svc).toContain("httpsCallable(\"completeTask\")");
    expect(svc).toContain("\"taskId\": taskId");
    expect(svc).toContain("\"photoUrl\": urlString");
    // childId is derived from auth on the backend — never sent as a param.
    expect(svc).not.toContain("\"childId\"");
    expect(svc).toContain("\"proofs/\\(childId)/\\(taskId)/");
  });

  it("adds proof localization keys to all five locales", () => {
    const locales = ["de", "en", "es", "fr", "it"];
    for (const loc of locales) {
      const strings = read(
        `iosChildApp/Sources/MiniMasterChild/Resources/${loc}.lproj/Localizable.strings`
      );
      expect(strings).toContain("\"childMain.proof.button\"");
      expect(strings).toContain("\"childMain.proof.picker\"");
      expect(strings).toContain("\"childMain.proof.error.title\"");
      expect(strings).toContain("\"childMain.tasks.error.title\"");
    }
  });
});
