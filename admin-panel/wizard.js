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
        }
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
                        if (pidInput && !pidInput.value.trim()) pidInput.value = projectId;
                        updateDeepLinks();
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
        setHref("wiz-link-child-gs", `${base}/settings/general/android:com.google.pairing`);
        setHref("wiz-link-service-account", `${base}/settings/serviceaccounts/adminsdk`);
        setHref("wiz-link-appcheck", `${base}/appcheck/products`);
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
            acc[key] = file ? file.name : null;
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
            const name = files[key];
            rows.push(summaryRow(label, name ? `Datei: ${name}` : null, false));
        });

        const envLabels = {
            GEMINI_API_KEY: "GEMINI_API_KEY",
            OPENAI_API_KEY: "OPENAI_API_KEY",
            APPLE_BUNDLE_ID: "APPLE_BUNDLE_ID",
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
            });
        });
        // Project-ID-Aenderung -> Deep-Links aktualisieren
        const pidInput = document.getElementById("wiz-projectId");
        if (pidInput) pidInput.addEventListener("input", updateDeepLinks);
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
