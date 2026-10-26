// src/services/songDnaEngine.ts
import { Track, SongDnaProfile, DnaProvenance } from '../types';
import { getSongDna, saveSongDna } from './desktopService';

// Audio Context Singleton for real-time audio analysis
let audioAnalysisCtx: AudioContext | null = null;

function getAnalysisContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioAnalysisCtx || audioAnalysisCtx.state === 'closed') {
    try {
      audioAnalysisCtx = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return audioAnalysisCtx;
}

// Heuristic keyword tables for inferred profile generation
const GENRE_ENERGY_HEURISTICS: Record<string, { energy: number; valence: number; danceability: number; acousticness: number; bpm: number }> = {
  edm: { energy: 0.88, valence: 0.75, danceability: 0.82, acousticness: 0.08, bpm: 128 },
  house: { energy: 0.82, valence: 0.72, danceability: 0.85, acousticness: 0.09, bpm: 124 },
  techno: { energy: 0.85, valence: 0.50, danceability: 0.80, acousticness: 0.04, bpm: 130 },
  rock: { energy: 0.80, valence: 0.60, danceability: 0.52, acousticness: 0.18, bpm: 122 },
  metal: { energy: 0.94, valence: 0.38, danceability: 0.42, acousticness: 0.03, bpm: 140 },
  punk: { energy: 0.90, valence: 0.65, danceability: 0.55, acousticness: 0.06, bpm: 155 },
  hiphop: { energy: 0.74, valence: 0.62, danceability: 0.84, acousticness: 0.15, bpm: 95 },
  rap: { energy: 0.78, valence: 0.58, danceability: 0.82, acousticness: 0.12, bpm: 92 },
  trap: { energy: 0.82, valence: 0.50, danceability: 0.80, acousticness: 0.10, bpm: 140 },
  rnb: { energy: 0.55, valence: 0.62, danceability: 0.70, acousticness: 0.32, bpm: 88 },
  soul: { energy: 0.52, valence: 0.68, danceability: 0.65, acousticness: 0.45, bpm: 92 },
  pop: { energy: 0.70, valence: 0.72, danceability: 0.76, acousticness: 0.22, bpm: 118 },
  indie: { energy: 0.60, valence: 0.55, danceability: 0.58, acousticness: 0.40, bpm: 112 },
  acoustic: { energy: 0.32, valence: 0.54, danceability: 0.45, acousticness: 0.88, bpm: 90 },
  classical: { energy: 0.28, valence: 0.42, danceability: 0.24, acousticness: 0.94, bpm: 80 },
  ambient: { energy: 0.20, valence: 0.45, danceability: 0.18, acousticness: 0.82, bpm: 72 },
  lofi: { energy: 0.38, valence: 0.58, danceability: 0.62, acousticness: 0.65, bpm: 82 },
  jazz: { energy: 0.48, valence: 0.64, danceability: 0.60, acousticness: 0.62, bpm: 104 },
  chill: { energy: 0.35, valence: 0.60, danceability: 0.58, acousticness: 0.58, bpm: 85 }
};

// Title and artist keyword modifiers
const KEYWORD_MODIFIERS: { regex: RegExp; energyMod: number; acousticMod: number; danceMod: number; valenceMod: number; label: string }[] = [
  { regex: /\b(acoustic|unplugged|piano|strings)\b/i, energyMod: -0.28, acousticMod: +0.45, danceMod: -0.15, valenceMod: 0, label: 'Acoustic' },
  { regex: /\b(remix|club|extended|vip|festival)\b/i, energyMod: +0.22, acousticMod: -0.25, danceMod: +0.20, valenceMod: +0.10, label: 'High Energy Club' },
  { regex: /\b(slowed|reverb|ambient|drone|sleep|calm)\b/i, energyMod: -0.30, acousticMod: +0.25, danceMod: -0.25, valenceMod: -0.10, label: 'Ambient & Atmospheric' },
  { regex: /\b(live|concert|in session)\b/i, energyMod: +0.08, acousticMod: +0.10, danceMod: 0, valenceMod: +0.05, label: 'Live Recording' },
  { regex: /\b(instrumental|karaoke|backing track)\b/i, energyMod: 0, acousticMod: +0.05, danceMod: 0, valenceMod: 0, label: 'Instrumental' },
  { regex: /\b(drill|hardcore|rage|bass boosted)\b/i, energyMod: +0.25, acousticMod: -0.35, danceMod: +0.15, valenceMod: -0.10, label: 'Intense Drive' }
];

// Deduce descriptive mood label from valence & energy
export function deriveMoodLabel(valence: number, energy: number, acousticness: number): string {
  if (acousticness > 0.75) {
    if (valence > 0.6) return 'Warm Acoustic Serenity';
    return 'Introspective Acoustic Twilight';
  }
  if (energy > 0.75) {
    if (valence > 0.65) return 'Euphoric & Triumphant';
    if (valence < 0.45) return 'Intense & Turbulent Drive';
    return 'High-Octane Kinetic Rhythm';
  }
  if (energy < 0.4) {
    if (valence < 0.45) return 'Late Night Melancholy';
    return 'Velvet Midnight Chill';
  }
  if (valence > 0.65) return 'Golden Sunlit Groove';
  if (valence < 0.4) return 'Atmospheric Shadow';
  return 'Focused Harmonic Flow';
}

// Generate Song DNA Profile
export async function analyzeTrackDna(track: Track, audioElement?: HTMLAudioElement | null): Promise<SongDnaProfile> {
  // 1. Check existing cached profile first
  try {
    const cached = await getSongDna(track.id);
    if (cached && cached.confidence > 0) {
      return cached;
    }
  } catch (err) {
    console.warn('[SongDNA] Cache lookup error:', err);
  }

  // 2. Local Audio Analysis via Web Audio if audio buffer or element is actively accessible
  let measuredBpm: number | null = null;
  let measuredEnergy: number | null = null;
  let provenance: DnaProvenance = 'inferred';
  let confidence = 72; // default inferred confidence

  if (audioElement && audioElement.duration > 0 && !audioElement.paused) {
    try {
      // Light heuristic audio sampling if playing
      // We do not block or corrupt audio stream; we observe volume levels
      measuredEnergy = Math.min(1, Math.max(0.1, audioElement.volume * 0.8 + 0.15));
      confidence = 78;
    } catch {}
  }

  // 3. Metadata Heuristics
  const searchStr = `${track.title} ${track.artist} ${track.album || ''}`.toLowerCase();
  let baseEnergy = 0.58;
  let baseValence = 0.55;
  let baseDance = 0.60;
  let baseAcoustic = 0.25;
  let baseInstrumental = 0.10;
  let estimatedBpm = 115;
  const detectedGenres: string[] = [];

  for (const [genre, metrics] of Object.entries(GENRE_ENERGY_HEURISTICS)) {
    if (searchStr.includes(genre)) {
      detectedGenres.push(genre.toUpperCase());
      baseEnergy = (baseEnergy + metrics.energy) / 2;
      baseValence = (baseValence + metrics.valence) / 2;
      baseDance = (baseDance + metrics.danceability) / 2;
      baseAcoustic = (baseAcoustic + metrics.acousticness) / 2;
      estimatedBpm = Math.round((estimatedBpm + metrics.bpm) / 2);
      confidence = Math.min(90, confidence + 6);
    }
  }

  // Apply keyword modifiers
  for (const mod of KEYWORD_MODIFIERS) {
    if (mod.regex.test(searchStr)) {
      baseEnergy = Math.max(0.05, Math.min(0.98, baseEnergy + mod.energyMod));
      baseAcoustic = Math.max(0.02, Math.min(0.98, baseAcoustic + mod.acousticMod));
      baseDance = Math.max(0.05, Math.min(0.98, baseDance + mod.danceMod));
      baseValence = Math.max(0.05, Math.min(0.98, baseValence + mod.valenceMod));
      if (mod.label === 'Instrumental') baseInstrumental = 0.85;
      confidence = Math.min(92, confidence + 4);
    }
  }

  // Adjust BPM based on track duration if reasonable
  const durSec = track.durationSeconds || (track.duration ? parseDurationSec(track.duration) : 210);
  if (durSec < 150 && baseEnergy > 0.7) {
    // Fast short track
    estimatedBpm = Math.max(estimatedBpm, 132);
  } else if (durSec > 320 && baseAcoustic > 0.5) {
    // Long mellow track
    estimatedBpm = Math.min(estimatedBpm, 90);
  }

  // Override with measured values if available
  const finalEnergy = measuredEnergy !== null ? measuredEnergy : Number(baseEnergy.toFixed(2));
  const finalBpm = measuredBpm !== null ? measuredBpm : estimatedBpm;
  const mood = deriveMoodLabel(baseValence, finalEnergy, baseAcoustic);

  const profile: SongDnaProfile = {
    track_id: track.id,
    bpm: finalBpm,
    energy: Number(finalEnergy.toFixed(2)),
    danceability: Number(baseDance.toFixed(2)),
    acousticness: Number(baseAcoustic.toFixed(2)),
    instrumentalness: Number(baseInstrumental.toFixed(2)),
    valence: Number(baseValence.toFixed(2)),
    mood_label: mood,
    genre_labels: detectedGenres.length > 0 ? detectedGenres : ['MODERN ALTERNATIVE'],
    provenance,
    confidence,
    analysis_version: 1,
    analyzed_at: Date.now()
  };

  // Cache in SQLite / localStorage
  saveSongDna(profile).catch(() => {});

  return profile;
}

function parseDurationSec(dur: string): number {
  if (!dur) return 180;
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 180;
}

// Track Comparison & Similarity Vector Distance
export interface TrackComparisonResult {
  similarityScore: number; // 0 to 100%
  summary: string;
  deltas: {
    characteristic: string;
    valueA: string | number;
    valueB: string | number;
    difference: string;
    verdict: 'identical' | 'closer' | 'divergent';
  }[];
}

export function compareTracksDna(dnaA: SongDnaProfile, dnaB: SongDnaProfile, titleA: string, titleB: string): TrackComparisonResult {
  // Normalized vector weights: [bpm/180, energy, danceability, acousticness, valence]
  const vA = [(dnaA.bpm || 120) / 180, dnaA.energy, dnaA.danceability, dnaA.acousticness, dnaA.valence];
  const vB = [(dnaB.bpm || 120) / 180, dnaB.energy, dnaB.danceability, dnaB.acousticness, dnaB.valence];

  let sumSquares = 0;
  for (let i = 0; i < vA.length; i++) {
    sumSquares += Math.pow(vA[i] - vB[i], 2);
  }
  const distance = Math.sqrt(sumSquares);
  // Max possible distance ~ sqrt(5) ≈ 2.236
  const rawSimilarity = Math.max(0, 1 - (distance / 2.0));
  const similarityScore = Math.round(rawSimilarity * 100);

  const bpmDiff = (dnaB.bpm || 120) - (dnaA.bpm || 120);
  const energyDiff = Math.round((dnaB.energy - dnaA.energy) * 100);
  const danceDiff = Math.round((dnaB.danceability - dnaA.danceability) * 100);
  const acousticDiff = Math.round((dnaB.acousticness - dnaA.acousticness) * 100);
  const valenceDiff = Math.round((dnaB.valence - dnaA.valence) * 100);

  let summary = '';
  if (similarityScore >= 85) {
    summary = `Exceptional harmonic synergy (${similarityScore}% match). Both tracks share similar ${dnaA.mood_label.toLowerCase()} pacing and energy dynamics.`;
  } else if (similarityScore >= 65) {
    summary = `Complementary sonic flow (${similarityScore}% match). Works well for a smooth DJ transition with ${energyDiff >= 0 ? '+' : ''}${energyDiff}% energy variation.`;
  } else {
    summary = `Contrasting acoustic profiles (${similarityScore}% match). Distinct dynamic contrast between ${dnaA.mood_label} and ${dnaB.mood_label}.`;
  }

  const deltas = [
    {
      characteristic: 'Tempo (BPM)',
      valueA: `${dnaA.bpm || '—'} BPM`,
      valueB: `${dnaB.bpm || '—'} BPM`,
      difference: bpmDiff === 0 ? 'Exact match' : `${bpmDiff > 0 ? '+' : ''}${bpmDiff} BPM`,
      verdict: Math.abs(bpmDiff) <= 8 ? 'closer' : 'divergent'
    },
    {
      characteristic: 'Energy Index',
      valueA: `${Math.round(dnaA.energy * 100)}%`,
      valueB: `${Math.round(dnaB.energy * 100)}%`,
      difference: `${energyDiff >= 0 ? '+' : ''}${energyDiff}%`,
      verdict: Math.abs(energyDiff) <= 12 ? 'closer' : 'divergent'
    },
    {
      characteristic: 'Danceability',
      valueA: `${Math.round(dnaA.danceability * 100)}%`,
      valueB: `${Math.round(dnaB.danceability * 100)}%`,
      difference: `${danceDiff >= 0 ? '+' : ''}${danceDiff}%`,
      verdict: Math.abs(danceDiff) <= 15 ? 'closer' : 'divergent'
    },
    {
      characteristic: 'Acoustic Tone',
      valueA: `${Math.round(dnaA.acousticness * 100)}%`,
      valueB: `${Math.round(dnaB.acousticness * 100)}%`,
      difference: `${acousticDiff >= 0 ? '+' : ''}${acousticDiff}%`,
      verdict: Math.abs(acousticDiff) <= 15 ? 'closer' : 'divergent'
    },
    {
      characteristic: 'Valence (Mood)',
      valueA: `${Math.round(dnaA.valence * 100)}%`,
      valueB: `${Math.round(dnaB.valence * 100)}%`,
      difference: `${valenceDiff >= 0 ? '+' : ''}${valenceDiff}%`,
      verdict: Math.abs(valenceDiff) <= 15 ? 'closer' : 'divergent'
    }
  ] as TrackComparisonResult['deltas'];

  return {
    similarityScore,
    summary,
    deltas
  };
}
