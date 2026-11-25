// Other Ghosttunes PCs on the same Wi-Fi. They're found the way phones find a PC ("GHOSTTUNES?" on
// UDP 3002, see startDiscoveryResponder), listed in /api/devices as "pc-<address>-<port>", and
// commands for them are passed on to that PC's own server. So this PC, and every phone connected
// to it, can see the others, control them and send music to them.
import dgram from 'dgram';
import os from 'os';

const DISCOVERY_PORT = 3002;
const REDISCOVER_MS = 15_000;
const STATE_TTL_MS = 700;
const FORGET_MS = 45_000;

/** id -> { id, host, port, hostname, lastSeen, state, stateAt } */
const peers = new Map();
let lastDiscovery = 0;
let discovering = null;

export const peerId = (host, port) => `pc-${host.replace(/[.:]/g, '-')}-${port}`;

function broadcastTargets() {
  const targets = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      targets.add(ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  }
  return [...targets];
}

/** Ask the network who runs Ghosttunes; collects answers for [waitMs]. */
export function discoverPeers({ waitMs = 1200, selfName = os.hostname(), selfPort } = {}) {
  if (discovering) return discovering;
  discovering = new Promise((resolve) => {
    let socket;
    const found = new Map();
    const finish = () => {
      try { socket?.close(); } catch {}
      discovering = null;
      lastDiscovery = Date.now();
      for (const p of found.values()) {
        const old = peers.get(p.id);
        peers.set(p.id, { ...old, ...p, lastSeen: Date.now() });
      }
      for (const [id, p] of peers) if (Date.now() - p.lastSeen > FORGET_MS) peers.delete(id);
      resolve([...peers.values()]);
    };
    try {
      socket = dgram.createSocket('udp4');
      socket.on('error', finish);
      socket.on('message', (msg, rinfo) => {
        let reply;
        try { reply = JSON.parse(msg.toString('utf8')); } catch { return; }
        if (reply?.app !== 'ghosttunes') return;
        const port = Number(reply.port) || 3001;
        // Our own answer (on every network we're on), and the same PC answering on a second network.
        if (reply.name === selfName && (!selfPort || port === Number(selfPort))) return;
        if ([...found.values()].some((p) => p.hostname === reply.name && p.port === port)) return;
        const id = peerId(rinfo.address, port);
        found.set(id, { id, host: rinfo.address, port, hostname: String(reply.name || rinfo.address).slice(0, 80) });
      });
      socket.bind(() => {
        socket.setBroadcast(true);
        const ask = Buffer.from('GHOSTTUNES?');
        for (let i = 0; i < 2; i++) for (const t of broadcastTargets()) socket.send(ask, DISCOVERY_PORT, t, () => {});
        setTimeout(finish, waitMs);
      });
    } catch {
      finish();
    }
  });
  return discovering;
}

async function peerFetch(peer, path, init = {}, timeoutMs = 2500) {
  return fetch(`http://${peer.host}:${peer.port}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** That PC's own entry from its /api/devices (name, what it plays, volume), cached briefly. */
async function peerState(peer) {
  if (peer.state && Date.now() - peer.stateAt < STATE_TTL_MS) return peer.state;
  try {
    const res = await peerFetch(peer, '/api/devices?local=1', {}, 1200);
    const data = await res.json();
    const pc = (data.devices || []).find((d) => d.id === 'pc');
    peer.state = pc || null;
    peer.stateAt = Date.now();
    peer.lastSeen = Date.now();
  } catch {
    peer.state = null;
    peer.stateAt = Date.now();
  }
  return peer.state;
}

/** Device entries for the other PCs (looks again for new ones every 15 s while someone is asking). */
export async function listPeerPcs(opts = {}) {
  if (!lastDiscovery) await discoverPeers(opts);
  else if (Date.now() - lastDiscovery > REDISCOVER_MS) discoverPeers(opts); // in the background
  const out = await Promise.all([...peers.values()].map(async (p) => {
    const s = await peerState(p);
    return {
      id: p.id,
      type: 'pc',
      name: s?.name || p.hostname,
      host: p.hostname,
      output: s?.output ?? null,
      volume: s?.volume ?? null,
      online: Boolean(s?.online),
      nowPlaying: s?.nowPlaying ?? null,
    };
  }));
  return out.filter((d) => d.online);
}

export const isPeerId = (id) => peers.has(id);

/** Pass a play/pause/next/... command on to that PC. */
export async function peerCommand(id, payload) {
  const p = peers.get(id);
  if (!p) return { status: 404, body: { error: 'unknown_device' } };
  try {
    const res = await peerFetch(p, '/api/devices/pc/command', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: payload.action, position: payload.position }),
    });
    p.stateAt = 0;
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 409, body: { error: 'device_offline' } };
  }
}

/** Start music on that PC (same as a phone sending it there). */
export async function peerPlay(id, snapshot) {
  const p = peers.get(id);
  if (!p) return { status: 404, body: { error: 'unknown_device' } };
  try {
    const res = await peerFetch(p, '/api/handoff/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }),
    });
    p.stateAt = 0;
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch {
    return { status: 409, body: { error: 'device_offline' } };
  }
}

export function _resetPeersForTest() { peers.clear(); lastDiscovery = 0; }
