#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

function candidate(command, args = []) {
  return { command, args };
}

function pythonCandidates() {
  const candidates = [];
  const venvPython = process.platform === "win32"
    ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
    : path.join(repoRoot, ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    candidates.push(candidate(venvPython));
  }

  if (process.env.PYTHON) {
    candidates.push(candidate(process.env.PYTHON));
  }

  if (process.platform === "win32") {
    candidates.push(candidate("python"));
    candidates.push(candidate("py", ["-3"]));
    candidates.push(candidate("python3"));
  } else {
    candidates.push(candidate("python3"));
    candidates.push(candidate("python"));
  }

  return candidates;
}

function isUsablePython(entry) {
  const probe = spawnSync(
    entry.command,
    [...entry.args, "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return probe.status === 0;
}

function resolvePython() {
  for (const entry of pythonCandidates()) {
    if (isUsablePython(entry)) {
      return entry;
    }
  }
  return null;
}

const python = resolvePython();
if (!python) {
  console.error("Python 3.8+ was not found. Install Python or set PYTHON to the interpreter path.");
  process.exit(1);
}

const result = spawnSync(
  python.command,
  [...python.args, ...process.argv.slice(2)],
  { cwd: repoRoot, stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
