import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { createWindow, getMainWindow } from './window';
import { createTray, destroyTray } from './tray';
import { setupIpcHandlers } from './ipc-handlers';
import { ServiceBridge } from './service-bridge';

const isDev = process.env.NODE_ENV !== 'production';

let serviceBridge: ServiceBridge | null = null;

async function initialize() {
  // Create service bridge
  serviceBridge = new ServiceBridge();

  // Set up IPC handlers
  setupIpcHandlers(serviceBridge);

  // Create main window
  const win = createWindow();

  // Create system tray
  createTray(win);

  // Try to connect to service
  serviceBridge.connect().catch(() => {
    console.log('Service not running, will retry on demand');
  });

  // Forward service events to renderer
  serviceBridge.on('output', (data: string) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('claude:output', data);
    }
  });

  serviceBridge.on('status', (status: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('claude:status', status);
    }
  });

  serviceBridge.on('ready', (ready: boolean) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('claude:ready', ready);
    }
  });

  serviceBridge.on('connected', () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('service:connected');
    }
  });

  serviceBridge.on('disconnected', () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('service:disconnected');
    }
  });

  serviceBridge.on('history', (data: string) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('history', data);
    }
  });

  // Memory events
  serviceBridge.on('memory:stats', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:stats', data);
    }
  });

  serviceBridge.on('memory:facts', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:facts', data);
    }
  });

  serviceBridge.on('memory:factAdded', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:factAdded', data);
    }
  });

  serviceBridge.on('memory:factDeleted', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:factDeleted', data);
    }
  });

  serviceBridge.on('memory:conversations', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:conversations', data);
    }
  });

  serviceBridge.on('memory:messages', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('memory:messages', data);
    }
  });

  // Reminder events
  serviceBridge.on('reminders:list', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('reminders:list', data);
    }
  });

  serviceBridge.on('reminders:added', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('reminders:added', data);
    }
  });

  serviceBridge.on('reminders:cancelled', (data: any) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('reminders:cancelled', data);
    }
  });

  // Logs
  serviceBridge.on('logs:content', (data: string) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('logs:content', data);
    }
  });

  // Error handling
  serviceBridge.on('error', (message: string) => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.webContents.send('error', message);
    }
  });
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  destroyTray();
  if (serviceBridge) {
    serviceBridge.disconnect();
  }
});

export { serviceBridge };
