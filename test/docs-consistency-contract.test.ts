import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");

function walk(dir: string, extension: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      if ([".git", ".claude", "node_modules", "lib", "build"].includes(entry)) continue;
      files.push(...walk(absolute, extension));
    } else if (absolute.endsWith(extension)) {
      files.push(absolute);
    }
  }
  return files;
}

describe("documentation consistency", () => {
  it("keeps local Markdown links resolvable", () => {
    const missing: string[] = [];
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

    for (const file of walk(repoRoot, ".md")) {
      const source = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = linkPattern.exec(source)) !== null) {
        const rawUrl = String(match[1] || "").trim().split(/\s+/)[0]?.replace(/^<|>$/g, "") ?? "";
        if (!rawUrl ||
            rawUrl.startsWith("#") ||
            rawUrl.startsWith("mailto:") ||
            /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawUrl)) {
          continue;
        }
        const targetPath = decodeURIComponent(rawUrl.split("#")[0] ?? "");
        if (!targetPath) continue;
        const absoluteTarget = path.resolve(path.dirname(file), targetPath);
        if (!absoluteTarget.startsWith(repoRoot) || existsSync(absoluteTarget)) {
          continue;
        }
        missing.push(`${path.relative(repoRoot, file)} -> ${rawUrl}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("keeps repaired legal/localized text free of common mojibake markers", () => {
    const repairedFiles = [
      "docs/PRIVACY_POLICY_FR.md",
      "docs/PRIVACY_POLICY_ES.md",
      "docs/PRIVACY_POLICY_IT.md",
      "docs/AGB_TEMPLATE_FR.md",
      "docs/AGB_TEMPLATE_ES.md",
      "docs/AGB_TEMPLATE_IT.md",
      "masterApp/src/main/res/values-fr/strings.xml",
      "masterApp/src/main/res/values-es/strings.xml",
      "masterApp/src/main/res/values-it/strings.xml",
    ];
    const mojibakePattern = /(?:├.|┬.|ÔÇ.)/;
    const offenders = repairedFiles.filter((file) => mojibakePattern.test(readFileSync(path.join(repoRoot, file), "utf8")));

    expect(offenders).toEqual([]);
  });
});
