/* eslint-env browser */
/* global firebase */
// MiniMaster Operator Dashboard JavaScript

const FIREBASE_CONFIG_STORAGE_KEY = "operatorFirebaseConfigOverride";
const COMMAND_BUILDER_STORAGE_KEY = "operatorCommandBuilderConfig";
const COMMISSIONING_ATTESTATION_STORAGE_KEY = "operatorCommissioningAttestations";
const P0_BLOCKER_COCKPIT_STORAGE_KEY = "operatorP0BlockerCockpit";

// ==================== SESSION TIMEOUT ====================
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 Minuten Inaktivität
let sessionTimeoutTimer = null;
let sessionWarningTimer = null;

function resetSessionTimeout() {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
    if (!auth || !auth.currentUser) return;

    // Warnung 5 Minuten vor Ablauf
    sessionWarningTimer = setTimeout(() => {
        showNotification("Ihre Sitzung läuft in 5 Minuten ab. Bewegen Sie die Maus, um eingeloggt zu bleiben.", "warning");
    }, SESSION_TIMEOUT_MS - 5 * 60 * 1000);

    // Auto-Logout nach Timeout
    sessionTimeoutTimer = setTimeout(() => {
        if (auth && auth.currentUser) {
            showNotification("Sitzung abgelaufen – automatisch abgemeldet.", "error");
            auth.signOut();
        }
    }, SESSION_TIMEOUT_MS);
}

function startSessionMonitoring() {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(evt => document.addEventListener(evt, resetSessionTimeout, { passive: true }));
    resetSessionTimeout();
}

function stopSessionMonitoring() {
    if (sessionTimeoutTimer) clearTimeout(sessionTimeoutTimer);
    if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
    sessionTimeoutTimer = null;
    sessionWarningTimer = null;
}

// Laufzeit-Erkennung: Electron Operator oder Python-Webanwendung
const isElectronOperator = Boolean(
    typeof window !== "undefined" &&
    window.miniMasterDesktop &&
    window.miniMasterDesktop.isOperatorContext
);
let isPythonOperator = false;

async function detectPythonOperatorRuntime() {
    if (isElectronOperator || typeof window === "undefined" || !window.fetch) return false;
    try {
        const response = await fetch("/api/runtime-info", {
            headers: { "Accept": "application/json" },
        });
        if (!response.ok) return false;
        const payload = await response.json();
        isPythonOperator = Boolean(payload && payload.isOperatorContext && payload.runtime === "python");
        return isPythonOperator;
    } catch (_error) {
        return false;
    }
}

function canExecuteCommandsDirectly() {
    return isElectronOperator || isPythonOperator;
}

// Firebase configuration — configure via Bootstrap-Formular or replace placeholders
const fallbackFirebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
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
let pythonCommissioningLastRun = null;
let pythonCommissioningHistoryRuns = [];
let pythonCommissioningCatalog = null;
let pythonCommissioningEvidenceHistory = [];
let pythonCommissioningEvidenceIndex = new Map();
let pythonCommissioningSelectedTestId = null;
let pythonEvidenceFilterStatus = "";
let pythonEvidenceFilterTestId = "";

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
    androidDeviceSerial: "",
    masterDeviceSerial: "",
    childDeviceSerial: "",
    masterApkPath: "masterApp/build/outputs/apk/debug/masterApp-debug.apk",
    childApkPath: "childApp/build/outputs/apk/debug/childApp-debug.apk",
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
        androidDeviceSerial: (document.getElementById("cmd-android-device-serial")?.value || "").trim(),
        masterDeviceSerial: (document.getElementById("cmd-master-device-serial")?.value || "").trim(),
        childDeviceSerial: (document.getElementById("cmd-child-device-serial")?.value || "").trim(),
        masterApkPath: (document.getElementById("cmd-master-apk-path")?.value || defaultCommandBuilderConfig.masterApkPath).trim(),
        childApkPath: (document.getElementById("cmd-child-apk-path")?.value || defaultCommandBuilderConfig.childApkPath).trim(),
    };
}

function renderCommandBuilderConfig(config) {
    const values = { ...defaultCommandBuilderConfig, ...(config || {}) };
    const mapping = {
        "cmd-workspace-path": values.workspacePath,
        "cmd-first-admin-email": values.firstAdminEmail,
        "cmd-first-admin-password": values.firstAdminPassword,
        "cmd-android-device-serial": values.androidDeviceSerial,
        "cmd-master-device-serial": values.masterDeviceSerial,
        "cmd-child-device-serial": values.childDeviceSerial,
        "cmd-master-apk-path": values.masterApkPath,
        "cmd-child-apk-path": values.childApkPath,
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

function sanitizeAdbSerial(value) {
    const serial = String(value || "").trim();
    if (!serial) return "";
    return /^[A-Za-z0-9._:-]+$/.test(serial) ? serial : "";
}

function sanitizeApkPath(value, fallbackPath) {
    const apkPath = String(value || "").trim();
    if (!apkPath) return fallbackPath;
    if (!/\.apk$/i.test(apkPath)) return fallbackPath;
    if (/[\r\n`;&|<>$"']/.test(apkPath)) return fallbackPath;
    return apkPath;
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

async function executeCommandViaPythonBridge(data) {
    const response = await fetch("/api/commands/run", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            command: data.command,
            cwd: data.cwd,
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || "Python-Bridge Fehler");
    }
    return payload;
}

function collectCommissioningAutomationContext() {
    const runtimeConfig = getOperatorConfigFormValues();
    const attestationState = getCommissioningAttestations();
    const playStoreState = getPlayStoreReadinessState();
    const validationSummary = commissioningSummary?.validationSummary || null;

    return {
        runtimeConfig,
        attestations: attestationState,
        playStoreState,
        validationSummary,
        setupChecklist: JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}"),
    };
}

function formatPythonAutomationStatus(status) {
    if (status === "pass") return "✅ PASS";
    if (status === "manual_required") return "🟡 MANUELL";
    if (status === "fail") return "❌ FAIL";
    if (status === "not_run") return "⏸ NOCH NICHT GELAUFEN";
    return "ℹ️ UNBEKANNT";
}

function getPythonAutomationStatusMeta(status) {
    if (status === "pass") {
        return { label: "PASS", className: "python-status-pass", cardClass: "status-pass" };
    }
    if (status === "manual_required") {
        return { label: "MANUELL", className: "python-status-manual_required", cardClass: "status-manual_required" };
    }
    if (status === "fail") {
        return { label: "FAIL", className: "python-status-fail", cardClass: "status-fail" };
    }
    return { label: "OFFEN", className: "python-status-not_run", cardClass: "status-not_run" };
}

function formatPythonAutomationType(type) {
    if (type === "command") return "Lokales Gate-Kommando";
    if (type === "documented") return "Dokumentierter Testplan";
    if (type === "manual") return "Manueller Nachweis";
    return "Automatisch bewertet";
}

function getPythonAutomationTypeChipClass(type) {
    if (type === "command") return "python-automation-chip-command";
    if (type === "documented") return "python-automation-chip-documented";
    if (type === "manual") return "python-automation-chip-manual";
    return "python-automation-chip-auto";
}

function shouldShowOnlyOpenAutomationChecks() {
    return Boolean(document.getElementById("python-automation-show-open-only")?.checked);
}

function getPythonAutomationCatalogFilters() {
    return {
        search: (document.getElementById("python-automation-catalog-search")?.value || "").trim().toLowerCase(),
        mode: document.getElementById("python-automation-catalog-filter")?.value || "all",
    };
}

function rerenderPythonAutomationCatalogFromCache() {
    renderPythonAutomationOverview(pythonCommissioningCatalog, pythonCommissioningLastRun);
    renderPythonAutomationCatalog(pythonCommissioningCatalog, pythonCommissioningLastRun);
}

function getPythonAutomationHistoryFilters() {
    return {
        search: (document.getElementById("python-automation-history-search")?.value || "").trim().toLowerCase(),
        openOnly: Boolean(document.getElementById("python-automation-history-open-only")?.checked),
    };
}

function rerenderPythonAutomationHistoryFromCache() {
    renderPythonAutomationHistory(pythonCommissioningHistoryRuns);
}

function setPythonAutomationEvidenceCache(payload) {
    pythonCommissioningEvidenceHistory = Array.isArray(payload?.entries) ? payload.entries : [];
    pythonCommissioningEvidenceIndex = new Map(Object.entries(payload?.latestByTestId || {}));
}

function getLatestPythonAutomationEvidence(testId) {
    if (!testId) return null;
    return pythonCommissioningEvidenceIndex.get(testId) || null;
}

function findPythonAutomationTestById(testId) {
    if (!testId || !pythonCommissioningCatalog?.groups) return null;
    for (const group of pythonCommissioningCatalog.groups) {
        for (const test of group.tests || []) {
            if (test?.id === testId) {
                return { group, test };
            }
        }
    }
    return null;
}

function formatPythonAutomationTimestamp(value) {
    if (!value) return "noch nicht protokolliert";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("de-DE");
}

function formatPythonAutomationEvidenceDetails(entry) {
    if (!entry) return "";
    const parts = [];
    if (entry.operator) parts.push(`durch ${entry.operator}`);
    if (entry.evidenceRef) parts.push(`Evidenz ${entry.evidenceRef}`);
    if (entry.notes) parts.push(entry.notes);
    return parts.join(" · ");
}

function ensurePythonAutomationSelectedTest() {
    if (findPythonAutomationTestById(pythonCommissioningSelectedTestId)) {
        return;
    }

    const allTests = pythonCommissioningCatalog?.groups?.flatMap(group => group.tests || []) || [];
    const preferred = allTests.find(test => test.automationType === "documented" || test.automationType === "manual") || allTests[0] || null;
    pythonCommissioningSelectedTestId = preferred?.id || null;
}

function openPythonAutomationProtocol(encodedTestId) {
    pythonCommissioningSelectedTestId = decodeURIComponent(encodedTestId || "");
    renderPythonAutomationProtocolEditor();
    document.getElementById("python-automation-protocol-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearPythonAutomationProtocolForm() {
    const statusEl = document.getElementById("python-automation-protocol-status");
    const operatorEl = document.getElementById("python-automation-protocol-operator");
    const evidenceRefEl = document.getElementById("python-automation-protocol-evidence-ref");
    const notesEl = document.getElementById("python-automation-protocol-notes");
    const docCheckEl = document.getElementById("python-automation-protocol-doc-check");

    if (statusEl) statusEl.value = "pass";
    if (operatorEl) operatorEl.value = "";
    if (evidenceRefEl) evidenceRefEl.value = "";
    if (notesEl) notesEl.value = "";
    if (docCheckEl) docCheckEl.checked = false;
}

function renderPythonAutomationProtocolEditor() {
    const summaryEl = document.getElementById("python-automation-protocol-selected");
    const docRowEl = document.getElementById("python-automation-protocol-doc-row");
    if (!summaryEl) return;

    ensurePythonAutomationSelectedTest();
    const selected = findPythonAutomationTestById(pythonCommissioningSelectedTestId);
    if (!selected) {
        summaryEl.innerHTML = "<div class='info'>Noch kein Testfall fuer die Protokollierung ausgewaehlt.</div>";
        clearPythonAutomationProtocolForm();
        if (docRowEl) docRowEl.style.display = "none";
        return;
    }

    const { group, test } = selected;
    const evidence = getLatestPythonAutomationEvidence(test.id);
    const evidenceDetails = evidence
        ? `<div class='python-muted-caption'>Letzter Nachweis: ${escapeHtml(formatPythonAutomationStatus(evidence.status))} · ${escapeHtml(formatPythonAutomationTimestamp(evidence.createdAt))}</div>`
        : "<div class='python-muted-caption'>Noch kein manueller Nachweis vorhanden.</div>";

    summaryEl.innerHTML = `
        <div class='python-protocol-selected-card'>
            <div class='python-test-card-header'>
                <div>
                    <h6>${escapeHtml(test.title || test.id || "Prueffall")}</h6>
                    <p class='python-muted-caption'>Gruppe: ${escapeHtml(group.title || "-")} · ID: ${escapeHtml(test.id || "-")}</p>
                </div>
                <span class='python-automation-chip ${getPythonAutomationTypeChipClass(test.automationType)}'>${escapeHtml(formatPythonAutomationType(test.automationType))}</span>
            </div>
            <p>${escapeHtml(test.description || "")}</p>
            <div class='python-test-detail'><strong>Bestanden wenn:</strong> ${escapeHtml(test.successCriteria || "-")}</div>
            ${test.documentation ? `<div class='python-test-detail python-test-doc'><strong>Dokumentation:</strong> ${escapeHtml(test.documentation)}</div>` : ""}
            ${evidenceDetails}
        </div>
    `;

    const statusEl = document.getElementById("python-automation-protocol-status");
    const operatorEl = document.getElementById("python-automation-protocol-operator");
    const evidenceRefEl = document.getElementById("python-automation-protocol-evidence-ref");
    const notesEl = document.getElementById("python-automation-protocol-notes");
    const docCheckEl = document.getElementById("python-automation-protocol-doc-check");

    if (statusEl) statusEl.value = evidence?.status || "pass";
    if (operatorEl && document.activeElement !== operatorEl) operatorEl.value = evidence?.operator || "";
    if (evidenceRefEl && document.activeElement !== evidenceRefEl) evidenceRefEl.value = evidence?.evidenceRef || "";
    if (notesEl && document.activeElement !== notesEl) notesEl.value = evidence?.notes || "";
    if (docCheckEl) docCheckEl.checked = Boolean(evidence?.documentationChecked);
    if (docRowEl) docRowEl.style.display = test.automationType === "documented" ? "flex" : "none";
}

function buildPythonAutomationRunIndex(run) {
    const map = new Map();

    if (Array.isArray(run?.evaluation?.checks)) {
        run.evaluation.checks.forEach(item => {
            if (!item?.id) return;
            map.set(item.id, {
                status: item.status || "not_run",
                details: item.details || "",
                source: item.source || "evaluation",
                evaluatedAt: run.finishedAt || run.startedAt || "",
            });
        });
    }

    if (Array.isArray(run?.commands?.results)) {
        run.commands.results.forEach(item => {
            if (!item?.id) return;
            map.set(item.id, {
                status: item.status || "not_run",
                details: item.output
                    ? `Exit-Code ${item.code ?? "-"}. ${String(item.output).slice(0, 180)}`
                    : `Exit-Code ${item.code ?? "-"}.`,
                source: "command",
                evaluatedAt: run.finishedAt || run.startedAt || "",
            });
        });
    }

    return map;
}

function getPythonAutomationTestStatus(test, run, runIndex) {
    const mapped = runIndex.get(test.id);
    if (mapped) return mapped;

    const evidence = getLatestPythonAutomationEvidence(test.id);
    if (evidence) {
        return {
            status: evidence.status || "not_run",
            details: evidence.details || formatPythonAutomationEvidenceDetails(evidence) || "Manuell protokollierter Nachweis vorhanden.",
            source: "evidence",
            evaluatedAt: evidence.createdAt || "",
            evidence,
        };
    }

    if (!run) {
        return {
            status: "not_run",
            details: test.automationType === "documented"
                ? "Dokumentierter Testplan ist erfasst, aber noch nicht als Laufnachweis protokolliert."
                : "Noch kein protokollierter Python-Lauf verfügbar.",
            source: test.source,
            evaluatedAt: "",
        };
    }

    if (test.automationType === "command") {
        if (!run?.commands?.executed) {
            return {
                status: "not_run",
                details: "Die lokalen Gate-Kommandos waren in diesem Lauf deaktiviert.",
                source: test.source,
                evaluatedAt: run.finishedAt || run.startedAt || "",
            };
        }

        return {
            status: "not_run",
            details: "Dieses Kommando wurde in diesem Lauf nicht mehr erreicht (Fail-Fast oder vorzeitiger Abbruch).",
            source: test.source,
            evaluatedAt: run.finishedAt || run.startedAt || "",
        };
    }

    return {
        status: "not_run",
        details: test.automationType === "documented"
            ? "Dokumentierter Testplan muss manuell durchlaufen und außerhalb des Dashboards belegt werden."
            : "Für diesen Prüffall liegt im ausgewählten Lauf kein Einzelstatus vor.",
        source: test.source,
        evaluatedAt: run.finishedAt || run.startedAt || "",
    };
}

function renderPythonAutomationOverview(catalog, run) {
    const overviewEl = document.getElementById("python-automation-overview");
    if (!overviewEl) return;

    if (!catalog?.summary) {
        overviewEl.innerHTML = "<div class='info'>Noch keine Python-Testfallübersicht verfügbar.</div>";
        return;
    }

    const summary = catalog.summary;
    const evalCounts = run?.evaluation?.statusCounts || {};
    const cmdCounts = run?.commands?.statusCounts || {};
    const openCount = Number(evalCounts.fail || 0) + Number(evalCounts.manual_required || 0) + Number(cmdCounts.fail || 0);
    const evidenceCount = Array.from(pythonCommissioningEvidenceIndex.values()).length;

    overviewEl.innerHTML = `
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(summary.testCount || 0))}</strong>
            <span>identifizierte Prüffälle</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(summary.automatedCount || 0))}</strong>
            <span>automatisch bewertbare Checks</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(summary.manualCount || 0))}</strong>
            <span>manuelle Nachweise</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(summary.documentedCount || 0))}</strong>
            <span>dokumentierte Testpläne</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(evidenceCount))}</strong>
            <span>Testfälle mit Nachweis</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${escapeHtml(String(summary.commandCount || 0))}</strong>
            <span>lokale Gate-Kommandos</span>
        </div>
        <div class='python-automation-metric'>
            <strong>${run ? escapeHtml(String(openCount)) : "-"}</strong>
            <span>${run ? `offene Punkte im Lauf ${escapeHtml(run.runId || "-")}` : "Noch kein Lauf ausgewählt"}</span>
        </div>
    `;
}

function renderPythonAutomationCatalog(catalog, run) {
    const catalogEl = document.getElementById("python-automation-catalog");
    if (!catalogEl) return;

    if (!catalog?.groups?.length) {
        catalogEl.innerHTML = "<div class='info'>Noch kein Python-Testkatalog geladen.</div>";
        return;
    }

    const filters = getPythonAutomationCatalogFilters();
    const runIndex = buildPythonAutomationRunIndex(run);
    const showOpenOnly = shouldShowOnlyOpenAutomationChecks();

    const renderedGroups = catalog.groups.map(group => {
        const tests = (group.tests || []).filter(test => {
            const resolved = getPythonAutomationTestStatus(test, run, runIndex);
            const status = resolved.status || "not_run";
            const haystack = [
                String(test.id || ""),
                String(test.title || ""),
                String(test.description || ""),
                String(test.source || ""),
                String(group.title || ""),
            ].join(" ").toLowerCase();

            if (showOpenOnly && !(status === "fail" || status === "manual_required" || status === "not_run")) {
                return false;
            }

            if (filters.mode === "open" && !(status === "fail" || status === "manual_required" || status === "not_run")) {
                return false;
            }

            if (filters.mode !== "all" && filters.mode !== "open" && test.automationType !== filters.mode) {
                return false;
            }

            if (filters.search && !haystack.includes(filters.search)) {
                return false;
            }

            return true;
        });

        if (tests.length === 0) {
            return "";
        }

        const cards = tests.map(test => {
            const resolved = getPythonAutomationTestStatus(test, run, runIndex);
            const statusMeta = getPythonAutomationStatusMeta(resolved.status);
            const extraCardClass = test.automationType === "documented" ? " status-documented" : "";
            const evaluatedAt = resolved.evaluatedAt
                ? new Date(resolved.evaluatedAt).toLocaleString("de-DE")
                : "noch nicht protokolliert";
            const evidence = getLatestPythonAutomationEvidence(test.id);
            const documentationHtml = test.documentation
                ? `<div class='python-test-detail python-test-doc'><strong>Dokumentation:</strong> ${escapeHtml(test.documentation)}</div>`
                : "";
            const evidenceHtml = evidence
                ? `<div class='python-test-detail'><strong>Manueller Nachweis:</strong> ${escapeHtml(formatPythonAutomationEvidenceDetails(evidence) || "Nachweis protokolliert.")}</div>`
                : "";
            const encodedTestId = encodeURIComponent(String(test.id || ""));

            return `
                <article class='python-test-card ${statusMeta.cardClass}${extraCardClass}'>
                    <div class='python-test-card-header'>
                        <div>
                            <h6>${escapeHtml(test.title || test.id || "Prüffall")}</h6>
                            <p class='python-muted-caption'>ID: ${escapeHtml(test.id || "-")} · Quelle: ${escapeHtml(test.source || "-")}</p>
                        </div>
                        <span class='python-status-badge ${statusMeta.className}'>${escapeHtml(statusMeta.label)}</span>
                    </div>
                    <div class='python-test-meta'>
                        <span class='python-automation-chip ${getPythonAutomationTypeChipClass(test.automationType)}'>${escapeHtml(formatPythonAutomationType(test.automationType))}</span>
                    </div>
                    <p>${escapeHtml(test.description || "")}</p>
                    <div class='python-test-detail'><strong>Bestanden wenn:</strong> ${escapeHtml(test.successCriteria || "-")}</div>
                    ${test.command ? `<div class='python-test-detail'><strong>Kommando:</strong> ${escapeHtml(test.command)}</div>` : ""}
                    ${documentationHtml}
                    ${evidenceHtml}
                    <div class='python-test-detail'><strong>Letzte Bewertung:</strong> ${escapeHtml(resolved.details || "Kein Detail verfügbar.")}</div>
                    <div class='python-muted-caption'>Zuletzt bewertet: ${escapeHtml(evaluatedAt)}</div>
                    <div class='python-test-actions'>
                        <button class='btn btn-secondary btn-sm' onclick="openPythonAutomationProtocol('${encodedTestId}')">Bewerten &amp; protokollieren</button>
                    </div>
                </article>
            `;
        }).join("");

        return `
            <section class='python-automation-group'>
                <h6>${escapeHtml(group.title || "Testgruppe")}</h6>
                <p>${escapeHtml(group.description || "")}</p>
                <div class='python-automation-card-grid'>
                    ${cards}
                </div>
            </section>
        `;
    }).filter(Boolean);

    if (renderedGroups.length === 0) {
        catalogEl.innerHTML = "<div class='info'>Keine Testfälle passen auf die aktuellen Filter.</div>";
        return;
    }

    catalogEl.innerHTML = renderedGroups.join("");
}

async function loadPythonAutomationCatalog() {
    const catalogEl = document.getElementById("python-automation-catalog");
    if (!catalogEl) return;

    if (!isPythonOperator) {
        pythonCommissioningCatalog = null;
        renderPythonAutomationOverview(null, pythonCommissioningLastRun);
        catalogEl.innerHTML = "<div class='info'>Der Python-Testkatalog ist nur im Python-Operator verfügbar.</div>";
        return;
    }

    catalogEl.innerHTML = "<div class='loading'>Lade Python-Testkatalog...</div>";
    try {
        const response = await fetch("/api/commissioning/catalog", {
            headers: { "Accept": "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Testkatalog konnte nicht geladen werden.");
        }
        pythonCommissioningCatalog = payload;
        ensurePythonAutomationSelectedTest();
        renderPythonAutomationOverview(payload, pythonCommissioningLastRun);
        renderPythonAutomationCatalog(payload, pythonCommissioningLastRun);
        renderPythonAutomationProtocolEditor();
    } catch (error) {
        pythonCommissioningCatalog = null;
        renderPythonAutomationOverview(null, pythonCommissioningLastRun);
        catalogEl.innerHTML = `<div class='error'>Testkatalog konnte nicht geladen werden: ${escapeHtml(error.message)}</div>`;
    }
}

function renderPythonAutomationResult(run) {
    const resultEl = document.getElementById("python-automation-results");
    if (!resultEl) return;

    if (!run) {
        resultEl.innerHTML = "<div class='info'>Noch kein Python-Automationslauf ausgeführt.</div>";
        return;
    }

    const evaluation = run.evaluation || {};
    const checksRaw = Array.isArray(evaluation.checks) ? evaluation.checks : [];
    const checks = shouldShowOnlyOpenAutomationChecks()
        ? checksRaw.filter(item => item?.status === "fail" || item?.status === "manual_required")
        : checksRaw;
    const commands = Array.isArray(run.commands?.results) ? run.commands.results : [];
    const pending = Array.isArray(run.pending) ? run.pending : [];
    const evalCounts = run.evaluation?.statusCounts || {};
    const cmdCounts = run.commands?.statusCounts || {};

    renderPythonAutomationOverview(pythonCommissioningCatalog, run);
    renderPythonAutomationCatalog(pythonCommissioningCatalog, run);

    const checksRows = checks.map(item => `
        <tr>
            <td>${escapeHtml(item.title || "-")}</td>
            <td>${escapeHtml(formatPythonAutomationStatus(item.status))}</td>
            <td>${escapeHtml(item.details || "-")}</td>
        </tr>
    `).join("");

    const commandRows = commands.length > 0
        ? commands.map(item => `
            <tr>
                <td>${escapeHtml(item.label || "-")}</td>
                <td>${escapeHtml(item.command || "-")}</td>
                <td>${escapeHtml(item.status === "pass" ? "✅ PASS" : "❌ FAIL")}</td>
                <td>${escapeHtml(String(item.code ?? "-"))}</td>
                <td>${escapeHtml(String(item.durationMs ?? "-"))} ms</td>
            </tr>
            <tr>
                <td colspan='5'>
                    <details>
                        <summary>Kommandoausgabe anzeigen</summary>
                        <pre class='code-block'>${escapeHtml(item.output || "Keine Ausgabe.")}</pre>
                    </details>
                </td>
            </tr>
        `).join("")
        : "<tr><td colspan='5'>Keine lokalen Kommandos ausgeführt.</td></tr>";

    const pendingFiltered = shouldShowOnlyOpenAutomationChecks()
        ? pending.filter(item => item.status === "fail" || item.status === "manual_required")
        : pending;
    const pendingHtml = pendingFiltered.length > 0
        ? `<ul>${pendingFiltered.map(item => `<li><strong>${escapeHtml(item.title || "Offener Punkt")}</strong>: ${escapeHtml(item.details || "")}</li>`).join("")}</ul>`
        : "<div class='success-box'>Keine offenen Punkte aus dem Python-Lauf.</div>";

    const evCov = run.evidenceCoverage || {};
    const evCounts = evCov.counts || {};
    const evOverall = evCov.overall || "pass";
    const evScore = typeof evCov.coverageScore === "number" ? evCov.coverageScore : 100;
    const evUncoveredRows = Array.isArray(evCov.uncovered) && evCov.uncovered.length > 0
        ? evCov.uncovered.map(item => `
            <tr>
                <td>${escapeHtml(item.testTitle || item.testId || "-")}</td>
                <td>${escapeHtml(item.automationType || "-")}</td>
                <td>${escapeHtml(item.groupTitle || "-")}</td>
                <td><button class='btn btn-secondary btn-sm' onclick="openPythonAutomationProtocol('${encodeURIComponent(String(item.testId || ""))}')">Protokollieren</button></td>
            </tr>
        `).join("")
        : null;
    const evFailedRows = Array.isArray(evCov.failedEvidence) && evCov.failedEvidence.length > 0
        ? evCov.failedEvidence.map(item => `
            <tr>
                <td>${escapeHtml(item.testTitle || item.testId || "-")}</td>
                <td>${escapeHtml(item.groupTitle || "-")}</td>
                <td>${escapeHtml(item.operator || "-")}</td>
                <td>${escapeHtml(item.details || "-")}</td>
                <td><button class='btn btn-secondary btn-sm' onclick="openPythonAutomationProtocol('${encodeURIComponent(String(item.testId || ""))}')">Korrigieren</button></td>
            </tr>
        `).join("")
        : null;

    const evidenceSectionHtml = (evCounts.total > 0) ? `
        <h5 style='margin-block-start: 16px'>Nachweis-Abdeckung (Manuell &amp; Dokumentiert)</h5>
        <div class='python-result-summary' style='margin-block-end: 10px'>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evScore))} %</strong>
                <span>Nachweis-Score</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evCounts.covered || 0))}</strong>
                <span>Abgedeckt</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evCounts.uncovered || 0))}</strong>
                <span>Ohne Nachweis</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evCounts.failed || 0))}</strong>
                <span>Nachweis FAIL</span>
            </div>
        </div>
        ${evUncoveredRows ? `
            <details open>
                <summary><strong>Fehlende Nachweise (${escapeHtml(String(evCounts.uncovered || 0))})</strong></summary>
                <table style='margin-block-start: 6px'>
                    <tr><th>Testfall</th><th>Typ</th><th>Gruppe</th><th>Aktion</th></tr>
                    ${evUncoveredRows}
                </table>
            </details>
        ` : `<div class='success-box' style='margin-block-end: 8px'>Alle manuellen/dokumentierten Testfälle haben Nachweise.</div>`}
        ${evFailedRows ? `
            <details open>
                <summary><strong>Fehlgeschlagene Nachweise (${escapeHtml(String(evCounts.failed || 0))})</strong></summary>
                <table style='margin-block-start: 6px'>
                    <tr><th>Testfall</th><th>Gruppe</th><th>Operator</th><th>Details</th><th>Aktion</th></tr>
                    ${evFailedRows}
                </table>
            </details>
        ` : ""}
    ` : "";

    resultEl.innerHTML = `
        <div class='${run.overall === "pass" ? "success-box" : run.overall === "manual_required" ? "warning-box" : "error"}'>
            <strong>Gesamtstatus:</strong> ${escapeHtml(formatPythonAutomationStatus(run.overall))}<br />
            <strong>Run-ID:</strong> ${escapeHtml(run.runId || "-")}<br />
            <strong>Zeit:</strong> ${escapeHtml(run.startedAt || "-")} → ${escapeHtml(run.finishedAt || "-")}
        </div>

        <div class='python-result-summary'>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evalCounts.pass || 0))}</strong>
                <span>Checks bestanden</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evalCounts.fail || 0))}</strong>
                <span>Checks fehlgeschlagen</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(evalCounts.manual_required || 0))}</strong>
                <span>manuelle Punkte offen</span>
            </div>
            <div class='python-automation-metric'>
                <strong>${escapeHtml(String(cmdCounts.pass || 0))}/${escapeHtml(String(cmdCounts.fail || 0))}</strong>
                <span>Kommandos Pass/Fail</span>
            </div>
        </div>

        <h5 style='margin-block-start: 10px'>Automatisierte Bewertung</h5>
        ${shouldShowOnlyOpenAutomationChecks() ? "<p class='python-muted-caption'>Aktiver Filter: Es werden nur offene oder fehlgeschlagene Checks angezeigt.</p>" : ""}
        <table>
            <tr><th>Check</th><th>Status</th><th>Details</th></tr>
            ${checksRows || "<tr><td colspan='3'>Keine Checks vorhanden.</td></tr>"}
        </table>

        <h5 style='margin-block-start: 10px'>Kommandolauf</h5>
        <table>
            <tr><th>Schritt</th><th>Befehl</th><th>Status</th><th>Code</th><th>Dauer</th></tr>
            ${commandRows}
        </table>

        ${evidenceSectionHtml}

        <h5 style='margin-block-start: 10px'>Offene Punkte</h5>
        ${pendingHtml}
    `;
}

function mergePythonPendingIntoCommissioning(run) {
    if (!run || !Array.isArray(run.pending)) return;
    if (!commissioningSummary) refreshCommissioningReport();
    if (!commissioningSummary) return;

    const existing = Array.isArray(commissioningSummary.pending) ? [...commissioningSummary.pending] : [];
    const incoming = run.pending
        .map(item => (item?.title ? `${item.title}: ${item.details || ""}`.trim() : ""))
        .filter(Boolean)
        .map(text => `Python-Automation: ${text}`);

    const deduped = Array.from(new Set([...existing, ...incoming]));
    commissioningSummary.pending = deduped;
    renderCommissioningReport(commissioningSummary);
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
}

async function runPythonAutomationSuite() {
    const resultEl = document.getElementById("python-automation-results");
    if (!resultEl) return;

    if (!isPythonOperator) {
        resultEl.innerHTML = `
            <div class='warning-box'>
                <strong>⚙️ Python-Server nicht erkannt</strong><br />
                Die Python-basierte Testzentrale ist nur verfügbar, wenn das Dashboard über
                <code>start.bat</code> oder <code>python -m python_admin.app</code> gestartet wurde.<br />
                <strong>Aktuell erkannte Zugriffsart:</strong> file:// oder fremder HTTP-Server – kein Python-Operator.<br />
                <br />
                <strong>Lösung:</strong> <code>start.bat</code> ausführen oder manuell
                <code>python -m python_admin.app</code> starten und dann
                <a href="http://127.0.0.1:8765/admin-panel/" target="_blank">http://127.0.0.1:8765/admin-panel/</a> öffnen.
            </div>
        `;
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Starte Python-Automationslauf...</div>";

    const runCommands = Boolean(document.getElementById("python-automation-run-commands")?.checked);
    const refreshValidation = Boolean(document.getElementById("python-automation-refresh-validation")?.checked);
    const timeoutRaw = parseInt(document.getElementById("python-automation-timeout")?.value || "1800", 10);
    const timeoutSec = Number.isFinite(timeoutRaw) ? Math.min(7200, Math.max(30, timeoutRaw)) : 1800;

    try {
        if (refreshValidation) {
            resultEl.innerHTML = "<div class='loading'>Aktualisiere Full Validation vor dem Python-Lauf...</div>";
            await runFullSetupValidation();
            refreshCommissioningReport();
        }

        const response = await fetch("/api/commissioning/run", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({
                context: collectCommissioningAutomationContext(),
                options: {
                    runCommands,
                    timeoutSec,
                },
            }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Python-Automationslauf fehlgeschlagen.");
        }

        pythonCommissioningLastRun = payload;
        renderPythonAutomationResult(payload);
        mergePythonPendingIntoCommissioning(payload);
        if (!pythonCommissioningCatalog) {
            await loadPythonAutomationCatalog();
        }
        await loadPythonAutomationHistory();

        const level = payload.overall === "pass" ? "success" : "warning";
        showNotification("Python-Automationslauf abgeschlossen: " + formatPythonAutomationStatus(payload.overall), level);
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Python-Automationslauf fehlgeschlagen: ${escapeHtml(error.message)}</div>`;
        showNotification("Python-Automationslauf fehlgeschlagen: " + error.message, "error");
    }
}

