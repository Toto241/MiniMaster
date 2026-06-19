#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "build", "play-console-release");
const JSON_OUT = path.join(OUT_DIR, "latest-plan.json");
const MARKDOWN_OUT = path.join(OUT_DIR, "latest-plan.md");

const APPS = {
  master: {
    id: "master",
    title: "MiniMaster Parent",
    packageName: "com.minimaster.masterapp",
    moduleDir: "masterApp",
    buildCommand: "./gradlew :masterApp:bundleRelease",
  },
  child: {
    id: "child",
    title: "MiniMaster Child",
    packageName: "com.minimaster.childapp",
    moduleDir: "childApp",
    buildCommand: "./gradlew :childApp:bundleRelease",
  },
};

function parseArgs(argv) {
  const args = {
    apps: ["master", "child"],
    dryRun: true,
    upload: false,
    track: process.env.PLAY_UPLOAD_TRACK || "internal",
    status: process.env.PLAY_UPLOAD_STATUS || "draft",
    serviceAccount: process.env.PLAY_ANDROID_PUBLISHER_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    releaseName: process.env.PLAY_RELEASE_NAME || "",
    requireUploadReady: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--upload") {
      args.upload = true;
      args.dryRun = false;
    } else if (item === "--dry-run") {
      args.dryRun = true;
      args.upload = false;
    } else if (item === "--app") {
      const value = argv[++index] || "";
      args.apps = value === "both" ? ["master", "child"] : value.split(",").map((part) => part.trim()).filter(Boolean);
    } else if (item === "--track") {
      args.track = argv[++index] || args.track;
    } else if (item === "--status") {
      args.status = argv[++index] || args.status;
    } else if (item === "--service-account") {
      args.serviceAccount = argv[++index] || "";
    } else if (item === "--release-name") {
      args.releaseName = argv[++index] || "";
    } else if (item === "--require-upload-ready") {
      args.requireUploadReady = true;
    } else if (item === "--help" || item === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${item}`);
    }
  }

  for (const app of args.apps) {
    if (!APPS[app]) {
      throw new Error(`Unknown app '${app}'. Use master, child, or both.`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/play_console_release.js --dry-run [--app master|child|both]
  node scripts/play_console_release.js --dry-run --require-upload-ready
  node scripts/play_console_release.js --upload --track internal --status draft --service-account path/to/play-service-account.json

Environment alternatives:
  PLAY_ANDROID_PUBLISHER_CREDENTIALS=path/to/service-account.json
  GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
  PLAY_SERVICE_ACCOUNT_JSON=<raw JSON>
  PLAY_SERVICE_ACCOUNT_JSON_BASE64=<base64 JSON>
  PLAY_UPLOAD_TRACK=internal
  PLAY_UPLOAD_STATUS=draft
`);
}

