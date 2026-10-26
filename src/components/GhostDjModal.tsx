// src/components/GhostDjModal.tsx
import React, { useState } from 'react';
import { X, Disc3, Headphones, Play, Plus, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { Track, ListeningHistoryRecord } from '../types';
import {
  generateGhostDjSession,
  EnergyCurveType,
  DiscoveryLevelType,
  GhostDjSessionResult
} from '../services/ghostDjEngine';

interface GhostDjModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateTracks: Track[];
  currentTrack?: Track | null;
  listeningHistory?: ListeningHistoryRecord[];
  onPlaySession: (tracks: Track[], sessionTitle: string) => void;
  onSaveAsPlaylist: (name: string, tracks: Track[]) => void;
}

const QUICK_PROMPTS = [
  { label: 'Late-Night Drive', prompt: 'Late-night atmospheric drive, smooth tempo and cinematic vibes', curve: 'late_night' as EnergyCurveType },
  { label: 'Progressive Ramp', prompt: 'Start mellow and gradually build high energy with rhythmic momentum', curve: 'ramp_up' as EnergyCurveType },
  { label: 'Deep Focus', prompt: 'Mellow ambient study flow without sudden jarring spikes in intensity', curve: 'chill_plateau' as EnergyCurveType },
  { label: 'Peak Workout', prompt: 'High-octane energetic workout with driving cadence and tempo', curve: 'peak_workout' as EnergyCurveType },
  { label: 'Harmonic Waves', prompt: 'Dynamic waves of peaks and atmospheric valleys for an eclectic session', curve: 'rollercoaster' as EnergyCurveType },
];

