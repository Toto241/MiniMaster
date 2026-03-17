/* eslint-env browser */
/* global firebase */
// MiniMaster Operator Dashboard JavaScript

const FIREBASE_CONFIG_STORAGE_KEY = "operatorFirebaseConfigOverride";
const COMMAND_BUILDER_STORAGE_KEY = "operatorCommandBuilderConfig";
const COMMISSIONING_ATTESTATION_STORAGE_KEY = "operatorCommissioningAttestations";

// Electron Operator-Bridge-Erkennung
const isElectronOperator = Boolean(
    typeof window !== "undefined" &&
    window.miniMasterDesktop &&
    window.miniMasterDesktop.isOperatorContext
);

// Firebase configuration (MUST be replaced with actual config)
const fallbackFirebaseConfig = {
    apiKey: "AIzaSyBjINek6A4RVqha9_wOBTVQZ5PDyl9MBkE",
    authDomain: "minimaster-28fbd.firebaseapp.com",
    projectId: "minimaster-28fbd",
    storageBucket: "minimaster-28fbd.firebasestorage.app",
    messagingSenderId: "716142639488",
    appId: "1:716142639488:web:9bef591e96e72db771a965"
};

function hasCompleteFirebaseConfig(config) {
    if (!config || typeof config !== "object") return false;
    const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    return requiredKeys.every(key => typeof config[key] === "string" && config[key].trim().length > 0);
}

function isPlaceholderFirebaseConfig(config) {
    if (!hasCompleteFirebaseConfig(config)) return true;
    return Object.values(config).some(value =>
        typeof value === "string" && (value.includes("your-") || value.includes("your_project"))
    );
}

function loadFirebaseConfig() {
    try {
        const raw = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (hasCompleteFirebaseConfig(parsed) && !isPlaceholderFirebaseConfig(parsed)) {
            return parsed;
        }
    } catch (error) {
        console.warn("Failed to load Firebase config override:", error);
    }
    return fallbackFirebaseConfig;
}

let firebaseConfig = loadFirebaseConfig();

let app, auth, db, functions;
let currentUserRole = null; // "admin", "support", or "auditor"
let commissioningSummary = null;

// Pagination state
const PAGE_SIZE = 25;
let userLastDoc = null;
let userFirstDoc = null;
let subLastDoc = null;
let ticketLastDoc = null;
let currentSubFilter = "all";
let currentTicketFilter = "all";
let setupValidationResults = [];

const setupChecklistItems = [
    { key: "firebase-config", label: "Firebase-Konfiguration ersetzt (keine Platzhalterwerte)" },
    { key: "admin-auth", label: "Operator ist mit Admin-Claim authentifiziert" },
    { key: "firestore-access", label: "Firestore-Zugriff auf Kernsammlungen verifiziert" },
    { key: "functions-access", label: "Alle Callable Functions erreichbar" },
    { key: "appcheck-active", label: "App Check konfiguriert und aktiv" },
    { key: "android-apps", label: "Android-Apps registriert (Master + Child)" },
    { key: "ai-config", label: "KI-Provider konfiguriert (Gemini/OpenAI)" },
    { key: "support-workflow", label: "Support-Ticket-Workflow getestet" },
    { key: "compliance-flow", label: "DSAR/Export-Prozess geprüft" },
    { key: "deploy-verified", label: "Deploy erfolgreich und Functions live" }
];

const commissioningAttestationItems = [
    { key: "firebase-auth-enabled", label: "Firebase Authentication aktiviert" },
    { key: "firestore-enabled", label: "Firestore aktiviert" },
    { key: "storage-enabled", label: "Firebase Storage aktiviert" },
    { key: "functions-enabled", label: "Cloud Functions aktiviert" },
    { key: "messaging-enabled", label: "Cloud Messaging aktiviert oder bewusst nicht benötigt" },
    { key: "android-master-registered", label: "Android-App com.minimaster.masterapp registriert" },
    { key: "android-child-registered", label: "Android-App com.google.pairing registriert" },
    { key: "firebase-project-bound", label: "firebase use --add lokal durchgeführt" },
    { key: "service-account-ready", label: "serviceAccountKey.json lokal für setup-admin verfügbar" },
    { key: "parent-panel-verified", label: "Parent Web Panel Login geprüft" },
    { key: "device-sync-verified", label: "Device-Sync zwischen Parent Panel und Child geprüft" },
    { key: "support-flow-verified", label: "Support-Ticket-Flow geprüft" },
    { key: "compliance-flow-verified", label: "DSAR- und Audit-Flow geprüft" },
    { key: "storage-rules-verified", label: "Storage Rules aktiv und geprüft" }
];


const defaultOperatorConfig = {
    cloud: {
        projectId: "",
        region: "europe-west1",
        appCheckMode: "enforced",
        releaseChannel: "prod"
    },
    ai: {
        provider: "openai",
        model: "gpt-5-mini",
        temperature: 0.3,
        endpoint: "",
        keyRef: "",
        systemPrompt: "Du unterstützt Operatoren beim Bearbeiten von Support-Tickets präzise und datenschutzkonform."
    }
};

const defaultCommandBuilderConfig = {
    workspacePath: "D:\\Tools\\MiniMaster",
    firstAdminEmail: "",
    firstAdminPassword: "",
};

function loadCommandBuilderConfig() {
    try {
        const raw = localStorage.getItem(COMMAND_BUILDER_STORAGE_KEY);
        return { ...defaultCommandBuilderConfig, ...(raw ? JSON.parse(raw) : {}) };
    } catch (error) {
        console.warn("Failed to load command builder config:", error);
        return { ...defaultCommandBuilderConfig };
    }
}

function getCommandBuilderFormValues() {
    return {
        workspacePath: (document.getElementById("cmd-workspace-path")?.value || defaultCommandBuilderConfig.workspacePath).trim(),
        firstAdminEmail: (document.getElementById("cmd-first-admin-email")?.value || "").trim(),
        firstAdminPassword: (document.getElementById("cmd-first-admin-password")?.value || "").trim(),
    };
}

function renderCommandBuilderConfig(config) {
    const values = { ...defaultCommandBuilderConfig, ...(config || {}) };
    const mapping = {
        "cmd-workspace-path": values.workspacePath,
        "cmd-first-admin-email": values.firstAdminEmail,
        "cmd-first-admin-password": values.firstAdminPassword,
    };

    Object.entries(mapping).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value || "";
    });
}

function saveCommandBuilderConfig(showMessage = true) {
    const values = getCommandBuilderFormValues();
    localStorage.setItem(COMMAND_BUILDER_STORAGE_KEY, JSON.stringify(values));
    if (showMessage) {
        showNotification("Befehlszentrale gespeichert.", "success");
    }
    return values;
}

function escapePowerShellString(value) {
    return String(value || "").replace(/`/g, "``").replace(/"/g, "`\"");
}

function buildPowerShellScript(command, cwd) {
    const lines = [
        '$ErrorActionPreference = "Stop"',
    ];

    if (cwd) {
        lines.push(`Set-Location -Path "${escapePowerShellString(cwd)}"`);
    }

    lines.push(command);
    return lines.join("\n");
}

function encodeCommandPayload(payload) {
    return encodeURIComponent(JSON.stringify(payload));
}

function decodeCommandPayload(payload) {
    return JSON.parse(decodeURIComponent(payload));
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
}

async function copyRenderedCommand(payload, mode) {
    try {
        const data = decodeCommandPayload(payload);
        const text = mode === "powershell"
            ? buildPowerShellScript(data.command, data.cwd)
            : data.command;
        await copyTextToClipboard(text);
        showNotification(mode === "powershell" ? "PowerShell-Befehl kopiert." : "Befehl kopiert.", "success");
    } catch (error) {
        showNotification("Befehl konnte nicht kopiert werden: " + error.message, "error");
    }
}

function togglePowerShellPreview(payload, targetId) {
    try {
        const target = document.getElementById(targetId);
        if (!target) return;

        if (target.dataset.visible === "true") {
            target.innerHTML = "";
            target.dataset.visible = "false";
            return;
        }

        const data = decodeCommandPayload(payload);
        target.innerHTML = `<pre class="code-block">${escapeHtml(buildPowerShellScript(data.command, data.cwd))}</pre>`;
        target.dataset.visible = "true";
    } catch (error) {
        showNotification("PowerShell-Vorschau konnte nicht erzeugt werden: " + error.message, "error");
    }
}

function downloadPowerShellCommand(payload) {
    try {
        const data = decodeCommandPayload(payload);
        const script = buildPowerShellScript(data.command, data.cwd);
        const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.fileName || data.id || "command"}.ps1`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification("PowerShell-Skript heruntergeladen.", "success");
    } catch (error) {
        showNotification("PowerShell-Skript konnte nicht erstellt werden: " + error.message, "error");
    }
}

// ── CLI-Ausführung via Electron Bridge ──────────────────────────────────
let activeCLICommandId = null;
let cliOutputCleanup = null;

async function executeCommandDirect(payload) {
    if (!isElectronOperator) {
        showNotification("CLI-Ausführung nur im Operator-Desktop-Modus verfügbar.", "error");
        return;
    }

    const data = decodeCommandPayload(payload);
    const outputId = `cli-output-${data.id}`;
    const outputEl = document.getElementById(outputId);
    const statusId = `cli-status-${data.id}`;
    const statusEl = document.getElementById(statusId);

    if (!outputEl) return;

    // Bestätigungsdialog
    const confirmed = confirm(`Befehl ausführen?\n\n${data.command}\n\nArbeitsverzeichnis: ${data.cwd || "(aktuell)"}`);
    if (!confirmed) return;

    outputEl.textContent = "";
    outputEl.style.display = "block";
    if (statusEl) statusEl.innerHTML = '<span class="cli-running">⏳ Wird ausgeführt…</span>';

    // Live-Output Listener
    if (cliOutputCleanup) cliOutputCleanup();
    cliOutputCleanup = window.miniMasterDesktop.onCLIOutput((msg) => {
        if (outputEl) {
            outputEl.textContent += msg.data;
            outputEl.scrollTop = outputEl.scrollHeight;
        }
    });

    try {
        const result = await window.miniMasterDesktop.runCLI(data.command, data.cwd);
        activeCLICommandId = null;
        if (cliOutputCleanup) { cliOutputCleanup(); cliOutputCleanup = null; }

        if (result.code === 0) {
            if (statusEl) statusEl.innerHTML = '<span class="cli-success">✅ Erfolgreich abgeschlossen</span>';
            showNotification(`"${data.label}" erfolgreich ausgeführt.`, "success");
        } else {
            if (statusEl) statusEl.innerHTML = `<span class="cli-error">❌ Beendet mit Code ${result.code}</span>`;
            showNotification(`"${data.label}" fehlgeschlagen (Code ${result.code}).`, "error");
        }
    } catch (error) {
        activeCLICommandId = null;
        if (cliOutputCleanup) { cliOutputCleanup(); cliOutputCleanup = null; }
        if (statusEl) statusEl.innerHTML = `<span class="cli-error">❌ ${escapeHtml(error.message)}</span>`;
        showNotification("Fehler: " + error.message, "error");
    }
}

function renderCommandBlockHtml(entry) {
    const previewId = `ps-preview-${entry.id}`;
    const outputId = `cli-output-${entry.id}`;
    const statusId = `cli-status-${entry.id}`;
    const payload = encodeCommandPayload(entry);

    const executeBtn = isElectronOperator
        ? `<button onclick="executeCommandDirect('${payload}')" class="btn btn-execute btn-sm">▶ Ausführen</button>`
        : "";

    const outputArea = isElectronOperator
        ? `<div id="${statusId}" class="cli-status"></div><pre id="${outputId}" class="cli-output-area" style="display:none"></pre>`
        : "";

    return `
        <div class="command-block">
            <div class="command-block-header">
                <div>
                    <h5>${escapeHtml(entry.label)}</h5>
                    <p>${escapeHtml(entry.description || "")}</p>
                </div>
            </div>
            <pre class="code-block">${escapeHtml(entry.command)}</pre>
            <div class="command-actions">
                ${executeBtn}
                <button onclick="copyRenderedCommand('${payload}', 'raw')" class="btn btn-secondary btn-sm">CLI kopieren</button>
                <button onclick="copyRenderedCommand('${payload}', 'powershell')" class="btn btn-primary btn-sm">PowerShell kopieren</button>
                <button onclick="togglePowerShellPreview('${payload}', '${previewId}')" class="btn btn-secondary btn-sm">PowerShell anzeigen</button>
                <button onclick="downloadPowerShellCommand('${payload}')" class="btn btn-secondary btn-sm">PS1 herunterladen</button>
            </div>
            <div id="${previewId}" class="command-preview" data-visible="false"></div>
            ${outputArea}
        </div>
    `;
}

function buildRolloutBundleScript(projectId) {
    const commands = buildCommandCatalog(projectId);
    const values = getCommandBuilderFormValues();
    const header = [
        "$ErrorActionPreference = \"Stop\"",
        `Set-Location -Path \"${escapePowerShellString(values.workspacePath)}\"`,
        "",
        "Write-Host \"MiniMaster Rollout Bundle gestartet\" -ForegroundColor Cyan",
        "",
    ];

    const blocks = commands.map(entry => {
        const comment = `# ${entry.label}`;
        const body = String(entry.command || "").split("\n");
        return [comment, ...body, ""].join("\n");
    });

    return [...header, ...blocks].join("\n");
}

async function copyRolloutBundleScript(projectId) {
    try {
        const script = buildRolloutBundleScript(projectId);
        await copyTextToClipboard(script);
        showNotification("PowerShell-Rollout-Skript kopiert.", "success");
    } catch (error) {
        showNotification("Rollout-Skript konnte nicht kopiert werden: " + error.message, "error");
    }
}

function downloadRolloutBundleScript(projectId) {
    try {
        const activeProjectId = (projectId || getOperatorConfigFormValues().cloud.projectId || firebaseConfig.projectId || "default").trim();
        const script = buildRolloutBundleScript(projectId);
        const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `minimaster-rollout-${activeProjectId || "default"}.ps1`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification("PowerShell-Rollout-Skript heruntergeladen.", "success");
    } catch (error) {
        showNotification("Rollout-Skript konnte nicht erstellt werden: " + error.message, "error");
    }
}

function buildCommandCatalog(projectId) {
    const values = getCommandBuilderFormValues();
    const activeProjectId = (projectId || firebaseConfig.projectId || "").trim();
    const projectSuffix = activeProjectId ? ` --project ${activeProjectId}` : "";
    const firstAdminEmail = values.firstAdminEmail || "admin@example.com";
    const firstAdminPassword = values.firstAdminPassword || "<PASSWORT>";

    return [
        {
            id: "preflight-install",
            label: "Projekt vorbereiten",
            description: "Installiert Abhängigkeiten und prüft Build, Lint und Tests.",
            command: "npm install\nnpm run build\nnpm run lint\nnpm test",
            cwd: values.workspacePath,
            fileName: "minimaster-preflight",
        },
        {
            id: "firebase-login",
            label: "Firebase CLI Authentifizierung",
            description: "Meldet die lokale CLI am Firebase-Konto an.",
            command: "firebase login",
            cwd: values.workspacePath,
            fileName: "minimaster-firebase-login",
        },
        {
            id: "firebase-use-add",
            label: "Firebase Projekt lokal binden",
            description: "Verknüpft das lokale Repo mit dem Zielprojekt via firebase use --add.",
            command: activeProjectId ? `firebase use --add ${activeProjectId}` : "firebase use --add",
            cwd: values.workspacePath,
            fileName: "minimaster-firebase-use-add",
        },
        {
            id: "firebase-deploy-full",
            label: "Vollständiger Deploy",
            description: "Deployt Firestore-Regeln, Indexes, Functions und Hosting in das aktive Projekt.",
            command: buildDeployCommand(activeProjectId),
            cwd: values.workspacePath,
            fileName: "minimaster-deploy-full",
        },
        {
            id: "firebase-deploy-functions",
            label: "Nur Functions deployen",
            description: "Nützlich nach Backend-Änderungen ohne Hosting-Rollout.",
            command: `firebase deploy --only functions${projectSuffix}`,
            cwd: values.workspacePath,
            fileName: "minimaster-deploy-functions",
        },
        {
            id: "firebase-deploy-hosting",
            label: "Nur Hosting deployen",
            description: "Aktualisiert Admin-Panel und Web-Control ohne Backend-Rollout.",
            command: `firebase deploy --only hosting${projectSuffix}`,
            cwd: values.workspacePath,
            fileName: "minimaster-deploy-hosting",
        },
        {
            id: "firebase-deploy-storage",
            label: "Nur Storage Rules deployen",
            description: "Aktualisiert Storage-Regeln separat.",
            command: `firebase deploy --only storage${projectSuffix}`,
            cwd: values.workspacePath,
            fileName: "minimaster-deploy-storage",
        },
        {
            id: "repo-deploy-script",
            label: "Repository Deploy-Skript",
            description: "Führt das vorhandene Deploy-Skript über Bash/WSL aus.",
            command: "bash ./deploy.sh",
            cwd: values.workspacePath,
            fileName: "minimaster-deploy-script",
        },
        {
            id: "repo-config-sync-script",
            label: "Firebase Config Sync-Skript",
            description: "Synchronisiert Firebase-Konfiguration per Bash/WSL-Skript in die Panels.",
            command: "bash ./scripts/update-firebase-config.sh",
            cwd: values.workspacePath,
            fileName: "minimaster-config-sync",
        },
        {
            id: "setup-admin",
            label: "Erstadmin anlegen",
            description: "Erstellt den initialen Operator-Admin per Service Account.",
            command: `node scripts/setup-admin.js \"${firstAdminEmail}\" \"${firstAdminPassword}\"`,
            cwd: values.workspacePath,
            fileName: "minimaster-setup-admin",
        },
        {
            id: "android-build-all",
            label: "Android Debug-Builds",
            description: "Baut beide Android-Apps als Debug-Version.",
            command: ".\\gradlew.bat assembleDebug",
            cwd: values.workspacePath,
            fileName: "minimaster-android-build-all",
        },
        {
            id: "android-tests-master",
            label: "MasterApp Unit-Tests",
            description: "Führt die JVM-Unit-Tests der Master-App aus.",
            command: ".\\gradlew.bat :masterApp:testDebugUnitTest",
            cwd: values.workspacePath,
            fileName: "minimaster-android-tests-master",
        },
        {
            id: "android-tests-child",
            label: "ChildApp Unit-Tests",
            description: "Führt die JVM-Unit-Tests der Child-App aus.",
            command: ".\\gradlew.bat :childApp:testDebugUnitTest",
            cwd: values.workspacePath,
            fileName: "minimaster-android-tests-child",
        },
        {
            id: "android-adb-devices",
            label: "ADB Geräte prüfen",
            description: "Listet verbundene Emulatoren und physische Geräte auf.",
            command: "adb devices -l",
            cwd: values.workspacePath,
            fileName: "minimaster-adb-devices",
        },
        {
            id: "android-adb-logical-check",
            label: "ADB Shell-Prüfung",
            description: "Prüft, ob ein Android-Gerät per adb erreichbar ist.",
            command: "adb shell getprop ro.product.model",
            cwd: values.workspacePath,
            fileName: "minimaster-adb-check",
        },
        {
            id: "desktop-launcher",
            label: "Desktop Launcher starten",
            description: "Startet den Electron-Launcher für Admin-Panel und Web-Control.",
            command: "npm run desktop-start",
            cwd: values.workspacePath,
            fileName: "minimaster-desktop-launcher",
        },
        {
            id: "desktop-direct-electron",
            label: "Desktop Launcher direkt mit Electron",
            description: "Alternative zum npm-Skript für den nativen Desktop-Start.",
            command: "npx electron desktop/main.js",
            cwd: values.workspacePath,
            fileName: "minimaster-desktop-electron",
        },
    ];
}

function renderCommandCatalog(projectId) {
    const container = document.getElementById("command-builder-results");
    if (!container) return;

    const commands = buildCommandCatalog(projectId);
    container.innerHTML = commands.map(renderCommandBlockHtml).join("");
}

function refreshCommandBuilderCommands() {
    const values = saveCommandBuilderConfig(false);
    const activeProjectId = getOperatorConfigFormValues().cloud.projectId || firebaseConfig.projectId;
    renderCommandCatalog(activeProjectId);

    const status = document.getElementById("command-builder-status");
    if (status) {
        status.innerHTML = `<div class='success-box'>Befehle für ${escapeHtml(activeProjectId || "aktuelles Standardprojekt")} und Arbeitsverzeichnis ${escapeHtml(values.workspacePath)} bereitgestellt.</div>`;
    }

    showNotification("Befehlszentrale aktualisiert.", "success");
}

