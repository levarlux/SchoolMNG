const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getSchoolSlug: () => ipcRenderer.invoke("get-school-slug"),
  setSchoolSlug: (slug) => ipcRenderer.invoke("set-school-slug", slug),
  clearSchoolSlug: () => ipcRenderer.invoke("clear-school-slug"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
});
