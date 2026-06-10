/* eslint-env browser */
// MiniMaster Acceptance Panel — Standalone module loaded after app.js

(function() {
    const API_BASE = "";
    let accPollTimer = null;
    let currentRunId = null;

    function $(id) { return document.getElementById(id); }

    function showAccStatus(msg) {
        const el = $("acc-status-text");
        if (el) el.textContent = msg;
    }

    function setAccProgress(pct) {
        const bar = $("acc-progress-bar");
        if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }

    function showAccLive(show) {
        const el = $("acc-live-status");
        if (el) {
            if (show) el.classList.remove("hidden");
            else el.classList.add("hidden");
        }
    }

    async function startRun(mode, withCoverage) {
        try {
            showAccLive(true);
            setAccProgress(5);
            showAccStatus("Starte " + mode + " …");
            const payload = { mode: mode, coverage: !!withCoverage };
            const res = await fetch(API_BASE + "/api/acceptance/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            currentRunId = data.runId;
            setAccProgress(10);
            showAccStatus("Run gestartet: " + currentRunId + " — warte …");
            pollAccStatus(currentRunId);
        } catch (err) {
            showAccStatus("Fehler: " + err.message);
            setAccProgress(0);
            console.error("Acceptance start error:", err);
        }
    }

    async function pollAccStatus(runId) {
        if (accPollTimer) { clearInterval(accPollTimer); accPollTimer = null; }
        let attempts = 0;
        const maxAttempts = 360; // 30 min @ 5s
        accPollTimer = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch(API_BASE + "/api/acceptance/status/" + runId);
                if (!res.ok) throw new Error("HTTP " + res.status);
                const data = await res.json();
                const st = data.status;
                if (st === "running") {
                    const prog = Math.min(10 + attempts * 2, 90);
                    setAccProgress(prog);
                    showAccStatus("Läuft … " + (data.mode || "") + " (" + attempts + " Polls)");
                } else {
                    clearInterval(accPollTimer);
                    accPollTimer = null;
                    setAccProgress(100);
                    showAccStatus("Abgeschlossen: " + st);
                    loadAccReport(runId);
                    loadAccHistory();
                }
            } catch (err) {
                if (attempts >= maxAttempts) {
                    clearInterval(accPollTimer);
                    accPollTimer = null;
                    showAccStatus("Timeout beim Polling.");
                }
            }
        }, 5000);
    }

    async function loadAccReport(runId) {
        try {
            const res = await fetch(API_BASE + "/api/acceptance/report/" + runId);
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            renderAccResults(data);
        } catch (err) {
            console.error("Acceptance report error:", err);
        }
    }

    function renderAccResults(data) {
        const container = $("acc-results");
        if (!container) return;
        const r = data.results || {};
        const rows = [];
        const addRow = (label, key, emojiOk, emojiFail) => {
            const v = r[key];
            if (!v) return;
            const passed = v.passed;
            const skip = v.skipped;
            let status = skip ? '<span class="acc-skip">➖ übersprungen</span>' :
                (passed ? '<span class="acc-pass">✅ bestanden</span>' : '<span class="acc-fail">❌ fehlgeschlagen</span>');
            let detail = "";
            if (key === "lint" && v.errors !== undefined) {
                detail = (v.errors || 0) + " Fehler, " + (v.warnings || 0) + " Warnungen";
            }
            if (key === "test" && v.suitesTotal !== undefined) {
                detail = (v.suitesPassed || 0) + "/" + v.suitesTotal + " Suites, " +
                    (v.testsPassed || 0) + "/" + v.testsTotal + " Tests";
            }
            if (key === "coverage" && v.branches !== undefined) {
                detail = "Branches " + v.branches + "%, Functions " + v.functions + "%, Lines " + v.lines + "%";
            }
            rows.push("<tr><td>" + label + "</td><td>" + status + "</td><td>" + detail + "</td><td>" + (v.durationMs || 0) + "ms</td></tr>");
        };
        addRow("Lint", "lint", "✅", "❌");
        addRow("Build", "build", "✅", "❌");
        addRow("Tests", "test", "✅", "❌");
        addRow("Coverage", "coverage", "✅", "❌");
        container.innerHTML = '<table><thead><tr><th>Phase</th><th>Status</th><th>Details</th><th>Dauer</th></tr></thead><tbody>' + rows.join("") + '</tbody></table>' +
            '<div class="acc-log-viewer">' + (data.logs || []).slice(-50).join("\n").replace(/</g, "&lt;") + '</div>';
    }

    async function loadAccHistory() {
        try {
            const res = await fetch(API_BASE + "/api/acceptance/history");
            if (!res.ok) throw new Error("HTTP " + res.status);
            const runs = await res.json();
            renderAccHistory(runs);
        } catch (err) {
            console.error("Acceptance history error:", err);
        }
    }

    function renderAccHistory(runs) {
        const container = $("acc-history");
        if (!container) return;
        if (!runs || !runs.length) {
            container.innerHTML = '<h4>Letzte Runs</h4><div class="info">Noch keine Runs.</div>';
            return;
        }
        let html = '<h4>Letzte Runs</h4>';
        runs.slice(0, 10).forEach(run => {
            const stClass = run.status === "success" ? "success" : (run.status === "failed" ? "failed" : "running");
            const dur = run.durationMs ? Math.round(run.durationMs / 1000) + "s" : "—";
            const date = run.startedAt ? new Date(run.startedAt).toLocaleString("de-DE") : "—";
            html += '<div class="acc-history-item">' +
                '<span>' + (run.runId || "—").substring(0, 16) + '… — ' + date + '</span>' +
                '<span class="acc-h-status ' + stClass + '">' + (run.status || "unknown") + '</span>' +
                '<span>' + dur + '</span>' +
                '<button class="btn btn-secondary btn-small" data-acc-run-id="' + run.runId + '">Anzeigen</button>' +
                '</div>';
        });
        container.innerHTML = html;
        container.querySelectorAll("button[data-acc-run-id]").forEach(btn => {
            btn.addEventListener("click", () => loadAccReport(btn.dataset.accRunId));
        });
    }

    async function submitAccRun() {
        if (!currentRunId) {
            if (window.showNotification) window.showNotification("Kein aktueller Run zum Einreichen.", "error");
            return;
        }
        try {
            const res = await fetch(API_BASE + "/api/acceptance/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ runId: currentRunId })
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            if (window.showNotification) window.showNotification("Run eingereicht: " + data.runId, "success");
        } catch (err) {
            if (window.showNotification) window.showNotification("Fehler beim Einreichen: " + err.message, "error");
            console.error("Submit error:", err);
        }
    }

    function downloadAccReport() {
        if (!currentRunId) return;
        fetch(API_BASE + "/api/acceptance/report/" + currentRunId)
            .then(r => r.json())
            .then(data => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "acceptance-report-" + currentRunId + ".json";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
    }

    function initAcceptancePanel() {
        const btnFull = $("acc-run-full-btn");
        const btnQuick = $("acc-run-quick-btn");
        const btnLint = $("acc-run-lint-btn");
        const btnCov = $("acc-run-coverage-btn");

        if (btnFull) btnFull.addEventListener("click", () => startRun("full", false));
        if (btnQuick) btnQuick.addEventListener("click", () => startRun("quick", false));
        if (btnLint) btnLint.addEventListener("click", () => startRun("lint-only", false));
        if (btnCov) btnCov.addEventListener("click", () => startRun("full", true));

        // Initial history load
        loadAccHistory();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initAcceptancePanel);
    } else {
        initAcceptancePanel();
    }
})();
