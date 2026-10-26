// src/components/ImportPlaylistModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  ArrowRight, 
  Check, 
  AlertCircle, 
  Loader2, 
  Music, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  Lock,
  Layers
} from 'lucide-react';
import { Track, Playlist } from '../types';
import { getApiUrl } from '../utils/api';

interface MatchedItem {
  order: number;
  sourceTrack: {
    sourceId: string;
    sourcePlatform: 'spotify' | 'youtube' | 'apple' | 'deezer';
    sourceUri?: string;
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    durationSeconds?: number;
    thumbnail?: string;
  };
  status: 'matched' | 'ambiguous' | 'unmatched';
  confidence: number;
  candidate: Track | null;
  alternatives: Track[];
  isLocked?: boolean;
}

interface ResolvedPlaylist {
  platform: 'spotify' | 'youtube' | 'apple' | 'deezer';
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  author?: string;
  totalTracks: number;
  tracks: any[];
  sourceUrl?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  existingPlaylists: Playlist[];
  onSavePlaylist: (playlist: Playlist, duplicateMode?: 'create' | 'update' | 'copy') => void;
  onOpenPlaylist?: (playlist: Playlist) => void;
}

const PRESET_PLAYLISTS = [
  {
    name: "Today's Hits 2026 (YouTube Music)",
    platform: 'youtube' as const,
    url: 'https://music.youtube.com/playlist?list=PLOHoVaTp8R7dWeCQrKfh7a1a_Gu6KvfWP'
  },
  {
    name: "Today's Top Hits (Spotify)",
    platform: 'spotify' as const,
    url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'
  },
  {
    name: "Today's Hits (Apple Music)",
    platform: 'apple' as const,
    url: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
  },
  {
    name: "En mode 60 (Deezer)",
    platform: 'deezer' as const,
    url: 'https://www.deezer.com/playlist/908622995'
  }
];

