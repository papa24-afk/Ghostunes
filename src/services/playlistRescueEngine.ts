// src/services/playlistRescueEngine.ts
import { Track, Playlist, PlaylistRescueMatch } from '../types';
import { getApiBaseUrl } from '../utils/api';

// String normalization
function cleanString(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/[\(\[\{].*?[\)\]\}]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(cleanString(a).split(' ').filter(Boolean));
  const tokensB = new Set(cleanString(b).split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return (2 * intersection) / (tokensA.size + tokensB.size);
}

function parseDurationSec(dur: string | number | undefined): number {
  if (typeof dur === 'number') return dur;
  if (!dur) return 210;
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 210;
}

// Compute explainable match score
export function evaluateCandidateMatch(
  original: { title: string; artist: string; duration?: string; album?: string },
  candidate: Track
): { score: number; reason: string; status: 'matched' | 'low_confidence' | 'unmatched' } {
  const origCleanTitle = cleanString(original.title);
  const candCleanTitle = cleanString(candidate.title);

  const titleScore = tokenSimilarity(origCleanTitle, candCleanTitle);
  const artistScore = tokenSimilarity(original.artist, candidate.artist);

  // Duration proximity
  const origDur = parseDurationSec(original.duration);
  const candDur = candidate.durationSeconds || parseDurationSec(candidate.duration);
  const durDelta = Math.abs(origDur - candDur);

  let durScore = 1.0;
  if (durDelta > 45) {
    durScore = 0.3;
  } else if (durDelta > 20) {
    durScore = 0.65;
  } else if (durDelta > 8) {
    durScore = 0.88;
  }

  // Version penalties
  const origLower = (original.title + ' ' + (original.album || '')).toLowerCase();
  const candLower = (candidate.title + ' ' + (candidate.album || '')).toLowerCase();

  let penalty = 0;
  let penaltyReasons: string[] = [];

  if (!origLower.includes('remix') && candLower.includes('remix')) {
    penalty += 0.35;
    penaltyReasons.push('Remix mismatch (-35%)');
  }
  if (!origLower.includes('live') && candLower.includes('live')) {
    penalty += 0.30;
    penaltyReasons.push('Live recording mismatch (-30%)');
  }
  if (!origLower.includes('acoustic') && candLower.includes('acoustic')) {
    penalty += 0.25;
    penaltyReasons.push('Acoustic version mismatch (-25%)');
  }
  if (!origLower.includes('instrumental') && candLower.includes('instrumental')) {
    penalty += 0.40;
    penaltyReasons.push('Instrumental cut mismatch (-40%)');
  }

  // Multi-factor weighted score
  const rawScore = (titleScore * 0.50 + artistScore * 0.30 + durScore * 0.20) - penalty;
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore * 100)));

  let status: 'matched' | 'low_confidence' | 'unmatched' = 'matched';
  let reason = '';

  if (finalScore >= 82) {
    status = 'matched';
    reason = `Exact acoustic match: Title (${Math.round(titleScore * 100)}%) & Artist (${Math.round(artistScore * 100)}%) with &le;${durDelta}s duration variance`;
  } else if (finalScore >= 55) {
    status = 'low_confidence';
    reason = penaltyReasons.length > 0
      ? `Probable match with caveats: ${penaltyReasons.join(', ')}`
      : `Approximate title match (${Math.round(titleScore * 100)}%), verify version`;
  } else {
    status = 'unmatched';
    reason = `Low confidence match (${finalScore}%). Significant title or artist variance.`;
  }

  return { score: finalScore, reason, status };
}

// Search online catalogue for track candidates
export async function searchTrackCandidates(title: string, artist: string): Promise<Track[]> {
  try {
    const cleanTitle = title.replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
    const cleanArtist = (artist || '').split(/[,&]/)[0].trim();
    const query = encodeURIComponent(`${cleanTitle} ${cleanArtist}`.trim());

    const res = await fetch(`${getApiBaseUrl()}/api/search?q=${query}&filter=songs`);
    if (!res.ok) return [];
    const data = await res.json();
    const songs = data.songs || data.contents || [];

    return songs.slice(0, 6).map((s: any) => ({
      id: s.id,
      title: s.title,
      artist: s.artists?.[0]?.name || s.author?.name || 'Unknown Artist',
      album: s.album?.name || '',
      duration: s.duration?.text || s.duration || '3:30',
      durationSeconds: s.duration?.seconds || 210,
      thumbnail: s.thumbnails?.[s.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg`
    }));
  } catch (err) {
    console.warn('[PlaylistRescue] Search candidate error:', err);
    return [];
  }
}

// Full Playlist Health Diagnostic & Rescue Scan
export async function auditAndRescuePlaylist(
  playlist: Playlist,
  onProgress?: (current: number, total: number) => void
): Promise<PlaylistRescueMatch[]> {
  const matches: PlaylistRescueMatch[] = [];
  const tracks = playlist.tracks || [];

  for (let idx = 0; idx < tracks.length; idx++) {
    const orig = tracks[idx];
    if (onProgress) onProgress(idx + 1, tracks.length);

    // If track already has direct id and audio stream is playable
    const candidates = await searchTrackCandidates(orig.title, orig.artist);
    let matchedCandidate: Track | null = orig;
    let evalResult = evaluateCandidateMatch(orig, orig);

    if (evalResult.score < 80 && candidates.length > 0) {
      // Pick best candidate from search
      let bestCand = candidates[0];
      let bestEval = evaluateCandidateMatch(orig, candidates[0]);

      for (const cand of candidates) {
        const ev = evaluateCandidateMatch(orig, cand);
        if (ev.score > bestEval.score) {
          bestEval = ev;
          bestCand = cand;
        }
      }

      matchedCandidate = bestCand;
      evalResult = bestEval;
    }

    matches.push({
      originalIndex: idx,
      originalTrack: {
        title: orig.title,
        artist: orig.artist,
        album: orig.album,
        duration: orig.duration
      },
      matchedTrack: matchedCandidate,
      confidence: evalResult.score,
      matchReason: evalResult.reason,
      status: evalResult.status,
      candidates
    });
  }

  return matches;
}
