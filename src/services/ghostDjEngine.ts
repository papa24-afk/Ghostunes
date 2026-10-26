// src/services/ghostDjEngine.ts
import { Track, ListeningHistoryRecord } from '../types';
import { analyzeTrackDna } from './songDnaEngine';

export type EnergyCurveType = 'ramp_up' | 'chill_plateau' | 'peak_workout' | 'late_night' | 'rollercoaster';
export type DiscoveryLevelType = 'familiar' | 'balanced' | 'adventurous';

export interface GhostDjSessionOptions {
  prompt?: string;
  seedTrack?: Track | null;
  targetDurationMinutes?: number;
  energyCurve?: EnergyCurveType;
  discoveryLevel?: DiscoveryLevelType;
  excludedArtists?: string[];
  candidatePool: Track[];
  listeningHistory?: ListeningHistoryRecord[];
}

export interface GhostDjSessionResult {
  sessionTitle: string;
  sessionDescription: string;
  tracks: Track[];
  estimatedDurationMinutes: number;
  reasons: Record<string, string>;
  averageEnergy: number;
}

// Natural language parsing helpers
export function parseNaturalLanguagePrompt(prompt: string): {
  energyCurve: EnergyCurveType;
  keywords: string[];
  suggestedDuration: number;
  title: string;
} {
  const text = prompt.toLowerCase();
  let energyCurve: EnergyCurveType = 'chill_plateau';
  let suggestedDuration = 45;
  const keywords: string[] = [];
  let title = 'Intelligent Session';

  if (text.includes('drive') || text.includes('night') || text.includes('midnight') || text.includes('atmospheric')) {
    energyCurve = 'late_night';
    keywords.push('late-night', 'atmospheric', 'smooth');
    title = 'Late Night Atmospheric Drive';
  } else if (text.includes('workout') || text.includes('gym') || text.includes('intense') || text.includes('hype') || text.includes('rage')) {
    energyCurve = 'peak_workout';
    suggestedDuration = 60;
    keywords.push('workout', 'high-energy', 'kinetic');
    title = 'High-Octane Kinetic Workout';
  } else if (text.includes('ramp') || text.includes('increase') || text.includes('build') || text.includes('gradual')) {
    energyCurve = 'ramp_up';
    keywords.push('ramp-up', 'progressive', 'building');
    title = 'Progressive Energy Build';
  } else if (text.includes('study') || text.includes('focus') || text.includes('chill') || text.includes('calm') || text.includes('ambient') || text.includes('mellow')) {
    energyCurve = 'chill_plateau';
    suggestedDuration = 60;
    keywords.push('focus', 'mellow', 'consistent');
    title = 'Deep Focus & Ambient Serenity';
  } else if (text.includes('party') || text.includes('dance') || text.includes('club') || text.includes('rollercoaster')) {
    energyCurve = 'rollercoaster';
    keywords.push('rollercoaster', 'peaks', 'dance');
    title = 'Dynamic Peak Rollercoaster';
  }

  return { energyCurve, keywords, suggestedDuration, title };
}

// Calculate target energy for position in session
function getTargetEnergyForPosition(index: number, totalTracks: number, curve: EnergyCurveType): number {
  const progress = totalTracks > 1 ? index / (totalTracks - 1) : 0.5;
  switch (curve) {
    case 'ramp_up':
      // 0.35 -> 0.85
      return 0.35 + progress * 0.50;
    case 'peak_workout':
      // Start 0.70, peak at 0.92 in middle, drop to 0.75
      return 0.70 + Math.sin(progress * Math.PI) * 0.22;
    case 'late_night':
      // Steady smooth 0.38 - 0.48 with mellow vibe
      return 0.42 + Math.sin(progress * Math.PI * 2) * 0.08;
    case 'rollercoaster':
      // Waves between 0.45 and 0.85
      return 0.65 + Math.sin(progress * Math.PI * 4) * 0.20;
    case 'chill_plateau':
    default:
      // Even calm energy 0.35 - 0.45
      return 0.40;
  }
}

// Parse track duration to seconds
function getTrackDurationSeconds(track: Track): number {
  if (track.durationSeconds && track.durationSeconds > 0) return track.durationSeconds;
  if (!track.duration) return 210;
  const parts = track.duration.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 210;
}