function updateSetupChecklistState(partialState) {
    const savedState = JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}");
    localStorage.setItem("operatorSetupChecklist", JSON.stringify({ ...savedState, ...partialState }));
}

function getCommissioningAttestations() {
    try {
        return JSON.parse(localStorage.getItem(COMMISSIONING_ATTESTATION_STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

function updateCommissioningAttestations(partialState) {
    const savedState = getCommissioningAttestations();
    localStorage.setItem(COMMISSIONING_ATTESTATION_STORAGE_KEY, JSON.stringify({ ...savedState, ...partialState }));
}

function renderCommissioningAttestations() {
    const container = document.getElementById("commissioning-attestations");
    if (!container) return;

    const savedState = getCommissioningAttestations();
    container.innerHTML = "";

    commissioningAttestationItems.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "setup-checklist-item";
        wrapper.innerHTML = `
            <input type="checkbox" id="attestation-${item.key}" ${savedState[item.key] ? "checked" : ""}>
            <label for="attestation-${item.key}">${item.label}</label>
        `;

        const checkbox = wrapper.querySelector("input");
        checkbox.addEventListener("change", (e) => {
            updateCommissioningAttestations({ [item.key]: e.target.checked });
            refreshCommissioningReport();
        });

        container.appendChild(wrapper);
    });
}

function getMissingAttestations() {
    const savedState = getCommissioningAttestations();
    return commissioningAttestationItems
        .filter(item => !savedState[item.key])
        .map(item => item.label);
}

// ==================== GO-LIVE AMPEL & PLATTFORM-TRACKER ====================

const PLATFORM_ATTESTATION_STORAGE_KEY = "operatorPlatformReadiness";

function getPlatformReadiness() {
    try {
        return JSON.parse(localStorage.getItem(PLATFORM_ATTESTATION_STORAGE_KEY) || "{}");
    } catch (_) { return {}; }
}

function updatePlatformReadiness(partial) {
    const current = getPlatformReadiness();
    Object.assign(current, partial);
    localStorage.setItem(PLATFORM_ATTESTATION_STORAGE_KEY, JSON.stringify(current));
}

const platformReadinessItems = {
    masterApp: {
        label: "MasterApp (Eltern-Android)",
        items: [
            { key: "ma-registration-flow", label: "Geräteregistrierung & SecretKey-Persistierung funktionsfähig", severity: "critical" },
            { key: "ma-credentials-encrypted", label: "IMEI/SecretKey verschlüsselt gespeichert (EncryptedSharedPreferences)", severity: "critical" },
            { key: "ma-imei-fallback", label: "IMEI-Fallback für Android 10+ implementiert (kein READ_PHONE_STATE)", severity: "critical" },
            { key: "ma-proguard-enabled", label: "ProGuard/R8 in Release-Build aktiviert (minifyEnabled=true)", severity: "critical" },
            { key: "ma-pairing-works", label: "Pairing-Link-Generierung und Kopplung mit ChildApp getestet", severity: "critical" },
            { key: "ma-lock-unlock", label: "Lock/Unlock Toggle für Kindergeräte funktionsfähig", severity: "critical" },
            { key: "ma-task-create", label: "Task-Erstellung mit Deadline funktionsfähig", severity: "high" },
            { key: "ma-task-review", label: "Task Review mit Fotoanzeige und Genehmigung funktionsfähig", severity: "high" },
            { key: "ma-task-reject-ui", label: "Reject-Button in TaskReviewScreen vorhanden und funktional", severity: "high" },
            { key: "ma-usage-rules-nav", label: "UsageRulesScreen über Navigation erreichbar und datengebunden", severity: "high" },
            { key: "ma-date-picker", label: "DatePicker statt Freitext-Timestamp für Task-Deadline", severity: "medium" },
            { key: "ma-subscription-check", label: "Abo-Status wird beim Start geprüft (queryPurchases)", severity: "high" },
            { key: "ma-subscription-enforce", label: "Free-Tier-Limit (1 Kind) wird vor Aktionen erzwungen", severity: "high" },
            { key: "ma-fcm-working", label: "FCM Push-Empfang (task_pending_approval, device_status) getestet", severity: "high" },
            { key: "ma-debug-hidden", label: "Debug-Infos (IMEI/SecretKey) in Release-Builds ausgeblendet", severity: "critical" },
            { key: "ma-firebase-appcheck", label: "Firebase App Check aktiviert", severity: "high" },
            { key: "ma-offline-handling", label: "Offline-Hinweis oder -Caching implementiert", severity: "medium" },
            { key: "ma-qr-pairing", label: "QR-Code-Anzeige für Pairing (nicht nur Link)", severity: "medium" },
        ],
    },
    childApp: {
        label: "ChildApp (Kind-Android)",
        items: [
            { key: "ca-pairing-flow", label: "Pairing per Deep-Link und 6-stelligem Code funktionsfähig", severity: "critical" },
            { key: "ca-fcm-sync", label: "FCM-Regelempfang (isLocked, appBlacklist, usageRules) funktionsfähig", severity: "critical" },
            { key: "ca-heartbeat", label: "HeartbeatWorker sendet lastSeen alle 15 Min (WorkManager)", severity: "critical" },
            { key: "ca-accessibility-active", label: "AccessibilityService aktiviert und App-Überwachung läuft", severity: "critical" },
            { key: "ca-app-blocking-effective", label: "App-Blocking tatsächlich wirksam (nicht nur GLOBAL_ACTION_BACK)", severity: "critical" },
            { key: "ca-overlay-secure", label: "BlockingOverlay nicht wegwischbar, bedeckt kompletten Screen", severity: "critical" },
            { key: "ca-uninstall-prevention", label: "App-Deinstallation verhindert (Device Admin / setUninstallBlocked)", severity: "critical" },
            { key: "ca-settings-protection", label: "Zugriff auf Eingabehilfe-Einstellungen geschützt (nicht nur geloggt)", severity: "critical" },
            { key: "ca-device-admin-enforced", label: "DevicePolicyManager tatsächlich aufgerufen (force-lock, watch-login)", severity: "high" },
            { key: "ca-usage-limits", label: "Tages- und Pro-App-Nutzungslimits korrekt durchgesetzt", severity: "high" },
            { key: "ca-time-windows", label: "Zeitfenster-Einschränkungen (inkl. Nachtsperre) aktiv", severity: "high" },
            { key: "ca-tamper-detection", label: "Manipulationserkennung (Settings-Zugriff) getestet", severity: "high" },
            { key: "ca-task-proof", label: "Foto-Beweis-Upload für Aufgaben funktionsfähig", severity: "high" },
            { key: "ca-boot-receiver", label: "BootReceiver startet Services nach Geräte-Neustart", severity: "high" },
            { key: "ca-factory-reset-protection", label: "Factory-Reset-Schutz implementiert", severity: "medium" },
            { key: "ca-root-detection", label: "Root-/SafetyNet-Erkennung implementiert", severity: "medium" },
            { key: "ca-permission-onboarding", label: "Permissions-Onboarding mit Verifikation implementiert", severity: "high" },
        ],
    },
    desktop: {
        label: "Desktop-App (Eltern Heim-PC)",
        items: [
            { key: "dt-csp-headers", label: "Content Security Policy (CSP) in beiden HTML-Dateien gesetzt", severity: "critical" },
            { key: "dt-sri-hashes", label: "SRI-Hashes für alle externen CDN-Scripts vorhanden", severity: "critical" },
            { key: "dt-credential-security", label: "Credentials nicht als Klartext in localStorage (keytar/keyring)", severity: "critical" },
            { key: "dt-session-timeout", label: "Session-Timeout (Auto-Logout nach Inaktivität) implementiert", severity: "high" },
            { key: "dt-electron-builder", label: "electron-builder konfiguriert für Installer-Erzeugung", severity: "critical" },
            { key: "dt-code-signing", label: "Code-Signing-Zertifikate für Windows/macOS eingerichtet", severity: "high" },
            { key: "dt-auto-update", label: "Auto-Update-Mechanismus (electron-updater) implementiert", severity: "high" },
            { key: "dt-system-tray", label: "System-Tray-Integration (Minimize-to-Tray, Icon)", severity: "medium" },
            { key: "dt-desktop-notifications", label: "Desktop-Benachrichtigungen bei Aufgaben/Sperren", severity: "high" },
            { key: "dt-window-persistence", label: "Fenstergröße/-position wird gespeichert", severity: "low" },
            { key: "dt-ipc-messaging", label: "IPC-Kommunikation zwischen Main-Process und Panels", severity: "medium" },
            { key: "dt-parent-panel-login", label: "Parent-Panel-Login im Electron-Fenster geprüft", severity: "critical" },
            { key: "dt-admin-panel-login", label: "Admin-Panel-Login im Electron-Fenster geprüft", severity: "high" },
            { key: "dt-crash-reporting", label: "Crash-Reporter integriert (Sentry o. Ä.)", severity: "medium" },
        ],
    },
};

function computeGoLiveStatus() {
    const attestations = getCommissioningAttestations();
    const missingAttestations = getMissingAttestations();
    const platformState = getPlatformReadiness();
    const validation = commissioningSummary?.validationSummary || null;

    const backendReady = validation
        ? (validation.errorCount === 0 && validation.checks.adminAuthOk && validation.checks.functionsReachable && validation.checks.firestoreAccessOk)
        : false;

    const allAttestationsOk = missingAttestations.length === 0;

    const platformStatus = {};
    let totalCritical = 0;
    let doneCritical = 0;
    let totalHigh = 0;
    let doneHigh = 0;
    let totalAll = 0;
    let doneAll = 0;

    for (const [platformKey, platform] of Object.entries(platformReadinessItems)) {
        let pCritical = 0, pCriticalDone = 0, pHigh = 0, pHighDone = 0, pTotal = 0, pDone = 0;
        for (const item of platform.items) {
            pTotal++;
            totalAll++;
            if (item.severity === "critical") { pCritical++; totalCritical++; }
            if (item.severity === "high") { pHigh++; totalHigh++; }
            if (platformState[item.key]) {
                pDone++;
                doneAll++;
                if (item.severity === "critical") { pCriticalDone++; doneCritical++; }
                if (item.severity === "high") { pHighDone++; doneHigh++; }
            }
        }
        platformStatus[platformKey] = {
            label: platform.label,
            total: pTotal, done: pDone,
            critical: pCritical, criticalDone: pCriticalDone,
            high: pHigh, highDone: pHighDone,
            percent: pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0,
        };
    }

    const allCriticalDone = doneCritical === totalCritical;
    const allHighDone = doneHigh === totalHigh;

    let ampel, ampelLabel, ampelDescription;
    if (backendReady && allAttestationsOk && allCriticalDone && allHighDone && doneAll === totalAll) {
        ampel = "green";
        ampelLabel = "Go-Live freigegeben";
        ampelDescription = "Backend, manuelle Freigaben und alle Plattformen sind produktionsbereit.";
    } else if (backendReady && allCriticalDone) {
        ampel = "yellow";
        ampelLabel = "Teilweise bereit";
        ampelDescription = "Backend und kritische Punkte OK. Offene Freigaben oder HIGH-Punkte verhindern Vollfreigabe.";
    } else {
        ampel = "red";
        ampelLabel = "Go-Live blockiert";
        ampelDescription = backendReady
            ? `${totalCritical - doneCritical} kritische Plattform-Punkte offen.`
            : "Backend-Validierung fehlt oder fehlerhaft. Kritische Plattform-Punkte offen.";
    }

    return {
        ampel, ampelLabel, ampelDescription,
        backendReady, allAttestationsOk,
        platformStatus,
        totals: { totalAll, doneAll, totalCritical, doneCritical, totalHigh, doneHigh },
    };
}

function renderGoLiveAmpel() {
    const container = document.getElementById("golive-ampel");
    if (!container) return;

    const status = computeGoLiveStatus();
    const pct = status.totals.totalAll > 0 ? Math.round((status.totals.doneAll / status.totals.totalAll) * 100) : 0;

    let platformBars = "";
    for (const [, ps] of Object.entries(status.platformStatus)) {
        const barColor = ps.criticalDone === ps.critical
            ? (ps.done === ps.total ? "#22c55e" : "#eab308")
            : "#ef4444";
        platformBars += `
            <div class="ampel-platform-row">
                <span class="ampel-platform-label">${escapeHtml(ps.label)}</span>
                <div class="ampel-progress-bar">
                    <div class="ampel-progress-fill" style="width:${ps.percent}%;background:${barColor}"></div>
                </div>
                <span class="ampel-platform-pct">${ps.percent}%</span>
                <span class="ampel-platform-detail">${ps.done}/${ps.total}</span>
            </div>`;
    }

    container.innerHTML = `
        <div class="golive-ampel-card ampel-${status.ampel}">
            <div class="ampel-header">
                <div class="ampel-light ampel-light-${status.ampel}"></div>
                <div class="ampel-title">
                    <h4>${escapeHtml(status.ampelLabel)}</h4>
                    <p>${escapeHtml(status.ampelDescription)}</p>
                </div>
            </div>
            <div class="ampel-summary">
                <div class="ampel-stat"><strong>${status.totals.doneCritical}/${status.totals.totalCritical}</strong><span>Kritisch</span></div>
                <div class="ampel-stat"><strong>${status.totals.doneHigh}/${status.totals.totalHigh}</strong><span>Hoch</span></div>
                <div class="ampel-stat"><strong>${status.totals.doneAll}/${status.totals.totalAll}</strong><span>Gesamt</span></div>
                <div class="ampel-stat"><strong>${status.backendReady ? "OK" : "FEHLT"}</strong><span>Backend</span></div>
                <div class="ampel-stat"><strong>${status.allAttestationsOk ? "OK" : "OFFEN"}</strong><span>Freigaben</span></div>
            </div>
            <div class="ampel-platforms">
                <h5>Plattform-Fortschritt</h5>
                ${platformBars}
            </div>
            <div class="ampel-total-bar">
                <div class="ampel-progress-bar ampel-progress-bar-lg">
                    <div class="ampel-progress-fill" style="width:${pct}%;background:${status.ampel === 'green' ? '#22c55e' : status.ampel === 'yellow' ? '#eab308' : '#ef4444'}"></div>
                </div>
                <span class="ampel-total-pct">${pct}% Gesamtfortschritt</span>
            </div>
        </div>`;
}

function renderPlatformReadinessSection(platformKey) {
    const container = document.getElementById(`platform-${platformKey}`);
    if (!container) return;
    const platform = platformReadinessItems[platformKey];
    if (!platform) return;

    const savedState = getPlatformReadiness();
    container.innerHTML = "";

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sortedItems = [...platform.items].sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));

    sortedItems.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "platform-checklist-item severity-" + item.severity;
        wrapper.innerHTML = `
            <input type="checkbox" id="platform-${item.key}" ${savedState[item.key] ? "checked" : ""}>
            <label for="platform-${item.key}">
                <span class="severity-badge severity-${item.severity}">${item.severity.toUpperCase()}</span>
                ${escapeHtml(item.label)}
            </label>
        `;

        const checkbox = wrapper.querySelector("input");
        checkbox.addEventListener("change", (e) => {
            updatePlatformReadiness({ [item.key]: e.target.checked });
            renderGoLiveAmpel();
        });

        container.appendChild(wrapper);
    });
}

function renderAllPlatformSections() {
    renderPlatformReadinessSection("masterApp");
    renderPlatformReadinessSection("childApp");
    renderPlatformReadinessSection("desktop");
    renderGoLiveAmpel();
}

// ==================== PLAUSIBILITÄTSPRÜFUNG ====================

function runPlausibilityCheck() {
    const container = document.getElementById("plausibility-results");
    if (!container) return;

    const findings = [];
    const attestations = getCommissioningAttestations();
    const platformState = getPlatformReadiness();
    const config = typeof getOperatorConfigFormValues === "function" ? getOperatorConfigFormValues() : {};

    // Cross-Platform-Plausibilität
    if (attestations["android-master-registered"] && !platformState["ma-registration-flow"]) {
        findings.push({ severity: "warn", text: "MasterApp als registriert markiert, aber Registrierungs-Flow nicht bestätigt." });
    }
    if (attestations["android-child-registered"] && !platformState["ca-pairing-flow"]) {
        findings.push({ severity: "warn", text: "ChildApp als registriert markiert, aber Pairing-Flow nicht bestätigt." });
    }
    if (attestations["parent-panel-verified"] && !platformState["dt-parent-panel-login"]) {
        findings.push({ severity: "warn", text: "Parent-Panel als geprüft markiert, aber Desktop-Login nicht bestätigt." });
    }
    if (attestations["device-sync-verified"] && !platformState["ca-fcm-sync"]) {
        findings.push({ severity: "warn", text: "Device-Sync als geprüft markiert, aber FCM-Sync in ChildApp nicht bestätigt." });
    }
    if (attestations["storage-rules-verified"] && !platformState["ca-task-proof"]) {
        findings.push({ severity: "info", text: "Storage-Rules geprüft, aber Foto-Beweis-Upload noch nicht bestätigt." });
    }

    // MasterApp-Plausibilität
    if (platformState["ma-lock-unlock"] && !platformState["ca-accessibility-active"]) {
        findings.push({ severity: "error", text: "MasterApp Lock/Unlock bestätigt, aber ChildApp AccessibilityService nicht aktiv – Sperren wirken nicht." });
    }
    if (platformState["ma-task-create"] && !platformState["ca-task-proof"]) {
        findings.push({ severity: "warn", text: "Task-Erstellung bestätigt, aber Foto-Beweis-Upload im Kind-App nicht bestätigt." });
    }
    if (platformState["ma-task-review"] && !platformState["ma-task-reject-ui"]) {
        findings.push({ severity: "warn", text: "Task-Review bestätigt, aber Reject-Button fehlt noch." });
    }
    if (platformState["ma-usage-rules-nav"] && !platformState["ca-usage-limits"]) {
        findings.push({ severity: "warn", text: "UsageRules in MasterApp navigierbar, aber Limits in ChildApp nicht durchgesetzt." });
    }
    if (platformState["ma-fcm-working"] && !platformState["ca-fcm-sync"]) {
        findings.push({ severity: "error", text: "FCM-Empfang in MasterApp bestätigt, aber FCM-Sync in ChildApp nicht – Push-Kette unterbrochen." });
    }
    if (platformState["ma-subscription-check"] && !platformState["ma-subscription-enforce"]) {
        findings.push({ severity: "warn", text: "Abo-Check bestätigt, aber Free-Tier-Limit wird nicht erzwungen." });
    }

    // ChildApp-Plausibilität
    if (platformState["ca-app-blocking-effective"] && !platformState["ca-overlay-secure"]) {
        findings.push({ severity: "error", text: "App-Blocking als wirksam markiert, aber Overlay-Sicherheit fehlt – Kinder können Overlay wegwischen." });
    }
    if (platformState["ca-app-blocking-effective"] && !platformState["ca-uninstall-prevention"]) {
        findings.push({ severity: "error", text: "App-Blocking bestätigt, aber Deinstallationsschutz fehlt – Kind kann App einfach deinstallieren." });
    }
    if (platformState["ca-accessibility-active"] && !platformState["ca-settings-protection"]) {
        findings.push({ severity: "error", text: "AccessibilityService aktiv, aber Settings-Schutz fehlt – Kind kann Service abschalten." });
    }
    if (platformState["ca-heartbeat"] && !platformState["ca-boot-receiver"]) {
        findings.push({ severity: "warn", text: "HeartbeatWorker bestätigt, aber BootReceiver fehlt – nach Neustart kein Heartbeat." });
    }

    // Desktop-Plausibilität
    if (platformState["dt-auto-update"] && !platformState["dt-code-signing"]) {
        findings.push({ severity: "error", text: "Auto-Update bestätigt, aber Code-Signing fehlt – unsignierte Updates sind ein Sicherheitsrisiko." });
    }
    if (platformState["dt-desktop-notifications"] && !platformState["dt-ipc-messaging"]) {
        findings.push({ severity: "warn", text: "Desktop-Benachrichtigungen bestätigt, aber IPC-Kommunikation fehlt – Benachrichtigungen benötigen IPC." });
    }
    if (platformState["dt-parent-panel-login"] && !platformState["dt-credential-security"]) {
        findings.push({ severity: "error", text: "Parent-Panel-Login bestätigt, aber Credentials unsicher gespeichert." });
    }

    // KI-Konfiguration
    if (config?.ai?.provider && !config?.ai?.keyRef) {
        findings.push({ severity: "warn", text: "KI-Provider konfiguriert, aber Secret-Referenz fehlt – KI-Aufrufe werden fehlschlagen." });
    }

    // Backend ↔ App-Konsistenz
    const validationChecks = commissioningSummary?.validationSummary?.checks || {};
    if (validationChecks.functionsReachable && !platformState["ma-pairing-works"]) {
        findings.push({ severity: "info", text: "Backend-Functions erreichbar, aber MasterApp-Pairing noch nicht getestet." });
    }
    if (validationChecks.storageHealthOk && !platformState["ca-task-proof"]) {
        findings.push({ severity: "info", text: "Storage-Bucket erreichbar, aber Foto-Upload aus ChildApp noch ungeprüft." });
    }

    if (findings.length === 0) {
        findings.push({ severity: "ok", text: "Keine Plausibilitäts-Widersprüche erkannt. Alle Angaben sind konsistent." });
    }

    const html = findings.map(f => {
        const icon = f.severity === "error" ? "🔴" : f.severity === "warn" ? "🟡" : f.severity === "info" ? "🔵" : "🟢";
        return `<div class="plausibility-item plausibility-${f.severity}">${icon} ${escapeHtml(f.text)}</div>`;
    }).join("");

    container.innerHTML = html;
    return findings;
}

