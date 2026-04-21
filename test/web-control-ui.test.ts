import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

type StorageMap = Record<string, string>;

type MockElement = {
  id?: string;
  value?: string;
  innerHTML?: string;
  textContent?: string;
  style?: Record<string, string>;
  dataset?: Record<string, string>;
  checked?: boolean;
  className?: string;
  disabled?: boolean;
  getContext?: jest.Mock;
  querySelectorAll?: jest.Mock;
  addEventListener?: jest.Mock;
  closest?: jest.Mock;
};

function createElement(id?: string): MockElement {
  return {
    id,
    value: "",
    innerHTML: "",
    textContent: "",
    style: {},
    dataset: {},
    checked: false,
    className: "",
    disabled: false,
    getContext: jest.fn(() => ({})),
    querySelectorAll: jest.fn(() => []),
    addEventListener: jest.fn(),
    closest: jest.fn(() => null),
  };
}

function loadWebControl(initialStorage: StorageMap = {}) {
  const scriptPath = path.join(__dirname, "..", "web-control", "app.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, MockElement>();
  [
    "login-form",
    "user-info",
    "main-content",
    "master-id",
    "master-imei",
    "secret-key",
    "dashboard-action-bar",
    "devices-list",
    "task-child-id",
    "task-child-select",
    "task-child-selector-group",
    "task-description",
    "task-deadline",
    "task-creation-modal",
    "rules-child-id",
    "daily-limit",
    "blocked-apps",
    "rules-modal",
    "usageChart",
    "notification",
    "problem-description",
    "support-tickets",
    "task-review-section",
    "subscription-section",
    "support-section",
    "subscription-status-card",
    "legal-gate",
    "legal-gate-title",
    "legal-gate-message",
    "legal-context-form",
    "legal-consent-view",
    "legal-language-select",
    "legal-country-select",
    "legal-context-summary",
    "legal-policy-meta",
    "legal-terms-label",
    "legal-privacy-label",
    "legal-terms-checkbox",
    "legal-privacy-checkbox",
    "legal-terms-link",
    "legal-privacy-link",
    "legal-accept-btn",
    "legal-retry-btn",
  ].forEach((id) => elements.set(id, createElement(id)));

  const domContentLoadedHandlers: Array<() => void> = [];
  const consentRadio = { value: "yes", checked: true };

  const documentMock: any = {
    addEventListener: jest.fn((event: string, handler: () => void) => {
      if (event === "DOMContentLoaded") domContentLoadedHandlers.push(handler);
    }),
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    createElement: jest.fn(() => {
      let inner = "";
      return {
        set textContent(value: string) {
          inner = String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        },
        get textContent() { return inner; },
        get innerHTML() { return inner; },
        set innerHTML(value: string) { inner = value; },
      };
    }),
    querySelector: jest.fn((selector: string) => {
      if (selector === "input[name=\"support-access-consent\"]:checked") return consentRadio;
      if (selector === ".dashboard") return { style: { display: "block" } };
      return null;
    }),
  };

  const callableFactory = jest.fn((name: string) => {
    if (name === "generateCustomToken") {
      return jest.fn(() => Promise.resolve({ data: { customToken: "tok-login" } }));
    }
    if (name === "redeemMasterWebBootstrapToken") {
      return jest.fn(() => Promise.resolve({ data: { customToken: "tok-bootstrap", masterId: "m-bridge" } }));
    }
    if (name === "setDeviceLocked") {
      return jest.fn(() => Promise.resolve({ data: { success: true } }));
    }
    if (name === "createTask") {
      return jest.fn(() => Promise.resolve({ data: { taskId: "task-1" } }));
    }
    if (name === "setUsageRules" || name === "updateAppBlacklist") {
      return jest.fn(() => Promise.resolve({ data: { success: true } }));
    }
    if (name === "createSupportTicket") {
      return jest.fn(() => Promise.resolve({ data: { success: true, ticketId: "ticket-1" } }));
    }
    return jest.fn(() => Promise.resolve({ data: {} }));
  });

  const authMock = {
    onAuthStateChanged: jest.fn(),
    signInWithCustomToken: jest.fn(() => Promise.resolve()),
    signOut: jest.fn(() => Promise.resolve()),
    currentUser: { uid: "m1" },
  };

  const firebaseMock: any = {
    initializeApp: jest.fn(() => ({})),
    firestore: jest.fn(() => ({
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        onSnapshot: jest.fn(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, forEach: jest.fn() }),
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }) })),
          })),
        })),
      })),
    })),
    functions: jest.fn(() => ({ httpsCallable: callableFactory })),
    auth: jest.fn(() => authMock),
  };
  firebaseMock.firestore.collectionGroup = jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ forEach: jest.fn() }),
  }));

  const chartMock = jest.fn(() => ({
    data: { datasets: [{ data: Array(7).fill(0) }] },
    update: jest.fn(),
    destroy: jest.fn(),
  }));

  const context: any = {
    console,
    document: documentMock,
    localStorage: {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: jest.fn((key: string) => storage.delete(key)),
    },
    firebase: firebaseMock,
    Chart: chartMock,
    navigator: { userAgent: "Mozilla/5.0 (Macintosh)", clipboard: { writeText: jest.fn() } },
    location: { search: "", href: "https://minimaster.app/web-control/index.html", pathname: "/web-control/index.html" },
    history: { replaceState: jest.fn() },
    URL,
    URLSearchParams,
    open: jest.fn(),
    setTimeout: jest.fn((fn: (...args: any[]) => void) => { fn(); return 1; }),
    clearTimeout,
    Promise,
  };
  context.window = context;
  context.globalThis = context;

  const exportTrailer = [
    "",
    ";globalThis.__webControlTestExports = {",
    "  loadFirebaseConfig,",
    "  hasCompleteFirebaseConfig,",
    "  isPlaceholderFirebaseConfig,",
    "  renderDevices,",
    "  toggleDeviceLock,",
    "  createTask,",
    "  openRulesModal,",
    "  saveRules,",
    "  createSupportTicket,",
    "  login,",
    "  logout,",
    "  showMainContent,",
    "  showTaskAssignment,",
    "  showReviewTasks,",
    "  showSubscription,",
    "  showSupport,",
    "  showDashboard,",
    "  showNotification,",
    "  buildLegalLocale,",
    "  loadSavedLegalContext,",
    "  saveLegalContext,",
    "  continueLegalSetup,",
    "  retryLegalGate,",
    "  acceptLegalConsent,",
    "  handleAuthenticatedUserForTesting: handleAuthenticatedUser,",
    "  setFunctionsForTesting: function(mock) { functions = mock; },",
    "  setDbForTesting: function(mock) { db = mock; },",
    "  setCurrentMasterImeiForTesting: function(value) { currentMasterImei = value; },",
    "  getCurrentMasterImeiForTesting: function() { return currentMasterImei; }",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "web-control/app.js" });

  return { context, elements, storage, callableFactory, firebaseMock, documentMock, authMock, domContentLoadedHandlers };
}

