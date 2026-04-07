import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel QA flow integration", () => {
  it("filters evidence history by status and selected test in a UI-like flow", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    const statusFilterEl = { value: "fail" };
    const testFilterEl = { value: "ios-xctest-parent" };
    elements.set("python-automation-protocol-history", historyEl);
    elements.set("py-evidence-filter-status", statusFilterEl);
    elements.set("py-evidence-filter-testid", testFilterEl);

    const entries = [
      {
        createdAt: "2026-04-07T10:00:00Z",
        testId: "ios-xctest-parent",
        testTitle: "iOS XCTest Parent",
        status: "fail",
        operator: "qa-1",
        notes: "Timeout im XCTest",
      },
      {
        createdAt: "2026-04-07T09:00:00Z",
        testId: "android-master-registered",
        testTitle: "Android Master Registrierung",
        status: "pass",
        operator: "qa-2",
        evidenceRef: "ADB-LOG-1",
      },
    ];

    exports.setPythonCommissioningEvidenceHistoryForTests(entries);
    exports.renderPythonAutomationEvidenceHistory(entries);
    expect(historyEl.innerHTML).toContain("Alle</option>");
    expect(historyEl.innerHTML).toContain("iOS XCTest Parent");

    exports.applyPythonEvidenceFilter();

    expect(historyEl.innerHTML).toContain("1 von 2 Nachweisen werden angezeigt");
    expect(historyEl.innerHTML).toContain("Timeout im XCTest");
    expect(historyEl.innerHTML).not.toContain("ADB-LOG-1");
  });

  it("resets evidence filters back to the full history view", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    elements.set("python-automation-protocol-history", historyEl);
    elements.set("py-evidence-filter-status", { value: "fail" });
    elements.set("py-evidence-filter-testid", { value: "ios-xctest-parent" });

    const entries = [
      {
        createdAt: "2026-04-07T10:00:00Z",
        testId: "ios-xctest-parent",
        testTitle: "iOS XCTest Parent",
        status: "fail",
        operator: "qa-1",
        notes: "Timeout im XCTest",
      },
      {
        createdAt: "2026-04-07T09:00:00Z",
        testId: "android-master-registered",
        testTitle: "Android Master Registrierung",
        status: "pass",
        operator: "qa-2",
        evidenceRef: "ADB-LOG-1",
      },
    ];

    exports.setPythonCommissioningEvidenceHistoryForTests(entries);
    exports.renderPythonAutomationEvidenceHistory(entries);
    exports.applyPythonEvidenceFilter();
    exports.resetPythonEvidenceFilter();

    expect(historyEl.innerHTML).toContain("ADB-LOG-1");
    expect(historyEl.innerHTML).toContain("Timeout im XCTest");
    expect(historyEl.innerHTML).not.toContain("von 2 Nachweisen werden angezeigt");
  });

  it("re-renders the artifact overview when scenario and run selection change", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const overview = { innerHTML: "" };
    const scenarioFilterEl = { value: "scenario-b" };
    const runSelectEl = { value: "run-b" };
    elements.set("qa-artifact-overview", overview);
    elements.set("qa-artifact-scenario-filter", scenarioFilterEl);
    elements.set("qa-artifact-run-select", runSelectEl);

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "run-a",
        type: "dual-device",
        status: "finished",
        scenarioId: "scenario-a",
        profileId: "profile-a",
        result: { scenarioId: "scenario-a", overallStatus: "passed", faultModes: [] },
      },
      {
        runId: "run-b",
        type: "dual-device",
        status: "finished",
        scenarioId: "scenario-b",
        profileId: "profile-b",
        timeline: [{ phase: "sync", message: "Resync erfolgreich", timestamp: "2026-04-07T10:30:00Z" }],
        result: { scenarioId: "scenario-b", profileId: "profile-b", overallStatus: "failed", faultModes: ["disconnect"] },
      },
    ]);
    exports.setPythonCommissioningEvidenceHistoryForTests([
      { testId: "doc-1", testTitle: "Dokumentation 1", status: "pass", operator: "qa", evidenceRef: "DOC-1" },
    ]);
    exports.setQaPlatformCatalogPayloadForTests({
      dualDeviceScenarios: [
        { scenarioId: "scenario-a", title: "Scenario A" },
        { scenarioId: "scenario-b", title: "Scenario B" },
      ],
      androidScenarioMappings: [
        { scenarioId: "scenario-b", role: "master", testClass: "ReconnectSpec", testMethod: "showsRecoveryBanner" },
      ],
    });

    exports.renderQaArtifactsOverview();
    expect(overview.innerHTML).toContain("scenario-a");
    expect(overview.innerHTML).toContain("scenario-b");

    exports.applyQaArtifactFilters();

    expect(overview.innerHTML).toContain("Scenario B");
    expect(overview.innerHTML).toContain("run-b");
    expect(overview.innerHTML).toContain("ReconnectSpec");
    expect(overview.innerHTML).toContain("Resync erfolgreich");
    expect(overview.innerHTML).not.toContain("run-a");
  });
});
