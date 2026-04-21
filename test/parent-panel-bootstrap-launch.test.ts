import { readFileSync } from "fs";
import * as path from "path";
import vm from "vm";

function extractInlineScript(html: string): string {
  const match = html.match(/<script>\s*const FIREBASE_STORAGE_KEY[\s\S]*?<\/script>/);
  if (!match) {
    throw new Error("Parent-panel inline script not found.");
  }
  return match[0].replace(/^<script>/, "").replace(/<\/script>$/, "");
}

function loadParentPanel() {
  const html = readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");
  const source = extractInlineScript(html);

  const elements = new Map<string, any>();
  const getElement = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: "",
        disabled: false,
        textContent: "",
        className: "status",
        innerHTML: "",
      });
    }
    return elements.get(id);
  };

  [
    "ticket-auth-status",
    "ticket-submit-status",
    "ticket-list",
    "ticket-master-imei",
    "ticket-secret-key",
    "ticket-sender-name",
    "ticket-sender-email",
    "ticket-sender-role",
    "ticket-problem",
    "secure-web-control-btn",
    "secure-child-panel-btn",
  ].forEach((id) => getElement(id));

  const authMock = {
    onAuthStateChanged: jest.fn(),
    signInWithCustomToken: jest.fn(() => Promise.resolve()),
  };
  const callableFactory = jest.fn((name: string) => {
    if (name === "createMasterWebBootstrapToken") {
      return jest.fn((payload?: { target?: string }) => Promise.resolve({
        data: {
          bootstrapToken: "bridge-token",
          targetPath: payload?.target === "child-panel" ? "/child-panel/index.html" : "/web-control/index.html",
          queryParamName: "bootstrapToken",
        },
      }));
    }
    if (name === "redeemMasterWebBootstrapToken") {
      return jest.fn(() => Promise.resolve({ data: { customToken: "tok-parent" } }));
    }
    if (name === "generateCustomToken") {
      return jest.fn(() => Promise.resolve({ data: { customToken: "tok-legacy" } }));
    }
    return jest.fn(() => Promise.resolve({ data: {} }));
  });

  const locationMock = {
    href: "https://minimaster.app/parent-panel/index.html",
    search: "",
    pathname: "/parent-panel/index.html",
    assign: jest.fn(),
  };

  const context: any = {
    console,
    URL,
    URLSearchParams,
    document: {
      title: "Parent Panel",
      getElementById: jest.fn((id: string) => getElement(id)),
      querySelector: jest.fn(() => ({ value: "no" })),
    },
    localStorage: {
      getItem: jest.fn((key: string) => {
        if (key === "operatorFirebaseConfigOverride") {
          return JSON.stringify({
            apiKey: "key-1",
            authDomain: "demo.firebaseapp.com",
            projectId: "demo-project",
            storageBucket: "demo.firebasestorage.app",
            messagingSenderId: "123456",
            appId: "1:123:web:abc",
          });
        }
        if (key === "minimasterAppCheckSiteKey") {
          return "site-key";
        }
        return null;
      }),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    firebase: {
      initializeApp: jest.fn(() => ({ name: "parent-panel-app" })),
      firestore: jest.fn(() => ({
        collection: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ empty: true, forEach: jest.fn() }),
        })),
      })),
      app: jest.fn(() => ({
        functions: jest.fn(() => ({ httpsCallable: callableFactory })),
        auth: jest.fn(() => authMock),
      })),
      appCheck: jest.fn(() => ({ activate: jest.fn() })),
    },
    window: null,
    location: locationMock,
    history: { replaceState: jest.fn() },
  };

  context.window = context;
  context.globalThis = context;

  const exportTrailer = [
    "",
    ";globalThis.__parentPanelTestExports = {",
    "  openSecureWebControl,",
    "  openSecureChildPanel,",
    "  authenticateForTickets,",
    "  loadOwnTickets,",
    "  getCurrentMasterImeiForTesting: function() { return currentMasterImei; },",
    "  getFunctionsForTesting: function() { return functions; }",
    "};",
  ].join("\n");

  vm.runInNewContext(source + exportTrailer, context, { filename: "parent-panel/index.html" });

  return { context, elements, authMock, callableFactory, locationMock };
}

describe("parent-panel bootstrap launch", () => {
  it("opens web-control via server-issued bootstrap link for authenticated users", async () => {
    const { context, authMock, callableFactory, locationMock, elements } = loadParentPanel();

    const authStateHandler = authMock.onAuthStateChanged.mock.calls[0][0] as (user: any) => void;
    authStateHandler({ uid: "m-parent" });

    await context.__parentPanelTestExports.openSecureWebControl();

    expect(elements.get("secure-web-control-btn").disabled).toBe(false);
    expect(callableFactory).toHaveBeenCalledWith("createMasterWebBootstrapToken");
    const createCallable = callableFactory.mock.results.find((entry: { value: unknown }) => {
      const fn = entry.value as jest.Mock;
      return fn && fn.mock && fn.mock.calls[0]?.[0]?.target === "web-control";
    })?.value as jest.Mock | undefined;
    expect(createCallable).toBeDefined();
    expect(createCallable).toHaveBeenCalledWith({ target: "web-control" });
    expect(locationMock.assign).toHaveBeenCalledWith("/web-control/index.html?bootstrapToken=bridge-token");
  });

  it("opens child-panel via server-issued bootstrap link for authenticated users", async () => {
    const { context, authMock, callableFactory, locationMock, elements } = loadParentPanel();

    const authStateHandler = authMock.onAuthStateChanged.mock.calls[0][0] as (user: any) => void;
    authStateHandler({ uid: "m-parent" });

    await context.__parentPanelTestExports.openSecureChildPanel();

    expect(elements.get("secure-child-panel-btn").disabled).toBe(false);
    const createCallable = callableFactory.mock.results.find((entry: { value: unknown }) => {
      const fn = entry.value as jest.Mock;
      return fn && fn.mock && fn.mock.calls[0]?.[0]?.target === "child-panel";
    })?.value as jest.Mock | undefined;
    expect(createCallable).toBeDefined();
    expect(createCallable).toHaveBeenCalledWith({ target: "child-panel" });
    expect(locationMock.assign).toHaveBeenCalledWith("/child-panel/index.html?bootstrapToken=bridge-token");
  });

  it("refuses secure launch before authentication and keeps legacy access visible", async () => {
    const { context, callableFactory, locationMock, elements } = loadParentPanel();

    await context.__parentPanelTestExports.openSecureWebControl();

    expect(callableFactory).not.toHaveBeenCalledWith("createMasterWebBootstrapToken");
    expect(locationMock.assign).not.toHaveBeenCalled();
    expect(elements.get("ticket-auth-status").textContent).toContain("Bitte zuerst im Eltern-Panel authentifizieren");
  });
});
