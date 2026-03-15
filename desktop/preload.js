const { contextBridge } = require("electron");
const path = require("path");

contextBridge.exposeInMainWorld("miniMasterDesktop", {
  parentPanelPath: path.join(__dirname, "..", "web-control", "index.html"),
  adminPanelPath: path.join(__dirname, "..", "admin-panel", "index.html")
});
