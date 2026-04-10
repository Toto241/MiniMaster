import * as fs from "fs";
import * as path from "path";

function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) {
    throw new Error(`Function ${functionName} not found`);
  }

  const tail = source.slice(start);
  const nextFunctionIndex = tail.indexOf("\nfunction ", 1);
  return nextFunctionIndex >= 0 ? tail.slice(0, nextFunctionIndex) : tail;
}

describe("admin-panel app security regressions", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "admin-panel", "app.js"), "utf8");

  it("keeps selected QA render helpers free of innerHTML writes", () => {
    expect(extractFunctionBody(source, "renderQaRefreshStatus")).not.toContain("innerHTML");
    expect(extractFunctionBody(source, "updatePythonAutomationRunState")).not.toContain("innerHTML");
    expect(extractFunctionBody(source, "renderPythonAutomationProtocolRequirements")).not.toContain("innerHTML");
    expect(extractFunctionBody(source, "renderQaRuntimeModeBanner")).not.toContain("innerHTML");
    expect(extractFunctionBody(source, "renderPythonAutomationProtocolEditor")).not.toContain("summaryEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadPythonAutomationCatalog")).not.toContain("catalogEl.innerHTML");
    expect(extractFunctionBody(source, "renderPythonAutomationResult")).not.toContain("resultEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderPythonAutomationHistory")).not.toContain("historyEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadPythonAutomationHistory")).not.toContain("historyEl.innerHTML");
    expect(extractFunctionBody(source, "loadPythonAutomationEvidenceHistory")).not.toContain("historyEl.innerHTML");
  });

  it("contains dedicated DOM helpers for the QA runtime render paths", () => {
    expect(source).toContain("function createQaRuntimeBanner");
    expect(source).toContain("function createQaRefreshCard");
    expect(source).toContain("function createPythonRunStateContent");
    expect(source).toContain("function clearElementChildren");
    expect(source).toContain("function replaceElementWithState");
  });
});