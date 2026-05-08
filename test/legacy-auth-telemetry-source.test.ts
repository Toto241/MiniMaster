import { readFileSync } from "fs";
import * as path from "path";

/**
 * Regression guard for the duplicate `logLegacyAuthUsage` declaration that
 * silently corrupted cutover telemetry (Issue #162). Function-hoisting let
 * the second 2-arg definition shadow the first 3-arg one, so 3-arg call
 * sites wrote the endpoint name (e.g. "generateCustomToken") into the doc
 * ID instead of the master IMEI — making the 14-day cutover monitor see
 * permanent traffic and blocking Phase 3 indefinitely.
 */
describe("legacy auth telemetry source contract", () => {
  const authSrc = readFileSync(path.join(__dirname, "..", "src", "auth.ts"), "utf8");
  const cutoverSrc = readFileSync(path.join(__dirname, "..", "src", "cutover-monitor.ts"), "utf8");

  it("declares logLegacyAuthUsage exactly once", () => {
    const declarations = authSrc.match(/^async\s+function\s+logLegacyAuthUsage\b/gm) || [];
    expect(declarations).toHaveLength(1);
  });

  it("uses the (masterId, endpoint, mode) signature", () => {
    const sig = authSrc.match(
      /async\s+function\s+logLegacyAuthUsage\s*\(\s*masterId:\s*string,\s*endpoint:\s*string,\s*mode:\s*"secretKey"\s*\|\s*"imei_registration"/
    );
    expect(sig).not.toBeNull();
  });

  it("writes telemetry into the same collection that cutover-monitor reads", () => {
    expect(authSrc).toContain("collection(\"legacy_auth_usage\")");
    expect(cutoverSrc).toContain("collection(\"legacy_auth_usage\")");
    // The orphaned camelCase collection from the deleted second definition
    // must not reappear — cutover-monitor would never see it.
    expect(authSrc).not.toMatch(/collection\(\s*"legacyAuthUsage"\s*\)/);
  });

  it("uses the real master/IMEI as the telemetry doc ID", () => {
    // generateCustomToken must pass masterImei (not the endpoint string) first.
    expect(authSrc).toContain(
      "logLegacyAuthUsage(masterImei, \"generateCustomToken\", \"secretKey\")"
    );
    // registerMasterDevice must pass imei (not the endpoint string) first.
    expect(authSrc).toContain(
      "logLegacyAuthUsage(imei, \"registerMasterDevice\", \"imei_registration\")"
    );
  });

  it("emits exactly one telemetry write per legacy code path", () => {
    // Previous code wrote telemetry twice per call (once before, once after
    // the secretKey check) which double-counted successful logins.
    const generateBlock = authSrc.match(
      /export const generateCustomToken[\s\S]*?^\);/m
    )?.[0] || "";
    const registerBlock = authSrc.match(
      /export const registerMasterDevice[\s\S]*?^\);/m
    )?.[0] || "";
    expect((generateBlock.match(/logLegacyAuthUsage\(/g) || [])).toHaveLength(1);
    expect((registerBlock.match(/logLegacyAuthUsage\(/g) || [])).toHaveLength(1);
  });
});
