import { readFileSync } from "fs";
import * as path from "path";

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

const LANGS = ["de", "en", "es", "fr", "it"];

/**
 * Static contract for the iOS child task photo-proof upload (A2 of the
 * iOS↔Android parity plan). The iOS child app previously only displayed tasks
 * read-only; this pins the new upload flow and its reuse of the shared
 * `PhotoProofService` so it stays aligned with the backend `completeTask`
 * contract that `test/photo-proof-contract.test.ts` already guards.
 */
describe("iOS child task photo upload contract", () => {
  it("declares FirebaseStorage for the child app target", () => {
    const pkg = read("iosChildApp/Package.swift");
    expect(pkg).toContain(".product(name: \"FirebaseStorage\", package: \"firebase-ios-sdk\")");
  });

  it("documents that the shared PhotoProofService is added to the app target in Xcode", () => {
    const pkg = read("iosChildApp/Package.swift");
    expect(pkg).toContain("iosSharedServices/PhotoProofService.swift");
  });

  it("TaskProofView lets the child pick a photo and uploads via PhotoProofService", () => {
    const view = read("iosChildApp/Sources/MiniMasterChild/Views/TaskProofView.swift");
    expect(view).toContain("PhotosPicker");
    expect(view).toContain("PhotoProofService");
    expect(view).toContain("uploadProof(image:");
    // Must NOT re-implement the upload mechanics / storage path / completeTask
    // contract here — those live in the shared PhotoProofService.
    expect(view).not.toContain("httpsCallable");
    expect(view).not.toContain("putData");
    expect(view).not.toContain("proofs/\\("); // Swift-interpolated path construction
  });

  it("MainChildView wires the proof sheet, row action and surfaces task errors", () => {
    const main = read("iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift");
    expect(main).toContain(".sheet(item: $proofTask)");
    expect(main).toContain("TaskProofView(");
    expect(main).toContain("onSubmitProof");
    // taskError was previously dead state — it must now drive an alert.
    expect(main).toContain("showTaskError");
    expect(main).toMatch(/\.alert\([^)]*isPresented:\s*showTaskError/);
  });

  it("keeps the shared completeTask contract intact (taskId + photoUrl, no childId param)", () => {
    const svc = read("iosSharedServices/PhotoProofService.swift");
    expect(svc).toContain("httpsCallable(\"completeTask\")");
    expect(svc).toContain("\"taskId\": taskId");
    expect(svc).toContain("\"photoUrl\": urlString");

    // Ensure `childId` is used for the storage path only, not sent to
    // completeTask (backend derives UID from auth context).
    const payloadBlock =
      svc.match(/httpsCallable\("completeTask"\)\.call\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(payloadBlock).not.toContain("childId");
  });

  it("adds proof localization keys to all five languages", () => {
    for (const lang of LANGS) {
      const strings = read(
        `iosChildApp/Sources/MiniMasterChild/Resources/${lang}.lproj/Localizable.strings`
      );
      for (const key of [
        "childMain.task.action.submitProof",
        "childMain.tasks.errorTitle",
        "childMain.proof.pick",
        "childMain.proof.submit",
        "childMain.proof.uploading",
        "childMain.proof.error.load",
      ]) {
        expect(strings).toContain(`"${key}"`);
      }
    }
  });
});
