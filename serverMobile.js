// Small, additive routes used by Ghosttunes Mobile (see mobile-android/docs/API.md, S1/S3/S4).
// None of these change existing responses.
import dgram from 'dgram';
import os from 'os';
import { extractBestThumbnail } from './serverArtwork.js';

const text = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.toString === 'function') {
    const s = value.toString();
    return s === '[object Object]' ? '' : s;
  }
  return '';
};

// Video-style rows put "Channel • 890K views • 2 days ago" in the author; keep the name only.
const cleanName = (name) => String(name || '').split(/\s+•\s+/)[0].replace(/\s+/g, ' ').trim();

function artistsOf(item) {
  let names = [];
  if (Array.isArray(item?.artists) && item.artists.length) names = item.artists.map((a) => a.name);
  else if (Array.isArray(item?.authors) && item.authors.length) names = item.authors.map((a) => a.name);
  else if (item?.author?.name) names = [item.author.name];
  return names.map(cleanName).filter((n) => n && n !== 'N/A').join(', ');
}

export function toTrack(item, fallback = {}) {
  const id = item?.id || item?.video_id;
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const seconds = item.duration?.seconds;
  return {
    id,
    title: text(item.title) || item.name || fallback.title || 'Unknown Title',
    artist: artistsOf(item) || fallback.artist || 'Unknown Artist',
    artistId: item.artists?.[0]?.channel_id || item.artists?.[0]?.id || undefined,
    album: item.album?.name || fallback.album || '',
    duration: item.duration?.text || (seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : ''),
    durationSeconds: seconds || 0,
    thumbnail: extractBestThumbnail(item, id) || fallback.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function toArtist(item) {
  const id = item?.id || item?.channel_id || item?.endpoint?.payload?.browseId;
  const name = item?.name || text(item?.title) || item?.artists?.[0]?.name;
  if (!id || !name) return null;
  return { id, name, avatar: extractBestThumbnail(item, ''), subtitle: text(item?.subtitle) || 'Artist' };
}

function toAlbum(item) {
  const id = item?.id || item?.endpoint?.payload?.browseId;
  if (!id) return null;
  return {
    id,
    title: text(item.title) || item.name || 'Untitled',
    artist: artistsOf(item),
    year: item.year || '',
    type: item.item_type || 'album',
    thumbnail: extractBestThumbnail(item, ''),
  };
}

function toPlaylist(item) {
  const id = item?.id || item?.endpoint?.payload?.browseId;
  if (!id) return null;
  return {
    id: String(id).replace(/^VL/, ''),
    title: text(item.title) || item.name || 'Playlist',
    author: item.author?.name || artistsOf(item) || '',
    itemCount: item.item_count ? String(item.item_count) : '',
    thumbnail: extractBestThumbnail(item, ''),
  };
}

const normalize = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Picks the top result: an artist whose name matches the query, else the first song. */
export function pickTopResult(query, { songs, artists, albums }) {
  const q = normalize(query);
  const artist = artists[0];
  const name = normalize(artist?.name);
  // Exact name, or a prefix that covers most of it ("burna" -> "Burna Boy", not "essence" -> "Essence of Worship").
  if (artist && q && (name === q || (q.length >= 4 && name.startsWith(q) && q.length >= name.length * 0.6))) {
    return { type: 'artist', item: artist };
  }
  const song = songs.find((s) => normalize(s.title) === q);
  if (song) return { type: 'song', item: song };
  const album = albums[0];
  if (album && q && normalize(album.title) === q) return { type: 'album', item: album };
  if (songs[0]) return { type: 'song', item: songs[0] };
  if (artist) return { type: 'artist', item: artist };
  return null;
}

const cache = new Map();
function cached(key, ttlMs, compute) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;
  const promise = compute().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { promise, expiresAt: Date.now() + ttlMs });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return promise;
}

/**
 * LAN discovery: phones broadcast "GHOSTTUNES?" to UDP 3002 on whatever network they're on;
 * we answer with the HTTP port and this PC's name, so the phone finds us without typing an IP.
 */
export function startDiscoveryResponder(httpPort, discoveryPort = 3002) {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => {
      if (msg.toString('utf8').trim() !== 'GHOSTTUNES?') return;
      const reply = Buffer.from(JSON.stringify({ app: 'ghosttunes', port: Number(httpPort), name: os.hostname() }));
      socket.send(reply, rinfo.port, rinfo.address);
    });
    socket.on('error', (err) => console.warn('[Discovery] UDP error:', err.message));
    socket.bind(discoveryPort, '0.0.0.0', () => console.log(`[Discovery] Listening for phones on UDP ${discoveryPort}`));
    return socket;
  } catch (err) {
    console.warn('[Discovery] Could not start:', err.message);
    return null;
  }
}

