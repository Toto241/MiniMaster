import * as fs from "fs";
import * as os from "os";
import * as path from "path";

jest.mock("firebase-admin", () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  firestore: jest.fn(),
  auth: jest.fn(),
}), { virtual: true });

describe("run-security-tests env resolution", () => {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("loads CI inputs from scripts/security-test.env when environment variables are unset", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "minimaster-security-env-"));
    const scriptsDir = path.join(tempRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "security-test.env"),
      [
        "SECURITY_TEST_ADMIN_EMAIL=admin@example.com",
        "SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED=true",
        "SECURITY_TEST_FUNCTIONS_DEPLOYED=true",
        "SECURITY_TEST_SERVICE_ACCOUNT=serviceAccountKey.json",
      ].join("\n"),
      "utf8",
    );

    fs.copyFileSync(
      path.join(originalCwd, "scripts", "run-security-tests.js"),
      path.join(scriptsDir, "run-security-tests.js"),
    );

    process.chdir(tempRoot);
    delete process.env.SECURITY_TEST_ADMIN_EMAIL;
    delete process.env.SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED;
    delete process.env.SECURITY_TEST_FUNCTIONS_DEPLOYED;
    delete process.env.SECURITY_TEST_SERVICE_ACCOUNT;

    const runner = require(path.join(scriptsDir, "run-security-tests.js"));
    const options = runner.parseArgs(["--mode", "ci"]);

    expect(options.adminEmail).toBe("admin@example.com");
    expect(options.unauthorizedAccessFailed).toBe(true);
    expect(options.functionsDeployed).toBe(true);
    expect(options.serviceAccountPath).toBe("serviceAccountKey.json");
    expect(() => runner.validateCiInputs(options)).not.toThrow();
  });

  it("prefers real environment variables over env file defaults", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "minimaster-security-env-override-"));
    const scriptsDir = path.join(tempRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "security-test.env"),
      "SECURITY_TEST_ADMIN_EMAIL=file@example.com\nSECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED=false\nSECURITY_TEST_FUNCTIONS_DEPLOYED=false\n",
      "utf8",
    );

    fs.copyFileSync(
      path.join(originalCwd, "scripts", "run-security-tests.js"),
      path.join(scriptsDir, "run-security-tests.js"),
    );

    process.chdir(tempRoot);
    process.env.SECURITY_TEST_ADMIN_EMAIL = "env@example.com";
    process.env.SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED = "true";
    process.env.SECURITY_TEST_FUNCTIONS_DEPLOYED = "true";

    const runner = require(path.join(scriptsDir, "run-security-tests.js"));
    const options = runner.parseArgs(["--mode", "ci"]);

    expect(options.adminEmail).toBe("env@example.com");
    expect(options.unauthorizedAccessFailed).toBe(true);
    expect(options.functionsDeployed).toBe(true);
  });

  it("reports missing service account as skip input instead of CI input failure", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "minimaster-security-env-missing-sa-"));
    const scriptsDir = path.join(tempRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "security-test.env"),
      [
        "SECURITY_TEST_ADMIN_EMAIL=admin@example.com",
        "SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED=true",
        "SECURITY_TEST_FUNCTIONS_DEPLOYED=true",
        "SECURITY_TEST_SERVICE_ACCOUNT=missing-service-account.json",
      ].join("\n"),
      "utf8",
    );

    fs.copyFileSync(
      path.join(originalCwd, "scripts", "run-security-tests.js"),
      path.join(scriptsDir, "run-security-tests.js"),
    );

    process.chdir(tempRoot);
    const runner = require(path.join(scriptsDir, "run-security-tests.js"));
    const options = runner.parseArgs(["--mode", "ci"]);
    const status = runner.resolveServiceAccountStatus(options.serviceAccountPath);

    expect(status.exists).toBe(false);
    expect(status.message).toContain("Service account file not found");
    expect(() => runner.validateCiInputs(options)).not.toThrow();
  });

  it("skips Firebase-backed checks in CI when service account is missing", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "minimaster-security-env-skip-run-"));
    const scriptsDir = path.join(tempRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptsDir, "security-test.env"),
      [
        "SECURITY_TEST_ADMIN_EMAIL=admin@example.com",
        "SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED=true",
        "SECURITY_TEST_FUNCTIONS_DEPLOYED=true",
        "SECURITY_TEST_SERVICE_ACCOUNT=missing-service-account.json",
      ].join("\n"),
      "utf8",
    );

    fs.copyFileSync(
      path.join(originalCwd, "scripts", "run-security-tests.js"),
      path.join(scriptsDir, "run-security-tests.js"),
    );

    process.chdir(tempRoot);
    const runner = require(path.join(scriptsDir, "run-security-tests.js"));
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new Error(`process.exit:${code}`);
    });
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runner.runTests(runner.parseArgs(["--mode", "ci"]))).rejects.toThrow("process.exit:0");

    expect(logSpy.mock.calls.flat().join(" ")).toContain("SKIP Firebase-backed checks");
    expect(logSpy.mock.calls.flat().join(" ")).toContain("PASS Unauthorized access was denied.");
    expect(logSpy.mock.calls.flat().join(" ")).toContain("SKIP Admin claim verification skipped");
    expect(logSpy.mock.calls.flat().join(" ")).toContain("PASS Expected Cloud Functions are deployed.");
    exitSpy.mockRestore();
  });
});
