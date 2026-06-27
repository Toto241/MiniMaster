import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("CodeQL workflow gate policy", () => {
  it("hard-fails outside PRs only when code scanning is available", async () => {
    const workflow = await readUtf8(".github/workflows/codeql-analysis.yml");
    const analyzeStepBlock = workflow.match(
      /- name: Perform CodeQL Analysis[\s\S]*?with:\s*[\r\n]+\s*category:/,
    )?.[0] ?? "";

    expect(workflow).toContain("name: Perform CodeQL Analysis");
    // Soft-fail on PRs OR when code scanning is unavailable (private repo without
    // GHAS); hard-fail otherwise. Never unconditionally soft.
    expect(analyzeStepBlock).toContain("github.event_name == 'pull_request'");
    expect(analyzeStepBlock).toContain("steps.cs-check.outputs.available != 'true'");
    expect(analyzeStepBlock).not.toContain("continue-on-error: true");
  });

  it("detects code scanning availability so the gate self-adjusts", async () => {
    const workflow = await readUtf8(".github/workflows/codeql-analysis.yml");

    expect(workflow).toContain("name: Check code scanning availability");
    expect(workflow).toContain("id: cs-check");
  });

  it("documents the gate policy including the accepted-risk path", async () => {
    const workflow = await readUtf8(".github/workflows/codeql-analysis.yml");

    expect(workflow).toContain("push/schedule/workflow_dispatch on main: hard fail (release gate)");
    expect(workflow).toContain("pull_request: soft-fail fallback");
    expect(workflow).toContain("code scanning unavailable (private repo without GHAS): soft-fail");
  });
});