describe("web-control browser flows", () => {
  it("prefers valid Firebase config from localStorage", () => {
    const { context } = loadWebControl({
      operatorFirebaseConfigOverride: JSON.stringify({
        apiKey: "key-1",
        authDomain: "demo.firebaseapp.com",
        projectId: "demo-project",
        storageBucket: "demo.firebasestorage.app",
        messagingSenderId: "123456",
        appId: "1:123:web:abc",
      }),
    });

    expect(context.__webControlTestExports.loadFirebaseConfig().projectId).toBe("demo-project");
  });

  it("renders an empty device state", () => {
    const { context, elements } = loadWebControl();

    context.__webControlTestExports.renderDevices([]);

    expect(elements.get("devices-list")?.innerHTML).toContain("No paired devices found");
  });

  it("renders device cards with escaped device IDs", () => {
    const { context, elements } = loadWebControl();

    context.__webControlTestExports.renderDevices([{ id: "child<script>", isLocked: true, lastSeen: { seconds: Date.now() / 1000 } }]);

    expect(elements.get("devices-list")?.innerHTML).toContain("child&lt;script&gt;");
  });

  it("createTask validates required fields before backend call", async () => {
    const { context, callableFactory } = loadWebControl();
    const event = { preventDefault: jest.fn() };

    await context.__webControlTestExports.createTask(event);

    expect(callableFactory).not.toHaveBeenCalledWith("createTask");
  });

  it("createTask submits sanitized payload to backend", async () => {
    const { context, elements, callableFactory } = loadWebControl();
    context.__webControlTestExports.setFunctionsForTesting({ httpsCallable: callableFactory });
    elements.get("task-child-id")!.value = "child-1";
    elements.get("task-description")!.value = "Zimmer aufräumen";
    elements.get("task-deadline")!.value = "2026-03-22T10:00";
    const event = { preventDefault: jest.fn() };

    await context.__webControlTestExports.createTask(event);

    expect(callableFactory).toHaveBeenCalledWith("createTask");
    const createTaskCallable = callableFactory.mock.results.find((entry: { type: string; value: unknown }) => entry.type === "return")?.value as jest.Mock | undefined;
    expect(createTaskCallable).toBeDefined();
    expect(createTaskCallable).toHaveBeenCalledWith({
      childId: "child-1",
      description: "Zimmer aufräumen",
      deadlineISO: new Date("2026-03-22T10:00").toISOString(),
    });
  });

  it("openRulesModal maps blacklist and daily limit into form fields", () => {
    const { context, elements } = loadWebControl();
    context.__webControlTestExports.setDbForTesting({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          collection: jest.fn(() => ({
            doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }) })),
          })),
        })),
      })),
    });

    context.__webControlTestExports.openRulesModal({
      id: "child-1",
      appBlacklist: ["com.blocked.one", "com.blocked.two"],
      usageRules: { dailyLimitSeconds: 5400 },
    });

    expect(elements.get("rules-child-id")?.value).toBe("child-1");
    expect(elements.get("blocked-apps")?.value).toBe("com.blocked.one, com.blocked.two");
    expect(elements.get("daily-limit")?.value).toBe(90);
  });

  it("saveRules sends both usage rules and blacklist updates", async () => {
    const { context, elements, callableFactory } = loadWebControl();
    context.__webControlTestExports.setFunctionsForTesting({ httpsCallable: callableFactory });
    const event = { preventDefault: jest.fn() };
    elements.get("rules-child-id")!.value = "child-1";
    elements.get("daily-limit")!.value = "60";
    elements.get("blocked-apps")!.value = "com.one, com.two";

    await context.__webControlTestExports.saveRules(event);

    expect(callableFactory).toHaveBeenCalledWith("setUsageRules");
    expect(callableFactory).toHaveBeenCalledWith("updateAppBlacklist");
  });

  it("createSupportTicket requires description and consent", async () => {
    const { context, elements, documentMock } = loadWebControl();
    documentMock.querySelector.mockImplementation((selector: string) => {
      if (selector === "input[name=\"support-access-consent\"]:checked") return null;
      return null;
    });
    const event = { preventDefault: jest.fn() };

    await context.__webControlTestExports.createSupportTicket(event);

    expect(elements.get("notification")?.textContent).toContain("Please describe your problem");
  });

  it("createSupportTicket submits consent-aware payload and resets the form on success", async () => {
    const { context, elements, callableFactory, documentMock } = loadWebControl();
    context.__webControlTestExports.setFunctionsForTesting({ httpsCallable: callableFactory });
    context.__webControlTestExports.setCurrentMasterImeiForTesting("master-1");
    context.__webControlTestExports.setDbForTesting({
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, forEach: jest.fn() }),
      })),
    });
    elements.get("problem-description")!.value = "Kind kann Aufgaben nicht synchronisieren";

    const checkedConsent = { value: "yes", checked: true };
    documentMock.querySelector.mockImplementation((selector: string) => {
      if (selector === "input[name=\"support-access-consent\"]:checked") return checkedConsent;
      return null;
    });

    const event = { preventDefault: jest.fn() };

    await context.__webControlTestExports.createSupportTicket(event);

    expect(callableFactory).toHaveBeenCalledWith("createSupportTicket");
    expect(elements.get("problem-description")?.value).toBe("");
    expect(checkedConsent.checked).toBe(false);
    expect(elements.get("notification")?.textContent).toContain("Support ticket created successfully");
  });

  it("showNotification writes message and severity class to the notification banner", () => {
    const { context, elements } = loadWebControl();

    context.__webControlTestExports.showNotification("Alles synchronisiert", "success");

    expect(elements.get("notification")?.textContent).toBe("Alles synchronisiert");
    expect(elements.get("notification")?.className).toBe("notification success");
  });

  it("renders the task deadline field as a datetime-local picker in the HTML shell", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "web-control", "index.html"), "utf8");

    expect(html).toContain("id=\"task-deadline\"");
    expect(html).toContain("type=\"datetime-local\"");
  });

  it("builds a legal locale from language tag and country code", () => {
    const { context } = loadWebControl();

    expect(context.__webControlTestExports.buildLegalLocale("pt-BR", "de")).toBe("pt-DE");
    expect(context.__webControlTestExports.buildLegalLocale("", "")).toBe("en-US");
  });

  it("blocks direct secret-key login and shows an error message", async () => {
    const { context, elements, firebaseMock, domContentLoadedHandlers } = loadWebControl({
      operatorFirebaseConfigOverride: JSON.stringify({
        apiKey: "key-1",
        authDomain: "demo.firebaseapp.com",
        projectId: "demo-project",
        storageBucket: "demo.firebasestorage.app",
        messagingSenderId: "123456",
        appId: "1:123:web:abc",
      }),
    });

    domContentLoadedHandlers[0]?.();
    elements.get("master-imei")!.value = "master-imei-1";
    elements.get("secret-key")!.value = "secret-key-1";

    context.__webControlTestExports.login();
    await Promise.resolve();

    expect(firebaseMock.auth().signInWithCustomToken).not.toHaveBeenCalled();
    expect(elements.get("notification")?.textContent).toContain("Direct secret-key login is disabled");
  });

  it("redeems a one-time web bootstrap token from the URL before legacy login", async () => {
    const { context, authMock, callableFactory, domContentLoadedHandlers } = loadWebControl({
      operatorFirebaseConfigOverride: JSON.stringify({
        apiKey: "key-1",
        authDomain: "demo.firebaseapp.com",
        projectId: "demo-project",
        storageBucket: "demo.firebasestorage.app",
        messagingSenderId: "123456",
        appId: "1:123:web:abc",
      }),
    });

    context.location.search = "?bootstrapToken=bridge-token";
    context.location.href = "https://minimaster.app/web-control/index.html?bootstrapToken=bridge-token";

    domContentLoadedHandlers[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(callableFactory).toHaveBeenCalledWith("redeemMasterWebBootstrapToken");
    const redeemCallable = callableFactory.mock.results.find((entry: { type: string; value: unknown }) => entry.type === "return" && (entry.value as jest.Mock).mock.calls[0]?.[0]?.bootstrapToken === "bridge-token")?.value as jest.Mock | undefined;
    expect(redeemCallable).toBeDefined();
    expect(authMock.signInWithCustomToken).toHaveBeenCalledWith("tok-bootstrap");
    expect(context.history.replaceState).toHaveBeenCalled();
  });

  it("blocks restored sessions until legal context is selected", async () => {
    const { authMock, elements, domContentLoadedHandlers } = loadWebControl({
      operatorFirebaseConfigOverride: JSON.stringify({
        apiKey: "key-1",
        authDomain: "demo.firebaseapp.com",
        projectId: "demo-project",
        storageBucket: "demo.firebasestorage.app",
        messagingSenderId: "123456",
        appId: "1:123:web:abc",
      }),
    });
    domContentLoadedHandlers[0]?.();
    const authHandler = authMock.onAuthStateChanged.mock.calls[0][0] as (user: any) => Promise<void> | void;

    await authHandler({ uid: "master-legal" });

    expect(elements.get("legal-gate")?.style?.display).toBe("block");
    expect(elements.get("legal-context-form")?.style?.display).toBe("flex");
    expect(elements.get("main-content")?.style?.display).toBe("none");
  });

  it("continues from legal context setup into re-consent when backend requires it", async () => {
    const { context, elements } = loadWebControl();
    const needsCallable = jest.fn((payload: any) => {
      expect(payload).toEqual({ country: "DE", locale: "de-DE" });
      return Promise.resolve({
        data: {
          requiresReconsent: true,
          terms: { version: "2026.04.17", contentUrl: "https://example.com/terms" },
          privacy: { version: "2026.04.17", contentUrl: "https://example.com/privacy" },
        },
      });
    });
    context.__webControlTestExports.setFunctionsForTesting({
      httpsCallable: jest.fn((name: string) => {
        if (name === "needsLegalReconsent") return needsCallable;
        return jest.fn();
      }),
    });
    context.__webControlTestExports.setCurrentMasterImeiForTesting("master-1");
    elements.get("legal-language-select")!.value = "de";
    elements.get("legal-country-select")!.value = "DE";

    await context.__webControlTestExports.continueLegalSetup();

    expect(elements.get("legal-consent-view")?.style?.display).toBe("flex");
    expect(elements.get("legal-terms-label")?.textContent).toContain("2026.04.17");
    expect(elements.get("main-content")?.style?.display).toBe("none");
  });

  it("stores legal consent and unlocks the dashboard only after accepting both documents", async () => {
    const { context, elements } = loadWebControl();
    context.setTimeout = jest.fn(() => 1);
    const needsCallable = jest.fn(() => Promise.resolve({
      data: {
        requiresReconsent: true,
        terms: { version: "2026.04.17", contentUrl: "https://example.com/terms" },
        privacy: { version: "2026.04.17", contentUrl: "https://example.com/privacy" },
      },
    }));
    const recordCallable = jest.fn(() => Promise.resolve({ data: { success: true } }));
    context.__webControlTestExports.setFunctionsForTesting({
      httpsCallable: jest.fn((name: string) => {
        if (name === "needsLegalReconsent") return needsCallable;
        if (name === "recordLegalConsent") return recordCallable;
        return jest.fn();
      }),
    });
    context.__webControlTestExports.setDbForTesting({
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        onSnapshot: jest.fn(() => jest.fn()),
      })),
    });
    context.__webControlTestExports.setCurrentMasterImeiForTesting("master-1");
    elements.get("legal-language-select")!.value = "de";
    elements.get("legal-country-select")!.value = "DE";

    await context.__webControlTestExports.continueLegalSetup();
    elements.get("legal-terms-checkbox")!.checked = true;
    elements.get("legal-privacy-checkbox")!.checked = true;

    await context.__webControlTestExports.acceptLegalConsent();

    expect(recordCallable).toHaveBeenCalledWith({
      country: "DE",
      locale: "de-DE",
      termsVersion: "2026.04.17",
      privacyVersion: "2026.04.17",
      consentSource: "web_control",
      appVersion: "web-control",
    });
    expect(elements.get("main-content")?.style?.display).toBe("block");
    expect(elements.get("legal-gate")?.style?.display).toBe("none");
  });

  it("logs out from web-control, clears credentials and restores the login view", async () => {
    const { context, elements, storage, firebaseMock } = loadWebControl({
      "minimaster-credentials": JSON.stringify({ masterImei: "m1" }),
    });

    context.__webControlTestExports.setCurrentMasterImeiForTesting("m1");
    elements.get("login-form")!.style = { display: "none" };
    elements.get("user-info")!.style = { display: "flex" };
    elements.get("main-content")!.style = { display: "block" };
    elements.get("master-imei")!.value = "m1";
    elements.get("secret-key")!.value = "secret";

    context.__webControlTestExports.logout();
    await Promise.resolve();

    expect(context.__webControlTestExports.getCurrentMasterImeiForTesting()).toBe(null);
    expect(storage.has("minimaster-credentials")).toBe(false);
    expect(firebaseMock.auth().signOut).toHaveBeenCalled();
    expect(elements.get("login-form")?.style?.display).toBe("flex");
    expect(elements.get("user-info")?.style?.display).toBe("none");
    expect(elements.get("main-content")?.style?.display).toBe("none");
    expect(elements.get("master-imei")?.value).toBe("");
    expect(elements.get("secret-key")?.value).toBe("");
    expect(elements.get("notification")?.textContent).toContain("Logged out successfully");
  });

  it("showTaskAssignment opens the shared task modal with a device selector when multiple children exist", async () => {
    const { context, elements } = loadWebControl();
    context.__webControlTestExports.setCurrentMasterImeiForTesting("m1");
    context.__webControlTestExports.renderDevices([{ id: "child-1" }, { id: "child-2" }]);

    await context.__webControlTestExports.showTaskAssignment();

    expect(elements.get("task-creation-modal")?.style?.display).toBe("flex");
    expect(elements.get("task-child-selector-group")?.style?.display).toBe("block");
    expect(elements.get("task-child-select")?.innerHTML).toContain("child-1");
    expect(elements.get("task-child-select")?.innerHTML).toContain("child-2");
  });

  it("section navigation keeps the dashboard shell visible while switching to support content", () => {
    const { context, elements } = loadWebControl();
    context.__webControlTestExports.setDbForTesting({
      collection: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ empty: true, forEach: jest.fn() }),
      })),
    });

    context.__webControlTestExports.showSupport();

    expect(elements.get("dashboard-action-bar")?.style?.display).toBe("none");
    expect(elements.get("devices-list")?.style?.display).toBe("none");
    expect(elements.get("support-section")?.style?.display).toBe("block");
  });

});
