// src/services/smartAutoplayService.ts
import { Track, AutoplayMode } from '../types';
import { getApiUrl } from '../utils/api';

export interface AutoplayCandidateOptions {
  currentTrack: Track;
  mode: AutoplayMode;
  queue: Track[];
  playedHistoryIds: Set<string>;
  rejectedIds: Set<string>;
  userFavorites?: Track[];
  libraryTracks?: Track[];
  batchSize?: number;
}

export interface AutoplayBatchResult {
  tracks: Track[];
  reason: string;
}

// In-memory cache for related queries during session
const sessionRelatedCache = new Map<string, Track[]>();

/**
 * Fetch candidate tracks directly from official Spotify-Style Smart Radio endpoint (/api/smart-radio)
 * Powered by YouTube InnerTube Mix (RD + videoId) & SQLite History
 */
export async function fetchSmartRadioFromApi(
  trackId: string,
  title: string,
  artist: string,
  mode: AutoplayMode,
  duration?: number
): Promise<Track[]> {
  const cacheKey = `${trackId}_${mode}`;
  if (sessionRelatedCache.has(cacheKey)) {
    return sessionRelatedCache.get(cacheKey)!;
  }

  try {
    const qStr = `id=${encodeURIComponent(trackId)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&mode=${encodeURIComponent(mode)}&duration=${duration || 210}`;
    const res = await fetch(getApiUrl(`/api/smart-radio?${qStr}`), {
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: Track[] = (data.tracks || []).map((t: any) => ({
      id: String(t.id),
      title: String(t.title || 'Unknown Title'),
      artist: String(t.artist || 'Unknown Artist'),
      artistId: t.artistId ? String(t.artistId) : undefined,
      artist_thumbnail: t.artist_thumbnail ? String(t.artist_thumbnail) : undefined,
      album: t.album ? String(t.album) : '',
      duration: t.duration ? String(t.duration) : '3:30',
      durationSeconds: Number(t.durationSeconds) || 210,
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`,
      source: t.source || 'youtube'
    }));

    if (tracks.length > 0) {
      sessionRelatedCache.set(cacheKey, tracks);
    }
    return tracks;
  } catch (err) {
    console.warn('[SmartAutoplay] fetchSmartRadioFromApi error:', err);
    return [];
  }
}

/**
 * Fetch candidate tracks related to a YouTube Music track ID (fallback)
 */
async function fetchRelatedFromApi(trackId: string): Promise<Track[]> {
  if (sessionRelatedCache.has(trackId)) {
    return sessionRelatedCache.get(trackId)!;
  }

  try {
    const res = await fetch(getApiUrl(`/api/related?id=${encodeURIComponent(trackId)}`), {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: Track[] = (data.tracks || []).map((t: any) => ({
      id: String(t.id),
      title: String(t.title || 'Unknown Title'),
      artist: String(t.artist || 'Unknown Artist'),
      artistId: t.artistId ? String(t.artistId) : undefined,
      artist_thumbnail: t.artist_thumbnail ? String(t.artist_thumbnail) : undefined,
      album: t.album ? String(t.album) : '',
      duration: t.duration ? String(t.duration) : '3:30',
      durationSeconds: Number(t.durationSeconds) || 210,
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`,
      source: t.source || 'youtube'
    }));

    sessionRelatedCache.set(trackId, tracks);
    return tracks;
  } catch (err) {
    console.warn('[SmartAutoplay] fetchRelatedFromApi error:', err);
    return [];
  }
}

/**
 * Fetch candidate tracks by search query (e.g. artist or title)
 */
async function fetchSearchFromApi(query: string): Promise<Track[]> {
  try {
    const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(query)}`), {
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tracks: Track[] = (data.tracks || []).map((t: any) => ({
      id: String(t.id),
      title: String(t.title || 'Unknown Title'),
      artist: String(t.artist || 'Unknown Artist'),
      artistId: t.artistId ? String(t.artistId) : undefined,
      artist_thumbnail: t.artist_thumbnail ? String(t.artist_thumbnail) : undefined,
      album: t.album ? String(t.album) : '',
      duration: t.duration ? String(t.duration) : '3:30',
      durationSeconds: Number(t.durationSeconds) || 210,
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`,
      source: t.source || 'youtube'
    }));
    return tracks;
  } catch (err) {
    console.warn('[SmartAutoplay] fetchSearchFromApi error:', err);
    return [];
  }
}

/**
 * Generate a smart autoplay batch tailored to the user's selected mode
 */
