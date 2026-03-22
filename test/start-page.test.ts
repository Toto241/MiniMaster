import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

type StorageMap = Record<string, string>;

type ElementLike = {
  id?: string;
  value?: string;
  textContent?: string;
  innerHTML?: string;
  className?: string;
  nextElementSibling?: any;
  style?: Record<string, string>;
  dataset?: Record<string, string>;
  classList?: { add: jest.Mock; remove: jest.Mock };
  focus?: jest.Mock;
  addEventListener?: jest.Mock;
  select?: jest.Mock;
};

function extractInlineScript(html: string): string {
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error("Inline script not found in start.html");
  return match[1];
}

function createElement(id?: string): ElementLike {
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    className: "",
    style: {},
    dataset: {},
    classList: { add: jest.fn(), remove: jest.fn() },
    focus: jest.fn(),
    addEventListener: jest.fn(),
    select: jest.fn(),
  };
}

function loadStartPage(initialStorage: StorageMap = {}, pathname = "/workspace/MiniMaster/start.html") {
  const htmlPath = path.join(__dirname, "..", "start.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const scriptSource = extractInlineScript(html);

  const storage = new Map(Object.entries(initialStorage));
  const elements = new Map<string, ElementLike>();

  const requiredIds = [
    "config-status-text",
    "config-project-text",
    "next-step-text",
    "config-status-pill",
    "info-bar-text",
    "fb-modal",
    "fb-status",
    "fb-apiKey",
    "fb-authDomain",
    "fb-projectId",
    "fb-storageBucket",
    "fb-messagingSenderId",
    "fb-appId",
    "master-apk-path",
  ];
  requiredIds.forEach((id) => elements.set(id, createElement(id)));

  const copyButton = createElement("copy-button");
  elements.get("master-apk-path")!.textContent = "masterApp\\build\\outputs\\apk\\debug\\masterApp-debug.apk";
  elements.get("master-apk-path")!.nextElementSibling = copyButton;

  const documentMock: any = {
    getElementById: jest.fn((id: string) => elements.get(id) || null),
    createElement: jest.fn((tag: string) => ({
      tagName: tag.toUpperCase(),
      value: "",
      style: {},
      select: jest.fn(),
      classList: { add: jest.fn(), remove: jest.fn() },
    })),
    body: {
      appendChild: jest.fn(),
      removeChild: jest.fn(),
    },
    execCommand: jest.fn(() => true),
  };

  const context: any = {
    console,
    document: documentMock,
    localStorage: {
      getItem: jest.fn((key: string) => storage.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
    },
    navigator: {
      clipboard: {
        writeText: jest.fn(() => Promise.resolve(undefined)),
      },
    },
    location: { pathname },
    setTimeout: jest.fn((fn: (...args: any[]) => void) => {
      fn();
      return 1;
    }),
    clearTimeout,
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(scriptSource, context, { filename: "start.html" });

  return { context, elements, storage, documentMock, copyButton };
}

describe("start.html bootstrap page", () => {
  it("shows missing-config state by default", () => {
    const { elements } = loadStartPage();

    expect(elements.get("config-status-text")?.textContent).toContain("Konfiguration fehlt");
    expect(elements.get("config-project-text")?.textContent).toBe("Nicht konfiguriert");
    expect(elements.get("config-status-pill")?.className).toContain("config-pill-missing");
  });

  it("renders saved Firebase config into modal and status area", () => {
    const config = {
      apiKey: "key-1",
      authDomain: "demo.firebaseapp.com",
      projectId: "demo-project",
      storageBucket: "demo.firebasestorage.app",
      messagingSenderId: "123456",
      appId: "1:123:web:abc",
    };
    const { context, elements } = loadStartPage({
      operatorFirebaseConfigOverride: JSON.stringify(config),
    });

    context.openFirebaseModal();

    expect(elements.get("fb-apiKey")?.value).toBe("key-1");
    expect(elements.get("fb-projectId")?.value).toBe("demo-project");
    expect(elements.get("config-project-text")?.textContent).toBe("demo-project");
    expect(elements.get("config-status-pill")?.className).toContain("config-pill-ready");
  });

  it("blocks saving invalid placeholder values and focuses the first invalid field", () => {
    const { context, elements, storage } = loadStartPage();
    elements.get("fb-apiKey")!.value = "your-api-key";
    elements.get("fb-authDomain")!.value = "demo.firebaseapp.com";
    elements.get("fb-projectId")!.value = "demo-project";
    elements.get("fb-storageBucket")!.value = "demo.firebasestorage.app";
    elements.get("fb-messagingSenderId")!.value = "123456";
    elements.get("fb-appId")!.value = "1:123:web:abc";

    context.saveFirebaseConfig();

    expect(elements.get("fb-status")?.className).toContain("error");
    expect(elements.get("fb-apiKey")?.focus).toHaveBeenCalled();
    expect(storage.has("operatorFirebaseConfigOverride")).toBe(false);
  });

  it("saves valid Firebase config and refreshes the visible status", () => {
    const { context, elements, storage } = loadStartPage();
    elements.get("fb-apiKey")!.value = "key-1";
    elements.get("fb-authDomain")!.value = "demo.firebaseapp.com";
    elements.get("fb-projectId")!.value = "demo-project";
    elements.get("fb-storageBucket")!.value = "demo.firebasestorage.app";
    elements.get("fb-messagingSenderId")!.value = "123456";
    elements.get("fb-appId")!.value = "1:123:web:abc";

    context.saveFirebaseConfig();

    expect(JSON.parse(storage.get("operatorFirebaseConfigOverride") || "{}")).toMatchObject({
      projectId: "demo-project",
    });
    expect(elements.get("fb-status")?.className).toContain("success");
    expect(elements.get("config-project-text")?.textContent).toBe("demo-project");
    expect(elements.get("next-step-text")?.textContent).toContain("Panels öffnen");
  });

  it("closes modal only when the overlay itself is clicked", () => {
    const { context, elements } = loadStartPage();
    const overlayHandler = elements.get("fb-modal")?.addEventListener?.mock.calls[0][1];
    const closeSpy = jest.spyOn(context, "closeFirebaseModal");

    overlayHandler.call(elements.get("fb-modal"), { target: elements.get("fb-modal") });
    overlayHandler.call(elements.get("fb-modal"), { target: {} });

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("builds Windows-style full paths based on the current location", () => {
    const { context } = loadStartPage({}, "/workspace/MiniMaster/start.html");
    expect(context.buildFullPath("childApp\\build\\app.apk", "/workspace/MiniMaster/start.html")).toBe(
      "workspace\\MiniMaster\\childApp\\build\\app.apk"
    );
  });

  it("copies APK paths through clipboard API and marks the button", async () => {
    const { context, copyButton } = loadStartPage();

    await context.copyPath("master-apk-path");

    expect(context.navigator.clipboard.writeText).toHaveBeenCalledWith(
      "workspace\\MiniMaster\\masterApp\\build\\outputs\\apk\\debug\\masterApp-debug.apk"
    );
    expect(copyButton.textContent).toBe("📋 Kopieren");
    expect(copyButton.classList.add).toHaveBeenCalledWith("copied");
    expect(copyButton.classList.remove).toHaveBeenCalledWith("copied");
  });

  it("falls back to execCommand copy when clipboard API fails", async () => {
    const { context, documentMock } = loadStartPage();
    context.navigator.clipboard.writeText.mockRejectedValueOnce(new Error("clipboard blocked"));

    await context.copyPath("master-apk-path");

    expect(documentMock.createElement).toHaveBeenCalledWith("textarea");
    expect(documentMock.execCommand).toHaveBeenCalledWith("copy");
  });
});
