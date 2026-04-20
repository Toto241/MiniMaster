import * as fs from "fs";
import * as path from "path";
import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

function createDomSinkElement() {
  return {
    innerHTML: "",
    textContent: "",
    appendChild: jest.fn(function(this: any, child: any) {
      const next = String(child?.textContent || child?.innerHTML || "");
      this.innerHTML += next;
      this.textContent += next;
      return child;
    }),
    replaceChildren: jest.fn(function(this: any) {
      this.innerHTML = "";
      this.textContent = "";
    }),
  };
}

describe("admin-panel current QA helpers", () => {
  it("keeps the visible QA tab focused on runs, failures and details", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "admin-panel", "index.html"), "utf8");

    expect(html).toContain("Qualitätssicherung: Testläufe, Fehlerschwerpunkte und Ergebnisdetails");
    expect(html).toContain("Test-Triage &amp; Laufübersicht");
    expect(html).not.toContain("Priorisierte nächste Schritte");
  });

  it("sanitizes ADB serials and APK paths safely", () => {
    const { exports } = loadAdminPanelTestExports();

    expect(exports.sanitizeAdbSerial("emulator-5554")).toBe("emulator-5554");
    expect(exports.sanitizeAdbSerial("serial;rm -rf /")).toBe("");
    expect(exports.sanitizeApkPath("builds/app-release.apk", "fallback.apk")).toBe("builds/app-release.apk");
    expect(exports.sanitizeApkPath("bad\npath.apk", "fallback.apk")).toBe("fallback.apk");
  });

  it("renders the QA runtime banner for read-only and operator mode", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const banner = createDomSinkElement();
    const qaSection = {
      classList: { toggle: jest.fn() },
      querySelectorAll: jest.fn(() => []),
    };
    elements.set("qa-runtime-mode-banner", banner);
    elements.set("qa-refresh-card", qaSection);

    exports.setPythonOperatorRuntimeForTests(false);
    exports.renderQaRuntimeModeBanner();
    expect(banner.innerHTML).toContain("Read-only QA-Ansicht");

    exports.setPythonOperatorRuntimeForTests(true);
    exports.renderQaRuntimeModeBanner();
    expect(banner.innerHTML).toContain("Python-Operator aktiv");
  });

  it("derives execution-guide status from suite history instead of the removed suite catalog UI", () => {
    const { exports } = loadAdminPanelTestExports();

    exports.setSuiteCatalogPayloadForTests([]);

    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "run-1",
        suiteId: "android-unit-master",
        status: "finished",
        result: { status: "passed" },
      },
    ]);

    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    exports.setSuiteCatalogPayloadForTests([
      {
        suiteId: "android-unit-master",
        title: "Android Unit Master",
        group: "android",
        prereqsMet: true,
        testLevel: "module",
        testLevelLabel: "Modultests",
        appRole: "parent",
        appRoleLabel: "Eltern-App",
        executionProfiles: ["minimal", "standard", "full"],
      },
    ]);

    const guideData = exports.buildQaExecutionGuideData(
      { groups: [] },
      { items: [] },
      [
        {
          suiteId: "android-unit-master",
          title: "Android Unit Master",
          group: "android",
          prereqsMet: true,
          testLevel: "module",
          testLevelLabel: "Modultests",
          appRole: "parent",
          appRoleLabel: "Eltern-App",
          executionProfiles: ["minimal", "standard", "full"],
        },
      ],
    );

    expect(JSON.stringify(guideData)).toContain("android-unit-master");
    expect(JSON.stringify(guideData)).toContain("pass");
    expect(JSON.stringify(guideData)).toContain("Modultests");
    expect(JSON.stringify(guideData)).toContain("Eltern-App");
  });

  it("loads suite guide data via /api/suites and feeds renderQaExecutionGuide", async () => {
    const { exports, fetchMock, context } = loadAdminPanelTestExports();

    context.renderQaExecutionGuide = jest.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          suites: [
            {
              suiteId: "android-unit-master",
              title: "Android Unit Master",
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    const result = await exports.loadSuiteGuideData();

    expect(result).toMatchObject({ ok: true, message: "1 Suite(s) geladen." });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/suites", {
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/qa/catalog", {
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/suites/android-automation-sweep/preflight", {
      headers: { Accept: "application/json" },
    });
    expect(context.renderQaExecutionGuide).toHaveBeenCalled();
  });

  it("builds the Android automation sweep request from guide options and command builder defaults", () => {
    const { exports, elements, fetchMock } = loadAdminPanelTestExports({
      operatorCommandBuilderConfig: JSON.stringify({
        masterApkPath: "masterApp/custom-master.apk",
        childApkPath: "childApp/custom-child.apk",
      }),
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          suites: [
            {
              suiteId: "android-unit-master",
              title: "Android Unit Master",
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      });

    elements.set("qa-start-guide", createDomSinkElement());
    exports.setPythonOperatorRuntimeForTests(true);

    return exports.loadSuiteGuideData().then(() => {
      elements.set("qa-sweep-install-apk", { checked: true });
      elements.set("qa-sweep-uninstall-first", { checked: true });
      elements.set("qa-sweep-skip-activation", { checked: false });
      elements.set("qa-sweep-parallel", { checked: true });
      elements.set("qa-sweep-timeout-sec", { value: "9000" });

      expect(exports.buildAndroidAutomationSweepRequest()).toMatchObject({
        endpoint: "/api/suites/android-automation-sweep",
        body: {
          approvalId: "",
          installApk: true,
          uninstallFirst: true,
          skipActivation: false,
          parallel: true,
          timeoutSec: 9000,
          masterApkPath: "masterApp/custom-master.apk",
          childApkPath: "childApp/custom-child.apk",
        },
        historySuiteId: "android-automation-sweep",
        historyType: "android-automation-sweep",
      });
    });
  });

  it("renders the Android automation sweep as a fourth guide path from the canonical QA catalog", async () => {
    const { exports, elements, fetchMock } = loadAdminPanelTestExports();

    const guideEl = createDomSinkElement();
    elements.set("qa-start-guide", guideEl);

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          suites: [
            {
              suiteId: "android-unit-master",
              title: "Android Unit Master",
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          status: "ready",
          canStart: true,
          warningCount: 0,
          warnings: [],
          blockingCount: 0,
          blockingReasons: [],
        }),
      });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });

    await exports.loadSuiteGuideData();

    expect(guideEl.innerHTML).toContain("4. Android-Automation-Sweep");
    expect(guideEl.innerHTML).toContain("Sweep starten");
    expect(guideEl.innerHTML).toContain("Android 14");
  });

  it("renders server-side sweep blockers directly in the guide and disables the start button", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const guideEl = createDomSinkElement();
    elements.set("qa-start-guide", guideEl);

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    exports.setSuiteCatalogPayloadForTests([
      {
        suiteId: "android-unit-master",
        title: "Android Unit Master",
        prereqsMet: true,
      },
    ]);
    exports.setQaCatalogPayloadForTests({
      androidMatrix: [{ androidVersion: "14", status: "active" }],
      deviceProfiles: [{ profileId: "standard" }],
      dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
      androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }, { scenarioId: "pairing", role: "child" }],
    });
    exports.setAndroidAutomationSweepPreflightPayloadForTests({
      status: "blocked",
      canStart: false,
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
    });

    exports.renderQaExecutionGuide({ groups: [] }, { items: [] }, [
      {
        suiteId: "android-unit-master",
        title: "Android Unit Master",
        prereqsMet: true,
      },
    ]);

    expect(guideEl.innerHTML).toContain("Android-Labor nicht startbereit");
    expect(guideEl.innerHTML).toContain("ADB ist nicht verfügbar.");
    expect(guideEl.innerHTML).toContain("Sweep starten");
    expect(guideEl.innerHTML).toContain("disabled");
  });

  it("adds approval metadata to Android sweep history meta lines", () => {
    const { exports } = loadAdminPanelTestExports();

    const meta = exports.formatSuiteHistoryMeta({
      type: "android-automation-sweep",
      androidVersions: ["14"],
      approvedBy: "qa-admin-panel",
      approvedAt: "2026-04-20T10:00:00Z",
      approvalWarnings: ["register-blockers-open"],
      result: {
        summary: {
          counts: { total: 2, passed: 2, failed: 0, error: 0, skipped: 0 },
        },
      },
    });

    expect(meta).toContain("Android 14");
    expect(meta).toContain("PASS 2 · FAIL 0 · ERROR 0 · SKIP 0");
    expect(meta).toContain("Freigabe qa-admin-panel");
    expect(meta).toContain("1 Warnung(en) freigegeben");
  });

  it("derives advisory sweep readiness from catalog, register and recent Android run failures", () => {
    const { exports } = loadAdminPanelTestExports();

    exports.setQaCatalogPayloadForTests({
      androidMatrix: [{ androidVersion: "14", status: "active" }],
      deviceProfiles: [],
      dualDeviceScenarios: [{ scenarioId: "pairing", title: "Pairing" }],
      androidScenarioMappings: [{ scenarioId: "pairing", role: "master" }],
    });
    exports.setTestingRegisterPayloadForTests({
      items: [
        {
          id: "blocker-1",
          title: "Open Release Blocker",
          status: "fail",
          blockingForRelease: true,
          staleEvidence: true,
          evidenceRequired: true,
          hasSuccessfulRun: false,
          groupId: "core-suite",
        },
        {
          id: "unsupported-1",
          title: "Unsupported Repo Test",
          status: "not_run",
          groupId: "repo-tests-unsupported",
        },
      ],
    });
    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "autosweep-old-1",
        type: "android-automation-sweep",
        status: "finished",
        result: { overall_status: "error" },
      },
    ]);

    const readiness = exports.buildAdvisorySweepReadiness();

    expect(readiness.status).toBe("warning");
    expect(readiness.requiresConfirmation).toBe(true);
    expect(readiness.warningCount).toBeGreaterThanOrEqual(4);
    expect(readiness.warnings.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([
        "device-profiles-missing",
        "mapping-coverage-incomplete",
        "register-blockers-open",
        "stale-evidence-open",
        "unsupported-suite-mappings",
        "recent-android-failures",
      ]),
    );
  });

  it("renders the QA test workspace with current register and protocol targets", () => {
    const { exports, elements } = loadAdminPanelTestExports();

    const runOverviewEl = { innerHTML: "" };
    const failuresEl = { innerHTML: "" };
    const detailEl = { innerHTML: "" };
    elements.set("qa-test-run-overview", runOverviewEl);
    elements.set("qa-test-failures", failuresEl);
    elements.set("qa-test-detail", detailEl);
    elements.set("qa-test-copy-compact-btn", { disabled: false });
    elements.set("qa-test-copy-debug-btn", { disabled: false });

    exports.setPythonOperatorRuntimeForTests(true);

    exports.setTestingRegisterPayloadForTests({
      items: [
        {
          id: "register-1",
          title: "Register Item",
          action: "protocol",
          status: "fail",
          groupTitle: "QA",
          automationType: "manual",
          testLevel: "system",
          testLevelLabel: "Systemtests",
          appRole: "both",
          appRoleLabel: "Beide Apps",
          androidVersions: ["14", "15"],
          executionProfiles: ["standard", "full"],
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
            },
          ],
        },
      ],
    });
    exports.setPythonCommissioningLastRunForTests({
      runId: "run-1",
      overall: "pass",
      startedAt: "2026-04-19T10:00:00Z",
      evaluation: { statusCounts: { pass: 1, fail: 0, manual_required: 0 } },
      pending: [],
    });

    exports.renderQaTestWorkspace();

    expect(failuresEl.innerHTML).toContain("Register Item");
    expect(runOverviewEl.innerHTML).toContain("Python-Commissioning run-1");
  });
});
