const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { GhosttunesDatabase } = require('../electron/database.cjs');

let now = 100_000;
const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const records = new Map();
const cache = new Map();
function loadTs(relativePath, mocks = {}) {
  const filename = path.resolve(__dirname, '..', relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => {
    if (mocks[name]) return mocks[name];
    if (name.startsWith('.'))
      return loadTs(
        path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(filename), `${name}.ts`)),
        mocks,
      );
    return require(name);
  };
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: localRequire,
      localStorage,
      console,
      Date: class extends Date {
        static now() {
          return now;
        }
      },
    },
    { filename },
  );
  cache.set(filename, module.exports);
  return module.exports;
}

const { parseSavedSession } = loadTs('src/utils/session.ts');
const tracks = [
  {
    id: 'first',
    title: 'First song',
    artist: 'First artist',
    duration: '3:00',
    durationSeconds: 180,
    thumbnail: '/first.png',
  },
  {
    id: 'second',
    title: 'Second song',
    artist: 'Second artist',
    duration: '3:00',
    durationSeconds: 180,
    thumbnail: '/second.png',
  },
];
assert.equal(parseSavedSession('{broken'), null);
assert.equal(parseSavedSession(JSON.stringify({ queue: [] })), null);
assert.equal(parseSavedSession(JSON.stringify({ queue: [null] })), null);
const saved = parseSavedSession(JSON.stringify({ queue: tracks, currentIndex: 99, currentTime: -10 }));
assert.equal(saved.currentIndex, 1);
assert.equal(saved.currentTime, 0);
assert.equal(saved.queue[saved.currentIndex].title, 'Second song');
console.log('PASS: saved sessions reject invalid data and clamp queue positions');

const { MusicMemoryTracker } = loadTs('src/services/musicMemoryService.ts', {
  './desktopService': {
    recordListeningPlay: async (entry) => {
      records.set(entry.id, entry);
      return entry.id;
    },
  },
});
const memory = new MusicMemoryTracker();
memory.onTrackChange(tracks[0], 180);
memory.onPlaybackStateChange(true);
for (let second = 0; second < 60; second++) {
  now += 1000;
  memory.onTimeUpdate(second + 1, 180);
}
memory.onPlaybackStateChange(false);
memory.flushCurrentTrackRecord();
memory.flushCurrentTrackRecord();
assert.equal(records.size, 1);
assert.equal([...records.values()][0].duration_played, 60);
assert.equal([...records.values()][0].played_at, 100_000);
now += 30_000;
memory.onPlaybackStateChange(true);
for (let second = 0; second < 10; second++) {
  now += 1000;
  memory.onTimeUpdate(61 + second, 180);
}
memory.onPlaybackStateChange(false);
assert.equal(records.size, 1);
assert.equal([...records.values()][0].duration_played, 70);
memory.onTrackChange(tracks[0], 180);
memory.onPlaybackStateChange(true);
for (let second = 0; second < 10; second++) {
  now += 1000;
  memory.onTimeUpdate(second, 180);
}
memory.onPlaybackStateChange(false);
assert.equal(records.size, 2, 'A fresh listen to the same song must get its own ID');
memory.saveSessionSnapshot(tracks, 1, 42);
assert.equal(memory.getSavedSessionSnapshot().currentIndex, 1);
assert.equal(memory.getSavedSessionSnapshot().currentTime, 42);
console.log('PASS: checkpoints, pause and close update one row; replay creates a new listen');

const database = new GhosttunesDatabase(':memory:');
try {
  for (const record of records.values()) database.recordPlay(record);
  const first = [...records.values()][0];
  database.recordPlay({ ...first, duration_played: 80 });
  database.recordPlay({ ...first, duration_played: 30 }); // Out-of-order IPC response.
  assert.equal(database.getListeningHistory().length, 2);
  assert.equal(database.getListeningStats().totalPlays, 2);
  assert.equal(database.getListeningHistory().find((item) => item.id === first.id).duration_played, 80);
  assert.equal(
    database.getListeningStats().uniqueAlbums,
    0,
    'Missing albums must not produce invented counts',
  );
  assert.equal(database.getListeningStats().uniqueArtists, 1);
  console.log('PASS: SQLite checkpoints do not duplicate plays or reduce recorded time');
} finally {
  database.db.close();
}

const desktop = loadTs('src/services/desktopService.ts');
(async () => {
  const first = [...records.values()][0];
  await desktop.recordListeningPlay(first);
  await desktop.recordListeningPlay({ ...first, duration_played: 100 });
  await desktop.recordListeningPlay({ ...first, duration_played: 10 });
  const history = await desktop.getListeningHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0].duration_played, 100);
  assert.equal((await desktop.getListeningStats()).uniqueAlbums, 0);
  console.log('PASS: browser history also updates one row and preserves the longest checkpoint');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
