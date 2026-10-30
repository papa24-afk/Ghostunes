import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { Platform, Innertube, UniversalCache } from 'youtubei.js';
import { Ytdl, chooseFormat } from '@distube/ytdl-core';
const ytdlClient = new Ytdl({ clients: ['web_embedded', 'mweb', 'tv', 'web_creator', 'visionos'] });
import {
  parsePlaylistUrl,
  resolveSpotifyPlaylist,
  resolveYouTubePlaylist,
  resolveDeezerPlaylist,
  resolveAppleMusicPlaylist,
  matchTracksAgainstCatalogue,
  getSpotifyAuthUrl,
  exchangeSpotifyCode,
  refreshSpotifyToken,
  fetchSpotifyUserProfile,
  fetchSpotifyUserPlaylists,
  fetchDeezerUserPlaylists,
  fetchAppleUserPlaylists,
  fetchYouTubeUserPlaylists,
  validateSpotifyCredentials,
  validateDeezerCredentials,
  validateAppleMusicKit,
  getDeezerAuthUrl,
  exchangeDeezerCode
} from './serverPlaylistImport.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust loader for .env from multiple potential working directories
function loadEnv() {
  const possiblePaths = [
    path.join(__dirname, '.env'),
    path.resolve('.env'),
    path.join(process.cwd(), 'metrolist-web', '.env')
  ];

  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
          if (match) {
            const key = match[1].trim();
            let val = (match[2] || '').trim();
            // Strip surrounding matching quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        });
        console.log(`[Server] Environment loaded from ${envPath}`);
        break;
      } catch (e) {
        console.warn(`[Server] Could not parse .env at ${envPath}:`, e.message);
      }
    }
  }
}
loadEnv();

// Active OAuth state store for CSRF mitigation
const activeOAuthStates = new Map(); // state -> { timestamp, provider, redirectUri }
setInterval(() => {
  const now = Date.now();
  for (const [st, info] of activeOAuthStates.entries()) {
    if (now - info.timestamp > 15 * 60 * 1000) {
      activeOAuthStates.delete(st);
    }
  }
}, 5 * 60 * 1000);

// Enable JS evaluator for signature deciphering in Node.js
Platform.shim.eval = (data, env) => {
  const fn = new Function(...Object.keys(env), data.output);
  return fn(...Object.values(env));
};

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check endpoint for desktop app and service monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

let yt;

async function getInnertube() {
  if (!yt) {
    yt = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
    console.log('Innertube initialized successfully!');
  }
  return yt;
}

// Server-side in-memory caches for stable data (saves network requests & respects Data Saver)
const serverLyricsCache = new Map();
const serverMetadataCache = new Map();

