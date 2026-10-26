// electron/autoUpdaterManager.cjs
const { app, ipcMain, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const https = require('https');

class AutoUpdaterManager {
  constructor(logger = console.log) {
    this.logger = logger;
    this.mainWindow = null;
    this.periodicTimer = null;
    this.isDownloading = false;

    this.state = {
      status: 'idle', // 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'offline' | 'error'
      currentVersion: app.getVersion(),
      availableVersion: null,
      releaseDate: null,
      releaseNotes: null,
      progress: null, // { percent, bytesPerSecond, transferred, total }
      error: null,
      lastChecked: null
    };

    this.setupAutoUpdater();
    this.setupIpc();
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  log(...args) {
    if (typeof this.logger === 'function') {
      this.logger('[AutoUpdater]', ...args);
    }
  }

  broadcastState() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ghosttunes:updater-status', { ...this.state });
    }
  }

  setState(newPartialState) {
    this.state = {
      ...this.state,
      ...newPartialState,
      currentVersion: app.getVersion()
    };
    this.log('State updated:', this.state.status, this.state.error || this.state.availableVersion || '');
    this.broadcastState();
  }

  setupAutoUpdater() {
    autoUpdater.logger = {
      info: (...args) => this.log('[Info]', ...args),
      warn: (...args) => this.log('[Warn]', ...args),
      error: (...args) => this.log('[Error]', ...args)
    };

    // User must consent before downloading and installing
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    // Set GitHub Feed
    try {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'papa24-afk',
        repo: 'Ghostunes'
      });
    } catch (e) {
      this.log('Error setting feed URL:', e.message);
    }

    // AutoUpdater Event Listeners
    autoUpdater.on('checking-for-update', () => {
      this.setState({ status: 'checking', error: null });
    });

    autoUpdater.on('update-available', (info) => {
      this.isDownloading = false;
      this.setState({
        status: 'available',
        availableVersion: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        lastChecked: new Date().toISOString(),
        error: null
      });

      // Trigger Native Windows System Desktop Notification
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Ghosttunes Update Available',
            body: `Version ${info.version} is available. Click here or open Settings to install.`,
            silent: false
          });
          notif.on('click', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show();
              this.mainWindow.focus();
              this.mainWindow.webContents.send('ghosttunes:open-about-modal');
            }
          });
          notif.show();
        }
      } catch (err) {
        this.log('Native notification error:', err.message);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      this.isDownloading = false;
      this.setState({
        status: 'up-to-date',
        availableVersion: null,
        lastChecked: new Date().toISOString(),
        error: null
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      this.isDownloading = true;
      this.setState({
        status: 'downloading',
        progress: {
          percent: Math.round(progressObj.percent * 10) / 10,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total
        }
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.isDownloading = false;
      this.setState({
        status: 'downloaded',
        availableVersion: info.version,
        progress: { percent: 100 },
        error: null
      });

      // Trigger Native Windows Notification
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Ghosttunes Update Ready',
            body: `Version ${info.version} has been downloaded. Restart Ghosttunes to finish installing.`,
            silent: false
          });
          notif.on('click', () => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.show();
              this.mainWindow.focus();
            }
          });
          notif.show();
        }
      } catch (err) {
        this.log('Native notification error:', err.message);
      }
    });

    autoUpdater.on('error', (err) => {
      this.isDownloading = false;
      const errMsg = err ? (err.message || String(err)) : 'Unknown updater error';
      this.log('Updater error event:', errMsg);

      const isNetwork = /network|timeout|offline|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|internet/i.test(errMsg);
      this.setState({
        status: isNetwork ? 'offline' : 'error',
        error: isNetwork ? 'Unable to reach the update server. Please check your network connection.' : errMsg,
        lastChecked: new Date().toISOString()
      });
    });
  }

  setupIpc() {
    ipcMain.handle('ghosttunes:updater-get-state', () => {
      return { ...this.state };
    });

    ipcMain.handle('ghosttunes:updater-check', async () => {
      return await this.checkForUpdates(true);
    });

    ipcMain.handle('ghosttunes:updater-download', async () => {
      return await this.startDownload();
    });

    ipcMain.handle('ghosttunes:updater-install', () => {
      return this.installNow();
    });

    ipcMain.handle('ghosttunes:updater-defer', () => {
      this.log('User deferred update.');
      this.setState({ status: 'idle' });
      return { success: true };
    });
  }

  async checkForUpdates(isManual = false) {
    this.log(`Initiating update check (manual: ${isManual}, packaged: ${app.isPackaged})...`);

    if (this.isDownloading) {
      this.log('Download already in progress. Skipping check.');
      return { ...this.state };
    }

    this.setState({ status: 'checking', error: null });

    // In packaged app, run electron-updater natively
    if (app.isPackaged) {
      try {
        await autoUpdater.checkForUpdates();
      } catch (err) {
        this.log('checkForUpdates exception:', err.message);
        const isNetwork = /network|timeout|offline|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(err.message);
        this.setState({
          status: isNetwork ? 'offline' : 'error',
          error: isNetwork ? 'Unable to reach the update server. Please check your network connection.' : err.message,
          lastChecked: new Date().toISOString()
        });
      }
      return { ...this.state };
    }

    // In development / unpackaged environment, query GitHub Releases API directly
    // so update discovery and UI states can be verified without packaging every time
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/papa24-afk/Ghostunes/releases/latest',
        method: 'GET',
        headers: {
          'User-Agent': 'Ghosttunes-App-Client',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const release = JSON.parse(body);
              const latestTag = (release.tag_name || '').replace(/^v/, '');
              const currentVersion = app.getVersion();

              this.log(`Development check: current=${currentVersion}, remote=${latestTag}`);

              if (latestTag && this.compareVersions(latestTag, currentVersion) > 0) {
                this.setState({
                  status: 'available',
                  availableVersion: latestTag,
                  releaseDate: release.published_at,
                  releaseNotes: release.body,
                  lastChecked: new Date().toISOString(),
                  error: null
                });
              } else {
                this.setState({
                  status: 'up-to-date',
                  availableVersion: null,
                  lastChecked: new Date().toISOString(),
                  error: null
                });
              }
            } catch (parseErr) {
              this.setState({
                status: 'error',
                error: 'Invalid response from update server.',
                lastChecked: new Date().toISOString()
              });
            }
          } else if (res.statusCode === 404) {
            // No releases published yet
            this.setState({
              status: 'up-to-date',
              availableVersion: null,
              lastChecked: new Date().toISOString(),
              error: null
            });
          } else {
            this.setState({
              status: 'error',
              error: `Update check failed (HTTP ${res.statusCode})`,
              lastChecked: new Date().toISOString()
            });
          }
          resolve({ ...this.state });
        });
      });

      req.on('error', (netErr) => {
        this.log('Dev network check error:', netErr.message);
        this.setState({
          status: 'offline',
          error: 'Unable to reach the update server. Please check your network connection.',
          lastChecked: new Date().toISOString()
        });
        resolve({ ...this.state });
      });

      req.setTimeout(8000, () => {
        req.destroy();
        this.setState({
          status: 'offline',
          error: 'Connection to update server timed out.',
          lastChecked: new Date().toISOString()
        });
        resolve({ ...this.state });
      });

      req.end();
    });
  }

  async startDownload() {
    this.log('User requested update download.');
    if (this.state.status !== 'available' && this.state.status !== 'error') {
      return { success: false, message: 'No update available to download.' };
    }

    this.isDownloading = true;
    this.setState({ status: 'downloading', progress: { percent: 0 } });

    if (app.isPackaged) {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (err) {
        this.isDownloading = false;
        this.setState({
          status: 'error',
          error: `Download failed: ${err.message}`
        });
        return { success: false, error: err.message };
      }
    } else {
      // In dev mode, simulate realistic progress for testing renderer UI
      this.log('Simulating update download in dev mode...');
      let simulated = 0;
      const interval = setInterval(() => {
        simulated += 15;
        if (simulated >= 100) {
          clearInterval(interval);
          this.isDownloading = false;
          this.setState({
            status: 'downloaded',
            progress: { percent: 100 },
            availableVersion: this.state.availableVersion || '1.0.1'
          });
        } else {
          this.setState({
            status: 'downloading',
            progress: { percent: simulated }
          });
        }
      }, 300);
      return { success: true };
    }
  }

  installNow() {
    this.log('Executing restart and install...');
    this.setState({ status: 'restarting' });

    if (app.isPackaged) {
      // quitAndInstall(isSilent, isForceRunAfter)
      // isSilent: false (shows standard NSIS installer progress), isForceRunAfter: true (re-launches Ghosttunes)
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true);
      }, 500);
    } else {
      this.log('In dev mode: simulated quitAndInstall called.');
      setTimeout(() => {
        this.setState({ status: 'idle' });
      }, 2000);
    }
    return { success: true };
  }

  startPeriodicChecks(intervalMinutes = 30) {
    if (this.periodicTimer) clearInterval(this.periodicTimer);

    // Initial check 5 seconds after launch once window and audio engine are ready
    setTimeout(() => {
      this.checkForUpdates(false).catch(err => this.log('Initial check failed:', err.message));
    }, 5000);

    // Periodic background check every N minutes
    const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;
    this.periodicTimer = setInterval(() => {
      this.checkForUpdates(false).catch(err => this.log('Periodic check failed:', err.message));
    }, intervalMs);
  }

  stopPeriodicChecks() {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
  }

  compareVersions(v1, v2) {
    const parts1 = v1.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = v2.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const len = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < len; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }
}

module.exports = { AutoUpdaterManager };
