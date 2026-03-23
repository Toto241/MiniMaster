#!/usr/bin/env node

/**
 * Automated Security Test Runner
 *
 * Supports two modes:
 * - interactive: asks required manual questions in terminal
 * - ci: non-interactive mode; answers must be provided via flags/env vars
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const readline = require("readline");

const EXPECTED_FUNCTIONS = [
  "createTask",
  "submitTaskProof",
  "reviewTask",
  "onTaskStatusChange",
  "setAdminClaim",
  "revokeSubscription",
  "updateFCMToken",
  "deleteUserAccount",
];

function printUsage() {
  console.log("MiniMaster Security Test Runner");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/run-security-tests.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  --mode <interactive|ci>                Default: interactive");
  console.log("  --admin-email <email>                  Admin email for claim verification");
  console.log("  --unauthorized-access-failed <true|false>");
  console.log("  --functions-deployed <true|false>");
  console.log("  --service-account <path>               Default: ../serviceAccountKey.json");
  console.log("  --help                                 Show this help");
  console.log("");
  console.log("Environment variable equivalents:");
  console.log("  SECURITY_TEST_MODE");
  console.log("  SECURITY_TEST_ADMIN_EMAIL");
  console.log("  SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED");
  console.log("  SECURITY_TEST_FUNCTIONS_DEPLOYED");
  console.log("  SECURITY_TEST_SERVICE_ACCOUNT");
}

function parseBoolean(value, optionName) {
  if (typeof value !== "string") {
    throw new Error(`Missing value for ${optionName}`);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "y") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "n") {
    return false;
  }
  throw new Error(`Invalid boolean for ${optionName}: ${value}`);
}

function parseArgs(argv) {
  const options = {
    mode: process.env.SECURITY_TEST_MODE || "interactive",
    adminEmail: process.env.SECURITY_TEST_ADMIN_EMAIL || "",
    unauthorizedAccessFailed: process.env.SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED,
    functionsDeployed: process.env.SECURITY_TEST_FUNCTIONS_DEPLOYED,
    serviceAccountPath:
      process.env.SECURITY_TEST_SERVICE_ACCOUNT || path.join(__dirname, "..", "serviceAccountKey.json"),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--mode":
        options.mode = argv[i + 1] || "";
        i += 1;
        break;
      case "--admin-email":
        options.adminEmail = argv[i + 1] || "";
        i += 1;
        break;
      case "--unauthorized-access-failed":
        options.unauthorizedAccessFailed = argv[i + 1];
        i += 1;
        break;
      case "--functions-deployed":
        options.functionsDeployed = argv[i + 1];
        i += 1;
        break;
      case "--service-account":
        options.serviceAccountPath = argv[i + 1] || "";
        i += 1;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.mode = String(options.mode || "interactive").trim().toLowerCase();
  if (options.mode !== "interactive" && options.mode !== "ci") {
    throw new Error(`Invalid mode '${options.mode}'. Use interactive or ci.`);
  }

  if (typeof options.unauthorizedAccessFailed === "string") {
    options.unauthorizedAccessFailed = parseBoolean(
      options.unauthorizedAccessFailed,
      "--unauthorized-access-failed"
    );
  } else if (typeof options.unauthorizedAccessFailed !== "boolean") {
    options.unauthorizedAccessFailed = undefined;
  }

  if (typeof options.functionsDeployed === "string") {
    options.functionsDeployed = parseBoolean(options.functionsDeployed, "--functions-deployed");
  } else if (typeof options.functionsDeployed !== "boolean") {
    options.functionsDeployed = undefined;
  }

  options.adminEmail = String(options.adminEmail || "").trim();
  options.serviceAccountPath = String(options.serviceAccountPath || "").trim();

  return options;
}

function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function createResultTracker() {
  return {
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    pass(message) {
      console.log(`PASS ${message}`);
      this.passedTests += 1;
    },
    fail(message) {
      console.log(`FAIL ${message}`);
      this.failedTests += 1;
    },
    skip(message) {
      console.log(`SKIP ${message}`);
      this.skippedTests += 1;
    },
  };
}

function validateCiInputs(options) {
  const missing = [];
  if (!options.adminEmail) {
    missing.push("--admin-email or SECURITY_TEST_ADMIN_EMAIL");
  }
  if (typeof options.unauthorizedAccessFailed !== "boolean") {
    missing.push("--unauthorized-access-failed or SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED");
  }
  if (typeof options.functionsDeployed !== "boolean") {
    missing.push("--functions-deployed or SECURITY_TEST_FUNCTIONS_DEPLOYED");
  }
  if (missing.length > 0) {
    throw new Error(`CI mode missing required inputs: ${missing.join(", ")}`);
  }
}

function initializeFirebase(serviceAccountPath) {
  if (!serviceAccountPath) {
    throw new Error("No service account path was provided.");
  }
  const resolved = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`);
  }
  const serviceAccount = require(resolved);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return {
    db: admin.firestore(),
    auth: admin.auth(),
  };
}

function question(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function resolveBooleanAnswer(options, rl, config) {
  const {
    providedValue,
    interactivePrompt,
    ciMissingError,
    trueLabel,
    falseLabel,
  } = config;

  if (typeof providedValue === "boolean") {
    return providedValue;
  }

  if (options.mode === "ci") {
    throw new Error(ciMissingError);
  }

  const answer = await question(rl, interactivePrompt);
  const normalized = String(answer || "").trim().toLowerCase();
  if (normalized === "y" || normalized === "yes") return true;
  if (normalized === "n" || normalized === "no") return false;

  throw new Error(`Invalid answer. Expected ${trueLabel}/${falseLabel}.`);
}

function printHeader() {
  console.log("========================================");
  console.log("MiniMaster Security Test Runner");
  console.log("========================================");
  console.log("");
}

function printSummary(results) {
  const total = results.passedTests + results.failedTests + results.skippedTests;
  console.log("========================================");
  console.log("Test Summary");
  console.log("========================================");
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${results.passedTests}`);
  console.log(`Failed: ${results.failedTests}`);
  console.log(`Skipped: ${results.skippedTests}`);
  console.log("");

  if (results.failedTests === 0) {
    console.log("All tests passed.");
  } else {
    console.log("Some tests failed. Please review the output above.");
  }
}

async function runTests(options) {
  if (options.mode === "ci") {
    validateCiInputs(options);
  }

  const { db, auth } = initializeFirebase(options.serviceAccountPath);
  const rl = options.mode === "interactive" ? createReadline() : null;
  const results = createResultTracker();

  printHeader();

  try {
    console.log("Test 1: Firestore Rules - Unauthorized Access");
    if (options.mode === "interactive") {
      console.log("Manual check: try to read /masters without authentication.");
    }
    const unauthorizedFailed = await resolveBooleanAnswer(options, rl, {
      providedValue: options.unauthorizedAccessFailed,
      interactivePrompt: "Did unauthenticated access fail? (y/n): ",
      ciMissingError: "Missing required non-interactive answer for unauthorized access check.",
      trueLabel: "y",
      falseLabel: "n",
    });

    if (unauthorizedFailed) {
      results.pass("Unauthorized access was denied.");
    } else {
      results.fail("Unauthorized access was not denied.");
    }
    console.log("");

    console.log("Test 2: Admin Custom Claim Verification");
    const adminEmail = options.adminEmail || (await question(rl, "Enter admin email: "));
    try {
      const user = await auth.getUserByEmail(String(adminEmail || "").trim());
      const claims = user.customClaims || {};
      if (claims.role === "admin") {
        results.pass("Admin claim is set.");
      } else {
        results.fail("Admin claim is not set.");
      }
    } catch (error) {
      results.fail(`Admin claim verification failed: ${error.message}`);
    }
    console.log("");

    console.log("Test 3: Firestore Indexes Verification");
    try {
      await db.collectionGroup("tasks").limit(1).get();
      results.pass("collectionGroup query works.");
    } catch (error) {
      results.fail(`Firestore index check failed: ${error.message}`);
      console.log("Hint: firebase deploy --only firestore:indexes");
    }
    console.log("");

    console.log("Test 4: Cloud Functions Deployment");
    if (options.mode === "interactive") {
      console.log("Expected functions:");
      for (const fn of EXPECTED_FUNCTIONS) {
        console.log(`  - ${fn}`);
      }
    }

    const functionsDeployed = await resolveBooleanAnswer(options, rl, {
      providedValue: options.functionsDeployed,
      interactivePrompt: "Are all expected functions deployed? (y/n): ",
      ciMissingError: "Missing required non-interactive answer for functions deployment check.",
      trueLabel: "y",
      falseLabel: "n",
    });

    if (functionsDeployed) {
      results.pass("Expected Cloud Functions are deployed.");
    } else {
      results.fail("Expected Cloud Functions are not fully deployed.");
      console.log("Hint: firebase deploy --only functions");
    }
    console.log("");
  } finally {
    if (rl) {
      rl.close();
    }
  }

  printSummary(results);
  process.exit(results.failedTests > 0 ? 1 : 0);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Argument error: ${error.message}`);
    printUsage();
    process.exit(2);
  }

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  try {
    await runTests(options);
  } catch (error) {
    console.error("Test runner error:", error.message || error);
    process.exit(1);
  }
}

main();
