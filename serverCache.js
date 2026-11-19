// "Cached" songs: audio of songs you've played is kept on this PC (most recent first, capped), so
// they start instantly and play offline. /api/stream serves these files before going online.
import fs from 'fs';
import path from 'path';

const MAX_SONGS = 80;
const MAX_BYTES = 800 * 1024 * 1024;

export function cacheDir() {
  const base = process.env.USER_DATA_PATH || path.join(process.env.APPDATA || process.env.HOME || '.', 'Ghosttunes');
  const dir = path.join(base, 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const indexFile = () => path.join(cacheDir(), 'index.json');
const inProgress = new Set();

function readIndex() {
  try {
    const list = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try { fs.writeFileSync(indexFile(), JSON.stringify(list)); } catch {}
}

const fileFor = (id) => path.join(cacheDir(), `${id}.m4a`);
const validId = (id) => /^[A-Za-z0-9_-]{6,20}$/.test(String(id || ''));

/** Entries whose audio file is really on disk, newest first. */
export function listCached() {
  return readIndex().filter(e => e && e.track && fs.existsSync(fileFor(e.track.id)));
}

function trim() {
  const list = listCached().sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
  let bytes = 0;
  const keep = [];
  for (const e of list) {
    const size = (() => { try { return fs.statSync(fileFor(e.track.id)).size; } catch { return 0; } })();
    if (keep.length < MAX_SONGS && bytes + size <= MAX_BYTES) {
      keep.push(e);
      bytes += size;
    } else {
      try { fs.unlinkSync(fileFor(e.track.id)); } catch {}
    }
  }
  writeIndex(keep);
}

function touch(track) {
  const list = readIndex().filter(e => e?.track?.id !== track.id);
  list.unshift({ track, lastPlayedAt: Date.now() });
  writeIndex(list);
}

/** Download a song's audio into the cache in the background (no-op if already cached). */
async function cacheSong(track, { getYtdlTrackInfo, ytdlClient }) {
  const id = track.id;
  if (fs.existsSync(fileFor(id))) { touch(track); return; }
  if (inProgress.has(id)) return;
  inProgress.add(id);
  const part = fileFor(id) + '.part';
  try {
    const info = await getYtdlTrackInfo(id);
    const hasMp4 = info.formats.some(f => f.hasAudio && !f.hasVideo && f.container === 'mp4');
    const stream = await ytdlClient.download(info, {
      filter: hasMp4 ? (f => f.hasAudio && !f.hasVideo && f.container === 'mp4') : { hasAudio: true, hasVideo: false },
      quality: 'highestaudio',
    });
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(part);
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      stream.pipe(out);
    });
    if (fs.statSync(part).size < 50 * 1024) throw new Error('audio too small');
    fs.renameSync(part, fileFor(id));
    touch(track);
    trim();
  } catch (err) {
    try { fs.unlinkSync(part); } catch {}
    console.warn('[Cache] could not cache', id, err.message);
  } finally {
    inProgress.delete(id);
  }
}

export function registerCacheRoutes(app, deps) {
  // Songs kept on this PC, newest first.
  app.get('/api/cache', (req, res) => {
    res.json({ tracks: listCached().map(e => ({ ...e.track, cachedAt: e.lastPlayedAt })) });
  });

  // Keep this song (called after it has played for a while).
  app.post('/api/cache/:id', (req, res) => {
    const id = String(req.params.id);
    if (!validId(id) || id.startsWith('local_')) return res.status(400).json({ error: 'invalid_id' });
    const t = req.body?.track || {};
    const track = {
      id,
      title: String(t.title || '').slice(0, 300),
      artist: String(t.artist || '').slice(0, 300),
      album: String(t.album || '').slice(0, 300),
      duration: String(t.duration || ''),
      durationSeconds: Number(t.durationSeconds) || 0,
      thumbnail: typeof t.thumbnail === 'string' && /^https?:\/\//.test(t.thumbnail) ? t.thumbnail : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
    cacheSong(track, deps);
    res.json({ ok: true });
  });

  app.delete('/api/cache', (req, res) => {
    for (const e of readIndex()) { try { fs.unlinkSync(fileFor(e.track.id)); } catch {} }
    writeIndex([]);
    res.json({ ok: true });
  });
}