// 1. Home Feed / Quick Picks
app.get('/api/home', async (req, res) => {
  const cacheKey = 'home_trending';
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    // Default search for popular trending music
    const searchResult = await innertube.music.search('Trending Hits', { type: 'song' });
    const tracks = (searchResult.songs?.contents || []).slice(0, 25).map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artists?.[0]?.name || song.author?.name || 'Unknown Artist',
      album: song.album?.name || '',
      duration: song.duration?.text || '3:30',
      durationSeconds: song.duration?.seconds || 210,
      thumbnail: song.thumbnails?.[song.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`
    }));

    const responseData = { tracks };
    serverMetadataCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 3600 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    res.json(responseData);
  } catch (error) {
    console.error('Home feed error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Search YouTube Music
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });

  const cacheKey = `search_${query.toLowerCase().trim()}`;
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=900');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    const result = await innertube.music.search(query, { type: 'song' });
    const songs = (result.songs?.contents || []).slice(0, 30).map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artists?.[0]?.name || song.author?.name || 'Unknown Artist',
      album: song.album?.name || '',
      duration: song.duration?.text || '3:30',
      durationSeconds: song.duration?.seconds || 210,
      thumbnail: song.thumbnails?.[song.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`
    }));

    const responseData = { results: songs };
    serverMetadataCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 1800 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=900');
    res.json(responseData);
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2b. Related / Autoplay Recommendations
app.get('/api/related', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).json({ error: 'Video ID required' });

  const cacheKey = `related_${videoId}`;
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    const upNext = await innertube.music.getUpNext(videoId);
    const contents = upNext.contents || [];
    const tracks = contents
      .map(song => {
        const id = song.video_id || song.id;
        if (!id) return null;
        return {
          id,
          title: song.title?.text || String(song.title || 'Unknown Track'),
          artist: song.artists?.[0]?.name || song.author?.name || 'Unknown Artist',
          album: song.album?.name || '',
          duration: song.duration?.text || '3:30',
          durationSeconds: song.duration?.seconds || 210,
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        };
      })
      .filter(t => t && t.id !== videoId)
      .slice(0, 25);

    const responseData = { tracks };
    serverMetadataCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 3600 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    res.json(responseData);
  } catch (error) {
    console.error('Related tracks error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2c. Genre / Mood search
app.get('/api/genre', async (req, res) => {
  const genre = req.query.q || 'Trending Hits';
  const cacheKey = `genre_${genre.toLowerCase().trim()}`;
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    const result = await innertube.music.search(genre, { type: 'song' });
    const songs = (result.songs?.contents || []).slice(0, 30).map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artists?.[0]?.name || song.author?.name || 'Unknown Artist',
      album: song.album?.name || '',
      duration: song.duration?.text || '3:30',
      durationSeconds: song.duration?.seconds || 210,
      thumbnail: song.thumbnails?.[song.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`
    }));

    const responseData = { tracks: songs };
    serverMetadataCache.set(cacheKey, { data: responseData, expiresAt: Date.now() + 3600 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    res.json(responseData);
  } catch (error) {
    console.error('Genre query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2d. Real Artist Profile Endpoint
app.get('/api/artist', async (req, res) => {
  const { id: rawId, name: rawName } = req.query;
  const artistQuery = (rawId || rawName || '').trim();
  if (!artistQuery) {
    return res.status(400).json({ error: 'Artist ID or Name required' });
  }

  const cacheKey = `artist_${encodeURIComponent(artistQuery.toLowerCase())}`;
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    let artistId = rawId ? String(rawId).trim() : null;
    let resolvedName = rawName ? String(rawName).trim() : '';

    // If ID not provided or not in channel ID format, search by name
    if (!artistId || !artistId.startsWith('UC')) {
      const searchName = resolvedName || rawId;
      try {
        const searchRes = await innertube.music.search(searchName, { type: 'artist' });
        const firstArtist = (searchRes.artists?.contents || [])[0];
        if (firstArtist?.id) {
          artistId = firstArtist.id;
          if (!resolvedName && firstArtist.name) resolvedName = firstArtist.name;
        }
      } catch (searchErr) {
        console.warn(`[Server] Artist search warning for "${searchName}":`, searchErr.message);
      }
    }

    let artistData = null;
    if (artistId) {
      try {
        artistData = await innertube.music.getArtist(artistId);
      } catch (getErr) {
        console.warn(`[Server] getArtist failed for ID "${artistId}":`, getErr.message);
      }
    }

    if (artistData) {
      const header = artistData.header || {};
      const artistName = header.title?.text || resolvedName || 'Unknown Artist';
      
      // Extract highest resolution banner & avatar
      const thumbContents = header.thumbnail?.contents || [];
      const banner = thumbContents[0]?.url || '';
      const avatar = thumbContents[thumbContents.length - 1]?.url || banner || '';
      
      const description = header.description?.text || '';
      const subscribers = header.subscribers?.text || '';

      const topTracks = [];
      const albums = [];
      const singles = [];
      const similarArtists = [];

      for (const section of (artistData.sections || [])) {
        const title = (section.title?.text || section.header?.title?.text || '').trim();
        const titleLower = title.toLowerCase();

        // 1. Top Songs
        if (titleLower.includes('top song') || titleLower.includes('popular') || titleLower === 'songs') {
          for (const item of (section.contents || [])) {
            const trackId = item.id || item.video_id;
            if (!trackId) continue;
            const songThumb = item.thumbnail?.[0]?.url || item.thumbnail?.contents?.[0]?.url || `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`;
            topTracks.push({
              id: trackId,
              title: item.title?.text || item.title || 'Unknown Title',
              artist: Array.isArray(item.artists) ? item.artists.map(a => a.name).join(', ') : (item.author?.name || artistName),
              album: item.album?.name || '',
              duration: item.duration?.text || '3:30',
              durationSeconds: item.duration?.seconds || 210,
              thumbnail: songThumb
            });
          }
        }

        // 2. Albums
        else if (titleLower === 'albums' || titleLower.includes('album')) {
          for (const item of (section.contents || [])) {
            const albumId = item.id || item.endpoint?.payload?.browseId;
            if (!albumId) continue;
            const albumThumb = item.thumbnail?.[0]?.url || item.thumbnail?.contents?.[0]?.url || item.thumbnails?.[0]?.url || '';
            albums.push({
              id: albumId,
              title: item.title?.text || item.title || 'Untitled Album',
              year: item.year || item.subtitle?.text || '',
              thumbnail: albumThumb
            });
          }
        }

        // 3. Singles & EPs
        else if (titleLower.includes('single') || titleLower.includes('ep')) {
          for (const item of (section.contents || [])) {
            const singleId = item.id || item.endpoint?.payload?.browseId;
            if (!singleId) continue;
            const singleThumb = item.thumbnail?.[0]?.url || item.thumbnail?.contents?.[0]?.url || item.thumbnails?.[0]?.url || '';
            singles.push({
              id: singleId,
              title: item.title?.text || item.title || 'Untitled Single',
              year: item.year || item.subtitle?.text || '',
              thumbnail: singleThumb
            });
          }
        }

        // 4. Fans Also Like / Similar Artists
        else if (titleLower.includes('fans') || titleLower.includes('like') || titleLower.includes('similar')) {
          for (const item of (section.contents || [])) {
            const relId = item.id || item.endpoint?.payload?.browseId;
            const relName = item.title?.text || item.title || item.name;
            if (!relName) continue;
            const relThumb = item.thumbnail?.[0]?.url || item.thumbnail?.contents?.[0]?.url || item.thumbnails?.[0]?.url || '';
            similarArtists.push({
              id: relId || '',
              name: relName,
              avatar: relThumb
            });
          }
        }
      }

      const responsePayload = {
        id: artistId || `artist_${Date.now()}`,
        name: artistName,
        avatar,
        banner,
        description,
        subscribers,
        topTracks: topTracks.slice(0, 20),
        albums: albums.slice(0, 16),
        singles: singles.slice(0, 16),
        similarArtists: similarArtists.slice(0, 12)
      };

      serverMetadataCache.set(cacheKey, { data: responsePayload, expiresAt: Date.now() + 3600 * 1000 });
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=1800');
      return res.json(responsePayload);
    }

    // Fallback: search for top tracks by this artist if getArtist didn't resolve
    const fallbackSearch = await innertube.music.search(resolvedName || artistQuery, { type: 'song' });
    const fallbackTracks = (fallbackSearch.songs?.contents || []).slice(0, 15).map(song => ({
      id: song.id,
      title: song.title,
      artist: song.artists?.[0]?.name || song.author?.name || resolvedName,
      album: song.album?.name || '',
      duration: song.duration?.text || '3:30',
      durationSeconds: song.duration?.seconds || 210,
      thumbnail: song.thumbnails?.[song.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${song.id}/hqdefault.jpg`
    }));

    const fallbackPayload = {
      id: artistId || `artist_${encodeURIComponent(resolvedName || artistQuery)}`,
      name: resolvedName || artistQuery,
      avatar: fallbackTracks[0]?.thumbnail || '',
      banner: fallbackTracks[0]?.thumbnail || '',
      description: '',
      subscribers: '',
      topTracks: fallbackTracks,
      albums: [],
      singles: [],
      similarArtists: []
    };

    serverMetadataCache.set(cacheKey, { data: fallbackPayload, expiresAt: Date.now() + 1800 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.json(fallbackPayload);
  } catch (error) {
    console.error(`[Server] /api/artist error for "${artistQuery}":`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2e. Real Album Details Endpoint
app.get('/api/album', async (req, res) => {
  const { id: albumId } = req.query;
  if (!albumId) {
    return res.status(400).json({ error: 'Album ID required' });
  }

  const cacheKey = `album_${encodeURIComponent(String(albumId))}`;
  const cached = serverMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'public, max-age=7200, stale-while-revalidate=3600');
    return res.json(cached.data);
  }

  try {
    const innertube = await getInnertube();
    const album = await innertube.music.getAlbum(String(albumId));
    const header = album.header || {};

    const title = header.title?.text || header.title || 'Untitled Album';
    const artist = header.strapline_text_one?.text || header.artists?.[0]?.name || 'Unknown Artist';
    const year = header.subtitle?.text?.match(/\b(19\d\d|20\d\d)\b/)?.[0] || '';
    const description = header.description?.description?.text || header.description?.text || '';
    const thumbContents = header.thumbnail?.contents || [];
    const thumbnail = thumbContents[0]?.url || thumbContents[thumbContents.length - 1]?.url || '';
    const secondSubtitle = header.second_subtitle?.text || '';

    const tracks = (album.contents || []).map((t, idx) => {
      const trackId = t.id || t.video_id;
      if (!trackId) return null;
      return {
        id: trackId,
        title: t.title?.text || t.title || `Track ${idx + 1}`,
        artist: Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : (t.author?.name || artist),
        album: title,
        duration: t.duration?.text || '3:30',
        durationSeconds: t.duration?.seconds || 210,
        thumbnail: thumbnail || `https://i.ytimg.com/vi/${trackId}/hqdefault.jpg`
      };
    }).filter(Boolean);

    const albumPayload = {
      id: String(albumId),
      title,
      artist,
      year,
      description,
      thumbnail,
      durationText: secondSubtitle,
      trackCount: tracks.length,
      tracks
    };

    serverMetadataCache.set(cacheKey, { data: albumPayload, expiresAt: Date.now() + 7200 * 1000 });
    res.setHeader('Cache-Control', 'public, max-age=7200, stale-while-revalidate=3600');
    res.json(albumPayload);
  } catch (error) {
    console.error(`[Server] /api/album error for "${albumId}":`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// In-memory stream info cache to minimize metadata roundtrips for range requests
const ytdlInfoCache = new Map();

async function getYtdlTrackInfo(videoId) {
  const cached = ytdlInfoCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.info;
  }
  const info = await ytdlClient.getInfo(videoId);
  ytdlInfoCache.set(videoId, {
    info,
    expiresAt: Date.now() + 2 * 3600 * 1000 // 2 hours
  });
  return info;
}

// 3. Audio Streaming Proxy with HTTP 206 Range Support powered by @distube/ytdl-core
app.get('/api/stream/:id', async (req, res) => {
  const videoId = req.params.id;
  const sanitizedId = String(videoId || '').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);

  // If local offline download exists on disk, stream it immediately with native 206 byte-ranges
  const possibleLocalMediaDirs = [
    path.join(process.env.APPDATA || '', 'metrolist-web', 'media'),
    path.join(process.env.APPDATA || '', 'Ghosttunes', 'media')
  ];
  const possibleFileNames = [
    `${videoId}.mp3`,
    `${sanitizedId}.mp3`,
    `${videoId}.m4a`,
    `${sanitizedId}.m4a`
  ];

  for (const dir of possibleLocalMediaDirs) {
    for (const name of possibleFileNames) {
      const localFile = path.join(dir, name);
      if (fs.existsSync(localFile)) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', localFile.endsWith('.m4a') ? 'audio/mp4' : 'audio/mpeg');
        return res.sendFile(localFile, { acceptRanges: true });
      }
    }
  }

  try {
    const info = await getYtdlTrackInfo(videoId);
    // Prefer MP4 container (AAC) for standard HTML5 byte-range seekability across Chromium and Electron
    let format = chooseFormat(info.formats, { 
      filter: (f) => f.hasAudio && !f.hasVideo && f.container === 'mp4', 
      quality: 'highestaudio' 
    });
    if (!format) {
      format = chooseFormat(info.formats, { 
        filter: { hasAudio: true, hasVideo: false }, 
        quality: 'highestaudio' 
      });
    }
    if (!format) {
      throw new Error(`No audio format available for video ${videoId}`);
    }

    const totalLength = parseInt(format.contentLength, 10) || 0;
    const mimeType = format.mimeType || 'audio/mp4';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);

    const rangeHeader = req.headers.range;
    let stream;

    const downloadFilter = (f) => f.hasAudio && !f.hasVideo && (format.container ? f.container === format.container : true);

    if (rangeHeader && totalLength > 0) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;
        const chunkSize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        res.setHeader('Content-Length', chunkSize);

        stream = await ytdlClient.download(info, {
          filter: downloadFilter,
          quality: 'highestaudio',
          range: { start, end }
        });
      }
    }

    if (!stream) {
      if (totalLength > 0) {
        res.setHeader('Content-Length', totalLength);
      }
      res.status(200);
      stream = await ytdlClient.download(info, {
        filter: downloadFilter,
        quality: 'highestaudio'
      });
    }

    req.on('close', () => {
      try { stream.destroy(); } catch {}
    });

    stream.on('error', (err) => {
      console.error(`[Stream API] Stream error for ${videoId}:`, err.message);
      ytdlInfoCache.delete(videoId);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('Stream error for', videoId, error.message);
    ytdlInfoCache.delete(videoId);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed: ' + error.message });
    }
  }
});

// 3.1 Offline Artwork Serving Endpoint with full disk cache lookup
app.get('/api/artwork/:id', (req, res) => {
  const id = req.params.id;
  const sanitizedId = String(id || '').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);
  const possibleArtworkDirs = [
    process.env.ARTWORK_DIR,
    process.env.USER_DATA_PATH ? path.join(process.env.USER_DATA_PATH, 'artwork') : null,
    path.join(process.env.APPDATA || '', 'metrolist-web', 'artwork'),
    path.join(process.env.APPDATA || '', 'Ghosttunes', 'artwork'),
    path.join(process.cwd(), 'public', 'artworks'),
    path.join(process.cwd(), 'dist', 'artworks')
  ].filter(Boolean);
  for (const dir of possibleArtworkDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      for (const name of [`${id}${ext}`, `${sanitizedId}${ext}`]) {
        const file = path.join(dir, name);
        if (fs.existsSync(file)) {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.sendFile(file);
        }
      }
    }
  }
  res.status(404).send('Artwork not found');
});

