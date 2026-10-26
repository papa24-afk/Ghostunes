// src/components/PlaylistRescueModal.tsx
import React, { useState, useEffect } from 'react';
import {
  X, Check, AlertTriangle, RefreshCw, Sparkles, Search,
  CheckCircle2, ArrowRight, ShieldCheck, Play
} from 'lucide-react';
import { Track, Playlist, PlaylistRescueMatch } from '../types';
import { auditAndRescuePlaylist, searchTrackCandidates } from '../services/playlistRescueEngine';

interface PlaylistRescueModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlist: Playlist | null;
  onSaveRescuedPlaylist: (updatedPlaylist: Playlist) => void;
  onPreviewTrack?: (track: Track) => void;
}

export const PlaylistRescueModal: React.FC<PlaylistRescueModalProps> = ({
  isOpen,
  onClose,
  playlist,
  onSaveRescuedPlaylist,
  onPreviewTrack
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [matches, setMatches] = useState<PlaylistRescueMatch[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !playlist) {
      setMatches([]);
      setEditingItemIndex(null);
      setSavedSuccess(false);
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: playlist.tracks?.length || 0 });

    auditAndRescuePlaylist(playlist, (current, total) => {
      setProgress({ current, total });
    })
      .then(res => {
        setMatches(res);
        setLoading(false);
      })
      .catch(err => {
        console.error('[PlaylistRescue] Scan error:', err);
        setLoading(false);
      });
  }, [isOpen, playlist]);

  const handleSelectCandidate = (index: number, newTrack: Track) => {
    setMatches(prev => {
      const next = [...prev];
      const target = next[index];
      if (target) {
        next[index] = {
          ...target,
          matchedTrack: newTrack,
          confidence: 95,
          matchReason: 'Manually verified and approved by user',
          status: 'matched'
        };
      }
      return next;
    });
    setEditingItemIndex(null);
  };

  const handleSearchManual = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchTrackCandidates(searchQuery, '');
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleApplyAndSave = () => {
    if (!playlist) return;
    const rescuedTracks: Track[] = matches.map(m => m.matchedTrack || {
      id: `rescued_${Math.random().toString(36).substr(2, 7)}`,
      title: m.originalTrack.title,
      artist: m.originalTrack.artist,
      duration: m.originalTrack.duration || '3:30',
      thumbnail: ''
    });

    const updatedPlaylist: Playlist = {
      ...playlist,
      tracks: rescuedTracks,
      createdAt: playlist.createdAt || Date.now()
    };

    onSaveRescuedPlaylist(updatedPlaylist);
    setSavedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  if (!isOpen || !playlist) return null;

  const healthyCount = matches.filter(m => m.status === 'matched').length;
  const warningCount = matches.filter(m => m.status === 'low_confidence').length;
  const missingCount = matches.filter(m => m.status === 'unmatched').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-4xl bg-zinc-950/95 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif text-white tracking-wide">Playlist Rescue & Repair</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Weighted Matching Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Diagnose broken links, verify catalogue alignment, and replace missing audio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-4 text-zinc-400">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-200">
                  Scanning catalogue for {playlist.name}...
                </p>
                <p className="text-xs font-mono text-zinc-500">
                  Auditing track {progress.current} of {progress.total}
                </p>
              </div>
              <div className="w-64 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Diagnostic Metric Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-emerald-400">High Confidence</div>
                    <div className="text-2xl font-bold font-mono text-emerald-300">{healthyCount}</div>
                  </div>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400/80" />
                </div>

                <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-amber-400">Needs Review</div>
                    <div className="text-2xl font-bold font-mono text-amber-300">{warningCount}</div>
                  </div>
                  <AlertTriangle className="w-6 h-6 text-amber-400/80" />
                </div>

                <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-rose-400">Unmatched</div>
                    <div className="text-2xl font-bold font-mono text-rose-300">{missingCount}</div>
                  </div>
                  <X className="w-6 h-6 text-rose-400/80" />
                </div>
              </div>

              {/* Review Table */}
              <div className="space-y-2">
                <div className="text-xs font-mono uppercase text-zinc-400 flex items-center justify-between">
                  <span>Track Matching Verification</span>
                  <span className="text-[10px] text-zinc-500">{matches.length} tracks total</span>
                </div>

                <div className="divide-y divide-zinc-800/60 rounded-xl bg-zinc-900/40 border border-zinc-800/80 overflow-hidden">
                  {matches.map((item, idx) => {
                    const isHealthy = item.status === 'matched';
                    const isWarning = item.status === 'low_confidence';

                    return (
                      <div
                        key={idx}
                        className="p-3 hover:bg-zinc-900/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono text-zinc-500 w-5 text-center">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white truncate font-serif">{item.originalTrack.title}</span>
                              <span className="text-zinc-500">&bull;</span>
                              <span className="text-zinc-400 truncate">{item.originalTrack.artist}</span>
                            </div>

                            {/* Matched target info */}
                            {item.matchedTrack && (
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1">
                                <ArrowRight className="w-3 h-3 text-amber-400 shrink-0" />
                                <span className="text-zinc-300 truncate">
                                  {item.matchedTrack.title} — {item.matchedTrack.artist}
                                </span>
                              </div>
                            )}

                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                              {item.matchReason}
                            </div>
                          </div>
                        </div>

                        {/* Status badge & candidate button */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                          <span className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] ${
                            isHealthy
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                              : isWarning
                              ? 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                          }`}>
                            {item.confidence}% match
                          </span>

                          {onPreviewTrack && item.matchedTrack && (
                            <button
                              onClick={() => onPreviewTrack(item.matchedTrack!)}
                              className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 transition-colors"
                              title="Preview Audio"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingItemIndex(idx);
                              setSearchQuery(`${item.originalTrack.title} ${item.originalTrack.artist}`);
                              setSearchResults(item.candidates || []);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium transition-colors"
                          >
                            Replace
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Alternative Track Selection Modal */}
              {editingItemIndex !== null && (
                <div className="p-4 rounded-xl bg-zinc-900 border border-amber-500/40 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-white">
                      Search Alternative Candidate for Track #{editingItemIndex + 1}
                    </div>
                    <button
                      onClick={() => setEditingItemIndex(null)}
                      className="text-zinc-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchManual()}
                      placeholder="Search title, artist or version..."
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleSearchManual}
                      disabled={searching}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold flex items-center gap-1.5"
                    >
                      {searching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Search</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {searchResults.map((cand) => (
                      <div
                        key={cand.id}
                        onClick={() => handleSelectCandidate(editingItemIndex, cand)}
                        className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/60 hover:bg-amber-500/10 border border-zinc-800/80 hover:border-amber-500/40 cursor-pointer transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate">{cand.title}</div>
                          <div className="text-[11px] text-zinc-400 truncate">{cand.artist} &bull; {cand.duration}</div>
                        </div>
                        <span className="text-amber-400 text-[11px] font-medium shrink-0">Select</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
          <div className="text-[11px] text-zinc-500 font-mono">
            {savedSuccess ? 'Changes successfully saved to library!' : 'Ghosttunes Intelligent Catalogue Matcher'}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleApplyAndSave}
              disabled={loading || matches.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black transition-colors shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {savedSuccess ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
              <span>{savedSuccess ? 'Saved' : 'Approve & Save Rescued Playlist'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