export function registerMobileRoutes(app, { getInnertube, getYtdlTrackInfo, chooseFormat, ytdlClient }) {
  // S1: warm the stream info cache so playback starts immediately.
  app.get('/api/stream/:id/prepare', async (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[\w-]{11}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
    const startedAt = Date.now();
    try {
      const info = await getYtdlTrackInfo(id);
      const format =
        chooseFormat(info.formats, { filter: (f) => f.hasAudio && !f.hasVideo && f.container === 'mp4', quality: 'highestaudio' }) ||
        chooseFormat(info.formats, { filter: { hasAudio: true, hasVideo: false }, quality: 'highestaudio' });
      // Also pull one byte through the same download path /api/stream uses: the first download
      // for a track has its own warm-up cost on top of getInfo.
      if (ytdlClient && format) {
        try {
          const filter = (f) => f.hasAudio && !f.hasVideo && (format.container ? f.container === format.container : true);
          const stream = await ytdlClient.download(info, { filter, quality: 'highestaudio', range: { start: 0, end: 1 } });
          await new Promise((resolve) => {
            const done = () => { try { stream.destroy(); } catch {} resolve(); };
            stream.once('data', done);
            stream.once('error', done);
            stream.once('end', done);
            setTimeout(done, 8000);
          });
        } catch {}
      }
      res.json({
        ok: true,
        id,
        mimeType: format?.mimeType || null,
        contentLength: Number(format?.contentLength) || null,
        tookMs: Date.now() - startedAt,
      });
    } catch (error) {
      res.status(502).json({ ok: false, id, error: error.message });
    }
  });

  // S3: typed search for the phone's filter chips and top-result card.
  app.get('/api/search/all', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'Query required' });
    try {
      const data = await cached(`all_${query.toLowerCase()}`, 30 * 60 * 1000, async () => {
        const innertube = await getInnertube();
        const run = (type) => innertube.music.search(query, { type }).catch((err) => {
          console.warn(`[Mobile] search ${type} failed:`, err.message);
          return null;
        });
        const [songRes, artistRes, albumRes, playlistRes] = await Promise.all([run('song'), run('artist'), run('album'), run('playlist')]);
        const songs = (songRes?.songs?.contents || []).map((s) => toTrack(s)).filter(Boolean).slice(0, 20);
        const artists = (artistRes?.artists?.contents || []).map(toArtist).filter(Boolean).slice(0, 10);
        const albums = (albumRes?.albums?.contents || []).map(toAlbum).filter(Boolean).slice(0, 10);
        const playlists = (playlistRes?.playlists?.contents || []).map(toPlaylist).filter(Boolean).slice(0, 10);
        return { query, top: pickTopResult(query, { songs, artists, albums }), songs, artists, albums, playlists };
      });
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.json(data);
    } catch (error) {
      console.error('[Mobile] search/all error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // S4: YouTube Music playlist details by id.
  app.get('/api/playlist', async (req, res) => {
    const raw = String(req.query.id || '').trim();
    if (!raw) return res.status(400).json({ error: 'Playlist ID required' });
    const cleanId = raw.replace(/^VL/, '');
    try {
      const data = await cached(`playlist_${cleanId}`, 60 * 60 * 1000, async () => {
        const innertube = await getInnertube();
        let pl = null;
        try {
          pl = await innertube.music.getPlaylist(`VL${cleanId}`);
        } catch {
          pl = await innertube.music.getPlaylist(cleanId);
        }
        const header = pl.header || {};
        const items = pl.contents || pl.items || [];
        const tracks = items.map((item) => toTrack(item)).filter(Boolean);
        if (!tracks.length) throw new Error('no playable tracks');
        const author = [text(header.strapline_text_one), header.author?.name].map(cleanName).find((n) => n && n !== 'N/A') || '';
        return {
          id: cleanId,
          title: text(header.title) || 'Playlist',
          author,
          description: text(header.description?.description) || text(header.description) || '',
          subtitle: text(header.second_subtitle) || text(header.subtitle) || '',
          thumbnail: extractBestThumbnail(header, '') || tracks[0]?.thumbnail || '',
          trackCount: tracks.length,
          tracks,
        };
      });
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(data);
    } catch (error) {
      console.error('[Mobile] playlist error:', error.message);
      res.status(404).json({ error: `Playlist not found: ${error.message}` });
    }
  });
}

/**
 * S2: artist "Top songs" rows from YouTube Music carry no duration. Look the real durations up
 * with one song search per track (in parallel, bounded by a timeout). Missing ones keep the
 * previous placeholder so existing clients behave exactly as before.
 */
export async function fillMissingDurations(innertube, tracks, timeoutMs = 4000) {
  const missing = tracks.filter((t) => t.missingDuration);
  if (!missing.length) return tracks;
  const lookups = missing.map(async (track) => {
    try {
      const result = await innertube.music.search(`${track.title} ${track.artist}`, { type: 'song' });
      const match = (result.songs?.contents || []).find((s) => s.id === track.id);
      if (match?.duration?.seconds) {
        track.duration = match.duration.text;
        track.durationSeconds = match.duration.seconds;
      }
    } catch {}
  });
  await Promise.race([Promise.all(lookups), new Promise((r) => setTimeout(r, timeoutMs))]);
  for (const track of tracks) delete track.missingDuration;
  return tracks;
}
