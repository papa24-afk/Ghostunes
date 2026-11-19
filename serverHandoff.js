// Tap / flick to transfer: moves playback between the phone and the desktop app.
// The server runs on the PC, so every timestamp here is PC time.
import crypto from 'crypto';
import os from 'os';

const PRESENCE_TTL_MS = 8000;
const HANDOFF_TTL_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 15000;
const MAX_QUEUE = 300;
const YT_ID = /^[\w-]{11}$/;

const desktopClients = new Set();
const handoffs = new Map(); // id -> { id, status, error, createdAt, updatedAt }
let presence = null; // { nowPlaying, stampedAt }

function cleanString(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isRemoteUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

export function sanitizeTrack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanString(raw.id, 128);
  if (!id) return null;
  const durationSeconds = Number(raw.durationSeconds);
  // Device-local data (offline files, file:// or custom-protocol artwork) never leaves the device.
  const thumbnail = isRemoteUrl(raw.thumbnail)
    ? raw.thumbnail.slice(0, 2048)
    : YT_ID.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
  const track = {
    id,
    title: cleanString(raw.title) || 'Unknown Title',
    artist: cleanString(raw.artist) || 'Unknown Artist',
    album: cleanString(raw.album),
    duration: cleanString(raw.duration, 16) || '0:00',
    thumbnail,
  };
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) track.durationSeconds = durationSeconds;
  if (cleanString(raw.artistId, 128)) track.artistId = cleanString(raw.artistId, 128);
  if (isRemoteUrl(raw.artist_thumbnail)) track.artist_thumbnail = raw.artist_thumbnail.slice(0, 2048);
  if (cleanString(raw.source, 32)) track.source = cleanString(raw.source, 32);
  return track;
}

/** Validates a playback snapshot and caps the queue at MAX_QUEUE tracks around the current one. */
export function sanitizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const track = sanitizeTrack(raw.track);
  if (!track) return null;

  let queue = Array.isArray(raw.queue) ? raw.queue.map(sanitizeTrack).filter(Boolean) : [];
  let queueIndex = Number.isInteger(raw.queueIndex) ? raw.queueIndex : -1;
  if (queue[queueIndex]?.id !== track.id) queueIndex = queue.findIndex(item => item.id === track.id);
  if (queueIndex < 0) {
    queue = [track, ...queue];
    queueIndex = 0;
  }
  if (queue.length > MAX_QUEUE) {
    const start = Math.max(0, Math.min(queueIndex - Math.floor(MAX_QUEUE / 2), queue.length - MAX_QUEUE));
    queue = queue.slice(start, start + MAX_QUEUE);
    queueIndex -= start;
  }

  const position = Number(raw.position);
  return {
    track,
    queue,
    queueIndex,
    position: Number.isFinite(position) && position > 0 ? position : 0,
    isPlaying: Boolean(raw.isPlaying),
    deviceName: cleanString(raw.deviceName, 60) || 'your phone',
  };
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let delivered = 0;
  for (const client of desktopClients) {
    try {
      client.write(payload);
      delivered += 1;
    } catch {
      desktopClients.delete(client);
    }
  }
  return delivered;
}

function prune(now = Date.now()) {
  for (const [id, entry] of handoffs) {
    if (now - entry.createdAt > HANDOFF_TTL_MS) handoffs.delete(id);
  }
}

function currentPresence(now = Date.now()) {
  if (!presence || now - presence.stampedAt > PRESENCE_TTL_MS) return null;
  return presence;
}

// A friendly PC name: the laptop/desktop model ("HP Laptop 14-dk1xxx" -> "HP Laptop 14"), else the hostname.
let pcName = os.hostname();
if (process.platform === 'win32') {
  // The PC's model ("HP Laptop 14-dk1xxx" -> "HP Laptop 14"). Read from the registry first (instant, no
  // PowerShell, which can be slow or hang on some PCs), then PowerShell as a fallback.
  const clean = (raw) => String(raw || '').trim().replace(/[-\s]*[a-z0-9]*x{2,}[a-z0-9]*$/i, '').trim();
  const usable = (m) => m && !/system product name|to be filled|default string|^none$/i.test(m);
  import('child_process').then(({ execFile }) => {
    execFile('reg', ['query', String.raw`HKLM\HARDWARE\DESCRIPTION\System\BIOS`, '/v', 'SystemProductName'], { windowsHide: true, timeout: 4000 }, (err, out) => {
      const m = clean(String(out || '').match(/SystemProductName\s+REG_SZ\s+(.+)/)?.[1]);
      if (!err && usable(m)) { pcName = m; return; }
      execFile('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystem).Model'], { windowsHide: true, timeout: 8000 }, (err2, out2) => {
        const model = clean(out2);
        if (!err2 && usable(model)) pcName = model;
      });
    });
  }).catch(() => {});
}
export const getPcName = () => pcName;

