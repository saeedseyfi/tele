import { app, BrowserWindow, screen, ipcMain, globalShortcut, desktopCapturer, nativeTheme } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let win: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;

const CONTENT_WIDTH = 350;
const EAR_SIZE = 22;
const WIDTH = CONTENT_WIDTH + EAR_SIZE * 2;
const NOTCH_Y = 38;
const STUCK_THRESHOLD = 10;

// ── Config ──

interface Config {
  shortcuts: {
    playPause: string;
    speedUp: string;
    speedDown: string;
    seekAhead: string;
    seekBack: string;
  };
  defaultSpeed: number;
  seekSpeed: number;
}

const DEFAULT_CONFIG: Config = {
  shortcuts: {
    playPause: 'CommandOrControl+Shift+S',
    speedUp: 'CommandOrControl+Shift+D',
    speedDown: 'CommandOrControl+Shift+A',
    seekAhead: 'CommandOrControl+Shift+Down',
    seekBack: 'CommandOrControl+Shift+Up',
  },
  defaultSpeed: 3,
  seekSpeed: 150,
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig(): Config {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    saveConfigToDisk(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfigToDisk(cfg: Config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

let config = DEFAULT_CONFIG;

// ── Menu Bar Color Sampling ──

let lastSentColorKey = '';
let sampleTimer: ReturnType<typeof setTimeout> | null = null;
let sampleInterval: ReturnType<typeof setInterval> | null = null;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function themeColor(): { color: string; isLight: boolean } {
  return nativeTheme.shouldUseDarkColors
    ? { color: '#1a1a1c', isLight: false }
    : { color: '#f0f0f0', isLight: true };
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

const DEFAULT_COLOR = '#0d0d0d';

function resetToDefaultColor() {
  if (lastSentColorKey === 'default') return;
  lastSentColorKey = 'default';
  send('menu-bar-color', DEFAULT_COLOR, false);
}

async function sampleMenuBarColor() {
  if (!win) return;
  const [, y] = win.getPosition();
  if (y > NOTCH_Y + STUCK_THRESHOLD) {
    resetToDefaultColor();
    return;
  }

  let color: string;
  let isLight: boolean;

  try {
    const bounds = win.getBounds();
    const display = screen.getDisplayMatching(bounds);
    const thumbW = 200;
    const thumbH = 120;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: thumbW, height: thumbH },
    });

    const source = sources.find(s => s.display_id === display.id.toString()) || sources[0];
    if (!source) throw new Error('no source');

    const thumb = source.thumbnail;
    const size = thumb.getSize();
    const bitmap = thumb.toBitmap();

    const scaleX = size.width / display.size.width;
    const centerX = Math.round((bounds.x - display.bounds.x + bounds.width / 2) * scaleX);
    // Sample near top of thumbnail (menu bar region)
    const sampleY = Math.min(Math.round(size.height * 0.02), size.height - 1);

    let r = 0, g = 0, b = 0, count = 0;
    for (let dx = -8; dx <= 8; dx++) {
      const px = Math.max(0, Math.min(centerX + dx, size.width - 1));
      const offset = (sampleY * size.width + px) * 4; // BGRA
      b += bitmap[offset];
      g += bitmap[offset + 1];
      r += bitmap[offset + 2];
      count++;
    }

    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);

    color = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    isLight = luminance(r, g, b) > 140;
  } catch {
    ({ color, isLight } = themeColor());
  }

  const key = `${color}:${isLight}`;
  if (key !== lastSentColorKey) {
    lastSentColorKey = key;
    send('menu-bar-color', color, isLight);
  }
}

function debouncedSample() {
  if (sampleTimer) clearTimeout(sampleTimer);
  sampleTimer = setTimeout(sampleMenuBarColor, 300);
}

// ── Main Window ──

function send(channel: string, ...args: unknown[]) {
  win?.webContents.send(channel, ...args);
}

function createWindow() {
  const { width: screenWidth } = screen.getPrimaryDisplay().size;

  win = new BrowserWindow({
    width: WIDTH,
    height: 300,
    x: Math.round((screenWidth - WIDTH) / 2),
    y: NOTCH_Y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setContentProtection(true);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.on('closed', () => { win = null; });
  win.on('focus', () => sampleMenuBarColor());
  win.on('show', () => sampleMenuBarColor());
  win.on('will-resize', (e) => e.preventDefault());

  let wasStuck = true;
  win.on('move', () => {
    if (!win) return;
    const [x, y] = win.getPosition();
    const stuck = y <= NOTCH_Y + STUCK_THRESHOLD;
    if (stuck && y !== NOTCH_Y) {
      win.setPosition(x, NOTCH_Y);
      return;
    }
    if (stuck !== wasStuck) {
      wasStuck = stuck;
      send('stuck-top', stuck);
      sampleMenuBarColor();
    }
  });
}

// ── Settings Window ──

function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 420,
    height: 480,
    resizable: false,
    alwaysOnTop: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'window',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile(path.join(__dirname, '../renderer/settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ── Shortcuts ──

function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();

  const { shortcuts } = config;
  globalShortcut.register(shortcuts.playPause, () => send('media', 'play-pause'));
  globalShortcut.register(shortcuts.speedUp, () => send('media', 'speed-up'));
  globalShortcut.register(shortcuts.speedDown, () => send('media', 'speed-down'));
  globalShortcut.register(shortcuts.seekAhead, () => send('media', 'seek-ahead'));
  globalShortcut.register(shortcuts.seekBack, () => send('media', 'seek-back'));
}

// ── IPC ──

ipcMain.on('close', () => win?.close());

ipcMain.on('move-by', (_e, dx: number, dy: number) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

ipcMain.on('resize', (_e, height: number) => {
  if (win) win.setSize(WIDTH, height);
});


ipcMain.handle('get-config', () => config);

ipcMain.handle('save-config', (_e, newConfig: Config) => {
  config = { ...DEFAULT_CONFIG, ...newConfig };
  saveConfigToDisk(config);
  registerGlobalShortcuts();
  send('config-changed', config);
});

ipcMain.on('open-settings', () => openSettings());

// ── App Lifecycle ──

app.whenReady().then(() => {
  config = loadConfig();
  createWindow();
  registerGlobalShortcuts();

  // Sample menu bar color on launch, periodically, on theme/display change
  sampleMenuBarColor();
  sampleInterval = setInterval(sampleMenuBarColor, 5000);
  nativeTheme.on('updated', debouncedSample);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (sampleInterval) clearInterval(sampleInterval);
  if (sampleTimer) clearTimeout(sampleTimer);
});