export const GhostDjModal: React.FC<GhostDjModalProps> = ({
  isOpen,
  onClose,
  candidateTracks,
  currentTrack,
  listeningHistory = [],
  onPlaySession,
  onSaveAsPlaylist
}) => {
  const [prompt, setPrompt] = useState<string>('Late-night atmospheric drive, smooth tempo');
  const [energyCurve, setEnergyCurve] = useState<EnergyCurveType>('late_night');
  const [durationMinutes, setDurationMinutes] = useState<number>(45);
  const [discoveryLevel, setDiscoveryLevel] = useState<DiscoveryLevelType>('balanced');
  const [loading, setLoading] = useState<boolean>(false);
  const [sessionResult, setSessionResult] = useState<GhostDjSessionResult | null>(null);
  const [playlistSaved, setPlaylistSaved] = useState<boolean>(false);

  const handleGenerate = async (curveOverride?: EnergyCurveType) => {
    setLoading(true);
    setPlaylistSaved(false);
    try {
      const res = await generateGhostDjSession({
        prompt,
        seedTrack: currentTrack,
        energyCurve: curveOverride || energyCurve,
        targetDurationMinutes: durationMinutes,
        discoveryLevel,
        candidatePool: candidateTracks,
        listeningHistory
      });
      setSessionResult(res);
    } catch (e) {
      console.error('[GhostDJ] Generation error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTrack = (trackId: string) => {
    if (!sessionResult) return;
    const nextTracks = sessionResult.tracks.filter(t => t.id !== trackId);
    setSessionResult({
      ...sessionResult,
      tracks: nextTracks,
      estimatedDurationMinutes: Math.max(1, Math.round(sessionResult.estimatedDurationMinutes * (nextTracks.length / Math.max(1, sessionResult.tracks.length))))
    });
  };

  const handlePlay = () => {
    if (!sessionResult || sessionResult.tracks.length === 0) return;
    onPlaySession(sessionResult.tracks, sessionResult.sessionTitle);
    onClose();
  };

  const handleSavePlaylist = () => {
    if (!sessionResult || sessionResult.tracks.length === 0) return;
    onSaveAsPlaylist(sessionResult.sessionTitle, sessionResult.tracks);
    setPlaylistSaved(true);
    setTimeout(() => setPlaylistSaved(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-2xl bg-[#0e0e12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Editorial Header */}
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between bg-[#121216]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-sm">
              <Disc3 className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-serif text-white font-semibold tracking-tight">Ghost DJ</h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  Curator Deck
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">Narrative listening sessions curated with harmonic intelligence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unified Curator Panel */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Natural Language Prompt Area */}
          <div className="space-y-2.5">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                placeholder="Describe your session mood (e.g. Late-night drive, atmospheric and smooth...)"
                className="w-full bg-[#15151a] border border-white/10 hover:border-white/20 focus:border-amber-500/70 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all shadow-inner"
              />
            </div>

            {/* Subtle Mood Suggestions */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-zinc-500 font-mono mr-1">Inspirations:</span>
              {QUICK_PROMPTS.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setPrompt(qp.prompt);
                    setEnergyCurve(qp.curve);
                    handleGenerate(qp.curve);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/20 text-zinc-300 hover:text-white transition-colors"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unified Refinements Toolbar */}
          <div className="p-3.5 rounded-xl bg-[#131317] border border-white/[0.06] flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {/* Energy Curve */}
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-[11px]">Energy:</span>
                <select
                  value={energyCurve}
                  onChange={(e) => setEnergyCurve(e.target.value as EnergyCurveType)}
                  className="bg-[#1a1a20] text-xs text-zinc-200 border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500/50 cursor-pointer"
                >
                  <option value="late_night">Late Night (Smooth)</option>
                  <option value="ramp_up">Progressive Build</option>
                  <option value="chill_plateau">Steady Chill</option>
                  <option value="peak_workout">High Cadence</option>
                  <option value="rollercoaster">Harmonic Waves</option>
                </select>
              </div>

              {/* Duration Buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px]">Duration:</span>
                <div className="flex bg-[#1a1a20] p-0.5 rounded-lg border border-white/10">
                  {[30, 45, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setDurationMinutes(mins)}
                      className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                        durationMinutes === mins
                          ? 'bg-amber-500 text-black font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Discovery Bias */}
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px]">Discovery:</span>
                <div className="flex bg-[#1a1a20] p-0.5 rounded-lg border border-white/10">
                  {(['familiar', 'balanced', 'adventurous'] as DiscoveryLevelType[]).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setDiscoveryLevel(lvl)}
                      className={`px-2 py-1 rounded text-[11px] capitalize transition-colors ${
                        discoveryLevel === lvl
                          ? 'bg-amber-500 text-black font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Generate Action */}
            <button
              onClick={() => handleGenerate()}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Disc3 className="w-3.5 h-3.5 animate-spin-slow" />
              )}
              <span>{sessionResult ? 'Curate Again' : 'Curate Session'}</span>
            </button>
          </div>

          {/* Generated Listening Session Display */}
          {sessionResult && (
            <div className="space-y-3 pt-2">
              <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-2">
                <div>
                  <h3 className="text-base font-serif text-white font-medium">{sessionResult.sessionTitle}</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{sessionResult.sessionDescription}</p>
                </div>
                <div className="text-[11px] font-mono text-zinc-400 text-right">
                  <span>{sessionResult.tracks.length} tracks</span>
                  <span className="mx-1.5 text-zinc-600">&bull;</span>
                  <span>~{sessionResult.estimatedDurationMinutes} mins</span>
                </div>
              </div>

              {/* Real Artwork Track Queue */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {sessionResult.tracks.map((t, index) => (
                  <div
                    key={t.id + index}
                    className="flex items-center justify-between p-2 rounded-xl bg-[#131317]/60 hover:bg-[#18181e] border border-white/[0.04] hover:border-white/10 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-zinc-500 w-4 text-center">{index + 1}</span>
                      <img
                        src={t.thumbnail || t.local_artwork_url || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80'}
                        alt={t.title}
                        className="w-9 h-9 rounded-md object-cover border border-white/10"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-white truncate font-serif">{t.title}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{t.artist}</div>
                        {sessionResult.reasons[t.id] && (
                          <div className="text-[10px] text-amber-400/80 font-mono truncate max-w-sm">
                            {sessionResult.reasons[t.id]}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-zinc-500">{t.duration || '3:30'}</span>
                      <button
                        onClick={() => handleRemoveTrack(t.id)}
                        className="p-1 rounded text-zinc-600 hover:text-rose-400 opacity-60 group-hover:opacity-100 transition-opacity"
                        title="Remove track"
                        aria-label="Remove track"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-white/[0.07] bg-[#121216]/60 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 font-mono">
            {candidateTracks.length} tracks in candidate pool
          </div>
          <div className="flex items-center gap-2">
            {sessionResult && sessionResult.tracks.length > 0 && (
              <>
                <button
                  onClick={handleSavePlaylist}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a20] hover:bg-[#22222a] border border-white/10 text-zinc-200 transition-colors"
                >
                  {playlistSaved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{playlistSaved ? 'Saved to Playlists' : 'Save as Playlist'}</span>
                </button>
                <button
                  onClick={handlePlay}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-all active:scale-95 shadow-md shadow-amber-500/10 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-black" />
                  <span>Play Session</span>
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a20] hover:bg-[#22222a] border border-white/10 text-zinc-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
