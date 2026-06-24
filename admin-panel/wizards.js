/**
 * Wizard-Hub — zentraler Einstieg in alle MiniMaster-Einrichtungs- und
 * Konfigurations-Assistenten.
 *
 * Zeigt eine Karten-Übersicht aller Wizards mit Live-Fortschritts-Status
 * (aus der Cloud Function listWizardProgress) und — sofern als Admin
 * angemeldet — der aggregierten Gesamt-Readiness (getOperatorSetupStatus).
 *
 * CSP: keine Inline-Handler. Alle Events werden hier per addEventListener
 * gebunden; Navigation läuft über <a href>-Links im DOM.
 */
(function () {
    "use strict";

    var app = null;
    var auth = null;
    var functions = null;

    var WIZARDS = [
        {
            id: "setup-complete",
            icon: "🚀",
            title: "Komplett-Einrichtung von Null",
            desc: "Führt end-to-end durch Firebase, Secrets, Rollen/Admin-PIN, Commissioning-Gates und Validierung — der empfohlene Start für ein frisches Projekt.",
            href: "setup-complete-wizard.html",
            audience: "Betreiber",
            tracked: true
        },
        {
            id: "firebase-setup",
            icon: "🔥",
            title: "Firebase-Einrichtung",
            desc: "Geführter Import der Firebase-Web-Konfiguration, Pflicht-Dateien (google-services.json, serviceAccountKey.json) und optionaler Secrets.",
            href: "operator-setup-wizard_NEW.html",
            audience: "Betreiber",
            tracked: false
        },
        {
            id: "config-integrations",
            icon: "🔌",
            title: "Externe Integrationen",
            desc: "Apple/Play/Secrets/OEM/Release-Konfiguration pflegen (nur Secret-Pfade, keine Klartext-Geheimnisse).",
            href: "config-wizards.html#integrations",
            audience: "Betreiber",
            tracked: true
        },
        {
            id: "config-pricing",
            icon: "💶",
            title: "Abo & Preise",
            desc: "Überblick über B2C/B2B-Tarife, SKUs und Promo-Codes sowie die Schritte zur Preis-Einrichtung im Play Store / App Store.",
            href: "config-wizards.html#pricing",
            audience: "Betreiber",
            tracked: true
        },
        {
            id: "config-backup-reset",
            icon: "🗄️",
            title: "Backup & Reset",
            desc: "Konfigurations-Snapshots sichern/wiederherstellen und die abgesicherte vollständige Projektlöschung verstehen und einleiten.",
            href: "config-wizards.html#backup",
            audience: "Betreiber",
            tracked: true
        },
        {
            id: "parent-onboarding",
            icon: "👪",
            title: "Eltern-Onboarding",
            desc: "Erst-Einrichtung für Eltern: Kindgerät koppeln, erste Regeln/Limits und Aufgaben festlegen, Abo prüfen.",
            href: "../parent-panel/onboarding-wizard.html",
            audience: "Eltern",
            tracked: false
        },
        {
            id: "child-pairing",
            icon: "📱",
            title: "Kind-Pairing & Berechtigungen",
            desc: "Kindgerät per Code/Link koppeln und die nötigen Berechtigungen (Accessibility/Overlay bzw. iOS Family Controls) erklären.",
            href: "../child-panel/pairing-wizard.html",
            audience: "Kind",
            tracked: false
        }
    ];

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function badgeFor(statusEntry) {
        if (!statusEntry) {
            return { cls: "", label: "Offen" };
        }
        switch (statusEntry.status) {
            case "completed":
                return { cls: "is-done", label: "Abgeschlossen" };
            case "in_progress":
                return { cls: "is-progress", label: "In Arbeit · Schritt " + ((statusEntry.currentStep || 0) + 1) };
            case "skipped":
                return { cls: "is-skipped", label: "Übersprungen" };
            default:
                return { cls: "", label: "Offen" };
        }
    }

    function renderGrid(progressById) {
        var grid = document.getElementById("hub-grid");
        if (!grid) return;
        grid.innerHTML = "";

        WIZARDS.forEach(function (w) {
            var card = document.createElement("div");
            card.className = "hub-card";

            var badgeHtml = "";
            if (w.tracked) {
                var badge = badgeFor(progressById[w.id]);
                badgeHtml = '<span class="hub-badge ' + badge.cls + '">' + escapeHtml(badge.label) + "</span>";
            } else {
                badgeHtml = '<span class="hub-badge">Geräteübergreifend</span>';
            }

            card.innerHTML =
                '<h3><span aria-hidden="true">' + escapeHtml(w.icon) + "</span> " + escapeHtml(w.title) + "</h3>" +
                "<p>" + escapeHtml(w.desc) + "</p>" +
                '<div class="hub-meta">' +
                '<span class="hub-aud">' + escapeHtml(w.audience) + "</span>" +
                badgeHtml +
                "</div>" +
                '<a class="btn btn-primary" href="' + escapeHtml(w.href) + '">Assistent öffnen →</a>';

            grid.appendChild(card);
        });
    }

    function renderReadiness(status) {
        var el = document.getElementById("hub-readiness");
        if (!el || !status) return;
        var readiness = status.readiness || "not-ready";
        var label = readiness === "ready" ? "Bereit"
            : readiness === "near-ready" ? "Fast bereit"
            : "Noch nicht bereit";
        var blockers = Array.isArray(status.blockers) ? status.blockers : [];
        var blockerHtml = blockers.length
            ? "<ul>" + blockers.map(function (b) { return "<li>" + escapeHtml(b) + "</li>"; }).join("") + "</ul>"
            : "<p>Keine offenen Blocker.</p>";
        el.innerHTML =
            "<div>Projekt-Readiness: <span class='pill " + escapeHtml(readiness) + "'>" + escapeHtml(label) + "</span>" +
            (status.projectId ? " · Projekt <code>" + escapeHtml(status.projectId) + "</code>" : "") + "</div>" +
            blockerHtml;
        el.hidden = false;
    }

    function setAuth(html, cls) {
        var el = document.getElementById("hub-auth");
        if (!el) return;
        el.className = "hub-auth" + (cls ? " " + cls : "");
        el.innerHTML = html;
    }

    async function loadStatusFor(user) {
        var progressById = {};
        try {
            var listFn = functions.httpsCallable("listWizardProgress");
            var res = await listFn({});
            var wizards = (res && res.data && res.data.wizards) || [];
            wizards.forEach(function (entry) { progressById[entry.wizardId] = entry; });
        } catch (err) {
            // Non-fatal: show the catalog without per-wizard status.
            console.warn("listWizardProgress fehlgeschlagen:", err && err.message);
        }
        renderGrid(progressById);

        // Operator readiness is admin-only; ignore errors for non-admins.
        try {
            var tokenResult = await user.getIdTokenResult();
            if (tokenResult && tokenResult.claims && tokenResult.claims.role === "admin") {
                var statusFn = functions.httpsCallable("getOperatorSetupStatus");
                var statusRes = await statusFn({});
                renderReadiness(statusRes && statusRes.data);
            }
        } catch (err) {
            console.info("Readiness nicht verfügbar:", err && err.message);
        }
    }

    function init() {
        if (typeof firebase === "undefined" || !window.__MM_FIREBASE_CONFIG__) {
            setAuth("⚠ Firebase ist nicht konfiguriert. Bitte zuerst die <a href='operator-setup-wizard_NEW.html'>Firebase-Einrichtung</a> ausführen.", "is-warn");
            renderGrid({});
            return;
        }

        try {
            app = firebase.initializeApp(window.__MM_FIREBASE_CONFIG__);
        } catch (err) {
            app = firebase.app();
        }
        auth = firebase.auth();
        functions = firebase.functions();

        // Render the static catalog immediately so links work even before auth.
        renderGrid({});

        auth.onAuthStateChanged(function (user) {
            if (!user) {
                setAuth("Nicht angemeldet. Einige Status-Anzeigen erfordern eine Anmeldung. <a href='index.html'>Im Betreiber-Dashboard anmelden →</a>", "is-warn");
                return;
            }
            setAuth("Angemeldet als <strong>" + escapeHtml(user.email || user.uid) + "</strong>. Fortschritt und Readiness werden geladen …", "is-ok");
            loadStatusFor(user);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
