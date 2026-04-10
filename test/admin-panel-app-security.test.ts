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
    expect(extractFunctionBody(source, "renderPythonAutomationOverview")).not.toContain("overviewEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderPythonAutomationCatalog")).not.toContain("catalogEl.innerHTML = \"<div class='info'>Noch kein Python-Testkatalog geladen.");
    expect(extractFunctionBody(source, "renderPythonAutomationCatalog")).not.toContain("catalogEl.innerHTML = \"<div class='info'>Keine Testfälle passen auf die aktuellen Filter.");
    expect(extractFunctionBody(source, "renderPythonAutomationProtocolEditor")).not.toContain("summaryEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadPythonAutomationCatalog")).not.toContain("catalogEl.innerHTML");
    expect(extractFunctionBody(source, "renderPythonAutomationResult")).not.toContain("resultEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderPythonAutomationHistory")).not.toContain("historyEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadPythonAutomationHistory")).not.toContain("historyEl.innerHTML");
    expect(extractFunctionBody(source, "loadPythonAutomationEvidenceHistory")).not.toContain("historyEl.innerHTML");
    expect(extractFunctionBody(source, "renderQaArtifactsOverview")).not.toContain("el.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadSuiteRunHistory")).not.toContain("historyEl.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderQaPlatformOverview")).not.toContain("el.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderEmulatorLabOverview")).not.toContain("el.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderTestingRegisterOverview")).not.toContain("overviewEl.innerHTML = \"<div class='info'>Noch kein Testregister geladen.");
    expect(extractFunctionBody(source, "renderTestingRegisterStorage")).not.toContain("storageEl.innerHTML = \"<div class='info'>Speicherorte werden nach dem Laden des Registers angezeigt.");
    expect(extractFunctionBody(source, "renderTestingRegisterList")).not.toContain("automaticListEl.innerHTML = emptyHtml");
    expect(extractFunctionBody(source, "renderTestingRegisterList")).not.toContain("manualListEl.innerHTML = emptyHtml");
    expect(extractFunctionBody(source, "renderTestingRegisterList")).not.toContain("automaticListEl.innerHTML = emptyFilterHtml");
    expect(extractFunctionBody(source, "renderTestingRegisterList")).not.toContain("manualListEl.innerHTML = emptyFilterHtml");
    expect(extractFunctionBody(source, "loadTestingRegister")).not.toContain("automaticListEl.innerHTML = loadingHtml");
    expect(extractFunctionBody(source, "loadTestingRegister")).not.toContain("manualListEl.innerHTML = loadingHtml");
    expect(extractFunctionBody(source, "loadQaPlatformCatalog")).not.toContain("el.innerHTML = \"<div class='loading'>");
    expect(extractFunctionBody(source, "loadEmulatorLabOverview")).not.toContain("el.innerHTML = \"<div class='loading'>");
    expect(extractFunctionBody(source, "loadSuiteDeviceStatus")).not.toContain("el.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "loadSuiteCatalog")).not.toContain("el.innerHTML = \"<div class='info'>");
    expect(extractFunctionBody(source, "renderSuiteCatalog")).not.toContain("el.innerHTML = \"<div class='info'>");
  });

  it("contains dedicated DOM helpers for the QA runtime render paths", () => {
    expect(source).toContain("function createQaRuntimeBanner");
    expect(source).toContain("function createQaRefreshCard");
    expect(source).toContain("function createPythonRunStateContent");
    expect(source).toContain("function clearElementChildren");
    expect(source).toContain("function replaceElementWithState");
  });
});