import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

type StorageMap = Record<string, string>;

export type AdminPanelHarness = {
  exports: any;
  storage: Map<string, string>;
  elements: Map<string, any>;
  context: any;
  fetchMock: jest.Mock;
};

export function loadAdminPanelTestExports(initialStorage: StorageMap = {}): AdminPanelHarness {
  const scriptPath = path.join(__dirname, "..", "..", "admin-panel", "app.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, any>();

  const escapeForHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const createMockElement = (tag: string) => {
    let innerHTML = "";
    let textContent = "";
    const classes = new Set<string>();
    const listeners = new Map<string, Array<(event?: any) => void>>();

    return {
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      value: "",
      checked: false,
      disabled: false,
      appendChild: jest.fn(),
      prepend: jest.fn(),
      remove: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      querySelector: jest.fn(() => ({
        addEventListener: jest.fn(),
      })),
      addEventListener: jest.fn((eventName: string, handler: (event?: any) => void) => {
        const eventHandlers = listeners.get(eventName) || [];
        eventHandlers.push(handler);
        listeners.set(eventName, eventHandlers);
      }),
      dispatchEvent: jest.fn((event: { type?: string } = {}) => {
        const eventName = String(event?.type || "");
        const eventHandlers = listeners.get(eventName) || [];
        eventHandlers.forEach(handler => handler(event));
        return true;
      }),
      classList: {
        add: jest.fn((value: string) => { classes.add(value); }),
        remove: jest.fn((value: string) => { classes.delete(value); }),
        toggle: jest.fn((value: string, force?: boolean) => {
          if (force === undefined) {
            if (classes.has(value)) classes.delete(value);
            else classes.add(value);
          } else if (force) {
            classes.add(value);
          } else {
            classes.delete(value);
          }
        }),
        contains: jest.fn((value: string) => classes.has(value)),
      },
      setAttribute: jest.fn(),
      removeAttribute: jest.fn(),
      select: jest.fn(),
      click: jest.fn(function(this: any) {
        this.dispatchEvent({ type: "click" });
      }),
      get innerHTML() {
        return innerHTML;
      },
      set innerHTML(value: string) {
        innerHTML = value;
      },
      get textContent() {
        return textContent;
      },
      set textContent(value: string) {
        textContent = value;
        innerHTML = escapeForHtml(String(value ?? ""));
      },
    };
  };

  const documentMock: any = {
    addEventListener: jest.fn(),
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    createElement: jest.fn((tag: string) => createMockElement(tag)),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    execCommand: jest.fn(),
  };

  const context: any = {
    console,
    setTimeout: jest.fn(() => 0),
    clearTimeout: jest.fn(),
    setInterval: jest.fn(() => 0),
    clearInterval: jest.fn(),
    fetch: jest.fn(),
    Blob: function Blob(parts: any[], options: any) { return { parts, options }; },
    URL: {
      createObjectURL: jest.fn(() => "blob:test"),
      revokeObjectURL: jest.fn(),
    },
    localStorage: {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => { storage.set(key, value); }),
      removeItem: jest.fn((key: string) => { storage.delete(key); }),
    },
    navigator: { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } },
    window: {},
    document: documentMock,
    confirm: jest.fn(() => true),
    alert: jest.fn(),
    firebase: {},
    auth: null,
    btoa: (str: string) => Buffer.from(str, "binary").toString("base64"),
  };
  context.window = context;
  context.globalThis = context;

  const exportTrailer = [
    "",
    ";globalThis.__adminPanelTestExports = {",
    "  sanitizeAdbSerial,",
    "  sanitizeApkPath,",
    "  buildPowerShellScript,",
    "  buildDeployCommand,",
    "  collectCommissioningAutomationContext,",
    "  buildValidationSummaryFromResults,",
    "  buildCommissioningSnapshot,",
    "  buildCurrentCommissioningSummary,",
    "  renderCommissioningReport,",
    "  getCommissioningQaApprovalItems,",
    "  filterVisibleCommissioningPendingItems,",
    "  getMissingAttestations,",
    "  updateCommissioningAttestations,",
    "  escapePowerShellString,",
    "  encodeCommandPayload,",
    "  decodeCommandPayload,",
    "  hasCompleteFirebaseConfig,",
    "  isPlaceholderFirebaseConfig,",
    "  normalizeBootstrapFirebaseConfig,",
    "  extractFirebaseConfigFromText,",
    "  extractFirebaseConfigFromGoogleServices,",
    "  isPlaceholderProjectId,",
    "  formatPythonAutomationStatus,",
    "  getPythonAutomationStatusMeta,",
    "  formatPythonAutomationType,",
    "  getPythonAutomationTypeChipClass,",
    "  getPriorityWeight,",
    "  buildKeyFingerprint,",
    "  toBase64Url,",
    "  normalizeCallableErrorCode,",
    "  normalizeAuthErrorCode,",
    "  getAccessKeyErrorHint,",
    "  getAuthErrorHint,",
    "  formatAuthDebugCode,",
    "  safeDebugStringify,",
    "  escapeHtmlText,",
    "  encodeInlineArgument,",
    "  decodeInlineArgument,",
    "  toDateSafe,",
    "  formatPythonAutomationTimestamp,",
    "  formatPythonAutomationEvidenceDetails,",
    "  getPythonEvidenceRequirements,",
    "  buildPythonEvidenceValidationErrors,",
    "  renderPythonAutomationProtocolRequirements,",
    "  renderPythonAutomationProtocolEditor,",
    "  renderPythonAutomationEvidenceHistory,",
    "  applyPythonEvidenceFilter,",
    "  resetPythonEvidenceFilter,",
    "  loadPythonAutomationEvidenceHistory,",
    "  renderQaRuntimeModeBanner,",
    "  applyQaRuntimeInteractionState,",
    "  renderQaRefreshStatus,",
    "  getQaDashboardSectionLoaders,",
    "  renderQaArtifactsOverview,",
    "  getFilteredDualDeviceRuns,",
    "  applyQaArtifactFilters,",
    "  buildQaArtifactExportPayload,",
    "  exportSelectedQaArtifact,",
    "  loadQaDashboardData,",
    "  buildPythonAutomationRunIndex,",
    "  buildPythonAutomationRunClipboardPayload,",
    "  buildFirebaseRecoveryCommands,",
    "  buildFirebaseRecoveryScript,",
    "  isRetryableFirebaseQueueConflict,",
    "  buildPlausibilityFindings,",
    "  computeGoLiveStatusFromData,",
    "  buildPlatformQaReadinessSummary,",
    "  renderCallableDebugInfo,",
    "  getWizardState,",
    "  saveWizardState,",
    "  buildEffectivePlatformState,",
    "  getPlayStoreReadinessState,",
    "  setPlayStoreReadinessState,",
    "  getCommissioningAttestations,",
    "  buildPythonEvidenceFilterToolbar,",
    "  platformReadinessItems,",
    "  buildCommandCatalog,",
    "  buildRolloutBundleScript,",
    "  buildPrioritizedActionPlanFromData,",
    "  getPrioritizedActionLinkedTestIds,",
    "  buildPrioritizedActionTestInsights,",
    "  getP0BlockCompletion,",
    "  getP0BlockerCockpitState,",
    "  setP0BlockerCockpitState,",
    "  autoSyncP0FromExistingSignals,",
    "  loadCommandBuilderConfig,",
    "  getPythonAutomationTestStatus,",
    "  getLatestPythonAutomationEvidence,",
    "  findPythonAutomationTestById,",
    "  setPythonAutomationEvidenceCache,",
    "  isOpenTestingRegisterStatus,",
    "  isPlayStoreTestingRegisterItem,",
    "  buildOperatorConfigGuidance,",
    "  buildPythonAutomationRunActionSummary,",
    "  getTestingRegisterStatusPriority,",
    "  getTestingRegisterSeverityPriority,",
    "  setSetupValidationResultsForTests: (results) => { setupValidationResults = results; },",
    "  setCommissioningSummaryForTests: (summary) => { commissioningSummary = summary; },",
    "  formatTestingRegisterGroupTitle,",
    "  buildTestingRegisterTooltipAttr,",
    "  buildTestingRegisterMetaBadges,",
    "  buildTestingRegisterLegend,",
    "  buildTestingRegisterActionTooltip,",
    "  getTestingRegisterActionLabel,",
    "  buildTestingRegisterExecutionPath,",
    "  buildTestingRegisterDetailText,",
    "  buildTestingRegisterDuplicateInsights,",
    "  buildTestingRegisterManualInsights,",
    "  getTestingRegisterFilters,",
    "  applyTestingRegisterQuickFilter,",
    "  renderTestingRegisterList,",
    "  renderTestingRegisterOverview,",
    "  buildQaExecutionGuideData,",
    "  getUsbFormVisibilityState,",
    "  buildUsbTestRunRequestPayload,",
    "  updateUsbTestTypeFormState,",
    "  loadSuiteRunHistory,",
    "  setPythonOperatorRuntimeForTests: (value) => { isPythonOperator = Boolean(value); },",
    "  setPythonCommissioningCatalogForTests: (value) => { pythonCommissioningCatalog = value; },",
    "  setTestingRegisterPayloadForTests: (value) => { testingRegisterPayload = value; },",
    "  setPythonAutomationSelectedTestIdForTests: (value) => { pythonCommissioningSelectedTestId = value; },",
    "  setSuiteRunHistoryPayloadForTests: (value) => { suiteRunHistoryPayload = Array.isArray(value) ? value : []; },",
    "  setPythonCommissioningEvidenceHistoryForTests: (value) => { pythonCommissioningEvidenceHistory = Array.isArray(value) ? value : []; },",
    "  setQaPlatformCatalogPayloadForTests: (value) => { qaPlatformCatalogPayload = value; },",
    "  setQaArtifactFiltersForTests: ({ scenarioFilter = '', selectedRunId = '' } = {}) => { qaArtifactScenarioFilter = scenarioFilter; qaArtifactSelectedRunId = selectedRunId; },",
    "  setPythonEvidenceFiltersForTests: ({ status = '', testId = '' } = {}) => { pythonEvidenceFilterStatus = status; pythonEvidenceFilterTestId = testId; },",
    "  resetQaRefreshStateForTests: () => { qaRefreshState = { sections: {}, lastStartedAt: '', lastCompletedAt: '', lastReason: '', lastSummary: '' }; qaDashboardLoadPromise = null; },",
    "  commissioningAttestationItems,",
    "  defaultCommandBuilderConfig,",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "admin-panel/app.js" });

  return {
    exports: context.__adminPanelTestExports,
    storage,
    elements,
    context,
    fetchMock: context.fetch,
  };
}
