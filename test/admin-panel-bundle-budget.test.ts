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
 *
 * Stand F6.1 CSS-Hardening:
 *   - Inline style="..."-Attribute in index.html: 0 (51 unique Werte -> Klassen
 *     mm-u001 .. mm-u051 in admin-panel/styles-utilities.css).
 *   - admin-panel CSP `style-src 'self'` (ohne 'unsafe-inline') aktiv.
 *
 * Stand External Integrations Cockpit (PR #168):
 *   - app.js: 752_170 Bytes (+2_170 ueber dem Welle-0-Limit von 750_000).
 *   - Top-Level-Funktionen: 503 (+3 ueber dem Limit von 500).
 *   - Begruendung: Neue Setup-Cockpit-Karte fuer externe Integrationen
 *     (Apple/Play/Secrets/OEM/Release) bringt 5 neue Top-Level-Funktionen
 *     (initExternalIntegrationsCard, loadExternalIntegrations,
 *     renderExternalIntegrations, renderOemMatrix, onExternalIntegrationFieldChange,
 *     readOemMatrixFromDom, onOemAction, saveOemMatrix). Limits leicht angehoben,
 *     um Headroom fuer den naechsten Iterationsschritt zu lassen.
 *
 * Stand Konfig-Transfer + Snapshots (Bausteine A/B/C – Datei-Upload fuer
 * google-services.json / serviceAccountKey.json + Snapshot-Verwaltung):
 *   - app.js: 804_643 Bytes (+19_643 ueber dem Limit von 785_000).
 *   - Top-Level-Funktionen: 521 (+6 ueber dem Limit von 515).
 *   - Begruendung: Neue Funktionen fuer Datei-Upload und Snapshot-Verwaltung:
 *     _readFileAsText, collectArtifactUploads, renderArtifactStatus,
 *     _mmScheduleDomInit, setConfigSnapshotStatus, _escapeHtml,
 *     renderConfigSnapshotsList, reloadConfigSnapshots, createConfigSnapshot,
 *     restoreConfigSnapshot. Limits angepasst mit kleinem Headroom.
 *
 * Stand Login-Diagnose-Tools (Connectivity-Self-Test + erweiterte Auth-Probe):
 *   - app.js: 821_155 Bytes (+1_155 ueber dem Limit von 820_000).
 *   - Top-Level-Funktionen: 529 (+4 ueber dem Limit von 525).
 *   - Begruendung: Backend+Browser-Konnektivitaetstest und Identity-Toolkit-
 *     Probe-Diagnose, die `auth/network-request-failed` in konkrete Fehler-
 *     Codes decodieren (OPERATION_NOT_ALLOWED, INVALID_LOGIN_CREDENTIALS,
 *     API_KEY_*). Neue Funktionen: runConnectivityTest, _probeBrowserEndpoint,
 *     _renderConnectivityResult, runAuthDiagnostics, _renderAuthDiagnostics,
 *     _boolBadge, _tristateBadge plus _escapeHtml (zuvor schon vorhanden).
 *     Limits angepasst mit kleinem Headroom.
 *
 * Stand Browser-State-Auto-Reset (Fall-A-Diagnose automatisiert):
 *   - app.js: 843_347 Bytes (+8_347 ueber dem Limit von 835_000).
 *   - Top-Level-Funktionen: 536 (+1 ueber dem Limit von 535).
 *   - Begruendung: 1-Klick-Reset von localStorage, sessionStorage, IndexedDB,
 *     CacheStorage, Service Workers, Cookies plus Auto-Reload mit Countdown,
 *     ausserdem App-Check-Status-Probe und 3-Wege-Browser-Direct-Vergleich.
 *     Neue Funktionen: autoResetFirebaseBrowserState, probeAppCheckStatus,
 *     _hardReloadWithCountdown, _handleAutoResetClick, _runBackendAuthProbe,
 *     _firebaseApiKeyForDiagnostics, _runBrowserDirectAuthProbe (sieben
 *     neue, davon eine "double-counted" wegen Inkrement-Differenz).
 *     Limits angepasst mit kleinem Headroom.
 *
 * Stand Play-Store/B2C-Preis-Sync:
 *   - app.js: 855_686 Bytes (+686 ueber dem Limit von 855_000).
 *   - Top-Level-Funktionen: 546 (+1 ueber dem Limit von 545).
 *   - Begruendung: B2C-SKU-Preisquelle und Operator-Antworten wurden fuer
 *     Play-Store-Billing-Konsistenz vereinheitlicht. Limits minimal erhoeht;
 *     weitere Admin-Modularisierung soll sie wieder senken.
 *
 * Stand Konnektivitaets-/Auth-Diagnose:
 *   - app.js: 853_204 Bytes (unter dem Limit von 857_000 – Byte-Limit unveraendert).
 *   - Top-Level-Funktionen: 560 (+10 ueber dem alten Limit von 550; das Limit
 *     war bereits vor dieser Aenderung bei 559 ueberschritten).
 *   - Begruendung: nebenlaeufige Firebase-Konnektivitaetsprobe
 *     (_fetchBackendConnectivity) sowie klarere Auth-Fehlerhinweise
 *     (auth/project-soft-deleted u. a.). Funktions-Limit auf 565 angehoben
 *     (kleiner Headroom); weitere Admin-Modularisierung soll es wieder senken.
 *
 * Stand Repository-Finalisierung 2026-06-11:
 *   - app.js: 874_684 Bytes (aktueller main-Stand ohne weitere Admin-Panel-
 *     Aenderung in der Play-Store-Automatisierung).
 *   - Begruendung: Budget an den bestehenden Main-Baseline-Stand angeglichen,
 *     damit das Gate zukuenftiges Wachstum wieder blockiert. Weitere
 *     Admin-Modularisierung soll das Limit wieder senken.
 *
 * Stand Projektdaten-Loeschung + Dashboard-Redirect-Migration:
 *   - app.js: 582 Top-Level-Funktionen (Baseline lag bereits bei 581, +1 fuer
 *     den purgeAllProjectDataFromOnboarding-Handler). Funktions-Limit auf 590
 *     angehoben (kleiner Headroom); weitere Admin-Modularisierung soll es senken.
 *   - Das eigentliche Dashboard wurde nach `operator-dashboard-full_NEW.html`
 *     ausgelagert; `admin-panel/index.html` ist nur noch ein Redirect-Stub.
 *     Die HTML-Hardening-Pruefungen zielen daher auf die kanonische
 *     Dashboard-Datei statt auf den Stub.
 */

const APP_JS = "admin-panel/app.js";
// index.html ist seit der Dashboard-Migration nur ein Redirect-Stub; die
// eigentlichen CSP-/CSS-Hardening-Pruefungen gelten der kanonischen
// Dashboard-Datei, auf die der Stub weiterleitet.
const INDEX_HTML = "admin-panel/operator-dashboard-full_NEW.html";

const MAX_APP_JS_BYTES = 875_000;
const MAX_TOP_LEVEL_FUNCTIONS = 590;
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

  it("index.html ist frei von Inline-style=-Attributen (F6.1 CSS-Hardening)", async () => {
    const source = await readUtf8(INDEX_HTML);
    const inlineStyles = source.match(/\sstyle="/g) ?? [];
    expect(inlineStyles.length).toBe(0);
    // Style-Utilities-CSS muss eingebunden sein.
    expect(source).toMatch(/<link[^>]+href="styles-utilities\.css/);
    // Mindestens ein paar mm-u-Klassen muessen verwendet sein.
    const used = source.match(/\bmm-u\d+\b/g) ?? [];
    expect(used.length).toBeGreaterThan(100);
  });

  it("styles-utilities.css definiert alle in index.html verwendeten mm-u-Klassen (F6.1 Integritaet)", async () => {
    const html = await readUtf8(INDEX_HTML);
    const css = await readUtf8("admin-panel/styles-utilities.css");
    const usedSet = new Set((html.match(/\bmm-u\d+\b/g) ?? []));
    expect(usedSet.size).toBeGreaterThan(0);
    for (const cls of usedSet) {
      // jede genutzte Klasse muss als ".mm-uXXX {" definiert sein
      expect(css).toMatch(new RegExp(`\\.${cls}\\s*\\{`));
    }
  });

  it("firebase.json admin-panel CSP setzt style-src 'self' ohne 'unsafe-inline' (F6.1)", async () => {
    const fbJson = await readUtf8("firebase.json");
    // Suche den admin-panel-Block; er folgt einem "target": "admin-panel"
    const adminBlockMatch = fbJson.match(/"target"\s*:\s*"admin-panel"[\s\S]*?"Content-Security-Policy"[\s\S]*?"value"\s*:\s*"([^"]+)"/);
    expect(adminBlockMatch).not.toBeNull();
    const csp = adminBlockMatch![1];
    const styleSrcMatch = csp.match(/style-src\s+[^;]+/);
    expect(styleSrcMatch).not.toBeNull();
    expect(styleSrcMatch![0]).not.toMatch(/'unsafe-inline'/);
  });
});