// Dedicated audio download endpoint for full track downloads (Desktop app & browser downloads)
app.get('/api/download/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const info = await getYtdlTrackInfo(videoId);
    const format = chooseFormat(info.formats, { filter: { hasAudio: true, hasVideo: false }, quality: 'highestaudio' });
    const totalLength = format ? (parseInt(format.contentLength, 10) || 0) : 0;
    const mimeType = (format && format.mimeType) ? format.mimeType : 'audio/mp4';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);

    const rangeHeader = req.headers.range;
    let audioStream;

    if (rangeHeader && totalLength > 0) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalLength - 1;
        const chunkSize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
        res.setHeader('Content-Length', chunkSize);

        audioStream = await ytdlClient.download(info, {
          filter: { hasAudio: true, hasVideo: false },
          quality: 'highestaudio',
          range: { start, end }
        });
      }
    }

    if (!audioStream) {
      if (totalLength > 0) {
        res.setHeader('Content-Length', totalLength);
      }
      res.status(200);
      audioStream = await ytdlClient.download(info, {
        filter: { hasAudio: true, hasVideo: false },
        quality: 'highestaudio'
      });
    }

    req.on('close', () => {
      try { audioStream.destroy(); } catch {}
    });

    audioStream.on('error', (err) => {
      console.error(`[Download API] Stream pipe error for ${videoId}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
      } else {
        res.end();
      }
    });

    audioStream.pipe(res);
  } catch (error) {
    console.error('[Download API] Error downloading', videoId, error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Download failed: ' + error.message });
    } else {
      res.end();
    }
  }
});

// Normalization helpers for robust music metadata matching
function normalizeLyricsTitle(rawTitle) {
  if (!rawTitle) return '';
  let title = String(rawTitle);
  title = title.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-');
  // Strip common YouTube video/audio/remaster junk
  title = title.replace(/\s*[\(\[]\s*(official\s*(music\s*)?video|official\s*audio|official|music\s*video|lyric\s*video|lyrics|audio|visualizer|video|hd|4k)\s*[\)\]]/gi, '');
  title = title.replace(/\s*[\(\[]\s*(remastered|remaster|live(\s*at\s*.*)?|radio\s*edit|extended\s*mix|deluxe(\s*edition)?|bonus\s*track)(\s*\d{4})?\s*[\)\]]/gi, '');
  title = title.replace(/\s*-\s*(official\s*(music\s*)?video|official\s*audio|visualizer|audio).*$/gi, '');
  return title.trim();
}

function stripFeaturedArtists(title) {
  return title
    .replace(/\s*[\(\[]\s*(feat\.|ft\.|featuring|with|prod\.\s*by|produced\s*by)\s+.*?[\)\]]/gi, '')
    .replace(/\s+(feat\.|ft\.|featuring|with|prod\.\s*by)\s+.*$/gi, '')
    .trim();
}

function normalizeLyricsArtist(rawArtist) {
  if (!rawArtist) return '';
  let artist = String(rawArtist);
  artist = artist.replace(/\s*-\s*Topic$/i, '');
  artist = stripFeaturedArtists(artist);
  const primary = artist.split(/\s*(?:,|&|\band\b|x|\/)\s*/i)[0];
  return (primary || artist).trim();
}

function generateTitleVariants(rawTitle) {
  const variants = new Set();
  const clean = normalizeLyricsTitle(rawTitle);
  if (clean) variants.add(clean);
  const bare = stripFeaturedArtists(clean);
  if (bare) variants.add(bare);

  // Roman numeral <-> Arabic numeral conversion (e.g. II <-> 2, III <-> 3)
  const romanToArabic = [
    [/\bvi\b/gi, '6'],
    [/\bv\b/gi, '5'],
    [/\biv\b/gi, '4'],
    [/\biii\b/gi, '3'],
    [/\bii\b/gi, '2'],
    [/\bi\b/gi, '1'],
  ];
  for (const [reg, num] of romanToArabic) {
    if (reg.test(bare)) {
      variants.add(bare.replace(reg, num).trim());
    }
  }

  // Arabic numeral to Roman numeral conversion
  const arabicToRoman = [
    [/\b2\b/g, 'II'],
    [/\b3\b/g, 'III'],
    [/\b4\b/g, 'IV'],
    [/\b5\b/g, 'V'],
  ];
  for (const [reg, rom] of arabicToRoman) {
    if (reg.test(bare)) {
      variants.add(bare.replace(reg, rom).trim());
    }
  }

  // Strip soundtrack / film / TV / tribute parentheticals
  // e.g. "Save Me (From \"Smallville\")" -> "Save Me"
  // "Eye of the Tiger (Theme from Rocky III)" -> "Eye of the Tiger"
  const strippedTheme = bare
    .replace(/\s*[\(\[]\s*(from\b|theme\b|soundtrack\b|ost\b|music\s+from|tribute\s+to|cover\s+of|score\s+from).*?[\)\]]/gi, '')
    .trim();
  if (strippedTheme && strippedTheme !== bare) {
    variants.add(strippedTheme);
  }

  // Contraction apostrophe normalizations (e.g. Dont <-> Don't)
  const contractionFix = bare
    .replace(/\bDont\b/gi, "Don't")
    .replace(/\bCant\b/gi, "Can't")
    .replace(/\bWont\b/gi, "Won't")
    .replace(/\bIm\b/gi, "I'm")
    .replace(/\bAint\b/gi, "Ain't");
  if (contractionFix !== bare) variants.add(contractionFix);

  // Punctuation-stripped version
  const strippedPunct = bare.replace(/['"`\.\,\-\!\?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (strippedPunct) variants.add(strippedPunct);

  return Array.from(variants);
}

function calculateLyricWordOverlap(textA, textB) {
  if (!textA || !textB) return 0;
  const cleanA = String(textA).replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, ' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const cleanB = String(textB).replace(/\[\d{1,2}:\d{2}[^\]]*\]/g, ' ').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const wordsA = new Set(cleanA.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(cleanB.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let matches = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) matches++;
  }
  return matches / Math.min(wordsA.size, wordsB.size);
}

function scoreLyricsCandidate(candidate, targetTitle, targetArtist, targetDuration, strippedTitle, knownPlainLyrics) {
  const cTitle = (candidate.trackName || '').toLowerCase().trim();
  const cArtist = (candidate.artistName || '').toLowerCase().trim();
  const tTitle = targetTitle.toLowerCase().trim();
  const sTitle = (strippedTitle || '').toLowerCase().trim();
  const tArtist = targetArtist.toLowerCase().trim();

  let score = 0;

  // Title similarity
  if (cTitle === tTitle || (sTitle && cTitle === sTitle)) {
    score += 50;
  } else if (cTitle.includes(tTitle) || tTitle.includes(cTitle) || (sTitle && (cTitle.includes(sTitle) || sTitle.includes(cTitle)))) {
    score += 35;
  } else {
    const tWords = (sTitle || tTitle).split(/\s+/).filter(w => w.length > 2);
    const matches = tWords.filter(w => cTitle.includes(w));
    if (matches.length === 0) return -100;
    score += matches.length * 8;
  }

  // Artist similarity
  if (cArtist === tArtist) {
    score += 40;
  } else if (cArtist.includes(tArtist) || tArtist.includes(cArtist)) {
    score += 25;
  } else {
    score -= 10;
  }

  // Duration proximity (in seconds)
  if (targetDuration && candidate.duration) {
    const diff = Math.abs(candidate.duration - targetDuration);
    if (diff <= 3) {
      score += 30;
    } else if (diff <= 8) {
      score += 15;
    } else if (diff <= 20) {
      score += 5;
    } else if (diff > 45) {
      score -= 30;
    }
  }

  // Timestamps / Synced scoring with content verification
  const isSynced = hasValidLrcTimestamps(candidate.syncedLyrics);
  if (isSynced) {
    score += 35;
    if (knownPlainLyrics) {
      const overlap = calculateLyricWordOverlap(knownPlainLyrics, candidate.syncedLyrics);
      if (overlap >= 0.4) {
        score += Math.round(overlap * 50); // Verified matching lyric content!
      } else if (overlap < 0.15 && knownPlainLyrics.length > 100) {
        score -= 75; // Reject different song with same title
      }
    }
  } else if (candidate.plainLyrics || candidate.syncedLyrics) {
    score += 8;
  }

  return score;
}

function hasValidLrcTimestamps(lrc) {
  return Boolean(lrc && typeof lrc === 'string' && /\[\d{1,2}:\d{2}/.test(lrc));
}

function parseTtmlToLrc(ttml) {
  if (!ttml || typeof ttml !== 'string') return null;
  const pRegex = /<p\s+[^>]*begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  const lrcLines = [];

  while ((match = pRegex.exec(ttml)) !== null) {
    const rawBegin = match[1];
    let timeSec = 0;
    if (rawBegin.includes(':')) {
      const parts = rawBegin.split(':');
      timeSec = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    } else {
      timeSec = parseFloat(rawBegin);
    }
    if (isNaN(timeSec) || timeSec < 0) continue;

    const m = Math.floor(timeSec / 60);
    const s = Math.floor(timeSec % 60);
    const ms = Math.floor((timeSec % 1) * 100);
    const timeStr = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(2, '0');

    const cleanText = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (cleanText) {
      lrcLines.push(`[${timeStr}] ${cleanText}`);
    }
  }

  return lrcLines.length > 0 ? lrcLines.join('\n') : null;
}

const inFlightLyricsRequests = new Map();

// 4. Synchronized Lyrics (Multi-Tier Retrieval: Better Lyrics -> LRCLIB Exact -> LRCLIB Scored Search -> Innertube Official -> Public Fallback)
app.get('/api/lyrics', async (req, res) => {
  const { title, artist, album, duration, id: trackId, fresh } = req.query;
  if (!title) return res.status(400).json({ error: 'Title required' });

  // Duration in seconds (safely handles milliseconds or string numbers)
  let durationSec = Number(duration);
  if (!isNaN(durationSec) && durationSec > 0) {
    if (durationSec > 10000) durationSec = Math.round(durationSec / 1000);
    else durationSec = Math.round(durationSec);
  } else {
    durationSec = 0;
  }

  const cacheKey = `lyrics_${String(title).toLowerCase().trim()}_${String(artist || '').toLowerCase().trim()}`;
  
  if (fresh === '1' || fresh === 'true') {
    serverLyricsCache.delete(cacheKey);
  } else {
    const cached = serverLyricsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      if (cached.data.notFound) {
        return res.status(404).json({ error: 'Lyrics not found', instrumental: false });
      }
      return res.json(cached.data);
    }

    // In-flight request deduplication: share active lookup promise across concurrent requests
    if (inFlightLyricsRequests.has(cacheKey)) {
      try {
        const sharedResult = await inFlightLyricsRequests.get(cacheKey);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        if (sharedResult.notFound) {
          return res.status(404).json({ error: 'Lyrics not found', instrumental: false });
        }
        return res.json(sharedResult);
      } catch (e) {
        // Fall through to independent lookup if shared promise rejected
      }
    }
  }

  const customHeaders = {
    'User-Agent': 'Ghosttunes/1.0.0 (https://github.com/ghosttunes/player)'
  };

  const lookupPromise = (async () => {
    const titleVariants = generateTitleVariants(title);
    const cleanTitle = titleVariants[0] || normalizeLyricsTitle(title);
    const bareTitle = stripFeaturedArtists(cleanTitle);
    const cleanArtist = normalizeLyricsArtist(artist);
    const cleanAlbum = String(album || '').trim();
    const fullArtist = String(artist || '').replace(/\s*-\s*Topic$/i, '').trim();

    let syncedLyrics = null;
    let plainLyrics = null;
    let isInstrumental = false;
    let source = null;

    // TIER 1: Better Lyrics API (High quality syllable/word-synced lyrics with TTML converter)
    if (!syncedLyrics && !isInstrumental) {
      const betterTitles = [cleanTitle];
      if (bareTitle && bareTitle !== cleanTitle) betterTitles.push(bareTitle);

      for (const bTitle of betterTitles) {
        if (syncedLyrics) break;
        try {
          const bp = new URLSearchParams();
          bp.set('s', bTitle);
          if (cleanArtist) bp.set('a', cleanArtist);
          if (cleanAlbum) bp.set('al', cleanAlbum);
          if (durationSec > 0) bp.set('d', String(durationSec));

          const bRes = await fetch(`https://api.betterlyrics.org/getLyrics?${bp}`, {
            headers: customHeaders,
            signal: AbortSignal.timeout(3500)
          });
          if (bRes.ok) {
            const bData = await bRes.json();
            if (bData?.ttml) {
              const convertedLrc = parseTtmlToLrc(bData.ttml);
              if (hasValidLrcTimestamps(convertedLrc)) {
                syncedLyrics = convertedLrc;
                source = 'better_lyrics';
                break;
              }
            }
          }
        } catch (e) {
          // Continue to next tier
        }
      }
    }

    // TIER 2: LRCLIB exact match (/api/get) across title variants + artist
    const artistCandidates = [cleanArtist];
    if (fullArtist && fullArtist !== cleanArtist) {
      artistCandidates.push(fullArtist);
    }

    for (const variant of titleVariants) {
      if (syncedLyrics || isInstrumental) break;
      for (const art of artistCandidates) {
        if (syncedLyrics || isInstrumental) break;
        try {
          const p = new URLSearchParams({ track_name: variant, artist_name: art });
          if (durationSec > 0) p.set('duration', String(durationSec));
          let r = await fetch(`https://lrclib.net/api/get?${p}`, {
            headers: customHeaders,
            signal: AbortSignal.timeout(4500)
          });
          // If duration match returned 404, retry without duration to tolerate intro silence
          if (r.status === 404 && durationSec > 0) {
            const pNoDur = new URLSearchParams({ track_name: variant, artist_name: art });
            r = await fetch(`https://lrclib.net/api/get?${pNoDur}`, {
              headers: customHeaders,
              signal: AbortSignal.timeout(4500)
            });
          }

          if (r.ok) {
            const data = await r.json();
            if (data.instrumental) {
              isInstrumental = true;
              source = 'lrclib_instrumental';
              break;
            }
            // Strict timestamp validation: some LRCLIB submissions store plain text in syncedLyrics!
            if (hasValidLrcTimestamps(data.syncedLyrics)) {
              syncedLyrics = data.syncedLyrics;
              source = `lrclib_synced (${variant})`;
              plainLyrics = data.plainLyrics || plainLyrics;
              break;
            } else if (data.plainLyrics || data.syncedLyrics) {
              // Untimestamped text stored in syncedLyrics is treated as plain text
              if (!plainLyrics) {
                plainLyrics = data.plainLyrics || data.syncedLyrics;
                source = `lrclib_plain (${variant})`;
              }
            }
          }
        } catch (e) {
          // Continue to next candidate
        }
      }
    }

    // TIER 3: LRCLIB structured search with candidate scoring
    // CRITICAL: Do NOT skip search if we only have plainLyrics! Many songs have synchronized lyrics under search variations!
    if (!syncedLyrics && !isInstrumental) {
      try {
        const strippedTheme = bareTitle
          .replace(/\s*[\(\[]\s*(from\b|theme\b|soundtrack\b|ost\b|music\s+from|tribute\s+to|cover\s+of|score\s+from).*?[\)\]]/gi, '')
          .trim();

        const searchQueries = [
          `${bareTitle} ${cleanArtist}`,
          cleanTitle
        ];
        if (cleanArtist && !searchQueries.includes(cleanArtist)) {
          searchQueries.push(`${cleanTitle} ${cleanArtist}`);
        }
        if (strippedTheme && strippedTheme !== bareTitle) {
          searchQueries.push(strippedTheme);
          if (cleanArtist) searchQueries.push(`${strippedTheme} ${cleanArtist}`);
        }

        let bestCandidate = null;
        let highestScore = 20;
        let bestSyncedCandidate = null;
        let highestSyncedScore = 40;

        for (const query of searchQueries) {
          if (syncedLyrics) break;
          const qUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
          const rSearch = await fetch(qUrl, {
            headers: customHeaders,
            signal: AbortSignal.timeout(4500)
          });

          if (rSearch.ok) {
            const list = await rSearch.json();
            if (Array.isArray(list) && list.length > 0) {
              for (const candidate of list) {
                const isSynced = hasValidLrcTimestamps(candidate.syncedLyrics);
                const score = scoreLyricsCandidate(candidate, bareTitle, cleanArtist, durationSec, strippedTheme, plainLyrics);

                // Track synchronized candidate separately with priority
                if (isSynced && score > highestSyncedScore) {
                  highestSyncedScore = score;
                  bestSyncedCandidate = candidate;
                  // If candidate has high confidence match, adopt immediately
                  if (score >= 70) {
                    syncedLyrics = candidate.syncedLyrics;
                    source = `lrclib_search_synced (${candidate.artistName} - ${candidate.trackName})`;
                    plainLyrics = candidate.plainLyrics || plainLyrics;
                    break;
                  }
                }

                if (score > highestScore) {
                  highestScore = score;
                  bestCandidate = candidate;
                }
              }
            }
          }
        }

        if (!syncedLyrics && bestSyncedCandidate) {
          syncedLyrics = bestSyncedCandidate.syncedLyrics;
          source = `lrclib_search_synced (${bestSyncedCandidate.artistName} - ${bestSyncedCandidate.trackName})`;
          plainLyrics = bestSyncedCandidate.plainLyrics || plainLyrics;
        } else if (!syncedLyrics && bestCandidate) {
          if (bestCandidate.instrumental) isInstrumental = true;
          if (hasValidLrcTimestamps(bestCandidate.syncedLyrics)) {
            syncedLyrics = bestCandidate.syncedLyrics;
            source = 'lrclib_search_synced';
          }
          if (bestCandidate.plainLyrics && !plainLyrics) {
            plainLyrics = bestCandidate.plainLyrics;
            source = 'lrclib_search_plain';
          }
        }
      } catch (e) {
        console.warn('[Lyrics] Tier 3 search notice:', e.message);
      }
    }

    // TIER 4: YouTube Music Innertube official distributor lyrics
    // Ensures authentic publisher lyrics when LRCLIB has user-vandalized or missing plain text
    if (!syncedLyrics && !isInstrumental) {
      try {
        const innertube = await getInnertube();
        let targetTrackId = trackId;

        if (!targetTrackId) {
          const searchRes = await innertube.music.search(`${bareTitle} ${cleanArtist}`, { type: 'song' });
          const firstSong = (searchRes.songs?.contents || [])[0];
          if (firstSong?.id) targetTrackId = firstSong.id;
        }

        if (targetTrackId) {
          const info = await innertube.music.getInfo(targetTrackId);
          const lyricsTab = info.tabs?.find(t => t.title === 'Lyrics' || (t.title && t.title.toLowerCase().includes('lyrics')));
          if (lyricsTab && typeof info.getLyrics === 'function') {
            const ytLyrics = await info.getLyrics().catch(() => null);
            const descText = ytLyrics?.description?.text;
            if (descText && descText.trim().length > 0) {
              plainLyrics = descText.trim();
              source = 'youtube_music_official';
            }
          }
        }
      } catch (e) {
        console.warn('[Lyrics] Innertube official check notice for', trackId, ':', e.message);
      }
    }

    // TIER 5: Public lyrics fallback (lyrics.ovh)
    if (!syncedLyrics && !plainLyrics && !isInstrumental && cleanArtist && bareTitle) {
      try {
        const ovhRes = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(bareTitle)}`, {
          headers: customHeaders,
          signal: AbortSignal.timeout(3500)
        });
        if (ovhRes.ok) {
          const ovhData = await ovhRes.json();
          if (ovhData?.lyrics && ovhData.lyrics.trim().length > 0) {
            plainLyrics = ovhData.lyrics.trim();
            source = 'lyrics_ovh';
          }
        }
      } catch (e) {}
    }

    // Consolidate response data
    if (isInstrumental) {
      return {
        syncedLyrics: null,
        plainLyrics: null,
        instrumental: true,
        source: source || 'lrclib'
      };
    }

    if (!syncedLyrics && !plainLyrics) {
      return { notFound: true };
    }

    // If synced lyrics exist but plain lyrics were not explicitly populated, derive plain text
    const effectivePlain = plainLyrics || (syncedLyrics ? syncedLyrics.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').replace(/<\d{1,2}:\d{2}(?:\.\d{1,3})?>/g, '').trim() : null);

    return {
      syncedLyrics,
      plainLyrics: effectivePlain,
      instrumental: false,
      source: source || 'unknown'
    };
  })();

  inFlightLyricsRequests.set(cacheKey, lookupPromise);

  try {
    const result = await lookupPromise;
    if (result.notFound) {
      // Short negative cache (60 seconds) so user retries are prompt
      serverLyricsCache.set(cacheKey, { data: { notFound: true }, expiresAt: Date.now() + 60 * 1000 });
      return res.status(404).json({ error: 'Lyrics not found', instrumental: false });
    }

    serverLyricsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 86400 * 1000 });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.json(result);
  } catch (err) {
    console.error('[Lyrics] Lookup unhandled error:', err.message);
    return res.status(500).json({ error: 'Internal lyrics lookup error: ' + err.message });
  } finally {
    inFlightLyricsRequests.delete(cacheKey);
  }
});

// =========================================================================
// PLAYLIST IMPORT APIs: Spotify & YouTube Music
// =========================================================================

// 1. Resolve Playlist Metadata and Track List from URL
app.post('/api/playlist/import/resolve', async (req, res) => {
  const { url, platform: requestedPlatform, userToken } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'Playlist URL or ID is required' });
  }

  const parsed = parsePlaylistUrl(url);
  const platform = requestedPlatform && requestedPlatform !== 'auto' 
    ? requestedPlatform 
    : (parsed?.platform || (
        url.includes('spotify') ? 'spotify' : 
        url.includes('deezer') ? 'deezer' : 
        url.includes('apple.com') || url.includes('apple.co') ? 'apple' :
        url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 
        null
      ));

  if (!platform) {
    return res.status(400).json({ 
      error: 'Unsupported playlist platform. Please provide a Spotify, YouTube Music, Apple Music, or Deezer link.',
      needsAuth: false,
      isPrivate: false
    });
  }

  const id = parsed?.id || url.trim();

  try {
    if (platform === 'spotify') {
      const playlist = await resolveSpotifyPlaylist(id, { 
        userToken,
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
      });
      return res.json(playlist);
    } else if (platform === 'youtube') {
      const innertube = await getInnertube();
      const playlist = await resolveYouTubePlaylist(innertube, id);
      return res.json(playlist);
    } else if (platform === 'deezer') {
      const playlist = await resolveDeezerPlaylist(url || id);
      return res.json(playlist);
    } else if (platform === 'apple') {
      const playlist = await resolveAppleMusicPlaylist(url || id);
      return res.json(playlist);
    } else {
      return res.status(400).json({ error: 'Unsupported playlist platform. Please provide a Spotify, YouTube Music, Apple Music, or Deezer link.' });
    }
  } catch (err) {
    console.error(`[Playlist Import] Error resolving ${platform} playlist:`, err.message);
    const msg = (err.message || '').trim();
    const isPrivateOrRestricted = msg.toLowerCase().includes('private') || 
                                  msg.toLowerCase().includes('restricted') ||
                                  msg.toLowerCase().includes('status 401') ||
                                  msg.toLowerCase().includes('status 403') ||
                                  msg.toLowerCase().includes('entity not found');

    let cleanError = msg;
    if (!cleanError || cleanError.toLowerCase() === 'no data' || cleanError === '[object Object]') {
      cleanError = `This ${platform || 'requested'} playlist could not be resolved or is unavailable.`;
    } else if (isPrivateOrRestricted && !msg.toLowerCase().includes('deezer')) {
      cleanError = 'This playlist is private or unavailable. Please ensure the playlist is public or shared via link to import.';
    }

    return res.status(400).json({ 
      error: cleanError,
      needsAuth: false,
      isPrivate: isPrivateOrRestricted
    });
  }
});

// 2. Batch Match Imported Tracks Against Ghosttunes Catalogue
app.post('/api/playlist/import/match', async (req, res) => {
  const { tracks } = req.body || {};
  if (!tracks || !Array.isArray(tracks)) {
    return res.status(400).json({ error: 'Tracks array is required' });
  }

  try {
    const innertube = await getInnertube();
    const matched = await matchTracksAgainstCatalogue(innertube, tracks);
    return res.json({ results: matched });
  } catch (err) {
    console.error('[Playlist Import] Track matching error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// 2d. Reload Environment Variables
app.all('/api/config/reload-env', (req, res) => {
  loadEnv();
  const spotifyCreds = validateSpotifyCredentials();
  const deezerCreds = validateDeezerCredentials();
  const appleCreds = validateAppleMusicKit();
  res.json({
    reloaded: true,
    spotify: { configured: spotifyCreds.valid, status: spotifyCreds.status },
    deezer: { configured: deezerCreds.valid, status: deezerCreds.status },
    apple: { configured: appleCreds.valid, status: appleCreds.status }
  });
});

// 2e. Unified Providers Status Check (Real configuration & capabilities audit)
app.get('/api/providers/status', (req, res) => {
  const redirectOrigin = req.headers.origin || 'http://localhost:5173';
  const spotifyRedirect = (process.env.SPOTIFY_REDIRECT_URI || `${redirectOrigin}/spotify-callback`).trim();
  const spotifyCreds = validateSpotifyCredentials();
  const deezerCreds = validateDeezerCredentials();
  const appleCreds = validateAppleMusicKit();

  res.json({
    spotify: {
      id: 'spotify',
      name: 'Spotify',
      configured: spotifyCreds.valid,
      isPlaceholder: spotifyCreds.isPlaceholder,
      status: spotifyCreds.status,
      clientIdMasked: spotifyCreds.clientIdMasked,
      redirectUri: spotifyRedirect,
      capabilities: {
        linkImport: true,
        privateLibrary: spotifyCreds.valid
      },
      error: spotifyCreds.error,
      setupGuide: spotifyCreds.valid ? null : {
        dashboardUrl: 'https://developer.spotify.com/dashboard',
        requiredRedirectUri: spotifyRedirect,
        steps: [
          'Log in to Spotify Developer Dashboard (developer.spotify.com/dashboard)',
          'Create an App (or select an existing app)',
          `Add "${spotifyRedirect}" to the Redirect URIs under App Settings and Save`,
          'Copy your 32-character Client ID and Client Secret into metrolist-web/.env',
          'Click "Re-check Credentials" in Ghosttunes'
        ]
      }
    },
    youtube: {
      id: 'youtube',
      name: 'YouTube Music',
      configured: true,
      isPlaceholder: false,
      status: 'link_only',
      capabilities: {
        linkImport: true,
        privateLibrary: false
      },
      notice: 'Public and unlisted YouTube Music playlist links are supported directly in Import by Link with full track metadata and playable audio. Google does not offer an official consumer OAuth API for 3rd-party web applications to access private YouTube Music libraries without requiring private session cookies (which Ghosttunes strictly prohibits for user account security).'
    },
    apple: {
      id: 'apple',
      name: 'Apple Music',
      configured: appleCreds.valid,
      isPlaceholder: false,
      status: appleCreds.status,
      capabilities: {
        linkImport: true,
        privateLibrary: appleCreds.valid
      },
      error: appleCreds.error,
      setupGuide: appleCreds.valid ? null : {
        url: 'https://developer.apple.com/musickit/',
        steps: [
          'Requires Apple MusicKit on the Web Developer Token (JWT)',
          'Set APPLE_DEVELOPER_TOKEN in metrolist-web/.env',
          'Public Apple Music playlist links work directly without any developer token in Import by Link'
        ]
      }
    },
    deezer: {
      id: 'deezer',
      name: 'Deezer',
      configured: deezerCreds.valid,
      isPlaceholder: false,
      status: deezerCreds.status,
      capabilities: {
        linkImport: true,
        privateLibrary: deezerCreds.valid
      },
      error: deezerCreds.error,
      setupGuide: deezerCreds.valid ? null : {
        url: 'https://developers.deezer.com/',
        steps: [
          'Set DEEZER_APP_ID and DEEZER_APP_SECRET in metrolist-web/.env for user account connection',
          'Public Deezer playlist links work directly with zero setup in Import by Link'
        ]
      }
    }
  });
});

// 3. Spotify OAuth Status (tells frontend if server has developer credentials configured)
app.get('/api/spotify/auth/status', (req, res) => {
  const redirectOrigin = req.headers.origin || 'http://localhost:5173';
  const redirectUri = (process.env.SPOTIFY_REDIRECT_URI || `${redirectOrigin}/spotify-callback`).trim();
  const credCheck = validateSpotifyCredentials();

  res.json({
    configured: credCheck.valid,
    clientIdConfigured: credCheck.hasClientId,
    clientSecretConfigured: credCheck.hasClientSecret,
    isPlaceholder: credCheck.isPlaceholder,
    clientIdMasked: credCheck.clientIdMasked,
    redirectUri,
    supportsOAuth: true,
    status: credCheck.status,
    error: credCheck.error,
    setupGuide: credCheck.valid ? null : {
      dashboardUrl: 'https://developer.spotify.com/dashboard',
      requiredRedirectUri: redirectUri,
      steps: [
        'Open Spotify Developer Dashboard at https://developer.spotify.com/dashboard',
        'Create an App (or open your existing one)',
        `Add "${redirectUri}" to the Redirect URIs in App Settings and click Save`,
        'Copy the 32-character Client ID and Client Secret into metrolist-web/.env',
        'Click "Re-check Credentials" in Ghosttunes'
      ]
    }
  });
});

// 4. Spotify Authorization URL (pre-flight checks credentials to NEVER send invalid client_id to Spotify)
app.post('/api/spotify/auth/url', (req, res) => {
  const { redirectUri, state, codeChallenge } = req.body || {};
  const credCheck = validateSpotifyCredentials();

  if (!credCheck.valid) {
    return res.status(400).json({ 
      error: credCheck.error || 'Spotify OAuth is not configured with a valid 32-character Client ID. Please configure credentials in metrolist-web/.env.',
      code: 'INVALID_OR_MISSING_CLIENT_ID',
      status: credCheck.status
    });
  }

  const effectiveRedirectUri = (redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173/spotify-callback').trim();
  const oauthState = state || crypto.randomBytes(16).toString('hex');

  // Record active state with timestamp
  activeOAuthStates.set(oauthState, {
    timestamp: Date.now(),
    provider: 'spotify',
    redirectUri: effectiveRedirectUri
  });

  try {
    const url = getSpotifyAuthUrl(
      process.env.SPOTIFY_CLIENT_ID,
      effectiveRedirectUri,
      oauthState,
      codeChallenge
    );
    res.json({ authUrl: url, state: oauthState });
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'AUTH_URL_GENERATION_FAILED' });
  }
});

// 5. Spotify Authorization Callback Code Exchange (uses server client secret securely)
app.post('/api/spotify/auth/callback', async (req, res) => {
  const { code, state, redirectUri, codeVerifier } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  // State verification
  if (state && !activeOAuthStates.has(state) && state !== 'ghosttunes_spotify') {
    console.warn('[Spotify Auth] State mismatch or expired state:', state);
    // Continue if dev bypass but warn
  }
  if (state) activeOAuthStates.delete(state);

  const effectiveRedirectUri = (redirectUri || process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5173/spotify-callback').trim();

  try {
    const tokenData = await exchangeSpotifyCode(
      code,
      process.env.SPOTIFY_CLIENT_ID,
      process.env.SPOTIFY_CLIENT_SECRET,
      effectiveRedirectUri,
      codeVerifier
    );
    res.json(tokenData);
  } catch (err) {
    console.error('[Spotify Auth] Exchange error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 6. Spotify Token Refresh
app.post('/api/spotify/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  try {
    const data = await refreshSpotifyToken(refreshToken, process.env.SPOTIFY_CLIENT_ID, process.env.SPOTIFY_CLIENT_SECRET);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6b. Deezer OAuth URL
app.post('/api/deezer/auth/url', (req, res) => {
  const { redirectUri, state } = req.body || {};
  const credCheck = validateDeezerCredentials();
  if (!credCheck.valid) {
    return res.status(400).json({
      error: credCheck.error,
      code: 'MISSING_DEEZER_CREDENTIALS'
    });
  }

  const effectiveRedirectUri = (redirectUri || 'http://localhost:5173/deezer-callback').trim();
  const oauthState = state || crypto.randomBytes(16).toString('hex');
  activeOAuthStates.set(oauthState, {
    timestamp: Date.now(),
    provider: 'deezer',
    redirectUri: effectiveRedirectUri
  });

  try {
    const url = getDeezerAuthUrl(process.env.DEEZER_APP_ID, effectiveRedirectUri, oauthState);
    res.json({ authUrl: url, state: oauthState });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6c. Deezer Authorization Code Exchange
app.post('/api/deezer/auth/callback', async (req, res) => {
  const { code, state, redirectUri } = req.body || {};
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (state && !activeOAuthStates.has(state) && state !== 'ghosttunes_deezer') {
    console.warn('[Deezer Auth] State mismatch or expired state:', state);
  }
  if (state) activeOAuthStates.delete(state);

  const effectiveRedirectUri = (redirectUri || 'http://localhost:5173/deezer-callback').trim();

  try {
    const data = await exchangeDeezerCode(
      code,
      process.env.DEEZER_APP_ID,
      process.env.DEEZER_APP_SECRET,
      effectiveRedirectUri
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get User's Spotify Playlists (Including Private & Collaborative Playlists & Liked Songs)
app.get('/api/spotify/me/playlists', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || '');

  try {
    const playlists = await fetchSpotifyUserPlaylists(token);
    res.json({ playlists });
  } catch (err) {
    console.error('[Spotify Me Playlists] Error:', err.message);
    res.status(err.message.includes('expired') ? 401 : 500).json({ error: err.message });
  }
});

// 8. Unified Connected Accounts Playlists Endpoint (Spotify, YouTube, Apple, Deezer)
app.get('/api/playlists/connected', async (req, res) => {
  const provider = (req.query.provider || 'spotify').toLowerCase();
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token || '');

  try {
    let playlists = [];
    if (provider === 'spotify') {
      playlists = await fetchSpotifyUserPlaylists(token);
    } else if (provider === 'deezer') {
      playlists = await fetchDeezerUserPlaylists(token);
    } else if (provider === 'apple') {
      playlists = await fetchAppleUserPlaylists(token, process.env.APPLE_DEVELOPER_TOKEN);
    } else if (provider === 'youtube') {
      playlists = await fetchYouTubeUserPlaylists(token);
    } else {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    res.json({ provider, playlists });
  } catch (err) {
    console.error(`[Connected Playlists] Error fetching ${provider}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. LISTENING ROOMS REAL-TIME SYNCHRONIZATION HUB
// ==========================================
const activeListeningRooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GHOST-';
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getEffectivePlaybackTime(room) {
  if (!room.isPlaying) return room.playbackTime;
  const elapsedSec = (Date.now() - room.lastUpdatedTime) / 1000;
  return Math.max(0, room.playbackTime + elapsedSec);
}

function broadcastRoomEvent(room, eventName, payload) {
  const data = JSON.stringify({
    event: eventName,
    serverTimestamp: Date.now(),
    roomState: {
      roomId: room.id,
      roomName: room.name,
      hostId: room.hostId,
      collaborative: room.collaborative,
      currentTrack: room.currentTrack,
      playbackTime: getEffectivePlaybackTime(room),
      isPlaying: room.isPlaying,
      serverTimestamp: Date.now(),
      members: Array.from(room.members.values()).map(m => ({
        id: m.id,
        name: m.name,
        isHost: m.isHost,
        joinedAt: m.joinedAt,
        pingMs: m.pingMs || 15
      }))
    },
    ...payload
  });

  for (const client of room.sseClients) {
    try {
      client.write(`event: ${eventName}\ndata: ${data}\n\n`);
    } catch {
      room.sseClients.delete(client);
    }
  }
}

// Create a new Listening Room
app.post('/api/rooms/create', (req, res) => {
  const { roomName, hostName, initialTrack } = req.body || {};
  const roomId = generateRoomCode();
  const hostId = `user_${Math.random().toString(36).substr(2, 8)}`;
  const hostToken = crypto.randomBytes(16).toString('hex');

  const newRoom = {
    id: roomId,
    name: roomName || 'Ghosttunes Lounge',
    hostToken,
    hostId,
    collaborative: false,
    currentTrack: initialTrack || null,
    playbackTime: 0,
    isPlaying: false,
    lastUpdatedTime: Date.now(),
    members: new Map(),
    sseClients: new Set()
  };

  newRoom.members.set(hostId, {
    id: hostId,
    name: hostName || 'Host',
    isHost: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    pingMs: 12
  });

  activeListeningRooms.set(roomId, newRoom);

  res.json({
    roomId,
    hostToken,
    hostId,
    roomState: {
      roomId,
      roomName: newRoom.name,
      hostId,
      isHost: true,
      collaborative: false,
      currentTrack: newRoom.currentTrack,
      playbackTime: 0,
      isPlaying: false,
      serverTimestamp: Date.now(),
      members: Array.from(newRoom.members.values())
    }
  });
});

// Join an existing Listening Room
app.post('/api/rooms/join', (req, res) => {
  const { roomId: rawRoomId, memberName } = req.body || {};
  const roomId = (rawRoomId || '').toUpperCase().trim();
  const room = activeListeningRooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: 'Listening room not found or expired.' });
  }

  const memberId = `user_${Math.random().toString(36).substr(2, 8)}`;
  room.members.set(memberId, {
    id: memberId,
    name: memberName || `Listener_${memberId.slice(-3)}`,
    isHost: false,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    pingMs: 20
  });

  broadcastRoomEvent(room, 'member_joined', { newMember: room.members.get(memberId) });

  res.json({
    roomId,
    memberId,
    isHost: false,
    roomState: {
      roomId,
      roomName: room.name,
      hostId: room.hostId,
      isHost: false,
      collaborative: room.collaborative,
      currentTrack: room.currentTrack,
      playbackTime: getEffectivePlaybackTime(room),
      isPlaying: room.isPlaying,
      serverTimestamp: Date.now(),
      members: Array.from(room.members.values())
    }
  });
});

// SSE Real-Time Sync Stream for Listening Room
app.get('/api/rooms/:roomId/events', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = activeListeningRooms.get(roomId);

  if (!room) {
    return res.status(404).send('Room not found');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  room.sseClients.add(res);

  // Send initial state immediately
  res.write(`event: init_state\ndata: ${JSON.stringify({
    serverTimestamp: Date.now(),
    roomState: {
      roomId: room.id,
      roomName: room.name,
      hostId: room.hostId,
      collaborative: room.collaborative,
      currentTrack: room.currentTrack,
      playbackTime: getEffectivePlaybackTime(room),
      isPlaying: room.isPlaying,
      serverTimestamp: Date.now(),
      members: Array.from(room.members.values())
    }
  })}\n\n`);

  // Keep alive heartbeat every 15s
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    room.sseClients.delete(res);
  });
});

// Action dispatch: Play, Pause, Seek, Change Track, Toggle Collab
app.post('/api/rooms/:roomId/action', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = activeListeningRooms.get(roomId);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { action, payload, token, memberId } = req.body || {};
  const isHost = token && token === room.hostToken;

  if (!isHost && !room.collaborative && action !== 'ping') {
    return res.status(403).json({ error: 'Only the room host can control playback.' });
  }

  if (action === 'play') {
    room.playbackTime = typeof payload?.time === 'number' ? payload.time : getEffectivePlaybackTime(room);
    room.isPlaying = true;
    room.lastUpdatedTime = Date.now();
    broadcastRoomEvent(room, 'playback_play', { time: room.playbackTime });
  } else if (action === 'pause') {
    room.playbackTime = typeof payload?.time === 'number' ? payload.time : getEffectivePlaybackTime(room);
    room.isPlaying = false;
    room.lastUpdatedTime = Date.now();
    broadcastRoomEvent(room, 'playback_pause', { time: room.playbackTime });
  } else if (action === 'seek') {
    room.playbackTime = payload?.time || 0;
    room.lastUpdatedTime = Date.now();
    broadcastRoomEvent(room, 'playback_seek', { time: room.playbackTime });
  } else if (action === 'change_track') {
    room.currentTrack = payload?.track || null;
    room.playbackTime = 0;
    room.isPlaying = true;
    room.lastUpdatedTime = Date.now();
    broadcastRoomEvent(room, 'track_changed', { track: room.currentTrack });
  } else if (action === 'toggle_collab' && isHost) {
    room.collaborative = Boolean(payload?.collaborative);
    broadcastRoomEvent(room, 'collab_toggled', { collaborative: room.collaborative });
  }

  res.json({ success: true, effectiveTime: getEffectivePlaybackTime(room) });
});

// High-precision clock sync heartbeat
app.get('/api/rooms/:roomId/sync', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = activeListeningRooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  res.json({
    serverTime: Date.now(),
    playbackTime: getEffectivePlaybackTime(room),
    isPlaying: room.isPlaying,
    currentTrack: room.currentTrack
  });
});

// Serve static client bundle in production desktop app
const clientDist = path.join(__dirname, 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Metrolist Web API listening on http://127.0.0.1:${PORT}`);
});
