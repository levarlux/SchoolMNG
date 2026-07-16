const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const Store = require("electron-store");

const store = new Store();
const isDev = !app.isPackaged;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "School Library Manager",
    icon: path.join(__dirname, "..", "public", "favicon.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    const serverPath = path.join(process.resourcesPath, "standalone", "server.js");
    const { createServer } = require(serverPath);
    const server = createServer();
    const port = 3099;

    server.listen(port, () => {
      mainWindow.loadURL(`http://localhost:${port}`);
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers for school slug persistence
ipcMain.handle("get-school-slug", () => {
  return store.get("schoolSlug") || null;
});

ipcMain.handle("set-school-slug", (_event, slug) => {
  store.set("schoolSlug", slug);
  return true;
});

ipcMain.handle("clear-school-slug", () => {
  store.delete("schoolSlug");
  return true;
});

// IPC handler for app info
ipcMain.handle("get-app-info", () => {
  return {
    isElectron: true,
    isDev,
    platform: process.platform,
    version: app.getVersion(),
  };
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
