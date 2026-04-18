import * as fs from "fs";
import * as path from "path";
import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel QA flow integration", () => {
  it("loads evidence history from the backend and updates dependent QA views", async () => {
    const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    const refreshEl = context.document.createElement("div");
    elements.set("python-automation-protocol-history", historyEl);
    elements.set("qa-refresh-status", refreshEl);

    context.renderPythonAutomationOverview = jest.fn();
    context.renderPythonAutomationCatalog = jest.fn();
    context.renderQaArtifactsOverview = jest.fn();
    context.renderPythonAutomationProtocolEditor = jest.fn();
    context.rerenderTestingRegisterFromCache = jest.fn();

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        entries: [
          {
            createdAt: "2026-04-07T13:00:00Z",
            testId: "ios-xctest-parent",
            testTitle: "iOS XCTest Parent",
            status: "pass",
            operator: "qa-operator",
            evidenceRef: "EVID-777",
          },
        ],
        latestByTestId: {
          "ios-xctest-parent": { status: "pass", evidenceRef: "EVID-777" },
        },
      }),
    });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.resetQaRefreshStateForTests();
    const result = await exports.loadPythonAutomationEvidenceHistory();

    expect(fetchMock).toHaveBeenCalledWith("/api/commissioning/evidence?limit=80", {
      headers: { Accept: "application/json" },
    });
    expect(result).toMatchObject({ ok: true, message: "1 Nachweise geladen." });
    expect(historyEl.innerHTML).toContain("EVID-777");
    expect(context.renderPythonAutomationOverview).toHaveBeenCalled();
    expect(context.renderPythonAutomationCatalog).toHaveBeenCalled();
    expect(context.renderQaArtifactsOverview).toHaveBeenCalled();
    expect(context.renderPythonAutomationProtocolEditor).toHaveBeenCalled();
    expect(context.rerenderTestingRegisterFromCache).toHaveBeenCalled();
    expect(refreshEl.innerHTML).toContain("Nachweise geladen");
  });

  it("renders evidence history load failures into the QA view", async () => {
    const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    const refreshEl = context.document.createElement("div");
    elements.set("python-automation-protocol-history", historyEl);
    elements.set("qa-refresh-status", refreshEl);

    fetchMock.mockResolvedValue({
      ok: false,
      json: jest.fn().mockResolvedValue({ error: "Evidence Backend down" }),
    });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.resetQaRefreshStateForTests();
    const result = await exports.loadPythonAutomationEvidenceHistory();

    expect(result).toMatchObject({ ok: false, message: "Evidence Backend down" });
    expect(historyEl.innerHTML).toContain("Evidence Backend down");
    expect(refreshEl.innerHTML).toContain("Evidence Backend down");
  });

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

  it("builds reusable artifact export payloads from the selected run state", () => {
    const { exports } = loadAdminPanelTestExports();

    const selectedRun = {
      runId: "run-b",
      scenarioId: "scenario-b",
      result: { scenarioId: "scenario-b" },
    };

    exports.setQaPlatformCatalogPayloadForTests({
      androidScenarioMappings: [
        { scenarioId: "scenario-b", role: "child", testClass: "SyncSpec", testMethod: "resyncAfterReconnect" },
        { scenarioId: "scenario-a", role: "master", testClass: "IgnoreSpec", testMethod: "other" },
      ],
    });
    exports.setPythonCommissioningEvidenceHistoryForTests([
      { testId: "doc-1", evidenceRef: "DOC-1", status: "pass" },
    ]);

    const payload = exports.buildQaArtifactExportPayload(selectedRun, "2026-04-07T14:00:00Z");

    expect(payload).toMatchObject({
      exportedAt: "2026-04-07T14:00:00Z",
      selectedRun,
      evidenceSnapshot: [{ testId: "doc-1", evidenceRef: "DOC-1", status: "pass" }],
    });
    expect(payload.linkedAndroidMappings).toEqual([
      { scenarioId: "scenario-b", role: "child", testClass: "SyncSpec", testMethod: "resyncAfterReconnect" },
    ]);
  });

  it("exports the selected dual-device artifact with linked mappings and evidence snapshot", () => {
    const { exports, elements, context } = loadAdminPanelTestExports();

    const anchor = { href: "", download: "", click: jest.fn() };
    context.document.createElement = jest.fn(() => anchor);
    elements.set("qa-artifact-overview", { innerHTML: "" });
    elements.set("notification", { textContent: "", className: "", style: {} });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setQaArtifactFiltersForTests({ scenarioFilter: "scenario-b", selectedRunId: "run-b" });
    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "run-b",
        type: "dual-device",
        status: "finished",
        scenarioId: "scenario-b",
        profileId: "profile-b",
        result: { scenarioId: "scenario-b", overallStatus: "passed", faultModes: ["disconnect"] },
      },
    ]);
    exports.setQaPlatformCatalogPayloadForTests({
      androidScenarioMappings: [
        { scenarioId: "scenario-b", role: "child", testClass: "SyncSpec", testMethod: "resyncAfterReconnect" },
      ],
    });
    exports.setPythonCommissioningEvidenceHistoryForTests([
      { testId: "doc-1", testTitle: "Dokumentation 1", status: "pass", operator: "qa", evidenceRef: "DOC-1" },
    ]);

    exports.exportSelectedQaArtifact();

    expect(context.URL.createObjectURL).toHaveBeenCalled();
    const blobPayload = context.URL.createObjectURL.mock.calls[0][0];
    expect(blobPayload.parts[0]).toContain("\"scenarioId\": \"scenario-b\"");
    expect(blobPayload.parts[0]).toContain("\"testClass\": \"SyncSpec\"");
    expect(blobPayload.parts[0]).toContain("\"evidenceRef\": \"DOC-1\"");
    expect(anchor.download).toContain("dual-device-artifact-scenario-b-");
    expect(anchor.click).toHaveBeenCalled();
    expect(context.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("orchestrates QA dashboard loading across all sections and summarizes partial failures", async () => {
    const { exports, elements, context } = loadAdminPanelTestExports();

    const refreshEl = context.document.createElement("div");
    elements.set("qa-refresh-status", refreshEl);

    exports.setPythonOperatorRuntimeForTests(true);
    exports.resetQaRefreshStateForTests();

    context.loadPythonAutomationCatalog = jest.fn().mockResolvedValue({ ok: true, message: "catalog ok" });
    context.loadPythonAutomationHistory = jest.fn().mockResolvedValue({ ok: true, message: "history ok" });
    context.loadPythonAutomationEvidenceHistory = jest.fn().mockResolvedValue({ ok: true, message: "evidence ok" });
    context.loadQaSelfHealingStatus = jest.fn().mockResolvedValue({ ok: true, message: "self-healing ok" });
    context.loadTestingRegister = jest.fn().mockRejectedValue(new Error("register stale"));
    context.loadQaPlatformCatalog = jest.fn().mockRejectedValue(new Error("qa catalog missing"));
    context.loadEmulatorLabOverview = jest.fn().mockResolvedValue({ ok: true, message: "emulators ok" });
    context.loadSuiteCatalog = jest.fn().mockResolvedValue({ ok: true, message: "suites ok" });
    context.loadSuiteRunHistory = jest.fn().mockResolvedValue({ ok: true, message: "suite history ok" });
    context.loadSuiteDeviceStatus = jest.fn().mockResolvedValue({ ok: true, message: "devices ok" });

    const result = await exports.loadQaDashboardData("smoke-refresh");

    expect(result).toHaveLength(10);
    expect(context.loadPythonAutomationCatalog).toHaveBeenCalled();
    expect(context.loadQaPlatformCatalog).toHaveBeenCalled();
    expect(refreshEl.innerHTML).toContain("Anlass: smoke-refresh");
    expect(refreshEl.innerHTML).toContain("8/10 QA-Bereiche geladen, 2 mit Fehler");
    expect(refreshEl.innerHTML).toContain("register stale");
    expect(refreshEl.innerHTML).toContain("qa catalog missing");
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ sectionKey: "register", ok: false, message: "register stale" }),
      expect.objectContaining({ sectionKey: "qaPlatform", ok: false, message: "qa catalog missing" }),
    ]));
  });

  it("exposes the QA dashboard section loader registry for orchestration", () => {
    const { exports } = loadAdminPanelTestExports();

    const sections = exports.getQaDashboardSectionLoaders();

    expect(sections).toHaveLength(10);
    expect(sections.map((entry: [string, unknown]) => entry[0])).toEqual([
      "catalog",
      "history",
      "evidence",
      "selfHealing",
      "register",
      "qaPlatform",
      "emulators",
      "suites",
      "suiteHistory",
      "devices",
    ]);
    expect(sections.every((entry: [string, unknown]) => typeof entry[1] === "function")).toBe(true);
  });

  it("filters the testing register down to manual wave-1 backlog items in a UI-like flow", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const automaticListEl = { innerHTML: "" };
    const manualListEl = { innerHTML: "" };
    const typeFilterEl = { value: "all" };
    const sortEl = { value: "status" };
    const searchEl = { value: "" };
    const registerCardEl = { scrollIntoView: jest.fn() };

    elements.set("testing-register-list-automatic", automaticListEl);
    elements.set("testing-register-list-manual", manualListEl);
    elements.set("testing-register-type-filter", typeFilterEl);
    elements.set("testing-register-sort", sortEl);
    elements.set("testing-register-search", searchEl);
    elements.set("qa-register-card", registerCardEl);

    const payload = {
      items: [
        {
          id: "dt-parent-panel-login",
          title: "Parent-Panel-Login im Electron-Fenster geprüft",
          groupTitle: "Desktop: Betrieb & Integrations-Readiness",
          groupId: "functional-readiness-desktop",
          automationType: "manual",
          source: "platform-readiness",
          manualClass: "automation-backlog",
          automationWave: "wave-1",
          status: "not_run",
          severity: "high",
          owner: "QA Automation",
        },
        {
          id: "ma-task-reject-ui",
          title: "Task-Ablehnung im UI getestet",
          groupTitle: "MasterApp: Funktionale Readiness",
          groupId: "functional-readiness-masterapp",
          automationType: "manual",
          source: "platform-readiness",
          manualClass: "automation-backlog",
          automationWave: "wave-2",
          status: "not_run",
          severity: "medium",
          owner: "QA Automation",
        },
        {
          id: "ma-subscription-enforce",
          title: "Free-Tier-Limit wird erzwungen",
          groupTitle: "MasterApp: Funktionale Readiness",
          groupId: "functional-readiness-masterapp",
          automationType: "automatic",
          source: "repo-test",
          status: "pass",
          severity: "critical",
          owner: "Backend",
          suiteRef: "backend-subscription-enforcement",
        },
      ],
    };

    exports.setTestingRegisterPayloadForTests(payload);
    exports.applyTestingRegisterQuickFilter("manualBacklogWave1", { sort: "group" });

    expect(typeFilterEl.value).toBe("manualBacklogWave1");
    expect(sortEl.value).toBe("group");
    expect(registerCardEl.scrollIntoView).toHaveBeenCalled();
    expect(manualListEl.innerHTML).toContain("dt-parent-panel-login");
    expect(manualListEl.innerHTML).toContain("1 sichtbar (1 gefiltert / 3 gesamt)");
    expect(manualListEl.innerHTML).not.toContain("ma-task-reject-ui");
    expect(manualListEl.innerHTML).not.toContain("ma-subscription-enforce");
    expect(automaticListEl.innerHTML).toContain("Keine automatischen Tests passen auf die aktuellen Filter");
  });

  it("renders unsupported repo-tests through the QA register filter into the automatic panel", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const automaticListEl = { innerHTML: "" };
    const manualListEl = { innerHTML: "" };
    const typeFilterEl = { value: "all" };
    const sortEl = { value: "status" };
    const searchEl = { value: "" };
    const registerCardEl = { scrollIntoView: jest.fn() };

    elements.set("testing-register-list-automatic", automaticListEl);
    elements.set("testing-register-list-manual", manualListEl);
    elements.set("testing-register-type-filter", typeFilterEl);
    elements.set("testing-register-sort", sortEl);
    elements.set("testing-register-search", searchEl);
    elements.set("qa-register-card", registerCardEl);

    const payload = {
      items: [
        {
          id: "repo-unsupported-1",
          title: "masterApp/src/androidTest/.../UnmappedSpec.kt",
          groupTitle: "Repo-Tests: Unsupported / Not Yet Mapped",
          groupId: "repo-tests-unsupported",
          entryKind: "repo-test",
          automationType: "automatic",
          source: "repo-test",
          status: "pass",
          severity: "medium",
          owner: "QA Automation",
          suiteRef: "",
        },
        {
          id: "dt-parent-panel-login",
          title: "Parent-Panel-Login im Electron-Fenster geprüft",
          groupTitle: "Desktop: Betrieb & Integrations-Readiness",
          groupId: "functional-readiness-desktop",
          automationType: "manual",
          source: "platform-readiness",
          manualClass: "automation-backlog",
          automationWave: "wave-1",
          status: "not_run",
          severity: "high",
          owner: "QA Automation",
        },
      ],
    };

    exports.setTestingRegisterPayloadForTests(payload);
    exports.applyTestingRegisterQuickFilter("unsupported", { sort: "group", search: "unmapped" });

    expect(typeFilterEl.value).toBe("unsupported");
    expect(searchEl.value).toBe("unmapped");
    expect(automaticListEl.innerHTML).toContain("repo-unsupported-1");
    expect(automaticListEl.innerHTML).toContain("Repository-Test-Evidenz");
    expect(automaticListEl.innerHTML).toContain("Unsupported:");
    expect(manualListEl.innerHTML).toContain("Keine manuellen/dokumentierten Tests passen auf die aktuellen Filter");
    expect(manualListEl.innerHTML).not.toContain("dt-parent-panel-login");
  });

  it("stacks QA test case layouts vertically in the stylesheet", () => {
    const stylesheet = fs.readFileSync(path.join(__dirname, "..", "admin-panel", "styles.css"), "utf8");

    expect(stylesheet).toContain(".testing-register-panels {");
    expect(stylesheet).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(stylesheet).toContain(".python-automation-card-grid {");
  });
});
