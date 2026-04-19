/*
import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel QA flows", () => {
  it("laedt Nachweis-Historie und aktualisiert die sichtbaren QA-Folgeansichten", async () => {
    const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    const refreshEl = context.document.createElement("div");
    elements.set("python-automation-protocol-history", historyEl);
    elements.set("qa-refresh-status", refreshEl);

    context.renderPythonAutomationOverview = jest.fn();
    context.renderPythonAutomationCatalog = jest.fn();
    context.renderQaTestWorkspace = jest.fn();
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
            import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

            describe("admin-panel QA flows", () => {
              it("laedt Nachweis-Historie und aktualisiert die sichtbaren QA-Folgeansichten", async () => {
                const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

                const historyEl = { innerHTML: "" };
                const refreshEl = context.document.createElement("div");
                elements.set("python-automation-protocol-history", historyEl);
                elements.set("qa-refresh-status", refreshEl);

                context.renderPythonAutomationOverview = jest.fn();
                context.renderPythonAutomationCatalog = jest.fn();
                context.renderQaTestWorkspace = jest.fn();
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

                expect(result).toMatchObject({ ok: true, message: "1 Nachweise geladen." });
                expect(historyEl.innerHTML).toContain("EVID-777");
                expect(context.renderPythonAutomationOverview).toHaveBeenCalled();
                expect(context.renderPythonAutomationCatalog).toHaveBeenCalled();
                expect(context.renderQaTestWorkspace).toHaveBeenCalled();
                expect(context.renderPythonAutomationProtocolEditor).toHaveBeenCalled();
                expect(context.rerenderTestingRegisterFromCache).toHaveBeenCalled();
                expect(refreshEl.innerHTML).toContain("Nachweise geladen");
              });

              it("haelt die QA-Dashboard-Orchestrierung bei fuenf Kern-Loadern", () => {
                const { exports } = loadAdminPanelTestExports();

                const loaders = exports.getQaDashboardSectionLoaders();

                expect(loaders).toHaveLength(5);
                expect(loaders.map((entry: [string, unknown]) => entry[0])).toEqual([
                  "catalog",
                  "history",
                  "evidence",
                  "register",
                  "suiteHistory",
                ]);
              });

              it("laedt Suite-Historie zusammen mit den Startwegen und aktualisiert Guide und Workspace", async () => {
                const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

                const historyEl = { innerHTML: "" };
                const refreshEl = context.document.createElement("div");
                elements.set("suite-run-history", historyEl);
                elements.set("qa-refresh-status", refreshEl);

                context.renderQaExecutionGuide = jest.fn();
                context.renderQaTestWorkspace = jest.fn();
                context.loadTestingRegister = jest.fn();

                fetchMock
                  .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({
                      runs: [
                        {
                          runId: "run-1",
                          suiteId: "android-unit-master",
                          status: "finished",
                          startedAt: "2026-04-19T10:00:00Z",
                          result: { status: "passed" },
                        },
                      ],
                    }),
                  })
                  .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({
                      suites: [
                        {
                          suiteId: "android-unit-master",
                          title: "Android Unit Master",
                          group: "android",
                          prereqsMet: true,
                        },
                      ],
                    }),
                  });

                exports.setPythonOperatorRuntimeForTests(true);
                exports.setPythonCommissioningCatalogForTests({ groups: [] });
                exports.setTestingRegisterPayloadForTests({ items: [] });
                const result = await exports.loadSuiteRunHistory();

                expect(result).toMatchObject({ ok: true, message: "1 Suite-Läufe geladen." });
                expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/suites/history");
                expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/suites");
                expect(context.renderQaExecutionGuide).toHaveBeenCalled();
                expect(context.renderQaTestWorkspace).toHaveBeenCalled();
                expect(historyEl.innerHTML).toContain("android-unit-master");
                expect(refreshEl.innerHTML).toContain("Suite-Läufe geladen");
              });

              it("haelt den Triage-Workspace mit Register- und Python-Zielen funktionsfaehig", async () => {
                const { exports, elements, context } = loadAdminPanelTestExports();

                const workspaceEl = { innerHTML: "", scrollIntoView: jest.fn() };
                const registerCardEl = { scrollIntoView: jest.fn() };
                elements.set("qa-test-workspace", workspaceEl);
                elements.set("qa-register-card", registerCardEl);

                context.navigator.clipboard.writeText = jest.fn().mockResolvedValue(undefined);

                exports.setTestingRegisterPayloadForTests({
                  items: [
                    {
                      id: "register-1",
                      title: "Register Item",
                      status: "fail",
                      action: "protocol",
                      groupTitle: "QA",
                      automationType: "manual",
                    },
                  ],
                });
                exports.setPythonCommissioningCatalogForTests({
                  groups: [
                    {
                      title: "Python",
                      tests: [
                        {
                          id: "python-1",
                          title: "Python Test",
                          automationType: "documented",
                          source: "ios-external",
                        },
                      ],
                    },
                  ],
                });

                exports.renderQaTestWorkspace();
                expect(workspaceEl.innerHTML).toContain("Register Item");
                expect(workspaceEl.innerHTML).toContain("Python Test");

                exports.selectQaTestWorkspaceItem("register", "register-1");
                await exports.copySelectedQaTestItemCompact();

                expect(context.navigator.clipboard.writeText).toHaveBeenCalled();
              });
            });
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

  it("loads the QA release workspace payload and renders blocker, queue and agent synthesis data", async () => {
    const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

    const workspaceEl = { innerHTML: "" };
    const refreshEl = context.document.createElement("div");
    elements.set("qa-release-workspace", workspaceEl);
    elements.set("qa-refresh-status", refreshEl);

    context.MM = {
      qaReleaseWorkspace: {
        buildViewModel: jest.fn((payload: any) => ({
          ...payload,
          metrics: [
            { id: "release-blockers", label: "Release-Blocker", value: 1, tone: "danger" },
            { id: "health", label: "System-Health", value: "DEGRADED", tone: "warning" },
          ],
          agents: payload.agentWorkspace.agents,
          synthesis: payload.agentWorkspace.synthesis,
        })),
        findBlocker: jest.fn((payload: any, blockerId: string) => (payload.blockers || []).find((item: any) => item.id === blockerId) || null),
        buildClipboardPayload: jest.fn((blocker: any) => JSON.stringify(blocker)),
      },
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        generatedAt: "2026-04-19T12:00:00Z",
        summary: { blockingCount: 1, systemHealth: "DEGRADED", activeEmulators: 2, activeAgents: 5 },
        blockers: [
          {
            id: "failed-suite",
            title: "Failed Suite",
            status: "fail",
            severity: "high",
            groupTitle: "Testsuite",
            details: "Runner failed",
            suiteRef: "android-unit-master",
            nextAction: { label: "Suite erneut ausführen", detail: "Den Lauf erneut starten.", kind: "suite-run", suiteId: "android-unit-master" },
          },
        ],
        queue: [{ runId: "run-1", label: "android-unit-master", status: "running", type: "suite" }],
        recentFailures: [{ runId: "run-0", suiteId: "android-connected-child", status: "failed", message: "adb missing" }],
        health: { systemHealth: "DEGRADED", detectedIssues: [{ id: "issue-1" }], fixesApplied: [] },
        emulators: { summary: { runningCount: 2, reservationCount: 1 } },
        agentWorkspace: {
          agents: [
            { name: "validator", role: "validator", model: "runtime-rule-engine-v1", status: "completed", priority: "P0", summary: "Checked failures", confidence: 0.87, durationMs: 22 },
          ],
          synthesis: { summary: "One blocker remains", confidence: 0.88, findings: ["failed-suite"], risks: ["adb unstable"], recommendations: ["rerun suite"], status: "completed" },
        },
      }),
    });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.resetQaRefreshStateForTests();
    const result = await exports.loadQaReleaseWorkspace();

    expect(fetchMock).toHaveBeenCalledWith("/api/qa/release-workspace", { headers: { Accept: "application/json" } });
    expect(result).toMatchObject({ ok: true, message: "1 Blocker geladen." });
    expect(workspaceEl.innerHTML).toContain("Failed Suite");
    expect(workspaceEl.innerHTML).toContain("Queue & Jobs");
    expect(workspaceEl.innerHTML).toContain("validator");
    expect(workspaceEl.innerHTML).toContain("One blocker remains");
    expect(refreshEl.innerHTML).toContain("Python-Katalog");
  });

  it("copies selected QA release blocker in debug format", async () => {
    const { exports, elements, context } = loadAdminPanelTestExports();

    elements.set("qa-release-workspace", { innerHTML: "" });
    elements.set("notification", { textContent: "", className: "", style: {} });
    context.MM = {
      qaReleaseWorkspace: {
        buildViewModel: jest.fn((payload: any) => ({
          ...payload,
          metrics: [{ id: "release-blockers", label: "Release-Blocker", value: 1, tone: "danger" }],
          agents: [],
          synthesis: null,
        })),
        findBlocker: jest.fn((payload: any, blockerId: string) => (payload.blockers || []).find((item: any) => item.id === blockerId) || null),
        buildClipboardPayload: jest.fn((blocker: any, format: string) => `${format}:${blocker.id}`),
      },
    };

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setQaReleaseWorkspacePayloadForTests({
      generatedAt: "2026-04-19T12:00:00Z",
      summary: { blockingCount: 1, systemHealth: "OK" },
      blockers: [{ id: "failed-suite", title: "Failed Suite", status: "fail", severity: "high", groupTitle: "Testsuite", nextAction: { label: "Suite erneut ausführen", detail: "rerun", kind: "suite-run", suiteId: "android-unit-master" } }],
      recentFailures: [],
      queue: [],
      health: { systemHealth: "OK" },
      emulators: { summary: {} },
      agentWorkspace: { agents: [], synthesis: null },
    });
    exports.setQaReleaseSelectedBlockerIdForTests("failed-suite");

    await exports.copySelectedQaReleaseBlocker("debug");

    expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith("debug:failed-suite");
  });

  it("reruns selected QA release blocker via suite-run action", async () => {
    const { exports, elements, context, fetchMock } = loadAdminPanelTestExports();

    elements.set("qa-release-workspace", { innerHTML: "" });
    elements.set("suite-catalog", { innerHTML: "" });
    elements.set("notification", { textContent: "", className: "", style: {} });
    context.MM = {
      qaReleaseWorkspace: {
        buildViewModel: jest.fn((payload: any) => ({
          ...payload,
          metrics: [{ id: "release-blockers", label: "Release-Blocker", value: 1, tone: "danger" }],
          agents: [],
          synthesis: null,
        })),
        findBlocker: jest.fn((payload: any, blockerId: string) => (payload.blockers || []).find((item: any) => item.id === blockerId) || null),
        buildClipboardPayload: jest.fn(() => "payload"),
      },
    };

    fetchMock.mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({ runId: "run-99" }) });
    exports.setPythonOperatorRuntimeForTests(true);
    exports.setQaReleaseWorkspacePayloadForTests({
      generatedAt: "2026-04-19T12:00:00Z",
      summary: { blockingCount: 1, systemHealth: "OK" },
      blockers: [{ id: "failed-suite", title: "Failed Suite", status: "fail", severity: "high", groupTitle: "Testsuite", suiteRef: "android-unit-master", nextAction: { label: "Suite erneut ausführen", detail: "rerun", kind: "suite-run", suiteId: "android-unit-master" } }],
      recentFailures: [],
      queue: [],
      health: { systemHealth: "OK" },
      emulators: { summary: {} },
      agentWorkspace: { agents: [], synthesis: null },
    });
    exports.setQaReleaseSelectedBlockerIdForTests("failed-suite");

    await exports.rerunSelectedQaReleaseBlocker();

    expect(fetchMock).toHaveBeenCalledWith("/api/suites/run", expect.objectContaining({ method: "POST" }));
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
    context.loadTestingRegister = jest.fn().mockRejectedValue(new Error("register stale"));
    context.loadSuiteRunHistory = jest.fn().mockResolvedValue({ ok: true, message: "suite history ok" });

    const result = await exports.loadQaDashboardData("smoke-refresh");

    expect(result).toHaveLength(5);
    expect(context.loadPythonAutomationCatalog).toHaveBeenCalled();
    expect(context.loadSuiteRunHistory).toHaveBeenCalled();
    expect(refreshEl.innerHTML).toContain("Anlass: smoke-refresh");
    expect(refreshEl.innerHTML).toContain("4/5 QA-Bereiche geladen, 1 mit Fehler");
    expect(refreshEl.innerHTML).toContain("register stale");
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ sectionKey: "register", ok: false, message: "register stale" }),
    ]));
  });

  it("queues the manual self-healing run and refreshes the release workspace", async () => {
    const { exports, elements, fetchMock, context } = loadAdminPanelTestExports();

    const button = context.document.createElement("button");
    button.disabled = false;
    elements.set("qa-self-healing-run-btn", button);
    elements.set("qa-self-healing-auto-fix", { checked: false });

    context.showNotification = jest.fn();
    context.loadQaReleaseWorkspace = jest.fn().mockResolvedValue({ ok: true, message: "workspace ok" });
    context.renderQaSelfHealingStatus = jest.fn();

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ jobId: "job-self-healing-ui", status: "queued" }),
    });

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.runQaSelfHealingCycle();

    expect(fetchMock).toHaveBeenCalledWith("/api/qa/self-healing/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ autoFix: false }),
    });
    expect(context.showNotification).toHaveBeenCalledWith("Self-Healing-Job job-self-healing-ui eingereiht.", "success");
    expect(context.loadQaReleaseWorkspace).toHaveBeenCalled();
    expect(context.renderQaSelfHealingStatus).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });

  it("exposes the QA dashboard section loader registry for orchestration", () => {
    const { exports } = loadAdminPanelTestExports();

    const sections = exports.getQaDashboardSectionLoaders();

    expect(sections).toHaveLength(5);
    expect(sections.map((entry: [string, unknown]) => entry[0])).toEqual([
      "catalog",
      "history",
      "evidence",
      "register",
      "suiteHistory",
    ]);
    expect(sections.every((entry: [string, unknown]) => typeof entry[1] === "function")).toBe(true);
  });

  it("renders the focused QA triage workspace and copies the selected failure in debug format", async () => {
    const { exports, elements, context } = loadAdminPanelTestExports();

    const runOverviewEl = { innerHTML: "" };
    const failuresEl = { innerHTML: "" };
    const detailEl = { innerHTML: "" };
    elements.set("qa-test-run-overview", runOverviewEl);
    elements.set("qa-test-failures", failuresEl);
    elements.set("qa-test-detail", detailEl);
    elements.set("qa-test-copy-compact-btn", { disabled: false });
    elements.set("qa-test-copy-debug-btn", { disabled: false });
    elements.set("notification", { textContent: "", className: "", style: {} });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningLastRunForTests({
      runId: "run-123",
      overall: "fail",
      startedAt: "2026-04-20T08:00:00Z",
      finishedAt: "2026-04-20T08:03:00Z",
      evaluation: {
        statusCounts: { pass: 1, fail: 1, manual_required: 0 },
        checks: [
          { title: "Check fehlgeschlagen", status: "fail", details: "Timeout in Schritt 2" },
        ],
      },
      commands: { statusCounts: { pass: 0, fail: 0 }, results: [] },
      pending: [],
      evidenceCoverage: { counts: { total: 0, covered: 0, uncovered: 0, failed: 0 } },
    });
    exports.setPythonCommissioningHistoryRunsForTests([]);
    exports.setTestingRegisterPayloadForTests({
      items: [
        {
          id: "manual-proof",
          title: "Manueller Nachweis offen",
          groupTitle: "Dokumentation",
          groupId: "docs",
          automationType: "manual",
          action: "protocol",
          status: "manual_required",
          details: "Screenshot fehlt",
        },
      ],
    });
    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "suite-77",
        suiteId: "android-connected-child",
        status: "finished",
        startedAt: "2026-04-20T07:00:00Z",
        result: { status: "failed", reason: "adb missing" },
      },
    ]);

    exports.renderQaTestWorkspace();

    expect(runOverviewEl.innerHTML).toContain("Python-Commissioning run-123");
    expect(runOverviewEl.innerHTML).toContain("suite-77");
    expect(failuresEl.innerHTML).toContain("Check fehlgeschlagen");
    expect(failuresEl.innerHTML).toContain("Manueller Nachweis offen");
    expect(detailEl.innerHTML).toContain("Check fehlgeschlagen");
    expect(detailEl.innerHTML).toContain("Timeout in Schritt 2");

    await exports.copySelectedQaTestItemDebug();

    expect(context.navigator.clipboard.writeText).toHaveBeenCalled();
    const copiedPayload = context.navigator.clipboard.writeText.mock.calls.at(-1)[0];
    expect(copiedPayload).toContain('"kind": "python-check"');
    expect(copiedPayload).toContain('"title": "Check fehlgeschlagen"');
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
*/

describe.skip("legacy admin-panel-qa-flows", () => {});