// ==================== EINRICHTUNGSASSISTENTEN (WIZARD) ====================

const WIZARD_STATE_KEY = "operatorSetupWizardState";

function getWizardState(wizardId) {
    try {
        const all = JSON.parse(localStorage.getItem(WIZARD_STATE_KEY) || "{}");
        return all[wizardId] || { currentStep: 0, completed: {} };
    } catch (_) { return { currentStep: 0, completed: {} }; }
}

function saveWizardState(wizardId, state) {
    try {
        const all = JSON.parse(localStorage.getItem(WIZARD_STATE_KEY) || "{}");
        all[wizardId] = state;
        localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(all));
    } catch (_) { /* ignore */ }
}

const setupWizards = {
    masterApp: {
        title: "Eltern-App (MasterApp) einrichten",
        steps: [
            {
                title: "1. App installieren",
                instruction: "Installieren Sie die MasterApp auf dem Eltern-Smartphone. Sie finden sie unter dem Paketnamen <strong>com.minimaster.masterapp</strong>.",
                detail: "Für Testzwecke: <code>gradlew.bat :masterApp:assembleDebug</code> ausführen und die APK per USB/ADB installieren. Für Produktion: App über den Google Play Store herunterladen.",
                checkKey: "ma-registration-flow",
            },
            {
                title: "2. Geräteregistrierung",
                instruction: "Öffnen Sie die App. Sie werden automatisch zur Registrierung geleitet. Die App fordert <strong>READ_PHONE_STATE</strong> an und registriert das Gerät über <code>registerMasterDevice</code>.",
                detail: "Nach Registrierung erhalten Sie einen <strong>SecretKey</strong>, der im DataStore gespeichert wird. <em>Wichtig:</em> Auf Android 10+ kann die IMEI nicht direkt gelesen werden – hier wird eine alternative Geräte-ID benötigt.",
                checkKey: "ma-registration-flow",
            },
            {
                title: "3. Kind-Gerät koppeln",
                instruction: "Im Dashboard auf <strong>Pairing-Link generieren</strong> oder einen <strong>6-stelligen Code</strong> erstellen. Den Link/Code an das Kind-Gerät weitergeben.",
                detail: "Pairing-Links sind 5 Minuten gültig (UUID-Token). Codes sind 24 Stunden gültig. Nach erfolgreichem Pairing erscheint das Kind-Gerät im Dashboard.",
                checkKey: "ma-pairing-works",
            },
            {
                title: "4. Gerätesperre testen",
                instruction: "Im Dashboard den <strong>Lock-Toggle</strong> für das gekoppelte Kind-Gerät aktivieren. Prüfen Sie, ob das Kind-Gerät gesperrt wird.",
                detail: "Der Lock-Status wird in Echtzeit via Firestore synchronisiert. Das Kind-Gerät empfängt die Änderung über FCM und den AccessibilityService.",
                checkKey: "ma-lock-unlock",
            },
            {
                title: "5. Aufgabe erstellen und prüfen",
                instruction: "Eine Testaufgabe über <strong>Aufgabe erstellen</strong> anlegen. Das Kind schließt die Aufgabe mit Fotobeweis ab. Danach im <strong>Task Review</strong> genehmigen.",
                detail: "Aufgaben-Flow: pending → pending_approval (Kind schickt Foto) → approved (Eltern genehmigen). Der Reject-Button muss ebenfalls funktionieren.",
                checkKey: "ma-task-review",
            },
            {
                title: "6. Nutzungsregeln einrichten",
                instruction: "Öffnen Sie <strong>Nutzungsregeln</strong> für ein Kind-Gerät. Setzen Sie ein Tageslimit (z.B. 120 Minuten), ein Zeitfenster (z.B. 08:00–20:00) und optional Pro-App-Limits.",
                detail: "Die Regeln werden über <code>setUsageRules</code> Cloud Function gespeichert und per FCM an das Kind-Gerät übermittelt. Testen Sie, ob die Limits auf dem Kind-Gerät tatsächlich greifen.",
                checkKey: "ma-usage-rules-nav",
            },
            {
                title: "7. Push-Benachrichtigungen prüfen",
                instruction: "Lösen Sie auf dem Kind-Gerät eine Aufgaben-Erledigung aus. Prüfen Sie, ob die Eltern-App eine <strong>Push-Benachrichtigung</strong> empfängt.",
                detail: "Die MasterApp verwendet zwei Notification-Channels: IMPORTANCE_HIGH (Aufgaben) und IMPORTANCE_DEFAULT (Gerätestatus). FCM-Token wird beim App-Start registriert.",
                checkKey: "ma-fcm-working",
            },
            {
                title: "8. Abonnement prüfen",
                instruction: "Öffnen Sie den <strong>Subscription-Screen</strong>. Prüfen Sie, ob Produkte angezeigt werden und ein Testkauf möglich ist.",
                detail: "SKUs: single_child_monthly (€1,99), family_monthly (€4,99), single_child_yearly (€19,99), family_yearly (€49,99). Testmodus über Google Play Console aktivieren.",
                checkKey: "ma-subscription-check",
            },
        ],
    },
    childApp: {
        title: "Kind-App (ChildApp) einrichten",
        steps: [
            {
                title: "1. App installieren",
                instruction: "Installieren Sie die ChildApp auf dem Kind-Smartphone. Paketname: <strong>com.google.pairing</strong> (Legacy-Paketname).",
                detail: "Für Tests: <code>gradlew.bat :childApp:assembleDebug</code>. Per ADB installieren: <code>adb install childApp/build/outputs/apk/debug/childApp-debug.apk</code>.",
                checkKey: "ca-pairing-flow",
            },
            {
                title: "2. Kopplung durchführen",
                instruction: "Öffnen Sie die ChildApp und geben Sie den <strong>6-stelligen Code</strong> ein oder öffnen Sie den <strong>Pairing-Link</strong> auf dem Kind-Gerät.",
                detail: "Die App ruft <code>validatePairingCode</code> oder <code>validatePairingToken</code> auf. Nach Erfolg wird ein Child-Dokument in Firestore erstellt und die App wechselt in den überwachten Modus.",
                checkKey: "ca-pairing-flow",
            },
            {
                title: "3. Berechtigungen erteilen",
                instruction: "Erteilen Sie alle erforderlichen Berechtigungen: <strong>Eingabehilfe (Accessibility)</strong>, <strong>Overlay-Berechtigung</strong>, <strong>Nutzungsstatistik-Zugriff</strong>, <strong>Geräteadministrator</strong>.",
                detail: "Die App leitet durch jeden Berechtigungsschritt. Ohne Accessibility-Berechtigung ist keine App-Überwachung möglich. Die Overlay-Berechtigung wird für die Sperrbildschirm-Anzeige benötigt.",
                checkKey: "ca-permission-onboarding",
            },
            {
                title: "4. Eingabehilfe aktivieren",
                instruction: "Navigieren Sie zu <strong>Einstellungen → Eingabehilfe → MiniMaster</strong> und aktivieren Sie den Dienst. Bestätigen Sie die Warnung.",
                detail: "Der MiniMasterAccessibilityService überwacht App-Wechsel und blockiert Apps auf der Blacklist. Ohne diesen Service ist die App-Sperrfunktion wirkungslos.",
                checkKey: "ca-accessibility-active",
            },
            {
                title: "5. Sperrbildschirm testen",
                instruction: "Lösen Sie über die Eltern-App eine <strong>Gerätesperre</strong> aus. Das Kind-Gerät sollte sofort einen Sperrbildschirm anzeigen, der nicht umgangen werden kann.",
                detail: "Die BlockingOverlayService zeigt ein Vollbild-Overlay. Prüfen Sie: Ist das Overlay wirklich nicht wegwischbar? Bedeckt es den gesamten Bildschirm? Überlebt es einen Home-Button-Druck?",
                checkKey: "ca-overlay-secure",
            },
            {
                title: "6. App-Blocking testen",
                instruction: "Fügen Sie über die Eltern-App eine App zur <strong>Blacklist</strong> hinzu (z.B. YouTube). Öffnen Sie diese App auf dem Kind-Gerät.",
                detail: "Das AccessibilityService erkennt den App-Wechsel und blockiert die App. Aktuell wird GLOBAL_ACTION_BACK verwendet – prüfen Sie, ob das Kind die App trotzdem sofort wieder öffnen kann.",
                checkKey: "ca-app-blocking-effective",
            },
            {
                title: "7. Heartbeat prüfen",
                instruction: "Warten Sie 15 Minuten oder prüfen Sie in der Eltern-App den <strong>Online-Status</strong> (lastSeen-Timestamp). Das Kind-Gerät sollte als 'online' erscheinen.",
                detail: "Der HeartbeatWorker sendet alle 15 Minuten per WorkManager. Im Dashboard: grüner Punkt = online (lastSeen < 20 Min), grauer Punkt = offline.",
                checkKey: "ca-heartbeat",
            },
            {
                title: "8. Aufgaben-Beweis testen",
                instruction: "Erstellen Sie in der Eltern-App eine Aufgabe. Schließen Sie sie auf dem Kind-Gerät ab und machen Sie ein <strong>Foto als Beweis</strong>.",
                detail: "Das Foto wird über Firebase Storage hochgeladen. Die Aufgabe wechselt in den Status <code>pending_approval</code>. Die Eltern können das Foto im Task-Review einsehen.",
                checkKey: "ca-task-proof",
            },
            {
                title: "9. Neustart-Verhalten prüfen",
                instruction: "Starten Sie das Kind-Gerät neu. Prüfen Sie, ob alle Dienste (Accessibility, Heartbeat, FCM) <strong>automatisch</strong> wieder laufen.",
                detail: "Der BootReceiver startet die Services nach dem Boot. Testen Sie: Ist die App-Sperre aktiv? Kommt ein Heartbeat nach dem Neustart?",
                checkKey: "ca-boot-receiver",
            },
        ],
    },
};

let activeWizard = null;

function startSetupWizard(wizardId) {
    const wizard = setupWizards[wizardId];
    if (!wizard) return;
    activeWizard = wizardId;
    const state = getWizardState(wizardId);
    renderWizardStep(wizardId, state.currentStep);
}

function renderWizardStep(wizardId, stepIndex) {
    const container = document.getElementById("setup-wizard-content");
    if (!container) return;
    const wizard = setupWizards[wizardId];
    if (!wizard) return;

    const state = getWizardState(wizardId);
    state.currentStep = stepIndex;
    saveWizardState(wizardId, state);

    const step = wizard.steps[stepIndex];
    if (!step) return;

    const totalSteps = wizard.steps.length;
    const completedCount = Object.keys(state.completed).filter(k => state.completed[k]).length;

    const progressPct = Math.round((completedCount / totalSteps) * 100);
    const isStepDone = Boolean(state.completed[stepIndex]);

    let stepsNav = "";
    for (let i = 0; i < totalSteps; i++) {
        const done = state.completed[i];
        const active = i === stepIndex;
        stepsNav += `<button class="wizard-step-dot ${done ? "done" : ""} ${active ? "active" : ""}" onclick="renderWizardStep('${wizardId}', ${i})" title="Schritt ${i + 1}">${i + 1}</button>`;
    }

    container.innerHTML = `
        <div class="wizard-active-card">
            <div class="wizard-progress-header">
                <h4>${escapeHtml(wizard.title)}</h4>
                <span>${completedCount}/${totalSteps} Schritte (${progressPct}%)</span>
            </div>
            <div class="ampel-progress-bar" style="margin-block-end:12px">
                <div class="ampel-progress-fill" style="width:${progressPct}%;background:${progressPct === 100 ? '#22c55e' : '#3b82f6'}"></div>
            </div>
            <div class="wizard-step-nav">${stepsNav}</div>
            <div class="wizard-step-content">
                <h5>${step.title}</h5>
                <p>${step.instruction}</p>
                <details class="wizard-detail">
                    <summary>Technische Details & Hinweise</summary>
                    <div class="wizard-detail-content">${step.detail}</div>
                </details>
                <div class="wizard-step-actions">
                    <label class="wizard-check-label">
                        <input type="checkbox" ${isStepDone ? "checked" : ""} onchange="toggleWizardStepDone('${wizardId}', ${stepIndex}, this.checked)">
                        Schritt erledigt
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="askGeminiAboutStep('${wizardId}', ${stepIndex})" title="KI-Hilfe anfordern">🤖 Gemini fragen</button>
                </div>
            </div>
            <div class="wizard-nav-buttons">
                ${stepIndex > 0 ? `<button class="btn btn-secondary btn-sm" onclick="renderWizardStep('${wizardId}', ${stepIndex - 1})">← Zurück</button>` : "<span></span>"}
                ${stepIndex < totalSteps - 1 ? `<button class="btn btn-primary btn-sm" onclick="renderWizardStep('${wizardId}', ${stepIndex + 1})">Weiter →</button>` : `<button class="btn btn-primary btn-sm" onclick="finishWizard('${wizardId}')">Abschließen ✓</button>`}
            </div>
            <div id="wizard-gemini-response" style="margin-block-start:12px"></div>
        </div>`;
}

function toggleWizardStepDone(wizardId, stepIndex, done) {
    const state = getWizardState(wizardId);
    state.completed[stepIndex] = done;
    saveWizardState(wizardId, state);

    // Sync with platform readiness
    const wizard = setupWizards[wizardId];
    if (wizard?.steps[stepIndex]?.checkKey) {
        updatePlatformReadiness({ [wizard.steps[stepIndex].checkKey]: done });
        renderPlatformReadinessSection(wizardId === "masterApp" ? "masterApp" : "childApp");
        renderGoLiveAmpel();
    }
    renderWizardStep(wizardId, stepIndex);
}

function finishWizard(wizardId) {
    const state = getWizardState(wizardId);
    const wizard = setupWizards[wizardId];
    const total = wizard.steps.length;
    const done = Object.keys(state.completed).filter(k => state.completed[k]).length;

    const container = document.getElementById("setup-wizard-content");
    if (!container) return;

    if (done === total) {
        container.innerHTML = `<div class="success-box">✅ ${escapeHtml(wizard.title)} – alle ${total} Schritte abgeschlossen!</div>`;
    } else {
        container.innerHTML = `<div class="error">⚠️ ${done}/${total} Schritte erledigt. Bitte offene Schritte nachholen.</div>`;
    }
    activeWizard = null;
    renderGoLiveAmpel();
}

function resetWizard(wizardId) {
    saveWizardState(wizardId, { currentStep: 0, completed: {} });
    startSetupWizard(wizardId);
}

// ==================== GEMINI KI-ERKLÄRUNGS-DIENST MIT CONSENT ====================

const AI_CONSENT_KEY = "operatorAiConsentGiven";

function hasAiConsent() {
    return localStorage.getItem(AI_CONSENT_KEY) === "true";
}

function grantAiConsent() {
    localStorage.setItem(AI_CONSENT_KEY, "true");
}

function revokeAiConsent() {
    localStorage.removeItem(AI_CONSENT_KEY);
    const statusEl = document.getElementById("ai-consent-status");
    if (statusEl) statusEl.innerHTML = "<div class='info'>KI-Zustimmung wurde widerrufen.</div>";
    showNotification("KI-Zustimmung widerrufen.", "info");
}

function showAiConsentDialog(onAccept) {
    if (hasAiConsent()) {
        onAccept();
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "consent-overlay";
    overlay.innerHTML = `
        <div class="consent-dialog">
            <h3>🤖 KI-Nutzung: Zustimmung erforderlich</h3>
            <p>
                Sie sind dabei, eine KI-gestützte Analyse über <strong>Google Gemini</strong> anzufordern.
                Dabei werden technische Kontext-Informationen (Fehlerbeschreibung, Konfigurationsdetails)
                an die Gemini-API übermittelt.
            </p>
            <p>
                <strong>Es werden keine personenbezogenen Daten</strong> (Nutzernamen, IMEI, Secrets)
                an die KI übermittelt. Die Anfrage enthält ausschließlich technische Beschreibungen.
            </p>
            <p>
                Möchten Sie der KI-Nutzung für diese Sitzung zustimmen?
            </p>
            <div class="consent-actions">
                <label class="consent-remember">
                    <input type="checkbox" id="consent-remember-check"> Für künftige Anfragen merken
                </label>
                <div class="consent-buttons">
                    <button class="btn btn-secondary" id="consent-decline">Ablehnen</button>
                    <button class="btn btn-primary" id="consent-accept">Zustimmen & fortfahren</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector("#consent-decline").addEventListener("click", () => {
        overlay.remove();
        showNotification("KI-Anfrage abgebrochen. Keine Daten übermittelt.", "info");
    });

    overlay.querySelector("#consent-accept").addEventListener("click", () => {
        const remember = overlay.querySelector("#consent-remember-check")?.checked;
        if (remember) grantAiConsent();
        overlay.remove();
        onAccept();
    });
}

function renderAiConsentStatus() {
    const statusEl = document.getElementById("ai-consent-status");
    if (!statusEl) return;
    if (hasAiConsent()) {
        statusEl.innerHTML = `<div class="success-box">KI-Zustimmung erteilt. <button class="btn btn-secondary btn-sm" onclick="revokeAiConsent()" style="margin-inline-start:8px">Widerrufen</button></div>`;
    } else {
        statusEl.innerHTML = `<div class="info">Noch keine KI-Zustimmung erteilt. Sie werden bei der ersten Anfrage gefragt.</div>`;
    }
}

async function callAiExplain(problemContext) {
    const responseEl = document.getElementById("ai-explain-response") || document.getElementById("wizard-gemini-response");
    if (responseEl) responseEl.innerHTML = "<div class='loading'>KI analysiert das Problem...</div>";

    try {
        const result = await functions.httpsCallable("aiExplainProblem")({
            problemContext: problemContext,
            consentGiven: true,
        });

        const data = result.data || {};
        const html = `
            <div class="ai-response-card">
                <h5>🤖 KI-Erklärung <span class="ai-provider-badge">${escapeHtml(data.provider || "?")} / ${escapeHtml(data.model || "?")}</span></h5>
                <div class="ai-section">
                    <strong>Erklärung:</strong>
                    <p>${escapeHtml(data.explanation || "Keine Erklärung verfügbar.")}</p>
                </div>
                <div class="ai-section">
                    <strong>Lösungsvorschlag:</strong>
                    <p>${escapeHtml(data.suggestion || "Kein Vorschlag verfügbar.")}</p>
                </div>
            </div>`;
        if (responseEl) responseEl.innerHTML = html;
        return data;
    } catch (error) {
        const errorHtml = `<div class="error">KI-Anfrage fehlgeschlagen: ${escapeHtml(error.message)}</div>`;
        if (responseEl) responseEl.innerHTML = errorHtml;
        return null;
    }
}

function askGeminiAboutStep(wizardId, stepIndex) {
    const wizard = setupWizards[wizardId];
    if (!wizard) return;
    const step = wizard.steps[stepIndex];
    if (!step) return;

    const problemContext = `Einrichtungsschritt: ${step.title}\n\nAnweisung: ${step.instruction.replace(/<[^>]+>/g, "")}\n\nDetails: ${step.detail.replace(/<[^>]+>/g, "")}\n\nDer Betreiber braucht Hilfe bei diesem Schritt der ${wizard.title}. Erkläre was zu tun ist und typische Fehlerquellen.`;

    showAiConsentDialog(() => callAiExplain(problemContext));
}

function askGeminiAboutPlausibility(finding) {
    const problemContext = `Plausibilitätsprüfung hat folgendes gefunden:\n\n${finding}\n\nErkläre das Problem und was konkret zu tun ist, um es zu lösen.`;
    showAiConsentDialog(() => callAiExplain(problemContext));
}

function askGeminiFreiform() {
    const input = document.getElementById("ai-freeform-input");
    if (!input) return;
    const question = input.value.trim();
    if (question.length < 10) {
        showNotification("Bitte mindestens 10 Zeichen eingeben.", "error");
        return;
    }

    const problemContext = `Betreiber-Frage zur MiniMaster-Einrichtung:\n\n${question}`;
    showAiConsentDialog(() => callAiExplain(problemContext));
}

function runPlausibilityWithAiOption() {
    const findings = runPlausibilityCheck();
    if (!findings) return;

    const errors = findings.filter(f => f.severity === "error" || f.severity === "warn");
    if (errors.length > 0) {
        const container = document.getElementById("plausibility-results");
        if (container) {
            const btn = document.createElement("div");
            btn.style.marginBlockStart = "12px";
            btn.innerHTML = `<button class="btn btn-secondary btn-sm" onclick="askGeminiAboutPlausibility('${escapeHtml(errors.map(e => e.text).join("; ").replace(/'/g, "\\'"))}')">🤖 Gemini: Alle Probleme erklären lassen</button>`;
            container.appendChild(btn);
        }
    }
}