export async function generateAutoplayBatch({
  currentTrack,
  mode,
  queue,
  playedHistoryIds,
  rejectedIds,
  userFavorites = [],
  libraryTracks = [],
  batchSize = 4
}: AutoplayCandidateOptions): Promise<AutoplayBatchResult> {
  const currentId = currentTrack.id;
  const currentArtist = currentTrack.artist.toLowerCase().trim();
  const currentTitle = currentTrack.title.toLowerCase().trim();

  // Excluded ID set: current track, all items in current queue, played tracks, rejected tracks
  const excludedIds = new Set<string>();
  excludedIds.add(currentId);
  queue.forEach(t => excludedIds.add(t.id));
  playedHistoryIds.forEach(id => excludedIds.add(id));
  rejectedIds.forEach(id => excludedIds.add(id));

  let candidatePool: Track[] = [];
  let defaultReason = `Similar to ${currentTrack.title}`;

  // 1. Primary Recommendation Source: YouTube InnerTube Mix via /api/smart-radio
  const smartRadioTracks = await fetchSmartRadioFromApi(
    currentId,
    currentTrack.title,
    currentTrack.artist,
    mode,
    currentTrack.durationSeconds
  );

  if (smartRadioTracks.length > 0) {
    if (mode === 'artist') {
      defaultReason = `100% official tracks from ${currentTrack.artist}`;
    } else if (mode === 'similar') {
      defaultReason = `Similar artists related to ${currentTrack.artist}`;
    } else {
      defaultReason = `Curated 50/50 mix based on ${currentTrack.title}`;
    }

    for (const t of smartRadioTracks) {
      if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id)) {
        candidatePool.push(t);
      }
    }
  }

  // 2. Secondary fallback if Smart Radio returned empty (e.g. offline/network issue)
  if (candidatePool.length < batchSize) {
    if (mode === 'artist') {
      // Local library matches for the same artist
      const localArtistMatches = libraryTracks.filter(t => 
        !excludedIds.has(t.id) &&
        t.artist.toLowerCase().trim() === currentArtist
      );
      candidatePool.push(...localArtistMatches);
    } else {
      // Related tracks from official UpNext
      const related = await fetchRelatedFromApi(currentId);
      for (const t of related) {
        if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id)) {
          if (mode === 'similar' && t.artist.toLowerCase().trim() === currentArtist) continue;
          candidatePool.push(t);
        }
      }
    }
  }

  // 3. Offline / Local Fallback if API returned nothing
  if (candidatePool.length === 0) {
    const offlinePool = [...libraryTracks, ...userFavorites].filter(t => !excludedIds.has(t.id));
    if (offlinePool.length > 0) {
      // Pick tracks prioritizing same artist or similar duration
      const sameArtist = offlinePool.filter(t => t.artist.toLowerCase().trim() === currentArtist);
      if (sameArtist.length > 0) {
        candidatePool = sameArtist;
        defaultReason = `From your library by ${currentTrack.artist}`;
      } else {
        candidatePool = offlinePool;
        defaultReason = `From your music library`;
      }
    }
  }

  // 3. Score and Rank Candidates
  const scored = candidatePool.map(track => {
    let score = 50;
    const isSameArtist = track.artist.toLowerCase().trim() === currentArtist;
    const isFavorite = userFavorites.some(f => f.id === track.id);
    const isLocal = libraryTracks.some(l => l.id === track.id);

    if (mode === 'artist') {
      if (isSameArtist) score += 40;
    } else if (mode === 'similar') {
      if (!isSameArtist) score += 10; // variety
      if (track.album && currentTrack.album && track.album.toLowerCase() === currentTrack.album.toLowerCase()) {
        score += 20;
      }
    } else if (mode === 'discover') {
      if (!isSameArtist && !isFavorite && !isLocal) score += 35;
      if (isFavorite) score -= 30;
    } else {
      // balanced
      if (isFavorite) score += 15;
      if (isSameArtist) score += 10;
    }

    return { track, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top batch
  const selectedBatch: Track[] = [];
  const chosenTitles = new Set<string>();

  for (const item of scored) {
    if (selectedBatch.length >= batchSize) break;
    const normTitle = item.track.title.toLowerCase().trim();
    // Avoid duplicate song titles (e.g. remix/clean versions of the same song)
    if (chosenTitles.has(normTitle) || normTitle === currentTitle) continue;
    chosenTitles.add(normTitle);

    let itemReason = defaultReason;
    if (item.track.artist.toLowerCase().trim() === currentArtist) {
      itemReason = `More from ${item.track.artist}`;
    } else if (mode === 'discover') {
      itemReason = `Discovery: Similar to ${currentTrack.title}`;
    } else if (userFavorites.some(f => f.id === item.track.id)) {
      itemReason = `Selected from your favorites`;
    }

    selectedBatch.push({
      ...item.track,
      isAutoplay: true,
      recommendationReason: itemReason,
      recommendationMode: mode
    });
  }

  if (selectedBatch.length === 0) {
    return {
      tracks: [],
      reason: 'No eligible candidate tracks available for autoplay in this mode.'
    };
  }

  return {
    tracks: selectedBatch,
    reason: defaultReason
  };
}