export const ImportPlaylistModal: React.FC<Props> = ({
  isOpen,
  onClose,
  existingPlaylists,
  onSavePlaylist,
  onOpenPlaylist
}) => {
  const [platform, setPlatform] = useState<'auto' | 'spotify' | 'youtube' | 'apple' | 'deezer'>('auto');
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'input' | 'resolving' | 'matching' | 'review' | 'success'>('input');
  const [statusMessage, setStatusMessage] = useState('');
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const [resolvedPlaylist, setResolvedPlaylist] = useState<ResolvedPlaylist | null>(null);
  const [matchedItems, setMatchedItems] = useState<MatchedItem[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'matched' | 'ambiguous' | 'unmatched'>('all');
  const [duplicatePlaylist, setDuplicatePlaylist] = useState<Playlist | null>(null);
  const [duplicateChoice, setDuplicateChoice] = useState<'update' | 'copy'>('copy');

  // Bulk Candidate Swapping State
  const [showSwapConfirm, setShowSwapConfirm] = useState(false);
  const [swapToast, setSwapToast] = useState<{ message: string; timestamp: number } | null>(null);
  const [previousMatchedItems, setPreviousMatchedItems] = useState<MatchedItem[] | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep('input');
        setUrl('');
        setError(null);
        setResolvedPlaylist(null);
        setMatchedItems([]);
        setDuplicatePlaylist(null);
        setShowSwapConfirm(false);
        setSwapToast(null);
      }, 200);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Handle URL Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch {
      // Ignore clipboard read permission failures
    }
  };

  // Helper to detect platform from input URL
  const detectPlatformFromUrl = (inputUrl: string): 'spotify' | 'apple' | 'youtube' | 'deezer' | undefined => {
    const u = inputUrl.toLowerCase().trim();
    if (u.includes('spotify.com') || u.includes('spotify.link') || u.startsWith('spotify:')) return 'spotify';
    if (u.includes('deezer.com') || u.includes('deezer.page.link') || u.startsWith('deezer:')) return 'deezer';
    if (u.includes('music.apple.com') || u.includes('apple.co') || u.startsWith('pl.')) return 'apple';
    if (u.includes('youtube.com') || u.includes('youtu.be') || u.startsWith('pl') || u.startsWith('vl')) return 'youtube';
    return undefined;
  };

  // Step 1: Resolve Playlist from Spotify, YouTube Music, Apple Music, or Deezer
  const handleStartImport = async (targetUrl = url, targetPlatform?: 'spotify' | 'apple' | 'youtube' | 'deezer') => {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      setError('Please select or paste a playlist link from Spotify, Apple Music, YouTube Music, or Deezer.');
      return;
    }

    setError(null);
    setStep('resolving');
    setStatusMessage('Connecting to playlist service and retrieving track list...');

    const resolvedPlatform = targetPlatform || (platform !== 'auto' ? platform : detectPlatformFromUrl(cleanUrl));

    try {
      const resolveRes = await fetch(getApiUrl('/api/playlist/import/resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          platform: resolvedPlatform
        })
      });

      if (!resolveRes.ok) {
        const errData = await resolveRes.json().catch(() => ({}));
        let errMsg = errData.error || `Failed to retrieve playlist (${resolveRes.status})`;
        if (errMsg === 'no data' || errMsg === '[object Object]') {
          errMsg = 'This playlist is private, deleted, or unavailable.';
        }
        throw new Error(errMsg);
      }

      const playlistData: ResolvedPlaylist = await resolveRes.json();
      setResolvedPlaylist(playlistData);

      // Check for duplicate existing playlist
      const existingMatch = existingPlaylists.find(p => 
        (p.sourceId && p.sourceId === playlistData.id) ||
        (p.sourceUrl && p.sourceUrl === playlistData.sourceUrl) ||
        p.name.toLowerCase().trim() === playlistData.title.toLowerCase().trim()
      );
      if (existingMatch) {
        setDuplicatePlaylist(existingMatch);
      } else {
        setDuplicatePlaylist(null);
      }

      // Step 2: Match tracks against Ghosttunes catalogue
      setStep('matching');
      setStatusMessage(`Matching ${playlistData.tracks.length} tracks to Ghosttunes catalogue...`);
      setMatchProgress({ current: 0, total: playlistData.tracks.length });

      // Match in batches of 15 to provide visible progress and avoid network saturation
      const tracks = playlistData.tracks;
      const batchSize = 15;
      let allMatches: MatchedItem[] = [];

      for (let i = 0; i < tracks.length; i += batchSize) {
        const batch = tracks.slice(i, i + batchSize);
        setMatchProgress({ current: Math.min(i + batchSize, tracks.length), total: tracks.length });
        setStatusMessage(`Matching tracks ${Math.min(i + 1, tracks.length)} to ${Math.min(i + batchSize, tracks.length)} of ${tracks.length}...`);

        const matchRes = await fetch(getApiUrl('/api/playlist/import/match'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: batch })
        });

        if (!matchRes.ok) {
          const errData = await matchRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed matching tracks');
        }

        const matchData = await matchRes.json();
        allMatches = allMatches.concat(matchData.results || []);
      }

      setMatchedItems(allMatches);
      setStep('review');
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'An error occurred while importing the playlist.');
      setStep('input');
    }
  };

  // Swap matched candidate for an alternative choice (marks track as locked/confirmed)
  const handleSelectAlternative = (order: number, newCandidate: Track) => {
    setMatchedItems(prev => prev.map(item => {
      if (item.order === order) {
        const oldCandidate = item.candidate;
        const newAlternatives = item.alternatives
          .filter(a => a.id !== newCandidate.id)
          .concat(oldCandidate ? [oldCandidate] : []);
        return {
          ...item,
          candidate: newCandidate,
          status: 'matched',
          confidence: 0.95,
          alternatives: newAlternatives,
          isLocked: true
        };
      }
      return item;
    }));
  };

  // Toggle candidate lock manually
  const handleToggleLock = (order: number) => {
    setMatchedItems(prev => prev.map(item => {
      if (item.order === order) {
        return { ...item, isLocked: !item.isLocked };
      }
      return item;
    }));
  };

  // Bulk Candidate Swapping
  const eligibleTracks = matchedItems.filter(item => item.alternatives.length > 0 && !item.isLocked);
  const eligibleCount = eligibleTracks.length;
  const unalterableCount = matchedItems.length - eligibleCount;

  const handleConfirmSwapAll = () => {
    setShowSwapConfirm(false);
    setPreviousMatchedItems([...matchedItems]);
    let swappedCount = 0;
    let skippedCount = 0;

    setMatchedItems(prev => prev.map(item => {
      if (item.alternatives.length > 0 && !item.isLocked) {
        swappedCount++;
        const nextCandidate = item.alternatives[0];
        const newAlternatives = item.alternatives.slice(1).concat(item.candidate ? [item.candidate] : []);
        return {
          ...item,
          candidate: nextCandidate,
          status: 'matched',
          confidence: 0.90,
          alternatives: newAlternatives
        };
      } else {
        skippedCount++;
        return item;
      }
    }));

    setSwapToast({
      message: `Swapped ${swappedCount} track candidates. ${skippedCount} tracks were kept without change.`,
      timestamp: Date.now()
    });
  };

  const handleUndoSwap = () => {
    if (previousMatchedItems) {
      setMatchedItems(previousMatchedItems);
      setPreviousMatchedItems(null);
      setSwapToast({
        message: 'Reverted candidate swap to previous matches.',
        timestamp: Date.now()
      });
    }
  };

  // Toggle skip/include track
  const handleToggleSkipTrack = (order: number) => {
    setMatchedItems(prev => prev.map(item => {
      if (item.order === order) {
        if (item.status === 'unmatched') {
          return {
            ...item,
            status: item.alternatives.length > 0 ? 'ambiguous' : 'unmatched',
            candidate: item.alternatives[0] || null
          };
        } else {
          return {
            ...item,
            status: 'unmatched',
            candidate: null
          };
        }
      }
      return item;
    }));
  };

  // Step 3: Save to Ghosttunes Library
  const handleSaveToLibrary = () => {
    if (!resolvedPlaylist) return;

    // Filter matched playable tracks in original order
    const validTracks: Track[] = [];
    const unmatchedList: {
      title: string;
      artist: string;
      album?: string;
      duration?: string;
      sourcePlatform?: 'spotify' | 'youtube' | 'apple' | 'deezer';
      sourceId?: string;
    }[] = [];

    matchedItems.forEach(item => {
      if (item.candidate && (item.status === 'matched' || item.status === 'ambiguous')) {
        validTracks.push(item.candidate);
      } else {
        unmatchedList.push({
          title: item.sourceTrack.title,
          artist: item.sourceTrack.artist,
          album: item.sourceTrack.album,
          duration: item.sourceTrack.duration,
          sourcePlatform: item.sourceTrack.sourcePlatform,
          sourceId: item.sourceTrack.sourceId
        });
      }
    });

    const playlistName = duplicatePlaylist && duplicateChoice === 'copy'
      ? `${resolvedPlaylist.title} (Imported Copy)`
      : resolvedPlaylist.title;

    const platformLabels: Record<string, string> = {
      spotify: 'Spotify',
      youtube: 'YouTube Music',
      apple: 'Apple Music',
      deezer: 'Deezer'
    };

    const newPlaylist: Playlist = {
      id: duplicatePlaylist && duplicateChoice === 'update' 
        ? duplicatePlaylist.id 
        : `pl_imported_${Date.now()}`,
      name: playlistName,
      description: resolvedPlaylist.description || `Imported from ${platformLabels[resolvedPlaylist.platform] || 'Streaming Service'}`,
      tracks: validTracks,
      createdAt: duplicatePlaylist && duplicateChoice === 'update' ? duplicatePlaylist.createdAt : Date.now(),
      source: resolvedPlaylist.platform,
      sourceUrl: resolvedPlaylist.sourceUrl,
      sourceId: resolvedPlaylist.id,
      sourceAuthor: resolvedPlaylist.author,
      thumbnail: resolvedPlaylist.thumbnail || validTracks[0]?.thumbnail,
      unmatchedTracks: unmatchedList
    };

    onSavePlaylist(newPlaylist, duplicatePlaylist ? duplicateChoice : 'create');
    setStep('success');

    setTimeout(() => {
      onClose();
      onOpenPlaylist?.(newPlaylist);
    }, 1200);
  };

  // Stats calculation
  const totalCount = matchedItems.length;
  const matchedCount = matchedItems.filter(i => i.status === 'matched').length;
  const ambiguousCount = matchedItems.filter(i => i.status === 'ambiguous').length;
  const unmatchedCount = matchedItems.filter(i => i.status === 'unmatched').length;

  const filteredItems = matchedItems.filter(i => {
    if (filterTab === 'matched') return i.status === 'matched';
    if (filterTab === 'ambiguous') return i.status === 'ambiguous';
    if (filterTab === 'unmatched') return i.status === 'unmatched';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-[#0f0f13] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-white select-none"
        onClick={e => e.stopPropagation()}
      >
        {/* =====================================================================
            MODAL HEADER: Brand Wordmark, Info, Close Button
           ===================================================================== */}
        <header className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#6b1828]/25 border border-[#852033]/40 flex items-center justify-center text-[#ff8099] shadow-inner">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Import Playlist</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 font-mono font-normal">
                  v2.0
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Paste a link from Spotify, Apple Music, YouTube Music, or Deezer
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/30"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* =====================================================================
            MODAL BODY: Multi-Stage Workflow (Input, Resolving, Review, Success)
           ===================================================================== */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          
          {/* STEP 1: Playlist URL & Platform Input */}
          {step === 'input' && (
            <div className="space-y-6">
              
              {/* Platform Selector Pills */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Select Source Platform
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    onClick={() => setPlatform('auto')}
                    className={`py-2 px-2.5 rounded-2xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      platform === 'auto'
                        ? 'bg-white/15 border-white/30 text-white shadow-md'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                    <span>Auto-Detect</span>
                  </button>

                  <button
                    onClick={() => setPlatform('spotify')}
                    className={`py-2 px-2.5 rounded-2xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      platform === 'spotify'
                        ? 'bg-[#1ed760]/20 border-[#1ed760]/40 text-[#1ed760] shadow-md'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#1ed760]" />
                    <span>Spotify</span>
                  </button>

                  <button
                    onClick={() => setPlatform('apple')}
                    className={`py-2 px-2.5 rounded-2xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      platform === 'apple'
                        ? 'bg-[#fc3c44]/20 border-[#fc3c44]/40 text-[#ff6870] shadow-md'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#fc3c44]" />
                    <span>Apple Music</span>
                  </button>

                  <button
                    onClick={() => setPlatform('youtube')}
                    className={`py-2 px-2.5 rounded-2xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      platform === 'youtube'
                        ? 'bg-[#ff0000]/20 border-[#ff0000]/40 text-[#ff4e4e] shadow-md'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#ff0000]" />
                    <span>YouTube</span>
                  </button>

                  <button
                    onClick={() => setPlatform('deezer')}
                    className={`py-2 px-2.5 rounded-2xl text-xs font-semibold transition-all border flex items-center justify-center gap-1.5 cursor-pointer ${
                      platform === 'deezer'
                        ? 'bg-[#a238ff]/20 border-[#a238ff]/40 text-[#bf75ff] shadow-md'
                        : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#a238ff]" />
                    <span>Deezer</span>
                  </button>
                </div>
              </div>

              {/* URL Input Box */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
                  Playlist Link or URL
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="Paste link from Spotify, Apple Music, YouTube Music, or Deezer..."
                    className="w-full bg-[#15151a] border border-white/10 focus:border-white/25 rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all pr-24 font-mono text-xs"
                    autoFocus
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    {url && (
                      <button
                        onClick={() => setUrl('')}
                        className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                        title="Clear"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={handlePaste}
                      className="px-2.5 py-1 text-[11px] font-semibold text-zinc-300 hover:text-white bg-white/10 hover:bg-white/15 rounded-lg transition-colors cursor-pointer"
                      title="Paste from clipboard"
                    >
                      Paste
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
                  <div className="flex-1">
                    <p className="font-semibold text-white">Import Notice</p>
                    <p className="text-rose-200/90 mt-0.5 leading-relaxed">{error}</p>
                  </div>
                </div>
              )}

              {/* Quick Sample Presets */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2">Try a sample playlist:</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_PLAYLISTS.map(preset => (
                    <button
                      key={preset.name}
                      onClick={() => {
                        setUrl(preset.url);
                        setPlatform(preset.platform);
                        handleStartImport(preset.url, preset.platform);
                      }}
                      className="text-xs px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        preset.platform === 'spotify' 
                          ? 'bg-[#1ed760]' 
                          : preset.platform === 'apple'
                          ? 'bg-[#fc3c44]'
                          : preset.platform === 'deezer'
                          ? 'bg-[#a238ff]'
                          : 'bg-[#ff0000]'
                      }`} />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-white/[0.06]">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Public and unlisted playlists from Spotify, Apple Music, YouTube Music, and Deezer can be imported directly without needing to sign into an account.
                </p>
              </div>

            </div>
          )}

          {/* STEP 2: Resolving & Matching Progress */}
          {(step === 'resolving' || step === 'matching') && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-5">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-[#6b1828]/20 border border-[#852033]/40 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-[#ff8099] animate-spin" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-sm">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {step === 'resolving' ? 'Retrieving Playlist...' : 'Matching Songs to Catalogue'}
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {statusMessage}
                </p>
              </div>

              {step === 'matching' && matchProgress.total > 0 && (
                <div className="w-full max-w-xs space-y-1.5">
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#6b1828] to-[#ff8099] rounded-full transition-all duration-200"
                      style={{ width: `${(matchProgress.current / matchProgress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>{matchProgress.current} processed</span>
                    <span>{matchProgress.total} total</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Match Review & Confirmation */}
          {step === 'review' && resolvedPlaylist && (
            <div className="space-y-5">
              
              {/* Playlist Summary Card */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
                {resolvedPlaylist.thumbnail ? (
                  <img
                    src={resolvedPlaylist.thumbnail}
                    alt={resolvedPlaylist.title}
                    className="w-16 h-16 rounded-xl object-cover bg-zinc-900 border border-white/10 shadow flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0">
                    <Music className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      resolvedPlaylist.platform === 'spotify' 
                        ? 'bg-[#1ed760]/20 text-[#1ed760]' 
                        : resolvedPlaylist.platform === 'apple'
                        ? 'bg-[#fc3c44]/20 text-[#ff6870]'
                        : resolvedPlaylist.platform === 'deezer'
                        ? 'bg-[#a238ff]/20 text-[#bf75ff]'
                        : 'bg-[#ff0000]/20 text-[#ff6060]'
                    }`}>
                      {resolvedPlaylist.platform === 'spotify' 
                        ? 'Spotify' 
                        : resolvedPlaylist.platform === 'apple'
                        ? 'Apple Music'
                        : resolvedPlaylist.platform === 'deezer'
                        ? 'Deezer'
                        : 'YouTube Music'}
                    </span>
                    <span className="text-xs text-zinc-500">• {resolvedPlaylist.totalTracks} original tracks</span>
                  </div>
                  <h3 className="text-base font-bold text-white truncate mt-1">
                    {resolvedPlaylist.title}
                  </h3>
                  <p className="text-xs text-zinc-400 truncate mt-0.5">
                    by {resolvedPlaylist.author || 'Curator'}
                  </p>
                </div>
              </div>

              {/* Duplicate Playlist Detection Alert */}
              {duplicatePlaylist && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>This playlist is already in your Library ("{duplicatePlaylist.name}")</span>
                  </div>
                  <p className="text-xs text-amber-200/80 leading-relaxed">
                    Choose whether you would like to update the existing playlist in place or create a separate copy:
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setDuplicateChoice('update')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                        duplicateChoice === 'update'
                          ? 'bg-amber-500/30 border-amber-500 text-white'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Update Existing Playlist
                    </button>
                    <button
                      onClick={() => setDuplicateChoice('copy')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                        duplicateChoice === 'copy'
                          ? 'bg-amber-500/30 border-amber-500 text-white'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Create Separate Copy
                    </button>
                  </div>
                </div>
              )}

              {/* Match Summary Metrics */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                  <p className="text-lg font-bold text-white font-mono">{totalCount}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Total</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-lg font-bold text-emerald-400 font-mono">{matchedCount}</p>
                  <p className="text-[10px] text-emerald-300 mt-0.5">Matched</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-lg font-bold text-amber-400 font-mono">{ambiguousCount}</p>
                  <p className="text-[10px] text-amber-300 mt-0.5">Review</p>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <p className="text-lg font-bold text-rose-400 font-mono">{unmatchedCount}</p>
                  <p className="text-[10px] text-rose-300 mt-0.5">Unmatched</p>
                </div>
              </div>

              {/* Filter Tabs & Bulk Swap Row */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/[0.08] pb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setFilterTab('all')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors cursor-pointer ${
                      filterTab === 'all' ? 'bg-white/15 text-white font-semibold' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    onClick={() => setFilterTab('matched')}
                    className={`text-xs px-3 py-1 rounded-full transition-colors cursor-pointer ${
                      filterTab === 'matched' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    Matched ({matchedCount})
                  </button>
                  {ambiguousCount > 0 && (
                    <button
                      onClick={() => setFilterTab('ambiguous')}
                      className={`text-xs px-3 py-1 rounded-full transition-colors cursor-pointer ${
                        filterTab === 'ambiguous' ? 'bg-amber-500/20 text-amber-300 font-semibold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Review ({ambiguousCount})
                    </button>
                  )}
                  {unmatchedCount > 0 && (
                    <button
                      onClick={() => setFilterTab('unmatched')}
                      className={`text-xs px-3 py-1 rounded-full transition-colors cursor-pointer ${
                        filterTab === 'unmatched' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Unmatched ({unmatchedCount})
                    </button>
                  )}
                </div>

                {/* Bulk Swap Action Button */}
                {matchedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowSwapConfirm(true)}
                    disabled={eligibleCount === 0}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                      eligibleCount > 0
                        ? 'bg-white/10 hover:bg-white/20 text-white border border-white/15 shadow-sm active:scale-95'
                        : 'bg-white/5 text-zinc-500 border border-white/5 cursor-not-allowed'
                    }`}
                    title={eligibleCount > 0 ? `Rotate ${eligibleCount} tracks with alternatives to their next candidate` : 'No tracks with alternative candidates'}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Swap All Candidates ({eligibleCount})</span>
                  </button>
                )}
              </div>

              {/* Bulk Swap Confirmation Dialog */}
              {showSwapConfirm && (
                <div className="p-4 rounded-2xl bg-[#16161f] border border-white/15 space-y-3 shadow-2xl animate-in zoom-in-95">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs sm:text-sm">
                    <RefreshCw className="w-4 h-4 text-amber-400" />
                    <span>Swap All Candidates ({eligibleCount})</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    This will rotate {eligibleCount} tracks with alternative matches to their next best candidate from the Ghosttunes catalogue.
                    {unalterableCount > 0 ? ` ${unalterableCount} tracks without alternatives or manually locked by you will be kept unchanged.` : ''}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowSwapConfirm(false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmSwapAll}
                      className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#6b1828] hover:bg-[#852033] text-white transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      Swap All ({eligibleCount})
                    </button>
                  </div>
                </div>
              )}

              {/* Toast Result Notification */}
              {swapToast && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="truncate">{swapToast.message}</span>
                  </div>
                  {previousMatchedItems && (
                    <button
                      onClick={handleUndoSwap}
                      className="text-xs font-semibold underline hover:text-white cursor-pointer flex-shrink-0"
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}

              {/* Track Match List */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin">
                {filteredItems.map(item => {
                  const hasCandidate = item.candidate !== null;

                  return (
                    <div
                      key={item.order}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                        item.isLocked 
                          ? 'bg-emerald-500/[0.04] border-emerald-500/20' 
                          : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.04]'
                      }`}
                    >
                      {/* Track info */}
                      <div className="min-w-0 flex items-center gap-3 flex-1">
                        <span className="w-5 text-right font-mono text-zinc-500 flex-shrink-0">
                          {item.order}
                        </span>
                        
                        {item.candidate?.thumbnail ? (
                          <img
                            src={item.candidate.thumbnail}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-500 flex-shrink-0">
                            <Music className="w-4 h-4" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-white truncate">
                              {hasCandidate ? item.candidate!.title : item.sourceTrack.title}
                            </p>
                            {item.isLocked && (
                              <span title="Locked match (excluded from bulk swap)">
                                <Lock className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-400 truncate mt-0.5">
                            {hasCandidate ? item.candidate!.artist : item.sourceTrack.artist}
                            {item.sourceTrack.album ? ` • ${item.sourceTrack.album}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Match Status & Alternative Selection */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {item.status === 'matched' && (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <Check className="w-3 h-3" />
                              <span>Matched</span>
                            </span>
                            {item.alternatives.length > 0 && (
                              <select
                                className="bg-[#181820] text-zinc-300 text-[11px] rounded-lg border border-white/10 px-2 py-1 outline-none cursor-pointer max-w-[125px]"
                                onChange={e => {
                                  const cand = item.alternatives.find(a => a.id === e.target.value);
                                  if (cand) handleSelectAlternative(item.order, cand);
                                }}
                                value=""
                              >
                                <option value="" disabled>Swap candidate...</option>
                                {item.alternatives.map(alt => (
                                  <option key={alt.id} value={alt.id}>
                                    {alt.title} - {alt.artist}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {item.status === 'ambiguous' && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                              Review
                            </span>
                            {item.alternatives.length > 0 && (
                              <select
                                className="bg-[#181820] text-zinc-300 text-[11px] rounded-lg border border-white/10 px-2 py-1 outline-none cursor-pointer max-w-[125px]"
                                onChange={e => {
                                  const cand = item.alternatives.find(a => a.id === e.target.value);
                                  if (cand) handleSelectAlternative(item.order, cand);
                                }}
                                value=""
                              >
                                <option value="" disabled>Swap candidate...</option>
                                {item.alternatives.map(alt => (
                                  <option key={alt.id} value={alt.id}>
                                    {alt.title} - {alt.artist}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        {item.status === 'unmatched' && (
                          <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                            Unmatched
                          </span>
                        )}

                        {/* Lock / Unlock Toggle button */}
                        {item.status !== 'unmatched' && (
                          <button
                            onClick={() => handleToggleLock(item.order)}
                            className={`p-1 rounded-lg transition-colors cursor-pointer ${
                              item.isLocked 
                                ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' 
                                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                            }`}
                            title={item.isLocked ? "Match is locked (click to unlock)" : "Lock this match to protect from Swap All"}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Toggle skip / include */}
                        <button
                          onClick={() => handleToggleSkipTrack(item.order)}
                          className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title={hasCandidate ? "Skip track" : "Try include track"}
                        >
                          {hasCandidate ? <X className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* STEP 4: Success Confirmation */}
          {step === 'success' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl animate-in zoom-in-95">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Playlist Imported Successfully!
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                  "{resolvedPlaylist?.title}" has been saved to your Library with {matchedCount} playable songs. Opening now...
                </p>
              </div>
            </div>
          )}

        </div>

        {/* =====================================================================
            MODAL FOOTER: Action Buttons
           ===================================================================== */}
        <footer className="px-6 py-4 border-t border-white/[0.08] flex items-center justify-between flex-shrink-0 bg-white/[0.02]">
          {step === 'input' && (
            <div className="w-full flex items-center justify-between">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-full text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStartImport()}
                disabled={!url.trim()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold transition-all shadow-lg cursor-pointer ${
                  url.trim()
                    ? 'bg-[#6b1828] hover:bg-[#852033] text-white hover:scale-[1.02] active:scale-95'
                    : 'bg-white/5 text-zinc-500 cursor-not-allowed'
                }`}
              >
                <span>Import Playlist</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="w-full flex items-center justify-between">
              <button
                onClick={() => setStep('input')}
                className="px-4 py-2 rounded-full text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={handleSaveToLibrary}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold bg-[#6b1828] hover:bg-[#852033] text-white transition-all shadow-lg hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Library ({matchedCount} songs)</span>
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
};