function getBootstrapFirebaseFormValues() {
    return {
        apiKey: (document.getElementById("bootstrap-api-key")?.value || "").trim(),
        authDomain: (document.getElementById("bootstrap-auth-domain")?.value || "").trim(),
        projectId: (document.getElementById("bootstrap-project-id")?.value || "").trim(),
        storageBucket: (document.getElementById("bootstrap-storage-bucket")?.value || "").trim(),
        messagingSenderId: (document.getElementById("bootstrap-messaging-sender-id")?.value || "").trim(),
        appId: (document.getElementById("bootstrap-app-id")?.value || "").trim(),
    };
}

function renderBootstrapFirebaseConfig(config) {
    const values = config || firebaseConfig || fallbackFirebaseConfig;
    const mapping = {
        "bootstrap-api-key": values.apiKey || "",
        "bootstrap-auth-domain": values.authDomain || "",
        "bootstrap-project-id": values.projectId || "",
        "bootstrap-storage-bucket": values.storageBucket || "",
        "bootstrap-messaging-sender-id": values.messagingSenderId || "",
        "bootstrap-app-id": values.appId || "",
    };

    Object.entries(mapping).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
    });

    const statusEl = document.getElementById("bootstrap-config-status");
    if (!statusEl) return;
    if (isPlaceholderFirebaseConfig(values)) {
        statusEl.innerHTML = "<div class='error'>Firebase-Webkonfiguration ist noch nicht final hinterlegt. Trage die echten Werte ein und speichere sie lokal.</div>";
    } else {
        statusEl.innerHTML = `<div class='success-box'>Aktive Firebase-Konfiguration: ${escapeHtml(values.projectId || "unbekannt")}</div>`;
    }
}

function persistBootstrapFirebaseConfig(showReloadHint = true) {
    const values = getBootstrapFirebaseFormValues();
    const statusEl = document.getElementById("bootstrap-config-status");

    if (!hasCompleteFirebaseConfig(values) || isPlaceholderFirebaseConfig(values)) {
        if (statusEl) {
            statusEl.innerHTML = "<div class='error'>Alle Firebase-Webwerte müssen gesetzt sein und dürfen keine Platzhalter enthalten.</div>";
        }
        throw new Error("Firebase-Webkonfiguration ist unvollständig oder enthält Platzhalter.");
    }

    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(values));
    firebaseConfig = values;
    updateSetupChecklistState({ "firebase-config": true });

    if (statusEl) {
        statusEl.innerHTML = `<div class='success-box'>Firebase-Webkonfiguration lokal gespeichert für Projekt ${escapeHtml(values.projectId)}.${showReloadHint ? " Seite neu laden, falls du auf ein neues Projekt umstellst." : ""}</div>`;
    }
    return values;
}

function syncCommissioningChecklist(validationSummary) {
    const config = getOperatorConfigFormValues();
    const attestations = getCommissioningAttestations();
    const updates = {
        "firebase-config": !isPlaceholderFirebaseConfig(firebaseConfig),
        "admin-auth": Boolean(validationSummary?.checks?.adminAuthOk),
        "firestore-access": Boolean(validationSummary?.checks?.firestoreAccessOk),
        "functions-access": Boolean(validationSummary?.checks?.functionsReachable),
        "appcheck-active": Boolean(config.cloud.appCheckMode),
        "android-apps": Boolean(attestations["android-master-registered"] && attestations["android-child-registered"]),
        "ai-config": Boolean((config.ai.provider && config.ai.model && config.ai.keyRef && config.ai.systemPrompt) && validationSummary?.checks?.aiConfigured),
        "support-workflow": Boolean(attestations["support-flow-verified"]),
        "compliance-flow": Boolean(attestations["compliance-flow-verified"]),
    };

    if (validationSummary?.errorCount === 0 && attestations["firebase-project-bound"] && attestations["parent-panel-verified"] && attestations["device-sync-verified"] && attestations["storage-rules-verified"]) {
        updates["deploy-verified"] = true;
    }

    updateSetupChecklistState(updates);
    renderSetupChecklist();
}

function buildDeployCommand(projectId) {
    const trimmedProjectId = (projectId || "").trim();
    const base = "firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting";
    return trimmedProjectId ? `${base} --project ${trimmedProjectId}` : base;
}

function renderCommissioningReport(report) {
    const container = document.getElementById("commissioning-report");
    if (!container) return;

    const roleHtml = (report.roleAssignments || []).length > 0
        ? `<ul>${report.roleAssignments.map(item => `<li>${escapeHtml(item.uid)} → ${escapeHtml(item.role)}</li>`).join("")}</ul>`
        : "<p>Keine zusätzlichen Rollen zugewiesen.</p>";

    const attestationLabels = Object.fromEntries(commissioningAttestationItems.map(item => [item.key, item.label]));
    const attestationEntries = Object.entries(report.attestations || {}).filter(([, value]) => Boolean(value));
    const attestationHtml = attestationEntries.length > 0
        ? `<ul>${attestationEntries.map(([key]) => `<li>${escapeHtml(attestationLabels[key] || key)}</li>`).join("")}</ul>`
        : "<p>Noch keine Freigaben bestätigt.</p>";

    const pendingHtml = report.pending.length > 0
        ? `<ul>${report.pending.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : "<p>Keine offenen Inbetriebnahme-Punkte erkannt.</p>";

    container.innerHTML = `
        <div class="commissioning-report ${report.pending.length === 0 ? "commissioning-complete" : ""}">
            <h4>Inbetriebnahmebericht</h4>
            <p><strong>Projekt:</strong> ${escapeHtml(report.projectId || "nicht gesetzt")}</p>
            <p><strong>Firebase-Webkonfiguration:</strong> ${report.firebaseConfigured ? "bereit" : "offen"}</p>
            <p><strong>Parent Web-Control:</strong> ${report.webControlConfigured ? "shared config bereit" : "noch nicht freigegeben"}</p>
            <p><strong>Runtime-Konfiguration:</strong> ${report.runtimeConfigured ? "gespeichert" : "unvollständig"}</p>
            <p><strong>Validierung:</strong> ${report.validationSummary ? `${report.validationSummary.ok} OK, ${report.validationSummary.warn} WARN, ${report.validationSummary.errorCount} ERROR` : "noch nicht ausgeführt"}</p>
            <p><strong>Deploy-Befehl:</strong></p>
            ${renderCommandBlockHtml({
                id: "report-deploy-command",
                label: "Deploy aus Bericht",
                description: "Der aus der Inbetriebnahme ermittelte Voll-Deploy-Befehl.",
                command: report.deployCommand,
                cwd: getCommandBuilderFormValues().workspacePath,
                fileName: "minimaster-report-deploy",
            })}
            <div class="command-actions" style="margin-block-end: 12px;">
                <button onclick="copyRolloutBundleScript('${escapeHtml(report.projectId || "")}')" class="btn btn-secondary btn-sm">Gesamtes Rollout-PS kopieren</button>
                <button onclick="downloadRolloutBundleScript('${escapeHtml(report.projectId || "")}')" class="btn btn-primary btn-sm">Gesamtes Rollout-PS herunterladen</button>
            </div>
            <h5>Zugewiesene Rollen</h5>
            ${roleHtml}
            <h5>Bestätigte Freigaben</h5>
            ${attestationHtml}
            <h5>Offene Punkte</h5>
            ${pendingHtml}
        </div>
    `;
}

async function setUserRoleInternal(uid, role) {
    const setRoleFunc = functions.httpsCallable("setUserRole");
    await setRoleFunc({ uid, role });
}

async function runCommissioningAssistant() {
    const reportEl = document.getElementById("commissioning-report");
    if (reportEl) reportEl.innerHTML = "<div class='loading'>Führe Inbetriebnahme-Assistent aus...</div>";

    const roleAssignments = [];
    const pending = [];

    try {
        const bootstrapConfig = persistBootstrapFirebaseConfig(false);

        const runtimeConfig = getOperatorConfigFormValues();
        if (!runtimeConfig.cloud.projectId) {
            const projectInput = document.getElementById("cfg-cloud-project-id");
            if (projectInput) projectInput.value = bootstrapConfig.projectId;
        }
        await saveOperatorConfig();

        const supportUid = (document.getElementById("commissioning-support-uid")?.value || "").trim();
        const auditorUid = (document.getElementById("commissioning-auditor-uid")?.value || "").trim();

        if (currentUserRole === "admin") {
            if (supportUid) {
                await setUserRoleInternal(supportUid, "support");
                roleAssignments.push({ uid: supportUid, role: "support" });
            }
            if (auditorUid) {
                await setUserRoleInternal(auditorUid, "auditor");
                roleAssignments.push({ uid: auditorUid, role: "auditor" });
            }
        }

        const validationSummary = await runFullSetupValidation();
        const mergedRuntimeConfig = getOperatorConfigFormValues();

        if (!mergedRuntimeConfig.ai.provider || !mergedRuntimeConfig.ai.model || !mergedRuntimeConfig.ai.keyRef || !mergedRuntimeConfig.ai.systemPrompt) {
            pending.push("KI-Konfiguration im Runtime-Block vollständig ausfüllen (provider, model, keyRef, systemPrompt).");
        }
        if (!mergedRuntimeConfig.cloud.appCheckMode) {
            pending.push("App Check Modus im Runtime-Block setzen.");
        }
        if (validationSummary.errorCount > 0) {
            pending.push("Full Validation ohne ERROR abschließen.");
        }
        if (!validationSummary.checks.adminAuthOk) {
            pending.push("Operator mit Admin-Claim anmelden.");
        }
        if (!validationSummary.checks.functionsReachable) {
            pending.push("Backend mit Firebase deployen oder Endpoints prüfen.");
        }
        if (!validationSummary.checks.storageHealthOk) {
            pending.push("Storage-Bucket und Admin-Zugriff prüfen.");
        }
        if (!validationSummary.checks.webControlConfigReady) {
            pending.push("Gemeinsame Firebase-Konfiguration für das Parent Web Panel bereitstellen.");
        }

        getMissingAttestations().forEach(item => {
            pending.push(`Manuelle Freigabe offen: ${item}`);
        });

        commissioningSummary = {
            projectId: bootstrapConfig.projectId || mergedRuntimeConfig.cloud.projectId,
            firebaseConfigured: !isPlaceholderFirebaseConfig(bootstrapConfig),
            webControlConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
            runtimeConfigured: Boolean(mergedRuntimeConfig.cloud.projectId && mergedRuntimeConfig.ai.provider && mergedRuntimeConfig.ai.model),
            validationSummary,
            deployCommand: buildDeployCommand(bootstrapConfig.projectId || mergedRuntimeConfig.cloud.projectId),
            roleAssignments,
            attestations: getCommissioningAttestations(),
            pending,
        };

        renderCommissioningReport(commissioningSummary);
        renderCommandCatalog(commissioningSummary.projectId);
        syncCommissioningChecklist(validationSummary);
        renderGoLiveAmpel();
        showNotification(pending.length === 0 ? "Inbetriebnahme-Assistent erfolgreich abgeschlossen." : "Inbetriebnahme-Assistent ausgeführt. Offene Punkte im Bericht prüfen.", pending.length === 0 ? "success" : "info");
    } catch (error) {
        if (reportEl) {
            reportEl.innerHTML = `<div class='error'>Inbetriebnahme fehlgeschlagen: ${escapeHtml(error.message)}</div>`;
        }
        showNotification("Inbetriebnahme-Assistent fehlgeschlagen: " + error.message, "error");
    }
}

function refreshCommissioningReport() {
    const runtimeConfig = getOperatorConfigFormValues();
    const pending = [];
    const missingAttestations = getMissingAttestations();
    if (isPlaceholderFirebaseConfig(firebaseConfig)) pending.push("Firebase-Webkonfiguration lokal speichern.");
    if (!runtimeConfig.cloud.projectId) pending.push("Cloud Project ID setzen.");
    if (!runtimeConfig.ai.provider || !runtimeConfig.ai.model || !runtimeConfig.ai.keyRef || !runtimeConfig.ai.systemPrompt) {
        pending.push("KI-Runtime-Konfiguration vervollständigen.");
    }
    if (commissioningSummary?.validationSummary?.checks && !commissioningSummary.validationSummary.checks.storageHealthOk) {
        pending.push("Storage Health im Backend prüfen.");
    }
    if (commissioningSummary?.validationSummary?.checks && !commissioningSummary.validationSummary.checks.webControlConfigReady) {
        pending.push("Gemeinsame Konfiguration für web-control fehlt.");
    }
    missingAttestations.forEach(item => pending.push(`Manuelle Freigabe offen: ${item}`));

    commissioningSummary = {
        projectId: runtimeConfig.cloud.projectId || firebaseConfig.projectId,
        firebaseConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
        webControlConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
        runtimeConfigured: Boolean(runtimeConfig.cloud.projectId && runtimeConfig.ai.provider && runtimeConfig.ai.model),
        validationSummary: commissioningSummary?.validationSummary || null,
        deployCommand: buildDeployCommand(runtimeConfig.cloud.projectId || firebaseConfig.projectId),
        roleAssignments: commissioningSummary?.roleAssignments || [],
        attestations: getCommissioningAttestations(),
        pending,
    };

    renderCommissioningReport(commissioningSummary);
    renderCommandCatalog(commissioningSummary.projectId);
    renderGoLiveAmpel();
}

document.addEventListener("DOMContentLoaded", function() {
    renderBootstrapFirebaseConfig(firebaseConfig);
    renderCommandBuilderConfig(loadCommandBuilderConfig());
    renderCommandCatalog(firebaseConfig.projectId);
    renderAllPlatformSections();
    renderGoLiveAmpel();

    // Operator-Desktop-Modus Badge anzeigen
    if (isElectronOperator) {
        const badge = document.getElementById("electron-operator-badge");
        if (badge) badge.style.display = "block";
    }

    if (isPlaceholderFirebaseConfig(firebaseConfig)) {
        console.warn("Firebase config placeholders detected. Waiting for bootstrap configuration.");
        updateOnboardingStepper(1);
        return;
    }

    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions();

        // Setup login form submission
        document.getElementById("login-form").addEventListener("submit", handleLogin);

        // Setup registration form submission
        const registerForm = document.getElementById("register-form");
        if (registerForm) {
            registerForm.addEventListener("submit", handleRegistration);
        }

        // Check authentication state
        auth.onAuthStateChanged(user => {
            if (user) {
                user.getIdTokenResult(true).then(idTokenResult => {
                    const role = idTokenResult.claims.role;
                    if (role === "admin" || role === "support" || role === "auditor") {
                        currentUserRole = role;
                        showDashboard(user);
                        applyRoleRestrictions(role);
                        loadDashboardData();
                        if (role === "admin") initializeSetupAssistant();
                    } else {
                        // User is authenticated but has no operator role -> show phase 3
                        showAdminActivationPhase(user);
                    }
                });
            } else {
                currentUserRole = null;
                showOnboarding();
            }
        });

        // Show phase 2 since Firebase is configured
        updateOnboardingStepper(2);
        showOnboardingPhase(2);

        console.log("Firebase initialized successfully.");
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showNotification("Firebase-Konfigurationsfehler. Bitte Einrichtung prüfen.", "error");
    }
});

// ==================== ONBOARDING FLOW ====================

function updateOnboardingStepper(activeStep) {
    for (let i = 1; i <= 3; i++) {
        const stepEl = document.getElementById("stepper-step-" + i);
        const lineEl = document.getElementById("stepper-line-" + (i - 1));
        if (stepEl) {
            stepEl.classList.remove("active", "done");
            if (i < activeStep) stepEl.classList.add("done");
            else if (i === activeStep) stepEl.classList.add("active");
        }
        if (lineEl) {
            lineEl.classList.remove("done");
            if (i <= activeStep - 1) lineEl.classList.add("done");
        }
    }
}

function showOnboardingPhase(phase) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById("onboarding-phase-" + i);
        if (el) el.style.display = i === phase ? "block" : "none";
    }
}

function showAuthMode(mode) {
    const registerForm = document.getElementById("register-form");
    const loginForm = document.getElementById("login-form");
    const toggleRegister = document.getElementById("toggle-register");
    const toggleLogin = document.getElementById("toggle-login");

    if (mode === "register") {
        registerForm.style.display = "flex";
        loginForm.style.display = "none";
        toggleRegister.classList.add("active");
        toggleLogin.classList.remove("active");
    } else {
        registerForm.style.display = "none";
        loginForm.style.display = "flex";
        toggleRegister.classList.remove("active");
        toggleLogin.classList.add("active");
    }
}

function showOnboarding() {
    document.getElementById("onboarding-section").style.display = "block";
    document.getElementById("dashboard-section").style.display = "none";
    document.getElementById("dashboard-nav").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("user-email").textContent = "";

    if (!isPlaceholderFirebaseConfig(firebaseConfig)) {
        updateOnboardingStepper(2);
        showOnboardingPhase(2);
    } else {
        updateOnboardingStepper(1);
        showOnboardingPhase(1);
    }
}

function showAdminActivationPhase(user) {
    document.getElementById("onboarding-section").style.display = "block";
    document.getElementById("dashboard-section").style.display = "none";
    document.getElementById("dashboard-nav").style.display = "none";
    document.getElementById("logout-btn").style.display = "inline-block";
    document.getElementById("user-email").textContent = user.email || "";

    updateOnboardingStepper(3);
    showOnboardingPhase(3);
    renderAdminActivationContent(user);
}

function renderAdminActivationContent(user) {
    const container = document.getElementById("admin-activation-content");
    if (!container) return;

    container.innerHTML = `
        <div class="admin-info-box">
            <h4>Ihr Konto: ${escapeHtml(user.email || "")}</h4>
            <p>
                Sie sind angemeldet, besitzen aber noch keine Operator-Berechtigung.
                Um das Dashboard nutzen zu können, muss Ihrem Konto die Rolle
                <strong>admin</strong>, <strong>support</strong> oder <strong>auditor</strong> zugewiesen werden.
            </p>
        </div>

        <div class="admin-info-box" style="background: #f8fafc; border-color: #e2e8f0;">
            <h4>So erhalten Sie Admin-Zugang</h4>
            <p><strong>Ersteinrichtung (noch kein Admin vorhanden):</strong></p>
            <ol>
                <li>Öffnen Sie ein Terminal im MiniMaster-Projektordner</li>
                <li>Führen Sie folgenden Befehl aus:<br>
                    <code style="background:#0f172a;color:#e2e8f0;padding:4px 8px;border-radius:4px;display:inline-block;margin-block-start:4px">node scripts/setup-admin.js ${escapeHtml(user.email || "ihre@email.de")} IhrPasswort</code>
                </li>
                <li>Kehren Sie zum Dashboard zurück und klicken Sie auf <strong>Zugang prüfen</strong></li>
            </ol>
            <p style="margin-block-start: 12px"><strong>Zusätzlicher Operator (Admin existiert bereits):</strong></p>
            <ol>
                <li>Bitten Sie den vorhandenen Admin, im Dashboard unter <em>Einrichtung → Rollenverwaltung</em> Ihre UID einzutragen</li>
                <li>Ihre UID: <code style="background:#0f172a;color:#e2e8f0;padding:2px 6px;border-radius:4px">${escapeHtml(user.uid)}</code></li>
            </ol>
        </div>

        <div class="admin-waiting-hint">
            <span style="font-size:1.3rem">⏳</span>
            <p>
                Nachdem die Berechtigung gesetzt wurde, klicken Sie auf <strong>Zugang prüfen</strong>,
                um Ihren Status neu zu laden. Es kann einige Sekunden dauern, bis die Änderung wirksam wird.
            </p>
        </div>

        <div class="phase-actions" style="margin-block-start: 16px">
            <button onclick="recheckAdminAccess()" class="btn btn-primary">Zugang prüfen</button>
            <button onclick="logout()" class="btn btn-secondary">Abmelden</button>
        </div>
    `;
}

async function recheckAdminAccess() {
    const statusEl = document.getElementById("admin-activation-status");
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Prüfe Berechtigung...</div>";

    try {
        const user = auth.currentUser;
        if (!user) {
            if (statusEl) statusEl.innerHTML = "<div class='error'>Nicht angemeldet.</div>";
            return;
        }

        // Force token refresh
        const idTokenResult = await user.getIdTokenResult(true);
        const role = idTokenResult.claims.role;

        if (role === "admin" || role === "support" || role === "auditor") {
            if (statusEl) {
                statusEl.innerHTML = `<div class="admin-success-box">
                    <h4>✅ Berechtigung bestätigt!</h4>
                    <p>Rolle: <strong>${escapeHtml(role.toUpperCase())}</strong></p>
                    <button onclick="window.location.reload()" class="btn btn-primary">Dashboard öffnen</button>
                </div>`;
            }
        } else {
            if (statusEl) {
                statusEl.innerHTML = "<div class='error'>Noch keine Operator-Rolle zugewiesen. Bitte führen Sie die oben beschriebenen Schritte aus.</div>";
            }
        }
    } catch (error) {
        if (statusEl) statusEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== REGISTRATION ====================

async function handleRegistration(event) {
    event.preventDefault();

    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const passwordConfirm = document.getElementById("register-password-confirm").value;
    const statusEl = document.getElementById("register-status");
    const submitBtn = document.getElementById("register-submit-btn");

    if (password !== passwordConfirm) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Die Passwörter stimmen nicht überein.</div>";
        return;
    }

    if (password.length < 8) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Das Passwort muss mindestens 8 Zeichen lang sein.</div>";
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Wird erstellt...";
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Konto wird erstellt...</div>";

    try {
        await auth.createUserWithEmailAndPassword(email, password);
        // onAuthStateChanged will handle the transition to phase 3
        if (statusEl) statusEl.innerHTML = "<div class='success-box'>Konto erfolgreich erstellt!</div>";
    } catch (error) {
        let msg = error.message;
        if (error.code === "auth/email-already-in-use") {
            msg = "Diese E-Mail-Adresse wird bereits verwendet. Bitte melden Sie sich stattdessen an.";
        } else if (error.code === "auth/weak-password") {
            msg = "Das Passwort ist zu schwach. Verwenden Sie mindestens 8 Zeichen mit Buchstaben und Zahlen.";
        } else if (error.code === "auth/invalid-email") {
            msg = "Die E-Mail-Adresse ist ungültig.";
        }
        if (statusEl) statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Konto erstellen";
    }
}

// ==================== AUTHENTICATION ====================

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const statusEl = document.getElementById("login-status");

    if (statusEl) statusEl.innerHTML = "<div class='loading'>Anmeldung...</div>";

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            if (statusEl) statusEl.innerHTML = "";
        })
        .catch(error => {
            let msg = error.message;
            if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                msg = "E-Mail oder Passwort ungültig.";
            } else if (error.code === "auth/too-many-requests") {
                msg = "Zu viele Versuche. Bitte warten Sie einen Moment.";
            }
            if (statusEl) statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>`;
        });
}

