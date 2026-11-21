// serverSmartRadio.js
// Spotify-Style Smart Radio Backend Recommendation Engine using YouTube Music Mix (RDAMVM + videoId)
// Features: YouTube Music InnerTube WEB_REMIX API, High-Res Cover Art Resizing, Real Circular Artist Avatars,
// Annoy 5D Vector Proximity, SQLite User Personalization (Skips, Replays, Completions), and Tab Filtering (Artist, Similar, Balanced).

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

// Resolve persistent storage path in user's AppData or local dir
const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.config'));
const storageDir = path.join(appDataDir, '.ghosttunes');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const dbPath = path.join(storageDir, 'smart_radio.db');
const db = new DatabaseSync(dbPath);

// Initialize SQLite Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS track_interactions (
    track_id TEXT PRIMARY KEY,
    title TEXT,
    artist TEXT,
    skips INTEGER DEFAULT 0,
    replays INTEGER DEFAULT 0,
    completions INTEGER DEFAULT 0,
    last_played_at INTEGER,
    total_duration_listened REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS interaction_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id TEXT,
    action TEXT,
    duration_played REAL,
    total_duration REAL,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS recommendation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seed_video_id TEXT,
    seed_title TEXT,
    seed_artist TEXT,
    recommended_track_id TEXT,
    title TEXT,
    artist TEXT,
    similarity_score REAL,
    audio_distance REAL,
    cf_score REAL,
    history_modifier REAL,
    final_score REAL,
    rationale TEXT,
    created_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS youtube_mix_cache (
    video_id TEXT PRIMARY KEY,
    json_data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS artist_avatars (
    artist_id TEXT PRIMARY KEY,
    artist_name TEXT,
    avatar_url TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactions_artist ON track_interactions(artist);
  CREATE INDEX IF NOT EXISTS idx_rec_logs_seed ON recommendation_logs(seed_video_id);
  CREATE INDEX IF NOT EXISTS idx_artist_avatars_name ON artist_avatars(artist_name);
`);

// Migration safeguard for existing user databases
try {
  db.exec(`ALTER TABLE track_interactions ADD COLUMN total_duration_listened REAL DEFAULT 0;`);
} catch (e) {
  // Column already exists
}

console.log('[SmartRadio DB] SQLite database initialized at:', dbPath);

// In-memory caches for fast sub-millisecond retrieval
const inMemoryMixCache = new Map();
const inMemoryAvatarCache = new Map();
let latestDiagnostic = null;

// =========================================================================
// 1. High-Res Artwork & Google CDN Resizing Helper
// =========================================================================
export function formatHighResArtwork(url, size = 544) {
  if (!url || typeof url !== 'string') return '';
  // Google CDN (lh3.googleusercontent.com, yt3.ggpht.com) image parameter rewriting
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+.*$|=s\d+.*$/, `=w${size}-h${size}-p-l90-rj`);
    }
    return `${url}=w${size}-h${size}-p-l90-rj`;
  }
  // YouTube video image fallback
  if (url.includes('i.ytimg.com')) {
    return url.replace(/\/(default|hqdefault|mqdefault|sddefault)\.jpg/, '/hq720.jpg');
  }
  return url;
}

// =========================================================================
// 2. Real Artist Avatar Fetching & SQLite Caching
// =========================================================================
export async function fetchArtistAvatar(artistBrowseId, artistName = '') {
  if (!artistBrowseId && !artistName) return null;

  // 1. Check in-memory cache
  if (artistBrowseId && inMemoryAvatarCache.has(artistBrowseId)) {
    return inMemoryAvatarCache.get(artistBrowseId);
  }
  if (artistName && inMemoryAvatarCache.has(artistName.toLowerCase())) {
    return inMemoryAvatarCache.get(artistName.toLowerCase());
  }

  // 2. Check SQLite persistent cache (valid for 30 days)
  try {
    let row = null;
    if (artistBrowseId) {
      row = db.prepare('SELECT avatar_url, updated_at FROM artist_avatars WHERE artist_id = ?').get(artistBrowseId);
    }
    if (!row && artistName) {
      row = db.prepare('SELECT avatar_url, updated_at FROM artist_avatars WHERE LOWER(artist_name) = LOWER(?) LIMIT 1').get(artistName);
    }
    if (row && (Date.now() - row.updated_at) < 30 * 24 * 60 * 60 * 1000) {
      if (artistBrowseId) inMemoryAvatarCache.set(artistBrowseId, row.avatar_url);
      if (artistName) inMemoryAvatarCache.set(artistName.toLowerCase(), row.avatar_url);
      return row.avatar_url;
    }
  } catch (err) {
    console.warn('[SmartRadio Avatar] SQLite cache read error:', err.message);
  }

  // 3. Fetch from YouTube Music InnerTube Browse API
  let targetBrowseId = artistBrowseId;

  // If no direct browseId, search YouTube Music to resolve the official channel
  if (!targetBrowseId || !targetBrowseId.startsWith('UC')) {
    try {
      const searchRes = await fetch('https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com',
          'Origin': 'https://music.youtube.com'
        },
        body: JSON.stringify({
          context: { client: { hl: 'en', gl: 'US', clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00' } },
          query: artistName
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const jsonStr = JSON.stringify(searchData);
        const match = jsonStr.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/);
        if (match) targetBrowseId = match[1];
      }
    } catch (e) {
      // Continue with what we have
    }
  }

  if (!targetBrowseId || !targetBrowseId.startsWith('UC')) {
    return null;
  }

  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com',
        'Origin': 'https://music.youtube.com'
      },
      body: JSON.stringify({
        context: { client: { hl: 'en', gl: 'US', clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00' } },
        browseId: targetBrowseId
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const header = data.header?.musicImmersiveHeaderRenderer ||
                   data.header?.musicVisualHeaderRenderer ||
                   data.header?.musicHeaderRenderer;

    const thumbs = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                   header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;

    let rawThumb = thumbs?.slice(-1)[0]?.url;
    if (rawThumb) {
      const avatarUrl = formatHighResArtwork(rawThumb, 544);
      const resolvedName = header?.title?.runs?.[0]?.text || artistName;

      inMemoryAvatarCache.set(targetBrowseId, avatarUrl);
      if (resolvedName) inMemoryAvatarCache.set(resolvedName.toLowerCase(), avatarUrl);

      try {
        db.prepare(`
          INSERT OR REPLACE INTO artist_avatars (artist_id, artist_name, avatar_url, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(targetBrowseId, resolvedName, avatarUrl, Date.now());
      } catch (err) {
        console.warn('[SmartRadio Avatar] SQLite write error:', err.message);
      }

      return avatarUrl;
    }
  } catch (err) {
    console.warn(`[SmartRadio Avatar] Failed to fetch avatar for ${artistName || targetBrowseId}:`, err.message);
  }

  return null;
}

