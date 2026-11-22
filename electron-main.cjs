const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // Start a tiny local server so the app loads over http:// instead of file://
  const expressApp = express();
  const distPath = path.join(__dirname, 'dist');
  expressApp.use(express.static(distPath));

  server = expressApp.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});