function logout() {
    auth.signOut();
}

function showLogin() {
    showOnboarding();
}

function showDashboard(user) {
    document.getElementById("onboarding-section").style.display = "none";
    document.getElementById("dashboard-section").style.display = "block";
    document.getElementById("dashboard-nav").style.display = "flex";
    document.getElementById("logout-btn").style.display = "inline-block";
    const roleLabel = currentUserRole ? ` (${currentUserRole.toUpperCase()})` : "";
    document.getElementById("user-email").textContent = (user.email || "") + roleLabel;
}

/**
 * Controls tab visibility based on operator role.
 * - admin: all tabs
 * - support: Overview, Support Tickets
 * - auditor: Overview, Compliance, Error Logs
 */
function applyRoleRestrictions(role) {
    const tabAccess = {
        admin: ["overview", "users", "devices", "subscriptions", "pairing", "support", "errorlogs", "compliance", "setup"],
        support: ["overview", "support"],
        auditor: ["overview", "errorlogs", "compliance"]
    };

    const allowed = tabAccess[role] || [];
    document.querySelectorAll(".nav-tab").forEach(btn => {
        const onclickAttr = btn.getAttribute("onclick") || "";
        const match = onclickAttr.match(/switchTab\('(\w+)'/);
        if (match) {
            const tabName = match[1];
            btn.style.display = allowed.includes(tabName) ? "" : "none";
        }
    });

    // Hide admin-only action buttons for non-admins
    if (role !== "admin") {
        document.querySelectorAll(".admin-only").forEach(el => { el.style.display = "none"; });
    }
}

// ==================== TAB NAVIGATION ====================

function switchTab(tabName, evt) {
    // Hide all tabs
    document.querySelectorAll(".tab-content").forEach(tab => {
        tab.style.display = "none";
    });
    // Remove active from all nav buttons
    document.querySelectorAll(".nav-tab").forEach(btn => {
        btn.classList.remove("active");
    });
    // Show selected tab
    document.getElementById("tab-" + tabName).style.display = "block";
    // Set active button
    if (evt && evt.target) {
        evt.target.classList.add("active");
    }
}

// ==================== CLOUD SETUP & OPERATOR ASSISTANT ====================

function initializeSetupAssistant() {
    renderSetupChecklist();
    renderCommissioningAttestations();
    renderAllPlatformSections();
    renderAiConsentStatus();
    renderBootstrapFirebaseConfig(firebaseConfig);
    renderCommandBuilderConfig(loadCommandBuilderConfig());
    loadOperatorConfig();
    refreshCommissioningReport();
    renderCommandCatalog(firebaseConfig.projectId);
    renderGoLiveAmpel();

    const assistantInput = document.getElementById("assistant-input");
    if (assistantInput) {
        assistantInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                askOperatorAssistant();
            }
        });
    }
}

function renderSetupChecklist() {
    const checklistEl = document.getElementById("setup-checklist");
    if (!checklistEl) return;

    const savedState = JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}");
    checklistEl.innerHTML = "";

    setupChecklistItems.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "setup-checklist-item";
        wrapper.innerHTML = `
            <input type="checkbox" id="setup-${item.key}" ${savedState[item.key] ? "checked" : ""}>
            <label for="setup-${item.key}">${item.label}</label>
        `;

        const checkbox = wrapper.querySelector("input");
        checkbox.addEventListener("change", (e) => {
            const state = JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}");
            state[item.key] = e.target.checked;
            localStorage.setItem("operatorSetupChecklist", JSON.stringify(state));
        });

        checklistEl.appendChild(wrapper);
    });
}

function getOperatorConfigDocRef() {
    return db.collection("operatorConfig").doc("global");
}

function getOperatorConfigFormValues() {
    const tempValue = parseFloat(document.getElementById("cfg-ai-temperature")?.value || "0.3");

    return {
        cloud: {
            projectId: (document.getElementById("cfg-cloud-project-id")?.value || "").trim(),
            region: (document.getElementById("cfg-cloud-region")?.value || "").trim(),
            appCheckMode: (document.getElementById("cfg-cloud-appcheck")?.value || "").trim(),
            releaseChannel: (document.getElementById("cfg-cloud-release-channel")?.value || "").trim()
        },
        ai: {
            provider: (document.getElementById("cfg-ai-provider")?.value || "").trim(),
            model: (document.getElementById("cfg-ai-model")?.value || "").trim(),
            temperature: Number.isFinite(tempValue) ? tempValue : 0.3,
            endpoint: (document.getElementById("cfg-ai-endpoint")?.value || "").trim(),
            keyRef: (document.getElementById("cfg-ai-key-ref")?.value || "").trim(),
            systemPrompt: (document.getElementById("cfg-ai-system-prompt")?.value || "").trim()
        }
    };
}

function renderOperatorConfig(config, loadedAt) {
    const merged = {
        cloud: { ...defaultOperatorConfig.cloud, ...(config?.cloud || {}) },
        ai: { ...defaultOperatorConfig.ai, ...(config?.ai || {}) }
    };

    document.getElementById("cfg-cloud-project-id").value = merged.cloud.projectId || "";
    document.getElementById("cfg-cloud-region").value = merged.cloud.region || "";
    document.getElementById("cfg-cloud-appcheck").value = merged.cloud.appCheckMode || "";
    document.getElementById("cfg-cloud-release-channel").value = merged.cloud.releaseChannel || "";

    document.getElementById("cfg-ai-provider").value = merged.ai.provider || "";
    document.getElementById("cfg-ai-model").value = merged.ai.model || "";
    document.getElementById("cfg-ai-temperature").value = String(merged.ai.temperature ?? 0.3);
    document.getElementById("cfg-ai-endpoint").value = merged.ai.endpoint || "";
    document.getElementById("cfg-ai-key-ref").value = merged.ai.keyRef || "";
    document.getElementById("cfg-ai-system-prompt").value = merged.ai.systemPrompt || "";

    const status = document.getElementById("operator-config-status");
    if (status) {
        status.innerHTML = `<div class='info'>Konfiguration geladen (${loadedAt ? new Date(loadedAt).toLocaleString() : "lokale Defaults"}).</div>`;
    }
}

async function loadOperatorConfig() {
    const status = document.getElementById("operator-config-status");
    if (status) status.innerHTML = "<div class='loading'>Lade Konfiguration...</div>";

    try {
        const doc = await getOperatorConfigDocRef().get();
        const data = doc.exists ? doc.data() : defaultOperatorConfig;
        const loadedAt = doc.exists && data.updatedAt?.seconds ? data.updatedAt.seconds * 1000 : null;
        renderOperatorConfig(data, loadedAt);
        if (!doc.exists) {
            showNotification("Keine gespeicherte Konfiguration gefunden. Standardwerte werden verwendet.", "success");
        }
    } catch (error) {
        if (status) status.innerHTML = `<div class='error'>Fehler beim Laden: ${escapeHtml(error.message)}</div>`;
        showNotification("Konfiguration konnte nicht geladen werden: " + error.message, "error");
    }
}

async function saveOperatorConfig() {
    const status = document.getElementById("operator-config-status");
    if (status) status.innerHTML = "<div class='loading'>Speichere Konfiguration...</div>";

    try {
        const values = getOperatorConfigFormValues();
        await getOperatorConfigDocRef().set({
            ...values,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: auth.currentUser ? auth.currentUser.uid : "unknown"
        }, { merge: true });

        if (status) {
            status.innerHTML = "<div class='success-box'>Konfiguration erfolgreich gespeichert.</div>";
        }
        refreshCommissioningReport();
        renderCommandCatalog(values.cloud.projectId || firebaseConfig.projectId);
        showNotification("Operator-Konfiguration gespeichert.", "success");
    } catch (error) {
        if (status) status.innerHTML = `<div class='error'>Fehler beim Speichern: ${escapeHtml(error.message)}</div>`;
        showNotification("Konfiguration konnte nicht gespeichert werden: " + error.message, "error");
    }
}

function testAiConfiguration() {
    const status = document.getElementById("operator-config-status");
    const values = getOperatorConfigFormValues();
    const isValid = Boolean(values.ai.provider && values.ai.model && values.ai.systemPrompt && values.ai.keyRef);

    if (!status) return;

    if (!isValid) {
        status.innerHTML = "<div class='error'>KI-Test fehlgeschlagen: provider, model, keyRef und systemPrompt sind erforderlich.</div>";
        showNotification("KI-Konfigurationstest fehlgeschlagen.", "error");
        return;
    }

    const preview = `${values.ai.provider}/${values.ai.model}, temp=${values.ai.temperature}`;
    status.innerHTML = `<div class='success-box'>KI-Konfiguration valide. Test-Payload: ${escapeHtml(preview)}</div>`;
    showNotification("KI-Konfiguration sieht gültig aus.", "success");
}

async function runFullSetupValidation() {
    const resultEl = document.getElementById("setup-check-results");
    if (!resultEl) return;

    resultEl.innerHTML = "<div class='loading'>Running validation...</div>";
    setupValidationResults = [];

    // Check 1: Firebase config placeholders
    const placeholderConfig = isPlaceholderFirebaseConfig(firebaseConfig);
    setupValidationResults.push({
        check: "Firebase Configuration",
        status: placeholderConfig ? "error" : "ok",
        message: placeholderConfig
            ? "Shared Firebase bootstrap config is still missing."
            : "Firebase bootstrap config appears configured for both panels."
    });

    // Check 2: Auth + Admin claim
    try {
        const user = auth.currentUser;
        if (!user) {
            setupValidationResults.push({
                check: "Admin Authentication",
                status: "error",
                message: "No authenticated operator session."
            });
        } else {
            const token = await user.getIdTokenResult(true);
            const isAdmin = token.claims.role === "admin";
            setupValidationResults.push({
                check: "Admin Authentication",
                status: isAdmin ? "ok" : "error",
                message: isAdmin ? "Admin claim verified." : "User authenticated but no admin claim."
            });
        }
    } catch (error) {
        setupValidationResults.push({
            check: "Admin Authentication",
            status: "error",
            message: "Failed to verify admin claim: " + error.message
        });
    }

    // Check 3: Firestore core collections
    const collectionsToCheck = ["masters", "children", "supportTickets", "audit_logs"];
    for (const collectionName of collectionsToCheck) {
        try {
            await db.collection(collectionName).limit(1).get();
            setupValidationResults.push({
                check: `Firestore Collection (${collectionName})`,
                status: "ok",
                message: "Read access confirmed."
            });
        } catch (error) {
            setupValidationResults.push({
                check: `Firestore Collection (${collectionName})`,
                status: "error",
                message: "Access failed: " + error.message
            });
        }
    }

    // Check 3b: Runtime configuration document
    try {
        await getOperatorConfigDocRef().get();
        setupValidationResults.push({
            check: "Runtime Configuration (operatorConfig/global)",
            status: "ok",
            message: "Configuration document readable."
        });
    } catch (error) {
        setupValidationResults.push({
            check: "Runtime Configuration (operatorConfig/global)",
            status: "error",
            message: "Could not read config document: " + error.message
        });
    }

    // Check 3c: Shared configuration for web-control
    setupValidationResults.push({
        check: "Shared Web-Control Firebase Config",
        status: isPlaceholderFirebaseConfig(firebaseConfig) ? "error" : "ok",
        message: isPlaceholderFirebaseConfig(firebaseConfig)
            ? "Shared Firebase bootstrap config is still missing."
            : "Admin panel and web-control can use the same bootstrap config."
    });

    // Check 3d: Backend health and prerequisites
    try {
        const healthResult = await functions.httpsCallable("adminHealthCheck")({});
        const data = healthResult.data || {};
        const storageStatus = data.prerequisites?.storage || "unknown";
        const ai = data.prerequisites?.ai || {};

        setupValidationResults.push({
            check: "Backend Storage Health",
            status: String(storageStatus).startsWith("ok") ? "ok" : "error",
            message: String(storageStatus).startsWith("ok")
                ? `Bucket erreichbar (${data.prerequisites?.storageBucket || "unbekannt"}).`
                : String(storageStatus)
        });

        setupValidationResults.push({
            check: "AI Secret Configuration",
            status: (ai.geminiConfigured || ai.openAiConfigured) ? "ok" : "warn",
            message: (ai.geminiConfigured || ai.openAiConfigured)
                ? `Backend-KI konfiguriert (Gemini: ${Boolean(ai.geminiConfigured)}, OpenAI: ${Boolean(ai.openAiConfigured)}).`
                : "Keine produktiven KI-Secrets im Backend erkannt."
        });
    } catch (error) {
        setupValidationResults.push({
            check: "Backend Storage Health",
            status: "error",
            message: "adminHealthCheck failed: " + error.message
        });
    }

    // Check 4: Callable functions reachability (safe, no destructive side effects)
    const functionChecks = [
        { name: "getSubscriptionStatus", payload: {} },
        { name: "validatePairingCode", payload: { pairingCode: "000000" } },
        { name: "exportUserData", payload: { masterId: "health-check" } },
    ];

    for (const fn of functionChecks) {
        try {
            await functions.httpsCallable(fn.name)(fn.payload);
            setupValidationResults.push({
                check: `Function (${fn.name})`,
                status: "ok",
                message: "Function call succeeded."
            });
        } catch (error) {
            const exists =
                !String(error.message || "").includes("not-found") &&
                !String(error.message || "").includes("NOT_FOUND");
            setupValidationResults.push({
                check: `Function (${fn.name})`,
                status: exists ? "warn" : "error",
                message: exists
                    ? "Function reachable but returned business/auth error (expected in safe health-check mode)."
                    : "Function endpoint not found."
            });
        }
    }

    // Render results
    let ok = 0;
    let warn = 0;
    let errorCount = 0;
    let html = "<table><tr><th>Check</th><th>Status</th><th>Details</th></tr>";
    setupValidationResults.forEach(result => {
        if (result.status === "ok") ok++;
        if (result.status === "warn") warn++;
        if (result.status === "error") errorCount++;
        const className = result.status === "ok" ? "check-ok" : (result.status === "warn" ? "check-warn" : "check-error");
        html += `<tr><td>${result.check}</td><td><span class="${className}">${result.status.toUpperCase()}</span></td><td>${escapeHtml(result.message)}</td></tr>`;
    });
    html += "</table>";
    html += `<div style="margin-block-start: 10px;"><strong>Summary:</strong> ${ok} OK, ${warn} WARN, ${errorCount} ERROR</div>`;

    resultEl.innerHTML = html;
    const summary = {
        ok,
        warn,
        errorCount,
        checks: {
            adminAuthOk: setupValidationResults.some(result => result.check === "Admin Authentication" && result.status === "ok"),
            firestoreAccessOk: setupValidationResults.filter(result => result.check.startsWith("Firestore Collection")).every(result => result.status === "ok"),
            functionsReachable: setupValidationResults.filter(result => result.check.startsWith("Function (")).every(result => result.status === "ok" || result.status === "warn"),
            storageHealthOk: setupValidationResults.some(result => result.check === "Backend Storage Health" && result.status === "ok"),
            aiConfigured: setupValidationResults.some(result => result.check === "AI Secret Configuration" && result.status === "ok"),
            webControlConfigReady: setupValidationResults.some(result => result.check === "Shared Web-Control Firebase Config" && result.status === "ok"),
        },
    };
    syncCommissioningChecklist(summary);
    showNotification("Validierung abgeschlossen.", errorCount > 0 ? "error" : "success");
    return summary;
}

function exportSetupReport() {
    const checklistState = JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}");
    const report = {
        generatedAt: new Date().toISOString(),
        environment: {
            userAgent: navigator.userAgent,
            projectId: firebaseConfig.projectId || null
        },
        checklist: checklistState,
        attestations: getCommissioningAttestations(),
        validationResults: setupValidationResults,
        commissioningSummary,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operator_setup_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification("Einrichtungsbericht exportiert.", "success");
}

function saveBootstrapFirebaseConfig() {
    try {
        persistBootstrapFirebaseConfig(true);
        refreshCommissioningReport();
        renderCommandCatalog(firebaseConfig.projectId);
        showNotification("Firebase-Webkonfiguration lokal gespeichert.", "success");
    } catch (error) {
        showNotification(error.message, "error");
    }
}

function reloadWithBootstrapConfig() {
    try {
        persistBootstrapFirebaseConfig(false);
        window.location.reload();
    } catch (error) {
        showNotification(error.message, "error");
    }
}

function askOperatorAssistant() {
    const input = document.getElementById("assistant-input");
    const chat = document.getElementById("assistant-chat");
    if (!input || !chat) return;

    const question = input.value.trim();
    if (!question) return;

    appendAssistantMessage(question, "user");
    input.value = "";

    const answer = generateOperatorAssistantAnswer(question);
    appendAssistantMessage(answer, "assistant");
}

