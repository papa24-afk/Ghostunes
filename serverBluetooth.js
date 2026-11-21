// Bluetooth link: a paired phone can reach this PC with no shared Wi-Fi (or no network at all).
// A tiny helper (bluetooth-link.cs, compiled on first run with Windows' built-in C# compiler)
// advertises an RFCOMM service and relays JSON lines. Each line from the phone is either:
//   {"hello":"<phone id>","name":"Galaxy S21"}            -> registers the phone for events
//   {"rid":7,"method":"POST","path":"/api/...","body":{}} -> run against this server, reply {"rid":7,"status":200,"body":{...}}
// Events for that phone (near / command / play) are sent as {"event":"near","data":{...}}.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachPhoneChannel } from './serverProximity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let helper = null;
let state = 'off';
const conns = new Map(); // conn -> { phoneId, detach }

function findCsc() {
  const win = process.env.WINDIR || 'C:\\Windows';
  for (const fw of ['Framework64', 'Framework']) {
    const dir = path.join(win, 'Microsoft.NET', fw, 'v4.0.30319');
    if (fs.existsSync(path.join(dir, 'csc.exe'))) return dir;
  }
  return null;
}

function compile(done) {
  const src = path.join(__dirname, 'bluetooth-link.cs');
  const exe = path.join(os.tmpdir(), 'ghosttunes', 'GtBtLink-1.exe');
  if (fs.existsSync(exe)) return done(exe);
  const dir = findCsc();
  const meta = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'WinMetadata');
  if (!dir || !fs.existsSync(src) || !fs.existsSync(meta)) return done(null);
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  const refs = ['Windows.Devices.winmd', 'Windows.Foundation.winmd', 'Windows.Storage.winmd', 'Windows.Networking.winmd'].map((f) => `-r:${path.join(meta, f)}`)
    .concat(['System.Runtime.WindowsRuntime.dll', 'System.Runtime.dll', 'System.Runtime.InteropServices.WindowsRuntime.dll'].map((f) => `-r:${path.join(dir, f)}`));
  execFile(path.join(dir, 'csc.exe'), ['-nologo', `-out:${exe}`, ...refs, src], { windowsHide: true }, (err) => done(err ? null : exe));
}

function send(conn, obj) {
  if (!helper) return;
  try { helper.stdin.write(JSON.stringify({ conn, line: JSON.stringify(obj) }) + '\n'); } catch {}
}

async function handle(conn, line, port) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.hello) {
    const id = String(msg.hello).toLowerCase();
    const entry = conns.get(conn) || {};
    entry.detach?.();
    entry.phoneId = id;
    entry.detach = attachPhoneChannel(id, msg.name, (event, data) => send(conn, { event, data }));
    conns.set(conn, entry);
    send(conn, { event: 'ready', data: { via: 'bluetooth' } });
    return;
  }
  if (msg.rid == null || typeof msg.path !== 'string' || !msg.path.startsWith('/api/')) return;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${msg.path}`, {
      method: msg.method || 'GET',
      headers: msg.body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: msg.body != null ? JSON.stringify(msg.body) : undefined,
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    send(conn, { rid: msg.rid, status: res.status, body });
  } catch (err) {
    send(conn, { rid: msg.rid, status: 502, body: { error: err.message } });
  }
}

export function startBluetoothLink(port) {
  if (process.platform !== 'win32') return;
  compile((exe) => {
    if (!exe) { state = 'unavailable'; console.warn('[Bluetooth] link helper unavailable'); return; }
    const run = () => {
      helper = spawn(exe, [], { windowsHide: true });
      state = 'starting';
      let buf = '';
      helper.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line) continue;
          let m;
          try { m = JSON.parse(line); } catch { continue; }
          if (m.ready) { state = 'listening'; console.log('[Bluetooth] Ghosttunes link ready for paired phones'); }
          else if (m.error) { state = `error: ${m.error}`; console.warn('[Bluetooth]', m.error); }
          else if (m.open === true) conns.set(m.conn, {});
          else if (m.open === false) { conns.get(m.conn)?.detach?.(); conns.delete(m.conn); }
          else if (typeof m.line === 'string') handle(m.conn, m.line, port);
        }
      });
      helper.on('exit', () => { helper = null; state = 'restarting'; setTimeout(run, 5000); });
      helper.on('error', () => { state = 'unavailable'; });
    };
    run();
  });
}

export const bluetoothState = () => ({ state, phones: [...conns.values()].filter((c) => c.phoneId).length });