/** For the device list: is the desktop app connected, and what is it playing right now. */
export function getDesktop() {
  const now = Date.now();
  const current = currentPresence(now);
  let nowPlaying = null;
  if (current?.nowPlaying) {
    const elapsed = current.nowPlaying.isPlaying ? (now - current.stampedAt) / 1000 : 0;
    const limit = current.nowPlaying.track.durationSeconds;
    const position = current.nowPlaying.position + elapsed;
    nowPlaying = { ...current.nowPlaying, position: limit ? Math.min(position, limit) : position };
  }
  return { online: desktopClients.size > 0 || Boolean(current), name: pcName, output: current?.output || null, nowPlaying };
}

export function sendToDesktop(event, data) {
  return broadcast(event, data);
}

export function registerHandoffRoutes(app) {
  // Desktop app keeps this open to receive handoffs.
  app.get('/api/handoff/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    desktopClients.add(res);
    res.write(`event: ready\ndata: ${JSON.stringify({ serverTime: Date.now() })}\n\n`);
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, HEARTBEAT_MS);
    req.on('close', () => {
      clearInterval(heartbeat);
      desktopClients.delete(res);
      if (!desktopClients.size) presence = null;
    });
  });

  // Desktop reports what it is playing every 2s.
  app.post('/api/handoff/presence', (req, res) => {
    const nowPlaying = req.body?.nowPlaying ? sanitizeSnapshot(req.body.nowPlaying) : null;
    const output = typeof req.body?.output === 'string' ? req.body.output.slice(0, 80) : null;
    presence = { nowPlaying, output, stampedAt: Date.now() };
    res.json({ ok: true, serverTime: presence.stampedAt });
  });

  // Phone asks what the desktop is playing (for pull).
  app.get('/api/handoff/desktop', (req, res) => {
    const now = Date.now();
    const current = currentPresence(now);
    const online = desktopClients.size > 0 || Boolean(current);
    let nowPlaying = null;
    if (current?.nowPlaying) {
      const elapsed = current.nowPlaying.isPlaying ? (now - current.stampedAt) / 1000 : 0;
      const position = current.nowPlaying.position + elapsed;
      const limit = current.nowPlaying.track.durationSeconds;
      nowPlaying = { ...current.nowPlaying, position: limit ? Math.min(position, limit) : position };
    }
    res.json({ online, nowPlaying, serverTime: now, name: pcName });
  });

  // Phone as a remote: play / pause / next / previous / seek on the desktop.
  app.post('/api/handoff/command', (req, res) => {
    const action = String(req.body?.action || '');
    if (!['play', 'pause', 'toggle', 'next', 'previous', 'seek'].includes(action)) {
      return res.status(400).json({ error: 'invalid_action' });
    }
    const position = Number(req.body?.position);
    if (!desktopClients.size) return res.status(409).json({ error: 'desktop_offline' });
    const delivered = broadcast('command', { action, position: Number.isFinite(position) ? position : null, serverTime: Date.now() });
    res.json({ ok: true, delivered });
  });

  // Phone tells the desktop to fade out (after pull, or after a timed-out push).
  app.post('/api/handoff/release', (req, res) => {
    const delivered = broadcast('release', { reason: cleanString(req.body?.reason, 40) || 'release', serverTime: Date.now() });
    res.json({ ok: true, delivered });
  });

  // Phone pushes its playback to the desktop.
  app.post('/api/handoff/push', (req, res) => {
    prune();
    const snapshot = sanitizeSnapshot(req.body?.snapshot ?? req.body);
    if (!snapshot) return res.status(400).json({ error: 'invalid_snapshot' });
    if (!desktopClients.size) return res.status(409).json({ error: 'desktop_offline' });
    const now = Date.now();
    const id = crypto.randomUUID();
    handoffs.set(id, { id, status: 'pending', error: null, createdAt: now, updatedAt: now });
    broadcast('handoff', { id, snapshot, stampedAt: now });
    res.json({ id, stampedAt: now });
  });

  app.get('/api/handoff/:id', (req, res) => {
    const entry = handoffs.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'not_found' });
    res.json({ id: entry.id, status: entry.status, error: entry.error });
  });

  // Desktop confirms it is actually playing (or failed).
  app.post('/api/handoff/:id/status', (req, res) => {
    const entry = handoffs.get(req.params.id);
    if (!entry) return res.status(404).json({ error: 'not_found' });
    const status = req.body?.status;
    if (status !== 'playing' && status !== 'failed') return res.status(400).json({ error: 'invalid_status' });
    if (entry.status === 'pending') {
      entry.status = status;
      entry.error = status === 'failed' ? cleanString(req.body?.error, 200) || 'failed' : null;
      entry.updatedAt = Date.now();
    }
    res.json({ id: entry.id, status: entry.status });
  });
}