function appendAssistantMessage(text, role) {
    const chat = document.getElementById("assistant-chat");
    if (!chat) return;

    const msg = document.createElement("div");
    msg.className = `assistant-msg ${role}`;
    msg.innerHTML = escapeHtml(text);
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
}

function generateOperatorAssistantAnswer(question) {
    const q = question.toLowerCase();

    if (q.includes("admin") || q.includes("claim") || q.includes("rolle")) {
        return "Admin-Rechte prüfen: 1) Mit Operator-User einloggen, 2) Full Validation starten, 3) Check 'Admin Authentication' muss OK sein. Falls ERROR: setAdminClaim-Funktion ausführen und Token neu laden.";
    }

    if (q.includes("firebase") || q.includes("config") || q.includes("projekt")) {
        return "Firebase-Integration: Im Inbetriebnahme-Assistenten die Bootstrap-Felder ausfüllen, lokal speichern und bei Projektwechsel neu laden. Danach Runtime-Konfiguration sichern und Full Validation ausführen.";
    }

    if (q.includes("inbetriebnahme") || q.includes("go live") || q.includes("deploy") || q.includes("rollout")) {
        return "Inbetriebnahme im Panel: 1) Firebase-Bootstrap eintragen, 2) Runtime-Konfiguration speichern, 3) optionale Support/Auditor-Rollen zuweisen, 4) Assistent ausführen, 5) Full Validation ohne ERROR abschließen, 6) Deploy-Befehl aus dem Bericht verwenden.";
    }

    if (q.includes("function") || q.includes("callable") || q.includes("cloud function")) {
        return "Cloud Functions prüfen: Full Validation ausführen. Wenn Function-Checks NOT_FOUND zeigen, zuerst Backend deployen (firebase deploy --only functions). Bei WARN ist Endpoint erreichbar, aber Business/Auth-Fehler im Health-Check erwartbar.";
    }

    if (q.includes("firestore") || q.includes("berechtigung") || q.includes("permission") || q.includes("rules")) {
        return "Firestore-Integration: Checks auf masters/children/supportTickets/audit_logs müssen OK sein. Bei Permission-Fehlern Firestore Rules und Admin-Claims prüfen; zusätzlich sicherstellen, dass der Operator wirklich mit einem Admin-User eingeloggt ist.";
    }

    if (q.includes("support") || q.includes("ticket") || q.includes("ki")) {
        return "Support-Workflow: 1) Ticketliste laden, 2) Ticketdetail öffnen, 3) Admin-Response speichern, 4) Statuswechsel testen (in_progress/closed). KI-Antworten im Ticketdetail samt Confidence prüfen und dokumentieren.";
    }

    if (q.includes("konfiguration") || q.includes("configuration") || q.includes("runtime") || q.includes("cloud-dienst")) {
        return "Runtime-Konfiguration: Im Tab 'Cloud Integration & Operator Assistant' den Block 'Runtime Configuration (Cloud + KI)' nutzen. Erst Konfiguration laden, dann Cloud- und KI-Felder pflegen, speichern und mit 'Test KI-Konfiguration' plausibilisieren.";
    }

    if (q.includes("compliance") || q.includes("dsar") || q.includes("audit")) {
        return "Compliance-Flow: DSAR Export für Test-Master auslösen, Audit-Logs für Zeitraum exportieren, Ergebnisse archivieren. Danach Setup-Report exportieren und als Betriebsnachweis ablegen.";
    }

    if (q.includes("gerät") || q.includes("device") || q.includes("child") || q.includes("kind")) {
        return "Geräte-Übersicht: Im Tab 'Geräte' werden alle verbundenen Kinderhandys angezeigt – mit Online-Ampel, Lock-Status, Blacklist-Anzahl und FCM-Token-Status. Im Detail-Modal findet man Tasks, Usage-History und App-Blacklist pro Gerät.";
    }

    if (q.includes("pairing") || q.includes("kopplung") || q.includes("code") || q.includes("token")) {
        return "Pairing-Übersicht: Im Tab 'Pairing' sieht man alle Pairing-Codes (6-stellig, 24h gültig) und Pairing-Tokens (UUID, 5 Min gültig). Abgelaufene Einträge werden markiert. Filter nach Codes/Tokens/Alle möglich.";
    }

    if (q.includes("error") || q.includes("fehler") || q.includes("log")) {
        return "Error Logs: Im Tab 'Error Logs' kann man nach Funktionsnamen, Fehlermeldung und Datum suchen. Jeder Eintrag zeigt Funktion, Nachricht, User-ID und Schweregrad. Paginated mit 25 Einträgen pro Seite.";
    }

    if (q.includes("performance") || q.includes("metrik") || q.includes("geschwindigkeit")) {
        return "Performance: In der Übersicht werden die letzten 20 Performance-Metriken (Funktionsname, Dauer, Status) angezeigt. Bei hoher Latenz die betroffene Cloud Function auf Optimierungspotenzial prüfen.";
    }

    if (q.includes("subscription") || q.includes("abo") || q.includes("ablauf") || q.includes("trial")) {
        return "Subscriptions: In der Übersicht werden Warnungen für ablaufende Trials (<7 Tage) und Abos angezeigt. Im User-Detail sind alle Abo-Infos sichtbar: Typ, Start, Ablauf, Kinderlimit, Purchase-Token. SKUs: single_child_monthly (€1.99), family_monthly (€4.99), single_child_yearly (€19.99), family_yearly (€49.99).";
    }

    return "Empfohlener Ablauf: 1) Full Validation starten, 2) Fehler zuerst in Firebase-Config/Claims beheben, 3) Firestore/Functions erneut prüfen, 4) Support- und Compliance-Workflow testweise durchlaufen, 5) Setup-Report exportieren.";
}

// ==================== DATA LOADING ====================

function loadDashboardData() {
    loadStats();
    loadUsers();
    loadSubscriptions();
    loadSupportTickets();
    loadDevices();
}

function refreshAllStats() {
    loadStats();
    loadPerformanceMetrics();
    loadSubscriptionWarnings();
    showNotification("Statistics refreshed.", "success");
}

function loadStats() {
    // Show loading indicators
    const statIds = ["stat-total-users", "stat-current-revenue", "stat-active-subs", "stat-total-tasks", "stat-open-tickets", "stat-total-children", "stat-errors-24h"];
    statIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "<span class='loading-spinner'></span>";
    });

    // 1. Total Users (Masters)
    db.collection("masters").get().then(snapshot => {
        document.getElementById("stat-total-users").textContent = snapshot.size;

        // Count trial users
        let trialCount = 0;
        snapshot.forEach(doc => {
            const sub = doc.data().subscription;
            if (sub && sub.status === "trial") trialCount++;
        });
        const trialEl = document.getElementById("stat-trial-users");
        if (trialEl) trialEl.textContent = trialCount;
    }).catch(() => {
        document.getElementById("stat-total-users").textContent = "Error";
    });

    // 2. Active Subscriptions
    db.collection("masters").where("subscription.status", "==", "active").get().then(snapshot => {
        document.getElementById("stat-active-subs").textContent = snapshot.size;

        // 2b. Current Revenue (monthly recurring approximation)
        let monthlyRevenue = 0;
        snapshot.forEach(doc => {
            const subscriptionType = doc.data().subscription?.type || "";

            if (subscriptionType === "single_child_monthly") monthlyRevenue += 1.99;
            else if (subscriptionType === "family_monthly") monthlyRevenue += 4.99;
            else if (subscriptionType === "single_child_yearly") monthlyRevenue += 19.99 / 12;
            else if (subscriptionType === "family_yearly") monthlyRevenue += 49.99 / 12;
        });

        document.getElementById("stat-current-revenue").textContent = `€${monthlyRevenue.toFixed(2)}`;
    }).catch(() => {
        document.getElementById("stat-active-subs").textContent = "Error";
        document.getElementById("stat-current-revenue").textContent = "Error";
    });

    // 3. Total Tasks
    db.collectionGroup("tasks").get().then(snapshot => {
        document.getElementById("stat-total-tasks").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-total-tasks").textContent = "Error";
    });

    // 4. Open Tickets
    db.collection("supportTickets").where("status", "in", ["open", "escalated"]).get().then(snapshot => {
        document.getElementById("stat-open-tickets").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-open-tickets").textContent = "Error";
    });

    // 5. Total Children
    db.collection("children").get().then(snapshot => {
        document.getElementById("stat-total-children").textContent = snapshot.size;
    }).catch(() => {
        document.getElementById("stat-total-children").textContent = "Error";
    });

    // 6. Errors in last 24h
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    db.collection("error_logs")
        .where("timestamp", ">=", firebase.firestore.Timestamp.fromDate(yesterday))
        .get().then(snapshot => {
            document.getElementById("stat-errors-24h").textContent = snapshot.size;
        }).catch(() => {
            document.getElementById("stat-errors-24h").textContent = "Error";
        });

    // 7. Active Pairing Codes
    const now = firebase.firestore.Timestamp.now();
    db.collection("pairingCodes").get().then(snapshot => {
        let activeCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.expiresAt && data.expiresAt.seconds > now.seconds) activeCount++;
        });
        const el = document.getElementById("stat-active-pairing");
        if (el) el.textContent = activeCount;
    }).catch(() => {
        const el = document.getElementById("stat-active-pairing");
        if (el) el.textContent = "N/A";
    });

    // 8. App Check status hint
    const appCheckEl = document.getElementById("stat-appcheck-status");
    if (appCheckEl) {
        appCheckEl.textContent = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("your-") ? "Config vorhanden" : "Nicht konfiguriert";
    }

    // 9. Indexes status hint
    const indexEl = document.getElementById("stat-indexes-status");
    if (indexEl) indexEl.textContent = "Prüfe via Full Validation";

    // Load error summaries + performance + warnings
    loadErrorSummaries();
    loadPerformanceMetrics();
    loadSubscriptionWarnings();
}

async function loadErrorSummaries() {
    const container = document.getElementById("error-summary");
    try {
        const snapshot = await db.collection("error_summaries")
            .orderBy("generatedAt", "desc")
            .limit(7)
            .get();

        if (snapshot.empty) {
            container.innerHTML = "<div class='info'>No error summaries available.</div>";
            return;
        }

        let html = "<table><tr><th>Date</th><th>Total Errors</th><th>Top Function</th><th>Count</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const date = data.date ? new Date(data.date.seconds * 1000).toLocaleDateString() : "N/A";
            const topFunction = Object.entries(data.errorsByFunction || {})
                .sort(([,a], [,b]) => b - a)[0];

            html += `<tr>
                <td>${date}</td>
                <td>${data.totalErrors || 0}</td>
                <td>${topFunction ? topFunction[0] : "N/A"}</td>
                <td>${topFunction ? topFunction[1] : "N/A"}</td>
            </tr>`;
        });
        html += "</table>";
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = "<div class='error'>Error loading error summaries: " + error.message + "</div>";
    }
}

// ==================== USER MANAGEMENT WITH PAGINATION ====================

async function loadUsers(direction) {
    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class='loading'>Loading users...</div>";

    try {
        let query = db.collection("masters").orderBy("createdAt", "desc").limit(PAGE_SIZE);

        if (direction === "next" && userLastDoc) {
            query = db.collection("masters").orderBy("createdAt", "desc").startAfter(userLastDoc).limit(PAGE_SIZE);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            userListElement.innerHTML = "<div class='info'>No users found.</div>";
            return;
        }

        userFirstDoc = snapshot.docs[0];
        userLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Subscription</th><th>Created</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const created = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
            const email = data.email || "N/A";
            const subStatus = data.subscription ? data.subscription.status : "none";
            const subClass = subStatus === "active" ? "status-active" : subStatus === "expired" ? "status-expired" : "";

            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 12)}...</td>
                <td>${email}</td>
                <td><span class="${subClass}">${subStatus}</span></td>
                <td>${created}</td>
                <td>
                    <button onclick="viewUserDetails('${doc.id}')" class="btn btn-secondary btn-sm">View</button>
                </td>
            </tr>`;
        });
        html += "</table>";
        userListElement.innerHTML = html;

        // Pagination controls
        const paginationEl = document.getElementById("user-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadUsers('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        console.error("Error loading users:", error);
        userListElement.innerHTML = "<div class='error'>Error loading users: " + error.message + "</div>";
    }
}

function searchUsers() {
    const query = document.getElementById("user-search-input").value.trim().toLowerCase();
    if (query.length < 3) {
        showNotification("Bitte mindestens 3 Zeichen eingeben.", "info");
        return;
    }

    const userListElement = document.getElementById("user-list");
    userListElement.innerHTML = "<div class='loading'>Searching users...</div>";

    db.collection("masters").get().then(snapshot => {
        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const email = (data.email || "").toLowerCase();

            if (email.includes(query) || doc.id.toLowerCase().includes(query)) {
                results.push({ id: doc.id, data: data });
            }
        });

        if (results.length === 0) {
            userListElement.innerHTML = "<div class='info'>No users found matching your search.</div>";
            return;
        }

        let html = "<table><tr><th>Master ID</th><th>Email</th><th>Subscription</th><th>Created</th><th>Actions</th></tr>";
        results.forEach(result => {
            const data = result.data;
            const created = data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
            const email = data.email || "N/A";
            const subStatus = data.subscription ? data.subscription.status : "none";

            html += `<tr>
                <td title="${result.id}">${result.id.substring(0, 12)}...</td>
                <td>${email}</td>
                <td>${subStatus}</td>
                <td>${created}</td>
                <td><button onclick="viewUserDetails('${result.id}')" class="btn btn-secondary btn-sm">View</button></td>
            </tr>`;
        });
        html += "</table>";
        userListElement.innerHTML = html;
        showNotification(`Found ${results.length} user(s) matching "${query}".`, "success");
    }).catch(error => {
        userListElement.innerHTML = "<div class='error'>Error searching users: " + error.message + "</div>";
    });
}

// ==================== USER DETAILS MODAL ====================

async function viewUserDetails(masterId) {
    const modal = document.getElementById("user-details-modal");
    const modalContent = document.getElementById("user-details-content");

    modalContent.innerHTML = "<div class='loading'>Loading user details...</div>";
    modal.style.display = "block";

    try {
        const masterDoc = await db.collection("masters").doc(masterId).get();
        if (!masterDoc.exists) {
            modalContent.innerHTML = "<div class='error'>User not found.</div>";
            return;
        }

        const masterData = masterDoc.data();
        let html = "<h3>Master Details</h3>";
        html += `<div class="ticket-detail-grid">`;
        html += `<p><strong>Master ID:</strong> ${escapeHtml(masterId)}</p>`;
        html += `<p><strong>Email:</strong> ${escapeHtml(masterData.email || "N/A")}</p>`;
        html += `<p><strong>IMEI:</strong> ${escapeHtml(masterData.imei || "N/A")}</p>`;
        html += `<p><strong>Created At:</strong> ${masterData.createdAt ? new Date(masterData.createdAt.seconds * 1000).toLocaleString() : "N/A"}</p>`;
        html += `<p><strong>Last Token Refresh:</strong> ${masterData.lastTokenRefresh ? new Date(masterData.lastTokenRefresh.seconds * 1000).toLocaleString() : "N/A"}</p>`;
        html += `</div>`;

        // Subscription info with Trial detail
        if (masterData.subscription) {
            const sub = masterData.subscription;
            const statusLabel = sub.status === "trial" ? "🟡 Trial (7 Tage)" : sub.status === "active" ? "🟢 Active" : "🔴 " + (sub.status || "none");
            html += `<h4>Subscription</h4>`;
            html += `<div class="ticket-detail-grid">`;
            html += `<p><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>`;
            html += `<p><strong>Type:</strong> ${escapeHtml(sub.type || "N/A")}</p>`;
            if (sub.trialStartedAt) {
                html += `<p><strong>Trial Start:</strong> ${new Date(sub.trialStartedAt.seconds * 1000).toLocaleString()}</p>`;
            }
            if (sub.trialEndsAt) {
                const trialEnd = new Date(sub.trialEndsAt.seconds * 1000);
                const isExpired = trialEnd < new Date();
                html += `<p><strong>Trial Ende:</strong> <span style="color:${isExpired ? "red" : "green"}">${trialEnd.toLocaleString()}${isExpired ? " (ABGELAUFEN)" : ""}</span></p>`;
            }
            if (sub.startedAt) {
                html += `<p><strong>Abo Start:</strong> ${new Date(sub.startedAt.seconds * 1000).toLocaleString()}</p>`;
            }
            if (sub.expiresAt) {
                const expDate = new Date(sub.expiresAt.seconds * 1000);
                const isExpired = expDate < new Date();
                html += `<p><strong>Abo Ablauf:</strong> <span style="color:${isExpired ? "red" : "green"}">${expDate.toLocaleString()}${isExpired ? " (ABGELAUFEN)" : ""}</span></p>`;
            }
            if (sub.type) {
                const childLimit = sub.type.startsWith("family") ? "Unbegrenzt (99)" : "1";
                html += `<p><strong>Child-Limit:</strong> ${childLimit}</p>`;
            }
            html += `</div>`;
        } else {
            html += `<h4>Subscription</h4><p>Keine Subscription vorhanden.</p>`;
        }

        // Load children
        const childrenSnapshot = await db.collection("children").where("masterImei", "==", masterId).get();
        html += `<h4>Children (${childrenSnapshot.size})</h4>`;
        if (childrenSnapshot.empty) {
            html += "<p>No children linked.</p>";
        } else {
            html += "<table><tr><th>Child ID</th><th>Locked</th><th>Last Seen</th><th>Status</th><th>Actions</th></tr>";
            childrenSnapshot.forEach(childDoc => {
                const childData = childDoc.data();
                const lastSeen = childData.lastSeen ? new Date(childData.lastSeen.seconds * 1000) : null;
                const lastSeenStr = lastSeen ? lastSeen.toLocaleString() : "N/A";
                const onlineStatus = getOnlineStatus(lastSeen);
                html += `<tr>
                    <td>${escapeHtml(childDoc.id)}</td>
                    <td>${childData.isLocked ? "🔒 Yes" : "🔓 No"}</td>
                    <td>${lastSeenStr}</td>
                    <td>${onlineStatus}</td>
                    <td><button onclick="viewDeviceDetails('${childDoc.id}')" class="btn btn-secondary btn-sm">Details</button></td>
                </tr>`;
            });
            html += "</table>";
        }

        // Actions
        html += `<h4>Actions</h4>`;
        html += `<div class="ticket-actions">`;
        html += `<button onclick="triggerDsarExportForUser('${masterId}')" class="btn btn-primary">Export User Data (DSAR)</button>`;
        html += `<button onclick="revokeUserSubscription('${masterId}')" class="btn btn-danger">Revoke Subscription</button>`;
        html += `<button onclick="revokeUserTokens('${masterId}')" class="btn btn-danger">Revoke Tokens (Force Re-Auth)</button>`;
        html += `</div>`;

        modalContent.innerHTML = html;
    } catch (error) {
        modalContent.innerHTML = `<div class='error'>Error loading details: ${escapeHtml(error.message)}</div>`;
    }
}

function getOnlineStatus(lastSeen) {
    if (!lastSeen) return '<span class="status-expired">Unbekannt</span>';
    const now = new Date();
    const diffMin = (now - lastSeen) / 60000;
    if (diffMin < 20) return '<span class="status-active">🟢 Online</span>';
    if (diffMin < 60) return '<span class="status-open">🟡 Kürzlich</span>';
    return '<span class="status-expired">🔴 Offline</span>';
}

async function revokeUserTokens(uid) {
    if (!confirm(`Alle Tokens für User ${uid} widerrufen? Der User muss sich neu einloggen.`)) return;
    try {
        const revokeFunc = functions.httpsCallable("revokeUserTokens");
        await revokeFunc({ uid: uid });
        showNotification("Tokens erfolgreich widerrufen.", "success");
    } catch (error) {
        showNotification("Fehler beim Token-Widerruf: " + error.message, "error");
    }
}

function closeUserDetailsModal() {
    document.getElementById("user-details-modal").style.display = "none";
}

// ==================== SUBSCRIPTION MANAGEMENT ====================

function filterSubscriptions(status) {
    currentSubFilter = status;
    loadSubscriptions();
}

async function loadSubscriptions(direction) {
    const subListElement = document.getElementById("subscription-list");
    subListElement.innerHTML = "<div class='loading'>Loading subscriptions...</div>";

    try {
        let query = db.collection("masters").orderBy("createdAt", "desc");

        if (currentSubFilter !== "all") {
            query = db.collection("masters").where("subscription.status", "==", currentSubFilter);
        }

        query = query.limit(PAGE_SIZE);

        if (direction === "next" && subLastDoc) {
            query = query.startAfter(subLastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            subListElement.innerHTML = "<div class='info'>No subscriptions found.</div>";
            return;
        }

        subLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Master ID</th><th>Status</th><th>Type</th><th>Started</th><th>Expires</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const data = doc.data();
            const sub = data.subscription || {};
            if (!sub.status || sub.status === "none") return;

            const started = sub.startedAt ? new Date(sub.startedAt.seconds * 1000).toLocaleDateString() : "N/A";
            const expires = sub.expiresAt ? new Date(sub.expiresAt.seconds * 1000).toLocaleDateString() : "N/A";
            const statusClass = sub.status === "active" ? "status-active" : "status-expired";

            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 12)}...</td>
                <td><span class="${statusClass}">${sub.status}</span></td>
                <td>${sub.type || "N/A"}</td>
                <td>${started}</td>
                <td>${expires}</td>
                <td>
                    ${sub.status === "active" ? `<button onclick="revokeUserSubscription('${doc.id}')" class="btn btn-danger btn-sm">Revoke</button>` : ""}
                </td>
            </tr>`;
        });
        html += "</table>";
        subListElement.innerHTML = html;

        // Pagination
        const paginationEl = document.getElementById("sub-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadSubscriptions('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        subListElement.innerHTML = "<div class='error'>Error loading subscriptions: " + error.message + "</div>";
    }
}