function findReleaseBundle(moduleDir) {
  const releaseDir = path.join(REPO_ROOT, moduleDir, "build", "outputs", "bundle", "release");
  if (!fs.existsSync(releaseDir)) {
    return null;
  }
  const bundles = fs.readdirSync(releaseDir)
    .filter((name) => name.endsWith(".aab"))
    .map((name) => path.join(releaseDir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  return bundles[0] || null;
}

function loadInlineCredentials() {
  if (process.env.PLAY_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.PLAY_SERVICE_ACCOUNT_JSON_BASE64) {
    return JSON.parse(Buffer.from(process.env.PLAY_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8"));
  }
  return null;
}

function credentialState(serviceAccountPath) {
  if (serviceAccountPath) {
    return {
      mode: "file",
      available: fs.existsSync(path.resolve(REPO_ROOT, serviceAccountPath)) || fs.existsSync(serviceAccountPath),
      path: serviceAccountPath,
    };
  }
  if (process.env.PLAY_SERVICE_ACCOUNT_JSON || process.env.PLAY_SERVICE_ACCOUNT_JSON_BASE64) {
    return { mode: "inline-env", available: true };
  }
  return { mode: "missing", available: false };
}

function buildPlan(args) {
  const credentials = credentialState(args.serviceAccount);
  const appPlans = args.apps.map((appId) => {
    const app = APPS[appId];
    const bundlePath = findReleaseBundle(app.moduleDir);
    const checks = [
      {
        id: "bundle-present",
        status: bundlePath ? "pass" : "open",
        detail: bundlePath ? path.relative(REPO_ROOT, bundlePath) : `Run ${app.buildCommand}`,
      },
      {
        id: "package-name",
        status: "pass",
        detail: app.packageName,
      },
      {
        id: "play-app-created",
        status: "external",
        detail: "The package must already exist in Play Console; first app creation is not available through this assistant.",
      },
    ];
    return {
      appId,
      title: app.title,
      packageName: app.packageName,
      moduleDir: app.moduleDir,
      bundlePath: bundlePath ? path.relative(REPO_ROOT, bundlePath) : null,
      buildCommand: app.buildCommand,
      checks,
    };
  });
  const open = appPlans.flatMap((app) => app.checks).filter((check) => check.status === "open").length;
  return {
    generatedAt: new Date().toISOString(),
    type: "play-console-release-plan",
    mode: args.upload ? "upload" : "dry-run",
    track: args.track,
    status: args.status,
    releaseName: args.releaseName || null,
    credential: credentials,
    summary: {
      apps: appPlans.length,
      open,
      credentialsReady: credentials.available,
      uploadReady: open === 0 && credentials.available,
    },
    apps: appPlans,
    externalConsoleSteps: [
      "Create both apps in Play Console if they do not already exist.",
      "Enroll in Play App Signing and keep upload-key secrets in CI or local secret storage.",
      "Complete Data Safety, IARC, App Access, store listing, and sensitive permission declarations in Play Console.",
      "Attach screenshots or review status evidence to docs/RELEASE_EVIDENCE_REGISTER.md.",
    ],
  };
}

function renderMarkdown(plan) {
  const lines = [
    "# Play Console Release Plan",
    "",
    `Generated at: \`${plan.generatedAt}\``,
    `Mode: \`${plan.mode}\``,
    `Track: \`${plan.track}\``,
    `Release status: \`${plan.status}\``,
    `Credentials ready: \`${plan.summary.credentialsReady}\``,
    `Upload ready: \`${plan.summary.uploadReady}\``,
    "",
    "## Apps",
    "",
    "| App | Package | Bundle | Checks |",
    "| --- | --- | --- | --- |",
  ];
  for (const app of plan.apps) {
    const checks = app.checks.map((check) => `${check.id}:${check.status}`).join(", ");
    lines.push(`| ${app.title} | \`${app.packageName}\` | \`${app.bundlePath || "missing"}\` | ${checks} |`);
  }
  lines.push("", "## External Console Steps", "");
  for (const item of plan.externalConsoleSteps) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function writePlan(plan) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  fs.writeFileSync(MARKDOWN_OUT, renderMarkdown(plan), "utf8");
}

async function uploadPlan(plan, args) {
  if (!plan.summary.uploadReady) {
    throw new Error("Upload is not ready. Run --dry-run and close open checks first.");
  }

  const { google } = require("googleapis");
  const credentials = loadInlineCredentials();
  const authOptions = credentials
    ? { credentials, scopes: ["https://www.googleapis.com/auth/androidpublisher"] }
    : { keyFile: path.resolve(REPO_ROOT, args.serviceAccount), scopes: ["https://www.googleapis.com/auth/androidpublisher"] };
  const auth = new google.auth.GoogleAuth(authOptions);
  const publisher = google.androidpublisher({ version: "v3", auth });

  const uploadResults = [];
  for (const app of plan.apps) {
    const bundlePath = path.resolve(REPO_ROOT, app.bundlePath);
    const edit = await publisher.edits.insert({ packageName: app.packageName });
    const editId = edit.data.id;
    const upload = await publisher.edits.bundles.upload({
      packageName: app.packageName,
      editId,
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(bundlePath),
      },
    });
    const versionCode = String(upload.data.versionCode);
    await publisher.edits.tracks.update({
      packageName: app.packageName,
      editId,
      track: plan.track,
      requestBody: {
        releases: [{
          name: args.releaseName || `${app.title} ${versionCode}`,
          status: plan.status,
          versionCodes: [versionCode],
        }],
      },
    });
    await publisher.edits.commit({ packageName: app.packageName, editId });
    uploadResults.push({ appId: app.appId, packageName: app.packageName, versionCode, track: plan.track, status: plan.status });
  }
  plan.uploadResults = uploadResults;
  writePlan(plan);
  return uploadResults;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }
  const plan = buildPlan(args);
  writePlan(plan);
  console.log(JSON.stringify(plan.summary));
  if (args.upload) {
    const results = await uploadPlan(plan, args);
    console.log(JSON.stringify({ uploaded: results.length, results }));
  }
  if (args.requireUploadReady && !plan.summary.uploadReady) {
    return 1;
  }
  return plan.summary.open === 0 ? 0 : 1;
}

main().then((code) => {
  process.exit(code);
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
