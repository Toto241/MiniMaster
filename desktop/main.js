const path = require("path");
const { app, BrowserWindow, shell } = require("electron");

function createWindow() {
  const windowOptions = {
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  };

  windowOptions["width"] = 1200;
  windowOptions["height"] = 820;
  windowOptions["minWidth"] = 980;
  windowOptions["minHeight"] = 700;

  const mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, "launcher.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