async function revokeUserSubscription(masterId) {
    if (!confirm(`Are you sure you want to revoke the subscription for ${masterId}?`)) return;

    try {
        const revokeFunc = functions.httpsCallable("revokeSubscription");
        await revokeFunc({ masterId: masterId });
        showNotification("Abonnement erfolgreich widerrufen.", "success");
        loadSubscriptions();
    } catch (error) {
        showNotification("Fehler beim Widerrufen des Abonnements: " + error.message, "error");
    }
}

// ==================== SUPPORT TICKET MANAGEMENT ====================

function filterTickets(status) {
    currentTicketFilter = status;
    ticketLastDoc = null;
    loadSupportTickets();
}

async function loadSupportTickets(direction) {
    const ticketsListElement = document.getElementById("support-tickets-list");
    ticketsListElement.innerHTML = "<div class='loading'>Loading support tickets...</div>";

    try {
        let query = db.collection("supportTickets").orderBy("createdAt", "desc");

        if (currentTicketFilter !== "all") {
            query = db.collection("supportTickets")
                .where("status", "==", currentTicketFilter)
                .orderBy("createdAt", "desc");
        }

        query = query.limit(PAGE_SIZE);

        if (direction === "next" && ticketLastDoc) {
            query = query.startAfter(ticketLastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            ticketsListElement.innerHTML = "<div class='info'>No support tickets found.</div>";
            return;
        }

        ticketLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Ticket ID</th><th>Master</th><th>Status</th><th>AI Confidence</th><th>Created</th><th>Access</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const ticket = doc.data();
            const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
            const statusClass = getStatusClass(ticket.status);
            const aiConfidence = ticket.aiConfidenceScore ? (ticket.aiConfidenceScore * 100).toFixed(0) + "%" : "N/A";

            html += `<tr>
                <td title="${doc.id}">${doc.id.substring(0, 8)}...</td>
                <td title="${ticket.masterImei}">${(ticket.masterImei || "").substring(0, 10)}...</td>
                <td><span class="${statusClass}">${ticket.status}</span></td>
                <td>${aiConfidence}</td>
                <td>${createdAt}</td>
                <td>${ticket.accessGranted ? "Granted" : "No"}</td>
                <td>
                    <button onclick="viewTicketDetails('${doc.id}')" class="btn btn-secondary btn-sm">View</button>
                    ${ticket.status !== "closed" ?
                        `<button onclick="updateTicketStatus('${doc.id}', 'closed')" class="btn btn-danger btn-sm">Close</button>` : ""}
                </td>
            </tr>`;
        });
        html += "</table>";
        ticketsListElement.innerHTML = html;

        // Pagination
        const paginationEl = document.getElementById("ticket-pagination");
        paginationEl.innerHTML = "";
        if (snapshot.docs.length === PAGE_SIZE) {
            paginationEl.innerHTML = `<button onclick="loadSupportTickets('next')" class="btn btn-secondary">Next Page</button>`;
        }
    } catch (error) {
        ticketsListElement.innerHTML = "<div class='error'>Error loading support tickets: " + error.message + "</div>";
    }
}

function getStatusClass(status) {
    switch (status) {
        case "open": return "status-open";
        case "escalated": return "status-escalated";
        case "in_progress": return "status-progress";
        case "awaiting_user_feedback": return "status-awaiting";
        case "closed": return "status-closed";
        default: return "";
    }
}

// ==================== TICKET DETAILS MODAL ====================

async function viewTicketDetails(ticketId) {
    const modal = document.getElementById("ticket-details-modal");
    const modalContent = document.getElementById("ticket-details-content");

    modalContent.innerHTML = "<div class='loading'>Loading ticket details...</div>";
    modal.style.display = "block";

    try {
        const doc = await db.collection("supportTickets").doc(ticketId).get();
        if (!doc.exists) {
            modalContent.innerHTML = "<div class='error'>Ticket not found.</div>";
            return;
        }

        const ticket = doc.data();
        const createdAt = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleString() : "N/A";
        const updatedAt = ticket.updatedAt ? new Date(ticket.updatedAt.seconds * 1000).toLocaleString() : "N/A";

        let html = `<h3>Ticket Details</h3>`;
        html += `<div class="ticket-detail-grid">`;
        html += `<p><strong>Ticket ID:</strong> ${ticketId}</p>`;
        html += `<p><strong>Master IMEI:</strong> ${ticket.masterImei}</p>`;
        html += `<p><strong>Status:</strong> <span class="${getStatusClass(ticket.status)}">${ticket.status}</span></p>`;
        html += `<p><strong>Created:</strong> ${createdAt}</p>`;
        html += `<p><strong>Updated:</strong> ${updatedAt}</p>`;
        html += `<p><strong>Access Granted:</strong> ${ticket.accessGranted ? "Yes" : "No"}</p>`;
        html += `</div>`;

        html += `<h4>Problem Description</h4>`;
        html += `<div class="ticket-description">${escapeHtml(ticket.problemDescription || "N/A")}</div>`;

        if (ticket.aiGeneratedSolution) {
            html += `<h4>AI-Generated Solution (Confidence: ${(ticket.aiConfidenceScore * 100).toFixed(0)}%)</h4>`;
            html += `<div class="ticket-ai-solution">${escapeHtml(ticket.aiGeneratedSolution)}</div>`;
        }

        // Admin response section
        html += `<h4>Admin Response</h4>`;
        html += `<textarea id="admin-response-text" rows="4" style="inline-size: 100%; margin-block-end: 10px;" placeholder="Enter admin response...">${ticket.adminResponse || ""}</textarea>`;

        // Action buttons
        html += `<div class="ticket-actions">`;
        html += `<button onclick="saveAdminResponse('${ticketId}')" class="btn btn-primary">Save Response</button>`;

        if (ticket.status !== "closed") {
            html += `<button onclick="updateTicketStatus('${ticketId}', 'in_progress'); closeTicketDetailsModal();" class="btn btn-secondary">Mark In Progress</button>`;
            html += `<button onclick="updateTicketStatus('${ticketId}', 'closed'); closeTicketDetailsModal();" class="btn btn-danger">Close Ticket</button>`;
        }

        if (ticket.accessGranted) {
            if (currentUserRole === "admin") {
                html += `<button onclick="viewUserDetails('${ticket.masterImei}')" class="btn btn-primary">View User Data (Admin)</button>`;
            } else {
                html += `<button onclick="viewTicketUserData('${ticketId}')" class="btn btn-primary">View User Data (Grant)</button>`;
            }
        }
        html += `</div>`;

        modalContent.innerHTML = html;
    } catch (error) {
        modalContent.innerHTML = `<div class='error'>Error loading ticket details: ${error.message}</div>`;
    }
}

function closeTicketDetailsModal() {
    document.getElementById("ticket-details-modal").style.display = "none";
}

/**
 * GDPR-compliant user data view for support agents via ticket grant.
 * Calls getTicketUserData Cloud Function which verifies the grant.
 */
async function viewTicketUserData(ticketId) {
    const modal = document.getElementById("user-details-modal");
    const modalContent = document.getElementById("user-details-content");

    modalContent.innerHTML = "<div class='loading'>Loading user data via support grant...</div>";
    modal.style.display = "block";

    try {
        const getDataFunc = functions.httpsCallable("getTicketUserData");
        const result = await getDataFunc({ ticketId });
        const { master, children, grantExpiresAt } = result.data;

        let html = "<h3>User Data (Support Grant)</h3>";
        html += `<div class="info" style="margin-block-end:10px;">Access via Ticket ${escapeHtml(ticketId)}. Grant expires: ${grantExpiresAt ? new Date(grantExpiresAt).toLocaleString() : "N/A"}</div>`;

        if (master) {
            html += `<div class="ticket-detail-grid">`;
            html += `<p><strong>Master ID:</strong> ${escapeHtml(master.id)}</p>`;
            html += `<p><strong>Email:</strong> ${escapeHtml(master.email || "N/A")}</p>`;
            html += `<p><strong>IMEI:</strong> ${escapeHtml(master.imei || "N/A")}</p>`;
            if (master.subscription) {
                html += `<p><strong>Subscription:</strong> ${escapeHtml(master.subscription.status || "none")}</p>`;
            }
            html += `</div>`;
        } else {
            html += "<div class='error'>Master data not available.</div>";
        }

        html += `<h4>Children (${children.length})</h4>`;
        if (children.length > 0) {
            html += "<table><tr><th>Child ID</th><th>Locked</th><th>Last Seen</th></tr>";
            children.forEach(child => {
                const lastSeen = child.lastSeen ? new Date(child.lastSeen._seconds * 1000).toLocaleString() : "N/A";
                html += `<tr>
                    <td>${escapeHtml(child.id)}</td>
                    <td>${child.isLocked ? "🔒" : "🔓"}</td>
                    <td>${lastSeen}</td>
                </tr>`;
            });
            html += "</table>";
        } else {
            html += "<p>No children linked.</p>";
        }

        modalContent.innerHTML = html;
    } catch (error) {
        modalContent.innerHTML = `<div class='error'>Error: ${escapeHtml(error.message)}</div>`;
    }
}

async function saveAdminResponse(ticketId) {
    const response = document.getElementById("admin-response-text").value.trim();
    if (!response) {
        showNotification("Bitte geben Sie eine Antwort ein.", "info");
        return;
    }

    try {
        await db.collection("supportTickets").doc(ticketId).update({
            adminResponse: response,
            respondedAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: "awaiting_user_feedback"
        });
        showNotification("Admin-Antwort erfolgreich gespeichert.", "success");
        loadSupportTickets();
    } catch (error) {
        showNotification("Fehler beim Speichern der Antwort: " + error.message, "error");
    }
}

async function updateTicketStatus(ticketId, newStatus) {
    try {
        await db.collection("supportTickets").doc(ticketId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showNotification("Ticket status updated to " + newStatus + ".", "success");
        loadSupportTickets();
    } catch (error) {
        showNotification("Fehler beim Aktualisieren des Ticket-Status: " + error.message, "error");
    }
}

// ==================== COMPLIANCE / DSAR ====================

async function triggerDsarExport() {
    const masterId = document.getElementById("dsar-master-id").value.trim();
    if (!masterId) {
        showNotification("Bitte geben Sie eine Master-ID ein.", "info");
        return;
    }
    await triggerDsarExportForUser(masterId);
}

async function triggerDsarExportForUser(masterId) {
    const resultEl = document.getElementById("dsar-result");
    resultEl.innerHTML = "<div class='loading'>Exporting user data...</div>";

    try {
        // Collect all data for the user
        const masterDoc = await db.collection("masters").doc(masterId).get();
        if (!masterDoc.exists) {
            resultEl.innerHTML = "<div class='error'>User not found.</div>";
            return;
        }

        const exportData = {
            exportedAt: new Date().toISOString(),
            masterId: masterId,
            masterProfile: masterDoc.data()
        };

        // Children
        const childrenSnap = await db.collection("children").where("masterImei", "==", masterId).get();
        exportData.children = [];
        for (const childDoc of childrenSnap.docs) {
            const childData = { id: childDoc.id, ...childDoc.data() };
            const tasksSnap = await childDoc.ref.collection("tasks").get();
            childData.tasks = tasksSnap.docs.map(t => ({ id: t.id, ...t.data() }));
            const usageSnap = await childDoc.ref.collection("usageHistory").get();
            childData.usageHistory = usageSnap.docs.map(u => ({ id: u.id, ...u.data() }));
            exportData.children.push(childData);
        }

        // Support tickets
        const ticketsSnap = await db.collection("supportTickets").where("masterImei", "==", masterId).get();
        exportData.supportTickets = ticketsSnap.docs.map(t => ({ id: t.id, ...t.data() }));

        // Audit logs
        const auditSnap = await db.collection("audit_logs")
            .where("userId", "==", masterId)
            .orderBy("timestamp", "desc")
            .limit(500)
            .get();
        exportData.auditLogs = auditSnap.docs.map(a => ({ id: a.id, ...a.data() }));

        // Create downloadable JSON
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        resultEl.innerHTML = `
            <div class="success-box">
                <p>Data export completed successfully.</p>
                <p><strong>Records:</strong> ${exportData.children.length} children, ${exportData.supportTickets.length} tickets, ${exportData.auditLogs.length} audit logs</p>
                <a href="${url}" download="dsar_export_${masterId}_${Date.now()}.json" class="btn btn-primary">Download JSON Export</a>
            </div>
        `;
        showNotification("DSAR export completed.", "success");
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Error exporting data: ${error.message}</div>`;
    }
}

async function triggerAccountDeletion() {
    const masterId = document.getElementById("delete-master-id").value.trim();
    const resultEl = document.getElementById("delete-result");
    if (!masterId) {
        showNotification("Bitte geben Sie eine Master-ID ein.", "info");
        return;
    }

    if (!confirm(`WARNUNG: Hiermit werden ALLE Daten für User ${masterId} unwiderruflich gelöscht (Master, Children, Tasks, Subscriptions). Fortfahren?`)) {
        return;
    }

    if (!confirm(`LETZTE BESTÄTIGUNG: Sind Sie absolut sicher, dass Sie User ${masterId} löschen möchten?`)) {
        return;
    }

    if (resultEl) resultEl.innerHTML = "<div class='loading'>Lösche Account...</div>";

    try {
        const deleteFunc = functions.httpsCallable("deleteUserAccount");
        await deleteFunc({ masterId: masterId });
        if (resultEl) resultEl.innerHTML = "<div class='success-box'>Account erfolgreich gelöscht.</div>";
        showNotification("Account deletion completed successfully.", "success");
        loadUsers();
        loadStats();
    } catch (error) {
        if (resultEl) resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
        showNotification("Fehler beim Löschen des Kontos: " + error.message, "error");
    }
}

async function exportAuditLogs() {
    const startDate = document.getElementById("audit-start-date").value;
    const endDate = document.getElementById("audit-end-date").value;
    const resultEl = document.getElementById("audit-export-result");

    if (!startDate || !endDate) {
        showNotification("Bitte wählen Sie Start- und Enddatum.", "info");
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Exporting audit logs...</div>";

    try {
        const start = firebase.firestore.Timestamp.fromDate(new Date(startDate));
        const end = firebase.firestore.Timestamp.fromDate(new Date(endDate + "T23:59:59"));

        const snapshot = await db.collection("audit_logs")
            .where("timestamp", ">=", start)
            .where("timestamp", "<=", end)
            .orderBy("timestamp", "desc")
            .limit(5000)
            .get();

        if (snapshot.empty) {
            resultEl.innerHTML = "<div class='info'>No audit logs found for this period.</div>";
            return;
        }

        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        resultEl.innerHTML = `
            <div class="success-box">
                <p>Exported ${logs.length} audit log entries.</p>
                <a href="${url}" download="audit_logs_${startDate}_${endDate}.json" class="btn btn-primary">Download JSON Export</a>
            </div>
        `;
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Error exporting audit logs: ${error.message}</div>`;
    }
}

// ==================== DEVICES (CHILDREN) TAB ====================

let deviceLastDoc = null;

async function loadDevices(direction) {
    const listEl = document.getElementById("device-list");
    if (!listEl) return;
    listEl.innerHTML = "<div class='loading'>Loading devices...</div>";

    try {
        let query = db.collection("children").orderBy("lastSeen", "desc").limit(PAGE_SIZE);
        if (direction === "next" && deviceLastDoc) {
            query = db.collection("children").orderBy("lastSeen", "desc").startAfter(deviceLastDoc).limit(PAGE_SIZE);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            listEl.innerHTML = "<div class='info'>Keine Geräte gefunden.</div>";
            return;
        }

        deviceLastDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = "<table><tr><th>Child ID</th><th>Master</th><th>Locked</th><th>Blacklist</th><th>Last Seen</th><th>Status</th><th>FCM</th><th>Actions</th></tr>";
        snapshot.forEach(doc => {
            const d = doc.data();
            const lastSeen = d.lastSeen ? new Date(d.lastSeen.seconds * 1000) : null;
            const onlineStatus = getOnlineStatus(lastSeen);
            const blacklistCount = Array.isArray(d.appBlacklist) ? d.appBlacklist.length : 0;
            const hasFcm = d.fcmToken ? "✅" : "❌";

            html += `<tr>
                <td title="${escapeHtml(doc.id)}">${escapeHtml(doc.id.substring(0, 16))}${doc.id.length > 16 ? "..." : ""}</td>
                <td title="${escapeHtml(d.masterImei || "")}">${escapeHtml((d.masterImei || "").substring(0, 12))}...</td>
                <td>${d.isLocked ? "🔒" : "🔓"}</td>
                <td>${blacklistCount} Apps</td>
                <td>${lastSeen ? lastSeen.toLocaleString() : "N/A"}</td>
                <td>${onlineStatus}</td>
                <td>${hasFcm}</td>
                <td><button onclick="viewDeviceDetails('${doc.id}')" class="btn btn-secondary btn-sm">Details</button></td>
            </tr>`;
        });
        html += "</table>";
        listEl.innerHTML = html;

        const paginationEl = document.getElementById("device-pagination");
        if (paginationEl) {
            paginationEl.innerHTML = snapshot.docs.length === PAGE_SIZE
                ? `<button onclick="loadDevices('next')" class="btn btn-secondary">Next Page</button>`
                : "";
        }
    } catch (error) {
        listEl.innerHTML = `<div class='error'>Error loading devices: ${escapeHtml(error.message)}</div>`;
    }
}

function searchDevices() {
    const query = (document.getElementById("device-search-input")?.value || "").trim().toLowerCase();
    if (query.length < 3) {
        showNotification("Bitte mindestens 3 Zeichen eingeben.", "info");
        return;
    }

    const listEl = document.getElementById("device-list");
    listEl.innerHTML = "<div class='loading'>Suche Geräte...</div>";

    db.collection("children").get().then(snapshot => {
        const results = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            if (doc.id.toLowerCase().includes(query) || (d.masterImei || "").toLowerCase().includes(query)) {
                results.push({ id: doc.id, data: d });
            }
        });

        if (results.length === 0) {
            listEl.innerHTML = "<div class='info'>Keine Geräte gefunden.</div>";
            return;
        }

        let html = "<table><tr><th>Child ID</th><th>Master</th><th>Locked</th><th>Blacklist</th><th>Last Seen</th><th>Status</th><th>Actions</th></tr>";
        results.forEach(r => {
            const d = r.data;
            const lastSeen = d.lastSeen ? new Date(d.lastSeen.seconds * 1000) : null;
            const onlineStatus = getOnlineStatus(lastSeen);
            const blacklistCount = Array.isArray(d.appBlacklist) ? d.appBlacklist.length : 0;
            html += `<tr>
                <td>${escapeHtml(r.id)}</td>
                <td>${escapeHtml((d.masterImei || "").substring(0, 12))}...</td>
                <td>${d.isLocked ? "🔒" : "🔓"}</td>
                <td>${blacklistCount} Apps</td>
                <td>${lastSeen ? lastSeen.toLocaleString() : "N/A"}</td>
                <td>${onlineStatus}</td>
                <td><button onclick="viewDeviceDetails('${r.id}')" class="btn btn-secondary btn-sm">Details</button></td>
            </tr>`;
        });
        html += "</table>";
        listEl.innerHTML = html;
        showNotification(`${results.length} Gerät(e) gefunden.`, "success");
    }).catch(error => {
        listEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    });
}

