// Spotify Connect-style device list: the PC and every phone connected to this server.
// Any device can see the others, control whichever is playing, or send music to one.
import { getDesktop, sendToDesktop, sanitizeSnapshot } from './serverHandoff.js';
import { listPhones, sendToPhone, updatePhoneState } from './serverProximity.js';
import { listPeerPcs, isPeerId, peerCommand, peerPlay } from './serverPeers.js';

const ACTIONS = ['play', 'pause', 'toggle', 'next', 'previous', 'seek', 'volume', 'sendToPc'];

export function registerDeviceRoutes(app, { warmTrack = () => {}, port } = {}) {
  app.get('/api/devices', async (req, res) => {
    const pc = getDesktop();
    // Other PCs on the Wi-Fi (left out when another PC is the one asking, so PCs don't list each other in circles).
    const others = req.query.local === '1' ? [] : await listPeerPcs({ selfPort: port }).catch(() => []);
    res.json({
      devices: [
        { id: 'pc', type: 'pc', name: pc.name, output: pc.output, volume: pc.volume, online: pc.online, nowPlaying: pc.nowPlaying },
        ...listPhones(),
        ...others,
      ],
      serverTime: Date.now(),
    });
  });

  // A phone reports what it's playing.
  app.post('/api/devices/state', (req, res) => {
    const id = String(req.body?.id || '').toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
    const np = req.body?.nowPlaying ? sanitizeSnapshot(req.body.nowPlaying) : null;
    updatePhoneState(id, req.body?.name, np, req.body?.output);
    // Get the phone's song (and the next one) ready on this PC, so a shake starts it here instantly.
    if (np?.track?.id) {
      warmTrack(np.track.id);
      const next = np.queue?.[np.queueIndex + 1];
      if (next?.id) warmTrack(next.id);
    }
    res.json({ ok: true });
  });

  // Control any device: play / pause / toggle / next / previous / seek / volume (position = change, e.g. +0.1),
  // or ask a phone to send its music to the PC.
  app.post('/api/devices/:id/command', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const action = String(req.body?.action || '');
    if (!ACTIONS.includes(action)) return res.status(400).json({ error: 'invalid_action' });
    const position = Number(req.body?.position);
    const payload = { action, position: Number.isFinite(position) ? position : null, serverTime: Date.now() };
    if (isPeerId(id)) {
      const r = await peerCommand(id, payload);
      return res.status(r.status).json(r.body);
    }
    const delivered = id === 'pc' ? sendToDesktop('command', payload) : sendToPhone(id, 'command', payload);
    if (!delivered) return res.status(409).json({ error: 'device_offline' });
    res.json({ ok: true, delivered });
  });

  // Start music on a phone (from the PC or another phone). The phone plays it, then reports its state.
  app.post('/api/devices/:id/play', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (id === 'pc') return res.status(400).json({ error: 'use /api/handoff/push for the PC' });
    const snapshot = sanitizeSnapshot(req.body?.snapshot ?? req.body);
    if (!snapshot) return res.status(400).json({ error: 'invalid_snapshot' });
    if (isPeerId(id)) {
      const r = await peerPlay(id, snapshot);
      return res.status(r.status).json(r.body.error ? r.body : { ok: true, ...r.body });
    }
    const delivered = sendToPhone(id, 'play', { snapshot, stampedAt: Date.now() });
    if (!delivered) return res.status(409).json({ error: 'device_offline' });
    res.json({ ok: true });
  });
}
