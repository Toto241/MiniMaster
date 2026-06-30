/* MiniMaster Konfigurations-Wizards
 *
 * Ein Hub mit drei geführten Konfigurations-Sub-Wizards für Operatoren:
 *   A) Externe Integrationen (Apple / Play / Secrets / OEM / Release)
 *   B) Abo & Preise (rein informativ)
 *   C) Backup & Reset (sicherheits-orientiert, führt zum Dashboard)
 *
 * CSP: KEINE Inline-Handler. Alle Events werden via addEventListener und
 * data-* / id gebunden. Jeder Callable ist in try/catch gekapselt; Status-
 * meldungen sind auf Deutsch. Echo-Texte werden via escapeHtml entschärft.
 */
(function () {
    "use strict";

    // ── Firebase-Init ──────────────────────────────────────────────────
    let auth = null;
    let functions = null;
    let firebaseReady = false;
    try {
        if (window.__MM_FIREBASE_CONFIG__) {
            firebase.initializeApp(window.__MM_FIREBASE_CONFIG__);
            auth = firebase.auth();
            functions = firebase.functions();
            firebaseReady = true;
        }
    } catch (err) {
        // Mehrfach-Init oder fehlende Konfig – wird im Auth-Gate behandelt.
        try {
            auth = firebase.auth();
            functions = firebase.functions();
            firebaseReady = true;
        } catch (_e) {
            firebaseReady = false;
        }
    }

    const WIZARD_IDS = ["config-integrations", "config-pricing", "config-backup-reset"];
    let isAdmin = false;
    let activeWizard = "config-integrations";
    const loadedOnce = { "config-integrations": false, "config-pricing": false, "config-backup-reset": false };

    // ── Helpers ────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

    function escapeHtml(text) {
        return String(text == null ? "" : text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function setStatus(id, message, level) {
        const node = $(id);
        if (!node) return;
        node.textContent = message || "";
        node.className = "wiz-status" + (level ? ` is-${level}` : "");
    }

    function describeError(err) {
        if (!err) return "Unbekannter Fehler.";
        if (err.code === "permission-denied") return "Zugriff verweigert (Admin-Rechte erforderlich).";
        if (err.code === "unauthenticated") return "Nicht angemeldet. Bitte erneut anmelden.";
        if (err.code === "failed-precondition") return err.message || "Aktion derzeit nicht möglich.";
        return err.message || String(err);
    }

    async function callFn(name, payload) {
        if (!functions) throw new Error("Firebase Functions nicht verfügbar.");
        const fn = functions.httpsCallable(name);
        const res = await fn(payload || {});
        return res && res.data;
    }

    // ── Fortschritt (setWizardProgress / getWizardProgress) ────────────
    async function loadProgress(wizardId) {
        try {
            const data = await callFn("getWizardProgress", { wizardId });
            return (data && data.progress) || null;
        } catch (_err) {
            return null;
        }
    }

    async function saveProgress(wizardId, currentStep, status, extra) {
        try {
            await callFn("setWizardProgress", {
                wizardId,
                currentStep: Number(currentStep) || 0,
                status: status || "in_progress",
                data: extra && typeof extra === "object" ? extra : {},
            });
        } catch (_err) {
            // Fortschritt ist nicht kritisch – stillschweigend ignorieren.
        }
    }

    async function refreshChips() {
        let summaries = [];
        try {
            const data = await callFn("listWizardProgress");
            summaries = (data && data.wizards) || [];
        } catch (_err) {
            summaries = [];
        }
        const byId = {};
        summaries.forEach((s) => { byId[s.wizardId] = s; });
        WIZARD_IDS.forEach((wizardId) => {
            const chip = document.querySelector(`[data-chip="${wizardId}"]`);
            if (!chip) return;
            const status = (byId[wizardId] && byId[wizardId].status) || "not_started";
            chip.className = "cw-chip is-" + status;
            chip.textContent = chipLabel(status);
        });
    }

    function chipLabel(status) {
        switch (status) {
            case "in_progress": return "in Arbeit";
            case "completed": return "fertig";
            case "skipped": return "übersprungen";
            default: return "offen";
        }
    }

    // ── Hub-Navigation ─────────────────────────────────────────────────
    function selectWizard(wizardId) {
        if (!WIZARD_IDS.includes(wizardId)) return;
        activeWizard = wizardId;
        $$(".cw-hub-tab").forEach((btn) => {
            btn.classList.toggle("is-active", btn.getAttribute("data-wizard") === wizardId);
        });
        $$(".cw-panel").forEach((panel) => {
            panel.hidden = panel.getAttribute("data-wizard") !== wizardId;
        });
        if (!isAdmin) return;
        // Beim Öffnen: aktuellen Schritt als "in Arbeit" markieren + laden.
        saveProgress(wizardId, 1, "in_progress").then(refreshChips);
        if (wizardId === "config-integrations") openIntegrations();
        else if (wizardId === "config-pricing") openPricing();
        else if (wizardId === "config-backup-reset") openBackupReset();
    }

    // ================================================================
    // A) EXTERNE INTEGRATIONEN
    // ================================================================
    // Deep-Link-Ziele (Konsolen, in denen die Werte herkommen).
    const LINKS = {
        secretManager: "https://console.cloud.google.com/security/secret-manager",
        appleDeveloper: "https://developer.apple.com/account",
        appStoreConnectKeys: "https://appstoreconnect.apple.com/access/api",
        playConsole: "https://play.google.com/console",
        pubsub: "https://console.cloud.google.com/cloudpubsub/topic/list",
        recaptchaAdmin: "https://www.google.com/recaptcha/admin",
    };
    const APPLE_FIELDS = [
        { key: "developerTeamId", label: "Apple Developer Team ID", placeholder: "10 Zeichen, GROSS",
          hint: "10-stellige Team-ID aus dem Apple Developer Account (Membership-Details).", link: LINKS.appleDeveloper, linkLabel: "Apple Developer" },
        { key: "parentBundleId", label: "Eltern-App Bundle ID", placeholder: "com.example.parent",
          hint: "Reverse-DNS-Bundle-ID der Eltern-/Master-iOS-App, exakt wie in App Store Connect registriert.", link: LINKS.appStoreConnectKeys, linkLabel: "App Store Connect" },
        { key: "childBundleId", label: "Kind-App Bundle ID", placeholder: "com.example.child",
          hint: "Reverse-DNS-Bundle-ID der Kind-iOS-App.", link: LINKS.appStoreConnectKeys, linkLabel: "App Store Connect" },
        { key: "appStoreConnectKeySecretPath", label: "App Store Connect Key (Secret-Pfad)", placeholder: "projects/…/secrets/…/versions/latest",
          hint: "Voller Secret-Manager-Pfad zum App-Store-Connect-API-Key (.p8). Hier NUR den Pfad eintragen, nie den Schlüssel selbst — anlegen unter Secret Manager.", link: LINKS.secretManager, linkLabel: "Secret Manager" },
    ];
    const APPLE_BOOLS = [{ key: "provisioningProfilesReady", label: "Provisioning Profiles bestätigt" }];
    const PLAY_FIELDS = [
        { key: "parentPackageId", label: "Eltern-App Package ID", placeholder: "com.example.parent",
          hint: "Android-Package (applicationId) der Eltern-/Master-App, wie in der Play Console.", link: LINKS.playConsole, linkLabel: "Play Console" },
        { key: "childPackageId", label: "Kind-App Package ID", placeholder: "com.example.child",
          hint: "Android-Package der Kind-App.", link: LINKS.playConsole, linkLabel: "Play Console" },
        { key: "serviceAccountSecretPath", label: "Service-Account (Secret-Pfad)", placeholder: "projects/…/secrets/…/versions/latest",
          hint: "Secret-Manager-Pfad zum Play-Developer-Service-Account-JSON (Subscription-Verifizierung). Nur den Pfad, nicht das JSON.", link: LINKS.secretManager, linkLabel: "Secret Manager" },
        { key: "rtdnTopicName", label: "RTDN Pub/Sub Topic", placeholder: "play-billing-notifications",
          hint: "Pub/Sub-Topic für Play Real-Time Developer Notifications. Voll: projects/<projectId>/topics/<name>.", link: LINKS.pubsub, linkLabel: "Pub/Sub" },
    ];
    const PLAY_BOOLS = [{ key: "iapContractsSigned", label: "IAP-Verträge unterzeichnet" }];
    const SECRET_FIELDS = [
        { key: "geminiApiKeyPath", label: "Gemini API Key (Secret-Pfad)",
          hint: "Secret-Manager-Pfad zum Gemini-API-Key (nicht der Key selbst).", link: LINKS.secretManager, linkLabel: "Secret Manager" },
        { key: "fcmServerKeyPath", label: "FCM Server Key (Secret-Pfad)",
          hint: "Secret-Manager-Pfad zum FCM/Cloud-Messaging-Server-Key.", link: LINKS.secretManager, linkLabel: "Secret Manager" },
        { key: "playIntegrityKeyPath", label: "Play Integrity Key (Secret-Pfad)",
          hint: "Secret-Manager-Pfad zum Play-Integrity-API-Key.", link: LINKS.secretManager, linkLabel: "Secret Manager" },
        { key: "deviceCheckKeyPath", label: "DeviceCheck Key (Secret-Pfad)",
          hint: "Secret-Manager-Pfad zum Apple-DeviceCheck/App-Attest-Key.", link: LINKS.secretManager, linkLabel: "Secret Manager" },
        { key: "recaptchaV3SiteKey", label: "reCAPTCHA v3 Site Key (öffentlich)",
          hint: "ÖFFENTLICHER reCAPTCHA-v3-Site-Key (beginnt mit 6L) — der echte Wert, KEIN Secret-Pfad. Muss mit dem App-Check-Site-Key übereinstimmen.", link: LINKS.recaptchaAdmin, linkLabel: "reCAPTCHA Admin" },
    ];
    const RELEASE_BOOLS = [
        { key: "playDataSafetyComplete", label: "Play Data Safety vollständig" },
        { key: "playIarcRatingComplete", label: "IARC Rating vollständig" },
        { key: "playStoreListingComplete", label: "Play Store Listing vollständig" },
        { key: "appleAppPrivacyComplete", label: "Apple App Privacy vollständig" },
        { key: "appleScreenshotsComplete", label: "Apple Screenshots vollständig" },
        { key: "legalTextsPublished", label: "Rechtstexte veröffentlicht" },
    ];

    let oemMatrix = [];

    function buildTextField(category, def, value) {
        const wrap = document.createElement("div");
        wrap.className = "cw-field-row";
        const label = document.createElement("label");
        label.textContent = def.label;
        const inputId = `cw-int-${category}-${def.key}`;
        label.setAttribute("for", inputId);
        const row = document.createElement("div");
        row.className = "cw-inline-row";
        const input = document.createElement("input");
        input.type = "text";
        input.id = inputId;
        input.value = value == null ? "" : String(value);
        if (def.placeholder) input.placeholder = def.placeholder;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wiz-btn";
        btn.textContent = "Speichern";
        btn.addEventListener("click", () => saveIntegrationField(category, def.key, input.value, def.label));
        row.appendChild(input);
        row.appendChild(btn);
        if (def.link) {
            const linkBtn = document.createElement("a");
            linkBtn.className = "wiz-link-btn";
            linkBtn.href = def.link;
            linkBtn.target = "_blank";
            linkBtn.rel = "noopener";
            linkBtn.textContent = "🔗 " + (def.linkLabel || "Öffnen");
            row.appendChild(linkBtn);
        }
        wrap.appendChild(label);
        if (def.hint) {
            const hint = document.createElement("p");
            hint.className = "wiz-hint";
            hint.textContent = def.hint;
            wrap.appendChild(hint);
        }
        wrap.appendChild(row);
        return wrap;
    }

    function buildBoolField(category, def, value) {
        const wrap = document.createElement("div");
        wrap.className = "cw-field-row";
        const label = document.createElement("label");
        const inputId = `cw-int-${category}-${def.key}`;
        label.setAttribute("for", inputId);
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = inputId;
        cb.checked = value === true;
        cb.style.inlineSize = "auto";
        cb.addEventListener("change", () => saveIntegrationField(category, def.key, cb.checked, def.label));
        const span = document.createElement("span");
        span.textContent = " " + def.label;
        label.appendChild(cb);
        label.appendChild(span);
        wrap.appendChild(label);
        return wrap;
    }

    async function saveIntegrationField(category, key, rawValue, label) {
        setStatus("cw-int-status", `Speichere „${label}" …`, "");
        try {
            await callFn("patchExternalIntegrationsField", { category, field: key, value: rawValue });
            setStatus("cw-int-status", `✓ „${label}" gespeichert.`, "ok");
            // Readiness aktualisieren.
            refreshReadiness();
            saveProgress("config-integrations", 2, "in_progress").then(refreshChips);
        } catch (err) {
            setStatus("cw-int-status", `✗ „${label}": ${describeError(err)}`, "err");
        }
    }

    function renderIntegrationForm(cfg) {
        const apple = cfg.apple || {};
        const play = cfg.play || {};
        const secrets = cfg.secrets || {};
        const release = cfg.release || {};

        const appleEl = $("cw-int-apple");
        appleEl.innerHTML = "";
        APPLE_FIELDS.forEach((d) => appleEl.appendChild(buildTextField("apple", d, apple[d.key])));
        APPLE_BOOLS.forEach((d) => appleEl.appendChild(buildBoolField("apple", d, apple[d.key])));

        const playEl = $("cw-int-play");
        playEl.innerHTML = "";
        PLAY_FIELDS.forEach((d) => playEl.appendChild(buildTextField("play", d, play[d.key])));
        PLAY_BOOLS.forEach((d) => playEl.appendChild(buildBoolField("play", d, play[d.key])));

        const secEl = $("cw-int-secrets");
        secEl.innerHTML = "";
        SECRET_FIELDS.forEach((d) => secEl.appendChild(buildTextField("secrets", d, secrets[d.key])));

        const relEl = $("cw-int-release");
        relEl.innerHTML = "";
        RELEASE_BOOLS.forEach((d) => relEl.appendChild(buildBoolField("release", d, release[d.key])));

        oemMatrix = Array.isArray(cfg.oem && cfg.oem.matrix) ? cfg.oem.matrix.slice() : [];
        renderOemMatrix();

        $("cw-int-form").hidden = false;
    }

    function renderOemMatrix() {
        const host = $("cw-int-oem");
        if (!host) return;
        host.innerHTML = "";
        const table = document.createElement("table");
        table.className = "cw-table";
        const head = document.createElement("tr");
        ["Gerät", "OS-Version", "Status", "Sign-off", ""].forEach((t) => {
            const th = document.createElement("th");
            th.textContent = t;
            head.appendChild(th);
        });
        table.appendChild(head);

        oemMatrix.forEach((row, idx) => {
            const tr = document.createElement("tr");
            tr.appendChild(makeCell(row.deviceModel || ""));
            tr.appendChild(makeCell(row.osVersion || ""));
            tr.appendChild(makeCell(row.status || "pending"));
            tr.appendChild(makeCell(row.signoffBy || "—"));
            const tdDel = document.createElement("td");
            const del = document.createElement("button");
            del.type = "button";
            del.className = "wiz-btn";
            del.textContent = "Entfernen";
            del.addEventListener("click", () => { oemMatrix.splice(idx, 1); saveOemMatrix(); });
            tdDel.appendChild(del);
            tr.appendChild(tdDel);
            table.appendChild(tr);
        });
        host.appendChild(table);

        // Add-Row Formular
        const form = document.createElement("div");
        form.className = "cw-inline-row";
        form.style.marginBlockStart = "10px";
        const dev = inputEl("Gerätemodell");
        const os = inputEl("OS-Version");
        const status = document.createElement("select");
        ["pending", "passed", "failed"].forEach((s) => {
            const o = document.createElement("option");
            o.value = s; o.textContent = s; status.appendChild(o);
        });
        const signoff = inputEl("Sign-off (optional)");
        const add = document.createElement("button");
        add.type = "button";
        add.className = "wiz-btn";
        add.textContent = "OEM-Zeile hinzufügen";
        add.addEventListener("click", () => {
            const deviceModel = dev.value.trim();
            const osVersion = os.value.trim();
            if (!deviceModel || !osVersion) {
                setStatus("cw-int-status", "OEM: Gerätemodell und OS-Version sind erforderlich.", "warn");
                return;
            }
            oemMatrix.push({
                deviceModel, osVersion,
                status: status.value,
                signoffBy: signoff.value.trim() || null,
                testedAt: status.value === "passed" ? new Date().toISOString().slice(0, 10) : null,
                notes: null,
            });
            dev.value = ""; os.value = ""; signoff.value = "";
            saveOemMatrix();
        });
        form.appendChild(dev);
        form.appendChild(os);
        form.appendChild(status);
        form.appendChild(signoff);
        form.appendChild(add);
        host.appendChild(form);
    }

    function inputEl(placeholder) {
        const i = document.createElement("input");
        i.type = "text";
        i.placeholder = placeholder;
        return i;
    }

    function makeCell(text) {
        const td = document.createElement("td");
        td.textContent = String(text);
        return td;
    }

    async function saveOemMatrix() {
        setStatus("cw-int-status", "Speichere OEM-Matrix …", "");
        try {
            await callFn("setOemValidationMatrix", { rows: oemMatrix });
            setStatus("cw-int-status", "✓ OEM-Matrix gespeichert.", "ok");
            renderOemMatrix();
            refreshReadiness();
        } catch (err) {
            setStatus("cw-int-status", `✗ OEM-Matrix: ${describeError(err)}`, "err");
            renderOemMatrix();
        }
    }

    async function refreshReadiness() {
        try {
            const readiness = await callFn("getReleaseReadinessStatus");
            renderReadiness(readiness);
        } catch (_err) {
            // nicht kritisch
        }
    }

    function renderReadiness(readiness) {
        if (!readiness) return;
        $("cw-int-readiness-card").hidden = false;
        const pct = Number(readiness.progressPct) || 0;
        $("cw-int-readiness-fill").style.inlineSize = pct + "%";
        const summary = readiness.ready
            ? `✓ Release-bereit (${pct} %).`
            : `${pct} % vollständig — ${(readiness.blockers || []).length} offene Punkte.`;
        $("cw-int-readiness-summary").textContent = summary;
        const list = $("cw-int-readiness-blockers");
        list.innerHTML = "";
        (readiness.blockers || []).forEach((b) => {
            const li = document.createElement("li");
            li.textContent = b;
            list.appendChild(li);
        });
    }

    async function openIntegrations() {
        setStatus("cw-int-status", "Lade aktuelle Konfiguration …", "");
        try {
            const data = await callFn("getExternalIntegrationsConfig");
            const cfg = (data && data.config) || {};
            renderIntegrationForm(cfg);
            if (data && data.readiness) renderReadiness(data.readiness);
            setStatus("cw-int-status", "✓ Konfiguration geladen.", "ok");
            loadedOnce["config-integrations"] = true;
        } catch (err) {
            setStatus("cw-int-status", `✗ Laden fehlgeschlagen: ${describeError(err)}`, "err");
        }
    }

    // ================================================================
    // B) ABO & PREISE (informativ)
    // ================================================================
    // Tarife werden live via getPricingConfig geladen (Override-bewusst) und sind
    // hier editierbar — Wirkung nur auf Anzeige/Invoicing, nicht auf Store-Preise.

    const PRICE_CHECKLIST = [
        "SKUs in src/pricing-config.ts geprüft (B2C_TIERS / B2B_TIERS).",
        "Play Console: In-App-Produkte/Abos mit identischen SKUs angelegt.",
        "App Store Connect: Abos mit identischen SKUs angelegt.",
        "Store-Preise je Region geprüft (Netto vs. Brutto / VAT OSS).",
        "Promo-Codes & Gültigkeitszeiträume definiert.",
        "Affiliate-Konditionen (30 %, 12 Monate, 50 € Mindestauszahlung) bestätigt.",
    ];

    function formatPrice(cents) {
        try {
            return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
        } catch (_e) {
            return (cents / 100).toFixed(2) + " €";
        }
    }

    // Editierbare Preistabelle. scope: "b2c" | "b2b". Speichert via patchPricingOverride.
    function renderEditablePriceTable(tableId, scope, tiers) {
        const table = $(tableId);
        if (!table) return;
        table.innerHTML = "";
        const flagLabel = scope === "b2c" ? "Premium" : "Vertrag nötig";
        const head = document.createElement("tr");
        ["SKU", "Name", "Preis netto (Cent)", flagLabel, ""].forEach((t) => {
            const th = document.createElement("th");
            th.textContent = t;
            head.appendChild(th);
        });
        table.appendChild(head);

        (tiers || []).forEach((t) => {
            const tr = document.createElement("tr");
            tr.appendChild(makeCell(t.sku));

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = t.name == null ? "" : String(t.name);
            const tdName = document.createElement("td");
            tdName.appendChild(nameInput);
            tr.appendChild(tdName);

            const priceInput = document.createElement("input");
            priceInput.type = "number";
            priceInput.min = "0";
            priceInput.step = "1";
            priceInput.value = Number(t.priceCents) || 0;
            priceInput.style.inlineSize = "110px";
            const priceHint = document.createElement("div");
            priceHint.className = "wiz-hint";
            priceHint.textContent = formatPrice(Number(t.priceCents) || 0);
            priceInput.addEventListener("input", () => {
                priceHint.textContent = formatPrice(Number(priceInput.value) || 0);
            });
            const tdPrice = document.createElement("td");
            tdPrice.appendChild(priceInput);
            tdPrice.appendChild(priceHint);
            tr.appendChild(tdPrice);

            const flagField = scope === "b2c" ? "isPremium" : "requiresContract";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = scope === "b2c" ? t.isPremium === true : t.requiresContract === true;
            cb.addEventListener("change", () => savePricingField(scope, t.sku, flagField, cb.checked));
            const tdFlag = document.createElement("td");
            tdFlag.appendChild(cb);
            tr.appendChild(tdFlag);

            const save = document.createElement("button");
            save.type = "button";
            save.className = "wiz-btn";
            save.textContent = "Speichern";
            save.addEventListener("click", async () => {
                save.disabled = true;
                try {
                    await savePricingField(scope, t.sku, "name", nameInput.value);
                    await savePricingField(scope, t.sku, "priceCents", Math.round(Number(priceInput.value) || 0));
                } finally {
                    save.disabled = false;
                }
            });
            const tdSave = document.createElement("td");
            tdSave.appendChild(save);
            tr.appendChild(tdSave);

            table.appendChild(tr);
        });
    }

    async function savePricingField(scope, sku, field, value) {
        setStatus("cw-price-status", `Speichere „${sku}.${field}" …`, "");
        try {
            await callFn("patchPricingOverride", { scope, sku, field, value });
            setStatus("cw-price-status", `✓ „${sku}.${field}" gespeichert (nur Anzeige/Invoicing).`, "ok");
            saveProgress("config-pricing", 1, "in_progress").then(refreshChips);
        } catch (err) {
            setStatus("cw-price-status", `✗ „${sku}.${field}": ${describeError(err)}`, "err");
        }
    }

    async function resetPricingOverrideAction() {
        setStatus("cw-price-status", "Setze Preis-Overrides zurück …", "");
        try {
            await callFn("resetPricingOverride");
            setStatus("cw-price-status", "✓ Overrides zurückgesetzt — Defaults aus dem Code aktiv.", "ok");
            await openPricing();
        } catch (err) {
            setStatus("cw-price-status", `✗ Zurücksetzen fehlgeschlagen: ${describeError(err)}`, "err");
        }
    }

    function renderPriceChecklist(savedData) {
        const host = $("cw-price-checklist");
        if (!host) return;
        host.innerHTML = "";
        const checked = (savedData && savedData.checklist) || {};
        PRICE_CHECKLIST.forEach((text, idx) => {
            const li = document.createElement("li");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.id = `cw-price-chk-${idx}`;
            cb.checked = checked["i" + idx] === true;
            cb.addEventListener("change", persistPriceChecklist);
            const label = document.createElement("label");
            label.setAttribute("for", cb.id);
            label.textContent = text;
            li.appendChild(cb);
            li.appendChild(label);
            host.appendChild(li);
        });
    }

    async function persistPriceChecklist() {
        const checklist = {};
        let allDone = true;
        PRICE_CHECKLIST.forEach((_t, idx) => {
            const cb = $(`cw-price-chk-${idx}`);
            const on = !!(cb && cb.checked);
            checklist["i" + idx] = on;
            if (!on) allDone = false;
        });
        const status = allDone ? "completed" : "in_progress";
        await saveProgress("config-pricing", 1, status, { checklist });
        setStatus("cw-price-status", allDone ? "✓ Checkliste vollständig." : "Fortschritt gespeichert.", allDone ? "ok" : "");
        refreshChips();
    }

    async function openPricing() {
        setStatus("cw-price-status", "Lade aktuelle Preise …", "");
        try {
            const data = await callFn("getPricingConfig");
            renderEditablePriceTable("cw-price-b2c", "b2c", (data && data.b2c) || []);
            renderEditablePriceTable("cw-price-b2b", "b2b", (data && data.b2b) || []);
            setStatus("cw-price-status", "✓ Preise geladen. Änderungen wirken nur auf Anzeige/Invoicing.", "ok");
        } catch (err) {
            setStatus("cw-price-status", `✗ Laden fehlgeschlagen: ${describeError(err)}`, "err");
        }
        const progress = await loadProgress("config-pricing");
        renderPriceChecklist(progress && progress.data);
        loadedOnce["config-pricing"] = true;
    }

    // ================================================================
    // C) BACKUP & RESET
    // ================================================================
    const RESET_CHECKLIST = [
        "Aktuellen Konfigurations-Snapshot vor Änderungen angelegt.",
        "Risiken der vollständigen Projektlöschung verstanden (unwiderruflich).",
        "Schutzmechanismen geprüft: Feature-Flag, Allowlist, Admin+PIN, Bestätigungstext.",
        "Löschung erfolgt ausschließlich über den abgesicherten Dashboard-Button.",
    ];

    function renderResetChecklist(savedData) {
        const host = $("cw-reset-checklist");
        if (!host) return;
        host.innerHTML = "";
        const checked = (savedData && savedData.checklist) || {};
        RESET_CHECKLIST.forEach((text, idx) => {
            const li = document.createElement("li");
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.id = `cw-reset-chk-${idx}`;
            cb.checked = checked["i" + idx] === true;
            cb.addEventListener("change", persistResetChecklist);
            const label = document.createElement("label");
            label.setAttribute("for", cb.id);
            label.textContent = text;
            li.appendChild(cb);
            li.appendChild(label);
            host.appendChild(li);
        });
    }

    async function persistResetChecklist() {
        const checklist = {};
        let allDone = true;
        RESET_CHECKLIST.forEach((_t, idx) => {
            const cb = $(`cw-reset-chk-${idx}`);
            const on = !!(cb && cb.checked);
            checklist["i" + idx] = on;
            if (!on) allDone = false;
        });
        const status = allDone ? "completed" : "in_progress";
        await saveProgress("config-backup-reset", 2, status, { checklist });
        setStatus("cw-reset-status", allDone ? "✓ Alle Hinweise bestätigt." : "Fortschritt gespeichert.", allDone ? "ok" : "");
        refreshChips();
    }

    async function openBackupReset() {
        setStatus("cw-reset-status", "", "");
        const progress = await loadProgress("config-backup-reset");
        renderResetChecklist(progress && progress.data);
        loadedOnce["config-backup-reset"] = true;
    }

    // ── Auth-Gate ──────────────────────────────────────────────────────
    function disableInteractiveControls() {
        $$(".cw-hub-tab").forEach((b) => { b.disabled = true; });
        $$("button[data-cw-action], #panel-config-integrations input, #panel-config-integrations button")
            .forEach((el) => { el.disabled = true; });
        $$("#cw-price-checklist input, #cw-reset-checklist input").forEach((el) => { el.disabled = true; });
        $$("#panel-config-pricing input, #panel-config-pricing button").forEach((el) => { el.disabled = true; });
    }

    function showAuthGate(message) {
        const gate = $("cw-auth-gate");
        if (gate) {
            gate.hidden = false;
            const msg = $("cw-auth-gate-msg");
            if (msg) msg.textContent = message;
        }
        disableInteractiveControls();
    }

    function bindStaticHandlers() {
        $$(".cw-hub-tab").forEach((btn) => {
            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                selectWizard(btn.getAttribute("data-wizard"));
            });
        });
        $$("[data-cw-action]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const action = btn.getAttribute("data-cw-action");
                if (action === "int-reload") openIntegrations();
            });
        });
        const priceReset = $("cw-price-reset");
        if (priceReset) {
            priceReset.addEventListener("click", () => {
                if (priceReset.disabled) return;
                resetPricingOverrideAction();
            });
        }
    }

    function init() {
        bindStaticHandlers();

        if (!firebaseReady || !auth) {
            showAuthGate("Firebase ist nicht konfiguriert. Bitte zuerst den Setup-Wizard ausführen.");
            return;
        }

        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                showAuthGate("Nicht angemeldet. Bitte über das Dashboard anmelden.");
                return;
            }
            try {
                const tokenResult = await user.getIdTokenResult();
                if (tokenResult.claims.role !== "admin") {
                    showAuthGate("Zugriff nur für Administratoren. Ihre Rolle reicht nicht aus.");
                    return;
                }
            } catch (_err) {
                showAuthGate("Rollenprüfung fehlgeschlagen. Bitte erneut anmelden.");
                return;
            }
            isAdmin = true;
            const gate = $("cw-auth-gate");
            if (gate) gate.hidden = true;
            await refreshChips();
            selectWizard(activeWizard);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
