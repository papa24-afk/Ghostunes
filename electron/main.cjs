// electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { registerPrivilegedSchemes, setupMediaProtocol } = require('./mediaProtocol.cjs');
const { GhosttunesDatabase } = require('./database.cjs');
const { DownloadManager } = require('./downloadManager.cjs');

// Must register privileged schemes before app is ready
registerPrivilegedSchemes();

// Enable robust native touch event handling & touch drag-and-drop on Windows touchscreen displays
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-touch-drag-drop');
app.commandLine.appendSwitch('disable-pinch');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests,IsolateOrigins,site-per-process');

let mainWindow = null;
let miniPlayerWindow = null;
let database = null;
let downloadManager = null;
let backendProcess = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Storage directories in Electron AppData
const userDataPath = app.getPath('userData');
const mediaDir = path.join(userDataPath, 'media');
const artworkDir = path.join(userDataPath, 'artwork');
const dbDir = path.join(userDataPath, 'database');
const dbPath = path.join(dbDir, 'ghosttunes.db');
const logFile = path.join(userDataPath, 'desktop.log');

function logDesktop(...args) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch {}
  console.log(...args);
}

// Ensure directories exist
[mediaDir, artworkDir, dbDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Ensure local Express backend is active (100% self-contained on user's PC)
async function ensureBackendServer() {
  logDesktop('[Electron Main] Checking if Express backend is running on port 3001...');
  const isRunning = await checkPortInUse(3001);
  if (isRunning) {
    logDesktop('[Electron Main] Express backend is already running on port 3001.');
    return;
  }

  try {
    const isPackaged = app.isPackaged;
    const serverScript = isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js')
      : path.join(__dirname, '..', 'server.js');

    const serverCwd = isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : path.join(__dirname, '..');

    logDesktop('[Electron Main] isPackaged:', isPackaged, 'serverScript:', serverScript);

    if (!fs.existsSync(serverScript)) {
      logDesktop('[Electron Main] Backend script not found at:', serverScript);
      return;
    }

    logDesktop('[Electron Main] Launching self-contained Express backend at:', serverScript);
    const { spawn } = require('child_process');
    backendProcess = spawn(process.execPath, [serverScript], {
      cwd: serverCwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: '3001'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (backendProcess.stdout) {
      backendProcess.stdout.on('data', (data) => {
        logDesktop(`[Backend stdout] ${data.toString().trim()}`);
      });
    }

    if (backendProcess.stderr) {
      backendProcess.stderr.on('data', (data) => {
        logDesktop(`[Backend stderr] ${data.toString().trim()}`);
      });
    }

    backendProcess.on('error', (err) => {
      logDesktop('[Electron Main] Backend process error:', err.message);
    });

    backendProcess.on('exit', (code, signal) => {
      logDesktop(`[Electron Main] Backend process exited with code ${code}, signal ${signal}`);
    });

    // Wait until port 3001 responds (up to 8 seconds)
    for (let i = 0; i < 32; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (await checkPortInUse(3001)) {
        logDesktop('[Electron Main] Internal Express backend is ready and listening on port 3001.');
        break;
      }
    }
  } catch (err) {
    logDesktop('[Electron Main] Failed to spawn internal backend:', err.message);
  }
}

function createWindow() {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const windowOptions = {
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#09090b',
    title: 'Ghosttunes',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  };

  if (isWindows) {
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 38
    };
  } else if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
  } else {
    windowOptions.frame = false;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setAutoHideMenuBar(true);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('ghosttunes:fullscreen-change', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('ghosttunes:fullscreen-change', false);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logDesktop(`[Renderer] (${level}) ${message} [${sourceId}:${line}]`);
  });

  // Safe navigation & external link security
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Load URL
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const distPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(distPath)) {
      mainWindow.loadFile(distPath);
    } else {
      mainWindow.loadURL('http://127.0.0.1:5173');
    }
  }

  // Block DevTools shortcuts to keep developer options hidden
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') ||
      input.key === 'F12'
    ) {
      event.preventDefault();
    }
  });

  // Create clean minimal application menu
  const template = [
    {
      label: 'Ghosttunes',
      submenu: [
        { 
          label: 'About Ghosttunes', 
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Ghosttunes',
              message: 'Ghosttunes 1.0.0\n\nDeveloped by D!g!†@L G#0$†\n\nPremium Music Experience for Windows with synced lyrics, offline downloads, and high-fidelity streaming.',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Library',
      submenu: [
        { 
          label: 'Open Offline Storage Folder', 
          click: () => shell.openPath(mediaDir) 
        },
        { type: 'separator' },
        {
          label: 'Backup & Restore Library...',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ghosttunes:open-backup-modal');
            }
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Setup IPC Handlers
function setupIpcHandlers() {
  database = new GhosttunesDatabase(dbPath);

  downloadManager = new DownloadManager(database, mediaDir, artworkDir, (record) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ghosttunes:download-progress', record);
    }
  });

  // Media protocol
  setupMediaProtocol(database, mediaDir, artworkDir);

  // 1. Tracks & Offline
  ipcMain.handle('ghosttunes:get-local-track', async (_event, trackId) => {
    const track = database.getTrack(trackId);
    if (!track) return null;
    const exists = track.local_audio_path && fs.existsSync(track.local_audio_path);
    return {
      ...track,
      isOfflinePlayable: !!exists,
      local_audio_url: exists ? `http://127.0.0.1:3001/api/stream/${track.id}` : null,
      local_artwork_url: (track.local_artwork_path && fs.existsSync(track.local_artwork_path)) 
        ? `http://127.0.0.1:3001/api/artwork/${track.id}` 
        : track.thumbnail
    };
  });

  ipcMain.handle('ghosttunes:get-downloaded-tracks', async () => {
    const tracks = database.getAllDownloadedTracks();
    return tracks.filter(t => t.local_audio_path && fs.existsSync(t.local_audio_path)).map(t => ({
      ...t,
      isOfflinePlayable: true,
      local_audio_url: `http://127.0.0.1:3001/api/stream/${t.id}`,
      local_artwork_url: (t.local_artwork_path && fs.existsSync(t.local_artwork_path))
        ? `http://127.0.0.1:3001/api/artwork/${t.id}`
        : t.thumbnail
    }));
  });

  ipcMain.handle('ghosttunes:delete-download', async (_event, trackId) => {
    const track = database.getTrack(trackId);
    if (track) {
      if (track.local_audio_path && fs.existsSync(track.local_audio_path)) {
        try { fs.unlinkSync(track.local_audio_path); } catch {}
      }
      if (track.local_artwork_path && fs.existsSync(track.local_artwork_path)) {
        try { fs.unlinkSync(track.local_artwork_path); } catch {}
      }
      database.deleteTrack(trackId);
    }
    return { success: true };
  });

  // 2. Downloads
  ipcMain.handle('ghosttunes:download-track', async (_event, track) => {
    return await downloadManager.downloadTrack(track);
  });

  ipcMain.handle('ghosttunes:pause-download', async (_event, downloadId) => {
    return downloadManager.pauseDownload(downloadId);
  });

  ipcMain.handle('ghosttunes:resume-download', async (_event, downloadId) => {
    return await downloadManager.resumeDownload(downloadId);
  });

  ipcMain.handle('ghosttunes:pause-all-downloads', async () => {
    return downloadManager.pauseAllDownloads();
  });

  ipcMain.handle('ghosttunes:resume-all-downloads', async () => {
    return await downloadManager.resumeAllDownloads();
  });

  ipcMain.handle('ghosttunes:cancel-download', async (_event, downloadId) => {
    return downloadManager.cancelDownload(downloadId);
  });

  ipcMain.handle('ghosttunes:retry-download', async (_event, downloadId) => {
    return await downloadManager.resumeDownload(downloadId);
  });

  ipcMain.handle('ghosttunes:get-downloads', async () => {
    return database.getAllDownloads();
  });

  ipcMain.handle('ghosttunes:download-playlist', async (_event, { playlist, tracks }) => {
    return await downloadManager.downloadPlaylist(playlist, tracks, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ghosttunes:playlist-progress', progress);
      }
    });
  });

  ipcMain.handle('ghosttunes:pause-playlist-download', async (_event, playlistId) => {
    return downloadManager.pausePlaylistDownload(playlistId);
  });

  ipcMain.handle('ghosttunes:resume-playlist-download', async (_event, playlistId) => {
    return downloadManager.resumePlaylistDownload(playlistId);
  });

  ipcMain.handle('ghosttunes:cancel-playlist-download', async (_event, playlistId) => {
    return downloadManager.cancelPlaylistDownload(playlistId);
  });

  ipcMain.handle('ghosttunes:get-storage-stats', async () => {
    return database.getStorageStats();
  });

  // 3. Lyrics Cache
  ipcMain.handle('ghosttunes:cache-lyrics', async (_event, { trackId, lyrics, format, plain }) => {
    database.cacheLyrics(trackId, lyrics, format, plain);
    return { success: true };
  });

  ipcMain.handle('ghosttunes:get-cached-lyrics', async (_event, trackId) => {
    return database.getCachedLyrics(trackId);
  });

  // 4. Local File Import
  ipcMain.handle('ghosttunes:import-local-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Music Files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg'] }
      ]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { imported: 0, tracks: [] };
    }

    const importedTracks = [];
    for (const srcPath of result.filePaths) {
      try {
        const stats = fs.statSync(srcPath);
        const fileName = path.basename(srcPath, path.extname(srcPath));
        const ext = path.extname(srcPath);
        const safeId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const destPath = path.join(mediaDir, `${safeId}${ext}`);

        // Copy into managed storage
        fs.copyFileSync(srcPath, destPath);

        // Derive artist and title from filename
        let title = fileName;
        let artist = 'Local Artist';
        if (fileName.includes(' - ')) {
          const parts = fileName.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }

        const trackData = {
          id: safeId,
          title,
          artist,
          album: 'Local Music',
          duration: 0,
          thumbnail: '',
          local_audio_path: destPath,
          local_artwork_path: null,
          file_size: stats.size,
          mime_type: 'audio/mpeg',
          source: 'local_import',
          offline_available: true
        };

        database.upsertTrack(trackData);
        importedTracks.push({
          ...trackData,
          isOfflinePlayable: true,
          local_audio_url: `http://127.0.0.1:3001/api/stream/${safeId}`
        });
      } catch (err) {
        console.error('[Import] Failed to import:', srcPath, err);
      }
    }

    return { imported: importedTracks.length, tracks: importedTracks };
  });

  ipcMain.handle('ghosttunes:open-folder', async (_event, type) => {
    const targetDir = type === 'artwork' ? artworkDir : mediaDir;
    shell.openPath(targetDir);
    return { success: true };
  });

  // 4b. Song DNA Intelligence
  ipcMain.handle('ghosttunes:save-song-dna', async (_event, dna) => {
    database.saveSongDna(dna);
    return { success: true };
  });

  ipcMain.handle('ghosttunes:get-song-dna', async (_event, trackId) => {
    return database.getSongDna(trackId);
  });

  ipcMain.handle('ghosttunes:get-all-song-dna', async () => {
    return database.getAllSongDna();
  });

  // 4c. Music Memory (Listening Graph)
  ipcMain.handle('ghosttunes:record-play', async (_event, entry) => {
    return database.recordPlay(entry);
  });

  ipcMain.handle('ghosttunes:get-listening-history', async (_event, { limit, offset } = {}) => {
    return database.getListeningHistory(limit || 100, offset || 0);
  });

  ipcMain.handle('ghosttunes:get-listening-stats', async () => {
    return database.getListeningStats();
  });

  ipcMain.handle('ghosttunes:clear-listening-history', async (_event, options) => {
    return database.clearListeningHistory(options);
  });

  ipcMain.handle('ghosttunes:export-listening-data', async () => {
    return database.exportListeningData();
  });

  // 5. Window Controls
  ipcMain.on('ghosttunes:window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('ghosttunes:window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('ghosttunes:window-close', () => {
    mainWindow?.close();
  });

  ipcMain.handle('ghosttunes:is-maximized', () => {
    return !!mainWindow?.isMaximized();
  });

  ipcMain.handle('ghosttunes:toggle-fullscreen', () => {
    if (!mainWindow) return false;
    const nextState = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextState);
    return nextState;
  });

  ipcMain.handle('ghosttunes:is-fullscreen', () => {
    return !!mainWindow?.isFullScreen();
  });

  // 6. Floating Desktop Mini-Player Widget
  function createMiniWidgetWindow() {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.show();
      miniPlayerWindow.focus();
      return;
    }

    let initialBounds = { width: 440, height: 210 };
    try {
      if (database) {
        const saved = database.getSetting('mini_player_bounds');
        if (saved) {
          const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
          if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            const display = screen.getDisplayNearestPoint({ x: parsed.x, y: parsed.y });
            if (display && display.bounds) {
              const isInside = (
                parsed.x >= display.bounds.x - 50 &&
                parsed.x <= display.bounds.x + display.bounds.width - 100 &&
                parsed.y >= display.bounds.y - 50 &&
                parsed.y <= display.bounds.y + display.bounds.height - 100
              );
              if (isInside) {
                initialBounds = {
                  x: parsed.x,
                  y: parsed.y,
                  width: Math.min(540, Math.max(380, parsed.width || 440)),
                  height: Math.min(260, Math.max(180, parsed.height || 210))
                };
              }
            }
          }
        }
      }
    } catch (e) {
      logDesktop('[MiniWidget] Error restoring bounds:', e.message);
    }

    miniPlayerWindow = new BrowserWindow({
      ...initialBounds,
      minWidth: 380,
      minHeight: 180,
      maxWidth: 540,
      maxHeight: 260,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      title: 'Ghosttunes Widget',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false
      }
    });

    const saveBounds = () => {
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed() && database) {
        try {
          const bounds = miniPlayerWindow.getBounds();
          database.setSetting('mini_player_bounds', JSON.stringify(bounds));
        } catch {}
      }
    };
    miniPlayerWindow.on('moved', saveBounds);
    miniPlayerWindow.on('resized', saveBounds);

    miniPlayerWindow.setAlwaysOnTop(true, 'screen-saver');

    if (isDev && process.env.VITE_DEV_SERVER_URL) {
      miniPlayerWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?mode=mini-widget`);
    } else {
      const distPath = path.join(__dirname, '..', 'dist', 'index.html');
      if (fs.existsSync(distPath)) {
        miniPlayerWindow.loadFile(distPath, { query: { mode: 'mini-widget' } });
      } else {
        miniPlayerWindow.loadURL('http://127.0.0.1:5173/?mode=mini-widget');
      }
    }

    miniPlayerWindow.on('closed', () => {
      miniPlayerWindow = null;
      mainWindow?.webContents.send('ghosttunes:mini-widget-closed');
    });

    miniPlayerWindow.once('ready-to-show', () => {
      miniPlayerWindow?.show();
      mainWindow?.webContents.send('ghosttunes:request-state-sync');
    });
  }

  ipcMain.handle('ghosttunes:toggle-mini-widget', () => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.close();
      miniPlayerWindow = null;
      return false;
    } else {
      createMiniWidgetWindow();
      return true;
    }
  });

  ipcMain.handle('ghosttunes:is-mini-widget-open', () => {
    return !!(miniPlayerWindow && !miniPlayerWindow.isDestroyed());
  });

  ipcMain.handle('ghosttunes:widget-toggle-pin', () => {
    if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) return false;
    const isAlways = miniPlayerWindow.isAlwaysOnTop();
    miniPlayerWindow.setAlwaysOnTop(!isAlways, 'screen-saver');
    return !isAlways;
  });

  ipcMain.on('ghosttunes:broadcast-playback-state', (_event, state) => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.webContents.send('ghosttunes:sync-state', state);
    }
  });

  ipcMain.on('ghosttunes:widget-action', (_event, action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ghosttunes:execute-widget-action', action);
    }
  });

  ipcMain.on('ghosttunes:expand-to-main', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.close();
    }
  });

  ipcMain.on('ghosttunes:close-mini-widget', () => {
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.close();
    }
  });
}

app.whenReady().then(async () => {
  await ensureBackendServer();
  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (database) database.close();
  if (backendProcess && backendProcess.pid) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${backendProcess.pid} /T /F`);
      } else {
        backendProcess.kill();
      }
    } catch {}
  }
});
