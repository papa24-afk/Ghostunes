// YouTube Music sign-in for the desktop app.
//
// Opens the official Google sign-in page in its own window (separate browser storage from the app).
// Once you land on music.youtube.com signed in, the session cookies and page IDs are saved encrypted
// with the OS keychain (Electron safeStorage) and handed to the local server, which uses them to read
// your playlists and liked songs. Nothing is sent anywhere else. Sign out deletes it all.
const path = require('path');
const fs = require('fs');
const http = require('http');
const { addSignInNav } = require('./signInNav.cjs');
const { app, BrowserWindow, ipcMain, safeStorage, session } = require('electron');


// Use the real Chrome engine's identity, only dropping the "Electron" and app tags. Pretending to
// be a different Chrome version makes Google refuse sign-in ("Something went wrong").
function realChromeUA(ses) {
  return ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ ghosttunes\/\S+/i, '');
}

const PARTITION = 'persist:ytm-signin';
// Same address as the phone app (and Metrolist), which signs straight into YouTube Music. The old
// youtube.com/signin hand-off page failed in the desktop app ("There was an issue signing you in").
const SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent('https://music.youtube.com');
// Only Google's own sign-in and YouTube pages may load in the sign-in window.
const ALLOWED_HOSTS = [/(^|\.)google\.com$/, /(^|\.)youtube\.com$/, /(^|\.)gstatic\.com$/, /(^|\.)googleusercontent\.com$/, /(^|\.)google\.[a-z.]+$/];

const storeFile = () => path.join(app.getPath('userData'), 'ytm-account.bin');

function allowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some(re => re.test(u.hostname));
  } catch {
    return false;
  }
}

function save(data) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this PC');
  fs.writeFileSync(storeFile(), safeStorage.encryptString(JSON.stringify(data)));
}

function load() {
  try {
    if (!fs.existsSync(storeFile()) || !safeStorage.isEncryptionAvailable()) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(storeFile())));
  } catch {
    return null;
  }
}

function serverRequest(method, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: 3001, path: '/api/ytm/auth', method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 5000,
    }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end(payload);
  });
}

/** Give the saved session to the local server (it keeps it in memory only). Retries while the server starts. */
async function handToServer(data, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    if (await serverRequest('POST', data)) return true;
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}

let signInWindow = null;

function openSignIn(parent) {
  if (signInWindow && !signInWindow.isDestroyed()) { signInWindow.focus(); return Promise.resolve({ ok: false, reason: 'already_open' }); }
  return new Promise((resolve) => {
    const ses = session.fromPartition(PARTITION);
    ses.setUserAgent(realChromeUA(ses));
    signInWindow = new BrowserWindow({
      width: 480, height: 720, parent, modal: false, autoHideMenuBar: true,
      title: 'Sign in to YouTube Music',
      webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    const win = signInWindow;
    addSignInNav(win); // Back / Forward / Reload / Close
    let finished = false;
    const done = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
      if (!win.isDestroyed()) win.close();
    };

    // Keep the window on Google/YouTube pages only.
    win.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) e.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) win.loadURL(url);
      return { action: 'deny' };
    });

    const check = async () => {
      const url = win.webContents.getURL();
      let host = '';
      try { host = new URL(url).hostname; } catch {}
      if (host !== 'music.youtube.com') return;
      const cookies = await ses.cookies.get({ url: 'https://music.youtube.com' });
      if (!cookies.some(c => c.name === 'SAPISID' || c.name === '__Secure-3PAPISID')) return;
      const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      let ids = {};
      try {
        ids = await win.webContents.executeJavaScript(
          'JSON.parse(JSON.stringify({ v: window.ytcfg && ytcfg.get("VISITOR_DATA"), d: window.ytcfg && ytcfg.get("DATASYNC_ID"), s: window.ytcfg && ytcfg.get("SESSION_INDEX") }))', true);
      } catch {}
      const data = { cookie, visitorData: ids?.v || '', dataSyncId: ids?.d || '', authUser: String(ids?.s ?? '0') };
      try {
        save(data);
      } catch (err) {
        done({ ok: false, reason: err.message });
        return;
      }
      const handed = await handToServer(data, 3);
      done({ ok: handed, reason: handed ? undefined : 'server_unreachable' });
    };
    // The network replaced the site's security certificate (school/work firewalls do this): say so.
    win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (isMainFrame && code <= -200 && code > -300) done({ ok: false, reason: 'network_blocked' });
    });
    win.webContents.on('did-finish-load', check);
    win.webContents.on('did-navigate-in-page', check);
    win.on('closed', () => { signInWindow = null; done({ ok: false, reason: 'closed' }); });
    win.loadURL(SIGN_IN_URL);
  });
}

async function signOut() {
  try { fs.rmSync(storeFile(), { force: true }); } catch {}
  try { await session.fromPartition(PARTITION).clearStorageData(); } catch {}
  await serverRequest('DELETE');
  return { ok: true };
}

function setupYtmAccount(getWindow) {
  ipcMain.handle('ghosttunes:ytm-sign-in', () => openSignIn(getWindow()));
  ipcMain.handle('ghosttunes:ytm-sign-out', () => signOut());
  // On start: if you signed in before, give the session to the server again.
  const saved = load();
  if (saved) handToServer(saved);
}

module.exports = { setupYtmAccount };
