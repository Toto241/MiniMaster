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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const createMockElement = (tag: string) => {
    let innerHTML = "";
    let textContent = "";
    const classes = new Set<string>();
    const listeners = new Map<string, Array<(event?: any) => void>>();
    const children: any[] = [];

    const renderText = (node: any): string => {
      if (node == null) return "";
      if (typeof node === "string") return node;
      if (typeof node.textContent === "string" && (!Array.isArray(node.children) || node.children.length === 0)) {
        return node.textContent;
      }
      if (Array.isArray(node.children)) {
        return node.children.map(renderText).join("");
      }
      return "";
    };

    const renderNode = (node: any): string => {
      if (node == null) return "";
      if (typeof node === "string") return escapeForHtml(node);
      const tagName = String(node.tagName || "div").toLowerCase();
      const className = String(node.className || "").trim();
      const childHtml = typeof node.innerHTML === "string" && node.innerHTML.length > 0
        ? node.innerHTML
        : Array.isArray(node.children) && node.children.length > 0
          ? node.children.map(renderNode).join("")
          : escapeForHtml(String(node.textContent || ""));
      return `<${tagName}${className ? ` class="${escapeForHtml(className)}"` : ""}>${childHtml}</${tagName}>`;
    };

    const syncFromChildren = () => {
      innerHTML = children.map(renderNode).join("");
      textContent = children.map(renderText).join("");
    };

    return {
      tagName: tag.toUpperCase(),
      className: "",
      style: {},
      dataset: {},
      value: "",
      checked: false,
      disabled: false,
      get children() {
        return children;
      },
      appendChild: jest.fn((child: any) => {
        children.push(child);
        syncFromChildren();
        return child;
      }),
      prepend: jest.fn((child: any) => {
        children.unshift(child);
        syncFromChildren();
        return child;
      }),
      replaceChildren: jest.fn((...nextChildren: any[]) => {
        children.splice(0, children.length, ...nextChildren);
        syncFromChildren();
      }),
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
        children.splice(0, children.length);
      },
      get textContent() {
        return textContent;
      },
      set textContent(value: string) {
        textContent = String(value ?? "");
        innerHTML = escapeForHtml(textContent);
        children.splice(0, children.length);
      },
    };
  };

  const documentMock: any = {
    addEventListener: jest.fn(),
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    createElement: jest.fn((tag: string) => createMockElement(tag)),
    createTextNode: jest.fn((text: string) => ({ nodeType: 3, textContent: String(text ?? "") })),
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
    "  buildOwnerSetupCommand,",
    "  normalizeOwnerSetupMode,",
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
    "  renderPythonAutomationOverview,",
    "  renderPythonAutomationCatalog,",
    "  loadPythonAutomationCatalog,",
    "  renderPythonAutomationResult,",
    "  renderPythonAutomationHistory,",
    "  renderPythonAutomationEvidenceHistory,",
    "  loadPythonAutomationHistory,",
    "  loadPythonAutomationEvidenceHistory,",
    "  applyPythonEvidenceFilter,",
    "  resetPythonEvidenceFilter,",
    "  renderQaRuntimeModeBanner,",
    "  applyQaRuntimeInteractionState,",
    "  updatePythonAutomationRunState,",
    "  initializeAuthBindings,",
    "  initializeAuthStateObserver,",
    "  handleLogin,",
    "  showAuthMode,",
    "  renderQaRefreshStatus,",
    "  getQaDashboardSectionLoaders,",
    "  renderQaTestWorkspace,",
    "  selectQaTestWorkspaceItem,",
    "  getSelectedQaTestWorkspaceItem,",
    "  buildSelectedQaTestItemClipboardPayload,",
    "  copySelectedQaTestItem,",
    "  copySelectedQaTestItemCompact,",
    "  copySelectedQaTestItemDebug,",
    "  loadQaDashboardData,",
    "  buildPythonAutomationRunIndex,",
    "  buildPythonAutomationRunClipboardPayload,",
    "  buildFirebaseRecoveryCommands,",
    "  buildFirebaseRecoveryScript,",
    "  isRetryableFirebaseQueueConflict,",
    "  showBootstrapImportPreview,",
    "  cancelBootstrapImportPreview,",
    "  confirmBootstrapImportPreview,",
    "  loadBootstrapFirebaseConfigFromUrl,",
    "  loadBootstrapFirebaseConfigFromFile,",
    "  renderBootstrapFirebaseConfig,",
    "  persistBootstrapFirebaseConfig,",
    "  copyFirebaseRecoveryScript,",
    "  buildPlausibilityFindings,",
    "  computeGoLiveStatusFromData,",
    "  buildPlatformQaReadinessSummary,",
    "  renderCallableDebugInfo,",
    "  getWizardState,",
    "  saveWizardState,",
    "  buildEffectivePlatformState,",
    "  getPlayStoreReadinessState,",
    "  setPlayStoreReadinessState,",
    "  validatePlayStoreReadinessState,",
    "  computePlayStoreReadinessSummary,",
    "  buildPlayStoreComplianceProtocol,",
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
    "  renderTestingRegisterStorage,",
    "  renderQaExecutionGuide,",
    "  buildQaExecutionGuideData,",
    "  buildAdvisorySweepReadiness,",
    "  getAndroidCompatibilityPreflightState,",
    "  ensureAndroidCompatibilityPreflightLoaded,",
    "  requestAndroidCompatibilityApproval,",
    "  getAndroidAutomationSweepPreflightState,",
    "  ensureAndroidAutomationSweepPreflightLoaded,",
    "  requestAndroidAutomationSweepApproval,",
    "  buildAndroidCompatibilityRequest,",
    "  buildAndroidAutomationSweepRequest,",
    "  buildSuiteRunRequest,",
    "  formatSuiteHistoryMeta,",
    "  startAndroidCompatibilityRun,",
    "  startAndroidAutomationSweep,",
    "  startSuiteRun,",
    "  openPythonAutomationProtocol,",
    "  scrollQaSection,",
    "  loadSuiteGuideData,",
    "  loadSuiteRunHistory,",
    "  loadTestingRegister,",
    "  buildQaTestWorkspaceRunItems,",
    "  buildQaTestWorkspaceFailureItems,",
    "  buildQaTestWorkspaceMetrics,",
    "  getQaTestWorkspaceActionState,",
    "  setPythonOperatorRuntimeForTests: (value) => { isPythonOperator = Boolean(value); },",
    "  setAuthForTests: (value) => { auth = value; authBindingsInitialized = false; authStateObserverInitialized = false; },",
    "  setPythonCommissioningCatalogForTests: (value) => { pythonCommissioningCatalog = value; },",
    "  setTestingRegisterPayloadForTests: (value) => { testingRegisterPayload = value; },",
    "  setPythonAutomationSelectedTestIdForTests: (value) => { pythonCommissioningSelectedTestId = value; },",
    "  setPythonCommissioningLastRunForTests: (value) => { pythonCommissioningLastRun = value; },",
    "  setPythonCommissioningHistoryRunsForTests: (value) => { pythonCommissioningHistoryRuns = Array.isArray(value) ? value : []; },",
    "  setSuiteRunHistoryPayloadForTests: (value) => { suiteRunHistoryPayload = Array.isArray(value) ? value : []; },",
    "  setSuiteCatalogPayloadForTests: (value) => { suiteCatalogPayload = Array.isArray(value) ? value : []; },",
    "  setQaCatalogPayloadForTests: (value) => { qaCatalogPayload = value || null; },",
    "  setAndroidCompatibilityPreflightPayloadForTests: (value) => { androidCompatibilityPreflightPayload = value || null; },",
    "  setAndroidAutomationSweepPreflightPayloadForTests: (value) => { androidAutomationSweepPreflightPayload = value || null; },",
    "  setPythonCommissioningEvidenceHistoryForTests: (value) => { pythonCommissioningEvidenceHistory = Array.isArray(value) ? value : []; },",
    "  setPythonEvidenceFiltersForTests: ({ status = '', testId = '' } = {}) => { pythonEvidenceFilterStatus = status; pythonEvidenceFilterTestId = testId; },",
    "  setQaRefreshStateForTests: (value) => { qaRefreshState = { ...qaRefreshState, ...(value || {}), sections: { ...((qaRefreshState && qaRefreshState.sections) || {}), ...(((value || {}).sections) || {}) } }; },",
    "  setQaTestWorkspaceSelectionForTests: (value) => { qaTestWorkspaceSelection = value || { kind: '', id: '' }; },",
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