// =========================================================================
// 3. YouTube Music Mix Extraction via InnerTube API (WEB_REMIX + RDAMVM)
// =========================================================================
export async function fetchYouTubeMix(videoId) {
  if (!videoId) return [];

  // Check in-memory cache
  if (inMemoryMixCache.has(videoId)) {
    return inMemoryMixCache.get(videoId);
  }

  // Check SQLite cache (valid for 48 hours)
  try {
    const row = db.prepare('SELECT json_data, created_at FROM youtube_mix_cache WHERE video_id = ?').get(videoId);
    if (row && (Date.now() - row.created_at) < 48 * 60 * 60 * 1000) {
      const parsed = JSON.parse(row.json_data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryMixCache.set(videoId, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[SmartRadio Cache] SQLite cache read error:', err.message);
  }

  console.log(`[SmartRadio] Fetching authentic YouTube Music Mix (RDAMVM) for: ${videoId}`);

  let entries = [];
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/next?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://music.youtube.com',
        'Origin': 'https://music.youtube.com'
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'WEB_REMIX',
            clientVersion: '1.20241028.01.00'
          }
        },
        videoId: videoId,
        playlistId: 'RDAMVM' + videoId,
        isAudioOnly: true
      }),
      signal: AbortSignal.timeout(9000)
    });

    if (!res.ok) {
      throw new Error(`InnerTube HTTP error: ${res.status}`);
    }

    const data = await res.json();

    // Extract all playlistPanelVideoRenderer items from the watchNext payload
    function extractPanelVideos(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.playlistPanelVideoRenderer) {
        const item = obj.playlistPanelVideoRenderer;
        const vId = item.videoId || item.navigationEndpoint?.watchEndpoint?.videoId;
        const title = item.title?.runs?.[0]?.text || item.title?.simpleText || '';

        // Extract structured artists with official channel browseIds
        const artistRuns = (item.longBylineText?.runs || item.shortBylineText?.runs || []).filter(r => {
          const bId = r.navigationEndpoint?.browseEndpoint?.browseId;
          return bId && (bId.startsWith('UC') || bId.startsWith('FEmusic_library_privately_owned_artist'));
        });

        const artists = artistRuns.map(r => ({
          name: r.text?.trim() || '',
          id: r.navigationEndpoint?.browseEndpoint?.browseId || ''
        }));

        const primaryArtistName = artists[0]?.name ||
          item.shortBylineText?.runs?.[0]?.text?.trim() ||
          item.longBylineText?.runs?.[0]?.text?.trim() || '';
        const primaryArtistId = artists[0]?.id || '';

        // Extract album name if present
        let album = '';
        const allRuns = item.longBylineText?.runs || [];
        for (const r of allRuns) {
          const bId = r.navigationEndpoint?.browseEndpoint?.browseId;
          if (bId && bId.startsWith('MPREb_')) {
            album = r.text?.trim() || '';
            break;
          }
        }

        // High-res square artwork
        const rawThumb = item.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vId}/hq720.jpg`;
        const thumbnail = formatHighResArtwork(rawThumb, 544);

        // Parse duration
        const durationText = item.lengthText?.simpleText || item.lengthText?.runs?.[0]?.text || '3:30';
        let durSec = 210;
        if (durationText) {
          const parts = durationText.split(':').map(Number);
          if (parts.length === 2) durSec = parts[0] * 60 + parts[1];
          else if (parts.length === 3) durSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        if (vId && title) {
          entries.push({
            id: vId,
            title,
            artist: primaryArtistName,
            artistId: primaryArtistId,
            artists,
            album,
            channel: primaryArtistName,
            uploader: primaryArtistName,
            duration: durationText,
            durationSeconds: durSec,
            thumbnail
          });
        }
        return;
      }
      for (const key of Object.keys(obj)) {
        extractPanelVideos(obj[key]);
      }
    }

    extractPanelVideos(data);
    console.log(`[SmartRadio] Extracted ${entries.length} official YouTube Music Mix tracks for ${videoId}`);
  } catch (err) {
    console.warn('[SmartRadio] YouTube Music Mix fetch error:', err.message);
  }

  if (entries.length > 0) {
    inMemoryMixCache.set(videoId, entries);
    try {
      db.prepare(`
        INSERT OR REPLACE INTO youtube_mix_cache (video_id, json_data, created_at)
        VALUES (?, ?, ?)
      `).run(videoId, JSON.stringify(entries), Date.now());
    } catch (err) {
      console.warn('[SmartRadio Cache] SQLite write error:', err.message);
    }
  }

  return entries;
}

// =========================================================================
// 4. Strict Artist Matching & Normalization Helper
// =========================================================================
export function cleanArtistString(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}\-_,.]/g, ' ')
    .replace(/\btopic\b|\bofficial\b|\bvevo\b|\bchannel\b|\bmusic\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const JUNK_UPLOADER_REGEX = /\b(cover|remix|lyrics?|chill|nightcore|t-series|zee music|speed records|tips|goldmines|wave music|status|reaction|slowed|reverb|karaoke|acoustic cover|lo-fi|lofi)\b/i;

export function isArtistMatch(item, targetArtist, targetArtistId = '') {
  if (!targetArtist && !targetArtistId) return false;

  // 1. Direct channel browseId match
  if (targetArtistId) {
    if (item.artistId && item.artistId === targetArtistId) return true;
    if (Array.isArray(item.artists) && item.artists.some(a => a.id === targetArtistId)) return true;
  }

  // 2. Normalized text match
  const target = cleanArtistString(targetArtist);
  if (!target) return false;

  const itemArtist = cleanArtistString(item.artist);
  const uploader = cleanArtistString(item.uploader);
  const channel = cleanArtistString(item.channel);

  if (itemArtist && (itemArtist === target || itemArtist.includes(target) || (itemArtist.length > 3 && target.includes(itemArtist)))) return true;
  if (uploader && (uploader === target || uploader.includes(target) || (uploader.length > 3 && target.includes(uploader)))) return true;
  if (channel && (channel === target || channel.includes(target) || (channel.length > 3 && target.includes(channel)))) return true;

  if (Array.isArray(item.artists)) {
    for (const a of item.artists) {
      const aName = cleanArtistString(a.name);
      if (aName && (aName === target || aName.includes(target) || (aName.length > 3 && target.includes(aName)))) return true;
    }
  }

  return false;
}

export function isOfficialArtistUpload(item, targetArtist, targetArtistId = '') {
  if (!isArtistMatch(item, targetArtist, targetArtistId)) return false;

  // Strictly filter out third-party cover/lyric channels or Bollywood distributors
  if (JUNK_UPLOADER_REGEX.test(item.uploader || '') || JUNK_UPLOADER_REGEX.test(item.channel || '') || JUNK_UPLOADER_REGEX.test(item.artist || '')) {
    return false;
  }
  if (/\b(cover|karaoke|tribute)\b/i.test(item.title || '')) {
    return false;
  }

  return true;
}

// =========================================================================
// 5. User History & SQLite Personalization
// =========================================================================
export function record_user_interaction(data) {
  const { track_id, title = '', artist = '', action, duration_played = 0, total_duration = 0 } = data;
  if (!track_id || !action) return;

  const now = Date.now();
  const isSkip = action === 'skip';
  const isReplay = action === 'replay';
  const isComplete = action === 'complete';

  try {
    const existing = db.prepare('SELECT skips, replays, completions, total_duration_listened FROM track_interactions WHERE track_id = ?').get(track_id);

    if (existing) {
      db.prepare(`
        UPDATE track_interactions
        SET skips = skips + ?,
            replays = replays + ?,
            completions = completions + ?,
            last_played_at = ?,
            total_duration_listened = total_duration_listened + ?,
            title = COALESCE(NULLIF(?, ''), title),
            artist = COALESCE(NULLIF(?, ''), artist)
        WHERE track_id = ?
      `).run(
        isSkip ? 1 : 0,
        isReplay ? 1 : 0,
        isComplete ? 1 : 0,
        now,
        duration_played,
        title,
        artist,
        track_id
      );
    } else {
      db.prepare(`
        INSERT INTO track_interactions (track_id, title, artist, skips, replays, completions, last_played_at, total_duration_listened)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        track_id,
        title,
        artist,
        isSkip ? 1 : 0,
        isReplay ? 1 : 0,
        isComplete ? 1 : 0,
        now,
        duration_played
      );
    }

    db.prepare(`
      INSERT INTO interaction_log (track_id, action, duration_played, total_duration, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(track_id, action, duration_played, total_duration, now);

    console.log(`[SmartRadio DB] Logged ${action} for: ${title || track_id}`);
  } catch (err) {
    console.error('[SmartRadio DB] Error recording interaction:', err.message);
  }
}

export function get_user_history(track_id, artist = '') {
  try {
    const row = db.prepare('SELECT skips, replays, completions FROM track_interactions WHERE track_id = ?').get(track_id);
    const skips = row ? row.skips : 0;
    const replays = row ? row.replays : 0;
    const completions = row ? row.completions : 0;

    let artistPositive = false;
    if (artist && artist.trim()) {
      const artistRow = db.prepare(`
        SELECT SUM(replays) as total_replays, SUM(completions) as total_completions, SUM(skips) as total_skips
        FROM track_interactions
        WHERE LOWER(artist) = LOWER(?)
      `).get(artist.trim());

      if (artistRow) {
        const positiveInteractions = (artistRow.total_replays || 0) * 2 + (artistRow.total_completions || 0);
        const negativeInteractions = (artistRow.total_skips || 0);
        if (positiveInteractions > negativeInteractions + 1) {
          artistPositive = true;
        }
      }
    }

    return { skips, replays, completions, artistPositive };
  } catch (err) {
    console.warn('[SmartRadio DB] Error reading history:', err.message);
    return { skips: 0, replays: 0, completions: 0, artistPositive: false };
  }
}

export function get_user_stats() {
  try {
    const row = db.prepare(`
      SELECT 
        COALESCE(SUM(skips), 0) as totalSkips,
        COALESCE(SUM(replays), 0) as totalReplays,
        COALESCE(SUM(completions), 0) as totalCompletions
      FROM track_interactions
    `).get();
    return row || { totalSkips: 0, totalReplays: 0, totalCompletions: 0 };
  } catch {
    return { totalSkips: 0, totalReplays: 0, totalCompletions: 0 };
  }
}

// =========================================================================
// 6. Acoustic 5D Vector Profiling & Proximity (Spotify Annoy Engine)
// =========================================================================
export function extractAudioFeatures(title = '', artist = '', durationSeconds = 210) {
  const text = `${title} ${artist}`.toLowerCase();

  let energy = 0.50;
  let valence = 0.50;
  let danceability = 0.50;
  let acousticness = 0.30;
  let bpm = 110;

  if (/\b(acoustic|piano|unplugged|orchestra|violin|chill|slow|lullaby|ambient)\b/.test(text)) {
    acousticness += 0.40;
    energy -= 0.25;
    bpm -= 25;
  }
  if (/\b(club|remix|dance|techno|house|edm|party|bounce|groove)\b/.test(text)) {
    danceability += 0.35;
    energy += 0.30;
    acousticness -= 0.25;
    bpm += 20;
  }
  if (/\b(rock|metal|punk|hardcore|power|heavy|guitar)\b/.test(text)) {
    energy += 0.35;
    acousticness -= 0.20;
    bpm += 15;
  }
  if (/\b(sad|heartbreak|sorrow|crying|pain|lonely|alone|dark|slowed)\b/.test(text)) {
    valence -= 0.35;
    energy -= 0.15;
    bpm -= 15;
  }
  if (/\b(happy|summer|sunshine|joy|celebrate|love|good|bright|pop)\b/.test(text)) {
    valence += 0.30;
    danceability += 0.15;
  }
  if (/\b(hip hop|rap|trap|drill|beat|freestyle|bars)\b/.test(text)) {
    danceability += 0.25;
    energy += 0.15;
    acousticness -= 0.15;
  }

  if (durationSeconds > 320) {
    danceability -= 0.08;
    acousticness += 0.05;
  } else if (durationSeconds > 0 && durationSeconds < 140) {
    energy += 0.08;
    danceability += 0.08;
  }

  energy = Math.min(1.0, Math.max(0.05, energy));
  valence = Math.min(1.0, Math.max(0.05, valence));
  danceability = Math.min(1.0, Math.max(0.05, danceability));
  acousticness = Math.min(1.0, Math.max(0.02, acousticness));
  bpm = Math.min(180, Math.max(60, bpm));

  const tempoNorm = (bpm - 60) / 120; // [0.0, 1.0]

  return {
    energy: Number(energy.toFixed(3)),
    valence: Number(valence.toFixed(3)),
    danceability: Number(danceability.toFixed(3)),
    acousticness: Number(acousticness.toFixed(3)),
    bpm: Math.round(bpm),
    vector: [energy, valence, danceability, acousticness, tempoNorm]
  };
}

export function computeVectorSimilarity(vecA, vecB) {
  let sum = 0;
  for (let i = 0; i < vecA.length; i++) {
    sum += Math.pow(vecA[i] - vecB[i], 2);
  }
  const distance = Math.sqrt(sum);
  const maxPossibleDist = Math.sqrt(vecA.length); // sqrt(5) ≈ 2.236
  const similarity = Math.max(0, 1 - (distance / maxPossibleDist));
  return { distance: Number(distance.toFixed(4)), similarity: Number(similarity.toFixed(4)) };
}

// =========================================================================
// 7. Main Smart Radio Pipeline (YouTube Music Mix + Avatars + Tab Filtering)
// =========================================================================
/** One key for every version of a song: drops brackets, "Artist - ", and extras like "official video", "live", "slowed". */
export function songKey(title = '') {
  let t = String(title).toLowerCase().replace(/[(\[{].*?[)\]}]/g, ' ');
  t = t.replace(/\b(official|music video|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|live|slowed|reverb|sped up|nightcore|remix|cover|version|feat|ft)\b.*/u, ' ');
  if (t.includes(' - ')) t = t.split(' - ').slice(1).join(' - ').trim() || t.split(' - ')[0];
  return t.replace(/[^\p{L}\p{N}]+/gu, '') || String(title).toLowerCase();
}

export async function get_smart_radio(video_id, getInnertubeFn, options = {}) {
  if (!video_id) {
    throw new Error('Video ID is required for smart radio');
  }

  const activeMode = (options.mode || 'balanced').toLowerCase();
  const seedTrack = {
    id: video_id,
    title: options.seedTitle || 'Current Track',
    artist: options.seedArtist || 'Current Artist',
    artistId: '',
    artist_thumbnail: '',
    durationSeconds: options.seedDuration || 210
  };

  // Step 1: Candidate Generation via Official YouTube Music Mix (RDAMVM + videoId)
  let mixEntries = await fetchYouTubeMix(video_id);

  // Fallback: If mix yielded 0 entries, check Innertube upNext
  if (mixEntries.length === 0 && getInnertubeFn) {
    try {
      const innertube = await getInnertubeFn();
      const upNext = innertube?.music?.getUpNext
        ? await innertube.music.getUpNext(video_id)
        : (innertube?.getUpNext ? await innertube.getUpNext(video_id) : { contents: [] });
      const contents = upNext?.contents || [];
      mixEntries = contents.map(s => {
        const vId = s.video_id || s.id;
        const art = s.artists?.[0]?.name || s.author?.name || '';
        const bId = s.artists?.[0]?.id || s.author?.channel_id || '';
        return {
          id: vId,
          title: s.title?.text || s.title || '',
          artist: art,
          artistId: bId,
          artists: [{ name: art, id: bId }],
          channel: art,
          uploader: art,
          duration: s.duration?.text || '3:30',
          durationSeconds: s.duration?.seconds || 210,
          thumbnail: formatHighResArtwork(s.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vId}/hq720.jpg`, 544)
        };
      }).filter(e => e.id);
    } catch (err) {
      console.warn('[SmartRadio] UpNext fallback error:', err.message);
    }
  }

  // Detect seed artist and browseId from the mix entries if available
  let seedArtistId = '';
  let seedArtistName = (options.seedArtist || '').trim();

  // Look for seed video in mix entries
  const matchingSeedEntry = mixEntries.find(e => e.id === video_id) || mixEntries[0];
  if (matchingSeedEntry) {
    if (matchingSeedEntry.artist && (!seedArtistName || seedArtistName === 'Current Artist')) {
      seedArtistName = matchingSeedEntry.artist;
    }
    if (matchingSeedEntry.title && seedTrack.title === 'Current Track') {
      seedTrack.title = matchingSeedEntry.title;
    }
    if (matchingSeedEntry.artistId) {
      seedArtistId = matchingSeedEntry.artistId;
    }
  }
  seedTrack.artist = seedArtistName || 'Unknown Artist';
  seedTrack.artistId = seedArtistId;

  // Fetch real circular artist avatar for the seed artist
  const seedAvatar = await fetchArtistAvatar(seedArtistId, seedArtistName);
  seedTrack.artist_thumbnail = seedAvatar || '';

  // Parse and normalize candidates
  const allCandidates = mixEntries
    .filter(e => e.id && e.id !== video_id)
    .map(e => ({
      id: e.id,
      title: e.title || 'Unknown Title',
      artist: e.artist || e.uploader || 'Unknown Artist',
      artistId: e.artistId || '',
      artists: e.artists || [],
      album: e.album || '',
      uploader: e.uploader || e.artist || '',
      channel: e.channel || e.artist || '',
      duration: e.duration || '3:30',
      durationSeconds: typeof e.durationSeconds === 'number' ? e.durationSeconds : 210,
      thumbnail: e.thumbnail || `https://i.ytimg.com/vi/${e.id}/hq720.jpg`,
      artist_thumbnail: ''
    }));

  // De-duplicate candidate list: same video, or another version of the same song
  // ("Blinding Lights (Lyrics)", "… - Live", "slowed") including the seed itself.
  const seenIds = new Set([video_id]);
  const seenSongs = new Set([songKey(seedTrack.title)]);
  const uniqueCandidates = [];
  for (const cand of allCandidates) {
    const key = songKey(cand.title);
    if (!seenIds.has(cand.id) && !seenSongs.has(key)) {
      seenIds.add(cand.id);
      seenSongs.add(key);
      uniqueCandidates.push(cand);
    }
  }

  // Step 2: Tab Logic Filtering ("Artist", "Similar", "Balanced")
  let artistCandidates = uniqueCandidates.filter(c => isOfficialArtistUpload(c, seedArtistName, seedArtistId));
  const similarCandidates = uniqueCandidates.filter(c => !isArtistMatch(c, seedArtistName, seedArtistId));

  // If in "artist" mode and candidate count is low (< 10), pull official artist catalog from InnerTube Browse
  if (activeMode === 'artist' && artistCandidates.length < 10 && seedArtistId) {
    try {
      const browseRes = await fetch('https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://music.youtube.com',
          'Origin': 'https://music.youtube.com'
        },
        body: JSON.stringify({
          context: { client: { hl: 'en', gl: 'US', clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00' } },
          browseId: seedArtistId
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (browseRes.ok) {
        const browseData = await browseRes.json();
        function extractArtistSongs(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.musicResponsiveListItemRenderer) {
            const item = obj.musicResponsiveListItemRenderer;
            const nav = item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint || item.navigationEndpoint;
            const vId = nav?.watchEndpoint?.videoId;
            const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text;
            const rawThumb = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url;

            if (vId && title && !seenIds.has(vId)) {
              seenIds.add(vId);
              artistCandidates.push({
                id: vId,
                title,
                artist: seedArtistName,
                artistId: seedArtistId,
                artists: [{ name: seedArtistName, id: seedArtistId }],
                album: '',
                duration: '3:30',
                durationSeconds: 210,
                thumbnail: formatHighResArtwork(rawThumb || `https://i.ytimg.com/vi/${vId}/hq720.jpg`, 544),
                artist_thumbnail: seedAvatar || ''
              });
            }
          }
          for (const k of Object.keys(obj)) extractArtistSongs(obj[k]);
        }
        extractArtistSongs(browseData);
      }
    } catch (e) {
      console.warn('[SmartRadio] Catalog expansion error:', e.message);
    }
  }

  let filteredPool = [];
  let tabRationaleHeader = '';

  if (activeMode === 'artist') {
    // 100% official original artist tracks
    filteredPool = artistCandidates;
    tabRationaleHeader = `[Tab: ARTIST ONLY] Exclusively 100% official "${seedArtistName}" tracks (${artistCandidates.length} tracks)`;
  } else if (activeMode === 'similar') {
    // 100% similar related artists, excluding seed artist
    filteredPool = similarCandidates;
    tabRationaleHeader = `[Tab: SIMILAR ARTISTS] 100% related peers, excluded "${seedArtistName}" (${similarCandidates.length} tracks)`;
  } else {
    // 50/50 Balanced
    const balanced = [];
    const maxLen = Math.max(artistCandidates.length, similarCandidates.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < artistCandidates.length) balanced.push(artistCandidates[i]);
      if (i < similarCandidates.length) balanced.push(similarCandidates[i]);
    }
    filteredPool = balanced.length > 0 ? balanced : uniqueCandidates;
    tabRationaleHeader = `[Tab: BALANCED 50/50] Interleaved 50% "${seedArtistName}" + 50% related peers`;
  }

  // Step 3: Compute Seed Audio Feature Vector
  const seedFeatures = extractAudioFeatures(seedTrack.title, seedTrack.artist, seedTrack.durationSeconds);

  // Step 4: Multi-Model Scoring & Re-ranking with Local SQLite History
  const scoredCandidates = [];

  for (let idx = 0; idx < filteredPool.length; idx++) {
    const cand = filteredPool[idx];

    // a. Acoustic Vector Proximity (Annoy space)
    const candFeatures = extractAudioFeatures(cand.title, cand.artist, cand.durationSeconds);
    const { distance: audioDist, similarity: audioSim } = computeVectorSimilarity(seedFeatures.vector, candFeatures.vector);

    // b. Collaborative Filtering (Position in YouTube Mix RD graph)
    const mixRank = idx;
    const cfScore = Math.max(0.1, 1.0 - (mixRank * 0.025));

    // c. User History & Negative Feedback from local SQLite
    const history = get_user_history(cand.id, cand.artist);

    // Hard skip filter: If user skipped 3+ times, skip candidate
    if (history.skips >= 3 && history.replays === 0) {
      continue;
    }

    // Dynamic History Modifier
    let historyModifier = 1.0;
    historyModifier += (history.replays * 0.15);      // +15% per replay
    historyModifier += (history.completions * 0.05);  // +5% per full listen
    historyModifier -= (history.skips * 0.20);        // -20% per skip
    if (history.artistPositive) {
      historyModifier += 0.08;                        // +8% artist affinity
    }
    historyModifier = Math.max(0.2, Math.min(2.0, historyModifier));

    // Composite Final Score: 50% Acoustic Proximity + 50% YouTube Mix Position, scaled by History
    const baseScore = (0.50 * audioSim) + (0.50 * cfScore);
    const finalScore = Math.min(1.0, baseScore * historyModifier);

    // Build human-readable diagnostic rationale
    const rationaleParts = [
      tabRationaleHeader,
      `YouTube Music Mix Position #${mixRank + 1} (${Math.round(cfScore * 100)}%)`,
      `Waveform Match: ${Math.round(audioSim * 100)}% (Energy: ${Math.round(candFeatures.energy * 100)}%, Valence: ${Math.round(candFeatures.valence * 100)}%)`
    ];
    if (history.replays > 0) rationaleParts.push(`+${history.replays * 15}% SQLite Replay Affinity`);
    if (history.skips > 0) rationaleParts.push(`-${history.skips * 20}% SQLite Skip Penalty`);
    if (history.artistPositive) rationaleParts.push(`+8% Artist Affinity for "${cand.artist}"`);

    scoredCandidates.push({
      track: cand,
      diagnostic: {
        candidateId: cand.id,
        title: cand.title,
        artist: cand.artist,
        artistId: cand.artistId,
        artist_thumbnail: cand.artist_thumbnail || '',
        thumbnail: cand.thumbnail,
        audioDistance: audioDist,
        audioSimilarity: audioSim,
        cfScore: Number(cfScore.toFixed(3)),
        features: candFeatures,
        history,
        historyModifier: Number(historyModifier.toFixed(3)),
        finalScore: Number(finalScore.toFixed(3)),
        rationale: rationaleParts.join(' • ')
      }
    });
  }

  // Preserve balanced alternating order while prioritizing highest scored tracks within mode
  if (activeMode !== 'balanced') {
    scoredCandidates.sort((a, b) => b.diagnostic.finalScore - a.diagnostic.finalScore);
  }

  const topRecommendations = scoredCandidates.slice(0, 20);

  // Resolve artist avatars for top recommendations in parallel
  const avatarPromises = topRecommendations.map(async item => {
    // If it's the seed artist, reuse seedAvatar immediately
    if (isArtistMatch(item.track, seedArtistName, seedArtistId) && seedAvatar) {
      item.track.artist_thumbnail = seedAvatar;
      item.diagnostic.artist_thumbnail = seedAvatar;
      return;
    }
    const av = await fetchArtistAvatar(item.track.artistId, item.track.artist);
    if (av) {
      item.track.artist_thumbnail = av;
      item.diagnostic.artist_thumbnail = av;
    }
  });
  await Promise.allSettled(avatarPromises);

  // Store recommendation log in SQLite for top recommendations
  const now = Date.now();
  try {
    const logRecStmt = db.prepare(`
      INSERT INTO recommendation_logs (
        seed_video_id, seed_title, seed_artist, recommended_track_id, title, artist,
        similarity_score, audio_distance, cf_score, history_modifier, final_score, rationale, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    topRecommendations.slice(0, 5).forEach(item => {
      logRecStmt.run(
        video_id,
        seedTrack.title,
        seedTrack.artist,
        item.track.id,
        item.track.title,
        item.track.artist,
        item.diagnostic.audioSimilarity,
        item.diagnostic.audioDistance,
        item.diagnostic.cfScore,
        item.diagnostic.historyModifier,
        item.diagnostic.finalScore,
        item.diagnostic.rationale,
        now
      );
    });
  } catch (err) {
    console.warn('[SmartRadio DB] Log write error:', err.message);
  }

  // Update in-memory latest diagnostic snapshot for Ctrl+Shift+D console
  latestDiagnostic = {
    timestamp: now,
    mode: activeMode,
    seedTrack: {
      ...seedTrack,
      features: seedFeatures
    },
    recommendations: topRecommendations.map(item => item.diagnostic),
    userStats: get_user_stats(),
    mixStats: {
      totalMixEntries: mixEntries.length,
      artistCount: artistCandidates.length,
      similarCount: similarCandidates.length
    }
  };

  return {
    seed: {
      ...seedTrack,
      features: seedFeatures
    },
    mode: activeMode,
    tracks: topRecommendations.map(item => ({
      ...item.track,
      isAutoplay: true,
      recommendationReason: `Smart Radio (${activeMode.toUpperCase()})`,
      recommendationMode: activeMode
    })),
    diagnostics: latestDiagnostic
  };
}

// =========================================================================
// 8. Retrieve latest diagnostics for the in-app Ctrl+Shift+D diagnostic console
// =========================================================================
export function get_latest_diagnostics() {
  return {
    ...latestDiagnostic,
    userStats: get_user_stats()
  };
}
