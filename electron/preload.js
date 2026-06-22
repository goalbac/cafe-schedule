const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: () => ipcRenderer.invoke('storage:load'),
  saveData: (data) => ipcRenderer.invoke('storage:save', data),
  exportImage: (dataUrl, suggestedName) => ipcRenderer.invoke('export:image', dataUrl, suggestedName),
  exportCSV: (csvText, suggestedName) => ipcRenderer.invoke('export:csv', csvText, suggestedName),
});
