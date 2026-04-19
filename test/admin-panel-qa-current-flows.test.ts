import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel current QA flows", () => {
  const createNotificationElement = () => ({
    textContent: "",
    className: "",
    style: { display: "none" },
  });

  it("loads evidence history and updates the visible dependent QA views", async () => {
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

  it("keeps the QA dashboard orchestration at five core loaders", () => {
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

  it("loads suite history together with guide data and refreshes guide plus workspace", async () => {
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          androidMatrix: [{ androidVersion: "14", status: "active" }],
          deviceProfiles: [{ profileId: "standard" }],
          dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
          androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    const result = await exports.loadSuiteRunHistory();

    expect(result).toMatchObject({ ok: true, message: "1 Suite-Läufe geladen." });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/suites/history");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/suites", {
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/qa/catalog", {
      headers: { Accept: "application/json" },
    });
    expect(context.renderQaExecutionGuide).toHaveBeenCalled();
    expect(context.renderQaTestWorkspace).toHaveBeenCalled();
    expect(historyEl.innerHTML).toContain("android-unit-master");
    expect(refreshEl.innerHTML).toContain("Suite-Läufe geladen");
  });

  it("filters the testing register by level, role, Android version and execution profile", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const automaticListEl = { innerHTML: "" };
    const manualListEl = { innerHTML: "" };
    elements.set("testing-register-list-automatic", automaticListEl);
    elements.set("testing-register-list-manual", manualListEl);
    elements.set("testing-register-type-filter", { value: "all" });
    elements.set("testing-register-sort", { value: "status" });
    elements.set("testing-register-search", { value: "" });
    elements.set("testing-register-level-filter", { value: "system" });
    elements.set("testing-register-role-filter", { value: "both" });
    elements.set("testing-register-android-filter", { value: "14" });
    elements.set("testing-register-profile-filter", { value: "standard" });

    exports.renderTestingRegisterList({
      items: [
        {
          id: "sys-dual-1",
          title: "Offline/Online Resync",
          groupTitle: "Dual Device",
          groupId: "dual-device",
          entryKind: "suite",
          automationType: "automatic",
          source: "suite",
          status: "pass",
          severity: "high",
          owner: "Engineering",
          testLevel: "system",
          testLevelLabel: "Systemtests",
          appRole: "both",
          appRoleLabel: "Beide Apps",
          androidVersions: ["14", "15"],
          executionProfiles: ["standard", "full"],
        },
        {
          id: "mod-parent-1",
          title: "Master ViewModel",
          groupTitle: "MasterApp",
          groupId: "master",
          entryKind: "repo-test",
          automationType: "automatic",
          source: "repo-test",
          status: "pass",
          severity: "medium",
          owner: "Engineering",
          testLevel: "module",
          testLevelLabel: "Modultests",
          appRole: "parent",
          appRoleLabel: "Eltern-App",
          androidVersions: ["14"],
          executionProfiles: ["minimal", "standard", "full"],
        },
      ],
    });

    expect(automaticListEl.innerHTML).toContain("sys-dual-1");
    expect(automaticListEl.innerHTML).not.toContain("mod-parent-1");
  });

  it("routes android USB suites through the dedicated QA endpoint", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports();

    elements.set("notification", createNotificationElement());

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ runId: "usb-run-1" }),
    });

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.startSuiteRun("android-usb-master");

    expect(fetchMock).toHaveBeenCalledWith("/api/suites/usb-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appId: "master",
        serial: "auto",
        suite: "commissioning",
      }),
    });
  });

  it("routes dual-device suites through the dedicated QA endpoint when distinct serials are configured", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterDeviceSerial: "emulator-5554",
        childDeviceSerial: "emulator-5556",
      }),
    });

    elements.set("notification", createNotificationElement());

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ runId: "dual-run-1" }),
    });

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.startSuiteRun("android-e2e-shell-script");

    expect(fetchMock).toHaveBeenCalledWith("/api/suites/dual-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterSerial: "emulator-5554",
        childSerial: "emulator-5556",
      }),
    });
  });

  it("blocks dual-device suite starts when both configured serials are identical", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterDeviceSerial: "emulator-5554",
        childDeviceSerial: "emulator-5554",
      }),
    });

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.startSuiteRun("android-e2e-shell-script");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(notificationEl.textContent).toContain("Master- und Child-ADB-Serial müssen unterschiedlich sein.");
    expect(notificationEl.className).toBe("notification error");
  });

  it("rejects invalid dual-device serial configuration before building the request", () => {
    const { exports } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterDeviceSerial: "emulator-5554",
        childDeviceSerial: "child serial with spaces",
      }),
    });

    expect(() => exports.buildSuiteRunRequest("android-e2e-shell-script")).toThrow(
      "Die konfigurierte Child-ADB-Serial ist ungültig.",
    );
  });

  it("starts the Android automation sweep through the dedicated QA endpoint", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });

    elements.set("notification", createNotificationElement());
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-sweep-install-apk", { checked: true });
    elements.set("qa-sweep-uninstall-first", { checked: false });
    elements.set("qa-sweep-skip-activation", { checked: true });
    elements.set("qa-sweep-parallel", { checked: true });
    elements.set("qa-sweep-timeout-sec", { value: "8100" });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ suites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          androidMatrix: [{ androidVersion: "14", status: "active" }],
          deviceProfiles: [{ profileId: "standard" }],
          dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
          androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ runId: "autosweep-run-1" }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    await exports.loadSuiteGuideData();

    await exports.startAndroidAutomationSweep();

    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/suites/android-automation-sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        installApk: true,
        uninstallFirst: false,
        skipActivation: true,
        parallel: true,
        timeoutSec: 8100,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });
  });

  it("requires explicit confirmation before starting the sweep when QA warnings are present", async () => {
    const { exports, fetchMock, elements, context } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-sweep-install-apk", { checked: true });
    elements.set("qa-sweep-uninstall-first", { checked: false });
    elements.set("qa-sweep-skip-activation", { checked: false });
    elements.set("qa-sweep-parallel", { checked: false });
    elements.set("qa-sweep-timeout-sec", { value: "7200" });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ suites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          androidMatrix: [{ androidVersion: "14", status: "active" }],
          deviceProfiles: [],
          dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
          androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({
      items: [
        {
          id: "blocker-1",
          title: "Open Release Blocker",
          status: "fail",
          blockingForRelease: true,
          groupId: "core-suite",
        },
      ],
    });
    await exports.loadSuiteGuideData();

    context.confirm.mockReturnValue(false);

    await exports.startAndroidAutomationSweep();

    expect(context.confirm).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notificationEl.textContent).toContain("Android-Automation-Sweep abgebrochen");
  });

  it("renders automation sweep runs in history with a dedicated label", async () => {
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
              runId: "autosweep-1",
              type: "android-automation-sweep",
              status: "finished",
              startedAt: "2026-04-19T10:00:00Z",
              androidVersions: ["14"],
              result: {
                overall_status: "passed",
                summary: { counts: { total: 2, passed: 2, failed: 0, error: 0, skipped: 0 } },
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ suites: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          androidMatrix: [{ androidVersion: "14", status: "active" }],
          deviceProfiles: [{ profileId: "standard" }],
          dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
          androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });

    await exports.loadSuiteRunHistory();

    expect(historyEl.innerHTML).toContain("Android-Automation-Sweep");
    expect(historyEl.innerHTML).toContain("Android 14");
  });
});