// Core Ghost DJ Session Generator
export async function generateGhostDjSession(options: GhostDjSessionOptions): Promise<GhostDjSessionResult> {
  const {
    prompt = '',
    seedTrack,
    targetDurationMinutes = 45,
    energyCurve: initialCurve,
    discoveryLevel = 'balanced',
    excludedArtists = [],
    candidatePool = [],
    listeningHistory = []
  } = options;

  // 1. Natural Language Interpretation
  let curve = initialCurve;
  let sessionTitle = 'Ghost DJ Session';
  let sessionDescription = 'Carefully curated harmonic listening session.';

  if (prompt && !initialCurve) {
    const parsed = parseNaturalLanguagePrompt(prompt);
    curve = parsed.energyCurve;
    sessionTitle = parsed.title;
    sessionDescription = `Generated from prompt: "${prompt}"`;
  } else if (seedTrack) {
    sessionTitle = `Radio Session: ${seedTrack.title}`;
    sessionDescription = `Guided by the acoustic identity of ${seedTrack.artist}`;
  }

  curve = curve || 'chill_plateau';

  // 2. Prepare Candidate Pool & Exclusions
  if (candidatePool.length === 0) {
    return {
      sessionTitle,
      sessionDescription: 'Candidate pool empty. Add tracks to your library to generate sessions.',
      tracks: [],
      estimatedDurationMinutes: 0,
      reasons: {},
      averageEnergy: 0.5
    };
  }

  const excludedLower = new Set(excludedArtists.map(a => a.toLowerCase().trim()));
  const eligibleTracks = candidatePool.filter(t => !excludedLower.has(t.artist.toLowerCase().trim()));

  // 3. Pre-analyze DNA for candidate tracks (fast cached or heuristic)
  const trackDnaMap = new Map<string, any>();
  for (const track of eligibleTracks) {
    const dna = await analyzeTrackDna(track);
    trackDnaMap.set(track.id, dna);
  }

  // 4. Build Recency & Frequency Penalty Map
  // Tracks played in the last 24 hours receive a soft penalty; tracks played in last 3 hours receive heavy penalty
  const now = Date.now();
  const recentTrackPenalties = new Map<string, number>();
  for (const hist of listeningHistory) {
    const ageHours = (now - hist.played_at) / (1000 * 3600);
    if (ageHours < 3) {
      recentTrackPenalties.set(hist.track_id, 0.40); // 40% penalty
    } else if (ageHours < 24) {
      recentTrackPenalties.set(hist.track_id, 0.18); // 18% penalty
    }
  }

  // Target track count based on target duration
  const targetSeconds = targetDurationMinutes * 60;
  const estimatedTrackCount = Math.max(5, Math.min(30, Math.round(targetSeconds / 210)));

  const selectedTracks: Track[] = [];
  const trackReasons: Record<string, string> = {};
  const usedTrackIds = new Set<string>();
  let currentDurationSeconds = 0;
  let lastArtist = '';

  // If seedTrack provided and eligible, start with it
  if (seedTrack && !excludedLower.has(seedTrack.artist.toLowerCase().trim())) {
    selectedTracks.push(seedTrack);
    usedTrackIds.add(seedTrack.id);
    currentDurationSeconds += getTrackDurationSeconds(seedTrack);
    lastArtist = seedTrack.artist;
    trackReasons[seedTrack.id] = 'Seed Anchor: Defined harmonic DNA for this session';
  }

  // 5. Sequential Harmonic Selection Loop
  while (selectedTracks.length < estimatedTrackCount && currentDurationSeconds < targetSeconds) {
    const currentStep = selectedTracks.length;
    const targetEnergy = getTargetEnergyForPosition(currentStep, estimatedTrackCount, curve);

    // Score all remaining candidates
    let bestTrack: Track | null = null;
    let bestScore = -999999;
    let bestReason = '';

    for (const track of eligibleTracks) {
      if (usedTrackIds.has(track.id)) continue;

      const dna = trackDnaMap.get(track.id) || { energy: 0.5, bpm: 120, valence: 0.5, acousticness: 0.3 };
      let score = 100;

      // Energy Delta Matching: closer to targetEnergy = higher score
      const energyDelta = Math.abs(dna.energy - targetEnergy);
      score -= energyDelta * 55;

      // Consecutive Artist Penalty: Avoid same artist playing back-to-back
      if (lastArtist && track.artist.toLowerCase() === lastArtist.toLowerCase()) {
        score -= 40;
      }

      // Recency Penalty
      const recencyPenalty = recentTrackPenalties.get(track.id) || 0;
      score -= recencyPenalty * 100;

      // Seed Track Affinity
      if (seedTrack) {
        const seedDna = trackDnaMap.get(seedTrack.id);
        if (seedDna) {
          const bpmDiff = Math.abs((dna.bpm || 120) - (seedDna.bpm || 120));
          if (bpmDiff <= 10) score += 12;
          const valenceDiff = Math.abs(dna.valence - seedDna.valence);
          if (valenceDiff <= 0.15) score += 10;
        }
      }

      // Discovery Level Bias
      const hasHistory = listeningHistory.some(h => h.track_id === track.id);
      if (discoveryLevel === 'familiar') {
        if (hasHistory) score += 15;
      } else if (discoveryLevel === 'adventurous') {
        if (!hasHistory) score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTrack = track;

        // Construct explainable rationale
        const energyPercent = Math.round(dna.energy * 100);
        if (currentStep === 0) {
          bestReason = `Session Opener: Establishes baseline ${dna.mood_label || 'tone'} (${energyPercent}% energy)`;
        } else if (curve === 'ramp_up') {
          bestReason = `Progressive Ramp: Aligns with target energy curve (${energyPercent}%)`;
        } else if (curve === 'late_night') {
          bestReason = `Atmospheric Match: Mellow tempo (${dna.bpm || 110} BPM) fitting late night mood`;
        } else {
          bestReason = `Harmonic Fit: Coherent energy match (${energyPercent}%) with smooth transition`;
        }
      }
    }

    if (!bestTrack) break; // No more candidates

    selectedTracks.push(bestTrack);
    usedTrackIds.add(bestTrack.id);
    currentDurationSeconds += getTrackDurationSeconds(bestTrack);
    lastArtist = bestTrack.artist;
    trackReasons[bestTrack.id] = bestReason;
  }

  // Compute final stats
  let totalEnergy = 0;
  for (const t of selectedTracks) {
    const dna = trackDnaMap.get(t.id);
    totalEnergy += dna ? dna.energy : 0.5;
  }
  const averageEnergy = selectedTracks.length > 0 ? Number((totalEnergy / selectedTracks.length).toFixed(2)) : 0.5;

  return {
    sessionTitle,
    sessionDescription,
    tracks: selectedTracks,
    estimatedDurationMinutes: Math.round(currentDurationSeconds / 60),
    reasons: trackReasons,
    averageEnergy
  };
}

// Continuous Ghost Radio Recommendation Generator
export function getNextRadioTrack(
  currentTrack: Track,
  candidatePool: Track[],
  rejectedIds: Set<string>,
  recentQueueIds: Set<string>,
  discoveryLevel: DiscoveryLevelType = 'balanced'
): { track: Track | null; reason: string } {
  const eligible = candidatePool.filter(t => !rejectedIds.has(t.id) && !recentQueueIds.has(t.id) && t.id !== currentTrack.id);
  if (eligible.length === 0) {
    return { track: null, reason: 'No eligible candidates remaining in library.' };
  }

  // Shuffle candidate pool slightly to allow organic variety
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);

  // Look for artist match first if familiar mode
  if (discoveryLevel === 'familiar') {
    const artistMatch = shuffled.find(t => t.artist.toLowerCase() === currentTrack.artist.toLowerCase());
    if (artistMatch) {
      return { track: artistMatch, reason: `Familiarity Match: Also by ${currentTrack.artist}` };
    }
  }

  // Otherwise pick high affinity track
  const pick = shuffled[0];
  return {
    track: pick,
    reason: `Radio Discovery: Coherent vibe transition from ${currentTrack.title}`
  };
}
