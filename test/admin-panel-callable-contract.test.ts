import { promises as fs } from "fs";
import * as path from "path";

/**
 * Welle 0 / Contract-Test:
 * Stellt sicher, dass jede im Admin-Panel verwendete Cloud-Function (httpsCallable("xxx"))
 * weiterhin in index.ts re-exportiert wird. Verhindert UI-Waisen waehrend Refactor (Welle 1+).
 *
 * Aktuelles Inventar (Stand Welle 0): 29 unique Callables.
 */

const CALLABLE_REGEX = /httpsCallable\(\s*["']([a-zA-Z0-9_]+)["']\s*\)/g;
const EXPORT_REGEX = /export\s*\{([\s\S]*?)\}\s*from/g;

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

function extractCallableNames(source: string): Set<string> {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  CALLABLE_REGEX.lastIndex = 0;
  while ((match = CALLABLE_REGEX.exec(source)) !== null) {
    names.add(match[1]);
  }
  return names;
}

function extractExportedSymbols(source: string): Set<string> {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  EXPORT_REGEX.lastIndex = 0;
  while ((match = EXPORT_REGEX.exec(source)) !== null) {
    const block = match[1];
    block
      .split(",")
      .map((entry) => entry.replace(/\/\/.*$/g, "").trim())
      .filter(Boolean)
      .forEach((entry) => {
        // Support "foo as bar" – exported name is the part after "as"
        const aliasMatch = entry.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
        if (aliasMatch) {
          names.add(aliasMatch[2] ?? aliasMatch[1]);
        }
      });
  }
  return names;
}

describe("admin-panel callable contract", () => {
  let uiCallables: Set<string>;
  let backendExports: Set<string>;

  beforeAll(async () => {
    const [appJs, indexTs] = await Promise.all([
      readUtf8("admin-panel/app.js"),
      readUtf8("index.ts"),
    ]);
    uiCallables = extractCallableNames(appJs);
    backendExports = extractExportedSymbols(indexTs);
  });

  it("findet das gesamte Callable-Inventar (mind. 29 Eintraege)", () => {
    expect(uiCallables.size).toBeGreaterThanOrEqual(29);
  });

  it("findet die Cloud-Function-Exporte (mind. 50 Symbole)", () => {
    expect(backendExports.size).toBeGreaterThanOrEqual(50);
  });

  it("hat fuer jede UI-Callable einen Backend-Export (keine UI-Waisen)", () => {
    const missing = [...uiCallables].filter((name) => !backendExports.has(name));
    expect(missing).toEqual([]);
  });

  it("listet die bekannten Stand-Welle-0 Callables", () => {
    const known = [
      "aiExplainProblem", "setUserRole", "createOperatorAccessKey", "redeemOperatorAccessKey",
      "bootstrapFirstAdmin", "resetAllAuthUsers", "resetAllAuthUsersHealth",
      "getOperatorSetupStatus", "setOperatorSetupChecklistItem", "adminHealthCheck",
      "revokeUserTokens", "revokeSubscription", "analyzeWithDebugData", "getTicketUserData",
      "exportUserData", "deleteUserAccount", "setAdminClaim", "resetOperatorAccounts",
      "testGeminiConnection", "getKnowledgeBase", "updateKnowledgeBase", "sendTestFcmMessage",
      "triggerScheduledJob", "analyzeSystemErrors", "executeAutoFix",
      "getActiveLegalPolicies", "needsLegalReconsent", "publishLegalPolicy",
      "markLegalReconsentRequired",
    ];
    const missingFromUi = known.filter((name) => !uiCallables.has(name));
    expect(missingFromUi).toEqual([]);
  });
});
