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

    fetchMock.mockResolvedValueOnce({
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        entries: [
          {
            suiteId: "ios-xctest-parent",
            status: "passed",
            host: "mac-mini-01",
            xcodeVersion: "16.4",
            startedAt: "2026-04-07T13:10:00Z",
            logsRef: "logs/ios-parent.log",
            evidenceTargetId: "ios-xctest-parent",
            destination: { name: "iPhone 15" },
            artifacts: [{ kind: "xcresult", path: "artifacts/parent.xcresult", label: "xcresult" }],
          },
        ],
        latestBySuiteId: {
          "ios-xctest-parent": { status: "passed" },
        },
      }),
    });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.resetQaRefreshStateForTests();
    const result = await exports.loadPythonAutomationEvidenceHistory();

    expect(result).toMatchObject({ ok: true });
    expect(historyEl.innerHTML).toContain("EVID-777");
    expect(historyEl.innerHTML).toContain("Remote-Mac-Läufe");
    expect(historyEl.innerHTML).toContain("mac-mini-01");
    expect(historyEl.innerHTML).toContain("logs/ios-parent.log");
    expect(context.renderPythonAutomationOverview).toHaveBeenCalled();
    expect(context.renderPythonAutomationCatalog).toHaveBeenCalled();
    expect(context.renderQaTestWorkspace).toHaveBeenCalled();
    expect(context.renderPythonAutomationProtocolEditor).toHaveBeenCalled();
    expect(context.rerenderTestingRegisterFromCache).toHaveBeenCalled();
    expect(refreshEl.innerHTML).toContain("Nachweise geladen");
  });

  it("keeps evidence history visible when remote Mac history loading fails", async () => {
    const { exports, elements, fetchMock } = loadAdminPanelTestExports();

    const historyEl = { innerHTML: "" };
    elements.set("python-automation-protocol-history", historyEl);

    fetchMock
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: "Remote-Agent offline" }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    const result = await exports.loadPythonAutomationEvidenceHistory();

    expect(result).toMatchObject({ ok: true });
    expect(historyEl.innerHTML).toContain("EVID-777");
    expect(historyEl.innerHTML).toContain("Remote-Mac-Historie konnte nicht geladen werden: Remote-Agent offline");
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

  it("redirects android USB suites into the compatibility flow", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.startSuiteRun("android-usb-master");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exports.buildAndroidCompatibilityRequest().body.executionMode).toBe("single-master");
    expect(notificationEl.textContent).toContain("Android-Kompatibilität: Eltern-App");
  });

  it("redirects dual-device suites into the compatibility flow", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });

    exports.setPythonOperatorRuntimeForTests(true);

    await exports.startSuiteRun("android-e2e-shell-script");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(exports.buildAndroidCompatibilityRequest().body.executionMode).toBe("dual-device");
    expect(notificationEl.textContent).toContain("Android-Kompatibilität: Dual-Device");
  });

  it("routes dual-device suites into compatibility even when legacy serial config would have failed", async () => {
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
    expect(exports.buildAndroidCompatibilityRequest().body.executionMode).toBe("dual-device");
    expect(exports.buildAndroidCompatibilityRequest().body.masterSerial).toBe("auto");
    expect(exports.buildAndroidCompatibilityRequest().body.childSerial).toBe("auto");
    expect(notificationEl.textContent).toContain("Android-Kompatibilität: Dual-Device");
    expect(notificationEl.className).toBe("notification info");
  });

  it("rejects legacy Android direct-start request building", () => {
    const { exports } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterDeviceSerial: "emulator-5554",
        childDeviceSerial: "child serial with spaces",
      }),
    });

    expect(() => exports.buildSuiteRunRequest("android-e2e-shell-script")).toThrow(
      "Direktstarts für android-e2e-shell-script wurden entfernt.",
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
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          planHash: "plan-hash-ready",
          approvalRequired: false,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
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

    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/suites/android-automation-sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvalId: "",
        expectedPlanHash: "plan-hash-ready",
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

  it("requires a server-side warning approval before a warning-state sweep can start", async () => {
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "warning",
          canStart: false,
          planHash: "plan-hash-warning",
          approvalRequired: true,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 1,
          warnings: [
            {
              id: "register-blockers-open",
              tone: "danger",
              title: "1 Release-Blocker sind noch offen",
              detail: "Vor dem Sweep sollte geprüft werden, ob bekannte Blocker oder fehlende PASS-Nachweise die Auswertung verfälschen.",
            },
          ],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ runId: "autosweep-run-2" }),
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

    await exports.startAndroidAutomationSweep();

    expect(context.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(notificationEl.textContent).toContain("serverseitige Warnlagen-Freigabe");
  });

  it("stores a sweep approval and starts with the active approval id", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "warning",
          canStart: false,
          planHash: "plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "approved",
          canStart: true,
          planHash: "plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: true,
          activeApproval: {
            approvalId: "sweep-approval-1",
            approvedAt: "2026-04-20T10:00:00Z",
            approvedBy: "qa-admin-panel",
            expiresAt: "2026-04-20T18:00:00Z",
            warningIds: ["register-blockers-open"],
            planHash: "plan-hash-1",
          },
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ runId: "autosweep-run-3" }),
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

    await exports.requestAndroidAutomationSweepApproval();
    await exports.startAndroidAutomationSweep();

    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/suites/android-automation-sweep/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "qa-admin-panel", expectedPlanHash: "plan-hash-1" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/suites/android-automation-sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approvalId: "sweep-approval-1",
        expectedPlanHash: "plan-hash-1",
        installApk: true,
        uninstallFirst: false,
        skipActivation: false,
        parallel: false,
        timeoutSec: 7200,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });
    expect(notificationEl.textContent).toContain("Android-Automation-Sweep gestartet");
  });

  it("refreshes the cached sweep preflight after a stale sweep start conflict", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-sweep-install-apk", { checked: false });
    elements.set("qa-sweep-uninstall-first", { checked: false });
    elements.set("qa-sweep-skip-activation", { checked: false });
    elements.set("qa-sweep-parallel", { checked: false });
    elements.set("qa-sweep-timeout-sec", { value: "7200" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ suites: [] }) })
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
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          planHash: "plan-hash-old",
          approvalRequired: false,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: "Sweep-Plan ist veraltet.",
          requiresRefresh: true,
          currentPlanHash: "plan-hash-new",
          preflight: {
            status: "warning",
            canStart: false,
            planHash: "plan-hash-new",
            approvalRequired: true,
            hasActiveApproval: false,
            activeApproval: null,
            warningCount: 1,
            warnings: [{ id: "register-blockers-open", tone: "danger", title: "Neue Warnlage", detail: "Bitte neu freigeben." }],
            blockingCount: 0,
            blockingReasons: [],
          },
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    await exports.loadSuiteGuideData();

    await exports.startAndroidAutomationSweep();

    expect(exports.getAndroidAutomationSweepPreflightState()).toMatchObject({
      planHash: "plan-hash-new",
      approvalRequired: true,
      hasActiveApproval: false,
      warningCount: 1,
    });
    expect(notificationEl.textContent).toContain("Sweep-Plan ist veraltet");
    fetchMock.mockClear();
    await exports.ensureAndroidAutomationSweepPreflightLoaded();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks the sweep before POST when server preflight reports a hard blocker", async () => {
    const { exports, fetchMock, elements, context } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-sweep-install-apk", { checked: false });
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
          deviceProfiles: [{ profileId: "standard" }],
          dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
          androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "blocked",
          canStart: false,
          planHash: "plan-hash-blocked",
          approvalRequired: false,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 0,
          warnings: [],
          blockingCount: 1,
          blockingReasons: [
            {
              id: "toolchain-hard-blocker",
              tone: "danger",
              title: "Android-Labor nicht startbereit",
              detail: "ADB ist nicht verfügbar.",
            },
          ],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    await exports.loadSuiteGuideData();

    await exports.startAndroidAutomationSweep();

    expect(context.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(notificationEl.textContent).toContain("Android-Automation-Sweep blockiert: ADB ist nicht verfügbar.");
  });

  it("requires a server-side warning approval before a compatibility run can start", async () => {
    const { exports, fetchMock, elements, context } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-compat-execution-mode", { value: "single-master" });
    elements.set("qa-compat-install-apk", { checked: false });
    elements.set("qa-compat-uninstall-first", { checked: false });
    elements.set("qa-compat-skip-activation", { checked: false });
    elements.set("qa-compat-parallel", { checked: false });
    elements.set("qa-compat-timeout-sec", { value: "3600" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ suites: [] }) })
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
        json: jest.fn().mockResolvedValue({
          status: "warning",
          canStart: false,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "warning",
          canStart: false,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [{ id: "blocker-1", title: "Open Release Blocker", status: "fail", blockingForRelease: true, groupId: "core-suite" }] });
    await exports.loadSuiteGuideData();

    await exports.startAndroidCompatibilityRun();

    expect(context.confirm).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/suites/android-compatibility/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        executionMode: "single-master",
        androidVersions: ["14"],
        installApk: false,
        uninstallFirst: false,
        serial: "auto",
        suite: "commissioning",
        testFilter: "",
        selectedTestClasses: [],
        skipActivation: false,
        timeoutSec: 3600,
        apkPath: "",
      }),
    });
    expect(notificationEl.textContent).toContain("serverseitige Warnlagen-Freigabe");
  });

  it("stores a compatibility approval and starts with the active approval id", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-compat-execution-mode", { value: "dual-device" });
    elements.set("qa-compat-install-apk", { checked: true });
    elements.set("qa-compat-uninstall-first", { checked: false });
    elements.set("qa-compat-skip-activation", { checked: false });
    elements.set("qa-compat-parallel", { checked: true });
    elements.set("qa-compat-timeout-sec", { value: "7200" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ suites: [] }) })
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
        json: jest.fn().mockResolvedValue({
          status: "warning",
          canStart: false,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "approved",
          canStart: true,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: true,
          activeApproval: {
            approvalId: "compat-approval-1",
            approvedAt: "2026-04-20T10:00:00Z",
            approvedBy: "qa-admin-panel",
            expiresAt: "2026-04-20T18:00:00Z",
            warningIds: ["register-blockers-open"],
            planHash: "compat-plan-hash-1",
          },
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "approved",
          canStart: true,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: true,
          activeApproval: {
            approvalId: "compat-approval-1",
            approvedAt: "2026-04-20T10:00:00Z",
            approvedBy: "qa-admin-panel",
            expiresAt: "2026-04-20T18:00:00Z",
            warningIds: ["register-blockers-open"],
            planHash: "compat-plan-hash-1",
          },
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "approved",
          canStart: true,
          planHash: "compat-plan-hash-1",
          approvalRequired: true,
          hasActiveApproval: true,
          activeApproval: {
            approvalId: "compat-approval-1",
            approvedAt: "2026-04-20T10:00:00Z",
            approvedBy: "qa-admin-panel",
            expiresAt: "2026-04-20T18:00:00Z",
            warningIds: ["register-blockers-open"],
            planHash: "compat-plan-hash-1",
          },
          warningCount: 1,
          warnings: [{ id: "register-blockers-open", tone: "danger", title: "1 Release-Blocker sind noch offen", detail: "Warnung." }],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ runId: "compat-run-1", approvalId: "compat-approval-1", approvedAt: "2026-04-20T10:00:00Z", approvedBy: "qa-admin-panel", approvalWarnings: ["register-blockers-open"] }) });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [{ id: "blocker-1", title: "Open Release Blocker", status: "fail", blockingForRelease: true, groupId: "core-suite" }] });
    await exports.loadSuiteGuideData();

    await exports.requestAndroidCompatibilityApproval();
    await exports.startAndroidCompatibilityRun();

    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/suites/android-compatibility/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        executionMode: "dual-device",
        androidVersions: ["14"],
        installApk: true,
        uninstallFirst: false,
        masterSerial: "auto",
        childSerial: "auto",
        parallel: true,
        selectedScenarioIds: ["pairing"],
        selectedTestClasses: [],
        profileId: "",
        scenarioId: "",
        faultModes: [],
        timeoutSec: 7200,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/suites/android-compatibility/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        executionMode: "dual-device",
        androidVersions: ["14"],
        installApk: true,
        uninstallFirst: false,
        masterSerial: "auto",
        childSerial: "auto",
        parallel: true,
        selectedScenarioIds: ["pairing"],
        selectedTestClasses: [],
        profileId: "",
        scenarioId: "",
        faultModes: [],
        timeoutSec: 7200,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
        approvedBy: "qa-admin-panel",
        expectedPlanHash: "compat-plan-hash-1",
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/suites/android-compatibility/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        executionMode: "dual-device",
        androidVersions: ["14"],
        installApk: true,
        uninstallFirst: false,
        masterSerial: "auto",
        childSerial: "auto",
        parallel: true,
        selectedScenarioIds: ["pairing"],
        selectedTestClasses: [],
        profileId: "",
        scenarioId: "",
        faultModes: [],
        timeoutSec: 7200,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/suites/android-compatibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        executionMode: "dual-device",
        androidVersions: ["14"],
        installApk: true,
        uninstallFirst: false,
        masterSerial: "auto",
        childSerial: "auto",
        parallel: true,
        selectedScenarioIds: ["pairing"],
        selectedTestClasses: [],
        profileId: "",
        scenarioId: "",
        faultModes: [],
        timeoutSec: 7200,
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
        approvalId: "compat-approval-1",
        expectedPlanHash: "compat-plan-hash-1",
      }),
    });
    expect(notificationEl.textContent).toContain("Android-Kompatibilitätslauf gestartet");
  });

  it("refreshes the cached compatibility preflight after a stale compatibility start conflict", async () => {
    const { exports, fetchMock, elements } = loadAdminPanelTestExports();

    const notificationEl = createNotificationElement();
    elements.set("notification", notificationEl);
    elements.set("qa-start-guide", { innerHTML: "" });
    elements.set("qa-compat-execution-mode", { value: "single-child" });
    elements.set("qa-compat-install-apk", { checked: false });
    elements.set("qa-compat-uninstall-first", { checked: false });
    elements.set("qa-compat-skip-activation", { checked: false });
    elements.set("qa-compat-parallel", { checked: false });
    elements.set("qa-compat-timeout-sec", { value: "3600" });

    fetchMock
      .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ suites: [] }) })
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
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          planHash: "compat-old",
          approvalRequired: false,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          planHash: "compat-old",
          approvalRequired: false,
          hasActiveApproval: false,
          activeApproval: null,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({
          error: "Kompatibilitäts-Plan ist veraltet.",
          requiresRefresh: true,
          currentPlanHash: "compat-new",
          preflight: {
            status: "warning",
            canStart: false,
            planHash: "compat-new",
            approvalRequired: true,
            hasActiveApproval: false,
            activeApproval: null,
            warningCount: 1,
            warnings: [{ id: "register-blockers-open", tone: "danger", title: "Neue Kompatibilitäts-Warnlage", detail: "Bitte neu freigeben." }],
            blockingCount: 0,
            blockingReasons: [],
          },
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    await exports.loadSuiteGuideData();

    await exports.startAndroidCompatibilityRun();

    expect(exports.getAndroidCompatibilityPreflightState()).toMatchObject({
      planHash: "compat-new",
      approvalRequired: true,
      hasActiveApproval: false,
      warningCount: 1,
    });
    expect(notificationEl.textContent).toContain("Kompatibilitäts-Plan ist veraltet");
    fetchMock.mockClear();
    await exports.ensureAndroidCompatibilityPreflightLoaded();
    expect(fetchMock).not.toHaveBeenCalled();
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
