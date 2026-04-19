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

    exports.setSuiteRunHistoryPayloadForTests([
      {
        runId: "run-1",
        suiteId: "android-unit-master",
        status: "finished",
        result: { status: "passed" },
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
        },
      ],
    );

    expect(JSON.stringify(guideData)).toContain("android-unit-master");
    expect(JSON.stringify(guideData)).toContain("pass");
  });

  it("loads suite guide data via /api/suites and feeds renderQaExecutionGuide", async () => {
    const { exports, fetchMock, context } = loadAdminPanelTestExports();

    context.renderQaExecutionGuide = jest.fn();
    fetchMock.mockResolvedValue({
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
    });

    exports.setPythonOperatorRuntimeForTests(true);
    exports.setPythonCommissioningCatalogForTests({ groups: [] });
    exports.setTestingRegisterPayloadForTests({ items: [] });
    const result = await exports.loadSuiteGuideData();

    expect(result).toMatchObject({ ok: true, message: "1 Suite(s) geladen." });
    expect(fetchMock).toHaveBeenCalledWith("/api/suites", {
      headers: { Accept: "application/json" },
    });
    expect(context.renderQaExecutionGuide).toHaveBeenCalled();
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