/* MiniMaster Setup-Wizard
 *
 * Steuert die Step-Navigation, validiert Eingaben pro Schritt, aktualisiert
 * Deep-Links zur Firebase-Console sobald die Project-ID bekannt ist und
 * schickt am Ende einen einzelnen Request an /api/config/transfer.
 *
 * Speziell: KEINE Inline-Handler (CSP `script-src 'self'` ist aktiv).
 */
(function () {
    "use strict";

    const TOTAL_STEPS = 5;
    let currentStep = 1;

    // ── Helpers ────────────────────────────────────────────────────────
    function $(selector, root) { return (root || document).querySelector(selector); }
    function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

    function showStep(n) {
        if (n < 1 || n > TOTAL_STEPS) return;
        currentStep = n;
        $$(".wiz-step").forEach(section => {
            section.classList.toggle("is-active", Number(section.dataset.step) === n);
        });
        $$(".wiz-progress-step").forEach(node => {
            const stepNum = Number(node.dataset.step);
            node.classList.toggle("is-active", stepNum === n);
            node.classList.toggle("is-done", stepNum < n);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (n === TOTAL_STEPS) renderSummary();
    }

    function next() {
        if (!validateCurrent()) return;
        showStep(currentStep + 1);
    }

    function prev() { showStep(currentStep - 1); }

    function validateCurrent() {
        // Step 2 hat „weiche" Validierung – Project ID ist empfohlen, aber wenn
        // alle 7 Werte aus einer separaten Quelle (z. B. importierter JSON-Block)
        // kommen, lassen wir es auch durch. Konkret: Wir lassen alles durch und
        // werten erst beim Submit aus. Der Wizard ist eher Self-Service.
        return true;
    }

    // ── Pub/Sub-Topic via gcloud (Play Billing RTDN) ───────────────────

    function setPubsubStatus(message, level) {
        const node = document.getElementById("wiz-pubsub-status");
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    function _readPubsubInputs() {
        const topicInput = document.getElementById("wiz-env-PLAY_BILLING_PUBSUB_TOPIC");
        const projInput = document.getElementById("wiz-projectId");
        const topic = (topicInput && topicInput.value || "").trim();
        const projectId = (projInput && projInput.value || "").trim();
        return { topic, projectId };
    }

    async function checkPubsubTopic() {
        const { topic, projectId } = _readPubsubInputs();
        if (!projectId) {
            setPubsubStatus("Bitte zuerst die Project ID in Step 2 eintragen.", "warn");
            return;
        }
        if (!topic) {
            setPubsubStatus("Bitte zuerst einen Topic-Namen eintragen (Default-Vorschlag aus Project ID).", "warn");
            return;
        }
        setPubsubStatus("Pruefe Topic via gcloud …", "");
        try {
            const response = await fetch("/api/tools/pubsub-check-topic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, topic }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.exists) {
                setPubsubStatus(`✓ ${data.hint}`, "ok");
            } else {
                setPubsubStatus(`⚠ ${data.hint} – auf „Topic jetzt anlegen" klicken.`, "warn");
            }
        } catch (err) {
            setPubsubStatus(`✗ ${err.message}`, "err");
        }
    }

    async function createPubsubTopic() {
        const { topic, projectId } = _readPubsubInputs();
        if (!projectId) {
            setPubsubStatus("Bitte zuerst die Project ID in Step 2 eintragen.", "warn");
            return;
        }
        if (!topic) {
            setPubsubStatus("Bitte zuerst einen Topic-Namen eintragen.", "warn");
            return;
        }
        if (!confirm(`Pub/Sub-Topic '${topic}' im Projekt '${projectId}' anlegen?`)) return;
        setPubsubStatus("Erstelle Topic via gcloud …", "");
        try {
            const response = await fetch("/api/tools/pubsub-create-topic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, topic }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.created) {
                setPubsubStatus(`✓ ${data.hint}`, "ok");
            } else if (data.alreadyExisted) {
                setPubsubStatus(`ℹ ${data.hint}`, "ok");
            } else {
                setPubsubStatus(`✓ ${data.hint || "Topic verfuegbar."}`, "ok");
            }
        } catch (err) {
            setPubsubStatus(`✗ ${err.message}`, "err");
        }
    }

    // ── Apple Private Key Inline-Validator (openssl) ───────────────────

    function setApplePrivateKeyStatus(message, level) {
        const node = document.getElementById("wiz-apple-key-status");
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    async function validateApplePrivateKey() {
        const ta = document.getElementById("wiz-env-APPLE_PRIVATE_KEY");
        if (!ta) return;
        const key = (ta.value || "").trim();
        if (!key) {
            setApplePrivateKeyStatus("Status: leer (kann uebersprungen werden, falls keine iOS-Abos).", "");
            return;
        }
        setApplePrivateKeyStatus("Pruefe Schluessel via openssl …", "");
        try {
            const response = await fetch("/api/tools/apple-key-validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            if (data.valid) {
                const parts = [];
                if (data.pemType) parts.push(`Typ ${data.pemType}`);
                if (data.curve) parts.push(`Kurve ${data.curve}`);
                if (data.bits) parts.push(`${data.bits} Bit`);
                setApplePrivateKeyStatus(`✓ Gueltig – ${parts.join(", ")}.`, "ok");
            } else {
                setApplePrivateKeyStatus(`✗ ${data.hint || "ungueltig"}`, "err");
            }
        } catch (err) {
            setApplePrivateKeyStatus(`✗ Pruefung fehlgeschlagen: ${err.message}`, "err");
        }
    }

    // ── Keystore-Helfer (SHA-1 / SHA-256 via keytool) ──────────────────

    function setKeystoreStatus(message, level) {
        const node = document.getElementById("wiz-keystore-status");
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    function renderKeystoreResult(data) {
        const node = document.getElementById("wiz-keystore-result");
        if (!node) return;
        if (!data || !data.fingerprints) {
            node.hidden = true;
            return;
        }
        const fp = data.fingerprints;
        const rows = [];
        rows.push(`<p><strong>Keystore:</strong> <code>${escapeHtml(data.keystorePath)}</code></p>`);
        rows.push(`<p><strong>Alias:</strong> <code>${escapeHtml(data.alias)}</code></p>`);
        if (fp.sha1) {
            rows.push(`<p><strong>SHA-1:</strong> <code id="wiz-keystore-sha1">${escapeHtml(fp.sha1)}</code>
                <button type="button" class="wiz-btn" data-wiz-action="copyKeystoreSha1">In Zwischenablage kopieren</button></p>`);
        }
        if (fp.sha256) {
            rows.push(`<p><strong>SHA-256:</strong> <code id="wiz-keystore-sha256">${escapeHtml(fp.sha256)}</code>
                <button type="button" class="wiz-btn" data-wiz-action="copyKeystoreSha256">In Zwischenablage kopieren</button></p>`);
        }
        rows.push(`<p class="wiz-hint">
            → Firebase-Console → <em>Project Settings → Allgemein → Deine Apps → Android-App → Fingerprint hinzufuegen</em>
            (SHA-1 ist Pflicht fuer Google Sign-In, SHA-256 zusaetzlich fuer Play App Signing).
        </p>`);
        node.innerHTML = rows.join("\n");
        node.hidden = false;
        // Kopier-Buttons neu binden
        node.querySelectorAll("[data-wiz-action]").forEach(btn => {
            btn.addEventListener("click", () => {
                const a = btn.getAttribute("data-wiz-action");
                if (a === "copyKeystoreSha1") copyToClipboard(fp.sha1, "SHA-1");
                else if (a === "copyKeystoreSha256") copyToClipboard(fp.sha256, "SHA-256");
            });
        });
    }

    async function copyToClipboard(text, label) {
        try {
            await navigator.clipboard.writeText(text);
            setKeystoreStatus(`✓ ${label} in Zwischenablage kopiert.`, "ok");
        } catch (err) {
            setKeystoreStatus(`✗ Konnte nicht kopieren: ${err.message}`, "err");
        }
    }

    async function loadDebugKeystoreSha() {
        setKeystoreStatus("Lese Debug-Keystore via keytool …", "");
        try {
            const response = await fetch("/api/tools/android-debug-sha");
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            renderKeystoreResult(data);
            setKeystoreStatus("✓ Debug-Keystore erfolgreich gelesen.", "ok");
        } catch (err) {
            setKeystoreStatus(`✗ ${err.message}`, "err");
        }
    }

    async function loadCustomKeystoreSha() {
        const path = (document.getElementById("wiz-keystore-path") || {}).value || "";
        const alias = (document.getElementById("wiz-keystore-alias") || {}).value || "";
        const storepass = (document.getElementById("wiz-keystore-storepass") || {}).value || "";
        if (!path.trim()) {
            setKeystoreStatus("Bitte Pfad zur Keystore-Datei eintragen.", "warn");
            return;
        }
        setKeystoreStatus("Lese Keystore via keytool …", "");
        try {
            const response = await fetch("/api/tools/keystore-sha", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    path: path.trim(),
                    alias: alias.trim() || "androiddebugkey",
                    storepass,
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            renderKeystoreResult(data);
            setKeystoreStatus("✓ Keystore erfolgreich gelesen.", "ok");
        } catch (err) {
            setKeystoreStatus(`✗ ${err.message}`, "err");
        }
    }

    // ── Firebase-Direktimport ueber Google OAuth + Management REST API ─
    //
    // Token-Flow ueber Google Identity Services (GIS). Der Token bleibt
    // nur im Browser (sessionStorage waere noch persistenter; wir nutzen
    // in-memory, damit er nach Tab-Close weg ist). Die Firebase Management
    // REST API liefert Web-Konfig und google-services.json-Inhalte direkt
    // aus dem Internet – ganz ohne lokal installierte Firebase CLI.
    const OAUTH_CLIENT_ID_LS_KEY = "mm.wizard.oauthClientId";
    const OAUTH_SCOPE = "https://www.googleapis.com/auth/firebase.readonly";
    const FIREBASE_MGMT_BASE = "https://firebase.googleapis.com/v1beta1";

    let _oauthAccessToken = null;
    let _oauthTokenClient = null;

    function setOAuthStatus(message, level) {
        const node = document.getElementById("wiz-oauth-status");
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    function describeOAuthError(code) {
        const c = String(code || "").toLowerCase();
        // Bekannte Google-Fehler-Codes → konkrete Handlungsanweisung statt
        // generische Botschaft. Der Wizard ist Erstkontakt mit Google OAuth
        // fuer viele Nutzer – die Default-Meldungen reichen nicht.
        if (c === "access_denied" || c === "popup_closed_by_user") {
            return "✗ Zugriff von Google verweigert. Wahrscheinlichste Ursache: dein Konto ist " +
                "noch nicht als Test-User im OAuth-consent-screen eingetragen. " +
                "Loesung: console.cloud.google.com/apis/credentials/consent → " +
                "'Test users' → '+ Add users' → eigene Mail eintragen → erneut versuchen.";
        }
        if (c === "popup_blocked" || c === "popup_failed_to_open") {
            return "✗ Popup blockiert. Bitte Popups fuer 127.0.0.1:8765 im Browser zulassen und erneut klicken.";
        }
        if (c === "invalid_client" || c === "unauthorized_client") {
            return "✗ Client-ID ungueltig oder Origin nicht autorisiert. Pruefe in der Cloud-Console, " +
                "dass 'http://127.0.0.1:8765' bzw. 'http://localhost:8765' als 'Authorized JavaScript origin' " +
                "im OAuth-Client eingetragen ist.";
        }
        if (c === "invalid_scope") {
            return "✗ Scope abgelehnt. Pruefe, dass die Firebase Management API im Cloud-Projekt aktiviert ist " +
                "(console.cloud.google.com/apis/library/firebase.googleapis.com).";
        }
        return `✗ Login fehlgeschlagen: ${code || "unbekannt"}`;
    }

    function getOAuthClientId() {
        const input = document.getElementById("wiz-oauth-client-id");
        return ((input && input.value) || "").trim();
    }

    function loadStoredClientId() {
        try {
            const stored = localStorage.getItem(OAUTH_CLIENT_ID_LS_KEY);
            const input = document.getElementById("wiz-oauth-client-id");
            if (stored && input && !input.value) input.value = stored;
        } catch (_err) { /* localStorage may be disabled */ }
    }

    function persistClientId(value) {
        try { localStorage.setItem(OAUTH_CLIENT_ID_LS_KEY, value); }
        catch (_err) { /* ignore */ }
    }

    function ensureGisLoaded() {
        return new Promise((resolve, reject) => {
            const w = window;
            const start = Date.now();
            const tick = () => {
                if (w.google && w.google.accounts && w.google.accounts.oauth2) {
                    resolve(w.google.accounts.oauth2);
                    return;
                }
                if (Date.now() - start > 8000) {
                    reject(new Error("Google Identity Services konnte nicht geladen werden (Netzwerk?)."));
                    return;
                }
                setTimeout(tick, 100);
            };
            tick();
        });
    }

    async function loginGoogleOAuth() {
        const clientId = getOAuthClientId();
        if (!clientId) {
            setOAuthStatus("Bitte zuerst die OAuth Client ID eintragen.", "warn");
            return;
        }
        persistClientId(clientId);
        setOAuthStatus("Lade Google Identity Services …", "");
        let oauth2;
        try {
            oauth2 = await ensureGisLoaded();
        } catch (err) {
            setOAuthStatus(`✗ ${err.message}`, "err");
            return;
        }
        try {
            _oauthTokenClient = oauth2.initTokenClient({
                client_id: clientId,
                scope: OAUTH_SCOPE,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        _oauthAccessToken = tokenResponse.access_token;
                        onOAuthLoggedIn();
                    } else if (tokenResponse && tokenResponse.error) {
                        setOAuthStatus(describeOAuthError(tokenResponse.error), "err");
                    }
                },
                error_callback: (err) => {
                    const code = (err && (err.type || err.error)) || "unbekannt";
                    setOAuthStatus(describeOAuthError(code), "err");
                },
            });
            setOAuthStatus("Oeffne Google-Anmeldung …", "");
            _oauthTokenClient.requestAccessToken({ prompt: "consent" });
        } catch (err) {
            setOAuthStatus(`✗ Auth-Setup fehlgeschlagen: ${err.message}`, "err");
        }
    }

    function logoutGoogleOAuth() {
        _oauthAccessToken = null;
        const projectBlock = document.getElementById("wiz-oauth-project-block");
        const importActions = document.getElementById("wiz-oauth-import-actions");
        const logoutBtn = document.getElementById("wiz-oauth-logout-btn");
        if (projectBlock) projectBlock.hidden = true;
        if (importActions) importActions.hidden = true;
        if (logoutBtn) logoutBtn.hidden = true;
        setOAuthStatus("Abgemeldet.", "");
    }

    async function onOAuthLoggedIn() {
        const logoutBtn = document.getElementById("wiz-oauth-logout-btn");
        if (logoutBtn) logoutBtn.hidden = false;
        setOAuthStatus("✓ Angemeldet. Lade Projektliste …", "ok");
        try {
            const projects = await fetchFirebaseProjectsOAuth();
            const select = document.getElementById("wiz-oauth-project-select");
            const block = document.getElementById("wiz-oauth-project-block");
            const importActions = document.getElementById("wiz-oauth-import-actions");
            const importBtn = document.getElementById("wiz-oauth-import-btn");
            if (block) block.hidden = false;
            if (importActions) importActions.hidden = false;
            if (!select) return;
            select.innerHTML = "";
            if (projects.length === 0) {
                select.appendChild(buildOption("", "(keine Firebase-Projekte zugreifbar)"));
                select.disabled = true;
                if (importBtn) importBtn.disabled = true;
                setOAuthStatus("⚠ Keine Firebase-Projekte in diesem Konto sichtbar.", "warn");
                return;
            }
            select.appendChild(buildOption("", "— bitte waehlen —"));
            projects.forEach(p => {
                const label = p.displayName ? `${p.displayName} (${p.projectId})` : p.projectId;
                select.appendChild(buildOption(p.projectId, label));
            });
            select.disabled = false;
            if (importBtn) importBtn.disabled = false;
            setOAuthStatus(`✓ ${projects.length} Projekt(e) geladen. Eines auswaehlen und uebernehmen.`, "ok");
        } catch (err) {
            setOAuthStatus(`✗ Projekt-Liste fehlgeschlagen: ${err.message}`, "err");
        }
    }

    async function fetchOAuthJson(path) {
        const response = await fetch(`${FIREBASE_MGMT_BASE}${path}`, {
            headers: { Authorization: `Bearer ${_oauthAccessToken}` },
        });
        if (!response.ok) {
            let detail = "";
            try {
                const errData = await response.json();
                detail = (errData && errData.error && errData.error.message) || "";
            } catch (_e) { /* ignore */ }
            throw new Error(`HTTP ${response.status} ${response.statusText}${detail ? ` – ${detail}` : ""}`);
        }
        return response.json();
    }

    async function fetchFirebaseProjectsOAuth() {
        // Paginierte Liste; fuer Setup-Wizard reicht die erste Seite (default ~25).
        const data = await fetchOAuthJson("/projects?pageSize=200");
        const results = (data && data.results) || [];
        return results.map(p => ({
            projectId: p.projectId || "",
            displayName: p.displayName || "",
        })).filter(p => p.projectId);
    }

    function base64ToText(b64) {
        // Browser-Atob plus UTF-8 Korrektur.
        const binary = atob(b64);
        try {
            return decodeURIComponent(escape(binary));
        } catch (_err) {
            return binary;
        }
    }

    async function importViaOAuth() {
        const select = document.getElementById("wiz-oauth-project-select");
        if (!select || !select.value) {
            setOAuthStatus("Bitte ein Projekt auswaehlen.", "warn");
            return;
        }
        const projectId = select.value;
        setOAuthStatus(`Hole Konfiguration von firebase.googleapis.com fuer '${projectId}' …`, "");
        try {
            // Web-Apps -> erste passende -> Web-Config
            const webApps = await fetchOAuthJson(`/projects/${encodeURIComponent(projectId)}/webApps?pageSize=100`);
            const firstWeb = (webApps.apps || [])[0];
            let webConfig = null;
            if (firstWeb && firstWeb.appId) {
                const cfg = await fetchOAuthJson(`/projects/${encodeURIComponent(projectId)}/webApps/${encodeURIComponent(firstWeb.appId)}/config`);
                webConfig = {
                    apiKey: cfg.apiKey || "",
                    authDomain: cfg.authDomain || "",
                    projectId: cfg.projectId || projectId,
                    storageBucket: cfg.storageBucket || "",
                    messagingSenderId: cfg.messagingSenderId || "",
                    appId: cfg.appId || firstWeb.appId,
                    measurementId: cfg.measurementId || "",
                };
            }

            // Android-Apps -> nach package_name filtern
            const androidList = await fetchOAuthJson(`/projects/${encodeURIComponent(projectId)}/androidApps?pageSize=100`);
            const androidApps = [];
            for (const app of (androidList.apps || [])) {
                const pkg = app.packageName || "";
                if (pkg !== "com.minimaster.masterapp" && pkg !== "com.minimaster.childapp") continue;
                if (!app.appId) continue;
                const cfg = await fetchOAuthJson(`/projects/${encodeURIComponent(projectId)}/androidApps/${encodeURIComponent(app.appId)}/config`);
                const b64 = cfg.configFileContents || "";
                const fileContents = b64 ? base64ToText(b64) : "";
                androidApps.push({
                    appId: app.appId,
                    packageName: pkg,
                    displayName: app.displayName || "",
                    fileContents,
                });
            }

            // Service-Account: REST-API erlaubt Generierung waere ueber IAM API moeglich,
            // wir wollen hier aber bewusst KEINE Schluessel erzeugen (Security + Quoten).
            const serviceAccount = {
                available: false,
                reason: "Aus Sicherheitsgruenden generiert der Wizard keine Service-Account-Keys. "
                      + "Bitte den Schluessel manuell in der Firebase-Console erzeugen und im naechsten Schritt hochladen.",
                consoleUrl: `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/settings/serviceaccounts/adminsdk`,
            };

            const summary = applyFirebaseImport({
                projectId,
                webConfig,
                androidApps,
                serviceAccount,
                warnings: [],
            });
            setOAuthStatus(`✓ ${summary}`, "ok");
        } catch (err) {
            setOAuthStatus(`✗ Import fehlgeschlagen: ${err.message}`, "err");
        }
    }

    // ── Firebase-Import (lesend, ueber Firebase CLI) ───────────────────
    //
    // Hier zwischengespeicherte Inhalte fuer die Pflicht-Dateien. Werden
    // beim Submit als artifacts[<key>].content gesendet, sofern der User
    // nicht zusaetzlich manuell eine andere Datei hochgeladen hat (die
    // gewinnt dann).
    const _firebaseImportedArtifacts = Object.create(null);

    function setFirebaseImportStatus(message, level) {
        const node = document.getElementById("wiz-firebase-import-status");
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    async function loadFirebaseProjects() {
        const select = document.getElementById("wiz-firebase-project-select");
        const importBtn = document.getElementById("wiz-firebase-import-btn");
        setFirebaseImportStatus("Lade Projekte aus 'firebase projects:list' …", "");
        try {
            const response = await fetch("/api/firebase/projects");
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const projects = data.projects || [];
            if (!select) return;
            select.innerHTML = "";
            if (projects.length === 0) {
                select.appendChild(buildOption("", "(keine Projekte gefunden)"));
                select.disabled = true;
                if (importBtn) importBtn.disabled = true;
                setFirebaseImportStatus("Keine Projekte mit dem aktuellen Login zugreifbar.", "warn");
                return;
            }
            select.appendChild(buildOption("", "— bitte waehlen —"));
            projects.forEach(p => {
                const label = p.displayName ? `${p.displayName} (${p.projectId})` : p.projectId;
                select.appendChild(buildOption(p.projectId, label));
            });
            select.disabled = false;
            if (importBtn) importBtn.disabled = false;
            setFirebaseImportStatus(`✓ ${projects.length} Projekt(e) geladen. Eines auswaehlen und uebernehmen.`, "ok");
        } catch (err) {
            setFirebaseImportStatus(`✗ Laden fehlgeschlagen: ${err.message}`, "err");
            if (select) {
                select.innerHTML = "";
                select.appendChild(buildOption("", "(Fehler – siehe Status)"));
                select.disabled = true;
            }
            if (importBtn) importBtn.disabled = true;
        }
    }

    function buildOption(value, label) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        return opt;
    }

    async function importFirebaseProject() {
        const select = document.getElementById("wiz-firebase-project-select");
        if (!select || !select.value) {
            setFirebaseImportStatus("Bitte zuerst ein Projekt auswaehlen.", "warn");
            return;
        }
        const projectId = select.value;
        setFirebaseImportStatus(`Hole Konfiguration fuer '${projectId}' aus der Firebase CLI …`, "");
        try {
            const response = await fetch(`/api/firebase/import?projectId=${encodeURIComponent(projectId)}`);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const summary = applyFirebaseImport(data);
            setFirebaseImportStatus(`✓ ${summary}`, "ok");
        } catch (err) {
            setFirebaseImportStatus(`✗ Import fehlgeschlagen: ${err.message}`, "err");
        }
    }

    function applyFirebaseImport(data) {
        const parts = [];

        // Web-Konfiguration in die Eingabefelder uebernehmen.
        const web = data && data.webConfig;
        if (web && typeof web === "object") {
            const keys = ["projectId", "apiKey", "authDomain", "storageBucket", "messagingSenderId", "appId", "measurementId"];
            let written = 0;
            keys.forEach(key => {
                const value = web[key];
                if (typeof value !== "string" || !value) return;
                const input = document.querySelector(`[data-firebase-key="${key}"]`);
                if (input) {
                    input.value = value;
                    written += 1;
                }
            });
            if (written > 0) parts.push(`Web-Konfig (${written} Felder)`);
        } else {
            parts.push("keine Web-App im Projekt");
        }

        // Android-Configs → Pflicht-Dateien-Inhalte vorhalten.
        const androidApps = (data && data.androidApps) || [];
        let masterAssigned = false;
        let childAssigned = false;
        androidApps.forEach(app => {
            if (!app || !app.fileContents) return;
            const pkg = app.packageName || "";
            if (pkg === "com.minimaster.masterapp" && !masterAssigned) {
                _firebaseImportedArtifacts.googleServicesMaster = app.fileContents;
                markArtifactImported("googleServicesMaster", pkg);
                masterAssigned = true;
            } else if (pkg === "com.minimaster.childapp" && !childAssigned) {
                _firebaseImportedArtifacts.googleServicesChild = app.fileContents;
                markArtifactImported("googleServicesChild", pkg);
                childAssigned = true;
            }
        });
        if (masterAssigned) parts.push("masterApp/google-services.json");
        if (childAssigned) parts.push("childApp/google-services.json");

        // Service Account: kann CLI nicht erzeugen → Hinweis durchreichen.
        if (data && data.serviceAccount && data.serviceAccount.consoleUrl) {
            const link = document.getElementById("wiz-link-service-account");
            if (link) link.setAttribute("href", data.serviceAccount.consoleUrl);
        }

        // Deep-Links erneut auflösen, falls die Project-ID gerade gesetzt wurde.
        updateDeepLinks();
        // Aus der jetzt bekannten Project-ID weitere Folge-Felder vorausfuellen.
        deriveFromProjectId();
        // PLAY_PACKAGE_NAME aus master-google-services.json-Inhalt extrahieren
        const importedMaster = _firebaseImportedArtifacts.googleServicesMaster;
        if (importedMaster) {
            try {
                const parsed = JSON.parse(importedMaster);
                const pkg = parsed && parsed.client && parsed.client[0]
                    && parsed.client[0].client_info && parsed.client[0].client_info.android_client_info
                    && parsed.client[0].client_info.android_client_info.package_name;
                if (pkg) setAutoIfEmpty("wiz-env-PLAY_PACKAGE_NAME", pkg, "aus Firebase-Import");
                const senderId = parsed && parsed.project_info && parsed.project_info.project_number;
                if (senderId) setAutoIfEmpty("wiz-messagingSenderId", String(senderId), "aus Firebase-Import");
            } catch (_e) { /* ignore parse errors */ }
        }

        // CLI hat Teil-Warnungen geliefert?
        const warnings = (data && data.warnings) || [];
        if (warnings.length) {
            parts.push(`(${warnings.length} Teil-Warnung(en))`);
        }

        return parts.length ? `Uebernommen: ${parts.join(", ")}. Service-Account-Key bitte manuell hochladen.` : "Keine uebernehmbaren Werte gefunden.";
    }

    function markArtifactImported(key, pkg) {
        const status = document.getElementById(`wiz-art-${shortFileKey(key)}-status`);
        if (!status) return;
        status.textContent = `✓ Aus Firebase CLI uebernommen (package=${pkg}). Datei-Upload ueberschreibt diese Quelle.`;
        status.className = "wiz-status is-ok";
    }

    // ── Field-Sammler ──────────────────────────────────────────────────
    function collectFirebase() {
        const out = {};
        $$("[data-firebase-key]").forEach(input => {
            const key = input.getAttribute("data-firebase-key");
            const value = (input.value || "").trim();
            if (value) out[key] = value;
        });
        return out;
    }

    function collectEnv() {
        const out = {};
        $$("[data-env-key]").forEach(input => {
            const key = input.getAttribute("data-env-key");
            const value = (input.value || "").trim();
            if (value) out[key] = value;
        });
        return out;
    }

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Datei nicht lesbar"));
            reader.readAsText(file);
        });
    }

    async function collectArtifacts() {
        const out = {};
        const fileInputs = $$("[data-artifact-key]");

        // Manuelle Uploads haben Vorrang.
        const uploadedKeys = new Set();
        for (const input of fileInputs) {
            const key = input.getAttribute("data-artifact-key");
            const file = input.files && input.files[0];
            if (!file) continue;
            let text;
            try {
                text = await readFileAsText(file);
            } catch (err) {
                throw new Error(`${key}: ${err.message}`);
            }
            try {
                JSON.parse(text);
            } catch (err) {
                throw new Error(`${key}: kein gueltiges JSON (${err.message})`);
            }
            out[key] = { content: text };
            uploadedKeys.add(key);
        }

        // Aus Firebase CLI importierte Inhalte nachreichen, sofern der User
        // nicht manuell eine Datei hochgeladen hat.
        Object.entries(_firebaseImportedArtifacts).forEach(([key, content]) => {
            if (!uploadedKeys.has(key) && typeof content === "string" && content) {
                out[key] = { content };
            }
        });

        return out;
    }

    // ── Status-Anzeige fuer Datei-Uploads ──────────────────────────────
    function setFileStatus(key, state, message) {
        const node = document.getElementById(`wiz-art-${shortFileKey(key)}-status`);
        if (!node) return;
        node.textContent = message;
        node.className = "wiz-status" + (state ? ` is-${state}` : "");
    }

    function shortFileKey(key) {
        if (key === "googleServicesMaster") return "master";
        if (key === "googleServicesChild") return "child";
        if (key === "serviceAccountKey") return "sa";
        return key;
    }

    function attachFileValidators() {
        $$("[data-artifact-key]").forEach(input => {
            const key = input.getAttribute("data-artifact-key");
            input.addEventListener("change", async () => {
                const file = input.files && input.files[0];
                if (!file) {
                    setFileStatus(key, "", "Status: keine Datei ausgewaehlt");
                    return;
                }
                try {
                    const text = await readFileAsText(file);
                    const data = JSON.parse(text);
                    const projectId = (data && (data.project_id || (data.project_info && data.project_info.project_id))) || "";
                    const pkg = data && data.client && Array.isArray(data.client) && data.client[0]
                        && data.client[0].client_info && data.client[0].client_info.android_client_info
                        && data.client[0].client_info.android_client_info.package_name;
                    const parts = [];
                    if (projectId) parts.push(`project_id=${projectId}`);
                    if (pkg) parts.push(`package=${pkg}`);
                    setFileStatus(key, "ok", `✓ Gueltiges JSON${parts.length ? ` (${parts.join(", ")})` : ""}`);

                    // Wenn der File die Project-ID liefert und das Feld noch leer ist,
                    // koennen wir es automatisch nachtragen.
                    if (projectId) {
                        const pidInput = document.getElementById("wiz-projectId");
                        if (pidInput && !pidInput.value.trim()) {
                            pidInput.value = projectId;
                            _autoFilled.add("wiz-projectId");
                            showAutoBadge(pidInput, `aus ${shortFileKey(key)}-Upload`);
                        }
                        updateDeepLinks();
                        deriveFromProjectId();
                    }
                    // messagingSenderId aus project_info.project_number ableiten
                    const senderId = data && data.project_info && data.project_info.project_number;
                    if (senderId) {
                        setAutoIfEmpty("wiz-messagingSenderId", String(senderId), `aus ${shortFileKey(key)}-Upload`);
                    }
                    // PLAY_PACKAGE_NAME aus master-google-services.json
                    if (key === "googleServicesMaster" && pkg) {
                        setAutoIfEmpty("wiz-env-PLAY_PACKAGE_NAME", pkg, "aus masterApp google-services.json");
                    }
                } catch (err) {
                    setFileStatus(key, "err", `✗ ${err.message}`);
                }
            });
        });
    }

    // ── Deep-Links zur Firebase-Console ────────────────────────────────
    function updateDeepLinks() {
        const projectId = (document.getElementById("wiz-projectId") || {}).value || "";
        const pid = (projectId.trim()) || "_";
        const base = `https://console.firebase.google.com/project/${encodeURIComponent(pid)}`;
        setHref("wiz-link-firebase-general", `${base}/settings/general/`);
        setHref("wiz-link-master-gs", `${base}/settings/general/android:com.minimaster.masterapp`);
        setHref("wiz-link-child-gs", `${base}/settings/general/android:com.minimaster.childapp`);
        setHref("wiz-link-service-account", `${base}/settings/serviceaccounts/adminsdk`);
        setHref("wiz-link-appcheck", `${base}/appcheck/products`);
    }

    // ── Auto-Berechnung aus Project ID ─────────────────────────────────
    //
    // Sobald die Project-ID bekannt ist, koennen mehrere andere Felder per
    // Firebase-Konvention abgeleitet werden. Wir befuellen NUR Felder, die
    // (a) leer sind oder (b) ein zuvor von uns berechneter Wert sind – damit
    // ueberschreiben wir niemals etwas, was der User selbst eingegeben hat.
    const _autoFilled = new Set();

    function setAutoIfEmpty(inputId, value, hintNode) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const current = (input.value || "").trim();
        const wasAutoFilled = _autoFilled.has(inputId);
        if (current && !wasAutoFilled) return; // User hat eigenen Wert
        input.value = value;
        _autoFilled.add(inputId);
        if (hintNode) showAutoBadge(input, hintNode);
    }

    function showAutoBadge(input, label) {
        // Visuell markieren, dass der Wert berechnet wurde. Wird beim ersten
        // User-Edit wieder entfernt.
        if (input.dataset.autoBadge === "1") return;
        input.dataset.autoBadge = "1";
        input.title = `Vorgeschlagen: ${label}. Du kannst den Wert ueberschreiben.`;
        const handler = () => {
            _autoFilled.delete(input.id);
            input.dataset.autoBadge = "";
            input.removeAttribute("title");
            input.removeEventListener("input", handler);
        };
        input.addEventListener("input", handler);
    }

    function deriveFromProjectId() {
        const pidInput = document.getElementById("wiz-projectId");
        const projectId = ((pidInput && pidInput.value) || "").trim();
        if (!projectId) return;
        // Firebase-Web-Konvention
        setAutoIfEmpty("wiz-authDomain", `${projectId}.firebaseapp.com`,
            "aus Project ID");
        // Storage-Bucket: 2024+ default ist firebasestorage.app; aeltere
        // Projekte nutzen appspot.com. User kann das problemlos korrigieren.
        setAutoIfEmpty("wiz-storageBucket", `${projectId}.firebasestorage.app`,
            "aus Project ID (alt: <projectId>.appspot.com)");
        // Play Billing RTDN-Topic-Vorschlag
        setAutoIfEmpty("wiz-env-PLAY_BILLING_PUBSUB_TOPIC",
            `projects/${projectId}/topics/play-billing-notifications`,
            "Konvention: projects/<gcp-project>/topics/play-billing-notifications");
    }

    function setHref(id, href) {
        const node = document.getElementById(id);
        if (node) node.setAttribute("href", href);
    }

    // ── Zusammenfassung (Step 5) ───────────────────────────────────────
    function renderSummary() {
        const list = document.getElementById("wiz-summary-list");
        if (!list) return;
        const firebase = collectFirebase();
        const env = collectEnv();
        const files = $$("[data-artifact-key]").reduce((acc, input) => {
            const key = input.getAttribute("data-artifact-key");
            const file = input.files && input.files[0];
            if (file) {
                acc[key] = `Upload: ${file.name}`;
            } else if (_firebaseImportedArtifacts[key]) {
                acc[key] = "aus Firebase CLI uebernommen";
            } else {
                acc[key] = null;
            }
            return acc;
        }, {});

        const rows = [];
        const fbLabels = {
            projectId: "Firebase Project ID",
            apiKey: "Web API Key",
            authDomain: "Auth Domain",
            storageBucket: "Storage Bucket",
            messagingSenderId: "Messaging Sender ID",
            appId: "App ID",
            measurementId: "Measurement ID (optional)",
            appCheckSiteKey: "App Check Site Key (optional)",
        };
        Object.entries(fbLabels).forEach(([key, label]) => {
            const value = firebase[key];
            rows.push(summaryRow(label, value, key === "measurementId" || key === "appCheckSiteKey"));
        });

        const fileLabels = {
            googleServicesMaster: "masterApp/google-services.json",
            googleServicesChild: "childApp/google-services.json",
            serviceAccountKey: "serviceAccountKey.json",
        };
        Object.entries(fileLabels).forEach(([key, label]) => {
            rows.push(summaryRow(label, files[key], false));
        });

        const envLabels = {
            GEMINI_API_KEY: "GEMINI_API_KEY",
            OPENAI_API_KEY: "OPENAI_API_KEY",
            RESEND_API_KEY: "RESEND_API_KEY",
            SUPPORT_FROM_EMAIL: "SUPPORT_FROM_EMAIL",
            APPLE_BUNDLE_ID: "APPLE_BUNDLE_ID",
            PLAY_PACKAGE_NAME: "PLAY_PACKAGE_NAME",
            PLAY_BILLING_PUBSUB_TOPIC: "PLAY_BILLING_PUBSUB_TOPIC",
        };
        Object.entries(envLabels).forEach(([key, label]) => {
            const value = env[key];
            const masked = value && /KEY/i.test(key) ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
            rows.push(summaryRow(label, masked || null, true));
        });

        list.innerHTML = rows.join("");
    }

    function summaryRow(label, value, optional) {
        const safe = value ? escapeHtml(value) : (optional ? "—" : "(fehlt)");
        const cls = value ? "is-ok" : (optional ? "" : "is-missing");
        return `<li>
            <span class="wiz-summary-key">${escapeHtml(label)}</span>
            <span class="wiz-summary-val ${cls}">${safe}</span>
        </li>`;
    }

    function escapeHtml(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ── Submit ─────────────────────────────────────────────────────────
    async function submitWizard() {
        const submitBtn = document.getElementById("wiz-submit-btn");
        const result = document.getElementById("wiz-result");
        if (submitBtn) submitBtn.disabled = true;

        let payload;
        try {
            payload = {
                firebase: collectFirebase(),
                env: collectEnv(),
                artifacts: await collectArtifacts(),
            };
        } catch (err) {
            showResult(`Datei-Fehler: ${err.message}`, "is-error");
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        showResult("Speichere Konfiguration …", "");

        try {
            const response = await fetch("/api/config/transfer", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const written = (data.envWritten || []).length;
            const artifacts = (data.artifactsWritten || []).length;
            const snapshot = (data.snapshot && data.snapshot.snapshotId) || "—";
            showResult(
                `✓ Erfolgreich gespeichert.\n` +
                `  • Geschriebene .env-Schluessel: ${written}\n` +
                `  • Geschriebene Pflicht-Dateien: ${artifacts}\n` +
                `  • Firebase-Config.js fuer alle Panels aktualisiert: ${data.adminPanelFirebaseConfigWritten ? "ja" : "nein"}\n` +
                `  • Automatischer Snapshot: ${snapshot}\n\n` +
                `In 3 Sekunden wirst du zum Admin-Panel weitergeleitet…`,
                "",
            );
            setTimeout(() => { window.location.href = "/admin-panel/"; }, 3000);
        } catch (err) {
            showResult(`Fehler beim Speichern: ${err.message}`, "is-error");
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function showResult(text, modifier) {
        const node = document.getElementById("wiz-result");
        if (!node) return;
        node.hidden = false;
        node.className = "wiz-result" + (modifier ? ` ${modifier}` : "");
        node.textContent = text;
    }

    // ── Aktuellen Zustand aus dem Server laden (optional) ──────────────
    async function preloadFromServer() {
        try {
            const response = await fetch("/api/config/transfer");
            if (!response.ok) return;
            const data = await response.json();
            const firebase = data.firebase || {};
            Object.entries(firebase).forEach(([key, value]) => {
                const input = document.querySelector(`[data-firebase-key="${key}"]`);
                if (input && value) input.value = value;
            });
            // Pflicht-Dateien-Status anzeigen, wenn vorhanden.
            const artifacts = data.artifacts || {};
            Object.entries(artifacts).forEach(([key, info]) => {
                if (info && info.valid) {
                    setFileStatus(key, "ok", `✓ Bereits vorhanden (${info.projectId || "—"})`);
                } else if (info && info.exists) {
                    setFileStatus(key, "warn", `⚠ Datei vorhanden, aber ungueltig: ${info.error || ""}`);
                }
            });
            updateDeepLinks();
        } catch (_err) {
            // ohne Server: stiller Skip
        }
    }

    // ── Init ───────────────────────────────────────────────────────────
    function init() {
        // Buttons binden
        $$("[data-wiz-action]").forEach(btn => {
            const action = btn.getAttribute("data-wiz-action");
            btn.addEventListener("click", () => {
                if (action === "next") next();
                else if (action === "prev") prev();
                else if (action === "submit") submitWizard();
                else if (action === "loadFirebaseProjects") loadFirebaseProjects();
                else if (action === "importFirebaseProject") importFirebaseProject();
                else if (action === "loginGoogleOAuth") loginGoogleOAuth();
                else if (action === "logoutGoogleOAuth") logoutGoogleOAuth();
                else if (action === "importViaOAuth") importViaOAuth();
                else if (action === "loadDebugKeystoreSha") loadDebugKeystoreSha();
                else if (action === "loadCustomKeystoreSha") loadCustomKeystoreSha();
                else if (action === "checkPubsubTopic") checkPubsubTopic();
                else if (action === "createPubsubTopic") createPubsubTopic();
            });
        });
        // Gespeicherte Client-ID aus localStorage vorbefuellen
        loadStoredClientId();
        // Apple-Private-Key auto-validieren beim Verlassen des Feldes
        const appleKeyTa = document.getElementById("wiz-env-APPLE_PRIVATE_KEY");
        if (appleKeyTa) appleKeyTa.addEventListener("blur", validateApplePrivateKey);
        // Project-ID-Aenderung -> Deep-Links aktualisieren + Folge-Felder vorausfuellen
        const pidInput = document.getElementById("wiz-projectId");
        if (pidInput) {
            pidInput.addEventListener("input", () => {
                updateDeepLinks();
                deriveFromProjectId();
            });
        }
        attachFileValidators();
        updateDeepLinks();
        showStep(1);
        preloadFromServer();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
