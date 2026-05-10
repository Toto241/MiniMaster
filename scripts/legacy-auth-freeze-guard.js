#!/usr/bin/env node
/**
 * Legacy Auth Freeze Guard
 *
 * Pre-commit / CI check that blocks introduction of NEW secretKey/IMEI-based
 * authentication paths. Existing legacy paths (generateCustomToken, registerMasterDevice)
 * are whitelisted because they are part of the controlled cutover.
 *
 * Usage:
 *   node scripts/legacy-auth-freeze-guard.js [--fail-on-new]
 *
 * Exit codes:
 *   0 = no new legacy auth introduced
 *   1 = new legacy auth path detected (blocks PR)
 */

const fs = require("fs");
const path = require("path");

const WHITELISTED_PATHS = [
  "src/auth.ts",
  "src/cutover-monitor.ts",
  "docs/LEGACY_AUTH_INVENTORY.md",
  "docs/AUTH_MIGRATION_PLAN.md",
  "docs/LEGACY_AUTH_CUTOVER_PLAN.md",
  "test/legacy-auth-",
  "test/deploy-workflow-legacy-auth-default.test.ts",
  "test/ios-authservice-contract.test.ts",
  "scripts/legacy-auth-freeze-guard.js",
];

const LEGACY_AUTH_PATTERNS = [
  /secretKey\s*[:=]/,
  /masterImei\s*\+\s*secretKey/,
  /data\.secretKey/,
  /req\.body\.secretKey/,
  /function.*secretKey.*auth/,
  /new.*secretKey/,
  /secretKey.*required.*auth/,
];

const SCAN_DIRS = ["src", "web-control", "admin-panel", "parent-panel", "child-panel", "desktop"];
const EXTENSIONS = [".ts", ".js", ".swift", ".kt"];

function isWhitelisted(filePath) {
  const rel = path.relative(process.cwd(), filePath);
  return WHITELISTED_PATHS.some((w) => rel.includes(w));
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const findings = [];

  lines.forEach((line, idx) => {
    LEGACY_AUTH_PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        findings.push({
          file: filePath,
          line: idx + 1,
          pattern: pattern.toString(),
          text: line.trim().slice(0, 120),
        });
      }
    });
  });

  return findings;
}

function scanDirectory(dir) {
  const findings = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.includes("node_modules") && !entry.name.includes(".build") && !entry.name.includes("test")) {
        findings.push(...scanDirectory(fullPath));
      }
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      if (!isWhitelisted(fullPath)) {
        findings.push(...scanFile(fullPath));
      }
    }
  }

  return findings;
}

function main() {
  const failOnNew = process.argv.includes("--fail-on-new");
  let allFindings = [];

  for (const dir of SCAN_DIRS) {
    if (fs.existsSync(dir)) {
      allFindings.push(...scanDirectory(dir));
    }
  }

  if (allFindings.length === 0) {
    console.log("✅ Legacy Auth Freeze Guard: No new legacy auth paths detected.");
    process.exit(0);
  }

  console.error("❌ Legacy Auth Freeze Guard: NEW legacy auth paths detected!");
  console.error("These files introduce secretKey/IMEI-based auth outside whitelisted paths.");
  console.error("See docs/LEGACY_AUTH_INVENTORY.md for migration guidance.\n");

  for (const finding of allFindings) {
    console.error(`  ${finding.file}:${finding.line}`);
    console.error(`    → ${finding.text}`);
    console.error();
  }

  if (failOnNew) {
    process.exit(1);
  }
}

main();
