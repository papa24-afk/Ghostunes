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
 * Fetch candidate tracks related to a YouTube Music track ID
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

  // 1. Gather raw candidates based on mode
  if (mode === 'artist') {
    defaultReason = `More from ${currentTrack.artist}`;

    // A. Search local library for same artist
    const localArtistMatches = libraryTracks.filter(t => 
      !excludedIds.has(t.id) &&
      t.artist.toLowerCase().trim() === currentArtist
    );
    candidatePool.push(...localArtistMatches);

    // B. Query search API for artist discography
    if (candidatePool.length < batchSize) {
      const apiArtistTracks = await fetchSearchFromApi(currentTrack.artist);
      for (const t of apiArtistTracks) {
        if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id)) {
          // Verify it genuinely matches the artist
          if (t.artist.toLowerCase().includes(currentArtist) || currentArtist.includes(t.artist.toLowerCase())) {
            candidatePool.push(t);
          }
        }
      }
    }
  } else if (mode === 'discover') {
    defaultReason = `New discovery based on ${currentTrack.title}`;

    // Query related tracks from YouTube Music / InnerTube
    const related = await fetchRelatedFromApi(currentId);
    for (const t of related) {
      if (!excludedIds.has(t.id)) {
        // In discover mode, prefer tracks NOT by the same artist and NOT already in user's favorites
        const isFav = userFavorites.some(f => f.id === t.id);
        const isSameArtist = t.artist.toLowerCase().trim() === currentArtist;
        if (!isFav && !isSameArtist) {
          candidatePool.push(t);
        }
      }
    }

    // Fallback if strict discovery yielded too few: allow related tracks by other artists
    if (candidatePool.length < batchSize) {
      for (const t of related) {
        if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id) && t.artist.toLowerCase().trim() !== currentArtist) {
          candidatePool.push(t);
        }
      }
    }
  } else if (mode === 'similar') {
    defaultReason = `Similar vibe to ${currentTrack.title}`;

    // Query official Up Next / Related algorithm
    const related = await fetchRelatedFromApi(currentId);
    for (const t of related) {
      if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id)) {
        candidatePool.push(t);
      }
    }

    // Fallback to searching album or title if related API gave zero
    if (candidatePool.length < batchSize) {
      const searchTerms = currentTrack.album 
        ? `${currentTrack.artist} ${currentTrack.album}`
        : `${currentTrack.artist} ${currentTrack.title}`;
      const searchResults = await fetchSearchFromApi(searchTerms);
      for (const t of searchResults) {
        if (!excludedIds.has(t.id) && !candidatePool.some(c => c.id === t.id)) {
          candidatePool.push(t);
        }
      }
    }
  } else {
    // 'balanced' mode: blend of similar, familiar favorites, and artist affinity
    defaultReason = `Curated radio based on ${currentTrack.title}`;

    // A. Start with related tracks
    const related = await fetchRelatedFromApi(currentId);
    const relatedFiltered = related.filter(t => !excludedIds.has(t.id));

    // B. Check user favorites and library for tasteful blend
    const libraryMatches = [...userFavorites, ...libraryTracks].filter(t => 
      !excludedIds.has(t.id) && 
      (t.artist.toLowerCase().trim() === currentArtist || Math.abs((t.durationSeconds || 210) - (currentTrack.durationSeconds || 210)) < 45)
    );

    // Blend: 2 related, 1 library/favorite match, then more related
    let relIdx = 0;
    let libIdx = 0;
    while (candidatePool.length < batchSize * 2 && (relIdx < relatedFiltered.length || libIdx < libraryMatches.length)) {
      if (relIdx < relatedFiltered.length) {
        const t = relatedFiltered[relIdx++];
        if (!candidatePool.some(c => c.id === t.id)) candidatePool.push(t);
      }
      if (libIdx < libraryMatches.length && candidatePool.length < batchSize * 2) {
        const t = libraryMatches[libIdx++];
        if (!candidatePool.some(c => c.id === t.id)) candidatePool.push(t);
      }
    }
  }

  // 2. Offline / Local Fallback if API returned nothing
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
