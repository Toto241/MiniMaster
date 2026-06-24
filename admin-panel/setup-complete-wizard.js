/* MiniMaster – Komplett-Einrichtung von Null (Operator Setup Wizard)
 *
 * Orchestriert die fuenf Einrichtungs-Phasen, indem er den aggregierten
 * Setup-Status aus dem Backend liest und durch die Luecken fuehrt. Setzt –
 * ausser dem Abhaken der Commissioning-Gates – keine Werte, sondern verlinkt
 * zu den jeweiligen Spezial-Werkzeugen.
 *
 * CSP: KEINE Inline-Handler. Alle Bindungen via addEventListener.
 * Auth-Gate: nur eingeloggte Admins duerfen die interaktiven Schritte nutzen.
 */
(function () {
    "use strict";

    const TOTAL_STEPS = 7;
    let currentStep = 1;
    let isAdmin = false;
    let auth = null;
    let functions = null;

    // Caches der letzten Callable-Antworten (fuer Wiederverwendung zwischen Steps).
    let lastSetupStatus = null;

    // Zustand der bereits abgeschlossenen Schritte (fuer Progress-Persistenz).
    const completedSteps = new Set();

    // ── Helpers ────────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

    function escapeHtml(value) {
        const str = value === null || value === undefined ? "" : String(value);
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function setStatus(node, message, level) {
        if (!node) return;
        node.hidden = false;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    function badgeHtml(label, level) {
        return `<span class="scw-badge is-${level}">${escapeHtml(label)}</span>`;
    }

    function show(node) { if (node) node.hidden = false; }
    function hide(node) { if (node) node.hidden = true; }

    function friendlyError(err) {
        if (!err) return "Unbekannter Fehler.";
        if (err.code === "permission-denied" || err.code === "functions/permission-denied") {
            return "Zugriff verweigert – bitte als Admin anmelden.";
        }
        if (err.code === "unauthenticated" || err.code === "functions/unauthenticated") {
            return "Nicht angemeldet – bitte im Dashboard als Admin einloggen.";
        }
        return err.message ? String(err.message) : "Aufruf fehlgeschlagen.";
    }

    // Sicherer Callable-Wrapper. Wirft weiter, aber loggt einheitlich.
    async function callFn(name, payload) {
        if (!functions) throw new Error("Firebase Functions sind nicht initialisiert.");
        const callable = functions.httpsCallable(name);
        const res = await callable(payload || {});
        return res && res.data ? res.data : res;
    }

    // ── Firebase-Initialisierung ───────────────────────────────────────────
    function loadFirebaseConfig() {
        const injected = (typeof window !== "undefined" && window.__MM_FIREBASE_CONFIG__) || null;
        if (injected && injected.apiKey && injected.projectId) return injected;
        return null;
    }

    function initFirebase() {
        if (typeof firebase === "undefined" || typeof firebase.initializeApp !== "function") {
            return { ok: false, reason: "Firebase-SDK konnte nicht geladen werden." };
        }
        const config = loadFirebaseConfig();
        if (!config) {
            return {
                ok: false,
                reason: "Keine Firebase-Konfiguration gefunden. Bitte zuerst den Firebase-Setup-Wizard ausfuehren.",
            };
        }
        try {
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(config);
            }
            auth = firebase.auth();
            functions = firebase.functions(); // admin-panel nutzt DEFAULT-Region
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: friendlyError(err) };
        }
    }

    // ── Auth-Gate ──────────────────────────────────────────────────────────
    function lockWizard(message) {
        isAdmin = false;
        const shell = $("wiz-shell");
        if (shell) shell.setAttribute("data-locked", "true");
        const notice = $("scw-auth-notice");
        if (notice) {
            notice.hidden = false;
            notice.innerHTML =
                escapeHtml(message) +
                ' <a href="./index.html">Zum Operator-Dashboard (als Admin anmelden) →</a>';
        }
    }

    function unlockWizard() {
        isAdmin = true;
        const shell = $("wiz-shell");
        if (shell) shell.setAttribute("data-locked", "false");
        const notice = $("scw-auth-notice");
        if (notice) notice.hidden = true;
    }

    // ── Step-Navigation ────────────────────────────────────────────────────
    function showStep(n) {
        if (n < 1 || n > TOTAL_STEPS) return;
        currentStep = n;
        $$(".wiz-step").forEach((section) => {
            section.classList.toggle("is-active", Number(section.dataset.step) === n);
        });
        $$(".wiz-progress-step").forEach((node) => {
            const stepNum = Number(node.dataset.step);
            node.classList.toggle("is-active", stepNum === n);
            node.classList.toggle("is-done", completedSteps.has(stepNum) || stepNum < n);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        if (isAdmin) loadStepData(n);
    }

    async function goNext() {
        completedSteps.add(currentStep);
        const target = Math.min(currentStep + 1, TOTAL_STEPS);
        showStep(target);
        await persistProgress("in_progress");
    }

    async function goPrev() {
        showStep(Math.max(currentStep - 1, 1));
        await persistProgress("in_progress");
    }

    // ── Progress-Persistenz ────────────────────────────────────────────────
    async function persistProgress(status) {
        if (!isAdmin) return;
        try {
            await callFn("setWizardProgress", {
                wizardId: "setup-complete",
                currentStep,
                completedSteps: Array.from(completedSteps),
                status: status || "in_progress",
            });
        } catch (err) {
            // Progress-Persistenz ist best-effort; UI nicht blockieren.
            console.warn("setWizardProgress fehlgeschlagen:", friendlyError(err));
        }
    }

    async function resumeProgress() {
        try {
            const data = await callFn("getWizardProgress", { wizardId: "setup-complete" });
            const progress = data && data.progress ? data.progress : null;
            if (progress) {
                if (Array.isArray(progress.completedSteps)) {
                    progress.completedSteps.forEach((s) => {
                        if (typeof s === "number" && s >= 1 && s <= TOTAL_STEPS) completedSteps.add(s);
                    });
                }
                const resumeStep = Number(progress.currentStep);
                if (resumeStep >= 1 && resumeStep <= TOTAL_STEPS && progress.status !== "completed") {
                    showStep(resumeStep);
                    return;
                }
            }
        } catch (err) {
            console.warn("getWizardProgress fehlgeschlagen:", friendlyError(err));
        }
        showStep(1);
    }

    // ── Setup-Status (gemeinsam fuer Step 2, 3, 5, 7) ──────────────────────
    async function ensureSetupStatus(forceReload) {
        if (lastSetupStatus && !forceReload) return lastSetupStatus;
        lastSetupStatus = await callFn("getOperatorSetupStatus");
        return lastSetupStatus;
    }

    // ── Step 2: Firebase ───────────────────────────────────────────────────
    async function loadFirebaseStep(forceReload) {
        const loading = $("scw-fb-loading");
        const result = $("scw-fb-result");
        setStatus(loading, "Lade Firebase-Status …");
        hide(result);
        try {
            const status = await ensureSetupStatus(forceReload);
            hide(loading);
            show(result);

            const project = $("scw-fb-project");
            if (project) project.textContent = status.projectId ? status.projectId : "(nicht ermittelbar)";

            const storage = status.storage || {};
            const storageOk = storage.status === "ok";
            const storageHint = $("scw-fb-storage-hint");
            if (storageHint) {
                storageHint.textContent = storage.bucket
                    ? `Bucket: ${storage.bucket}`
                    : "Kein Bucket ermittelt.";
            }
            const storageBadge = $("scw-fb-storage-badge");
            if (storageBadge) {
                storageBadge.innerHTML = storageOk
                    ? badgeHtml("✓ erreichbar", "ok")
                    : badgeHtml("✗ nicht erreichbar", "err");
            }

            const firestore = status.firestore || {};
            const collNames = Object.keys(firestore);
            const failed = collNames.filter((c) => firestore[c] !== "ok");
            const firestoreOk = collNames.length > 0 && failed.length === 0;
            const fsHint = $("scw-fb-firestore-hint");
            if (fsHint) {
                fsHint.textContent = firestoreOk
                    ? `Alle ${collNames.length} Sammlungen erreichbar.`
                    : `Nicht erreichbar: ${failed.join(", ") || "(unbekannt)"}`;
            }
            const fsBadge = $("scw-fb-firestore-badge");
            if (fsBadge) {
                fsBadge.innerHTML = firestoreOk
                    ? badgeHtml("✓ erreichbar", "ok")
                    : badgeHtml("✗ Problem", "err");
            }
        } catch (err) {
            setStatus(loading, "Fehler beim Laden des Firebase-Status: " + friendlyError(err), "err");
        }
    }

    // ── Step 3: Secrets ────────────────────────────────────────────────────
    function secretHint(key) {
        const hints = {
            GEMINI_API_KEY: "Schaltet KI-Funktionen (Support, Analyse) frei. Aus .env / Secret Manager.",
            ADMIN_RECOVERY_TOKEN: "Notfall-Zugang fuer Admin-Wiederherstellung.",
            ADMIN_RECOVERY_TOKEN_ROTATED_AT: "Zeitstempel der letzten Token-Rotation.",
            ALLOWED_RESET_PROJECTS: "Whitelist der Projekte, in denen ein Reset erlaubt ist.",
            PLAY_BILLING_PUBSUB_TOPIC: "Pub/Sub-Topic fuer Play Real-Time Developer Notifications.",
            GOOGLE_APPLICATION_CREDENTIALS: "Pfad zum Service-Account-Key fuer Server-Operationen.",
        };
        return hints[key] || "";
    }

    async function loadSecretsStep(forceReload) {
        const loading = $("scw-secrets-loading");
        const list = $("scw-secrets-list");
        const recoveryRow = $("scw-recovery-row");
        setStatus(loading, "Lade Secret-Status …");
        if (list) list.innerHTML = "";
        hide(recoveryRow);
        try {
            const status = await ensureSetupStatus(forceReload);
            hide(loading);
            const secrets = status.secrets || {};
            const rows = Object.keys(secrets).map((key) => {
                const present = secrets[key] === true;
                const badge = present ? badgeHtml("✓ gesetzt", "ok") : badgeHtml("fehlt", "warn");
                return (
                    '<div class="scw-row">' +
                    '<div class="scw-row-main">' +
                    `<div class="scw-row-title">${escapeHtml(key)}</div>` +
                    `<div class="scw-row-hint">${escapeHtml(secretHint(key))}</div>` +
                    "</div>" +
                    `<div class="scw-row-side">${badge}</div>` +
                    "</div>"
                );
            });
            if (list) list.innerHTML = rows.join("");

            // Recovery-Token-Detailstatus.
            const recovery = status.recoveryToken || {};
            if (recoveryRow) {
                show(recoveryRow);
                const hint = $("scw-recovery-hint");
                if (hint) {
                    const ageTxt = recovery.ageDays === null || recovery.ageDays === undefined
                        ? "Alter unbekannt"
                        : `Alter: ${recovery.ageDays} Tage (Warnung ab ${recovery.warnAfterDays})`;
                    hint.textContent = `Tokens: ${recovery.tokenCount || 0}. ${ageTxt}.`;
                }
                const badge = $("scw-recovery-badge");
                if (badge) {
                    if (recovery.status === "ok") badge.innerHTML = badgeHtml("✓ ok", "ok");
                    else if (recovery.status === "overdue") badge.innerHTML = badgeHtml("⏰ ueberfaellig", "warn");
                    else badge.innerHTML = badgeHtml("fehlt", "err");
                }
            }
        } catch (err) {
            setStatus(loading, "Fehler beim Laden der Secrets: " + friendlyError(err), "err");
        }
    }

    // ── Step 4: Rollen & Admin-PIN ─────────────────────────────────────────
    async function loadPinStep() {
        const loading = $("scw-pin-loading");
        const result = $("scw-pin-result");
        setStatus(loading, "Lade Admin-PIN-Status …");
        hide(result);
        try {
            const data = await callFn("getOperatorAdminPinStatus");
            hide(loading);
            show(result);

            const configured = data && data.configured === true;
            const pinHint = $("scw-pin-hint");
            if (pinHint) {
                pinHint.textContent = configured
                    ? "Eine Admin-PIN ist hinterlegt."
                    : "Es ist noch keine Admin-PIN gesetzt. Bitte im Dashboard anlegen.";
            }
            const pinBadge = $("scw-pin-badge");
            if (pinBadge) {
                pinBadge.innerHTML = configured ? badgeHtml("✓ konfiguriert", "ok") : badgeHtml("fehlt", "warn");
            }

            const fresh = data && data.verificationFresh === true;
            const verifHint = $("scw-pin-verif-hint");
            if (verifHint) {
                const mins = data && data.verificationExpiresInMinutes ? data.verificationExpiresInMinutes : "?";
                verifHint.textContent = fresh
                    ? `Aktuelle Sitzung ist PIN-verifiziert (Gueltigkeit ${mins} Min.).`
                    : "Diese Sitzung ist nicht PIN-verifiziert.";
            }
            const verifBadge = $("scw-pin-verif-badge");
            if (verifBadge) {
                verifBadge.innerHTML = fresh ? badgeHtml("✓ frisch", "ok") : badgeHtml("nicht verifiziert", "neutral");
            }
        } catch (err) {
            setStatus(loading, "Fehler beim Laden des PIN-Status: " + friendlyError(err), "err");
        }
    }

    // ── Step 5: Commissioning-Gates ────────────────────────────────────────
    const CATEGORY_LABELS = {
        "google-play": "Google Play",
        apple: "Apple",
        firebase: "Firebase",
        legal: "Recht & Datenschutz",
        ops: "Betrieb",
        validation: "Validierung",
    };

    function renderChecklistProgress(checklist) {
        const counts = $("scw-checklist-counts");
        const bar = $("scw-checklist-bar");
        const pctBadge = $("scw-checklist-pct-badge");
        const done = checklist.requiredDone || 0;
        const total = checklist.requiredTotal || 0;
        const pct = typeof checklist.progressPct === "number" ? checklist.progressPct : 0;
        if (counts) counts.textContent = `${done} / ${total} Pflichtpunkte erledigt`;
        if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
        if (pctBadge) {
            const level = pct >= 100 ? "ok" : pct > 0 ? "warn" : "err";
            pctBadge.innerHTML = badgeHtml(pct + " %", level);
        }
    }

    async function loadChecklistStep(forceReload) {
        const loading = $("scw-checklist-loading");
        const groups = $("scw-checklist-groups");
        setStatus(loading, "Lade Checkliste …");
        if (groups) groups.innerHTML = "";
        try {
            const status = await ensureSetupStatus(forceReload);
            hide(loading);
            const checklist = status.manualChecklist || {};
            const items = Array.isArray(checklist.items) ? checklist.items : [];
            renderChecklistProgress(checklist);

            // Gruppiere nach Kategorie in stabiler Reihenfolge.
            const order = ["google-play", "apple", "firebase", "legal", "ops", "validation"];
            const byCat = {};
            items.forEach((item) => {
                const cat = item.category || "validation";
                if (!byCat[cat]) byCat[cat] = [];
                byCat[cat].push(item);
            });

            const html = [];
            order.forEach((cat) => {
                const catItems = byCat[cat];
                if (!catItems || catItems.length === 0) return;
                html.push('<div class="scw-cat-group">');
                html.push(`<div class="scw-cat-title">${escapeHtml(CATEGORY_LABELS[cat] || cat)}</div>`);
                catItems.forEach((item) => {
                    const reqTag = item.required
                        ? ' <span class="scw-badge is-neutral">Pflicht</span>'
                        : ' <span class="scw-badge is-neutral">optional</span>';
                    const hint = item.hint
                        ? `<div class="scw-row-hint">${escapeHtml(item.hint)}</div>`
                        : "";
                    html.push(
                        '<label class="scw-check-item">' +
                        `<input type="checkbox" data-checklist-item="${escapeHtml(item.id)}"${item.done ? " checked" : ""} />` +
                        "<span>" +
                        `<span class="scw-row-title">${escapeHtml(item.label)}</span>${reqTag}` +
                        hint +
                        "</span>" +
                        "</label>"
                    );
                });
                html.push("</div>");
            });
            if (groups) groups.innerHTML = html.join("");

            // Checkbox-Handler binden (CSP-konform via addEventListener).
            $$('input[data-checklist-item]', groups).forEach((box) => {
                box.addEventListener("change", onChecklistToggle);
            });
        } catch (err) {
            setStatus(loading, "Fehler beim Laden der Checkliste: " + friendlyError(err), "err");
        }
    }

    async function onChecklistToggle(evt) {
        const box = evt.currentTarget;
        const itemId = box.getAttribute("data-checklist-item");
        const done = box.checked;
        const statusNode = $("scw-checklist-status");
        box.disabled = true;
        setStatus(statusNode, "Speichere …");
        try {
            await callFn("setOperatorSetupChecklistItem", { itemId, done });
            // Status frisch laden, um requiredDone/progressPct zu aktualisieren.
            const status = await ensureSetupStatus(true);
            renderChecklistProgress(status.manualChecklist || {});
            setStatus(statusNode, `Gespeichert: „${itemId}" ${done ? "erledigt" : "offen"}.`, "ok");
        } catch (err) {
            box.checked = !done; // Rollback im UI.
            setStatus(statusNode, "Speichern fehlgeschlagen: " + friendlyError(err), "err");
        } finally {
            box.disabled = false;
        }
    }

    // ── Step 6: Validierung (Acceptance) ───────────────────────────────────
    const GATE_LABELS = {
        lintClean: "Lint sauber",
        buildPassed: "Build erfolgreich",
        allTestsPassed: "Alle Tests bestanden",
        coverageBranches: "Coverage: Branches",
        coverageFunctions: "Coverage: Funktionen",
        coverageLines: "Coverage: Zeilen",
        coverageStatements: "Coverage: Statements",
    };

    function formatTimestamp(ms) {
        if (!ms || typeof ms !== "number") return "unbekannt";
        try {
            return new Date(ms).toLocaleString("de-DE");
        } catch {
            return "unbekannt";
        }
    }

    async function loadAcceptanceStep() {
        const loading = $("scw-acc-loading");
        const result = $("scw-acc-result");
        setStatus(loading, "Lade Acceptance-Status …");
        hide(result);
        try {
            const data = await callFn("getAcceptanceStatus");
            hide(loading);

            // "Kein Run vorhanden" sauber behandeln.
            if (!data || data.status === "unknown" || !data.lastRun) {
                setStatus(
                    loading,
                    (data && data.message) ||
                        "Noch kein Acceptance-Run hinterlegt. Bitte lokal via start.bat --acceptance ausfuehren.",
                    "warn"
                );
                return;
            }

            show(result);
            const run = data.lastRun || {};
            const runHint = $("scw-acc-run-hint");
            if (runHint) {
                runHint.textContent =
                    `Run-ID: ${run.runId || "?"} · gestartet: ${formatTimestamp(run.startedAt)} · ` +
                    `ausgeloest von: ${run.triggeredBy || "?"}`;
            }
            const runBadge = $("scw-acc-run-badge");
            if (runBadge) {
                const allOk = data.allGatesPassed === true;
                runBadge.innerHTML = allOk
                    ? badgeHtml("✓ alle Gates bestanden", "ok")
                    : badgeHtml("✗ Gates offen", "err");
            }

            const gates = data.gates || {};
            const gatesNode = $("scw-acc-gates");
            if (gatesNode) {
                const rows = Object.keys(gates).map((key) => {
                    const passed = gates[key] === true;
                    return (
                        '<div class="scw-row">' +
                        '<div class="scw-row-main">' +
                        `<div class="scw-row-title">${escapeHtml(GATE_LABELS[key] || key)}</div>` +
                        "</div>" +
                        `<div class="scw-row-side">${passed ? badgeHtml("✓ pass", "ok") : badgeHtml("✗ fail", "err")}</div>` +
                        "</div>"
                    );
                });
                gatesNode.innerHTML = rows.join("");
            }
        } catch (err) {
            setStatus(loading, "Fehler beim Laden des Acceptance-Status: " + friendlyError(err), "err");
        }
    }

    // ── Step 7: Zusammenfassung ────────────────────────────────────────────
    const READINESS_LABELS = {
        ready: { text: "Bereit fuer den Go-Live", level: "ok" },
        "near-ready": { text: "Fast bereit – wenige Blocker", level: "warn" },
        "not-ready": { text: "Noch nicht bereit", level: "err" },
    };

    async function loadSummaryStep(forceReload) {
        const loading = $("scw-summary-loading");
        const result = $("scw-summary-result");
        setStatus(loading, "Ermittle Gesamtbereitschaft …");
        hide(result);
        try {
            const status = await ensureSetupStatus(forceReload);
            hide(loading);
            show(result);

            const readiness = status.readiness || "not-ready";
            const meta = READINESS_LABELS[readiness] || { text: readiness, level: "neutral" };
            const hint = $("scw-summary-hint");
            if (hint) hint.textContent = meta.text;
            const badge = $("scw-summary-badge");
            if (badge) badge.innerHTML = badgeHtml(meta.text, meta.level);

            const blockers = Array.isArray(status.blockers) ? status.blockers : [];
            const list = $("scw-summary-blockers");
            if (list) {
                if (blockers.length === 0) {
                    list.innerHTML = `<li>${badgeHtml("✓ Keine offenen Blocker", "ok")}</li>`;
                } else {
                    list.innerHTML = blockers
                        .map((b) => `<li>${escapeHtml(b)}</li>`)
                        .join("");
                }
            }
        } catch (err) {
            setStatus(loading, "Fehler beim Laden der Zusammenfassung: " + friendlyError(err), "err");
        }
    }

    async function completeWizard() {
        const statusNode = $("scw-complete-status");
        const btn = $("scw-complete-btn");
        if (btn) btn.disabled = true;
        setStatus(statusNode, "Schliesse Einrichtung ab …");
        completedSteps.add(currentStep);
        try {
            await callFn("setWizardProgress", {
                wizardId: "setup-complete",
                currentStep,
                completedSteps: Array.from(completedSteps),
                status: "completed",
            });
            setStatus(statusNode, "✓ Einrichtung als abgeschlossen markiert.", "ok");
        } catch (err) {
            setStatus(statusNode, "Konnte Status nicht speichern: " + friendlyError(err), "err");
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ── Step-Daten-Loader ──────────────────────────────────────────────────
    function loadStepData(n) {
        switch (n) {
            case 2: loadFirebaseStep(false); break;
            case 3: loadSecretsStep(false); break;
            case 4: loadPinStep(); break;
            case 5: loadChecklistStep(false); break;
            case 6: loadAcceptanceStep(); break;
            case 7: loadSummaryStep(false); break;
            default: break;
        }
    }

    // ── Action-Dispatch ────────────────────────────────────────────────────
    function handleAction(action) {
        if (!isAdmin && action !== "prev" && action !== "next") {
            // Interaktive Aktionen sind ohne Admin gesperrt.
            return;
        }
        switch (action) {
            case "next": goNext(); break;
            case "prev": goPrev(); break;
            case "reloadFirebase": loadFirebaseStep(true); break;
            case "reloadAcceptance": loadAcceptanceStep(); break;
            case "reloadSummary": loadSummaryStep(true); break;
            case "complete": completeWizard(); break;
            default: break;
        }
    }

    function bindActions() {
        $$("[data-wiz-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                if (btn.getAttribute("data-locked") === "true") return;
                handleAction(btn.getAttribute("data-wiz-action"));
            });
        });
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────
    function start() {
        bindActions();
        showStep(1);

        const init = initFirebase();
        if (!init.ok) {
            lockWizard("Firebase ist nicht einsatzbereit: " + init.reason);
            return;
        }

        lockWizard("Bitte melde dich als Admin an, um die Einrichtung zu nutzen.");

        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                lockWizard("Du bist nicht angemeldet. Bitte als Admin einloggen.");
                return;
            }
            try {
                const tokenResult = await user.getIdTokenResult();
                const role = tokenResult && tokenResult.claims ? tokenResult.claims.role : null;
                if (role !== "admin") {
                    lockWizard(
                        `Dein Konto (${user.email || "unbekannt"}) hat nicht die Rolle „admin". ` +
                            "Bitte mit einem Admin-Konto anmelden."
                    );
                    return;
                }
            } catch (err) {
                lockWizard("Konnte Admin-Rolle nicht pruefen: " + friendlyError(err));
                return;
            }

            unlockWizard();
            await resumeProgress();
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }
})();
