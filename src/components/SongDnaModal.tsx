// src/components/SongDnaModal.tsx
import React, { useState, useEffect } from 'react';
import { X, Dna, Activity, Zap, Radio, Sparkles, Scale, CheckCircle2, AlertCircle, Music } from 'lucide-react';
import { Track, SongDnaProfile } from '../types';
import { analyzeTrackDna, compareTracksDna, TrackComparisonResult } from '../services/songDnaEngine';

interface SongDnaModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  availableTracks?: Track[];
  onSelectTrackForRadio?: (track: Track) => void;
}

export const SongDnaModal: React.FC<SongDnaModalProps> = ({
  isOpen,
  onClose,
  track,
  availableTracks = [],
  onSelectTrackForRadio
}) => {
  const [profile, setProfile] = useState<SongDnaProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [compareTrack, setCompareTrack] = useState<Track | null>(null);
  const [compareProfile, setCompareProfile] = useState<SongDnaProfile | null>(null);
  const [comparisonResult, setComparisonResult] = useState<TrackComparisonResult | null>(null);

  useEffect(() => {
    if (!isOpen || !track) {
      setProfile(null);
      setCompareTrack(null);
      setCompareProfile(null);
      setComparisonResult(null);
      return;
    }

    setLoading(true);
    analyzeTrackDna(track)
      .then(p => {
        setProfile(p);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen, track]);

  useEffect(() => {
    if (!profile || !compareTrack) {
      setCompareProfile(null);
      setComparisonResult(null);
      return;
    }

    analyzeTrackDna(compareTrack).then(cP => {
      setCompareProfile(cP);
      if (track) {
        const comp = compareTracksDna(profile, cP, track.title, compareTrack.title);
        setComparisonResult(comp);
      }
    });
  }, [compareTrack, profile, track]);

  if (!isOpen || !track) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-2xl bg-zinc-950/95 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Dna className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif text-zinc-100 tracking-wide">Song DNA Profile</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                  Transparent Discovery
                </span>
              </div>
              <p className="text-xs text-zinc-400">Acoustic fingerprint & explainable music metrics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Track Summary Hero */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
            <img
              src={track.thumbnail || track.local_artwork_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80'}
              alt={track.title}
              className="w-16 h-16 rounded-lg object-cover shadow-lg border border-zinc-800"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white truncate font-serif">{track.title}</h3>
              <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
              {profile && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {profile.mood_label}
                  </span>
                  {profile.genre_labels.map((g, idx) => (
                    <span key={idx} className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                      {g}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Provenance Badge */}
            {profile && (
              <div className="text-right">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider ${
                  profile.provenance === 'measured'
                    ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                    : profile.provenance === 'provider'
                    ? 'bg-indigo-950/60 border border-indigo-500/40 text-indigo-300'
                    : 'bg-zinc-800/80 border border-zinc-700 text-amber-300'
                }`}>
                  {profile.provenance === 'measured' ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                  )}
                  <span>{profile.provenance} ({profile.confidence}% conf)</span>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  {profile.provenance === 'measured' ? 'Web Audio Peak' : 'Acoustic Heuristic Model'}
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-400 gap-3">
              <Activity className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-sm">Analyzing acoustic properties and harmonics...</p>
            </div>
          ) : profile ? (
            <>
              {/* Characteristic Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {/* BPM Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Tempo</span>
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {profile.bpm || '—'} <span className="text-xs font-normal text-zinc-400">BPM</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    {profile.bpm && profile.bpm > 125 ? 'High velocity pace' : profile.bpm && profile.bpm < 95 ? 'Slow, rhythmic cadence' : 'Mid-tempo groove'}
                  </p>
                </div>

                {/* Energy Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Energy</span>
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {Math.round(profile.energy * 100)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-rose-500 h-full rounded-full"
                      style={{ width: `${Math.round(profile.energy * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Danceability Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Danceability</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {Math.round(profile.danceability * 100)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${Math.round(profile.danceability * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Acousticness Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Acousticness</span>
                    <Music className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {Math.round(profile.acousticness * 100)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full"
                      style={{ width: `${Math.round(profile.acousticness * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Valence / Mood Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Valence (Mood)</span>
                    <Radio className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {Math.round(profile.valence * 100)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-indigo-400 h-full rounded-full"
                      style={{ width: `${Math.round(profile.valence * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Instrumentalness Card */}
                <div className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-zinc-400 mb-1">
                    <span className="text-xs uppercase font-mono tracking-wider">Instrumental</span>
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-2xl font-bold font-mono text-zinc-100">
                    {Math.round(profile.instrumentalness * 100)}%
                  </div>
                  <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-purple-400 h-full rounded-full"
                      style={{ width: `${Math.round(profile.instrumentalness * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Track Comparison Section */}
              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-zinc-200 font-serif">Compare With Another Track</h4>
                  </div>
                  {availableTracks.length > 0 && (
                    <select
                      value={compareTrack?.id || ''}
                      onChange={(e) => {
                        const sel = availableTracks.find(t => t.id === e.target.value);
                        setCompareTrack(sel || null);
                      }}
                      className="bg-zinc-800 text-xs text-zinc-200 border border-zinc-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Select track to compare...</option>
                      {availableTracks
                        .filter(t => t.id !== track.id)
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            {t.title} — {t.artist}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                {comparisonResult && compareTrack ? (
                  <div className="space-y-3 pt-2 border-t border-zinc-800/60">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/70 border border-zinc-800">
                      <div>
                        <div className="text-xs text-zinc-400">Synergy Index</div>
                        <div className="text-lg font-bold font-mono text-amber-400">
                          {comparisonResult.similarityScore}% Harmonic Match
                        </div>
                      </div>
                      <div className="text-xs text-zinc-300 max-w-sm text-right">
                        {comparisonResult.summary}
                      </div>
                    </div>

                    {/* Comparison Delta Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-800 text-zinc-400 font-mono">
                            <th className="py-2">Metric</th>
                            <th className="py-2">{track.title.slice(0, 18)}...</th>
                            <th className="py-2">{compareTrack.title.slice(0, 18)}...</th>
                            <th className="py-2 text-right">Variance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40 text-zinc-300">
                          {comparisonResult.deltas.map((d, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/30">
                              <td className="py-2 font-medium">{d.characteristic}</td>
                              <td className="py-2 font-mono text-zinc-400">{d.valueA}</td>
                              <td className="py-2 font-mono text-zinc-400">{d.valueB}</td>
                              <td className="py-2 text-right font-mono">
                                <span className={`px-2 py-0.5 rounded text-[11px] ${
                                  d.verdict === 'closer' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800 text-zinc-300'
                                }`}>
                                  {d.difference}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    Choose any track from your library or current queue to view side-by-side harmonic synergy and DJ transition suitability.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 font-mono">
            Analysis Engine v1.0 • Ghosttunes Labs
          </div>
          <div className="flex items-center gap-2">
            {onSelectTrackForRadio && (
              <button
                onClick={() => {
                  onSelectTrackForRadio(track);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Launch Ghost Radio</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
