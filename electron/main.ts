import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined || !app.isPackaged;

function resolveAsset(relativePath: string) {
  return path.join(app.getAppPath(), relativePath);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#f4f1e8",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);

  if (isDev) {
    await win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

ipcMain.handle("file:readText", async (_event, filePath: string) => {
  return fs.readFile(filePath, "utf8");
});

ipcMain.handle("file:writeText", async (_event, filePath: string, content: string) => {
  await fs.writeFile(filePath, content, "utf8");
});

ipcMain.handle("file:openText", async () => {
  const result = await dialog.showOpenDialog({
    defaultPath: resolveAsset("config/trees"),
    filters: [{ name: "XML", extensions: ["xml"] }],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return { filePath, content: await fs.readFile(filePath, "utf8") };
});

ipcMain.handle(
  "file:saveText",
  async (_event, defaultPath: string, content: string, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showSaveDialog({
    defaultPath: path.isAbsolute(defaultPath) ? defaultPath : resolveAsset(path.join("config/trees", defaultPath)),
    filters: filters ?? [{ name: "XML", extensions: ["xml"] }]
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, "utf8");
  return result.filePath;
  }
);

ipcMain.handle("asset:readText", async (_event, relativePath: string) => {
  return fs.readFile(resolveAsset(relativePath), "utf8");
});

ipcMain.handle("dialog:openNodeDefinition", async () => {
  const result = await dialog.showOpenDialog({
    defaultPath: resolveAsset("config"),
    filters: [{ name: "XML", extensions: ["xml"] }],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  return { filePath, content: await fs.readFile(filePath, "utf8") };
});
