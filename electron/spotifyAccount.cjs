// Spotify sign-in for the desktop app.
//
// You sign in on Spotify's own page in its own window (separate browser storage from the app).
// To read your library we open Spotify's web player invisibly in that same storage and catch the
// short-lived access token it fetches for itself (so we never need Spotify's private secrets, and it
// keeps working when they rotate them). The token goes to the local server in memory only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { addSignInNav } = require('./signInNav.cjs');
const { app, BrowserWindow, ipcMain, session } = require('electron');


// Use the real Chrome engine's identity, only dropping the "Electron" and app tags. Pretending to
// be a different Chrome version makes Google refuse sign-in ("Something went wrong").
function realChromeUA(ses) {
  return ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ ghosttunes\/\S+/i, '');
}

const PARTITION = 'persist:spotify-signin';
const SIGN_IN_URL = 'https://accounts.spotify.com/en/login?allow_password=1'; // the plain email + password form (as Echo)
// Spotify, its CDNs, and the Google / Apple / Facebook pages Spotify's sign-in can hand off to.
const ALLOWED_HOSTS = [/(^|\.)spotify\.com$/, /(^|\.)scdn\.co$/, /(^|\.)spotifycdn\.com$/, /(^|\.)google\.[a-z.]+$/, /(^|\.)gstatic\.com$/,
  /(^|\.)googleusercontent\.com$/, /(^|\.)apple\.com$/, /(^|\.)facebook\.com$/, /(^|\.)fbcdn\.net$/];

function allowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some(re => re.test(u.hostname));
  } catch {
    return false;
  }
}

const ses = () => {
  const s = session.fromPartition(PARTITION);
  s.setUserAgent(realChromeUA(s));
  return s;
};

async function hasSession() {
  const cookies = await ses().cookies.get({ url: 'https://open.spotify.com', name: 'sp_dc' });
  return cookies.length > 0;
}

function serverRequest(method, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = http.request({
      host: '127.0.0.1', port: 3001, path: '/api/spotify-account/token', method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 5000,
    }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end(payload);
  });
}

// The web player's own library requests (address, method, body; nothing personal) are remembered so
// later refreshes are quick; Spotify throttles its public Web API for this token, so the local server
// resends these instead. The client token lives in memory only.
const OPS = ['profileAttributes', 'libraryV3', 'fetchLibraryTracks', 'fetchPlaylist', 'home'];
const SAMPLE_PLAYLIST = '37i9dQZF1DXcBWIGoYBM5M'; // a public playlist, opened once to learn how a playlist is asked for
const PATHFINDER = /^https:\/\/[a-z0-9.-]+\.spotify\.com\/pathfinder\/v\d+\/query/;
const clientState = { clientToken: null, appVersion: null };
const templatesFile = () => path.join(app.getPath('userData'), 'spotify-web.json');
let templates = null;

function loadTemplates() {
  if (templates) return templates;
  try { templates = JSON.parse(fs.readFileSync(templatesFile(), 'utf8')) || {}; } catch { templates = {}; }
  return templates;
}

function saveTemplates() {
  try { fs.writeFileSync(templatesFile(), JSON.stringify(templates)); } catch {}
}

/** A web player request -> { op, url, method, body }, or null. */
function templateFrom(url, method, postData) {
  try {
    let body;
    if (method === 'POST') body = JSON.parse(postData || '');
    else {
      const u = new URL(url);
      body = { operationName: u.searchParams.get('operationName') };
      for (const k of ['variables', 'extensions']) if (u.searchParams.get(k)) body[k] = JSON.parse(u.searchParams.get(k));
    }
    const op = body?.operationName;
    return typeof op === 'string' ? { op, url: url.split('?')[0], method: method === 'POST' ? 'POST' : 'GET', body } : null;
  } catch {
    return null;
  }
}

const HOME_SCRIPT = fs.readFileSync(path.join(__dirname, 'spotify-home-scrape.js'), 'utf8');

/** Read the home page's shelves (titles and playlist cards) once they've rendered; up to ~12 s. */
async function readHomePage(win, stopped) {
  let best = [];
  let lastCount = -1;
  for (let i = 0; i < 12 && !stopped() && !win.isDestroyed(); i++) {
    await new Promise(r => setTimeout(r, 1000));
    let shelves = [];
    try { shelves = JSON.parse(await win.webContents.executeJavaScript(HOME_SCRIPT, true)) || []; } catch {}
    if (shelves.length > best.length) best = shelves;
    if (shelves.length && shelves.length === lastCount) break;
    lastCount = shelves.length;
  }
  return best;
}

/**
 * Load Spotify's web player invisibly and watch its own requests: its token, and the library
 * requests we don't know yet (visiting Liked Songs and a playlist if needed).
 */
