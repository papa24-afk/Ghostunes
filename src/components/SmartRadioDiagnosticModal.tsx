// src/components/SmartRadioDiagnosticModal.tsx
// Hidden Diagnostic Console (Ctrl+Shift+D) for Spotify-Style Smart Radio Engine
// Displays YouTube Mix (RD+videoId) candidate breakdown, 5D vector proximity, and active tab filtering (Artist, Similar, Balanced)

import React, { useEffect, useState } from 'react';
import { X, Radio, Activity, Sparkles, RefreshCw, Volume2, ShieldCheck, ThumbsDown, RotateCcw, CheckCircle, Users, Disc3 } from 'lucide-react';
import { fetchSmartRadioDiagnostics, fetchSmartRadio, RecommendationDiagnostic, SmartRadioSeedTrack } from '../services/smartRadioService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentTrackId?: string | null;
  currentArtist?: string | null;
  activeMode?: string;
  onModeChange?: (mode: string) => void;
}

export const SmartRadioDiagnosticModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  currentTrackId, 
  currentArtist,
  activeMode = 'balanced',
  onModeChange 
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState(activeMode);
  const [diagnosticData, setDiagnosticData] = useState<{
    timestamp: number;
    mode?: string;
    seedTrack: SmartRadioSeedTrack | null;
    recommendations: RecommendationDiagnostic[];
    userStats: { totalSkips: number; totalReplays: number; totalCompletions: number };
    mixStats?: { totalMixEntries: number; artistCount: number; similarCount: number };
  } | null>(null);

  useEffect(() => {
    setSelectedMode(activeMode);
  }, [activeMode]);

  const loadData = async (modeToUse = selectedMode) => {
    setLoading(true);
    try {
      if (currentTrackId) {
        // Fetch recommendations directly for the selected mode
        const res = await fetchSmartRadio(currentTrackId, {
          seedArtist: currentArtist || undefined,
          mode: modeToUse
        });
        if (res && res.diagnostics) {
          setDiagnosticData(res.diagnostics);
        }
      } else {
        const data = await fetchSmartRadioDiagnostics();
        if (data) {
          setDiagnosticData(data);
        }
      }
    } catch (e) {
      console.warn('Failed to load smart radio diagnostics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData(selectedMode);
    }
  }, [isOpen, currentTrackId, selectedMode]);

  const handleSelectMode = (newMode: string) => {
    setSelectedMode(newMode);
    onModeChange?.(newMode);
    loadData(newMode);
  };

  if (!isOpen) return null;

  const topRec = diagnosticData?.recommendations?.[0];
  const seed = diagnosticData?.seedTrack;
  const userStats = diagnosticData?.userStats || { totalSkips: 0, totalReplays: 0, totalCompletions: 0 };
  const mixStats = diagnosticData?.mixStats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-zinc-950/95 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/10 overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">Smart Radio Diagnostic Console</h2>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  YouTube Mix (RD) Engine
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white/10 text-zinc-400">
                  Ctrl+Shift+D
                </span>
              </div>
              <p className="text-xs text-zinc-400">Algorithmic relation graph + Annoy acoustic vector proximity</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(selectedMode)}
              disabled={loading}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Refresh diagnostic data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Selector Tabs (Artist / Similar / Balanced) */}
        <div className="px-6 py-3 border-b border-white/10 bg-zinc-900/60 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-400 mr-1">Active Filter Tab:</span>
            {[
              { id: 'balanced', label: 'Balanced (50/50)', desc: '50% Original Artist + 50% Related Peers' },
              { id: 'artist', label: 'Artist Only', desc: 'Exclusively tracks by the original artist' },
              { id: 'similar', label: 'Similar Artists', desc: 'Excludes original artist, plays related peers' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleSelectMode(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  selectedMode === tab.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
                title={tab.desc}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mixStats && (
            <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-3">
              <span>Mix: <strong className="text-zinc-200">{mixStats.totalMixEntries}</strong> tracks</span>
              <span>Artist: <strong className="text-emerald-400">{mixStats.artistCount}</strong></span>
              <span>Similar: <strong className="text-cyan-400">{mixStats.similarCount}</strong></span>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-sm">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400 uppercase font-mono">SQLite Skips Logged</div>
                <div className="text-xl font-bold text-rose-400">{userStats.totalSkips}</div>
              </div>
              <ThumbsDown className="w-5 h-5 text-rose-500/40" />
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400 uppercase font-mono">SQLite Replays Logged</div>
                <div className="text-xl font-bold text-emerald-400">{userStats.totalReplays}</div>
              </div>
              <RotateCcw className="w-5 h-5 text-emerald-500/40" />
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-400 uppercase font-mono">Full Completions</div>
                <div className="text-xl font-bold text-cyan-400">{userStats.totalCompletions}</div>
              </div>
              <CheckCircle className="w-5 h-5 text-cyan-500/40" />
            </div>
          </div>

          {/* Seed Track & Top Recommendation Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Seed Track Feature Profile */}
            <div className="p-4 rounded-xl bg-zinc-900/70 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">Current Seed Track</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">5D Waveform Vector</span>
              </div>

              <div className="flex items-center gap-3">
                {seed?.artist_thumbnail ? (
                  <img
                    src={seed.artist_thumbnail}
                    alt={seed.artist || 'Artist'}
                    className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40 shadow-lg shadow-emerald-500/10 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                    {seed?.artist?.charAt(0) || 'A'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white truncate text-base">{seed?.title || 'Unknown Track'}</h3>
                  <p className="text-xs text-emerald-400/90 truncate font-medium">{seed?.artist || 'Unknown Artist'}</p>
                </div>
              </div>

              {seed?.features && (
                <div className="space-y-2 pt-1 font-mono text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-zinc-400">Energy</span>
                      <span className="text-emerald-400">{(seed.features.energy * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${seed.features.energy * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-zinc-400">Valence (Mood)</span>
                      <span className="text-amber-400">{(seed.features.valence * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${seed.features.valence * 100}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-zinc-400">Danceability</span>
                      <span className="text-cyan-400">{(seed.features.danceability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${seed.features.danceability * 100}%` }} />
                    </div>
                  </div>

                  <div className="flex justify-between text-[11px] pt-1 text-zinc-400">
                    <span>Acousticness: <strong className="text-zinc-200">{(seed.features.acousticness * 100).toFixed(0)}%</strong></span>
                    <span>Tempo: <strong className="text-zinc-200">{seed.features.bpm} BPM</strong></span>
                  </div>
                </div>
              )}
            </div>

            {/* Next Recommended Track Decision Engine */}
            <div className="p-4 rounded-xl bg-zinc-900/70 border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Top Recommendation Decision
                </span>
                {topRec && (
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {(topRec.finalScore * 100).toFixed(0)}% Match
                  </span>
                )}
              </div>

              {topRec ? (
                <>
                  <div className="flex items-center gap-3">
                    {topRec.artist_thumbnail ? (
                      <img
                        src={topRec.artist_thumbnail}
                        alt={topRec.artist}
                        className="w-12 h-12 rounded-full object-cover border-2 border-cyan-500/40 shadow-lg shadow-cyan-500/10 shrink-0"
                      />
                    ) : topRec.thumbnail ? (
                      <img
                        src={topRec.thumbnail}
                        alt={topRec.title}
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                        {topRec.artist?.charAt(0) || 'R'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-white truncate text-base">{topRec.title}</h3>
                      <p className="text-xs text-cyan-400/90 truncate font-medium">{topRec.artist}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-white/5 text-xs text-zinc-300 font-mono leading-relaxed">
                    <span className="text-emerald-400 font-semibold">Decision Rationale: </span>
                    {topRec.rationale}
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs pt-1">
                    <div className="p-2 rounded bg-zinc-950/40 border border-white/5">
                      <div className="text-[10px] text-zinc-500">Vector Similarity</div>
                      <div className="font-bold text-emerald-400">{(topRec.audioSimilarity * 100).toFixed(0)}%</div>
                    </div>
                    <div className="p-2 rounded bg-zinc-950/40 border border-white/5">
                      <div className="text-[10px] text-zinc-500">Mix Position</div>
                      <div className="font-bold text-cyan-400">{(topRec.cfScore * 100).toFixed(0)}%</div>
                    </div>
                    <div className="p-2 rounded bg-zinc-950/40 border border-white/5">
                      <div className="text-[10px] text-zinc-500">History Modifier</div>
                      <div className={`font-bold ${topRec.historyModifier >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {topRec.historyModifier >= 0 ? `+${topRec.historyModifier.toFixed(2)}` : topRec.historyModifier.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-zinc-500 font-mono text-xs">
                  {loading ? 'Fetching YouTube Mix (RD)...' : 'No recommendation generated yet. Ensure Smart Radio is toggled ON.'}
                </div>
              )}
            </div>
          </div>

          {/* Candidate Pool Inspector (YouTube Mix + Active Filter Tab) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-300 font-mono flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-emerald-400" />
                Ranked Candidates Pool ({selectedMode.toUpperCase()} Mode)
              </h3>
              <span className="text-xs text-zinc-500 font-mono">
                {diagnosticData?.recommendations?.length || 0} candidates scored
              </span>
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 bg-zinc-900/40">
              {diagnosticData?.recommendations?.length ? (
                diagnosticData.recommendations.slice(0, 8).map((rec, idx) => (
                  <div key={rec.candidateId} className="p-3 flex items-center justify-between gap-4 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-5 text-center text-xs font-mono font-bold shrink-0 ${idx === 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        #{idx + 1}
                      </span>
                      {rec.artist_thumbnail || rec.thumbnail ? (
                        <img
                          src={rec.artist_thumbnail || rec.thumbnail}
                          alt={rec.title}
                          className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 font-bold text-xs shrink-0">
                          {rec.artist?.charAt(0) || '•'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate">{rec.title}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{rec.artist}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate">{rec.rationale}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 font-mono text-right">
                      <div className="hidden sm:block text-[11px]">
                        <span className="text-zinc-500">Dist: </span>
                        <span className="text-zinc-300 font-semibold">{rec.audioDistance.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          idx === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-zinc-300'
                        }`}>
                          {(rec.finalScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-zinc-500 text-xs font-mono">
                  {loading ? 'Extracting YouTube Mix candidates...' : 'No candidate logs available. Updates automatically while songs play.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-zinc-950 text-xs text-zinc-400 font-mono">
          <div>YouTube Mix (RD) + Vector Proximity: Active</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
