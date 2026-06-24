import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("CodeQL workflow gate policy", () => {
  it("uses hard-fail policy outside pull requests", async () => {
    const workflow = await readUtf8(".github/workflows/codeql-analysis.yml");
    const analyzeStepBlock = workflow.match(
      /- name: Perform CodeQL Analysis[\s\S]*?with:\s*[\r\n]+\s*category:/,
    )?.[0] ?? "";

    expect(workflow).toContain("name: Perform CodeQL Analysis");
    expect(analyzeStepBlock).toContain("continue-on-error: ${{ github.event_name == 'pull_request' }}");
    expect(analyzeStepBlock).not.toContain("continue-on-error: true");
  });

  it("documents the explicit hard-gate policy for main", async () => {
    const workflow = await readUtf8(".github/workflows/codeql-analysis.yml");

    expect(workflow).toContain("push/schedule/workflow_dispatch on main: hard fail (release gate)");
    expect(workflow).toContain("pull_request: soft-fail fallback");
  });
});
