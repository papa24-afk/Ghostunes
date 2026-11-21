// "Bring the phone close to transfer": the phone sends a low-power Bluetooth beacon
// (manufacturer data 0xFFFF "GTUN" + 4-byte id). This PC listens with a tiny helper compiled
// on first run from proximity-watch.cs using Windows' built-in C# compiler, measures the signal,
// and tells that phone (over /api/handoff/phone-events) when it comes close.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NEAR_DBM = -52;   // stronger than this (twice in a row) = phone brought close
const AWAY_DBM = -66;   // weaker than this for a while = phone moved away (re-arms)
const COOLDOWN_MS = 6000;

const phones = new Map(); // id -> { clients:Set<res>, ema, nearHits, armed, lastTrigger, lastSeen }
let helperState = 'off';

function phone(id) {
  let p = phones.get(id);
  if (!p) {
    p = { clients: new Set(), channels: new Set(), ema: null, nearHits: 0, armed: true, lastTrigger: 0, lastSeen: 0, awaySince: 0, name: 'Phone', nowPlaying: null, stateAt: 0 };
    phones.set(id, p);
  }
  return p;
}

function onSighting(id, rssi) {
  const p = phone(id);
  const now = Date.now();
  p.lastSeen = now;
  p.ema = p.ema == null ? rssi : p.ema * 0.5 + rssi * 0.5;
  if (!p.armed) {
    if (p.ema < AWAY_DBM) {
      p.awaySince ||= now;
      if (now - p.awaySince > 1500) { p.armed = true; p.awaySince = 0; }
    } else {
      p.awaySince = 0;
    }
    return;
  }
  p.nearHits = rssi >= NEAR_DBM ? p.nearHits + 1 : 0;
  if (p.nearHits >= 2 && now - p.lastTrigger > COOLDOWN_MS && (p.clients.size || p.channels.size)) {
    p.lastTrigger = now;
    p.armed = false;
    p.nearHits = 0;
    const msg = `event: near\ndata: ${JSON.stringify({ rssi: Math.round(p.ema) })}\n\n`;
    for (const c of p.clients) { try { c.write(msg); } catch {} }
    for (const ch of p.channels) { try { ch('near', { rssi: Math.round(p.ema) }); } catch {} }
    console.log(`[Proximity] phone ${id} brought close (${Math.round(p.ema)} dBm)`);
  }
}

function findCsc() {
  const win = process.env.WINDIR || 'C:\\Windows';
  for (const fw of ['Framework64', 'Framework']) {
    const p = path.join(win, 'Microsoft.NET', fw, 'v4.0.30319', 'csc.exe');
    if (fs.existsSync(p)) return { csc: p, dir: path.dirname(p) };
  }
  return null;
}

function compileHelper(done) {
  const src = path.join(__dirname, 'proximity-watch.cs');
  const outDir = path.join(os.tmpdir(), 'ghosttunes');
  const exe = path.join(outDir, 'GtBleWatch-1.exe');
  if (fs.existsSync(exe)) return done(exe);
  const tool = findCsc();
  const meta = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WinMetadata');
  if (!tool || !fs.existsSync(src) || !fs.existsSync(meta)) return done(null);
  fs.mkdirSync(outDir, { recursive: true });
  const args = [
    '-nologo', `-out:${exe}`,
    `-r:${path.join(meta, 'Windows.Devices.winmd')}`,
    `-r:${path.join(meta, 'Windows.Foundation.winmd')}`,
    `-r:${path.join(meta, 'Windows.Storage.winmd')}`,
    `-r:${path.join(tool.dir, 'System.Runtime.WindowsRuntime.dll')}`,
    `-r:${path.join(tool.dir, 'System.Runtime.dll')}`,
    `-r:${path.join(tool.dir, 'System.Runtime.InteropServices.WindowsRuntime.dll')}`,
    src,
  ];
  execFile(tool.csc, args, { windowsHide: true }, (err) => done(err ? null : exe));
}

