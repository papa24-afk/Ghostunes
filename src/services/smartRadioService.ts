// src/services/smartRadioService.ts
// Spotify-Style Smart Radio Client Service for GhostTunes
import { Track } from '../types';
import { getApiUrl } from '../utils/api';

export interface SmartRadioSeedTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artist_thumbnail?: string;
  thumbnail?: string;
  durationSeconds?: number;
  features?: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    bpm: number;
  };
}

export interface RecommendationDiagnostic {
  candidateId: string;
  title: string;
  artist: string;
  artistId?: string;
  artist_thumbnail?: string;
  thumbnail?: string;
  audioDistance: number;
  audioSimilarity: number;
  cfScore: number;
  features: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    bpm: number;
  };
  history: {
    skips: number;
    replays: number;
    completions: number;
    artistPositive: boolean;
  };
  historyModifier: number;
  finalScore: number;
  rationale: string;
}

export interface SmartRadioResponse {
  seed: SmartRadioSeedTrack;
  tracks: Track[];
  diagnostics: {
    timestamp: number;
    seedTrack: SmartRadioSeedTrack;
    recommendations: RecommendationDiagnostic[];
    userStats: {
      totalSkips: number;
      totalReplays: number;
      totalCompletions: number;
    };
  };
}

/**
 * Fetch Smart Radio recommendations from backend (Spotify multi-model pipeline)
 */
export async function fetchSmartRadio(
  videoId: string,
  meta?: { seedTitle?: string; seedArtist?: string; seedDuration?: number; mode?: string }
): Promise<SmartRadioResponse> {
  const params = new URLSearchParams();
  params.set('id', videoId);
  if (meta?.seedTitle) params.set('title', meta.seedTitle);
  if (meta?.seedArtist) params.set('artist', meta.seedArtist);
  if (meta?.seedDuration) params.set('duration', String(meta.seedDuration));
  if (meta?.mode) params.set('mode', meta.mode);

  const url = getApiUrl(`/api/smart-radio?${params.toString()}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    throw new Error(`Smart Radio API failed: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Log user interaction (skip vs. replay vs. completion) for personalization re-ranking
 */
export async function logSmartRadioFeedback(
  trackId: string,
  title: string,
  artist: string,
  action: 'skip' | 'replay' | 'complete',
  durationPlayed = 0,
  totalDuration = 0
): Promise<void> {
  try {
    const url = getApiUrl('/api/smart-radio/feedback');
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        track_id: trackId,
        title,
        artist,
        action,
        duration_played: durationPlayed,
        total_duration: totalDuration
      })
    });
  } catch (err) {
    console.warn('[SmartRadio] Feedback logging failed:', err);
  }
}

/**
 * Fetch latest recommendation diagnostics for the hidden console (Ctrl+Shift+D)
 */
export async function fetchSmartRadioDiagnostics(): Promise<any> {
  try {
    const url = getApiUrl('/api/smart-radio/diagnostics');
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Single background pre-buffering audio element to preload the stream into browser cache
let prebufferAudioElement: HTMLAudioElement | null = null;

/**
 * Pre-buffer the next recommended track into network cache when 15 seconds remain
 */
export function prebufferTrackStream(trackId: string): void {
  try {
    const streamUrl = getApiUrl(`/api/stream/${trackId}`);
    if (typeof window !== 'undefined') {
      if (!prebufferAudioElement) {
        prebufferAudioElement = new Audio();
        prebufferAudioElement.muted = true;
        prebufferAudioElement.volume = 0;
      }
      prebufferAudioElement.preload = 'auto';
      prebufferAudioElement.src = streamUrl;
      prebufferAudioElement.load();
      console.log(`[SmartRadio] Pre-buffering audio stream for track: ${trackId}`);
    }
  } catch (e) {
    console.warn('[SmartRadio] Audio pre-buffering error:', e);
  }
}
