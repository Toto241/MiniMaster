import { promises as fs } from "fs";
import * as path from "path";

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

describe("Workflow security gates", () => {
  it("requires secret leak guard in core CI workflows", async () => {
    const ciWorkflow = await readUtf8(".github/workflows/ci.yml");
    const nodeCiWorkflow = await readUtf8(".github/workflows/node-ci.yml");
    const deployWorkflow = await readUtf8(".github/workflows/deploy.yml");

    expect(ciWorkflow).toContain("name: Secret leak guard");
    expect(ciWorkflow).toContain("run: npm run guard:secrets");

    expect(nodeCiWorkflow).toContain("- run: npm run guard:secrets");

    expect(deployWorkflow).toContain("name: 'Run secret leak guard'");
    expect(deployWorkflow).toContain("run: npm run guard:secrets");
  });

  it("requires secret leak guard before release evidence export", async () => {
    const workflow = await readUtf8(".github/workflows/release-evidence.yml");

    const guardIdx = workflow.indexOf("name: Secret leak guard");
    const pipelineIdx = workflow.indexOf("name: Run release evidence pipeline");

    expect(guardIdx).toBeGreaterThan(-1);
    expect(pipelineIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(pipelineIdx);
  });

  it("enforces a successful CodeQL run when code scanning is available", async () => {
    const workflow = await readUtf8(".github/workflows/deploy.yml");

    expect(workflow).toContain("name: 'Wait for successful CodeQL run on this commit'");
    expect(workflow).toContain("actions/workflows/codeql-analysis.yml/runs?head_sha=");
    expect(workflow).toContain("if conclusion != \"success\"");
    expect(workflow).toContain("CodeQL gate passed.");
  });

  it("treats the CodeQL gate as non-blocking when code scanning is unavailable", async () => {
    const workflow = await readUtf8(".github/workflows/deploy.yml");

    // Private repos without GitHub Advanced Security cannot run code scanning;
    // the gate self-detects this and skips with a warning (compensating controls),
    // and auto-enforces again once code scanning becomes available.
    expect(workflow).toContain("def code_scanning_available");
    expect(workflow).toContain("CodeQL gate skipped (code scanning unavailable).");
  });
});
