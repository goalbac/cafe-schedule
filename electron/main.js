const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_FILE = () => path.join(app.getPath('userData'), 'schedule-data.json');

function loadDataFromDisk() {
  try {
    const raw = fs.readFileSync(DATA_FILE(), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveDataToDisk(data) {
  fs.mkdirSync(path.dirname(DATA_FILE()), { recursive: true });
  fs.writeFileSync(DATA_FILE(), JSON.stringify(data, null, 2), 'utf-8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('storage:load', async () => {
  return loadDataFromDisk();
});

ipcMain.handle('storage:save', async (event, data) => {
  saveDataToDisk(data);
  return true;
});

ipcMain.handle('export:image', async (event, dataUrl, suggestedName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '이미지로 저장',
    defaultPath: suggestedName,
    filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
  });
  if (canceled || !filePath) return false;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return true;
});

ipcMain.handle('export:csv', async (event, csvText, suggestedName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'CSV로 저장',
    defaultPath: suggestedName,
    filters: [{ name: 'CSV (엑셀에서 열기)', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, '\uFEFF' + csvText, 'utf-8');
  return true;
});
