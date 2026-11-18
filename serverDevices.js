// Spotify Connect-style device list: the PC and every phone connected to this server.
// Any device can see the others, control whichever is playing, or send music to one.
import { getDesktop, sendToDesktop, sanitizeSnapshot } from './serverHandoff.js';
import { listPhones, sendToPhone, updatePhoneState } from './serverProximity.js';

const ACTIONS = ['play', 'pause', 'toggle', 'next', 'previous', 'seek', 'sendToPc'];

export function registerDeviceRoutes(app) {
  app.get('/api/devices', (req, res) => {
    const pc = getDesktop();
    res.json({
      devices: [
        { id: 'pc', type: 'pc', name: pc.name, output: pc.output, online: pc.online, nowPlaying: pc.nowPlaying },
        ...listPhones(),
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
    res.json({ ok: true });
  });

  // Control any device: play / pause / toggle / next / previous / seek, or ask a phone to send its music to the PC.
  app.post('/api/devices/:id/command', (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const action = String(req.body?.action || '');
    if (!ACTIONS.includes(action)) return res.status(400).json({ error: 'invalid_action' });
    const position = Number(req.body?.position);
    const payload = { action, position: Number.isFinite(position) ? position : null, serverTime: Date.now() };
    const delivered = id === 'pc' ? sendToDesktop('command', payload) : sendToPhone(id, 'command', payload);
    if (!delivered) return res.status(409).json({ error: 'device_offline' });
    res.json({ ok: true, delivered });
  });

  // Start music on a phone (from the PC or another phone). The phone plays it, then reports its state.
  app.post('/api/devices/:id/play', (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (id === 'pc') return res.status(400).json({ error: 'use /api/handoff/push for the PC' });
    const snapshot = sanitizeSnapshot(req.body?.snapshot ?? req.body);
    if (!snapshot) return res.status(400).json({ error: 'invalid_snapshot' });
    const delivered = sendToPhone(id, 'play', { snapshot, stampedAt: Date.now() });
    if (!delivered) return res.status(409).json({ error: 'device_offline' });
    res.json({ ok: true });
  });
}
