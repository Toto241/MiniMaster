describe("firebase getAdminApp emulator branch", () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.GCLOUD_PROJECT;
    process.env.NODE_ENV = "test";
  });

  it("initializes with projectId when FUNCTIONS_EMULATOR is true", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GCLOUD_PROJECT = "emulator-project";

    const initializeApp = jest.fn();
    const getApps = jest.fn(() => []);
    const getApp = jest.fn(() => ({ name: "app" }));

    jest.doMock("firebase-admin/app", () => ({
      initializeApp,
      getApps,
      getApp,
    }));

    jest.isolateModules(() => {
      const mod = require("../firebase");
      mod.getAdminApp();
    });

    expect(initializeApp).toHaveBeenCalledWith({ projectId: "emulator-project" });
  });

  it("initializes without explicit options in production mode", () => {
    jest.resetModules();
    process.env.NODE_ENV = "production";
    process.env.FUNCTIONS_EMULATOR = "false";

    const initializeApp = jest.fn();
    const getApps = jest.fn(() => []);
    const getApp = jest.fn(() => ({ name: "app" }));
    const applicationDefault = jest.fn(() => "adc");

    jest.doMock("firebase-admin/app", () => ({
      initializeApp,
      getApps,
      getApp,
      applicationDefault,
    }));

    jest.isolateModules(() => {
      const mod = require("../firebase");
      mod.getAdminApp();
    });

    expect(initializeApp).toHaveBeenCalledWith({ credential: "adc" });
  });
});
