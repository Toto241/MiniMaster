import { readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");

const CLIENT_SOURCE_DIRS = [
  "masterApp/src/main",
  "childApp/src/main",
  "iosMasterApp/Sources",
  "iosChildApp/Sources",
  "web-control",
  "parent-panel",
  "child-panel",
] as const;

const SOURCE_EXTENSIONS = new Set([".kt", ".swift", ".js"]);

function walk(dir: string): string[] {
  const absoluteDir = path.join(repoRoot, dir);
  const entries = readdirSync(absoluteDir);
  const files: string[] = [];

  for (const entry of entries) {
    const absoluteEntry = path.join(absoluteDir, entry);
    const relativeEntry = path.relative(repoRoot, absoluteEntry);
    const stats = statSync(absoluteEntry);
    if (stats.isDirectory()) {
      files.push(...walk(relativeEntry));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(relativeEntry);
    }
  }

  return files;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function exportedCallableNames(): Set<string> {
  const indexSource = readFileSync(path.join(repoRoot, "index.ts"), "utf8");
  const names = new Set<string>();
  const exportBlockPattern = /export\s*\{([\s\S]*?)\}\s*from\s+["'][^"']+["'];/g;
  let match: RegExpExecArray | null;

  while ((match = exportBlockPattern.exec(indexSource)) !== null) {
    const body = stripComments(match[1] ?? "");
    for (const rawName of body.split(",")) {
      const name = rawName.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }

  return names;
}

function clientCallableReferences(): Map<string, Set<string>> {
  const references = new Map<string, Set<string>>();
  const callablePattern = /(?:getHttpsCallable|httpsCallable)\(\s*["']([^"']+)["']\s*\)/g;

  for (const dir of CLIENT_SOURCE_DIRS) {
    for (const file of walk(dir)) {
      const source = readFileSync(path.join(repoRoot, file), "utf8");
      let match: RegExpExecArray | null;
      while ((match = callablePattern.exec(source)) !== null) {
        const callableName = match[1];
        if (!callableName) continue;
        const files = references.get(callableName) ?? new Set<string>();
        files.add(file);
        references.set(callableName, files);
      }
    }
  }

  return references;
}

describe("client callable export contract", () => {
  it("exports every statically named callable used by Android, iOS, and web clients", () => {
    const exports = exportedCallableNames();
    const references = clientCallableReferences();

    const missing = [...references.entries()]
      .filter(([name]) => !exports.has(name))
      .map(([name, files]) => `${name}: ${[...files].sort().join(", ")}`)
      .sort();

    expect(missing).toEqual([]);
  });
});