async function viewDeviceDetails(childId) {
    const modal = document.getElementById("device-details-modal");
    const content = document.getElementById("device-details-content");
    if (!modal || !content) return;

    content.innerHTML = "<div class='loading'>Loading device details...</div>";
    modal.style.display = "block";

    try {
        const childDoc = await db.collection("children").doc(childId).get();
        if (!childDoc.exists) {
            content.innerHTML = "<div class='error'>Gerät nicht gefunden.</div>";
            return;
        }

        const d = childDoc.data();
        const lastSeen = d.lastSeen ? new Date(d.lastSeen.seconds * 1000) : null;
        const onlineStatus = getOnlineStatus(lastSeen);

        let html = `<h3>Gerätedetails: ${escapeHtml(childId)}</h3>`;
        html += `<div class="ticket-detail-grid">`;
        html += `<p><strong>Child ID:</strong> ${escapeHtml(childId)}</p>`;
        html += `<p><strong>Master IMEI:</strong> ${escapeHtml(d.masterImei || "N/A")}</p>`;
        html += `<p><strong>Lock Status:</strong> ${d.isLocked ? "🔒 Gesperrt" : "🔓 Entsperrt"}</p>`;
        html += `<p><strong>Online Status:</strong> ${onlineStatus}</p>`;
        html += `<p><strong>Last Seen:</strong> ${lastSeen ? lastSeen.toLocaleString() : "N/A"}</p>`;
        html += `<p><strong>FCM Token:</strong> ${d.fcmToken ? "✅ Vorhanden" : "❌ Nicht registriert"}</p>`;
        html += `</div>`;

        // App Blacklist
        html += `<h4>App Blacklist (${Array.isArray(d.appBlacklist) ? d.appBlacklist.length : 0} Apps)</h4>`;
        if (Array.isArray(d.appBlacklist) && d.appBlacklist.length > 0) {
            html += `<div class="ticket-description">${d.appBlacklist.map(a => escapeHtml(a)).join("<br>")}</div>`;
        } else {
            html += `<p>Keine Apps gesperrt.</p>`;
        }

        // Usage Rules
        html += `<h4>Usage Rules</h4>`;
        if (d.usageRules && typeof d.usageRules === "object") {
            html += `<div class="ticket-description">${escapeHtml(JSON.stringify(d.usageRules, null, 2))}</div>`;
        } else {
            html += `<p>Keine Nutzungsregeln gesetzt.</p>`;
        }

        // Tasks
        const tasksSnap = await db.collection("children").doc(childId).collection("tasks").orderBy("createdAt", "desc").limit(20).get();
        html += `<h4>Tasks (${tasksSnap.size})</h4>`;
        if (!tasksSnap.empty) {
            html += "<table><tr><th>Title</th><th>Status</th><th>Proof</th><th>AI-Analyse</th><th>Erstellt</th></tr>";
            tasksSnap.forEach(taskDoc => {
                const t = taskDoc.data();
                const created = t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
                const proofUrl = t.photoUrl || t.proofUrl;
                const proofLink = proofUrl ? `<a href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener">📷 Ansehen</a>` : "—";
                const aiInfo = t.aiAnalysis ? `Labels: ${(t.aiAnalysis.labels || []).join(", ")}` : "—";
                html += `<tr>
                    <td>${escapeHtml(t.title || t.description || "N/A")}</td>
                    <td><span class="${getTaskStatusClass(t.status)}">${escapeHtml(t.status || "N/A")}</span></td>
                    <td>${proofLink}</td>
                    <td>${escapeHtml(aiInfo)}</td>
                    <td>${created}</td>
                </tr>`;
            });
            html += "</table>";
        } else {
            html += "<p>Keine Tasks vorhanden.</p>";
        }

        // Usage History
        const usageSnap = await db.collection("children").doc(childId).collection("usageHistory").orderBy("date", "desc").limit(14).get();
        html += `<h4>Usage History (letzte ${usageSnap.size} Tage)</h4>`;
        if (!usageSnap.empty) {
            html += "<table><tr><th>Datum</th><th>Screen Time</th></tr>";
            usageSnap.forEach(uDoc => {
                const u = uDoc.data();
                const minutes = u.totalUsageMillis ? Math.round(u.totalUsageMillis / 60000) : 0;
                html += `<tr><td>${escapeHtml(u.date || uDoc.id)}</td><td>${minutes} Minuten</td></tr>`;
            });
            html += "</table>";
        } else {
            html += "<p>Keine Usage-Daten vorhanden.</p>";
        }

        // Link to Master
        html += `<h4>Actions</h4>`;
        html += `<div class="ticket-actions">`;
        html += `<button onclick="viewUserDetails('${escapeHtml(d.masterImei || "")}')" class="btn btn-primary">Master anzeigen</button>`;
        html += `</div>`;

        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

function getTaskStatusClass(status) {
    switch (status) {
        case "ASSIGNED": case "pending": return "status-open";
        case "SUBMITTED": case "pending_approval": return "status-awaiting";
        case "APPROVED": case "approved": return "status-active";
        case "REJECTED": return "status-expired";
        default: return "";
    }
}

function closeDeviceDetailsModal() {
    const modal = document.getElementById("device-details-modal");
    if (modal) modal.style.display = "none";
}

// ==================== PAIRING OVERVIEW ====================

async function loadPairingOverview(type) {
    const listEl = document.getElementById("pairing-list");
    if (!listEl) return;
    listEl.innerHTML = "<div class='loading'>Lade Pairing-Daten...</div>";

    const now = firebase.firestore.Timestamp.now();
    let allHtml = "";

    try {
        // Pairing Codes
        if (type === "codes" || type === "all") {
            const codesSnap = await db.collection("pairingCodes").get();
            let activeCodes = 0, expiredCodes = 0;
            let codesHtml = "<h4>Pairing Codes (6-stellig)</h4>";

            if (codesSnap.empty) {
                codesHtml += "<p>Keine Pairing Codes vorhanden.</p>";
            } else {
                codesHtml += "<table><tr><th>Code</th><th>Master ID</th><th>Erstellt</th><th>Ablauf</th><th>Status</th></tr>";
                codesSnap.forEach(doc => {
                    const d = doc.data();
                    const created = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString() : "N/A";
                    const expires = d.expiresAt ? new Date(d.expiresAt.seconds * 1000).toLocaleString() : "N/A";
                    const isExpired = d.expiresAt && d.expiresAt.seconds < now.seconds;
                    if (isExpired) expiredCodes++; else activeCodes++;
                    codesHtml += `<tr>
                        <td><strong>${escapeHtml(doc.id)}</strong></td>
                        <td>${escapeHtml((d.masterId || d.masterImei || "").substring(0, 12))}...</td>
                        <td>${created}</td>
                        <td>${expires}</td>
                        <td>${isExpired ? '<span class="status-expired">Abgelaufen</span>' : '<span class="status-active">Aktiv</span>'}</td>
                    </tr>`;
                });
                codesHtml += "</table>";
            }
            allHtml += codesHtml;
            const acEl = document.getElementById("pairing-active-codes");
            const ecEl = document.getElementById("pairing-expired-codes");
            if (acEl) acEl.textContent = activeCodes;
            if (ecEl) ecEl.textContent = expiredCodes;
        }

        // Pairing Tokens
        if (type === "tokens" || type === "all") {
            const tokensSnap = await db.collection("pairingTokens").get();
            let activeTokens = 0, expiredTokens = 0;
            let tokensHtml = "<h4>Pairing Tokens (UUID, 5 Min)</h4>";

            if (tokensSnap.empty) {
                tokensHtml += "<p>Keine Pairing Tokens vorhanden.</p>";
            } else {
                tokensHtml += "<table><tr><th>Token ID</th><th>Master ID</th><th>Erstellt</th><th>Ablauf</th><th>Status</th></tr>";
                tokensSnap.forEach(doc => {
                    const d = doc.data();
                    const created = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleString() : "N/A";
                    const expires = d.expiresAt ? new Date(d.expiresAt.seconds * 1000).toLocaleString() : "N/A";
                    const isExpired = d.expiresAt && d.expiresAt.seconds < now.seconds;
                    if (isExpired) expiredTokens++; else activeTokens++;
                    tokensHtml += `<tr>
                        <td title="${escapeHtml(doc.id)}">${escapeHtml(doc.id.substring(0, 12))}...</td>
                        <td>${escapeHtml((d.masterId || d.masterImei || "").substring(0, 12))}...</td>
                        <td>${created}</td>
                        <td>${expires}</td>
                        <td>${isExpired ? '<span class="status-expired">Abgelaufen</span>' : '<span class="status-active">Aktiv</span>'}</td>
                    </tr>`;
                });
                tokensHtml += "</table>";
            }
            allHtml += tokensHtml;
            const atEl = document.getElementById("pairing-active-tokens");
            const etEl = document.getElementById("pairing-expired-tokens");
            if (atEl) atEl.textContent = activeTokens;
            if (etEl) etEl.textContent = expiredTokens;
        }

        listEl.innerHTML = allHtml || "<div class='info'>Keine Daten geladen.</div>";
    } catch (error) {
        listEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== ERROR LOGS (SEARCHABLE) ====================

let errorLogLastDoc = null;

async function loadErrorLogs(direction) {
    const listEl = document.getElementById("errorlog-list");
    if (!listEl) return;
    listEl.innerHTML = "<div class='loading'>Lade Error Logs...</div>";

    try {
        let query = db.collection("error_logs").orderBy("timestamp", "desc").limit(PAGE_SIZE);
        if (direction === "next" && errorLogLastDoc) {
            query = db.collection("error_logs").orderBy("timestamp", "desc").startAfter(errorLogLastDoc).limit(PAGE_SIZE);
        }

        const dateFilter = document.getElementById("errorlog-date-filter")?.value;
        if (dateFilter) {
            const start = firebase.firestore.Timestamp.fromDate(new Date(dateFilter));
            const end = firebase.firestore.Timestamp.fromDate(new Date(dateFilter + "T23:59:59"));
            query = db.collection("error_logs")
                .where("timestamp", ">=", start)
                .where("timestamp", "<=", end)
                .orderBy("timestamp", "desc")
                .limit(PAGE_SIZE);
        }

        const snapshot = await query.get();
        if (snapshot.empty) {
            listEl.innerHTML = "<div class='info'>Keine Error Logs gefunden.</div>";
            return;
        }

        errorLogLastDoc = snapshot.docs[snapshot.docs.length - 1];
        renderErrorLogTable(listEl, snapshot.docs);

        const paginationEl = document.getElementById("errorlog-pagination");
        if (paginationEl) {
            paginationEl.innerHTML = snapshot.docs.length === PAGE_SIZE
                ? `<button onclick="loadErrorLogs('next')" class="btn btn-secondary">Next Page</button>`
                : "";
        }
    } catch (error) {
        listEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

function searchErrorLogs() {
    const searchQuery = (document.getElementById("errorlog-search-input")?.value || "").trim().toLowerCase();
    const dateFilter = document.getElementById("errorlog-date-filter")?.value;
    const listEl = document.getElementById("errorlog-list");
    if (!listEl) return;

    if (!searchQuery && !dateFilter) {
        loadErrorLogs();
        return;
    }

    listEl.innerHTML = "<div class='loading'>Suche Error Logs...</div>";

    let query = db.collection("error_logs").orderBy("timestamp", "desc").limit(200);
    if (dateFilter) {
        const start = firebase.firestore.Timestamp.fromDate(new Date(dateFilter));
        const end = firebase.firestore.Timestamp.fromDate(new Date(dateFilter + "T23:59:59"));
        query = db.collection("error_logs")
            .where("timestamp", ">=", start)
            .where("timestamp", "<=", end)
            .orderBy("timestamp", "desc")
            .limit(200);
    }

    query.get().then(snapshot => {
        const filtered = [];
        snapshot.forEach(doc => {
            const d = doc.data();
            const funcName = (d.functionName || "").toLowerCase();
            const msg = (d.message || "").toLowerCase();
            if (!searchQuery || funcName.includes(searchQuery) || msg.includes(searchQuery)) {
                filtered.push(doc);
            }
        });

        if (filtered.length === 0) {
            listEl.innerHTML = "<div class='info'>Keine passenden Error Logs gefunden.</div>";
            return;
        }

        renderErrorLogTable(listEl, filtered);
        showNotification(`${filtered.length} Error Log(s) gefunden.`, "success");
    }).catch(error => {
        listEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    });
}

function renderErrorLogTable(container, docs) {
    let html = "<table><tr><th>Zeitpunkt</th><th>Funktion</th><th>Fehlermeldung</th><th>User</th><th>Severity</th></tr>";
    docs.forEach(doc => {
        const d = typeof doc.data === "function" ? doc.data() : doc;
        const ts = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleString() : "N/A";
        const funcName = d.functionName || "N/A";
        const msg = (d.message || "N/A").substring(0, 80);
        const userId = d.userId || d.uid || "N/A";
        const severity = d.severity || "error";
        html += `<tr>
            <td>${ts}</td>
            <td>${escapeHtml(funcName)}</td>
            <td title="${escapeHtml(d.message || "")}">${escapeHtml(msg)}${(d.message || "").length > 80 ? "..." : ""}</td>
            <td>${escapeHtml(userId.substring(0, 12))}</td>
            <td><span class="status-expired">${escapeHtml(severity)}</span></td>
        </tr>`;
    });
    html += "</table>";
    container.innerHTML = html;
}

// ==================== PERFORMANCE METRICS ====================

async function loadPerformanceMetrics() {
    const container = document.getElementById("performance-metrics");
    if (!container) return;
    container.innerHTML = "<div class='loading'>Lade Performance-Metriken...</div>";

    try {
        const snapshot = await db.collection("performance_metrics")
            .orderBy("timestamp", "desc")
            .limit(20)
            .get();

        if (snapshot.empty) {
            container.innerHTML = "<div class='info'>Keine Performance-Metriken vorhanden.</div>";
            return;
        }

        let html = "<table><tr><th>Funktion</th><th>Dauer (ms)</th><th>Status</th><th>Zeitpunkt</th></tr>";
        snapshot.forEach(doc => {
            const d = doc.data();
            const ts = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleString() : "N/A";
            const duration = d.duration || d.executionTimeMs || "N/A";
            const status = d.success === true ? '<span class="status-active">OK</span>' : d.success === false ? '<span class="status-expired">FAIL</span>' : "N/A";
            html += `<tr>
                <td>${escapeHtml(d.functionName || d.action || "N/A")}</td>
                <td>${duration}</td>
                <td>${status}</td>
                <td>${ts}</td>
            </tr>`;
        });
        html += "</table>";
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class='info'>Performance-Metriken nicht verfügbar (${escapeHtml(error.message)}).</div>`;
    }
}

// ==================== SUBSCRIPTION EXPIRY WARNINGS ====================

async function loadSubscriptionWarnings() {
    const container = document.getElementById("subscription-warnings");
    if (!container) return;

    try {
        const now = new Date();
        const warningThreshold = new Date();
        warningThreshold.setDate(warningThreshold.getDate() + 7); // 7 days warning

        const mastersSnap = await db.collection("masters").get();
        const warnings = [];

        mastersSnap.forEach(doc => {
            const d = doc.data();
            const sub = d.subscription;
            if (!sub) return;

            // Trial expiry warning
            if (sub.status === "trial" && sub.trialEndsAt) {
                const trialEnd = new Date(sub.trialEndsAt.seconds * 1000);
                if (trialEnd < warningThreshold) {
                    const isExpired = trialEnd < now;
                    warnings.push({
                        masterId: doc.id,
                        email: d.email || "N/A",
                        type: "Trial",
                        expiresAt: trialEnd,
                        expired: isExpired
                    });
                }
            }

            // Subscription expiry warning
            if ((sub.status === "active") && sub.expiresAt) {
                const expiresAt = new Date(sub.expiresAt.seconds * 1000);
                if (expiresAt < warningThreshold) {
                    const isExpired = expiresAt < now;
                    warnings.push({
                        masterId: doc.id,
                        email: d.email || "N/A",
                        type: sub.type || "Abo",
                        expiresAt: expiresAt,
                        expired: isExpired
                    });
                }
            }
        });

        if (warnings.length === 0) {
            container.innerHTML = "";
            return;
        }

        warnings.sort((a, b) => a.expiresAt - b.expiresAt);

        let html = `<div class="compliance-section" style="border-inline-start: 4px solid #ffc107; padding: 15px; margin-block-end: 15px">`;
        html += `<h3 style="margin-block-start:0; color:#b45309">⚠️ Subscription-Ablauf-Warnungen (${warnings.length})</h3>`;
        html += "<table><tr><th>User</th><th>Email</th><th>Typ</th><th>Ablauf</th><th>Status</th></tr>";
        warnings.forEach(w => {
            const statusBadge = w.expired
                ? '<span class="status-expired">ABGELAUFEN</span>'
                : '<span class="status-open">Läuft bald ab</span>';
            html += `<tr>
                <td><a href="#" onclick="viewUserDetails('${escapeHtml(w.masterId)}'); return false;">${escapeHtml(w.masterId.substring(0, 12))}...</a></td>
                <td>${escapeHtml(w.email)}</td>
                <td>${escapeHtml(w.type)}</td>
                <td>${w.expiresAt.toLocaleDateString()}</td>
                <td>${statusBadge}</td>
            </tr>`;
        });
        html += "</table></div>";
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = "";
    }
}

// ==================== ADMIN CLAIM MANAGEMENT ====================

async function grantAdminClaim() {
    const uid = (document.getElementById("admin-target-uid")?.value || "").trim();
    const resultEl = document.getElementById("admin-claim-result");
    if (!uid) {
        showNotification("Bitte eine User UID eingeben.", "info");
        return;
    }

    if (!confirm(`Admin-Claim für UID "${uid}" setzen?`)) return;

    if (resultEl) resultEl.innerHTML = "<div class='loading'>Setze Admin-Claim...</div>";

    try {
        const setAdminFunc = functions.httpsCallable("setAdminClaim");
        await setAdminFunc({ uid: uid });
        if (resultEl) resultEl.innerHTML = `<div class='success-box'>Admin-Claim erfolgreich für ${escapeHtml(uid)} gesetzt.</div>`;
        showNotification("Admin-Claim gesetzt.", "success");
    } catch (error) {
        if (resultEl) resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
        showNotification("Fehler: " + error.message, "error");
    }
}

// ==================== UTILITY ====================

function showNotification(message, type) {
    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type || "info"}`;
    notification.style.display = "block";

    setTimeout(() => {
        notification.style.display = "none";
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, "<br>");
}

// ==================== ROLE MANAGEMENT (Admin only) ====================

async function assignUserRole() {
    if (currentUserRole !== "admin") {
        showNotification("Nur Admins können Rollen zuweisen.", "error");
        return;
    }

    const uid = (document.getElementById("role-uid")?.value || "").trim();
    const role = (document.getElementById("role-select")?.value || "").trim();
    const resultEl = document.getElementById("role-result");

    if (!uid) {
        showNotification("Bitte geben Sie eine User-UID ein.", "info");
        return;
    }
    if (!role || !["admin", "support", "auditor"].includes(role)) {
        showNotification("Bitte wählen Sie eine gültige Rolle.", "info");
        return;
    }

    if (!confirm(`Rolle '${role}' für User ${uid} setzen?`)) return;

    if (resultEl) resultEl.innerHTML = "<div class='loading'>Setze Rolle...</div>";

    try {
        await setUserRoleInternal(uid, role);
        if (resultEl) resultEl.innerHTML = `<div class='success-box'>Rolle '${role}' erfolgreich für User ${escapeHtml(uid)} gesetzt.</div>`;
        refreshCommissioningReport();
        showNotification(`Rolle '${role}' für ${uid} zugewiesen.`, "success");
    } catch (error) {
        if (resultEl) resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
        showNotification("Fehler beim Zuweisen der Rolle: " + error.message, "error");
    }
}

// Close modals when clicking outside
window.onclick = function(event) {
    const userModal = document.getElementById("user-details-modal");
    const ticketModal = document.getElementById("ticket-details-modal");
    const deviceModal = document.getElementById("device-details-modal");
    if (event.target === userModal) userModal.style.display = "none";
    if (event.target === ticketModal) ticketModal.style.display = "none";
    if (event.target === deviceModal) deviceModal.style.display = "none";
};
