// Exercises the /api/handoff endpoints against a running server.
// Usage: node server.js   (in another shell)   then   node tests/handoff-endpoints.cjs [http://127.0.0.1:3001]
const assert = require('node:assert/strict');
const http = require('node:http');

const BASE = (process.argv[2] || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Minimal SSE client acting as the desktop app. */
function openDesktopStream() {
  const events = [];
  const waiters = [];
  let buffer = '';
  const req = http.get(BASE + '/api/handoff/events', (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (!event) continue;
        const parsed = { event, data: data ? JSON.parse(data) : null };
        events.push(parsed);
        waiters.splice(0).forEach((w) => w());
      }
    });
  });
  const next = async (name, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = events.findIndex((e) => e.event === name);
      if (found >= 0) return events.splice(found, 1)[0];
      if (Date.now() > deadline) throw new Error(`timed out waiting for SSE '${name}'`);
      await new Promise((r) => { waiters.push(r); setTimeout(r, 100); });
    }
  };
  return { next, close: () => req.destroy() };
}

const track = (id, extra = {}) => ({ id, title: `Song ${id}`, artist: 'Artist', duration: '3:30', durationSeconds: 210, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, ...extra });

(async () => {
  const health = await json('GET', '/api/health');
  assert.equal(health.status, 200, 'server is not running');

  const current = track('dQw4w9WgXcQ', { local_audio_url: 'file:///sdcard/song.m4a', local_artwork_url: 'file:///x.jpg', thumbnail: 'capacitor://localhost/_capacitor_file_/art.jpg' });
  const queue = Array.from({ length: 500 }, (_, i) => (i === 400 ? current : track(`trk${String(i).padStart(8, '0')}`)));
  const snapshot = { track: current, queue, queueIndex: 400, position: 42.5, isPlaying: true, deviceName: 'Pixel 7' };

  // 1. Push with no desktop connected -> 409
  const offline = await json('POST', '/api/handoff/push', { snapshot });
  assert.equal(offline.status, 409);
  assert.equal(offline.body.error, 'desktop_offline');
  console.log('ok  push with no desktop -> 409 desktop_offline');

  // 2. Invalid snapshot -> 400
  const invalid = await json('POST', '/api/handoff/push', { snapshot: { track: { title: 'no id' } } });
  assert.equal(invalid.status, 400);
  console.log('ok  invalid snapshot -> 400');

  // 3. Desktop opens SSE; push is delivered, sanitized and capped
  const desktop = openDesktopStream();
  await desktop.next('ready');
  const pushed = await json('POST', '/api/handoff/push', { snapshot });
  assert.equal(pushed.status, 200);
  assert.ok(pushed.body.id);
  const received = await desktop.next('handoff');
  const got = received.data;
  assert.equal(got.id, pushed.body.id);
  assert.ok(Math.abs(got.stampedAt - Date.now()) < 5000, 'stamped with server time');
  assert.equal(got.snapshot.queue.length, 300, 'queue capped at 300');
  assert.equal(got.snapshot.queue[got.snapshot.queueIndex].id, current.id, 'queueIndex still points at the current track');
  assert.equal(got.snapshot.position, 42.5);
  assert.equal(got.snapshot.deviceName, 'Pixel 7');
  assert.equal(got.snapshot.track.local_audio_url, undefined, 'local audio stripped');
  assert.equal(got.snapshot.track.local_artwork_url, undefined, 'local artwork stripped');
  assert.equal(got.snapshot.track.thumbnail, `https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`, 'custom-protocol artwork replaced');
  console.log('ok  desktop receives the handoff (stamped, queue capped 500 -> 300, local data stripped)');

  // 4. Phone polls: pending -> desktop reports playing -> phone sees playing
  const pending = await json('GET', `/api/handoff/${pushed.body.id}`);
  assert.equal(pending.body.status, 'pending');
  const reported = await json('POST', `/api/handoff/${pushed.body.id}/status`, { status: 'playing' });
  assert.equal(reported.status, 200);
  const playing = await json('GET', `/api/handoff/${pushed.body.id}`);
  assert.equal(playing.body.status, 'playing');
  const badStatus = await json('POST', `/api/handoff/${pushed.body.id}/status`, { status: 'bogus' });
  assert.equal(badStatus.status, 400);
  assert.equal((await json('GET', '/api/handoff/does-not-exist')).status, 404);
  console.log('ok  status: pending -> playing; bad status 400; unknown id 404');

  // 5. Failed status is visible to the phone
  const pushed2 = await json('POST', '/api/handoff/push', { snapshot });
  await desktop.next('handoff');
  await json('POST', `/api/handoff/${pushed2.body.id}/status`, { status: 'failed', error: 'stream error' });
  const failed = await json('GET', `/api/handoff/${pushed2.body.id}`);
  assert.deepEqual([failed.body.status, failed.body.error], ['failed', 'stream error']);
  console.log('ok  failed status reaches the phone');

  // 6. Pull: desktop presence -> phone reads it with position brought up to date
  const presence = { ...snapshot, position: 100, deviceName: undefined };
  assert.equal((await json('POST', '/api/handoff/presence', { nowPlaying: presence })).status, 200);
  await sleep(1000);
  const pull = await json('GET', '/api/handoff/desktop');
  assert.equal(pull.body.online, true);
  assert.equal(pull.body.nowPlaying.track.id, current.id);
  assert.ok(pull.body.nowPlaying.position >= 100.9 && pull.body.nowPlaying.position < 102, `position advanced: ${pull.body.nowPlaying.position}`);
  console.log(`ok  pull: desktop online, position advanced 100 -> ${pull.body.nowPlaying.position.toFixed(2)}`);

  // 7. Release reaches the desktop
  const release = await json('POST', '/api/handoff/release', { reason: 'pulled' });
  assert.equal(release.body.delivered, 1);
  const releaseEvent = await desktop.next('release');
  assert.equal(releaseEvent.data.reason, 'pulled');
  console.log('ok  release delivered to the desktop');

  // 8. Desktop disconnects -> offline again
  desktop.close();
  await sleep(300);
  const after = await json('GET', '/api/handoff/desktop');
  assert.equal(after.body.online, false);
  assert.equal((await json('POST', '/api/handoff/push', { snapshot })).status, 409);
  console.log('ok  desktop disconnect -> offline, push 409');

  console.log('handoff-endpoints: all passed');
})().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
