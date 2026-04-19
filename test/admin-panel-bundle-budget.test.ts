import { promises as fs } from "fs";
import * as path from "path";

/**
 * Welle 0 / Bundle-Budget-Gate:
 * Verhindert ungewolltes Wachstum von admin-panel/app.js waehrend Modularisierung.
 * Limits sind ueber dem aktuellen Stand gesetzt, damit kleine, gerechtfertigte
 * Aenderungen nicht sofort blockieren. Welle 1 wird die Limits SCHRITTWEISE
 * ABSENKEN, sobald Funktionen in eigene Module wandern.
 *
 * Stand Welle 0 Baseline:
 *   - Bytes: 683723
 *   - Top-Level-Funktionsdeklarationen: 473
 *   - Inline onclick="..." in index.html: 115
 *
 * Stand F6 CSP-Refactor Stufe 1 (Nav + Logout):
 *   - Inline onclick="..." in index.html: 100 (von ~119)
 *
 * Stand F6 CSP-Refactor Stufe 2 (Bootstrap-Firebase + Modal-Close + Jobs):
 *   - Inline onclick="..." in index.html: 87 (-13 via globalActionBootstrap)
 *
 * Stand F6 CSP-Refactor Stufe 3 (Tab-Content Buttons en bloc):
 *   - Inline onclick="..." in index.html: 2 (Restmenge: dynamische Expression-Args fuer
 *     copyRolloutBundleScript / downloadRolloutBundleScript). 85 weitere Handler via
 *     Regex-Migration auf data-action / data-args umgestellt.
 *
 * Stand F6 CSP-Refactor Stufe 4 (Rest-Onclick + CSP-Verifikation):
 *   - Inline onclick="..." in index.html: 0 (Wrapper *FromForm fuer Rollout-Bundle).
 *   - Inline-<script>-Bloecke: 0. Inline-Event-Handler insgesamt: 0.
 *   - CSP `script-src 'self' https://www.gstatic.com` (firebase.json) ist damit
 *     OHNE 'unsafe-inline' sauber (style-src 'unsafe-inline' bleibt fuer Inline-CSS).
 */

const APP_JS = "admin-panel/app.js";
const INDEX_HTML = "admin-panel/index.html";

const MAX_APP_JS_BYTES = 720_000;
const MAX_TOP_LEVEL_FUNCTIONS = 500;
const MAX_INLINE_ONCLICK = 0;

const TOP_LEVEL_FN_REGEX = /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/gm;
const INLINE_ONCLICK_REGEX = /\bonclick\s*=/g;

async function readUtf8(rel: string): Promise<string> {
  return fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
}

async function statBytes(rel: string): Promise<number> {
  const stat = await fs.stat(path.resolve(__dirname, "..", rel));
  return stat.size;
}

describe("admin-panel bundle budget (Welle 0 baseline)", () => {
  it(`app.js bleibt unter ${MAX_APP_JS_BYTES} Bytes`, async () => {
    const size = await statBytes(APP_JS);
    expect(size).toBeLessThanOrEqual(MAX_APP_JS_BYTES);
  });

  it(`app.js hat hoechstens ${MAX_TOP_LEVEL_FUNCTIONS} Top-Level-Funktionen`, async () => {
    const source = await readUtf8(APP_JS);
    const matches = source.match(TOP_LEVEL_FN_REGEX) ?? [];
    expect(matches.length).toBeLessThanOrEqual(MAX_TOP_LEVEL_FUNCTIONS);
  });

  it(`index.html hat hoechstens ${MAX_INLINE_ONCLICK} inline onclick=-Handler`, async () => {
    const source = await readUtf8(INDEX_HTML);
    const matches = source.match(INLINE_ONCLICK_REGEX) ?? [];
    expect(matches.length).toBeLessThanOrEqual(MAX_INLINE_ONCLICK);
  });

  it("index.html ist frei von Inline-<script>-Bloecken und Inline-Event-Handlern (F6 Stufe 4 / CSP-Hardening)", async () => {
    const source = await readUtf8(INDEX_HTML);
    // Inline <script> ohne src=
    const inlineScripts = source.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g) ?? [];
    expect(inlineScripts.length).toBe(0);
    // Inline-Event-Handler-Attribute (onclick, onload, onerror, onchange, ...)
    const inlineHandlers = source.match(/\son(?:load|error|click|change|input|submit|focus|blur|mouseover|mouseout|keydown|keyup|keypress)\s*=/g) ?? [];
    expect(inlineHandlers.length).toBe(0);
    // Pseudo-Protokoll javascript:
    expect(source).not.toMatch(/javascript:/);
  });

  it("firebase.json CSP setzt script-src ohne 'unsafe-inline' fuer admin-panel (F6 Stufe 5)", async () => {
    const fbJson = await readUtf8("firebase.json");
    const csps = [...fbJson.matchAll(/"Content-Security-Policy"[\s\S]*?"value"\s*:\s*"([^"]+)"/g)]
      .map(m => m[1]);
    expect(csps.length).toBeGreaterThanOrEqual(2);
    for (const csp of csps) {
      const scriptSrcMatch = csp.match(/script-src\s+[^;]+/);
      expect(scriptSrcMatch).not.toBeNull();
      expect(scriptSrcMatch![0]).not.toMatch(/'unsafe-inline'/);
      expect(scriptSrcMatch![0]).not.toMatch(/'unsafe-eval'/);
    }
  });
});