function renderPythonAutomationHistory(runs) {
    const historyEl = document.getElementById("python-automation-history");
    if (!historyEl) return;

    pythonCommissioningHistoryRuns = Array.isArray(runs) ? runs : [];

    if (!Array.isArray(runs) || runs.length === 0) {
        historyEl.innerHTML = "<div class='info'>Noch keine Läufe protokolliert.</div>";
        if (!pythonCommissioningLastRun) {
            renderPythonAutomationOverview(pythonCommissioningCatalog, null);
            renderPythonAutomationCatalog(pythonCommissioningCatalog, null);
        }
        return;
    }

    const filters = getPythonAutomationHistoryFilters();
    const filteredRuns = runs.filter(item => {
        if (filters.openOnly) {
            const counts = item?.evaluation?.statusCounts || {};
            const openCount = Number(counts.fail || 0) + Number(counts.manual_required || 0);
            if (openCount <= 0) return false;
        }

        if (!filters.search) return true;
        const haystack = [
            String(item?.runId || ""),
            String(item?.overall || ""),
            String(item?.startedAt || ""),
            String(item?.finishedAt || ""),
        ].join(" ").toLowerCase();
        return haystack.includes(filters.search);
    });

    if (filteredRuns.length === 0) {
        historyEl.innerHTML = "<div class='info'>Keine Läufe passen auf die aktuellen Filter.</div>";
        return;
    }

    const rows = filteredRuns.map((item) => {
        const originalIndex = runs.indexOf(item);
        const cmdCounts = item?.commands?.statusCounts || {};
        const evalCounts = item?.evaluation?.statusCounts || {};
        return `
            <tr>
                <td>${escapeHtml(item.runId || "-")}</td>
                <td>${escapeHtml(item.startedAt || "-")}</td>
                <td>${escapeHtml(formatPythonAutomationStatus(item.overall || ""))}</td>
                <td>${escapeHtml(String(evalCounts.pass || 0))}/${escapeHtml(String(evalCounts.fail || 0))}/${escapeHtml(String(evalCounts.manual_required || 0))}</td>
                <td>${escapeHtml(String(cmdCounts.pass || 0))}/${escapeHtml(String(cmdCounts.fail || 0))}</td>
                <td><button class='btn btn-secondary btn-sm' onclick='showPythonAutomationHistoryRun(${originalIndex})'>Anzeigen</button></td>
            </tr>
        `;
    }).join("");

    historyEl.innerHTML = `
        <div class='info' style='margin-block-end: 8px'>${escapeHtml(String(filteredRuns.length))} von ${escapeHtml(String(runs.length))} Lauf/Läufe sichtbar.</div>
        <table>
            <tr>
                <th>Run-ID</th>
                <th>Start</th>
                <th>Status</th>
                <th>Checks (Pass/Fail/Manuell)</th>
                <th>Kommandos (Pass/Fail)</th>
                <th>Details</th>
            </tr>
            ${rows}
        </table>
    `;
}

function showPythonAutomationHistoryRun(index) {
    const selected = pythonCommissioningHistoryRuns[index];
    if (!selected) {
        showNotification("Historienlauf konnte nicht geladen werden.", "error");
        return;
    }
    pythonCommissioningLastRun = selected;
    renderPythonAutomationResult(selected);
    showNotification("Historienlauf geladen: " + (selected.runId || "-"), "info");
}