/** Sends an event to one phone over its open /api/handoff/phone-events stream. */
export function sendToPhone(id, event, data) {
  const p = phones.get(String(id).toLowerCase());
  if (!p) return 0;
  const msg = `event: ${event}
data: ${JSON.stringify(data)}

`;
  let n = 0;
  for (const c of p.clients) { try { c.write(msg); n++; } catch {} }
  for (const ch of p.channels) { try { ch(event, data); n++; } catch {} }
  return n;
}

/** A phone connected over Bluetooth: deliver its events through [send]. Returns a detach function. */
export function attachPhoneChannel(id, name, send) {
  const p = phone(String(id).toLowerCase());
  if (name) p.name = String(name).slice(0, 60);
  p.channels.add(send);
  return () => p.channels.delete(send);
}

/** Phones that are connected (or reported in the last minute), with live positions. */
export function listPhones() {
  const now = Date.now();
  return [...phones.entries()]
    .filter(([, p]) => p.clients.size > 0 || p.channels.size > 0 || now - p.stateAt < 60_000)
    .map(([id, p]) => {
      let nowPlaying = p.nowPlaying;
      if (nowPlaying?.isPlaying) {
        const position = nowPlaying.position + (now - p.stateAt) / 1000;
        const limit = nowPlaying.track?.durationSeconds;
        nowPlaying = { ...nowPlaying, position: limit ? Math.min(position, limit) : position };
      }
      return { id, type: 'phone', name: p.name, output: p.output || null, online: p.clients.size > 0 || p.channels.size > 0, via: p.channels.size && !p.clients.size ? 'bluetooth' : 'wifi', nowPlaying };
    });
}

/** Phone reports what it's playing (every few seconds, and right after changes). */
export function updatePhoneState(id, name, nowPlaying, output) {
  const p = phone(String(id).toLowerCase());
  if (name) p.name = String(name).slice(0, 60);
  p.output = typeof output === 'string' ? output.slice(0, 80) : null;
  p.nowPlaying = nowPlaying;
  p.stateAt = Date.now();
}

export function startProximityWatcher() {
  if (process.platform !== 'win32') return;
  compileHelper((exe) => {
    if (!exe) { helperState = 'unavailable'; console.warn('[Proximity] Bluetooth helper unavailable'); return; }
    const run = () => {
      const child = spawn(exe, [], { windowsHide: true });
      helperState = 'starting';
      let buf = '';
      child.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          try {
            const m = JSON.parse(line);
            if (m.ready) helperState = 'listening';
            else if (m.stopped) helperState = `stopped: ${m.stopped}`;
            else if (m.id && typeof m.rssi === 'number') onSighting(m.id, m.rssi);
          } catch {}
        }
      });
      child.on('exit', () => { helperState = 'restarting'; setTimeout(run, 5000); });
      child.on('error', () => { helperState = 'unavailable'; });
    };
    run();
  });
}

export function registerProximityRoutes(app) {
  // The phone keeps this open (while it's beaconing) to hear "you were brought close".
  app.get('/api/handoff/phone-events', (req, res) => {
    const id = String(req.query.id || '').toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) return res.status(400).end();
    if (req.query.name) phone(id).name = String(req.query.name).slice(0, 60);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write(`event: ready\ndata: ${JSON.stringify({ helper: helperState })}\n\n`);
    const p = phone(id);
    p.clients.add(res);
    const heartbeat = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 15000);
    req.on('close', () => { clearInterval(heartbeat); p.clients.delete(res); });
  });

  app.get('/api/handoff/proximity', (req, res) => {
    res.json({
      helper: helperState,
      phones: [...phones.entries()].map(([id, p]) => ({ id, rssi: p.ema == null ? null : Math.round(p.ema), armed: p.armed, listening: p.clients.size, seenAgoMs: p.lastSeen ? Date.now() - p.lastSeen : null })),
    });
  });
}
