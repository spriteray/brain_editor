import { contextBridge, ipcRenderer } from "electron";

const api = {
  readTextFile: (filePath: string): Promise<string> => ipcRenderer.invoke("file:readText", filePath),
  writeTextFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke("file:writeText", filePath, content),
  openTextFile: (): Promise<{ filePath: string; content: string } | null> =>
    ipcRenderer.invoke("file:openText"),
  saveTextFile: (
    defaultPath: string,
    content: string,
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<string | null> => ipcRenderer.invoke("file:saveText", defaultPath, content, filters),
  readAssetText: (relativePath: string): Promise<string> => ipcRenderer.invoke("asset:readText", relativePath)
};

contextBridge.exposeInMainWorld("brainApi", api);

export type BrainApi = typeof api;
