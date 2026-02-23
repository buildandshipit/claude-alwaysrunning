import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';
import path from 'path';
import { showWindow, hideWindow } from './window';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  // Create tray icon (use a simple colored square if no icon available)
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      // Create a simple 16x16 icon
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  // Resize for tray (16x16 on Windows, 22x22 on macOS)
  const size = process.platform === 'darwin' ? 22 : 16;
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: size, height: size });
  }

  tray = new Tray(icon);
  tray.setToolTip('Claude Always Running');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => showWindow()
    },
    {
      label: 'Hide',
      click: () => hideWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow.destroy();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  // Click to toggle window
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      hideWindow();
    } else {
      showWindow();
    }
  });

  // Double click to show
  tray.on('double-click', () => {
    showWindow();
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function getTray(): Tray | null {
  return tray;
}
