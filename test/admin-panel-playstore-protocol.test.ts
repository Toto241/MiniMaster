import { loadAdminPanelTestExports } from "./utils/admin-panel-test-harness";

describe("admin-panel Google Playstore compliance protocol", () => {
  const completeState = () => ({
    checks: {
      dataSafety: true,
      iarc: true,
      listing: true,
      privacyUrlLinked: true,
      permissionsDeclaration: true,
      appAccessGuide: true,
      securityRotationDone: true,
      goNoGoSignedOff: true,
    },
    privacyUrl: "https://minimaster.app/privacy",
    supportEmail: "privacy@minimaster.app",
    listingUrl: "https://play.google.com/console/u/0/developers/example/app/example/main-store-listing",
    releaseNotes: "Reviewer kann Eltern- und Kind-Flow mit Testkonto pruefen.",
    updatedAt: "2026-06-08T12:00:00.000Z",
  });

  it("builds a deterministic passing protocol for complete Play Store readiness", () => {
    const { exports } = loadAdminPanelTestExports();

    const protocol = exports.buildPlayStoreComplianceProtocol(completeState(), {
      generatedAt: "2026-06-08T12:30:00.000Z",
    });

    expect(protocol).toMatchObject({
      generatedAt: "2026-06-08T12:30:00.000Z",
      type: "google-playstore-compliance-protocol",
      ready: true,
      summary: { total: 8, completed: 8, ready: true },
      privacyUrl: "https://minimaster.app/privacy",
      supportEmail: "privacy@minimaster.app",
    });
    expect(protocol.checks).toHaveLength(8);
    expect(protocol.blockers).toEqual([]);
    expect(protocol.manualConsoleEvidenceRequired).toEqual(expect.arrayContaining([
      expect.stringContaining("Data-Safety"),
      expect.stringContaining("permissions declaration"),
      expect.stringContaining("Reviewer App Access"),
    ]));
  });

  it("keeps open checks and invalid metadata visible as protocol blockers", () => {
    const { exports } = loadAdminPanelTestExports();
    const partial = {
      ...completeState(),
      checks: { ...completeState().checks, iarc: false, permissionsDeclaration: false },
      privacyUrl: "http://insecure.example/privacy",
    };

    const protocol = exports.buildPlayStoreComplianceProtocol(partial, {
      generatedAt: "2026-06-08T12:30:00.000Z",
    });

    expect(protocol.ready).toBe(false);
    expect(protocol.summary).toEqual({ total: 8, completed: 6, ready: false });
    expect(protocol.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "check-iarc", type: "check" }),
      expect.objectContaining({ id: "check-permissionsDeclaration", type: "check" }),
      expect.objectContaining({ id: "invalid-privacy-url", type: "metadata" }),
    ]));
  });

  it("exports Play Store readiness with an embedded compliance protocol", () => {
    const { exports } = loadAdminPanelTestExports();
    const state = completeState();

    const protocol = exports.buildPlayStoreComplianceProtocol(state, { generatedAt: state.updatedAt });

    expect(protocol.ready).toBe(true);
    expect(protocol.checks.every((item: { passed: boolean }) => item.passed)).toBe(true);
  });
});
