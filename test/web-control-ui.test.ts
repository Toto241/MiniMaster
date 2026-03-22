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
  getContext?: jest.Mock;
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
    getContext: jest.fn(() => ({})),
  };
}

function loadWebControl(initialStorage: StorageMap = {}) {
  const scriptPath = path.join(__dirname, "..", "web-control", "app.js");
  const source = fs.readFileSync(scriptPath, "utf8");

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, MockElement>();
  [
    "devices-list",
    "task-child-id",
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
        set textContent(value: string) { inner = String(value || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\"/g, '&quot;')
          .replace(/'/g, '&#39;'); },
        get textContent() { return inner; },
        get innerHTML() { return inner; },
        set innerHTML(value: string) { inner = value; },
      };
    }),
    querySelector: jest.fn((selector: string) => {
      if (selector === 'input[name="support-access-consent"]:checked') return consentRadio;
      if (selector === ".dashboard") return { style: { display: "block" } };
      return null;
    }),
  };

  const callableFactory = jest.fn((name: string) => {
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
    auth: jest.fn(() => ({
      onAuthStateChanged: jest.fn(),
      signInWithCustomToken: jest.fn(() => Promise.resolve()),
      signOut: jest.fn(() => Promise.resolve()),
      currentUser: { uid: "m1" },
    })),
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
    "  showNotification,",
    "  setFunctionsForTesting: function(mock) { functions = mock; },",
    "  setDbForTesting: function(mock) { db = mock; },",
    "  setCurrentMasterImeiForTesting: function(value) { currentMasterImei = value; },",
    "  getCurrentMasterImeiForTesting: function() { return currentMasterImei; }",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "web-control/app.js" });

  return { context, elements, storage, callableFactory, firebaseMock, documentMock };
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
      if (selector === 'input[name=\"support-access-consent\"]:checked') return null;
      return null;
    });
    const event = { preventDefault: jest.fn() };

    await context.__webControlTestExports.createSupportTicket(event);

    expect(elements.get("notification")?.textContent).toContain("Please describe your problem");
  });
});