async function loadPythonAutomationHistory() {
    const historyEl = document.getElementById("python-automation-history");
    if (!historyEl) return;

    if (!isPythonOperator) {
        historyEl.innerHTML = "<div class='info'>Historie ist nur im Python-Operator verfügbar.</div>";
        return;
    }

    historyEl.innerHTML = "<div class='loading'>Lade Laufhistorie...</div>";
    try {
        const response = await fetch("/api/commissioning/history?limit=10", {
            headers: { "Accept": "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Historie konnte nicht geladen werden.");
        }
        const runs = payload.runs || [];
        if (!pythonCommissioningLastRun && runs.length > 0) {
            pythonCommissioningLastRun = runs[0];
            renderPythonAutomationResult(runs[0]);
        }
        renderPythonAutomationHistory(runs);
    } catch (error) {
        historyEl.innerHTML = `<div class='error'>Historie konnte nicht geladen werden: ${escapeHtml(error.message)}</div>`;
    }
}

function renderPythonAutomationEvidenceHistory(entries) {
    const historyEl = document.getElementById("python-automation-protocol-history");
    if (!historyEl) return;

    if (!Array.isArray(entries) || entries.length === 0) {
        historyEl.innerHTML = `
            ${buildPythonEvidenceFilterToolbar([])}
            <div class='info'>Noch keine manuellen Nachweise protokolliert.</div>
        `;
        return;
    }

    const statusFilter = pythonEvidenceFilterStatus.trim().toLowerCase();
    const testIdFilter = pythonEvidenceFilterTestId.trim().toLowerCase();
    const filtered = entries.filter(entry => {
        if (statusFilter && String(entry.status || "").toLowerCase() !== statusFilter) return false;
        if (testIdFilter) {
            const byId = String(entry.testId || "").toLowerCase().includes(testIdFilter);
            const byTitle = String(entry.testTitle || "").toLowerCase().includes(testIdFilter);
            if (!byId && !byTitle) return false;
        }
        return true;
    });

    const rows = filtered.map(entry => {
        const encodedTestId = encodeURIComponent(String(entry.testId || ""));
        return `
            <tr>
                <td>${escapeHtml(formatPythonAutomationTimestamp(entry.createdAt))}</td>
                <td>${escapeHtml(entry.testTitle || entry.testId || "-")}</td>
                <td>${escapeHtml(formatPythonAutomationStatus(entry.status || ""))}</td>
                <td>${escapeHtml(entry.operator || "-")}</td>
                <td>${escapeHtml(entry.evidenceRef || entry.notes || "-")}</td>
                <td><button class='btn btn-secondary btn-sm' onclick="openPythonAutomationProtocol('${encodedTestId}')">Oeffnen</button></td>
            </tr>
        `;
    }).join("");

    const summary = filtered.length < entries.length
        ? `<p class='python-muted-caption'>${escapeHtml(String(filtered.length))} von ${escapeHtml(String(entries.length))} Nachweisen werden angezeigt.</p>`
        : "";

    historyEl.innerHTML = `
        ${buildPythonEvidenceFilterToolbar(entries)}
        ${summary}
        ${rows ? `
            <table>
                <tr>
                    <th>Zeit</th>
                    <th>Testfall</th>
                    <th>Status</th>
                    <th>Operator</th>
                    <th>Evidenz / Notiz</th>
                    <th>Aktion</th>
                </tr>
                ${rows}
            </table>
        ` : "<div class='info'>Keine Nachweise entsprechen dem aktuellen Filter.</div>"}
    `;
}

function buildPythonEvidenceFilterToolbar(entries) {
    const distinctTestIds = [...new Set(
        (Array.isArray(entries) ? entries : [])
            .filter(e => e.testId)
            .map(e => ({ id: String(e.testId), title: String(e.testTitle || e.testId) }))
            .map(e => JSON.stringify(e))
    )].map(s => JSON.parse(s));

    const testOptions = distinctTestIds.map(({ id, title }) =>
        `<option value="${escapeHtml(id)}" ${pythonEvidenceFilterTestId === id ? "selected" : ""}>${escapeHtml(title)}</option>`
    ).join("");

    return `
        <div class='python-evidence-filter-bar'>
            <label>
                Status:
                <select id='py-evidence-filter-status' onchange='applyPythonEvidenceFilter()'>
                    <option value=''>Alle</option>
                    <option value='pass' ${pythonEvidenceFilterStatus === "pass" ? "selected" : ""}>✅ Pass</option>
                    <option value='fail' ${pythonEvidenceFilterStatus === "fail" ? "selected" : ""}>❌ Fail</option>
                    <option value='manual_required' ${pythonEvidenceFilterStatus === "manual_required" ? "selected" : ""}>⚠️ Manuell prüfen</option>
                </select>
            </label>
            <label>
                Testfall:
                <select id='py-evidence-filter-testid' onchange='applyPythonEvidenceFilter()'>
                    <option value=''>Alle</option>
                    ${testOptions}
                </select>
            </label>
            <button class='btn btn-secondary btn-sm' onclick='resetPythonEvidenceFilter()'>Filter zurücksetzen</button>
        </div>
    `;
}

function applyPythonEvidenceFilter() {
    pythonEvidenceFilterStatus = document.getElementById("py-evidence-filter-status")?.value || "";
    pythonEvidenceFilterTestId = document.getElementById("py-evidence-filter-testid")?.value || "";
    renderPythonAutomationEvidenceHistory(pythonCommissioningEvidenceHistory);
}

function resetPythonEvidenceFilter() {
    pythonEvidenceFilterStatus = "";
    pythonEvidenceFilterTestId = "";
    renderPythonAutomationEvidenceHistory(pythonCommissioningEvidenceHistory);
}


async function loadPythonAutomationEvidenceHistory() {
    const historyEl = document.getElementById("python-automation-protocol-history");
    if (!historyEl) return;

    if (!isPythonOperator) {
        historyEl.innerHTML = "<div class='info'>Nachweis-Historie ist nur im Python-Operator verfuegbar.</div>";
        return;
    }

    historyEl.innerHTML = "<div class='loading'>Lade Nachweis-Historie...</div>";
    try {
        const response = await fetch("/api/commissioning/evidence?limit=80", {
            headers: { "Accept": "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Nachweis-Historie konnte nicht geladen werden.");
        }
        setPythonAutomationEvidenceCache(payload);
        renderPythonAutomationOverview(pythonCommissioningCatalog, pythonCommissioningLastRun);
        renderPythonAutomationCatalog(pythonCommissioningCatalog, pythonCommissioningLastRun);
        renderPythonAutomationEvidenceHistory(pythonCommissioningEvidenceHistory);
        renderPythonAutomationProtocolEditor();
    } catch (error) {
        historyEl.innerHTML = `<div class='error'>Nachweis-Historie konnte nicht geladen werden: ${escapeHtml(error.message)}</div>`;
    }
}

async function savePythonAutomationEvidence() {
    if (!isPythonOperator) {
        showNotification("Nachweise koennen nur im Python-Operator gespeichert werden.", "error");
        return;
    }

    const selected = findPythonAutomationTestById(pythonCommissioningSelectedTestId);
    if (!selected) {
        showNotification("Bitte zuerst einen Testfall fuer die Protokollierung auswaehlen.", "error");
        return;
    }

    const status = document.getElementById("python-automation-protocol-status")?.value || "pass";
    const operator = (document.getElementById("python-automation-protocol-operator")?.value || "").trim();
    const evidenceRef = (document.getElementById("python-automation-protocol-evidence-ref")?.value || "").trim();
    const notes = (document.getElementById("python-automation-protocol-notes")?.value || "").trim();
    const documentationChecked = Boolean(document.getElementById("python-automation-protocol-doc-check")?.checked);

    if (!operator) {
        showNotification("Bitte den Operator fuer den Nachweis angeben.", "error");
        return;
    }

    try {
        const response = await fetch("/api/commissioning/evidence", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify({
                testId: selected.test.id,
                status,
                operator,
                evidenceRef,
                notes,
                documentationChecked,
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || "Nachweis konnte nicht gespeichert werden.");
        }

        await loadPythonAutomationEvidenceHistory();
        if (pythonCommissioningLastRun) {
            renderPythonAutomationResult(pythonCommissioningLastRun);
        } else {
            rerenderPythonAutomationCatalogFromCache();
        }
        showNotification(`Nachweis gespeichert fuer ${selected.test.title || selected.test.id}.`, "success");
    } catch (error) {
        showNotification("Nachweis konnte nicht gespeichert werden: " + error.message, "error");
    }
}

function exportLatestPythonAutomationRun() {
    if (!pythonCommissioningLastRun) {
        showNotification("Es liegt noch kein Python-Automationslauf zum Export vor.", "info");
        return;
    }

    const blob = new Blob([JSON.stringify(pythonCommissioningLastRun, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `python_commissioning_run_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Python-Automationslauf exportiert.", "success");
}

async function executeCommandDirect(payload) {
    if (!canExecuteCommandsDirectly()) {
        showNotification("Direkte CLI-/PowerShell-Ausführung ist nur im Operator-Desktop-Modus oder in der Python-Webanwendung verfügbar.", "error");
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

    // Live-Output Listener nur im Electron-Modus
    if (isElectronOperator) {
        if (cliOutputCleanup) cliOutputCleanup();
        cliOutputCleanup = window.miniMasterDesktop.onCLIOutput((msg) => {
            if (outputEl) {
                outputEl.textContent += msg.data;
                outputEl.scrollTop = outputEl.scrollHeight;
            }
        });
    }

    try {
        const result = isElectronOperator
            ? await window.miniMasterDesktop.runCLI(data.command, data.cwd)
            : await executeCommandViaPythonBridge(data);
        activeCLICommandId = null;
        if (cliOutputCleanup) { cliOutputCleanup(); cliOutputCleanup = null; }
        if (outputEl && !isElectronOperator) {
            outputEl.textContent = result.output || "";
            outputEl.scrollTop = outputEl.scrollHeight;
        }

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

    const executeBtn = canExecuteCommandsDirectly()
        ? `<button onclick="executeCommandDirect('${payload}')" class="btn btn-execute btn-sm">▶ Ausführen</button>`
        : "";

    const outputArea = canExecuteCommandsDirectly()
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
    const rawAdbSerial = String(values.androidDeviceSerial || "").trim();
    const adbSerial = sanitizeAdbSerial(rawAdbSerial);
    const hasInvalidAdbSerial = Boolean(rawAdbSerial) && !adbSerial;
    const rawMasterDeviceSerial = String(values.masterDeviceSerial || rawAdbSerial).trim();
    const rawChildDeviceSerial = String(values.childDeviceSerial || rawAdbSerial).trim();
    const masterDeviceSerial = sanitizeAdbSerial(rawMasterDeviceSerial);
    const childDeviceSerial = sanitizeAdbSerial(rawChildDeviceSerial);
    const hasInvalidMasterDeviceSerial = Boolean(rawMasterDeviceSerial) && !masterDeviceSerial;
    const hasInvalidChildDeviceSerial = Boolean(rawChildDeviceSerial) && !childDeviceSerial;
    const adbDeviceTarget = hasInvalidAdbSerial
        ? '-s "REPLACE_WITH_DEVICE_SERIAL" '
        : (adbSerial ? `-s "${adbSerial}" ` : "");
    const masterApkPath = sanitizeApkPath(values.masterApkPath, defaultCommandBuilderConfig.masterApkPath);
    const childApkPath = sanitizeApkPath(values.childApkPath, defaultCommandBuilderConfig.childApkPath);
    const hasInvalidMasterApkPath = Boolean(String(values.masterApkPath || "").trim()) && masterApkPath !== values.masterApkPath.trim();
    const hasInvalidChildApkPath = Boolean(String(values.childApkPath || "").trim()) && childApkPath !== values.childApkPath.trim();

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
            id: "android-install-master-apk",
            label: "Eltern-App auf Mobiltelefon installieren",
            description: hasInvalidAdbSerial
                ? "Ungültige Device-Serial erkannt. Bitte nur Zeichen wie A-Z, 0-9, Punkt, Unterstrich, Doppelpunkt, Bindestrich verwenden."
                : (hasInvalidMasterApkPath
                    ? "Ungültiger APK-Pfad erkannt. Es wird automatisch der Standardpfad verwendet."
                    : "Installiert die MasterApp-APK per ADB auf dem verbundenen Android-Gerät."),
            command: `adb ${adbDeviceTarget}install -r "${masterApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-install-master-app",
        },
        {
            id: "android-install-child-apk",
            label: "Kinder-App auf Mobiltelefon installieren",
            description: hasInvalidAdbSerial
                ? "Ungültige Device-Serial erkannt. Bitte nur Zeichen wie A-Z, 0-9, Punkt, Unterstrich, Doppelpunkt, Bindestrich verwenden."
                : (hasInvalidChildApkPath
                    ? "Ungültiger APK-Pfad erkannt. Es wird automatisch der Standardpfad verwendet."
                    : "Installiert die ChildApp-APK per ADB auf dem verbundenen Android-Gerät."),
            command: `adb ${adbDeviceTarget}install -r "${childApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-install-child-app",
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

        // ─── USB-Debug-Schnittstelle: Eltern-App ───────────────────────────────
        {
            id: "debug-master-challenge",
            label: "[Debug] Eltern-App: Challenge anfordern",
            description: "Fordert einen einmaligen HMAC-Nonce für die Eltern-App an und liest ihn aus dem Logcat. Danach scripts/generate-debug-token.ps1 ausführen.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.minimaster.masterapp.DEBUG_GET_CHALLENGE\nadb ${adbDeviceTarget}logcat -s MINIMASTER_DEBUG_CHALLENGE -d -T 1`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-master-challenge",
        },
        {
            id: "debug-master-activate",
            label: "[Debug] Eltern-App: Session aktivieren",
            description: "Aktiviert die Debug-Session. TOKEN aus generate-debug-token.ps1 ersetzen. Gültig für 30 Minuten.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.minimaster.masterapp.DEBUG_ACTIVATE -e response REPLACE_WITH_TOKEN`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-master-activate",
        },
        {
            id: "debug-master-deactivate",
            label: "[Debug] Eltern-App: Session beenden",
            description: "Beendet die aktive Debug-Session der Eltern-App sofort.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.minimaster.masterapp.DEBUG_DEACTIVATE`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-master-deactivate",
        },
        {
            id: "debug-master-dump-state",
            label: "[Debug] Eltern-App: Status abfragen",
            description: "Gibt den aktuellen App-Status als JSON ins Logcat aus (Session muss aktiv sein).",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.minimaster.masterapp.DEBUG_DUMP_STATE\nadb ${adbDeviceTarget}logcat -s MINIMASTER_DEBUG_STATE -d -T 1`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-master-dump",
        },

        // ─── USB-Debug-Schnittstelle: Kinder-App ───────────────────────────────
        {
            id: "debug-child-challenge",
            label: "[Debug] Kinder-App: Challenge anfordern",
            description: "Fordert einen einmaligen HMAC-Nonce für die Kinder-App an und liest ihn aus dem Logcat.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.google.pairing.DEBUG_GET_CHALLENGE\nadb ${adbDeviceTarget}logcat -s MINIMASTER_DEBUG_CHALLENGE_CHILD -d -T 1`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-child-challenge",
        },
        {
            id: "debug-child-activate",
            label: "[Debug] Kinder-App: Session aktivieren",
            description: "Aktiviert die Debug-Session. TOKEN aus generate-debug-token.ps1 -AppId child ersetzen.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.google.pairing.DEBUG_ACTIVATE -e response REPLACE_WITH_TOKEN`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-child-activate",
        },
        {
            id: "debug-child-deactivate",
            label: "[Debug] Kinder-App: Session beenden",
            description: "Beendet die aktive Debug-Session der Kinder-App sofort.",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.google.pairing.DEBUG_DEACTIVATE`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-child-deactivate",
        },
        {
            id: "debug-child-dump-state",
            label: "[Debug] Kinder-App: Status abfragen",
            description: "Gibt den aktuellen App-Status als JSON ins Logcat aus (Session muss aktiv sein).",
            command: `adb ${adbDeviceTarget}shell am broadcast -a com.google.pairing.DEBUG_DUMP_STATE\nadb ${adbDeviceTarget}logcat -s MINIMASTER_DEBUG_STATE_CHILD -d -T 1`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-child-dump",
        },

        // ─── USB-Test-Orchestrierung ────────────────────────────────────────────
        {
            id: "debug-usb-run-tests-master",
            label: "[Debug] USB-Tests: Eltern-App (vollständig)",
            description: "Vollautomatischer USB-Testlauf: Challenge → Token → Aktivierung → connectedDebugAndroidTest → Deaktivierung → Ergebnisübersicht.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial "${adbSerial || "auto"}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-master",
        },
        {
            id: "debug-usb-run-tests-master-install",
            label: "[Debug] USB-Tests: Eltern-App inkl. APK-Install",
            description: hasInvalidMasterApkPath
                ? "Ungültiger Master-APK-Pfad erkannt. Es wird der Standardpfad verwendet."
                : "Installiert die Eltern-App-APK vor dem USB-Testlauf über die integrierte Runner-Schnittstelle.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial "${adbSerial || "auto"}" -InstallApk -ApkPath "${masterApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-master-install",
        },
        {
            id: "debug-usb-run-tests-child",
            label: "[Debug] USB-Tests: Kinder-App (vollständig)",
            description: "Vollautomatischer USB-Testlauf für die Kinder-App mit Ampelausgabe.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial "${adbSerial || "auto"}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-child",
        },
        {
            id: "debug-usb-run-tests-child-install",
            label: "[Debug] USB-Tests: Kinder-App inkl. APK-Install",
            description: hasInvalidChildApkPath
                ? "Ungültiger Child-APK-Pfad erkannt. Es wird der Standardpfad verwendet."
                : "Installiert die Kinder-App-APK vor dem USB-Testlauf über die integrierte Runner-Schnittstelle.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial "${adbSerial || "auto"}" -InstallApk -ApkPath "${childApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-child-install",
        },
        {
            id: "debug-usb-run-tests-all",
            label: "[Debug] USB-Tests: Beide Apps (sequenziell)",
            description: "Führt die vollständigen USB-Tests für Eltern- und Kinder-App nacheinander aus.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial "${adbSerial || "auto"}"\npwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial "${adbSerial || "auto"}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-all",
        },
        {
            id: "debug-usb-run-tests-all-install",
            label: "[Debug] USB-Tests: Beide Apps inkl. APK-Install",
            description: "Führt die USB-Tests für Eltern- und Kinder-App nacheinander aus und installiert zuvor beide APKs über die Runner-Schnittstelle.",
            command: `pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial "${adbSerial || "auto"}" -InstallApk -ApkPath "${masterApkPath}"\npwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial "${adbSerial || "auto"}" -InstallApk -ApkPath "${childApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-tests-all-install",
        },
        {
            id: "debug-usb-run-dual-install",
            label: "[Debug] USB-Tests: Dual-Runner inkl. APK-Install",
            description: (hasInvalidMasterDeviceSerial || hasInvalidChildDeviceSerial)
                ? "Ungültige Master-/Child-Serial erkannt. Bitte nur Zeichen wie A-Z, 0-9, Punkt, Unterstrich, Doppelpunkt, Bindestrich verwenden."
                : "Startet den Dual-Runner mit integrierter APK-Installation und getrennten Master-/Child-Serials.",
            command: `pwsh -File scripts/run-dual-device-commissioning.ps1 -MasterSerial "${masterDeviceSerial || "MASTER_SERIAL"}" -ChildSerial "${childDeviceSerial || "CHILD_SERIAL"}" -InstallApk -MasterApkPath "${masterApkPath}" -ChildApkPath "${childApkPath}"`,
            cwd: values.workspacePath,
            fileName: "minimaster-debug-usb-dual-install",
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


function getPriorityWeight(severity) {
    if (severity === "critical") return 300;
    if (severity === "high") return 200;
    if (severity === "medium") return 100;
    return 50;
}

function buildPrioritizedActionPlan() {
    const validation = commissioningSummary?.validationSummary || null;
    const validationChecks = validation?.checks || {};
    const platformState = getPlatformReadiness();
    const playStoreState = getPlayStoreReadinessState();
    const missingAttestations = commissioningAttestationItems.filter(item => !getCommissioningAttestations()[item.key]);
    const steps = [];

    const playStoreChecks = [
        { key: "dataSafety", label: "Data-Safety-Formular in Play Console finalisieren" },
        { key: "iarc", label: "IARC-Altersfreigabe abschließen" },
        { key: "listing", label: "Store Listing vollständig vorbereiten" },
        { key: "privacyUrlLinked", label: "Privacy-Policy-URL in Store und App konsistent verlinken" },
        { key: "permissionsDeclaration", label: "Permissions Declaration (Accessibility/Usage/Overlay) einreichen" },
        { key: "appAccessGuide", label: "App-Access-Anleitung für Play-Reviewer hinterlegen" },
        { key: "securityRotationDone", label: "Firebase/API-Schlüssel rotieren bzw. restricten" },
        { key: "goNoGoSignedOff", label: "Interne Go/No-Go-Freigabe dokumentieren" },
    ];

    playStoreChecks.forEach(item => {
        if (playStoreState.checks[item.key]) return;
        steps.push({
            id: `playstore-${item.key}`,
            category: "Play Store",
            platform: "Release / Compliance",
            severity: "critical",
            title: item.label,
            why: "Ohne diesen Nachweis ist eine sichere und belastbare Veröffentlichung im Google Play Store gefährdet.",
            action: "Im Tab 'Recht & Datenschutz' unter 'Google Play Store Readiness' erledigen und anschließend erneut speichern.",
        });
    });

    if (!playStoreState.privacyUrl || !/^https:\/\//i.test(playStoreState.privacyUrl)) {
        steps.push({
            id: "playstore-privacy-url-value",
            category: "Play Store",
            platform: "Release / Compliance",
            severity: "critical",
            title: "Gültige Privacy-Policy-URL eintragen",
            why: "Eine fehlende oder ungültige Privacy-URL führt typischerweise zu Review-Rückfragen oder Ablehnung.",
            action: "Im Play-Store-Readiness-Block eine öffentliche HTTPS-URL eintragen und speichern.",
        });
    }

    if (!playStoreState.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail)) {
        steps.push({
            id: "playstore-support-email-value",
            category: "Play Store",
            platform: "Release / Compliance",
            severity: "high",
            title: "Gültige Support-/Privacy-E-Mail eintragen",
            why: "Play-Review und Nutzeranfragen benötigen eine belastbare Kontaktadresse.",
            action: "Im Play-Store-Readiness-Block eine gültige E-Mail setzen und speichern.",
        });
    }

    if (!validation) {
        steps.push({
            id: "backend-validation-missing",
            category: "Backend",
            platform: "Operator Setup",
            severity: "critical",
            title: "Full Validation im Operator-Panel ausführen",
            why: "Ohne Backend-Validierung bleibt unklar, ob Admin-Claims, Functions, Firestore und Runtime-Konfiguration produktionsbereit sind.",
            action: "Im Setup-Tab zuerst 'Full Validation' starten und alle ERRORs vor weiteren Plattformarbeiten beseitigen.",
        });
    } else {
        if (!validationChecks.adminAuthOk) {
            steps.push({
                id: "backend-admin-auth",
                category: "Backend",
                platform: "Operator Setup",
                severity: "critical",
                title: "Admin-Authentifizierung und Claims reparieren",
                why: "Ohne gültigen Admin-Claim sind produktive Betreiberfunktionen blockiert.",
                action: "Admin-Login prüfen, Role-Assignment erneut ausführen und Token/Claim-Refresh verifizieren.",
            });
        }
        if (!validationChecks.functionsReachable) {
            steps.push({
                id: "backend-functions-reachable",
                category: "Backend",
                platform: "Operator Setup",
                severity: "critical",
                title: "Cloud Functions erreichbar machen",
                why: "Wenn Functions nicht erreichbar sind, funktionieren Pairing, Geräteverwaltung und Support-Workflows nicht zuverlässig.",
                action: "Firebase-Projekt, Region, Deploy-Status und callable Endpunkte prüfen; danach Validation erneut starten.",
            });
        }
        if (!validationChecks.firestoreAccessOk) {
            steps.push({
                id: "backend-firestore-access",
                category: "Backend",
                platform: "Operator Setup",
                severity: "critical",
                title: "Firestore-Zugriff und Rollenrechte beheben",
                why: "Fehlender Firestore-Zugriff blockiert Kernfunktionen wie Geräte-, Task- und Audit-Daten.",
                action: "Rules, Admin-Session und Projektkonfiguration prüfen, bis die Collections lesbar sind.",
            });
        }
        if (!validationChecks.storageHealthOk) {
            steps.push({
                id: "backend-storage-health",
                category: "Backend",
                platform: "Operator Setup",
                severity: "high",
                title: "Storage-Bucket für Foto-Uploads stabilisieren",
                why: "Task-Beweisfotos und Support-Dateien hängen von funktionierendem Storage ab.",
                action: "Bucket, Regeln und Service-Anbindung prüfen; danach Upload-Flows erneut testen.",
            });
        }
        if (!validationChecks.webControlConfigReady) {
            steps.push({
                id: "backend-web-config",
                category: "Backend",
                platform: "Web / Setup",
                severity: "high",
                title: "Gemeinsame Firebase-Webkonfiguration vervollständigen",
                why: "Solange die Bootstrap-Konfiguration fehlt, bleiben Admin-Panel und Web-Control nur eingeschränkt einsetzbar.",
                action: "Shared Firebase Config lokal speichern und anschließend beide Panels erneut validieren.",
            });
        }
    }

    missingAttestations.forEach(item => {
        steps.push({
            id: `attestation-${item.key}`,
            category: "Compliance",
            platform: "Operator Setup",
            severity: "high",
            title: item.label,
            why: "Diese manuelle Freigabe ist Teil des Go-Live-Gates und kann browserseitig nicht verlässlich automatisiert geprüft werden.",
            action: "Nachweis prüfen, dokumentieren und anschließend im Setup-Tab als erledigt markieren.",
        });
    });

    for (const platform of Object.values(platformReadinessItems)) {
        for (const item of platform.items) {
            if (platformState[item.key]) continue;
            steps.push({
                id: item.key,
                category: platform.label,
                platform: platform.label,
                severity: item.severity,
                title: item.label,
                why: item.severity === "critical"
                    ? "Dieser Punkt blockiert die Kernfunktion oder den sicheren Rollout der Plattform."
                    : item.severity === "high"
                        ? "Dieser Punkt ist für einen belastbaren Rollout sehr wichtig, aber nicht das allererste Go-Live-Gate."
                        : "Dieser Punkt erhöht Qualität und Robustheit, kann aber nach den kritischen Themen folgen.",
                action: `Nächster Umsetzungsschritt für ${platform.label}: diese Funktion implementieren/testen und danach in der Checkliste bestätigen.`,
            });
        }
    }

    const deduped = [];
    const seen = new Set();
    for (const step of steps) {
        if (seen.has(step.id)) continue;
        seen.add(step.id);
        deduped.push(step);
    }

    deduped.sort((a, b) => {
        const weightDiff = getPriorityWeight(b.severity) - getPriorityWeight(a.severity);
        if (weightDiff !== 0) return weightDiff;
        return a.title.localeCompare(b.title, "de");
    });

    return deduped.map((step, index) => ({
        ...step,
        order: index + 1,
    }));
}

function renderPrioritizedActionPlan() {
    const container = document.getElementById("prioritized-action-plan");
    if (!container) return;

    const steps = buildPrioritizedActionPlan();
    if (steps.length === 0) {
        container.innerHTML = "<div class='success-box'>Alle aktuell erfassten kritischen, hohen und mittleren Punkte sind abgearbeitet. Nächster Schritt: Final-Validation und Rollout.</div>";
        return;
    }

    const topSteps = steps.slice(0, 12);
    const html = topSteps.map(step => `
        <div class="priority-plan-item priority-${escapeHtml(step.severity)}">
            <div class="priority-plan-header">
                <span class="priority-rank">#${step.order}</span>
                <span class="priority-badge severity-${escapeHtml(step.severity)}">${escapeHtml(step.severity.toUpperCase())}</span>
                <strong>${escapeHtml(step.title)}</strong>
            </div>
            <div class="priority-meta">${escapeHtml(step.platform)} · ${escapeHtml(step.category)}</div>
            <p><strong>Warum jetzt:</strong> ${escapeHtml(step.why)}</p>
            <p><strong>Nächster Schritt:</strong> ${escapeHtml(step.action)}</p>
        </div>
    `).join("");

    const hiddenCount = steps.length - topSteps.length;
    const summary = hiddenCount > 0
        ? `<p class="muted-note">Es werden die wichtigsten ${topSteps.length} von ${steps.length} offenen Punkten angezeigt. Nach Abarbeitung bitte Bericht aktualisieren.</p>`
        : `<p class="muted-note">Alle ${steps.length} offenen Punkte sind in Reihenfolge dargestellt.</p>`;

    container.innerHTML = `
        <div class="priority-plan-list">
            ${summary}
            ${html}
        </div>
    `;
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
    const playStoreState = getPlayStoreReadinessState();
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

    const playChecksTotal = Object.keys(playStoreState.checks || {}).length;
    const playChecksDone = Object.values(playStoreState.checks || {}).filter(Boolean).length;
    const playMetaReady = Boolean(playStoreState.privacyUrl && /^https:\/\//i.test(playStoreState.privacyUrl) && playStoreState.supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail));
    const playStoreReady = playChecksDone === playChecksTotal && playMetaReady;

    let ampel, ampelLabel, ampelDescription;
    if (backendReady && allAttestationsOk && allCriticalDone && allHighDone && doneAll === totalAll && playStoreReady) {
        ampel = "green";
        ampelLabel = "Go-Live freigegeben";
        ampelDescription = "Backend, manuelle Freigaben, Plattform-Checks und Play-Store-Gates sind produktionsbereit.";
    } else if (backendReady && allCriticalDone) {
        ampel = "yellow";
        ampelLabel = "Teilweise bereit";
        ampelDescription = playStoreReady
            ? "Backend und kritische Punkte OK. Offene Freigaben oder HIGH-Punkte verhindern Vollfreigabe."
            : "Backend und kritische Punkte OK. Offene Play-Store-Pflichten verhindern Vollfreigabe.";
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
        playStoreReady,
        platformStatus,
        totals: { totalAll, doneAll, totalCritical, doneCritical, totalHigh, doneHigh, playChecksTotal, playChecksDone },
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
                    <div class="ampel-progress-fill" style="inline-size:${ps.percent}%;background:${barColor}"></div>
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
                <div class="ampel-stat"><strong>${status.playStoreReady ? "OK" : `${status.totals.playChecksDone}/${status.totals.playChecksTotal}`}</strong><span>Play Store</span></div>
            </div>
            <div class="ampel-platforms">
                <h5>Plattform-Fortschritt</h5>
                ${platformBars}
            </div>
            <div class="ampel-total-bar">
                <div class="ampel-progress-bar ampel-progress-bar-lg">
                    <div class="ampel-progress-fill" style="inline-size:${pct}%;background:${status.ampel === 'green' ? '#22c55e' : status.ampel === 'yellow' ? '#eab308' : '#ef4444'}"></div>
                </div>
                <span class="ampel-total-pct">${pct}% Gesamtfortschritt</span>
            </div>
        </div>`;

    // Final-Go-Live-Gate: Button nur aktiv wenn Ampel grün
    const gateContainer = document.getElementById("golive-final-gate");
    if (gateContainer) {
        const savedConfirmation = localStorage.getItem("finalGoLiveConfirmation");
        if (savedConfirmation) {
            try {
                const conf = JSON.parse(savedConfirmation);
                const ts = new Date(conf.confirmedAt).toLocaleString("de-DE");
                gateContainer.innerHTML =
                    "<div class='success-box'><p>✅ <strong>Go-Live bestätigt</strong> am " + escapeHtml(ts) + "</p>" +
                    "<button onclick=\"localStorage.removeItem('finalGoLiveConfirmation');renderGoLiveAmpel()\" class='btn btn-secondary' style='margin-block-start:6px;font-size:0.8em'>Bestätigung zurücksetzen</button></div>";
            } catch (_) {
                localStorage.removeItem("finalGoLiveConfirmation");
            }
        } else if (status.ampel === "green") {
            gateContainer.innerHTML =
                "<button class='btn btn-primary' style='inline-size:100%' onclick='confirmFinalGoLive()'>✅ Finales Go-Live bestätigen</button>";
        } else {
            const openCount = status.totals.totalAll - status.totals.doneAll +
                (status.playStoreReady ? 0 : (status.totals.playChecksTotal - status.totals.playChecksDone));
            const reasons = [];
            if (!status.backendReady) reasons.push("Backend-Validierung ausstehend");
            if (!status.allAttestationsOk) reasons.push("Manuelle Freigaben offen");
            if (!status.playStoreReady) reasons.push("Play-Store-Gates offen");
            if (status.totals.doneCritical < status.totals.totalCritical)
                reasons.push(`${status.totals.totalCritical - status.totals.doneCritical} kritische Plattform-Punkte offen`);
            gateContainer.innerHTML =
                "<button class='btn btn-primary' disabled style='inline-size:100%;opacity:0.5;cursor:not-allowed'>🔒 Finales Go-Live (gesperrt)</button>" +
                "<p style='color:#ef4444;font-size:0.85em;margin-block-start:6px'>" +
                escapeHtml(reasons.join(" · ") || `${openCount} offene Punkte`) +
                " – Ampel muss grün sein.</p>";
        }
    }
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
            renderPrioritizedActionPlan();
        });

        container.appendChild(wrapper);
    });
}

function renderAllPlatformSections() {
    renderPlatformReadinessSection("masterApp");
    renderPlatformReadinessSection("childApp");
    renderPlatformReadinessSection("desktop");
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
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
                <div class="ampel-progress-fill" style="inline-size:${progressPct}%;background:${progressPct === 100 ? '#22c55e' : '#3b82f6'}"></div>
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
        renderPrioritizedActionPlan();
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
    renderPrioritizedActionPlan();
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

function normalizeBootstrapFirebaseConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== "object") return null;
    return {
        apiKey: String(rawConfig.apiKey || "").trim(),
        authDomain: String(rawConfig.authDomain || "").trim(),
        projectId: String(rawConfig.projectId || "").trim(),
        storageBucket: String(rawConfig.storageBucket || "").trim(),
        messagingSenderId: String(rawConfig.messagingSenderId || "").trim(),
        appId: String(rawConfig.appId || "").trim(),
    };
}

function extractFirebaseConfigFromText(text) {
    if (typeof text !== "string" || text.trim().length === 0) return null;

    const directObjectMatch = text.match(/\{[\s\S]*\}/);
    if (!directObjectMatch) return null;

    try {
        const parsedDirect = JSON.parse(directObjectMatch[0]);
        const normalizedDirect = normalizeBootstrapFirebaseConfig(parsedDirect);
        if (hasCompleteFirebaseConfig(normalizedDirect)) return normalizedDirect;
    } catch (_error) {
        // noop - fallback to JS object literal parser below
    }

    try {
        const objectLiteral = directObjectMatch[0]
            .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, "$1\"$2\":")
            .replace(/'/g, "\"");
        const parsedLiteral = JSON.parse(objectLiteral);
        const normalizedLiteral = normalizeBootstrapFirebaseConfig(parsedLiteral);
        if (hasCompleteFirebaseConfig(normalizedLiteral)) return normalizedLiteral;
    } catch (_error) {
        return null;
    }

    return null;
}

function applyImportedBootstrapFirebaseConfig(config, sourceLabel = "Import") {
    const normalizedConfig = normalizeBootstrapFirebaseConfig(config);
    if (!hasCompleteFirebaseConfig(normalizedConfig) || isPlaceholderFirebaseConfig(normalizedConfig)) {
        throw new Error("Die geladene Datei enthält keine vollständige Firebase-Webkonfiguration.");
    }

    renderBootstrapFirebaseConfig(normalizedConfig);
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(normalizedConfig));
    firebaseConfig = normalizedConfig;
    updateSetupChecklistState({ "firebase-config": true });
    refreshCommissioningReport();
    renderCommandCatalog(firebaseConfig.projectId);
    showNotification(`${sourceLabel}: Firebase-Konfiguration für ${normalizedConfig.projectId} übernommen.`, "success");
}

async function loadBootstrapFirebaseConfigFromUrl() {
    const urlInput = document.getElementById("bootstrap-config-url");
    const statusEl = document.getElementById("bootstrap-import-status");
    const url = (urlInput?.value || "").trim();

    if (!url) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Bitte eine URL für die Konfigurationsdatei eingeben.</div>";
        return;
    }

    if (!/^https?:\/\//i.test(url)) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Nur http(s)-URLs sind erlaubt.</div>";
        return;
    }

    if (statusEl) statusEl.innerHTML = "<div class='info'>Lade Konfiguration aus dem Internet ...</div>";

    try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Download fehlgeschlagen (${response.status})`);
        }
        const contentType = response.headers.get("content-type") || "";
        const payloadText = await response.text();
        let extractedConfig = null;

        if (contentType.includes("application/json")) {
            extractedConfig = normalizeBootstrapFirebaseConfig(JSON.parse(payloadText));
        } else {
            extractedConfig = extractFirebaseConfigFromText(payloadText);
        }

        if (!extractedConfig) {
            throw new Error("Inhalt konnte nicht als firebaseConfig erkannt werden.");
        }

        applyImportedBootstrapFirebaseConfig(extractedConfig, "URL-Import");
        if (statusEl) {
            statusEl.innerHTML = `<div class='success-box'>Konfiguration aus URL übernommen: ${escapeHtml(extractedConfig.projectId)}.</div>`;
        }
    } catch (error) {
        if (statusEl) {
            statusEl.innerHTML = `<div class='error'>Import fehlgeschlagen: ${escapeHtml(error.message)}</div>`;
        }
        console.error("[loadBootstrapFirebaseConfigFromUrl] Fehler:", error);
    }
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

function setupBootstrapConfigLiveSync() {
    const fields = [
        "bootstrap-api-key",
        "bootstrap-auth-domain",
        "bootstrap-project-id",
        "bootstrap-storage-bucket",
        "bootstrap-messaging-sender-id",
        "bootstrap-app-id",
    ];

    fields.forEach(fieldId => {
        const input = document.getElementById(fieldId);
        if (!input) return;
        input.addEventListener("input", () => {
            const currentValues = getBootstrapFirebaseFormValues();
            firebaseConfig = { ...firebaseConfig, ...currentValues };
            renderBootstrapFirebaseConfig(firebaseConfig);

            if (hasCompleteFirebaseConfig(currentValues) && !isPlaceholderFirebaseConfig(currentValues)) {
                localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(currentValues));
                firebaseConfig = currentValues;
                updateSetupChecklistState({ "firebase-config": true });
                refreshCommissioningReport();
                renderCommandCatalog(firebaseConfig.projectId);
            }
        });
    });
}

function persistBootstrapFirebaseConfig(showReloadHint = true) {
    const values = getBootstrapFirebaseFormValues();
    const statusEl = document.getElementById("bootstrap-config-status");

    console.log("[Firebase Config] Gelesene Formularwerte:", JSON.stringify(values, null, 2));

    const requiredKeys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    const emptyFields = requiredKeys.filter(key => typeof values[key] !== "string" || values[key].trim().length === 0);
    const placeholderFields = requiredKeys.filter(key =>
        typeof values[key] === "string" && (values[key].includes("your-") || values[key].includes("your_project"))
    );

    if (emptyFields.length > 0 || placeholderFields.length > 0) {
        const problems = [];
        if (emptyFields.length > 0) problems.push("Leere Felder: " + emptyFields.join(", "));
        if (placeholderFields.length > 0) problems.push("Platzhalter-Werte: " + placeholderFields.join(", "));
        const detail = problems.join(" | ");
        console.error("[Firebase Config] Validierung fehlgeschlagen:", detail);
        if (statusEl) {
            statusEl.innerHTML = "<div class='error'>Firebase-Konfiguration ungültig: " + escapeHtml(detail) + "</div>";
        }
        throw new Error("Firebase-Konfiguration ungültig: " + detail);
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

function buildCommissioningSnapshot(report) {
    const validationSummary = report?.validationSummary || null;
    const attestations = report?.attestations || {};
    const confirmedAttestations = Object.values(attestations).filter(Boolean).length;
    const pendingCount = Array.isArray(report?.pending) ? report.pending.length : 0;
    const validationState = !validationSummary
        ? "Validation ausstehend"
        : validationSummary.errorCount > 0
            ? `${validationSummary.errorCount} kritische Findings`
            : validationSummary.warn > 0
                ? `${validationSummary.warn} Warnungen offen`
                : "Validierung vollständig grün";

    return {
        pendingCount,
        confirmedAttestations,
        validationState,
        lastUpdated: new Date().toISOString(),
    };
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
    const snapshot = buildCommissioningSnapshot(report);

    container.innerHTML = `
        <div class="commissioning-report ${report.pending.length === 0 ? "commissioning-complete" : ""}">
            <div class="commissioning-snapshot">
                <div><strong>Status:</strong> ${escapeHtml(snapshot.validationState)}</div>
                <div><strong>Bestätigte Freigaben:</strong> ${snapshot.confirmedAttestations}</div>
                <div><strong>Offene Punkte:</strong> ${snapshot.pendingCount}</div>
                <div><strong>Aktualisiert:</strong> ${escapeHtml(new Date(snapshot.lastUpdated).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium", timeZone: "UTC" }))} UTC</div>
            </div>
            <h4>Inbetriebnahmebericht</h4>
            <p><strong>Projekt:</strong> ${escapeHtml(report.projectId || "nicht gesetzt")}</p>
            <p><strong>Firebase-Webkonfiguration:</strong> ${report.firebaseConfigured ? "bereit" : "offen"}</p>
            <p><strong>Parent Web-Control:</strong> ${report.webControlConfigured ? "shared config bereit" : "noch nicht freigegeben"}</p>
            <p><strong>Runtime-Konfiguration:</strong> ${report.runtimeConfigured ? "gespeichert" : "unvollständig"}</p>
            <p><strong>Play Store Readiness:</strong> ${report.playStoreReady ? "bereit" : "offen"}</p>
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

        const playStoreState = getPlayStoreReadinessState();
        const openPlayChecks = Object.entries(playStoreState.checks || {}).filter(([, value]) => !value);
        if (openPlayChecks.length > 0) {
            pending.push(`Play-Store-Readiness: ${openPlayChecks.length} Pflicht-Check(s) offen.`);
        }
        if (!playStoreState.privacyUrl || !/^https:\/\//i.test(playStoreState.privacyUrl)) {
            pending.push("Play-Store-Readiness: gültige Privacy-Policy-URL (https://) fehlt.");
        }
        if (!playStoreState.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail)) {
            pending.push("Play-Store-Readiness: gültige Support-/Privacy-E-Mail fehlt.");
        }

        getMissingAttestations().forEach(item => {
            pending.push(`Manuelle Freigabe offen: ${item}`);
        });

        const playMetaReady = Boolean(playStoreState.privacyUrl && /^https:\/\//i.test(playStoreState.privacyUrl) && playStoreState.supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail));
        const playStoreReady = openPlayChecks.length === 0 && playMetaReady;

        commissioningSummary = {
            projectId: bootstrapConfig.projectId || mergedRuntimeConfig.cloud.projectId,
            firebaseConfigured: !isPlaceholderFirebaseConfig(bootstrapConfig),
            webControlConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
            runtimeConfigured: Boolean(mergedRuntimeConfig.cloud.projectId && mergedRuntimeConfig.ai.provider && mergedRuntimeConfig.ai.model),
            playStoreReady,
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
        renderPrioritizedActionPlan();
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

    const playStoreState = getPlayStoreReadinessState();
    const openPlayChecks = Object.entries(playStoreState.checks || {}).filter(([, value]) => !value);
    if (openPlayChecks.length > 0) {
        pending.push(`Play-Store-Readiness: ${openPlayChecks.length} Pflicht-Check(s) offen.`);
    }
    if (!playStoreState.privacyUrl || !/^https:\/\//i.test(playStoreState.privacyUrl)) {
        pending.push("Play-Store-Readiness: gültige Privacy-Policy-URL (https://) fehlt.");
    }
    if (!playStoreState.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail)) {
        pending.push("Play-Store-Readiness: gültige Support-/Privacy-E-Mail fehlt.");
    }
    const playMetaReady = Boolean(playStoreState.privacyUrl && /^https:\/\//i.test(playStoreState.privacyUrl) && playStoreState.supportEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(playStoreState.supportEmail));
    const playStoreReady = openPlayChecks.length === 0 && playMetaReady;

    commissioningSummary = {
        projectId: runtimeConfig.cloud.projectId || firebaseConfig.projectId,
        firebaseConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
        webControlConfigured: !isPlaceholderFirebaseConfig(firebaseConfig),
        runtimeConfigured: Boolean(runtimeConfig.cloud.projectId && runtimeConfig.ai.provider && runtimeConfig.ai.model),
        playStoreReady,
        validationSummary: commissioningSummary?.validationSummary || null,
        deployCommand: buildDeployCommand(runtimeConfig.cloud.projectId || firebaseConfig.projectId),
        roleAssignments: commissioningSummary?.roleAssignments || [],
        attestations: getCommissioningAttestations(),
        pending,
    };

    renderCommissioningReport(commissioningSummary);
    renderCommandCatalog(commissioningSummary.projectId);
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
}

document.addEventListener("DOMContentLoaded", async function() {
    await detectPythonOperatorRuntime();
    renderBootstrapFirebaseConfig(firebaseConfig);
    setupBootstrapConfigLiveSync();
    renderCommandBuilderConfig(loadCommandBuilderConfig());
    renderCommandCatalog(firebaseConfig.projectId);
    renderAllPlatformSections();
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
    renderPlayStoreReadiness();
    renderPythonAutomationOverview(null, null);

    const openOnlyChecksEl = document.getElementById("python-automation-show-open-only");
    if (openOnlyChecksEl) {
        openOnlyChecksEl.addEventListener("change", () => {
            if (pythonCommissioningLastRun) renderPythonAutomationResult(pythonCommissioningLastRun);
            else rerenderPythonAutomationCatalogFromCache();
        });
    }

    const catalogSearchEl = document.getElementById("python-automation-catalog-search");
    if (catalogSearchEl) {
        catalogSearchEl.addEventListener("input", rerenderPythonAutomationCatalogFromCache);
    }

    const catalogFilterEl = document.getElementById("python-automation-catalog-filter");
    if (catalogFilterEl) {
        catalogFilterEl.addEventListener("change", rerenderPythonAutomationCatalogFromCache);
    }

    const historySearchEl = document.getElementById("python-automation-history-search");
    if (historySearchEl) {
        historySearchEl.addEventListener("input", rerenderPythonAutomationHistoryFromCache);
    }

    const historyOpenOnlyEl = document.getElementById("python-automation-history-open-only");
    if (historyOpenOnlyEl) {
        historyOpenOnlyEl.addEventListener("change", rerenderPythonAutomationHistoryFromCache);
    }

    // Operator-Laufzeit-Badge anzeigen
    if (canExecuteCommandsDirectly()) {
        const badge = document.getElementById("electron-operator-badge");
        if (badge) {
            badge.style.display = "block";
            if (isPythonOperator) {
                badge.innerHTML = '<span class="operator-badge">🐍 Python-Operator-Modus</span> CLI- und PowerShell-Befehle können direkt aus diesem Dashboard ausgeführt werden.';
                loadPythonAutomationCatalog();
                loadPythonAutomationHistory();
                loadPythonAutomationEvidenceHistory();
            }
        }
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
        const forgotPasswordBtn = document.getElementById("forgot-password-btn");
        if (forgotPasswordBtn) {
            forgotPasswordBtn.addEventListener("click", handleForgotPassword);
        }
        const forgotPasswordProminentBtn = document.getElementById("forgot-password-prominent-btn");
        if (forgotPasswordProminentBtn) {
            forgotPasswordProminentBtn.addEventListener("click", handleForgotPassword);
        }
        const checkProviderBtn = document.getElementById("check-provider-btn");
        if (checkProviderBtn) {
            checkProviderBtn.addEventListener("click", handleCheckAuthProviders);
        }

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
                    console.log("Auth state: user=" + user.email + ", role=" + (role || "none"));
                    if (role === "admin" || role === "support" || role === "auditor") {
                        currentUserRole = role;
                        showDashboard(user);
                        applyRoleRestrictions(role);
                        loadDashboardData();
                        if (role === "admin") initializeSetupAssistant();
                    } else {
                        // User is authenticated but has no operator role -> show phase 3
                        console.warn("User has no operator role. Showing admin activation phase.");
                        showAdminActivationPhase(user);
                    }
                }).catch(err => {
                    console.error("Token refresh failed:", err);
                    showNotification("Token-Prüfung fehlgeschlagen: " + err.message, "error");
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

function openPasswordResetFlow() {
    showAuthMode("login");

    const loginEmailEl = document.getElementById("login-email");
    const registerEmailEl = document.getElementById("register-email");
    const loginStatusEl = document.getElementById("login-status");
    const fallbackEmail = (registerEmailEl?.value || "").trim();

    if (loginEmailEl && fallbackEmail && !loginEmailEl.value.trim()) {
        loginEmailEl.value = fallbackEmail;
    }

    if (loginStatusEl) {
        loginStatusEl.innerHTML = "<div class='info'>E-Mail eingeben oder prüfen und dann den Reset-Link senden.</div>";
    }

    if (loginEmailEl) {
        loginEmailEl.focus();
        loginEmailEl.select();
    }
}

function handlePrepareCloudReset() {
    showAuthMode("login");

    const firstConfirm = window.confirm(
        "Cloud-Reset-Hinweise anzeigen?\n\n" +
        "Diese Aktion betrifft potenziell produktive Firebase-Daten."
    );
    if (!firstConfirm) return;

    const resetToken = window.prompt(
        "Sicherheitsabfrage: Bitte zur Bestätigung exakt RESET eingeben."
    );
    if ((resetToken || "").trim() !== "RESET") {
        const statusEl = document.getElementById("login-status");
        if (statusEl) {
            statusEl.innerHTML = "<div class='info'>Cloud-Reset-Vorbereitung abgebrochen (Bestätigung RESET nicht korrekt).</div>";
        }
        return;
    }

    const loginStatusEl = document.getElementById("login-status");
    const loginEmailEl = document.getElementById("login-email");
    const registerEmailEl = document.getElementById("register-email");
    const operatorEmail = (loginEmailEl?.value || registerEmailEl?.value || "").trim();
    const projectId = (firebaseConfig?.projectId || "<FIREBASE_PROJECT_ID>").trim();
    const safeProjectId = escapeHtml(projectId || "<FIREBASE_PROJECT_ID>");
    const safeEmail = operatorEmail ? escapeHtml(operatorEmail) : "<operator@example.com>";

    if (!loginStatusEl) return;

    loginStatusEl.innerHTML = `
        <div class='error'>
            <strong>ACHTUNG:</strong> Cloud-Reset löscht produktive Daten in Firebase (nicht nur lokal im Browser).
            Nur durchführen, wenn ein vollständiges Backup und Freigabe vorliegen.
        </div>
        <div class='info' style='margin-top:8px'>
            <strong>Geführter Cloud-Reset (manuell):</strong>
            <ol style='margin:8px 0 0 18px; padding:0;'>
                <li>Backup erstellen (Firestore Export / Auth User Export).</li>
                <li>In Firebase Console unter <strong>Authentication → Users</strong> den betroffenen Operator prüfen: <code>${safeEmail}</code></li>
                <li>Nur falls freigegeben: Operator-Konto löschen und neu anlegen.</li>
                <li>Falls nötig: zugehörige Operator-Dokumente in Firestore bereinigen (gezielt, nicht pauschal).</li>
                <li>Anschließend im Panel erneut anmelden und Setup-Assistenten prüfen.</li>
            </ol>
        </div>
        <div class='info' style='margin-top:8px'>
            <strong>CLI-Referenz (Projekt: ${safeProjectId}):</strong>
            <pre style='white-space:pre-wrap;margin:8px 0 0 0'>
firebase use ${safeProjectId}
# Operator in Firebase Auth gezielt entfernen (falls freigegeben)
firebase auth:delete ${safeEmail}

# Danach neues Operator-Konto im Admin-Panel neu erstellen
            </pre>
        </div>
    `;

    if (loginEmailEl && !loginEmailEl.value.trim() && operatorEmail) {
        loginEmailEl.value = operatorEmail;
    }
    if (loginEmailEl) {
        loginEmailEl.focus();
    }
}

async function clearIndexedDbBestEffort() {
    if (typeof indexedDB === "undefined" || typeof indexedDB.deleteDatabase !== "function") return;
    if (typeof indexedDB.databases !== "function") return;

    try {
        const databases = await indexedDB.databases();
        for (const dbInfo of databases || []) {
            const dbName = dbInfo && typeof dbInfo.name === "string" ? dbInfo.name : "";
            if (!dbName) continue;
            try {
                indexedDB.deleteDatabase(dbName);
            } catch (deleteError) {
                console.warn("IndexedDB delete failed for", dbName, deleteError);
            }
        }
    } catch (error) {
        console.warn("IndexedDB cleanup skipped:", error);
    }
}

async function unregisterServiceWorkersBestEffort() {
    if (!("serviceWorker" in navigator) || typeof navigator.serviceWorker.getRegistrations !== "function") return;

    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled((registrations || []).map(reg => reg.unregister()));
    } catch (error) {
        console.warn("Service worker cleanup skipped:", error);
    }
}

async function clearCachesBestEffort() {
    if (typeof caches === "undefined" || typeof caches.keys !== "function") return;

    try {
        const cacheKeys = await caches.keys();
        await Promise.allSettled((cacheKeys || []).map(key => caches.delete(key)));
    } catch (error) {
        console.warn("Cache cleanup skipped:", error);
    }
}

async function handleFullAdminPanelReset() {
    const firstConfirm = window.confirm(
        "Admin-Panel wirklich vollständig zurücksetzen?\n\n" +
        "Dabei werden lokale Konfiguration, Sitzung, Caches und Service-Worker gelöscht."
    );
    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
        "Letzte Sicherheitsabfrage: Dieser Vorgang kann lokal nicht rückgängig gemacht werden. Fortfahren?"
    );
    if (!secondConfirm) return;

    const resetToken = window.prompt(
        "Sicherheitsabfrage: Bitte zur Bestätigung exakt RESET eingeben."
    );
    if ((resetToken || "").trim() !== "RESET") {
        const statusEl = document.getElementById("login-status");
        if (statusEl) {
            statusEl.innerHTML = "<div class='info'>Vollständiger Panel-Reset abgebrochen (Bestätigung RESET nicht korrekt).</div>";
        }
        return;
    }

    try {
        stopSessionMonitoring();

        if (auth && auth.currentUser) {
            try {
                await auth.signOut();
            } catch (signOutError) {
                console.warn("Sign-out during reset failed:", signOutError);
            }
        }

        try {
            sessionStorage.clear();
        } catch (sessionError) {
            console.warn("sessionStorage clear failed:", sessionError);
        }

        try {
            localStorage.clear();
        } catch (localError) {
            console.warn("localStorage clear failed:", localError);
        }

        await Promise.allSettled([
            clearIndexedDbBestEffort(),
            clearCachesBestEffort(),
            unregisterServiceWorkersBestEffort(),
        ]);

        window.location.replace(`${window.location.pathname}?panelReset=${Date.now()}`);
    } catch (error) {
        console.error("Full admin panel reset failed:", error);
        const statusEl = document.getElementById("login-status");
        if (statusEl) {
            statusEl.innerHTML = `<div class='error'>Vollständiger Reset fehlgeschlagen: ${escapeHtml(error?.message || "Unbekannter Fehler")}</div>`;
        }
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

    const projectIdHint = escapeHtml(firebaseConfig?.projectId || "unbekannt");

    container.innerHTML = `
        <div class="admin-info-box">
            <h4>Ihr Konto: ${escapeHtml(user.email || "")}</h4>
            <p>
                Sie sind angemeldet, besitzen aber noch keine Operator-Berechtigung.
                Um das Dashboard nutzen zu können, muss Ihrem Konto die Rolle
                <strong>admin</strong>, <strong>support</strong> oder <strong>auditor</strong> zugewiesen werden.
            </p>
        </div>

        <div class="admin-info-box" style="background: #f0fdf4; border-color: #bbf7d0;">
            <h4>🚀 Ersteinrichtung — Admin-Zugang direkt aktivieren</h4>
            <p>
                Falls dies die <strong>erste Einrichtung</strong> ist und noch kein Admin existiert,
                können Sie sich direkt als Admin aktivieren:
            </p>
            <div class="phase-actions" style="margin-block-start: 12px">
                <button onclick="bootstrapFirstAdminAction()" class="btn btn-primary" id="btn-bootstrap-admin">
                    🔑 Als ersten Admin aktivieren
                </button>
            </div>
            <div id="bootstrap-admin-status" class="phase-status" style="margin-block-start: 8px"></div>
        </div>

        <div class="admin-info-box" style="background: #f8fafc; border-color: #e2e8f0;">
            <h4>Zusätzlicher Operator (Admin existiert bereits)</h4>
            <p>
                Bitten Sie den vorhandenen Admin, im Dashboard unter <em>Einrichtung → Rollenverwaltung</em>
                Ihre UID einzutragen:
            </p>
            <p style="margin-block-start: 8px">
                Ihre UID: <code style="background:#0f172a;color:#e2e8f0;padding:2px 6px;border-radius:4px">${escapeHtml(user.uid)}</code>
            </p>
        </div>

        <div class="admin-info-box" style="background: #fff7ed; border-color: #fed7aa;">
            <h4>🔐 Zugang über generierte Schlüsseldatei (256 Bit)</h4>
            <p>
                Sie können eine Zugangsschlüsseldatei direkt im Admin-Panel erzeugen und einmalig einlösen.
                Projekt: <strong>${projectIdHint}</strong>
            </p>
            <div class="phase-grid" style="margin-block-start: 10px;">
                <div class="form-group">
                    <label for="access-key-role">Rolle für Schlüsseldatei</label>
                    <select id="access-key-role" class="form-input">
                        <option value="admin">admin</option>
                        <option value="support">support</option>
                        <option value="auditor">auditor</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="access-key-ttl">Gültigkeit (Minuten)</label>
                    <input id="access-key-ttl" class="form-input" type="number" min="1" max="10080" step="1" value="60" />
                </div>
            </div>
            <div class="phase-actions" style="margin-block-start: 8px;">
                <button onclick="generateOperatorAccessKeyFile()" class="btn btn-secondary" id="btn-generate-access-key">
                    Schlüsseldatei erzeugen
                </button>
            </div>
            <div id="access-key-generate-status" class="phase-status" style="margin-block-start: 8px"></div>

            <hr style="margin: 14px 0; border: none; border-top: 1px solid #fed7aa;" />

            <div class="form-group">
                <label for="access-key-file">Schlüsseldatei einlösen</label>
                <input id="access-key-file" type="file" class="form-input" accept="application/json,.json" />
            </div>
            <div class="phase-actions">
                <button onclick="redeemOperatorAccessKeyFile()" class="btn btn-primary" id="btn-redeem-access-key">
                    Zugang mit Schlüsseldatei freischalten
                </button>
            </div>
            <div id="access-key-redeem-status" class="phase-status" style="margin-block-start: 8px"></div>
        </div>

        <div class="phase-actions" style="margin-block-start: 16px">
            <button onclick="recheckAdminAccess()" class="btn btn-primary">Zugang prüfen</button>
            <button onclick="logout()" class="btn btn-secondary">Abmelden</button>
        </div>
    `;
}

function toBase64Url(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256HexBrowser(text) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== "function") {
        throw new Error("Web Crypto API ist nicht verfügbar.");
    }
    const data = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function buildKeyFingerprint(keyHash) {
    const normalized = (keyHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) return "unbekannt";
    return `${normalized.slice(0, 12)}...${normalized.slice(-8)}`;
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function copyAccessKeyFingerprint(fingerprint) {
    const value = typeof fingerprint === "string" ? fingerprint.trim() : "";
    if (!value || value === "unbekannt") {
        showNotification("Kein gültiger Fingerprint zum Kopieren vorhanden.", "error");
        return;
    }

    try {
        await copyTextToClipboard(value);
        showNotification("Fingerprint kopiert.", "success");
    } catch (error) {
        showNotification("Fingerprint konnte nicht kopiert werden: " + (error?.message || "Unbekannter Fehler"), "error");
    }
}

function normalizeCallableErrorCode(error) {
    const raw = typeof error?.code === "string" ? error.code.trim().toLowerCase() : "";
    if (!raw) return "";
    return raw.startsWith("functions/") ? raw.slice("functions/".length) : raw;
}

function getAccessKeyErrorHint(error, fallbackMessage) {
    const code = normalizeCallableErrorCode(error);
    const message = (fallbackMessage || error?.message || "").toString();

    if (message.includes("Unexpected token") || message.includes("JSON")) {
        return {
            title: "Dateiformat ungültig",
            tip: "Die Datei ist kein valides JSON. Bitte nur eine unveränderte .json-Schlüsseldatei aus dem Admin-Panel verwenden.",
        };
    }

    const map = {
        "invalid-argument": {
            title: "Ungültige Eingabe",
            tip: "Schlüsseldatei, Rolle oder Ablaufzeit sind ungültig. Bitte Eingaben prüfen und erneut versuchen.",
        },
        "unauthenticated": {
            title: "Nicht angemeldet",
            tip: "Sie müssen im Operator-Konto angemeldet sein, bevor Schlüssel erzeugt oder eingelöst werden können.",
        },
        "permission-denied": {
            title: "Keine Berechtigung",
            tip: "Dieser Schlüssel ist ungültig/widerrufen oder Ihr Konto darf aktuell keine Schlüssel erzeugen.",
        },
        "deadline-exceeded": {
            title: "Schlüssel abgelaufen",
            tip: "Die Schlüsseldatei hat das Ablaufdatum überschritten. Bitte eine neue Datei erzeugen.",
        },
        "failed-precondition": {
            title: "Bereits verwendet",
            tip: "Die Schlüsseldatei wurde bereits eingelöst (One-Time-Key). Bitte neue Datei generieren.",
        },
        "not-found": {
            title: "Schlüssel nicht gefunden",
            tip: "Zum Schlüssel existiert kein passender Eintrag mehr im Backend. Bitte neue Datei erzeugen.",
        },
        "unavailable": {
            title: "Backend nicht erreichbar",
            tip: "Cloud Functions sind aktuell nicht erreichbar. Netzwerk/Deployment prüfen und erneut versuchen.",
        },
        "internal": {
            title: "Interner Serverfehler",
            tip: "Im Backend ist ein interner Fehler aufgetreten. Bitte Logs prüfen und Vorgang wiederholen.",
        },
    };

    return map[code] || {
        title: "Allgemeiner Fehler",
        tip: "Bitte Eingaben und Verbindung prüfen. Falls der Fehler bleibt, Debug-Code und Logs auswerten.",
    };
}

function renderAccessKeyError(statusEl, error, fallbackMessage) {
    if (!statusEl) return;
    const message = (fallbackMessage || error?.message || "Unbekannter Fehler").toString();
    const hint = getAccessKeyErrorHint(error, message);
    const code = normalizeCallableErrorCode(error);
    const codeLabel = code ? `Code: ${code}` : "Code: lokal";

    statusEl.innerHTML = `
        <div class='error'>
            ${escapeHtml(message)}
            <span class='error-tooltip-badge' title='${escapeHtml(hint.tip)}' aria-label='${escapeHtml(hint.tip)}'>ⓘ</span>
        </div>
        <div class='access-error-help'><strong>${escapeHtml(hint.title)}.</strong> ${escapeHtml(hint.tip)} <span class='access-error-code'>${escapeHtml(codeLabel)}</span></div>
        ${formatAuthDebugCode(error)}
    `;
}

async function generateOperatorAccessKeyFile() {
    const statusEl = document.getElementById("access-key-generate-status");
    const btn = document.getElementById("btn-generate-access-key");
    const roleEl = document.getElementById("access-key-role");
    const ttlEl = document.getElementById("access-key-ttl");

    if (!functions) {
        renderAccessKeyError(statusEl, { code: "local/not-initialized" }, "Firebase Functions ist nicht initialisiert.");
        return;
    }

    const role = (roleEl?.value || "admin").trim().toLowerCase();
    const ttlMinutes = parseInt((ttlEl?.value || "60").trim(), 10);
    if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 10080) {
        renderAccessKeyError(statusEl, { code: "functions/invalid-argument" }, "Gültigkeit muss zwischen 1 und 10080 Minuten liegen.");
        return;
    }

    const firstConfirm = window.confirm(
        "Zugangsschlüsseldatei wirklich erzeugen?\n\n" +
        "Die Datei gewährt bis zum Ablaufdatum Zugriff auf die gewählte Rolle."
    );
    if (!firstConfirm) return;

    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Erzeuge 256-Bit-Schlüssel und registriere ihn im Backend...</div>";

    try {
        const randomBytes = new Uint8Array(32); // 32 bytes = 256 bits
        window.crypto.getRandomValues(randomBytes);
        const key = toBase64Url(randomBytes);
        const keyHash = await sha256HexBrowser(key);
        const fingerprint = buildKeyFingerprint(keyHash);

        const createKeyFn = functions.httpsCallable("createOperatorAccessKey");
        const response = await createKeyFn({ keyHash, role, ttlMinutes });
        const payload = response?.data || {};
        const expiresAtMs = Number(payload.expiresAtMs || (Date.now() + ttlMinutes * 60 * 1000));

        const fileData = {
            format: "MiniMasterOperatorAccessKey/v1",
            projectId: firebaseConfig?.projectId || null,
            keyId: payload.keyId || null,
            role: payload.role || role,
            keyHash,
            fingerprint,
            key,
            issuedAt: new Date().toISOString(),
            expiresAt: new Date(expiresAtMs).toISOString(),
        };

        const fileName = `minimaster-access-key-${fileData.role}-${Date.now()}.json`;
        downloadJson(fileName, fileData);

        if (statusEl) {
            statusEl.innerHTML = `<div class='success-box'>✅ Schlüsseldatei erzeugt und gespeichert.<br />Rolle: <strong>${escapeHtml(fileData.role)}</strong> · Ablauf: <strong>${escapeHtml(fileData.expiresAt)}</strong><br />Fingerprint: <code>${escapeHtml(fileData.fingerprint)}</code><br /><button class='btn btn-secondary btn-sm' style='margin-top:8px' onclick='copyAccessKeyFingerprint(${JSON.stringify(fileData.fingerprint)})'>Fingerprint kopieren</button></div>`;
        }
        showNotification("Zugangsschlüsseldatei wurde erzeugt.", "success");
    } catch (error) {
        const msg = error?.message || "Erzeugung fehlgeschlagen.";
        renderAccessKeyError(statusEl, error, msg);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function redeemOperatorAccessKeyFile() {
    const statusEl = document.getElementById("access-key-redeem-status");
    const btn = document.getElementById("btn-redeem-access-key");
    const fileInput = document.getElementById("access-key-file");

    if (!functions) {
        renderAccessKeyError(statusEl, { code: "local/not-initialized" }, "Firebase Functions ist nicht initialisiert.");
        return;
    }
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        renderAccessKeyError(statusEl, { code: "functions/invalid-argument" }, "Bitte zuerst eine Schlüsseldatei auswählen.");
        return;
    }

    const file = fileInput.files[0];
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Schlüsseldatei wird geprüft und eingelöst...</div>";

    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const key = typeof parsed?.key === "string" ? parsed.key.trim() : "";
        const expectedHash = typeof parsed?.keyHash === "string" ? parsed.keyHash.trim().toLowerCase() : "";
        const expectedFingerprint = typeof parsed?.fingerprint === "string" ? parsed.fingerprint.trim() : "";

        if (!key || key.length < 43) {
            throw new Error("Die ausgewählte Datei enthält keinen gültigen 256-Bit-Schlüssel.");
        }

        const actualHash = await sha256HexBrowser(key);
        const actualFingerprint = buildKeyFingerprint(actualHash);

        if (expectedHash && expectedHash !== actualHash) {
            throw new Error("Schlüsseldatei ist inkonsistent: keyHash passt nicht zum Schlüsselwert.");
        }
        if (expectedFingerprint && expectedFingerprint !== actualFingerprint) {
            throw new Error("Schlüsseldatei ist inkonsistent: Fingerprint passt nicht zum Schlüsselwert.");
        }

        const redeemFn = functions.httpsCallable("redeemOperatorAccessKey");
        const result = await redeemFn({ key });
        const grantedRole = escapeHtml(result?.data?.role || "unbekannt");

        if (statusEl) {
            statusEl.innerHTML = `<div class='success-box'>✅ Zugang freigeschaltet. Rolle: <strong>${grantedRole}</strong>. Token wird aktualisiert...<br />Fingerprint: <code>${escapeHtml(actualFingerprint)}</code><br /><button class='btn btn-secondary btn-sm' style='margin-top:8px' onclick='copyAccessKeyFingerprint(${JSON.stringify(actualFingerprint)})'>Fingerprint kopieren</button></div>`;
        }

        await recheckAdminAccess();
        showNotification("Zugang über Schlüsseldatei erfolgreich freigeschaltet.", "success");
    } catch (error) {
        const msg = error?.message || "Einlösen fehlgeschlagen.";
        renderAccessKeyError(statusEl, error, msg);
    } finally {
        if (btn) btn.disabled = false;
    }
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

async function bootstrapFirstAdminAction() {
    const btn = document.getElementById("btn-bootstrap-admin");
    const statusEl = document.getElementById("bootstrap-admin-status");

    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Wird aktiviert...";
    }

    try {
        const bootstrapFunc = functions.httpsCallable("bootstrapFirstAdmin");
        const result = await bootstrapFunc({});

        if (statusEl) {
            statusEl.innerHTML = `<div class="admin-success-box">
                <h4>✅ ${escapeHtml(result.data.message)}</h4>
                <button onclick="window.location.reload()" class="btn btn-primary" style="margin-block-start:8px">Dashboard öffnen</button>
            </div>`;
        }
        showNotification("Admin-Zugang aktiviert!", "success");
    } catch (err) {
        let msg = err.message || "Unbekannter Fehler";
        if (err.code === "permission-denied") {
            msg = "Es existiert bereits ein Admin. Bitten Sie den bestehenden Admin, Ihnen eine Rolle zuzuweisen.";
        } else if (err.code === "unauthenticated") {
            msg = "Sie müssen angemeldet sein. Bitte registrieren oder einloggen.";
        }
        if (statusEl) statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>`;
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🔑 Als ersten Admin aktivieren";
        }
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
        if (statusEl) statusEl.innerHTML = "<div class='success-box'>✅ Konto erstellt! Sie werden weitergeleitet...</div>";
        showNotification("Konto erstellt! Jetzt wird die Admin-Berechtigung benötigt (Schritt 3).", "success");
    } catch (error) {
        let msg = error.message;
        if (error.code === "auth/email-already-in-use") {
            let providerHint = "";
            try {
                const methods = await auth.fetchSignInMethodsForEmail(email);
                if (Array.isArray(methods) && methods.length > 0) {
                    providerHint = ` Gefundene Anmeldearten: ${methods.join(", ")}.`;
                    if (!methods.includes("password")) {
                        providerHint += " Für dieses Konto ist kein Passwort-Login aktiv.";
                    }
                }
            } catch (_methodsError) {
                // Best effort only.
            }
            msg = "Diese E-Mail-Adresse wird bereits verwendet. Wechseln Sie zu 'Bestehendes Konto nutzen'." + providerHint;
        } else if (error.code === "auth/weak-password") {
            msg = "Das Passwort ist zu schwach. Verwenden Sie mindestens 8 Zeichen mit Buchstaben und Zahlen.";
        } else if (error.code === "auth/invalid-email") {
            msg = "Die E-Mail-Adresse ist ungültig.";
        } else if (error.code === "auth/network-request-failed") {
            msg = "Netzwerkfehler. Prüfen Sie die Internetverbindung und die Firebase-Konfiguration.";
        }
        console.error("Registration error:", error.code, error.message);
        if (statusEl) statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>`;
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Konto erstellen";
    }
}

// ==================== AUTHENTICATION ====================

function formatAuthDebugCode(error) {
    const code = (error && typeof error.code === "string") ? error.code.trim() : "";
    if (!code) return "";
    return `<div class='info' style='margin-top:6px'>Technischer Fehlercode: <code>${escapeHtml(code)}</code></div>`;
}

async function handleCheckAuthProviders() {
    const emailInput = document.getElementById("login-email");
    const statusEl = document.getElementById("login-status");
    const checkBtn = document.getElementById("check-provider-btn");
    const email = (emailInput?.value || "").trim();

    if (!email) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Bitte zuerst eine E-Mail-Adresse eingeben.</div>";
        return;
    }

    if (!auth) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Firebase Authentication ist noch nicht initialisiert.</div>";
        return;
    }

    if (checkBtn) checkBtn.disabled = true;
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Prüfe Anmeldearten für diese E-Mail...</div>";

    try {
        const methods = await auth.fetchSignInMethodsForEmail(email);

        if (!Array.isArray(methods) || methods.length === 0) {
            if (statusEl) {
                statusEl.innerHTML = "<div class='info'>ℹ️ Keine Anmeldearten zurückgegeben. Das kann bedeuten: (1) kein Konto vorhanden oder (2) Firebase Email Enumeration Protection ist aktiv.</div>";
            }
            return;
        }

        const hasPassword = methods.includes("password");
        const readable = methods.map(method => `<code>${escapeHtml(method)}</code>`).join(", ");
        if (statusEl) {
            statusEl.innerHTML = hasPassword
                ? `<div class='success-box'>✅ Passwort-Login ist aktiv. Gefundene Anmeldearten: ${readable}</div>`
                : `<div class='error'>Für diese E-Mail ist kein Passwort-Login aktiv. Gefundene Anmeldearten: ${readable}</div>`;
        }
    } catch (error) {
        const msg = error?.message || "Prüfung fehlgeschlagen.";
        if (statusEl) {
            statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>${formatAuthDebugCode(error)}`;
        }
    } finally {
        if (checkBtn) checkBtn.disabled = false;
    }
}

async function handleForgotPassword() {
    const emailInput = document.getElementById("login-email");
    const statusEl = document.getElementById("login-status");
    const resetBtn = document.getElementById("forgot-password-btn");
    const resetProminentBtn = document.getElementById("forgot-password-prominent-btn");
    const email = (emailInput?.value || "").trim();

    if (!email) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Bitte zuerst die hinterlegte E-Mail-Adresse eingeben.</div>";
        return;
    }

    if (!auth) {
        if (statusEl) statusEl.innerHTML = "<div class='error'>Firebase Authentication ist noch nicht initialisiert.</div>";
        return;
    }

    if (resetBtn) resetBtn.disabled = true;
    if (resetProminentBtn) resetProminentBtn.disabled = true;
    if (statusEl) statusEl.innerHTML = "<div class='loading'>Sende Passwort-Reset-Link...</div>";

    try {
        // Diagnose: Falls das Konto kein Passwort-Provider-Konto ist, kommt keine Reset-Mail.
        let methods = null;
        try {
            methods = await auth.fetchSignInMethodsForEmail(email);
        } catch (methodsError) {
            console.warn("fetchSignInMethodsForEmail failed:", methodsError?.code || methodsError?.message || methodsError);
        }

        if (Array.isArray(methods) && methods.length > 0 && !methods.includes("password")) {
            const readableMethods = methods.join(", ");
            if (statusEl) {
                statusEl.innerHTML = `<div class='error'>Für diese E-Mail ist keine Passwort-Anmeldung aktiviert (gefunden: ${escapeHtml(readableMethods)}). Bitte mit dem passenden Provider anmelden oder ein Passwort-Konto erstellen.</div>`;
            }
            return;
        }

        // Hinweis: Bei aktivierter Email Enumeration Protection kann Firebase hier absichtlich
        // eine leere Liste liefern, obwohl ein Konto existiert. Daher niemals bei [] abbrechen.

        await auth.sendPasswordResetEmail(email);
        if (statusEl) {
            const senderHint = firebaseConfig?.projectId
                ? `Absender meist: noreply@${escapeHtml(firebaseConfig.projectId)}.firebaseapp.com.`
                : "Absender meist: noreply@<projekt>.firebaseapp.com.";
            if (Array.isArray(methods) && methods.length === 0) {
                statusEl.innerHTML = `<div class='info'>ℹ️ Reset-Anfrage wurde an Firebase übergeben. Wegen aktivem Kontoschutz kann der Versand nicht verifiziert werden. Bitte in Firebase Console unter Authentication → Users prüfen, ob für diese E-Mail ein Passwort-Provider existiert.</div><div class='info' style='margin-top:6px'>${senderHint}</div>`;
            } else {
                statusEl.innerHTML = `<div class='success-box'>✅ Passwort-Reset-E-Mail versendet. Bitte Posteingang, Spam und ggf. Gmail-Kategorie "Werbung" prüfen.<br />${senderHint}</div>`;
            }
        }
        showNotification(
            Array.isArray(methods) && methods.length === 0
                ? "Reset-Anfrage übergeben (Versand durch Firebase nicht verifizierbar)."
                : "Passwort-Reset-E-Mail wurde versendet.",
            Array.isArray(methods) && methods.length === 0 ? "info" : "success"
        );
    } catch (error) {
        let msg = error.message;
        if (error.code === "auth/user-not-found") {
            msg = "Für diese E-Mail-Adresse wurde kein Operator-Konto gefunden.";
        } else if (error.code === "auth/invalid-email") {
            msg = "Die E-Mail-Adresse ist ungültig.";
        } else if (error.code === "auth/too-many-requests") {
            msg = "Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.";
        } else if (error.code === "auth/network-request-failed") {
            msg = "Netzwerkfehler. Prüfen Sie die Internetverbindung und die Firebase-Konfiguration.";
        }
        console.error("Password reset error:", error.code, error.message);
        if (statusEl) {
            statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>${formatAuthDebugCode(error)}`;
        }
    } finally {
        if (resetBtn) resetBtn.disabled = false;
        if (resetProminentBtn) resetProminentBtn.disabled = false;
    }
}

function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const statusEl = document.getElementById("login-status");

    if (statusEl) statusEl.innerHTML = "<div class='loading'>Anmeldung...</div>";

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            if (statusEl) statusEl.innerHTML = "<div class='success-box'>✅ Anmeldung erfolgreich...</div>";
        })
        .catch(error => {
            let msg = error.message;
            if (error.code === "auth/user-not-found" || error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
                msg = "E-Mail oder Passwort ungültig.";
            } else if (error.code === "auth/too-many-requests") {
                msg = "Zu viele Versuche. Bitte warten Sie einen Moment.";
            } else if (error.code === "auth/network-request-failed") {
                msg = "Netzwerkfehler. Prüfen Sie die Internetverbindung und die Firebase-Konfiguration.";
            }
            console.error("Login error:", error.code, error.message);
            if (statusEl) {
                statusEl.innerHTML = `<div class='error'>${escapeHtml(msg)}</div>${formatAuthDebugCode(error)}`;
            }
        });
}

function logout() {
    stopSessionMonitoring();
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
    startSessionMonitoring();
}

/**
 * Controls tab visibility based on operator role.
 * - admin: all tabs
 * - support: Overview, Support Tickets
 * - auditor: Overview, Compliance, Error Logs
 */
function applyRoleRestrictions(role) {
    const tabAccess = {
        admin: ["overview", "users", "devices", "subscriptions", "pairing", "support", "errorlogs", "compliance", "setup", "firebase", "aimonitor", "legal"],
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
    renderP0BlockerCockpit();
    renderAllPlatformSections();
    renderAiConsentStatus();
    renderBootstrapFirebaseConfig(firebaseConfig);
    renderCommandBuilderConfig(loadCommandBuilderConfig());
    loadOperatorConfig();
    refreshCommissioningReport();
    renderCommandCatalog(firebaseConfig.projectId);
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();

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
        persistBootstrapFirebaseConfig(false);
        refreshCommissioningReport();
        renderCommandCatalog(firebaseConfig.projectId);
        showNotification("Firebase-Konfiguration gespeichert. Verbindung wird hergestellt...", "success");
        // Auto-initialize Firebase in-place to avoid confusing reload requirement
        initializeFirebaseAfterConfigSave();
    } catch (error) {
        console.error("[saveBootstrapFirebaseConfig] Fehler:", error);
        showNotification(error.message, "error");
        alert("Firebase-Konfiguration Fehler:\n\n" + error.message);
    }
}

function reloadWithBootstrapConfig() {
    try {
        persistBootstrapFirebaseConfig(false);
        window.location.reload();
    } catch (error) {
        console.error("[reloadWithBootstrapConfig] Fehler:", error);
        showNotification(error.message, "error");
        alert("Firebase-Konfiguration Fehler:\n\n" + error.message);
    }
}

function initializeFirebaseAfterConfigSave() {
    // If Firebase already initialized, just reload
    if (app) {
        window.location.reload();
        return;
    }

    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        functions = firebase.functions();

        document.getElementById("login-form").addEventListener("submit", handleLogin);
        const registerForm = document.getElementById("register-form");
        if (registerForm) {
            registerForm.addEventListener("submit", handleRegistration);
        }

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
                        showAdminActivationPhase(user);
                    }
                });
            } else {
                currentUserRole = null;
                showOnboarding();
            }
        });

        updateOnboardingStepper(2);
        showOnboardingPhase(2);
        console.log("Firebase initialized after config save.");
        showNotification("Firebase verbunden! Bitte melden Sie sich an oder erstellen Sie ein Konto.", "success");
    } catch (error) {
        console.error("Firebase initialization after config save failed:", error);
        showNotification("Firebase-Initialisierung fehlgeschlagen: " + error.message + ". Versuche Seite neu zu laden.", "error");
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
    loadDashboardCharts();
}

function refreshAllStats() {
    loadStats();
    loadPerformanceMetrics();
    loadSubscriptionWarnings();
    loadDashboardCharts();
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
        autoMarkP0Check("commissioningSupport", "commissioningEvidence", `[${new Date().toLocaleString("de-DE")}] Support-Antwort gespeichert (Ticket ${ticketId}).`);
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
        autoMarkP0Check("commissioningSupport", "commissioningEvidence", `[${new Date().toLocaleString("de-DE")}] Ticket-Status aktualisiert (${ticketId} -> ${newStatus}).`);
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
        autoMarkP0Check("commissioningCompliance", "commissioningEvidence", `[${new Date().toLocaleString("de-DE")}] DSAR-Export erfolgreich für ${masterId}.`);
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
        autoMarkP0Check("commissioningCompliance", "commissioningEvidence", `[${new Date().toLocaleString("de-DE")}] Audit-Export erfolgreich (${startDate} bis ${endDate}, ${logs.length} Einträge).`);
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Error exporting audit logs: ${error.message}</div>`;
    }
}

// ==================== LEGACY AUTH USAGE MONITOR ====================

async function loadLegacyAuthUsage() {
    const resultEl = document.getElementById("legacy-auth-result");
    if (!resultEl) return;
    resultEl.innerHTML = "<div class='loading'>Legacy-Auth Nutzung wird geladen...</div>";

    try {
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const cutoff = firebase.firestore.Timestamp.fromDate(fourteenDaysAgo);

        const snapshot = await db.collection("legacyAuthUsage")
            .where("timestamp", ">=", cutoff)
            .orderBy("timestamp", "desc")
            .limit(500)
            .get();

        const total = snapshot.size;
        const byEndpoint = {};
        const byDay = {};

        snapshot.forEach(doc => {
            const d = doc.data();
            const endpoint = d.endpoint || "unknown";
            byEndpoint[endpoint] = (byEndpoint[endpoint] || 0) + 1;

            if (d.timestamp && d.timestamp.toDate) {
                const day = d.timestamp.toDate().toISOString().split("T")[0];
                byDay[day] = (byDay[day] || 0) + 1;
            }
        });

        const zeroForFourteen = total === 0;
        const statusClass = zeroForFourteen ? "success-box" : "warning-box";
        const statusText = zeroForFourteen
            ? "✅ Keine Legacy-Auth Nutzung in den letzten 14 Tagen — Dekommissionierung möglich."
            : `⚠️ ${total} Legacy-Auth Aufrufe in den letzten 14 Tagen — Migration noch nicht abgeschlossen.`;

        let endpointRows = Object.entries(byEndpoint)
            .map(([ep, count]) => `<tr><td>${ep}</td><td>${count}</td></tr>`)
            .join("");

        let dayRows = Object.entries(byDay)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([day, count]) => `<tr><td>${day}</td><td>${count}</td></tr>`)
            .join("");

        resultEl.innerHTML = `
            <div class="${statusClass}">${statusText}</div>
            <h4 style="margin-block-start:15px">Nach Endpoint</h4>
            <table><tr><th>Endpoint</th><th>Aufrufe</th></tr>${endpointRows || "<tr><td colspan='2'>Keine Daten</td></tr>"}</table>
            <h4 style="margin-block-start:15px">Nach Tag (letzte 14 Tage)</h4>
            <table><tr><th>Datum</th><th>Aufrufe</th></tr>${dayRows || "<tr><td colspan='2'>Keine Daten</td></tr>"}</table>
        `;
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler beim Laden: ${error.message}</div>`;
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

    const duration = type === "error" ? 10000 : 5000;
    setTimeout(() => {
        notification.style.display = "none";
    }, duration);
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

// ==================== FIREBASE TAB: FUNCTIONS STATUS ====================

async function loadFunctionsStatus() {
    const resultEl = document.getElementById("functions-status-result");
    resultEl.innerHTML = "<div class='loading'>Lade Status...</div>";

    try {
        const healthResult = await functions.httpsCallable("adminHealthCheck")({});
        const data = healthResult.data || {};
        const checks = data.checks || {};
        const prereqs = data.prerequisites || {};
        const ai = prereqs.ai || {};
        const env = prereqs.environment || {};

        let html = `<div class="status-overview">`;
        html += `<p><strong>Zeitstempel:</strong> ${escapeHtml(data.timestamp || "-")}</p>`;
        html += `<p><strong>Projekt-ID:</strong> ${escapeHtml(env.projectId || "-")}</p>`;
        html += `<p><strong>Storage:</strong> <span class="${String(prereqs.storage).startsWith("ok") ? "status-ok" : "status-error"}">${escapeHtml(String(prereqs.storage))}</span> (Bucket: ${escapeHtml(prereqs.storageBucket || "-")})</p>`;
        html += `<p><strong>Gemini API:</strong> <span class="${ai.geminiConfigured ? "status-ok" : "status-error"}">${ai.geminiConfigured ? "Konfiguriert" : "Nicht konfiguriert"}</span> (Modell: ${escapeHtml(ai.geminiModel || "-")})</p>`;
        html += `<p><strong>OpenAI API:</strong> <span class="${ai.openAiConfigured ? "status-ok" : "status-warn"}">${ai.openAiConfigured ? "Konfiguriert" : "Nicht konfiguriert"}</span></p>`;
        html += `</div>`;

        html += `<h4>Firestore Collections</h4><table class="data-table"><thead><tr><th>Collection</th><th>Status</th></tr></thead><tbody>`;
        for (const [name, status] of Object.entries(checks)) {
            const isOk = status === "ok";
            html += `<tr><td>${escapeHtml(name)}</td><td><span class="${isOk ? "status-ok" : "status-error"}">${escapeHtml(String(status))}</span></td></tr>`;
        }
        html += `</tbody></table>`;

        resultEl.innerHTML = html;
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== FIREBASE TAB: GEMINI API TEST ====================

async function testGeminiApi() {
    const resultEl = document.getElementById("gemini-test-result");
    const prompt = (document.getElementById("gemini-test-prompt")?.value || "").trim();
    resultEl.innerHTML = "<div class='loading'>Teste Gemini API...</div>";

    try {
        const payload = prompt ? { prompt } : {};
        const result = await functions.httpsCallable("testGeminiConnection")(payload);
        const data = result.data || {};

        if (data.success) {
            resultEl.innerHTML = `<div class='success-box'>
                <p><strong>Modell:</strong> ${escapeHtml(data.model)}</p>
                <p><strong>Antwort:</strong></p>
                <pre class="gemini-response">${escapeHtml(data.response)}</pre>
            </div>`;
        } else {
            resultEl.innerHTML = `<div class='error'>${escapeHtml(data.error)}</div>`;
        }
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== FIREBASE TAB: KNOWLEDGE BASE ====================

async function loadKnowledgeBase() {
    const editor = document.getElementById("knowledge-base-editor");
    const sourceInfo = document.getElementById("kb-source-info");
    editor.value = "Lade...";

    try {
        const result = await functions.httpsCallable("getKnowledgeBase")({});
        const data = result.data || {};
        editor.value = data.content || "";
        const sourceLabel = data.source === "firestore" ? "Firestore (bearbeitet)" : data.source === "file" ? "Deployed-Datei" : "Leer";
        sourceInfo.textContent = `Quelle: ${sourceLabel}`;
    } catch (error) {
        editor.value = "";
        sourceInfo.textContent = "";
        showNotification("Fehler beim Laden: " + error.message, "error");
    }
}

async function saveKnowledgeBase() {
    const editor = document.getElementById("knowledge-base-editor");
    const resultEl = document.getElementById("kb-save-result");
    const content = editor.value;

    if (!content.trim()) {
        showNotification("Knowledge Base darf nicht leer sein.", "info");
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Speichere...</div>";

    try {
        const result = await functions.httpsCallable("updateKnowledgeBase")({ content });
        const data = result.data || {};
        resultEl.innerHTML = `<div class='success-box'>Gespeichert (${data.length} Zeichen). Quelle ist jetzt Firestore.</div>`;
        document.getElementById("kb-source-info").textContent = "Quelle: Firestore (bearbeitet)";
        showNotification("Knowledge Base gespeichert.", "success");
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== FIREBASE TAB: AUDIT LOG VIEWER ====================

async function loadAuditLogs() {
    const listEl = document.getElementById("audit-log-list");
    const actionFilter = document.getElementById("audit-action-filter")?.value || "";
    const limit = parseInt(document.getElementById("audit-limit")?.value) || 50;
    listEl.innerHTML = "<div class='loading'>Lade Audit-Logs...</div>";

    try {
        let query = db.collection("audit_logs").orderBy("timestamp", "desc");
        if (actionFilter) {
            query = query.where("action", "==", actionFilter);
        }
        query = query.limit(Math.min(limit, 500));

        const snapshot = await query.get();

        if (snapshot.empty) {
            listEl.innerHTML = "<p class='text-muted'>Keine Audit-Logs gefunden.</p>";
            return;
        }

        let html = `<table class="data-table"><thead><tr>
            <th>Zeit</th><th>Aktion</th><th>User</th><th>Ziel</th><th>Status</th><th>Details</th>
        </tr></thead><tbody>`;

        snapshot.forEach(doc => {
            const d = doc.data();
            const time = d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString("de-DE") : "-";
            const action = d.action || "-";
            const userId = d.userId || "-";
            const target = d.targetResource || "-";
            const status = d.status || "-";
            const details = d.metadata ? JSON.stringify(d.metadata).substring(0, 100) : "-";

            html += `<tr>
                <td>${escapeHtml(time)}</td>
                <td><code>${escapeHtml(action)}</code></td>
                <td title="${escapeHtml(userId)}">${escapeHtml(userId.substring(0, 15))}${userId.length > 15 ? "\u2026" : ""}</td>
                <td title="${escapeHtml(target)}">${escapeHtml(target.substring(0, 25))}${target.length > 25 ? "\u2026" : ""}</td>
                <td><span class="${status === "success" ? "status-ok" : "status-error"}">${escapeHtml(status)}</span></td>
                <td title="${escapeHtml(details)}">${escapeHtml(details.substring(0, 50))}${details.length > 50 ? "\u2026" : ""}</td>
            </tr>`;
        });

        html += `</tbody></table>`;
        html += `<p class="text-muted">${snapshot.size} Eintr\u00e4ge geladen.</p>`;
        listEl.innerHTML = html;
    } catch (error) {
        listEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== FIREBASE TAB: FCM TEST PUSH ====================

async function sendTestFcm() {
    const resultEl = document.getElementById("fcm-test-result");
    const childId = (document.getElementById("fcm-child-id")?.value || "").trim();
    const token = (document.getElementById("fcm-token-direct")?.value || "").trim();

    if (!childId && !token) {
        showNotification("Bitte Kind-ID oder FCM-Token eingeben.", "info");
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Sende Test-Push...</div>";

    try {
        const payload = token ? { token } : { childId };
        const result = await functions.httpsCallable("sendTestFcmMessage")(payload);
        const data = result.data || {};

        if (data.success) {
            resultEl.innerHTML = `<div class='success-box'>Test-Push erfolgreich gesendet!<br>Message-ID: <code>${escapeHtml(data.messageId)}</code></div>`;
        } else {
            resultEl.innerHTML = `<div class='error'>${escapeHtml(data.error)}</div>`;
        }
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
    }
}

// ==================== FIREBASE TAB: SCHEDULED JOBS ====================

async function triggerJob(jobName) {
    const resultEl = document.getElementById("job-trigger-result");
    resultEl.innerHTML = `<div class='loading'>F\u00fchre "${escapeHtml(jobName)}" aus...</div>`;

    try {
        const result = await functions.httpsCallable("triggerScheduledJob")({ jobName });
        const data = result.data || {};

        if (data.success) {
            const details = data.result ? JSON.stringify(data.result, null, 2) : "";
            resultEl.innerHTML = `<div class='success-box'>
                <p><strong>Job:</strong> ${escapeHtml(data.jobName)}</p>
                <p><strong>Dauer:</strong> ${data.duration}ms</p>
                ${details ? `<pre>${escapeHtml(details)}</pre>` : ""}
            </div>`;
        } else {
            resultEl.innerHTML = `<div class='error'>Job fehlgeschlagen.</div>`;
        }
    } catch (error) {
        resultEl.innerHTML = `<div class='error'>Fehler: ${escapeHtml(error.message)}</div>`;
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

// ==================== GRAPHICAL DASHBOARD CHARTS ====================

const DONUT_CIRCUMFERENCE = 100; // percentage-based

function setDonutSegment(id, pct, offset) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("stroke-dasharray", pct + " " + (DONUT_CIRCUMFERENCE - pct));
    el.setAttribute("stroke-dashoffset", String(offset));
}

// --- Subscription Donut ---
async function loadSubscriptionChart() {
    try {
        const snap = await db.collection("masters").get();
        let active = 0, trial = 0, expired = 0, none = 0;
        snap.forEach(function(doc) {
            const sub = doc.data().subscription;
            if (!sub || !sub.status) { none++; return; }
            if (sub.status === "active") active++;
            else if (sub.status === "trial") trial++;
            else expired++;
        });
        const total = active + trial + expired + none;
        const pActive  = total ? (active / total) * DONUT_CIRCUMFERENCE : 0;
        const pTrial   = total ? (trial / total) * DONUT_CIRCUMFERENCE : 0;
        const pExpired = total ? ((expired + none) / total) * DONUT_CIRCUMFERENCE : 0;

        // 25 = default offset so segments start at 12 o'clock
        setDonutSegment("seg-active",  pActive, 25);
        setDonutSegment("seg-trial",   pTrial,  25 - pActive);
        setDonutSegment("seg-expired", pExpired, 25 - pActive - pTrial);

        const centerEl = document.getElementById("donut-center-subs");
        if (centerEl) centerEl.textContent = total;

        const legend = document.getElementById("legend-subs");
        if (legend) legend.innerHTML =
            '<div class="legend-row"><span class="legend-dot" style="background:#3b82f6"></span>Aktiv<span class="legend-value">' + active + '</span></div>' +
            '<div class="legend-row"><span class="legend-dot" style="background:#eab308"></span>Trial<span class="legend-value">' + trial + '</span></div>' +
            '<div class="legend-row"><span class="legend-dot" style="background:#94a3b8"></span>Abgelaufen/Keine<span class="legend-value">' + (expired + none) + '</span></div>';
    } catch (e) {
        console.warn("Subscription chart error:", e);
    }
}

// --- Task Status Bars ---
async function loadTaskChart() {
    const container = document.getElementById("chart-tasks-bars");
    const legend = document.getElementById("legend-tasks");
    if (!container) return;
    try {
        const snap = await db.collectionGroup("tasks").get();
        var counts = { pending: 0, pending_approval: 0, approved: 0, rejected: 0 };
        snap.forEach(function(doc) {
            var s = doc.data().status || "pending";
            if (counts.hasOwnProperty(s)) counts[s]++;
            else counts.pending++;
        });
        var max = Math.max(1, counts.pending, counts.pending_approval, counts.approved, counts.rejected);
        var labels = { pending: "Offen", pending_approval: "Prüfung", approved: "Genehmigt", rejected: "Abgelehnt" };
        var html = "";
        var legendHtml = "";
        Object.keys(counts).forEach(function(key) {
            var pct = Math.round((counts[key] / max) * 100);
            html += '<div class="bar-row">' +
                '<span class="bar-label">' + labels[key] + '</span>' +
                '<div class="bar-track"><div class="bar-fill bar-' + key + '" style="inline-size:' + pct + '%"></div></div>' +
                '<span class="bar-count">' + counts[key] + '</span>' +
                '</div>';
        });
        container.innerHTML = html;
        if (legend) {
            var total = counts.pending + counts.pending_approval + counts.approved + counts.rejected;
            legend.innerHTML = '<div class="legend-row" style="color:#64748b">Gesamt: <span class="legend-value">' + total + '</span></div>';
        }
    } catch (e) {
        container.innerHTML = '<div class="info">Aufgaben nicht verfügbar.</div>';
    }
}

// --- Device Online Status ---
async function loadDeviceOnlineChart() {
    try {
        const snap = await db.collection("children").get();
        const now = Date.now();
        const ONLINE_THRESHOLD = 15 * 60 * 1000; // 15 min
        let online = 0, offline = 0;
        snap.forEach(function(doc) {
            const d = doc.data();
            if (d.lastSeen) {
                const lastMs = d.lastSeen.seconds ? d.lastSeen.seconds * 1000 : 0;
                if (now - lastMs < ONLINE_THRESHOLD) online++;
                else offline++;
            } else {
                offline++;
            }
        });
        const total = online + offline;
        const pOnline = total ? (online / total) * DONUT_CIRCUMFERENCE : 0;
        setDonutSegment("seg-online", pOnline, 25);

        const centerEl = document.getElementById("donut-center-devices");
        if (centerEl) centerEl.textContent = total ? Math.round((online / total) * 100) + "%" : "0%";

        const legend = document.getElementById("legend-devices");
        if (legend) legend.innerHTML =
            '<div class="legend-row"><span class="legend-dot" style="background:#22c55e"></span>Online<span class="legend-value">' + online + '</span></div>' +
            '<div class="legend-row"><span class="legend-dot" style="background:#e2e8f0"></span>Offline<span class="legend-value">' + offline + '</span></div>';
    } catch (e) {
        console.warn("Device chart error:", e);
    }
}

// --- 7-Day Error Trend ---
async function loadErrorTrendChart() {
    const container = document.getElementById("chart-error-trend");
    if (!container) return;
    try {
        const now = new Date();
        const days = [];
        for (var i = 6; i >= 0; i--) {
            var d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setHours(0,0,0,0);
            days.push({ date: d, label: d.toLocaleDateString("de-DE", { weekday: "short" }), count: 0 });
        }
        var weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        weekAgo.setHours(0,0,0,0);

        const snap = await db.collection("error_logs")
            .where("timestamp", ">=", firebase.firestore.Timestamp.fromDate(weekAgo))
            .get();

        snap.forEach(function(doc) {
            var ts = doc.data().timestamp;
            if (!ts) return;
            var eDate = new Date(ts.seconds * 1000);
            eDate.setHours(0,0,0,0);
            for (var j = 0; j < days.length; j++) {
                if (days[j].date.getTime() === eDate.getTime()) {
                    days[j].count++;
                    break;
                }
            }
        });

        var maxCount = Math.max(1, Math.max.apply(null, days.map(function(d) { return d.count; })));
        var html = "";
        days.forEach(function(day) {
            var h = Math.max(2, Math.round((day.count / maxCount) * 80));
            var cls = day.count > maxCount * 0.75 ? "spark-high" : day.count > maxCount * 0.4 ? "spark-med" : "";
            html += '<div class="spark-col">' +
                '<span class="spark-count">' + day.count + '</span>' +
                '<div class="spark-bar ' + cls + '" style="block-size:' + h + 'px"></div>' +
                '<span class="spark-label">' + day.label + '</span>' +
                '</div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="info">Fehler-Trend nicht verfügbar.</div>';
    }
}

// --- Conversion Funnel ---
async function loadFunnelChart() {
    const container = document.getElementById("chart-funnel");
    if (!container) return;
    try {
        // Step 1: Registered masters
        const mastersSnap = await db.collection("masters").get();
        const registered = mastersSnap.size;

        // Step 2: Masters that have at least one paired child
        const childrenSnap = await db.collection("children").get();
        const masterWithChild = new Set();
        childrenSnap.forEach(function(doc) {
            var mi = doc.data().masterImei;
            if (mi) masterWithChild.add(mi);
        });
        const paired = masterWithChild.size;

        // Step 3: Masters that have tasks
        const tasksSnap = await db.collectionGroup("tasks").get();
        const masterWithTask = new Set();
        tasksSnap.forEach(function(doc) {
            var mi = doc.data().masterImei;
            if (mi) masterWithTask.add(mi);
        });
        const withTasks = masterWithTask.size;

        // Step 4: Active subscriptions
        var activeSubs = 0;
        mastersSnap.forEach(function(doc) {
            var sub = doc.data().subscription;
            if (sub && sub.status === "active") activeSubs++;
        });

        var steps = [
            { label: "Registriert", count: registered, color: "#3b82f6" },
            { label: "Kind gepairt", count: paired, color: "#6366f1" },
            { label: "Aufgabe erstellt", count: withTasks, color: "#8b5cf6" },
            { label: "Abo aktiv", count: activeSubs, color: "#a855f7" }
        ];
        var maxH = 120;
        var maxVal = Math.max(1, registered);

        var html = "";
        steps.forEach(function(step, idx) {
            var h = Math.max(8, Math.round((step.count / maxVal) * maxH));
            var pct = registered ? Math.round((step.count / registered) * 100) : 0;
            if (idx > 0) html += '<span class="funnel-arrow">›</span>';
            html += '<div class="funnel-step">' +
                '<div class="funnel-bar" style="block-size:' + h + 'px;background:' + step.color + '"></div>' +
                '<span class="funnel-count">' + step.count + '</span>' +
                '<span class="funnel-label">' + step.label + ' (' + pct + '%)</span>' +
                '</div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="info">Funnel-Daten nicht verfügbar.</div>';
    }
}

// --- System Health Banner ---
async function updateSystemHealth() {
    const banner = document.getElementById("system-health-banner");
    const indicator = document.getElementById("health-indicator");
    const details = document.getElementById("health-details");
    if (!banner) return;

    var checks = [];
    try {
        // 1. Error rate (24h)
        var yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        var errSnap = await db.collection("error_logs")
            .where("timestamp", ">=", firebase.firestore.Timestamp.fromDate(yesterday))
            .get();
        var errCount = errSnap.size;
        if (errCount === 0) checks.push({ label: "Fehler (24h): " + errCount, status: "green" });
        else if (errCount <= 10) checks.push({ label: "Fehler (24h): " + errCount, status: "yellow" });
        else checks.push({ label: "Fehler (24h): " + errCount, status: "red" });

        // 2. Open tickets
        var ticketSnap = await db.collection("supportTickets")
            .where("status", "in", ["open", "escalated"])
            .get();
        var ticketCount = ticketSnap.size;
        if (ticketCount === 0) checks.push({ label: "Offene Tickets: " + ticketCount, status: "green" });
        else if (ticketCount <= 5) checks.push({ label: "Offene Tickets: " + ticketCount, status: "yellow" });
        else checks.push({ label: "Offene Tickets: " + ticketCount, status: "red" });

        // 3. Firebase config
        var configOk = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("your-");
        checks.push({ label: "Firebase-Config", status: configOk ? "green" : "red" });

        // 4. Active pairing codes (too many = suspicious)
        var now = firebase.firestore.Timestamp.now();
        var pairSnap = await db.collection("pairingCodes").get();
        var activePairing = 0;
        pairSnap.forEach(function(doc) {
            if (doc.data().expiresAt && doc.data().expiresAt.seconds > now.seconds) activePairing++;
        });
        if (activePairing <= 20) checks.push({ label: "Kopplungscodes: " + activePairing, status: "green" });
        else checks.push({ label: "Kopplungscodes: " + activePairing + " (ungewöhnlich hoch)", status: "yellow" });

        // Determine overall status
        var hasRed = checks.some(function(c) { return c.status === "red"; });
        var hasYellow = checks.some(function(c) { return c.status === "yellow"; });
        var overall = hasRed ? "red" : hasYellow ? "yellow" : "green";

        banner.className = "health-banner health-" + overall;
        var statusLabels = { green: "Alle Systeme betriebsbereit", yellow: "Einige Hinweise vorhanden", red: "Achtung: Probleme erkannt" };
        indicator.innerHTML = '<span class="health-dot"></span><span class="health-label">' + statusLabels[overall] + '</span>';

        var detailsHtml = "";
        checks.forEach(function(c) {
            detailsHtml += '<span class="health-item"><span class="h-dot h-dot-' + c.status + '"></span>' + escapeHtml(c.label) + '</span>';
        });
        details.innerHTML = detailsHtml;
    } catch (e) {
        banner.className = "health-banner health-yellow";
        indicator.innerHTML = '<span class="health-dot"></span><span class="health-label">Systemstatus konnte nicht vollständig geprüft werden</span>';
        details.innerHTML = '<span class="health-item"><span class="h-dot h-dot-yellow"></span>' + escapeHtml(e.message) + '</span>';
    }
}

// --- Load all charts ---
function loadDashboardCharts() {
    loadSubscriptionChart();
    loadTaskChart();
    loadDeviceOnlineChart();
    loadErrorTrendChart();
    loadFunnelChart();
    updateSystemHealth();
}

// ==================== AI MONITOR (GEMINI) ====================

let currentAnalysisId = null;
let currentAnalyses = [];

async function startAiErrorScan() {
    const hours = parseInt(document.getElementById("ai-scan-hours").value, 10);
    const statusEl = document.getElementById("ai-scan-status");
    const resultsEl = document.getElementById("ai-analysis-results");
    const btn = document.getElementById("btn-ai-scan");

    btn.disabled = true;
    statusEl.style.display = "flex";
    resultsEl.style.display = "none";

    try {
        const analyzeSystemErrors = firebase.functions().httpsCallable("analyzeSystemErrors");
        const response = await analyzeSystemErrors({ hours });
        const data = response.data;

        currentAnalysisId = data.analysisId;
        currentAnalyses = data.analyses || [];

        renderAiSummary(data);
        renderAiErrorCards(data.analyses || []);
        resultsEl.style.display = "block";

        showNotification("KI-Analyse abgeschlossen: " + data.summary, "success");
    } catch (err) {
        showNotification("KI-Analyse fehlgeschlagen: " + err.message, "error");
    } finally {
        btn.disabled = false;
        statusEl.style.display = "none";
    }
}

function renderAiSummary(data) {
    const bar = document.getElementById("ai-summary-bar");
    const total = data.totalErrors || 0;
    const analyzed = (data.analyses || []).length;
    const fixable = (data.analyses || []).filter(a => a.autoFixable).length;
    const critical = (data.analyses || []).filter(a => a.severity === "critical").length;

    bar.innerHTML = [
        '<span class="summary-stat">📊 <strong>' + escapeHtml(String(total)) + '</strong> Fehler gefunden</span>',
        '<span class="summary-stat">🔬 <strong>' + escapeHtml(String(analyzed)) + '</strong> analysiert</span>',
        '<span class="summary-stat">🔧 <strong>' + escapeHtml(String(fixable)) + '</strong> Auto-Fix möglich</span>',
        critical > 0 ? '<span class="summary-stat">🔴 <strong>' + escapeHtml(String(critical)) + '</strong> kritisch</span>' : '',
        '<span class="summary-stat" style="opacity:0.7">Modell: ' + escapeHtml(data.model || "gemini-2.0-flash") + '</span>',
    ].join("");
}

function renderAiErrorCards(analyses) {
    const container = document.getElementById("ai-error-cards");
    if (!analyses.length) {
        container.innerHTML = '<p style="color:#64748b;text-align:center;padding:2rem">Keine Fehler im gewählten Zeitraum.</p>';
        return;
    }

    container.innerHTML = analyses.map((a, idx) => {
        const severity = escapeHtml(a.severity || "medium");
        const category = escapeHtml(a.category || "code");
        const fnName = escapeHtml(a.functionName || "?");
        const occurrences = a.occurrences || 1;
        const errMsg = escapeHtml((a.errorMessage || "").substring(0, 300));
        const diagnosis = escapeHtml(a.diagnosis || "Keine Diagnose verfügbar.");
        const solution = escapeHtml(a.solution || "Keine Lösung vorgeschlagen.");

        let fixSection = "";
        if (a.autoFixable && a.autoFixAction) {
            const fixDesc = escapeHtml(a.autoFixDescription || a.autoFixAction);
            const appliedAlready = a.fixApplied;
            fixSection = '<div class="ai-fix-section">' +
                '<div class="ai-field"><span class="ai-field-label">Auto-Fix verfügbar</span>' +
                '<span class="ai-field-value">' + fixDesc + '</span></div>' +
                '<div class="ai-fix-actions">' +
                (appliedAlready
                    ? '<span class="fix-applied-badge">✅ Fix angewendet</span>'
                    : '<button class="btn-autofix" onclick="executeAiFix(' + idx + ', \'' + escapeHtml(a.autoFixAction) + '\')" id="btn-fix-' + idx + '">⚡ Auto-Fix ausführen</button>'
                ) +
                '</div></div>';
        } else {
            fixSection = '<div class="ai-fix-section no-fix">' +
                '<div class="ai-field"><span class="ai-field-label">Auto-Fix</span>' +
                '<span class="ai-field-value">Nicht verfügbar – manuelle Behebung erforderlich</span></div></div>';
        }

        return '<div class="ai-error-card severity-' + severity + '">' +
            '<div class="ai-error-header">' +
            '<h4>' + fnName + ' <span style="font-weight:400;color:#94a3b8">(×' + escapeHtml(String(occurrences)) + ')</span></h4>' +
            '<div><span class="severity-badge ' + severity + '">' + severity + '</span> ' +
            '<span class="category-badge">' + category + '</span></div></div>' +
            '<div class="ai-error-body">' +
            '<div class="ai-field"><span class="ai-field-label">Fehlermeldung</span><span class="ai-field-value error-msg">' + errMsg + '</span></div>' +
            '<div class="ai-field"><span class="ai-field-label">KI-Diagnose</span><span class="ai-field-value">' + diagnosis + '</span></div>' +
            '<div class="ai-field"><span class="ai-field-label">Lösungsvorschlag</span><span class="ai-field-value">' + solution + '</span></div>' +
            fixSection +
            '</div></div>';
    }).join("");
}

async function executeAiFix(errorIndex, action) {
    if (!currentAnalysisId) {
        showNotification("Keine aktive Analyse vorhanden.", "error");
        return;
    }

    const confirmed = confirm(
        "Auto-Fix ausführen?\n\nAktion: " + action +
        "\n\nDiese Aktion wird sofort ausgeführt und protokolliert."
    );
    if (!confirmed) return;

    const btn = document.getElementById("btn-fix-" + errorIndex);
    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Wird ausgeführt...";
    }

    try {
        const executeAutoFix = firebase.functions().httpsCallable("executeAutoFix");
        const response = await executeAutoFix({
            analysisId: currentAnalysisId,
            errorIndex: errorIndex,
            action: action,
        });

        if (btn) {
            btn.outerHTML = '<span class="fix-applied-badge">✅ ' + escapeHtml(response.data.result) + '</span>';
        }

        showNotification("Auto-Fix erfolgreich: " + response.data.result, "success");
    } catch (err) {
        showNotification("Auto-Fix fehlgeschlagen: " + err.message, "error");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "⚡ Auto-Fix ausführen";
        }
    }
}

async function loadAiFixHistory() {
    const historyEl = document.getElementById("ai-fix-history");
    const listEl = document.getElementById("ai-fix-history-list");
    historyEl.style.display = "block";
    listEl.innerHTML = '<div style="text-align:center;padding:1rem;color:#64748b">Lade Historie...</div>';

    try {
        const snapshot = await firebase.firestore().collection("ai_error_analyses")
            .orderBy("analyzedAt", "desc")
            .limit(20)
            .get();

        if (snapshot.empty) {
            listEl.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:1rem">Noch keine KI-Analysen durchgeführt.</p>';
            return;
        }

        listEl.innerHTML = snapshot.docs.map(doc => {
            const d = doc.data();
            const date = d.analyzedAt ? new Date(d.analyzedAt.seconds * 1000).toLocaleString("de-DE") : "?";
            const status = d.status || "pending";
            const statusClass = status === "applied" ? "applied" : status === "dismissed" ? "dismissed" : "pending";
            const statusLabel = status === "applied" ? "✅ Fix angewendet" : status === "dismissed" ? "❌ Verworfen" : "⏳ Ausstehend";
            const errorCount = d.errorCount || 0;
            const analysisCount = (d.analyses || []).length;
            const fixableCount = (d.analyses || []).filter(a => a.autoFixable).length;
            const model = d.model || "?";

            return '<div class="fix-history-entry">' +
                '<div>' +
                '<strong>' + escapeHtml(String(analysisCount)) + ' Fehler analysiert</strong>' +
                '<div class="fix-meta">' + escapeHtml(date) + ' · Modell: ' + escapeHtml(model) + ' · ' + escapeHtml(String(fixableCount)) + ' Auto-Fix möglich</div>' +
                '</div>' +
                '<span class="fix-status ' + statusClass + '">' + statusLabel + '</span>' +
                '</div>';
        }).join("");
    } catch (err) {
        listEl.innerHTML = '<p style="color:#ef4444">Fehler beim Laden: ' + escapeHtml(err.message) + '</p>';
    }
}

// ==================== LEGAL / DATENSCHUTZ ====================

async function loadActiveLegalPolicies() {
    const country = (document.getElementById("legal-policy-country").value || "").trim().toUpperCase();
    const locale = (document.getElementById("legal-policy-locale").value || "").trim();
    const resultEl = document.getElementById("legal-policies-result");

    if (!country || country.length !== 2) {
        resultEl.innerHTML = "<div class='error'>Bitte gültigen 2-Buchstaben-Ländercode eingeben.</div>";
        return;
    }
    if (!locale) {
        resultEl.innerHTML = "<div class='error'>Bitte ein Locale eingeben (z.B. de-DE).</div>";
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Lade Richtlinien...</div>";
    try {
        const result = await functions.httpsCallable("getActiveLegalPolicies")({ country, locale });
        const data = result.data;
        resultEl.innerHTML =
            "<div class='success-box'>" +
            "<h4>AGB (Terms)</h4>" +
            "<p><strong>Version:</strong> " + escapeHtml(data.terms.version) + "</p>" +
            "<p><strong>URL:</strong> <a href='" + escapeHtml(data.terms.contentUrl) + "' target='_blank'>" + escapeHtml(data.terms.contentUrl) + "</a></p>" +
            "<p><strong>Major Change:</strong> " + (data.terms.isMajorChange ? "Ja" : "Nein") + "</p>" +
            "<hr style='border-color:#334155;margin:10px 0'>" +
            "<h4>Datenschutz (Privacy)</h4>" +
            "<p><strong>Version:</strong> " + escapeHtml(data.privacy.version) + "</p>" +
            "<p><strong>URL:</strong> <a href='" + escapeHtml(data.privacy.contentUrl) + "' target='_blank'>" + escapeHtml(data.privacy.contentUrl) + "</a></p>" +
            "<p><strong>Major Change:</strong> " + (data.privacy.isMajorChange ? "Ja" : "Nein") + "</p>" +
            "</div>";
    } catch (error) {
        resultEl.innerHTML = "<div class='error'>Fehler: " + escapeHtml(error.message) + "</div>";
    }
}

async function checkLegalReconsentStatus() {
    const country = (document.getElementById("legal-consent-country").value || "").trim().toUpperCase();
    const locale = (document.getElementById("legal-consent-locale").value || "").trim();
    const resultEl = document.getElementById("legal-consent-result");

    if (!country || country.length !== 2) {
        resultEl.innerHTML = "<div class='error'>Bitte gültigen 2-Buchstaben-Ländercode eingeben.</div>";
        return;
    }
    if (!locale) {
        resultEl.innerHTML = "<div class='error'>Bitte ein Locale eingeben (z.B. de-DE).</div>";
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Prüfe Einwilligungsstatus...</div>";
    try {
        const result = await functions.httpsCallable("needsLegalReconsent")({ country, locale });
        const data = result.data;
        const statusClass = data.requiresReconsent ? "error" : "success-box";
        const statusText = data.requiresReconsent ? "⚠️ Erneute Zustimmung erforderlich" : "✅ Zustimmung aktuell";

        resultEl.innerHTML =
            "<div class='" + statusClass + "'>" +
            "<p><strong>Status:</strong> " + statusText + "</p>" +
            "<p><strong>Grund:</strong> " + escapeHtml(data.reason) + "</p>" +
            "<p><strong>Land/Locale:</strong> " + escapeHtml(data.country) + " / " + escapeHtml(data.locale) + "</p>" +
            "<hr style='border-color:#334155;margin:10px 0'>" +
            "<p><strong>Aktuelle AGB-Version:</strong> " + escapeHtml(data.terms.version) + "</p>" +
            "<p><strong>Akzeptierte AGB-Version:</strong> " + escapeHtml(data.acceptedTermsVersion || "–") + "</p>" +
            "<p><strong>Aktuelle Datenschutz-Version:</strong> " + escapeHtml(data.privacy.version) + "</p>" +
            "<p><strong>Akzeptierte Datenschutz-Version:</strong> " + escapeHtml(data.acceptedPrivacyVersion || "–") + "</p>" +
            "</div>";
    } catch (error) {
        resultEl.innerHTML = "<div class='error'>Fehler: " + escapeHtml(error.message) + "</div>";
    }
}

async function publishLegalPolicy() {
    const policyType = document.getElementById("legal-publish-type").value;
    const country = (document.getElementById("legal-publish-country").value || "").trim().toUpperCase();
    const locale = (document.getElementById("legal-publish-locale").value || "").trim();
    const version = (document.getElementById("legal-publish-version").value || "").trim();
    const contentUrl = (document.getElementById("legal-publish-url").value || "").trim();
    const status = document.getElementById("legal-publish-status").value;
    const isMajorChange = document.getElementById("legal-publish-major").checked;
    const resultEl = document.getElementById("legal-publish-result");

    if (!country || country.length !== 2) {
        resultEl.innerHTML = "<div class='error'>Bitte gültigen 2-Buchstaben-Ländercode eingeben.</div>";
        return;
    }
    if (!locale) {
        resultEl.innerHTML = "<div class='error'>Bitte ein Locale eingeben.</div>";
        return;
    }
    if (!version) {
        resultEl.innerHTML = "<div class='error'>Bitte eine Versionsnummer eingeben.</div>";
        return;
    }
    if (!contentUrl) {
        resultEl.innerHTML = "<div class='error'>Bitte eine Content-URL eingeben.</div>";
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Veröffentliche Richtlinie...</div>";
    try {
        const result = await functions.httpsCallable("publishLegalPolicy")({
            policyType, country, locale, version, contentUrl, status, isMajorChange,
        });
        const data = result.data;
        resultEl.innerHTML =
            "<div class='success-box'>" +
            "<p><strong>✅ Richtlinie veröffentlicht</strong></p>" +
            "<p><strong>Policy-ID:</strong> " + escapeHtml(data.policyId) + "</p>" +
            "<p><strong>Typ:</strong> " + escapeHtml(data.policyType) + "</p>" +
            "<p><strong>Land/Locale:</strong> " + escapeHtml(data.country) + " / " + escapeHtml(data.locale) + "</p>" +
            "<p><strong>Version:</strong> " + escapeHtml(data.version) + "</p>" +
            "<p><strong>Status:</strong> " + escapeHtml(data.status) + "</p>" +
            "<p><strong>Checksum:</strong> <code>" + escapeHtml(data.checksum) + "</code></p>" +
            "</div>";
        showNotification("Richtlinie erfolgreich veröffentlicht.", "success");
    } catch (error) {
        resultEl.innerHTML = "<div class='error'>Fehler: " + escapeHtml(error.message) + "</div>";
        showNotification("Fehler beim Veröffentlichen: " + error.message, "error");
    }
}

async function triggerLegalReconsent() {
    const country = (document.getElementById("legal-reconsent-country").value || "").trim().toUpperCase();
    const locale = (document.getElementById("legal-reconsent-locale").value || "").trim();
    const masterImei = (document.getElementById("legal-reconsent-master").value || "").trim();
    const resultEl = document.getElementById("legal-reconsent-result");

    if (!country || country.length !== 2) {
        resultEl.innerHTML = "<div class='error'>Bitte gültigen 2-Buchstaben-Ländercode eingeben.</div>";
        return;
    }
    if (!locale) {
        resultEl.innerHTML = "<div class='error'>Bitte ein Locale eingeben.</div>";
        return;
    }

    const scope = masterImei ? "Nutzer " + masterImei : "alle Nutzer für " + country + "/" + locale;
    if (!confirm("Reconsent erzwingen für " + scope + "? Dies erfordert eine erneute Zustimmung.")) {
        return;
    }

    resultEl.innerHTML = "<div class='loading'>Erzwinge Reconsent...</div>";
    try {
        const payload = { country, locale };
        if (masterImei) {
            payload.masterImei = masterImei;
        }
        const result = await functions.httpsCallable("markLegalReconsentRequired")(payload);
        const data = result.data;
        resultEl.innerHTML =
            "<div class='success-box'>" +
            "<p><strong>✅ Reconsent erzwungen</strong></p>" +
            "<p><strong>Betroffene Nutzer:</strong> " + escapeHtml(String(data.updatedCount)) + "</p>" +
            "<p><strong>Geltungsbereich:</strong> " + escapeHtml(data.scope) + "</p>" +
            "</div>";
        showNotification("Reconsent für " + data.updatedCount + " Nutzer erzwungen.", "success");
    } catch (error) {
        resultEl.innerHTML = "<div class='error'>Fehler: " + escapeHtml(error.message) + "</div>";
        showNotification("Fehler: " + error.message, "error");
    }
}

const PLAYSTORE_READINESS_KEY = "playStoreReadinessState";

function appendEvidenceLine(existing, note) {
    const value = (existing || "").trim();
    const line = (note || "").trim();
    if (!line) return value;
    if (!value) return line;
    if (value.includes(line)) return value;
    return value + "\n" + line;
}

function autoMarkP0Check(checkKey, evidenceField, note) {
    const state = getP0BlockerCockpitState();
    if (!state.checks[checkKey]) {
        state.checks[checkKey] = true;
    }
    if (evidenceField && Object.prototype.hasOwnProperty.call(state, evidenceField)) {
        state[evidenceField] = appendEvidenceLine(state[evidenceField], note);
    }
    state.updatedAt = new Date().toISOString();
    setP0BlockerCockpitState(state);
    renderP0BlockerCockpit();
}

function autoSyncP0FromExistingSignals() {
    const state = getP0BlockerCockpitState();
    const checks = { ...(state.checks || {}) };
    let changed = false;

    const playStore = getPlayStoreReadinessState();
    const setupState = JSON.parse(localStorage.getItem("operatorSetupChecklist") || "{}");
    const att = getCommissioningAttestations();

    const syncIfTrue = (targetKey, sourceValue) => {
        if (sourceValue && !checks[targetKey]) {
            checks[targetKey] = true;
            changed = true;
        }
    };

    syncIfTrue("playDataSafety", playStore?.checks?.dataSafety);
    syncIfTrue("playIarc", playStore?.checks?.iarc);
    syncIfTrue("playListing", playStore?.checks?.listing);
    syncIfTrue("playPermissions", playStore?.checks?.permissionsDeclaration);
    syncIfTrue("playAppAccess", playStore?.checks?.appAccessGuide);
    syncIfTrue("keyRotationDone", playStore?.checks?.securityRotationDone);
    syncIfTrue("keyRestrictionsDone", playStore?.checks?.securityRotationDone);

    syncIfTrue("commissioningAndroid", setupState["android-apps"] || (att["android-master-registered"] && att["android-child-registered"] && att["device-sync-verified"]));
    syncIfTrue("commissioningAi", setupState["ai-config"]);
    syncIfTrue("commissioningSupport", setupState["support-workflow"] || att["support-flow-verified"]);
    syncIfTrue("commissioningCompliance", setupState["compliance-flow"] || att["compliance-flow-verified"]);

    if (changed) {
        state.checks = checks;
        state.updatedAt = new Date().toISOString();
        setP0BlockerCockpitState(state);
    }

    return getP0BlockerCockpitState();
}

function getP0BlockCompletion(state) {
    const checks = state.checks || {};
    const blocks = {
        security: Boolean(checks.keyRotationDone && checks.keyRestrictionsDone),
        playConsole: Boolean(checks.playDataSafety && checks.playIarc && checks.playListing && checks.playPermissions && checks.playAppAccess),
        commissioning: Boolean(checks.commissioningAndroid && checks.commissioningAi && checks.commissioningSupport && checks.commissioningCompliance),
        roster: Boolean(checks.rosterAssigned),
    };
    const completedBlocks = Object.values(blocks).filter(Boolean).length;
    return {
        blocks,
        completedBlocks,
        totalBlocks: 4,
        allDone: completedBlocks === 4,
    };
}

function getP0BlockerCockpitState() {
    const defaults = {
        checks: {
            keyRotationDone: false,
            keyRestrictionsDone: false,
            playDataSafety: false,
            playIarc: false,
            playListing: false,
            playPermissions: false,
            playAppAccess: false,
            commissioningAndroid: false,
            commissioningAi: false,
            commissioningSupport: false,
            commissioningCompliance: false,
            rosterAssigned: false,
        },
        keyEvidence: "",
        playEvidence: "",
        commissioningEvidence: "",
        rosterPrimary: "",
        rosterSecondary: "",
        rosterSecurity: "",
        rosterEvidence: "",
        notes: "",
        updatedAt: null,
    };

    try {
        const raw = localStorage.getItem(P0_BLOCKER_COCKPIT_STORAGE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
            checks: { ...defaults.checks, ...(parsed.checks || {}) },
            keyEvidence: parsed.keyEvidence || "",
            playEvidence: parsed.playEvidence || "",
            commissioningEvidence: parsed.commissioningEvidence || "",
            rosterPrimary: parsed.rosterPrimary || "",
            rosterSecondary: parsed.rosterSecondary || "",
            rosterSecurity: parsed.rosterSecurity || "",
            rosterEvidence: parsed.rosterEvidence || "",
            notes: parsed.notes || "",
            updatedAt: parsed.updatedAt || null,
        };
    } catch (_) {
        return defaults;
    }
}

function setP0BlockerCockpitState(state) {
    localStorage.setItem(P0_BLOCKER_COCKPIT_STORAGE_KEY, JSON.stringify(state));
}

function renderP0BlockerCockpit() {
    const state = autoSyncP0FromExistingSignals();

    const checkboxMap = {
        "p0-key-rotation-done": "keyRotationDone",
        "p0-key-restrictions-done": "keyRestrictionsDone",
        "p0-play-data-safety": "playDataSafety",
        "p0-play-iarc": "playIarc",
        "p0-play-listing": "playListing",
        "p0-play-permissions": "playPermissions",
        "p0-play-app-access": "playAppAccess",
        "p0-commissioning-android": "commissioningAndroid",
        "p0-commissioning-ai": "commissioningAi",
        "p0-commissioning-support": "commissioningSupport",
        "p0-commissioning-compliance": "commissioningCompliance",
        "p0-roster-assigned": "rosterAssigned",
    };

    Object.entries(checkboxMap).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(state.checks[key]);
    });

    const valueMap = {
        "p0-key-evidence": state.keyEvidence,
        "p0-play-evidence": state.playEvidence,
        "p0-commissioning-evidence": state.commissioningEvidence,
        "p0-roster-primary": state.rosterPrimary,
        "p0-roster-secondary": state.rosterSecondary,
        "p0-roster-security": state.rosterSecurity,
        "p0-roster-evidence": state.rosterEvidence,
        "p0-notes": state.notes,
    };

    Object.entries(valueMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });

    const total = Object.keys(state.checks).length;
    const done = Object.values(state.checks).filter(Boolean).length;
    const donePercent = total > 0 ? Math.round((done / total) * 100) : 0;
    const isReady = done === total;
    const blockStatus = getP0BlockCompletion(state);
    const summaryEl = document.getElementById("p0-blocker-summary");
    if (summaryEl) {
        const ts = state.updatedAt ? new Date(state.updatedAt).toLocaleString("de-DE") : "noch nie";
        summaryEl.innerHTML =
            "<div class='" + (blockStatus.allDone ? "success-box" : "error") + "'>" +
            "<p><strong>P0 Status:</strong> " + (blockStatus.allDone ? "✅ Alle P0-Blocker abgeschlossen" : "⚠️ P0-Blocker offen") + "</p>" +
            "<p><strong>Erledigt:</strong> " + done + "/" + total + " (" + donePercent + "%)</p>" +
            "<p><strong>Block-Abschluss:</strong> " + blockStatus.completedBlocks + "/" + blockStatus.totalBlocks + " (Security " + (blockStatus.blocks.security ? "✅" : "⚠️") + ", Play " + (blockStatus.blocks.playConsole ? "✅" : "⚠️") + ", Commissioning " + (blockStatus.blocks.commissioning ? "✅" : "⚠️") + ", Roster " + (blockStatus.blocks.roster ? "✅" : "⚠️") + ")</p>" +
            "<p><strong>Aktualisiert:</strong> " + escapeHtml(ts) + "</p>" +
            "</div>";
    }
}

function collectP0BlockerCockpitFromUi() {
    return {
        checks: {
            keyRotationDone: Boolean(document.getElementById("p0-key-rotation-done")?.checked),
            keyRestrictionsDone: Boolean(document.getElementById("p0-key-restrictions-done")?.checked),
            playDataSafety: Boolean(document.getElementById("p0-play-data-safety")?.checked),
            playIarc: Boolean(document.getElementById("p0-play-iarc")?.checked),
            playListing: Boolean(document.getElementById("p0-play-listing")?.checked),
            playPermissions: Boolean(document.getElementById("p0-play-permissions")?.checked),
            playAppAccess: Boolean(document.getElementById("p0-play-app-access")?.checked),
            commissioningAndroid: Boolean(document.getElementById("p0-commissioning-android")?.checked),
            commissioningAi: Boolean(document.getElementById("p0-commissioning-ai")?.checked),
            commissioningSupport: Boolean(document.getElementById("p0-commissioning-support")?.checked),
            commissioningCompliance: Boolean(document.getElementById("p0-commissioning-compliance")?.checked),
            rosterAssigned: Boolean(document.getElementById("p0-roster-assigned")?.checked),
        },
        keyEvidence: (document.getElementById("p0-key-evidence")?.value || "").trim(),
        playEvidence: (document.getElementById("p0-play-evidence")?.value || "").trim(),
        commissioningEvidence: (document.getElementById("p0-commissioning-evidence")?.value || "").trim(),
        rosterPrimary: (document.getElementById("p0-roster-primary")?.value || "").trim(),
        rosterSecondary: (document.getElementById("p0-roster-secondary")?.value || "").trim(),
        rosterSecurity: (document.getElementById("p0-roster-security")?.value || "").trim(),
        rosterEvidence: (document.getElementById("p0-roster-evidence")?.value || "").trim(),
        notes: (document.getElementById("p0-notes")?.value || "").trim(),
        updatedAt: new Date().toISOString(),
    };
}

function saveP0BlockerCockpit() {
    const state = collectP0BlockerCockpitFromUi();
    setP0BlockerCockpitState(state);
    renderP0BlockerCockpit();

    const resultEl = document.getElementById("p0-blocker-result");
    if (resultEl) {
        resultEl.innerHTML = "<div class='success-box'>P0-Cockpit gespeichert.</div>";
    }
    showNotification("P0-Cockpit gespeichert.", "success");
}

function exportP0BlockerCockpit() {
    const state = collectP0BlockerCockpitFromUi();
    setP0BlockerCockpitState(state);
    renderP0BlockerCockpit();

    const payload = {
        exportedAt: new Date().toISOString(),
        tool: "MiniMaster Admin Panel",
        type: "p0-blocker-cockpit",
        ...state,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeDate = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "p0-blocker-cockpit-" + safeDate + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const resultEl = document.getElementById("p0-blocker-result");
    if (resultEl) {
        resultEl.innerHTML = "<div class='success-box'>P0-Status exportiert.</div>";
    }
}

function resetP0BlockerCockpit() {
    if (!confirm("P0-Cockpit wirklich zurücksetzen?")) return;
    localStorage.removeItem(P0_BLOCKER_COCKPIT_STORAGE_KEY);
    renderP0BlockerCockpit();

    const resultEl = document.getElementById("p0-blocker-result");
    if (resultEl) {
        resultEl.innerHTML = "<div class='success-box'>P0-Cockpit wurde zurückgesetzt.</div>";
    }
}

function getPlayStoreReadinessState() {
    const defaults = {
        checks: {
            dataSafety: false,
            iarc: false,
            listing: false,
            privacyUrlLinked: false,
            permissionsDeclaration: false,
            appAccessGuide: false,
            securityRotationDone: false,
            goNoGoSignedOff: false,
        },
        privacyUrl: "",
        supportEmail: "",
        listingUrl: "",
        releaseNotes: "",
        updatedAt: null,
    };

    try {
        const raw = localStorage.getItem(PLAYSTORE_READINESS_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        return {
            checks: { ...defaults.checks, ...(parsed.checks || {}) },
            privacyUrl: parsed.privacyUrl || "",
            supportEmail: parsed.supportEmail || "",
            listingUrl: parsed.listingUrl || "",
            releaseNotes: parsed.releaseNotes || "",
            updatedAt: parsed.updatedAt || null,
        };
    } catch (_) {
        return defaults;
    }
}

function setPlayStoreReadinessState(state) {
    localStorage.setItem(PLAYSTORE_READINESS_KEY, JSON.stringify(state));
}

function renderPlayStoreReadiness() {
    const state = getPlayStoreReadinessState();

    const checkboxes = {
        "ps-check-data-safety": "dataSafety",
        "ps-check-iarc": "iarc",
        "ps-check-listing": "listing",
        "ps-check-privacy-url": "privacyUrlLinked",
        "ps-check-permissions": "permissionsDeclaration",
        "ps-check-app-access": "appAccessGuide",
        "ps-check-security": "securityRotationDone",
        "ps-check-signoff": "goNoGoSignedOff",
    };

    Object.entries(checkboxes).forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(state.checks[key]);
    });

    const privacyUrlEl = document.getElementById("ps-privacy-url");
    const supportEmailEl = document.getElementById("ps-support-email");
    const listingUrlEl = document.getElementById("ps-listing-url");
    const releaseNotesEl = document.getElementById("ps-release-notes");
    if (privacyUrlEl) privacyUrlEl.value = state.privacyUrl;
    if (supportEmailEl) supportEmailEl.value = state.supportEmail;
    if (listingUrlEl) listingUrlEl.value = state.listingUrl;
    if (releaseNotesEl) releaseNotesEl.value = state.releaseNotes;

    const total = Object.keys(state.checks).length;
    const completed = Object.values(state.checks).filter(Boolean).length;
    const ready = completed === total && Boolean(state.privacyUrl) && Boolean(state.supportEmail);
    const summaryEl = document.getElementById("playstore-readiness-summary");
    if (summaryEl) {
        const ts = state.updatedAt ? new Date(state.updatedAt).toLocaleString("de-DE") : "noch nie";
        summaryEl.innerHTML =
            "<div class='" + (ready ? "success-box" : "error") + "'>" +
            "<p><strong>Status:</strong> " + (ready ? "✅ Veröffentlichungsbereit" : "⚠️ Noch nicht veröffentlichungsbereit") + "</p>" +
            "<p><strong>Checkliste:</strong> " + completed + "/" + total + " erfüllt</p>" +
            "<p><strong>Letzte Aktualisierung:</strong> " + escapeHtml(ts) + "</p>" +
            "</div>";
    }
}

function collectPlayStoreReadinessFromUi() {
    return {
        checks: {
            dataSafety: Boolean(document.getElementById("ps-check-data-safety")?.checked),
            iarc: Boolean(document.getElementById("ps-check-iarc")?.checked),
            listing: Boolean(document.getElementById("ps-check-listing")?.checked),
            privacyUrlLinked: Boolean(document.getElementById("ps-check-privacy-url")?.checked),
            permissionsDeclaration: Boolean(document.getElementById("ps-check-permissions")?.checked),
            appAccessGuide: Boolean(document.getElementById("ps-check-app-access")?.checked),
            securityRotationDone: Boolean(document.getElementById("ps-check-security")?.checked),
            goNoGoSignedOff: Boolean(document.getElementById("ps-check-signoff")?.checked),
        },
        privacyUrl: (document.getElementById("ps-privacy-url")?.value || "").trim(),
        supportEmail: (document.getElementById("ps-support-email")?.value || "").trim(),
        listingUrl: (document.getElementById("ps-listing-url")?.value || "").trim(),
        releaseNotes: (document.getElementById("ps-release-notes")?.value || "").trim(),
        updatedAt: new Date().toISOString(),
    };
}

function savePlayStoreReadiness() {
    const resultEl = document.getElementById("playstore-readiness-result");
    const state = collectPlayStoreReadinessFromUi();

    if (!state.privacyUrl || !/^https:\/\//i.test(state.privacyUrl)) {
        if (resultEl) resultEl.innerHTML = "<div class='error'>Bitte eine gültige Privacy-Policy-URL mit https:// eintragen.</div>";
        return;
    }
    if (!state.supportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.supportEmail)) {
        if (resultEl) resultEl.innerHTML = "<div class='error'>Bitte eine gültige Support-/Privacy-E-Mail eintragen.</div>";
        return;
    }

    setPlayStoreReadinessState(state);
    renderPlayStoreReadiness();
    autoSyncP0FromExistingSignals();
    renderP0BlockerCockpit();
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
    if (resultEl) resultEl.innerHTML = "<div class='success-box'>Play-Store-Readiness gespeichert.</div>";
    showNotification("Play-Store-Readiness gespeichert.", "success");
}

function resetPlayStoreReadiness() {
    if (!confirm("Readiness-Daten wirklich zurücksetzen?")) return;
    localStorage.removeItem(PLAYSTORE_READINESS_KEY);
    renderPlayStoreReadiness();
    renderGoLiveAmpel();
    renderPrioritizedActionPlan();
    const resultEl = document.getElementById("playstore-readiness-result");
    if (resultEl) resultEl.innerHTML = "<div class='success-box'>Readiness-Daten wurden zurückgesetzt.</div>";
}

function exportPlayStoreReadiness() {
    const state = getPlayStoreReadinessState();
    const payload = {
        exportedAt: new Date().toISOString(),
        tool: "MiniMaster Admin Panel",
        type: "play-store-readiness",
        ...state,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeDate = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "playstore-readiness-" + safeDate + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const resultEl = document.getElementById("playstore-readiness-result");
    if (resultEl) resultEl.innerHTML = "<div class='success-box'>Readiness-Export erstellt.</div>";
}

// --- Reviewer-Anleitung (App Access Guide) ---

function generateReviewerGuide() {
    const state = getPlayStoreReadinessState();
    const privacyUrl = state.privacyUrl || "(nicht eingetragen)";
    const supportEmail = state.supportEmail || "(nicht eingetragen)";
    const listingUrl = state.listingUrl || "(nicht eingetragen)";
    const releaseNotes = state.releaseNotes || "(keine Hinweise)";
    const date = new Date().toLocaleDateString("de-DE");

    const guide =
`APP-ACCESS-ANLEITUNG FÜR PLAY-STORE-REVIEWER
Stand: ${date}

=== App-Name ===
MiniMaster – Kindersicherung & Elternkontrolle

=== App-Typ ===
Eltern-Kontrollsuite: Kindersicherung via Android Accessibility Service,
App-Blockierung und Nutzungsregeln für Familien.

=== Privacy Policy ===
${privacyUrl}

=== Support- & Datenschutz-E-Mail ===
${supportEmail}

=== Play-Console-Listing ===
${listingUrl}

=== Zugangsdaten für den Reviewer ===
Die App erfordert zwei Android-Geräte:
  1. Eltern-Gerät (MasterApp): Steuerung und Aufgabenverwaltung
  2. Kind-Gerät (ChildApp): Empfängt Regeln, zeigt Blockierung

Für den Review ohne zweites Gerät genügt die MasterApp allein
(Familienmanagement und Kopplung testbar ohne aktive ChildApp).

Test-Konto:
  -- Kein festes Test-Konto erforderlich: Registrierung erfolgt per
     IMEI-Sequenz und 6-stelligem Kopplungscode. --

=== Geforderte Berechtigungen (Begründung) ===
• PACKAGE_USAGE_STATS   – Nutzungszeit-Monitoring für die Kindersicherung
• SYSTEM_ALERT_WINDOW   – Overlay-Sperre wenn Kind ein gesperrtes App öffnet
• Barrierefreiheitsdienst – Erkennung geöffneter Apps für Blocking-Logik
• FOREGROUND_SERVICE    – Dauerbetrieb der Überwachungs-Services

=== Release-Notizen / Hinweise ===
${releaseNotes}

=== Kontakt bei Rückfragen ===
${supportEmail}`;

    window._lastReviewerGuide = guide;

    const outputEl = document.getElementById("ps-reviewer-guide-output");
    if (!outputEl) return;

    const safeGuide = guide.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    outputEl.innerHTML =
        "<h4 style='margin-block-end:8px'>Reviewer-Anleitung (App Access Guide)</h4>" +
        "<pre style='white-space:pre-wrap;background:#f8f8f8;padding:12px;border:1px solid #ccc;font-size:12px;overflow:auto;max-block-size:400px'>" + safeGuide + "</pre>" +
        "<div class='dsar-form' style='margin-block-start:8px'>" +
        "<button onclick='copyReviewerGuide()' class='btn btn-secondary'>📋 Kopieren</button> " +
        "<button onclick='downloadReviewerGuide()' class='btn btn-secondary'>⬇ Herunterladen (.txt)</button>" +
        "</div>";
}

function copyReviewerGuide() {
    if (!window._lastReviewerGuide) {
        showNotification("Bitte zuerst die Anleitung generieren.", "warning");
        return;
    }
    navigator.clipboard.writeText(window._lastReviewerGuide).then(() => {
        showNotification("Reviewer-Anleitung in die Zwischenablage kopiert.", "success");
    }).catch(() => {
        showNotification("Kopieren fehlgeschlagen – bitte manuell kopieren.", "warning");
    });
}

function downloadReviewerGuide() {
    if (!window._lastReviewerGuide) {
        showNotification("Bitte zuerst die Anleitung generieren.", "warning");
        return;
    }
    const blob = new Blob([window._lastReviewerGuide], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeDate = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "reviewer-guide-minimaster-" + safeDate + ".txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Kombinierter Release-Artefakt-Export ---

function exportReleaseArtefact() {
    const playStoreState = getPlayStoreReadinessState();
    const p0BlockerState = getP0BlockerCockpitState();
    const platformState = getPlatformReadiness();
    const attestations = getCommissioningAttestations();
    const status = computeGoLiveStatus();

    const payload = {
        exportedAt: new Date().toISOString(),
        tool: "MiniMaster Admin Panel",
        version: "1.0",
        type: "release-artefact",
        goLiveStatus: {
            ampel: status.ampel,
            ampelLabel: status.ampelLabel,
            ampelDescription: status.ampelDescription,
            backendReady: status.backendReady,
            allAttestationsOk: status.allAttestationsOk,
            playStoreReady: status.playStoreReady,
            totals: status.totals,
        },
        commissioningSummary: commissioningSummary || null,
        p0BlockerCockpit: p0BlockerState,
        playStoreReadiness: playStoreState,
        platformChecksSummary: status.platformStatus,
        platformChecksDetail: platformState,
        attestations,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeDate = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "minimaster-release-artefact-" + safeDate + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showNotification("Release-Artefakt (kombinierter Nachweis) exportiert.", "success");
}

// --- Finale Go-Live-Bestätigung ---

function confirmFinalGoLive() {
    if (!confirm("Möchten Sie das finale Go-Live wirklich bestätigen?\nDieser Schritt sollte nur bei vollständig grüner Ampel ausgeführt werden.")) return;
    const payload = {
        confirmedAt: new Date().toISOString(),
        confirmedBy: "Operator (Admin Panel)",
        ampel: "green",
    };
    localStorage.setItem("finalGoLiveConfirmation", JSON.stringify(payload));
    showNotification("Go-Live bestätigt und protokolliert. Deployment-Checkliste abarbeiten.", "success");
    const gateContainer = document.getElementById("golive-final-gate");
    if (gateContainer) {
        const ts = new Date().toLocaleString("de-DE");
        gateContainer.innerHTML =
            "<div class='success-box'><p>✅ <strong>Go-Live bestätigt</strong> am " + escapeHtml(ts) + "</p></div>";
    }
}
