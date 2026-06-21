import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

describe("task unlock documentation contract", () => {
  const docs = [
    "docs/TASK_UNLOCK_ARCHITECTURE.md",
    "docs/CHILDAPP_LOCK_LOGIC.md",
    "docs/TEST_SCENARIOS_TASK_UNLOCK.md",
  ];

  it("documents the current task statuses and callable names", () => {
    const combined = docs.map(read).join("\n");

    expect(combined).toContain("pending");
    expect(combined).toContain("pending_approval");
    expect(combined).toContain("approved");
    expect(combined).toContain("rejected");
    expect(combined).toContain("completeTask");
    expect(combined).toContain("approveTask");
    expect(combined).toContain("rejectTask");

    expect(combined).not.toMatch(/\bASSIGNED\b/);
    expect(combined).not.toMatch(/\bSUBMITTED\b/);
    expect(combined).not.toMatch(/\bAPPROVED\b/);
    expect(combined).not.toMatch(/\bREJECTED\b/);
    expect(combined).not.toContain("submitTaskProof");
    expect(combined).not.toContain("reviewTask");
    expect(combined).not.toContain("getPendingTask");
  });
});