function tokenFromWebPlayer() {
  const known = loadTemplates();
  const wanted = OPS.filter(op => !known[op]);
  return new Promise((resolve) => {
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
    const dbg = win.webContents.debugger;
    const tokenRequests = new Set();
    const pending = new Map(); // requestId -> template
    const maybeHome = new Set();
    let homeShelves = 0;
    let token = null;
    let home = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { dbg.detach(); } catch {}
      if (!win.isDestroyed()) win.destroy();
      resolve(token && { ...token, clientToken: clientState.clientToken, appVersion: clientState.appVersion, templates: { ...templates }, home });
    };
    const timer = setTimeout(finish, 45000);
    const until = async (check, ms) => { for (let t = 0; t < ms && !finished && !check(); t += 250) await new Promise(r => setTimeout(r, 250)); };
    try {
      dbg.attach('1.3');
    } catch {
      finish();
      return;
    }
    dbg.on('message', async (_e, method, params) => {
      try {
        if (method === 'Network.requestWillBeSent' && PATHFINDER.test(params.request?.url || '')) {
          const h = Object.fromEntries(Object.entries(params.request.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
          if (h['client-token']) clientState.clientToken = h['client-token'];
          if (h['spotify-app-version']) clientState.appVersion = h['spotify-app-version'];
          let post = params.request.postData;
          if (!post && params.request.hasPostData) post = (await dbg.sendCommand('Network.getRequestPostData', { requestId: params.requestId })).postData;
          const t = templateFrom(params.request.url, params.request.method, post);
          if (t) pending.set(params.requestId, t);
        } else if (method === 'Network.responseReceived') {
          const url = params.response?.url || '';
          if (/^https:\/\/open\.spotify\.com\/api\/token/.test(url)) tokenRequests.add(params.requestId);
          const t = pending.get(params.requestId);
          if (t && params.response.status === 200 && OPS.includes(t.op)) {
            templates[t.op] = { url: t.url, method: t.method, body: t.body };
            saveTemplates();
          } else if (t && params.response.status === 200) {
            maybeHome.add(params.requestId);
          }
        } else if (method === 'Network.loadingFinished' && maybeHome.has(params.requestId)) {
          // The home page's request has changed names over time: know it by what it returns (shelves of playlists).
          const t = pending.get(params.requestId);
          const { body } = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
          const shelves = (body.match(/"sectionItems"/g) || []).length;
          if (t && shelves > homeShelves && body.includes('spotify:playlist:')) {
            homeShelves = shelves;
            templates.home = { url: t.url, method: t.method, body: t.body };
            saveTemplates();
          }
        } else if (method === 'Network.loadingFinished' && tokenRequests.has(params.requestId)) {
          const { body } = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
          const j = JSON.parse(body);
          if (j.accessToken) token = { accessToken: j.accessToken, expiresAt: Number(j.accessTokenExpirationTimestampMs) || Date.now() + 3000000, anonymous: Boolean(j.isAnonymous) };
        }
      } catch {}
    });
    (async () => {
      await dbg.sendCommand('Network.enable', { maxPostDataSize: 65536 });
      win.loadURL('https://open.spotify.com/').catch(() => {});
      await until(() => token && clientState.clientToken && wanted.filter(op => op !== 'fetchLibraryTracks' && op !== 'fetchPlaylist' && op !== 'home').every(op => templates[op]), 15000);
      if (!token || token.anonymous) return finish();
      home = await readHomePage(win, () => finished);
      for (const [op, page] of [['fetchLibraryTracks', 'collection/tracks'], ['fetchPlaylist', `playlist/${SAMPLE_PLAYLIST}`]]) {
        if (finished || templates[op]) continue;
        win.loadURL(`https://open.spotify.com/${page}`).catch(() => {});
        await until(() => templates[op], 12000);
      }
      finish();
    })().catch(finish);
  });
}

let refreshTimer = null;

/** Get a fresh token from the web player and give it to the server; schedule the next refresh. */
async function refreshToken() {
  clearTimeout(refreshTimer);
  if (!(await hasSession())) return { ok: false, reason: 'signed_out' };
  const t = await tokenFromWebPlayer();
  if (!t) {
    refreshTimer = setTimeout(refreshToken, 5 * 60 * 1000); // try again soon
    return { ok: false, reason: 'token_unavailable' };
  }
  if (t.anonymous) return { ok: false, reason: 'signed_out' };
  for (let i = 0; i < 20; i++) {
    if (await serverRequest('POST', { accessToken: t.accessToken, expiresAt: t.expiresAt, clientToken: t.clientToken, appVersion: t.appVersion, templates: t.templates, home: t.home })) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  refreshTimer = setTimeout(refreshToken, Math.max(60000, t.expiresAt - Date.now() - 5 * 60 * 1000));
  return { ok: true };
}

let signInWindow = null;

function openSignIn(parent) {
  if (signInWindow && !signInWindow.isDestroyed()) { signInWindow.focus(); return Promise.resolve({ ok: false, reason: 'already_open' }); }
  return new Promise((resolve) => {
    ses();
    signInWindow = new BrowserWindow({
      width: 480, height: 760, parent, autoHideMenuBar: true, title: 'Sign in to Spotify',
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
    win.webContents.on('will-navigate', (e, url) => { if (!allowed(url)) e.preventDefault(); });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) win.loadURL(url);
      return { action: 'deny' };
    });
    const check = async () => {
      if (finished || !(await hasSession())) return;
      done(await refreshToken());
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
  clearTimeout(refreshTimer);
  try { await ses().clearStorageData(); } catch {}
  clientState.clientToken = null;
  await serverRequest('DELETE');
  return { ok: true };
}

function setupSpotifyAccount(getWindow) {
  ipcMain.handle('ghosttunes:spotify-sign-in', () => openSignIn(getWindow()));
  ipcMain.handle('ghosttunes:spotify-sign-out', () => signOut());
  // On start: if you signed in before, get a fresh token in the background.
  hasSession().then(yes => { if (yes) refreshToken(); }).catch(() => {});
}

module.exports = { setupSpotifyAccount };
