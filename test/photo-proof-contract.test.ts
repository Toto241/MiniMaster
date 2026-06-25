import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

describe("photo proof upload contract", () => {
  it("keeps backend, storage rules, docs, and iOS shared upload limits aligned at 5 MB", () => {
    const tasks = read("src/tasks.ts");
    const storageRules = read("storage.rules");
    const apiDocs = read("API_DOCUMENTATION.md");
    const iosPhotoProof = read("iosChildApp/Sources/MiniMasterChild/Services/PhotoProofService.swift");

    expect(tasks).toContain("const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024");
    expect(storageRules).toContain("request.resource.size < 5 * 1024 * 1024");
    expect(apiDocs).toContain("256 bytes to 5 MB");
    expect(iosPhotoProof).toContain("size <= 5 * 1024 * 1024");
    expect(iosPhotoProof).toContain("max. 5 MB");
  });

  it("uses storage paths accepted by completeTask and Storage rules", () => {
    const tasks = read("src/tasks.ts");
    const storageRules = read("storage.rules");
    const androidPath = read("childApp/src/main/java/com/google/pairing/TaskProofStoragePath.kt");
    const iosPhotoProof = read("iosChildApp/Sources/MiniMasterChild/Services/PhotoProofService.swift");

    expect(tasks).toContain("`proofs/${childId}/`");
    expect(storageRules).toContain("match /proofs/{childId}/{taskId}/{fileName}");
    expect(androidPath).toContain("\"proofs/$normalizedChildId/$normalizedTaskId/$timestampMillis.jpg\"");
    expect(iosPhotoProof).toContain("\"proofs/\\(childId)/\\(taskId)/");
    expect(iosPhotoProof).not.toContain("children/\\(childId)/tasks");
  });
});
