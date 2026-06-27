#!/usr/bin/env node
/**
 * Secret Leak Guard
 *
 * Blocks accidental commits of Firebase service account credentials and
 * common private key material in tracked files.
 *
 * Usage:
 *   node scripts/secret-leak-guard.js [--ci]
 *
 * Exit codes:
 *   0 = no leak detected
 *   1 = leak detected
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ALLOWLIST_SUFFIXES = [
  "serviceAccountKey.template.json",
  "security-test.env.template",
  "admin-panel/operator-setup-wizard_NEW.html",
  "scripts/openssl_tools.py",
  "test/external-integrations.test.ts",
  // The guard's own source necessarily contains the secret regexes it scans
  // for (e.g. the literal "-----BEGIN PRIVATE KEY-----" pattern); exclude it so
  // it does not flag its own pattern definitions.
  "scripts/secret-leak-guard.js",
];

const DISALLOWED_FILE_PATTERNS = [
  // Match firebase-adminsdk service-account keys anywhere in the filename, not
  // just as a prefix. A real key named `minimaster-28fbd-firebase-adminsdk-*.json`
  // previously slipped past a prefix-anchored pattern (see SECURITY_INCIDENT docs).
  /firebase-adminsdk[^/]*\.json$/i,
  // JVM heap dumps can contain in-memory secrets/PII and must never be committed.
  /\.hprof$/i,
];

const SECRET_PATTERNS = [
  /-----BEGIN PRIVATE KEY-----/,
  /"type"\s*:\s*"service_account"/,
  /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/,
];

function getTrackedFiles() {
  const raw = execSync("git ls-files", { encoding: "utf8" });
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isAllowlisted(relPath) {
  return ALLOWLIST_SUFFIXES.some((suffix) => relPath.endsWith(suffix));
}

function fileLooksBinary(content) {
  return content.includes("\u0000");
}

function isSafeServiceAccountTemplate(relPath, content) {
  if (!relPath.endsWith("serviceAccountKey.json")) {
    return false;
  }

  return content.includes("TEMPLATE ONLY - DO NOT COMMIT REAL KEYS")
    && content.includes("REPLACE_WITH_YOUR_PROJECT_ID")
    && content.includes("REPLACE_ME");
}

function checkTrackedFileNames(files) {
  const violations = [];

  for (const relPath of files) {
    if (isAllowlisted(relPath)) {
      continue;
    }

    if (DISALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(relPath))) {
      violations.push({
        type: "forbidden-file",
        file: relPath,
        detail: "Sensitive credential filename is tracked in git.",
      });
    }
  }

  return violations;
}

function checkContentLeaks(files) {
  const violations = [];

  for (const relPath of files) {
    if (isAllowlisted(relPath)) {
      continue;
    }

    const absPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(absPath, "utf8");
    } catch (_error) {
      continue;
    }

    if (fileLooksBinary(content)) {
      continue;
    }

    if (isSafeServiceAccountTemplate(relPath, content)) {
      continue;
    }

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        violations.push({
          type: "content-leak",
          file: relPath,
          detail: `Matched sensitive pattern: ${pattern}`,
        });
        break;
      }
    }
  }

  return violations;
}

function printViolations(violations) {
  console.error("❌ Secret Leak Guard: Sensitive material detected in tracked files.\n");
  for (const violation of violations) {
    console.error(`- [${violation.type}] ${violation.file}`);
    console.error(`  ${violation.detail}`);
  }
  console.error("\nFix by removing credentials from git history/state and using templates + secrets manager.");
}

function main() {
  const trackedFiles = getTrackedFiles();

  const violations = [
    ...checkTrackedFileNames(trackedFiles),
    ...checkContentLeaks(trackedFiles),
  ];

  if (violations.length > 0) {
    printViolations(violations);
    process.exit(1);
  }

  console.log("✅ Secret Leak Guard: No tracked credential leaks detected.");
}

main();
