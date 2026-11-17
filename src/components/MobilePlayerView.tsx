import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Track, Playlist, HistoryItem, AutoplayMode, LyricLine } from '../types';
import {
  Home,
  Search,
  Library,
  Sliders,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ChevronDown,
  Download,
  CheckCircle2,
  Plus,
  Mic2,
  Settings,
  X,
  Flame,
  Music2,
  Clock,
  Sparkles,
  Loader2,
  MoreVertical,
  Volume2,
  Share2,
  WifiOff,
  Radio,
  Disc3
} from 'lucide-react';
import { getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';
import ghostIcon from '../assets/icon.png';
import ghostIconSvg from '../assets/icon.svg';

export interface MobilePlayerViewProps {
  track: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics?: LyricLine[];
  plainLyrics?: string;
  loadingLyrics?: boolean;
  onRetryLyrics?: () => void;
  queue: Track[];
  queueIndex: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: boolean | 'one';
  isLiked: boolean;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onToggleLike: () => void;
  onToggleFavorite?: (track: Track) => void;
  onOpenLyrics: () => void;
  onOpenAbout?: () => void;
  onOpenAppearanceModal?: () => void;
  onOpenAudioLab?: () => void;
  isSmartRadio?: boolean;
  onToggleSmartRadio?: () => void;
  currentView: 'home' | 'now-playing' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist';
  onViewChange: (view: 'home' | 'now-playing' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
  searchResults: Track[];
  genreTracks: Track[];
  searchLoading: boolean;
  searchError: string | null;
  onRetrySearch: () => void;
  favorites: Track[];
  playlists?: Playlist[];
  history?: HistoryItem[];
  onOpenAddToPlaylist?: (track: Track) => void;
  onCreateNewPlaylist?: () => void;
  isOfflineMode?: boolean;
  onToggleOfflineMode?: () => void;
  onDownloadTrack?: (track: Track) => void;
  downloadedTrackIds?: Set<string>;
  downloadingTrackIds?: Set<string>;
  hasUpdate?: boolean;
}

const GENRE_BROWSE_CARDS = [
  { name: 'Trending', color: 'from-rose-600 to-amber-700', icon: '🔥' },
  { name: 'Afrobeats', color: 'from-amber-600 to-orange-800', icon: '🥁' },
  { name: 'Hip Hop', color: 'from-purple-700 to-indigo-900', icon: '🎤' },
  { name: 'R&B', color: 'from-pink-700 to-rose-900', icon: '✨' },
  { name: 'Pop', color: 'from-cyan-600 to-blue-800', icon: '🌟' },
  { name: 'Electronic', color: 'from-emerald-600 to-teal-800', icon: '⚡' },
  { name: 'Rock', color: 'from-red-700 to-stone-900', icon: '🎸' },
  { name: 'Lo-Fi', color: 'from-indigo-600 to-purple-800', icon: '☕' },
];

export const MobilePlayerView: React.FC<MobilePlayerViewProps> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  lyrics = [],
  plainLyrics = '',
  loadingLyrics = false,
  onRetryLyrics,
  queue,
  queueIndex,
  isShuffle,
  isRepeat,
  isLiked,
  onSeek,
  onPlayPause,
  onNext,
  onPrev,
  onPlayTrack,
  onToggleShuffle,
  onToggleRepeat,
  onToggleLike,
  onToggleFavorite,
  onOpenLyrics,
  onOpenAbout,
  onOpenAudioLab,
  isSmartRadio = true,
  onToggleSmartRadio,
  searchQuery,
  onSearchChange,
  selectedGenre,
  onSelectGenre,
  searchResults,
  genreTracks,
  searchLoading,
  searchError,
  onRetrySearch,
  favorites,
  playlists = [],
  history = [],
  onOpenAddToPlaylist,
  onCreateNewPlaylist,
  isOfflineMode,
  onToggleOfflineMode,
  onDownloadTrack,
  downloadedTrackIds = new Set(),
  downloadingTrackIds = new Set(),
  hasUpdate
}) => {
  // Mobile active tab: 'home' | 'search' | 'library'
  const [activeTab, setActiveTab] = useState<'home' | 'search' | 'library'>('home');
  // Full-screen Now Playing bottom sheet state
  const [isNowPlayingExpanded, setIsNowPlayingExpanded] = useState(false);
  // Inside Now Playing: false = Artwork Mode, true = Live Synced Lyrics Mode
  const [showLyricsTab, setShowLyricsTab] = useState(false);
  // Library sub-filter: 'all' | 'playlists' | 'favorites' | 'downloads'
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'playlists' | 'favorites' | 'downloads'>('all');

  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remaining = Math.max(0, duration - currentTime);
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  // Active lyric index calculation for time-synced lyrics
  const activeLyricIndex = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return -1;
    let low = 0;
    let high = lyrics.length - 1;
    let result = -1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (lyrics[mid].time <= currentTime + 0.15) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  }, [lyrics, currentTime]);

  // Smoothly auto-scroll active lyric into center view
  useEffect(() => {
    if (showLyricsTab && activeLyricRef.current && lyricsContainerRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [activeLyricIndex, showLyricsTab]);

  // Jump Back In tracks (from history or favorites)
  const quickPlayTracks = useMemo(() => {
    const list: Track[] = [];
    const seen = new Set<string>();

    history.forEach((h) => {
      if (h.track && !seen.has(h.track.id)) {
        seen.add(h.track.id);
        list.push(h.track);
      }
    });

    favorites.forEach((f) => {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        list.push(f);
      }
    });

    return list.slice(0, 6);
  }, [history, favorites]);

  // Featured / Trending tracks from genreTracks or favorites
  const trendingTracks = useMemo(() => {
    if (genreTracks && genreTracks.length > 0) return genreTracks;
    return favorites.slice(0, 15);
  }, [genreTracks, favorites]);

  return (
    <div className="relative w-full h-screen bg-[#070709] text-white flex flex-col overflow-hidden select-none font-['Inter','Manrope',sans-serif]">
      {/* =========================================================================
          TOP MOBILE APP BAR (Clean Bespoke Branding)
          ========================================================================= */}
      <header 
        className="flex-shrink-0 z-20 flex items-center justify-between px-4 py-3 bg-[#0a0a0e]/90 backdrop-blur-xl border-b border-white/[0.06]"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 12px))' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl overflow-hidden shadow-lg shadow-rose-600/30 flex-shrink-0">
            <img 
              src={ghostIcon} 
              alt="Ghosttunes" 
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.src = ghostIconSvg;
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-white">Ghosttunes</span>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]" />
            </div>
            <p className="text-[10px] text-zinc-400 font-mono tracking-wider">Lossless Audio Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasUpdate && (
            <button
              onClick={onOpenAbout}
              className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-semibold animate-pulse"
            >
              Update
            </button>
          )}

          {onOpenAudioLab && (
            <button
              onClick={onOpenAudioLab}
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/10 active:scale-90 text-amber-400 flex items-center justify-center transition-all border border-white/[0.08] shadow-sm"
              title="Audio Lab Equalizer"
              aria-label="Audio Lab"
            >
              <Sliders className="w-4 h-4 text-amber-400" />
            </button>
          )}

          {onOpenAbout && (
            <button
              onClick={onOpenAbout}
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/10 active:scale-90 text-zinc-300 flex items-center justify-center transition-all border border-white/[0.08] shadow-sm"
              title="About & Settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4 text-zinc-300" />
            </button>
          )}
        </div>
      </header>

      {/* =========================================================================
          MAIN SCROLLABLE CONTENT VIEWPORT
          ========================================================================= */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-40 overscroll-contain">
        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <div className="px-4 py-4 space-y-6">
            {/* Quick Greeting & Offline Indicator */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Listen Now</h1>
                <p className="text-xs text-zinc-400 mt-0.5">High-fidelity audio on Android</p>
              </div>
              {isOfflineMode && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 font-medium">
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Offline Mode</span>
                </div>
              )}
            </div>

            {/* Quick Genre Chips Horizontal Scroll */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-4 px-4">
              {['Trending', 'Afrobeats', 'Hip Hop', 'R&B', 'Pop', 'Electronic', 'Rock', 'Lo-Fi'].map((genre) => {
                const isSelected = selectedGenre === genre;
                return (
                  <button
                    key={genre}
                    onClick={() => {
                      onSelectGenre(genre);
                      setActiveTab('search');
                    }}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 ${
                      isSelected
                        ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-lg shadow-rose-600/30 scale-[1.02]'
                        : 'bg-[#141419] text-zinc-300 hover:text-white border border-white/[0.08] hover:border-white/20'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>

            {/* Jump Back In (2-Column Grid) */}
            {quickPlayTracks.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-bold text-zinc-300 tracking-wider uppercase">Jump Back In</h2>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {quickPlayTracks.map((t) => {
                    const isCur = track?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => onPlayTrack(t, quickPlayTracks)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-2xl bg-[#121217]/90 border transition-all active:scale-[0.98] cursor-pointer ${
                          isCur
                            ? 'border-rose-500/60 bg-rose-950/25 shadow-lg shadow-rose-950/40'
                            : 'border-white/[0.07] hover:border-white/20'
                        }`}
                      >
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-sm">
                          <img
                            src={getThumbnailArtwork(t.thumbnail)}
                            alt={t.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isCur && isPlaying && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isCur ? 'text-rose-400' : 'text-white'}`}>
                            {t.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{t.artist}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Trending & Fresh Hits (Horizontal Cards) */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-500 fill-rose-500" />
                  <h2 className="text-xs font-bold text-zinc-300 tracking-wider uppercase">Trending Hits</h2>
                </div>
                <button
                  onClick={() => {
                    onSelectGenre('Trending');
                    setActiveTab('search');
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                >
                  Explore All
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
                {trendingTracks.slice(0, 10).map((t) => {
                  const isCur = track?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onPlayTrack(t, trendingTracks)}
                      className="group flex-shrink-0 w-36 cursor-pointer active:scale-95 transition-all"
                    >
                      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-zinc-900 shadow-md border border-white/[0.08] mb-2">
                        <img
                          src={getThumbnailArtwork(t.thumbnail)}
                          alt={t.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2">
                          <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          </div>
                        </div>
                        {isCur && (
                          <div className="absolute top-2 right-2 w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
                        )}
                      </div>
                      <p className={`text-xs font-bold truncate ${isCur ? 'text-rose-400' : 'text-white'}`}>
                        {t.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">{t.artist}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: SEARCH */}
        {activeTab === 'search' && (
          <div className="px-4 py-4 space-y-4">
            {/* Search Input Bar */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search songs, artists, albums..."
                className="w-full h-12 pl-11 pr-10 rounded-2xl bg-[#141419] border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/40 transition-all shadow-inner"
              />
              <Search className="w-5 h-5 text-zinc-400 absolute left-3.5 top-3.5" />
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center absolute right-3 top-3 active:scale-90"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Results or Genre Cards */}
            {searchLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
                <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
                <p className="text-xs font-medium">Searching lossless catalog...</p>
              </div>
            ) : searchQuery.trim().length > 0 ? (
              /* Search Results List */
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Top Results ({searchResults.length})
                </p>
                {searchResults.map((t) => {
                  const isCur = track?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onPlayTrack(t, searchResults)}
                      className={`flex items-center gap-3 p-2.5 rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${
                        isCur ? 'bg-rose-950/30 border border-rose-500/40 shadow-lg' : 'bg-[#121217] hover:bg-white/[0.04] border border-white/[0.06]'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0 shadow-sm">
                        <img
                          src={getThumbnailArtwork(t.thumbnail)}
                          alt={t.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold truncate ${isCur ? 'text-rose-400' : 'text-white'}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleFavorite) onToggleFavorite(t);
                        }}
                        className="p-2 text-zinc-400 hover:text-rose-400 active:scale-90"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            favorites.some((f) => f.id === t.id) ? 'fill-rose-500 text-rose-500' : ''
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Browse Categories 2-Column Grid */
              <div className="space-y-3">
                <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Browse All Genres</h2>
                <div className="grid grid-cols-2 gap-3">
                  {GENRE_BROWSE_CARDS.map((cat) => (
                    <div
                      key={cat.name}
                      onClick={() => onSelectGenre(cat.name)}
                      className={`relative h-24 rounded-2xl bg-gradient-to-br ${cat.color} p-3.5 overflow-hidden shadow-lg cursor-pointer active:scale-98 transition-all flex flex-col justify-between border border-white/10`}
                    >
                      <span className="text-sm font-black text-white tracking-wide">{cat.name}</span>
                      <span className="text-2xl self-end drop-shadow-md">{cat.icon}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LIBRARY */}
        {activeTab === 'library' && (
          <div className="px-4 py-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Your Library</h1>
                <p className="text-xs text-zinc-400 mt-0.5">Playlists, downloads & favorites</p>
              </div>
              {onCreateNewPlaylist && (
                <button
                  onClick={onCreateNewPlaylist}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-rose-600/30"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {(['all', 'playlists', 'favorites', 'downloads'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setLibraryFilter(filter)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                    libraryFilter === filter
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'bg-[#141419] text-zinc-300 border border-white/[0.08]'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Liked Songs Hero Row */}
            {(libraryFilter === 'all' || libraryFilter === 'favorites') && (
              <div
                onClick={() => {
                  if (favorites.length > 0) onPlayTrack(favorites[0], favorites);
                }}
                className="flex items-center gap-3.5 p-3 rounded-2xl bg-gradient-to-r from-purple-900/40 to-rose-900/30 border border-rose-500/20 cursor-pointer active:scale-98 transition-all shadow-md"
              >
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                  <Heart className="w-6 h-6 text-white fill-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white">Liked Songs</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{favorites.length} favorite tracks</p>
                </div>
                <Play className="w-5 h-5 text-rose-400 fill-current" />
              </div>
            )}

            {/* Playlists List */}
            {(libraryFilter === 'all' || libraryFilter === 'playlists') && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Playlists</p>
                {playlists.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">No playlists yet. Tap "+ New" to create one.</p>
                ) : (
                  playlists.map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => {
                        if (pl.tracks && pl.tracks.length > 0) onPlayTrack(pl.tracks[0], pl.tracks);
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#121217] border border-white/[0.06] cursor-pointer active:scale-98"
                    >
                      <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center overflow-hidden shadow-sm">
                        {pl.tracks && pl.tracks[0]?.thumbnail ? (
                          <img
                            src={getThumbnailArtwork(pl.tracks[0].thumbnail)}
                            alt={pl.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Music2 className="w-5 h-5 text-zinc-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{pl.name}</h4>
                        <p className="text-xs text-zinc-400 mt-0.5">{pl.tracks?.length || 0} tracks</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Downloaded Songs List */}
            {(libraryFilter === 'all' || libraryFilter === 'downloads') && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                  Downloads ({downloadedTrackIds.size})
                </p>
                {downloadedTrackIds.size === 0 ? (
                  <p className="text-xs text-zinc-500 py-3">No tracks downloaded for offline playback.</p>
                ) : (
                  favorites
                    .filter((f) => downloadedTrackIds.has(f.id))
                    .map((t) => (
                      <div
                        key={t.id}
                        onClick={() => onPlayTrack(t)}
                        className="flex items-center gap-3 p-2.5 rounded-2xl bg-[#121217] border border-white/[0.06] cursor-pointer active:scale-98"
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex-shrink-0">
                          <img
                            src={getThumbnailArtwork(t.thumbnail)}
                            alt={t.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-white truncate">{t.title}</p>
                          <p className="text-xs text-zinc-400 truncate mt-0.5">{t.artist}</p>
                        </div>
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================================
          FLOATING NATIVE MINI-PLAYER (Elevated Card Hovering Above Dock)
          ========================================================================= */}
      {track && (
        <div 
          id="mobile-mini-player"
          className="fixed left-3.5 right-3.5 z-30 transition-all duration-300"
          style={{ bottom: 'calc(68px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div
            onClick={() => setIsNowPlayingExpanded(true)}
            className="relative flex items-center justify-between p-2 rounded-2xl bg-[#14141b]/95 border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.7)] backdrop-blur-2xl cursor-pointer active:scale-[0.99] transition-transform overflow-hidden"
          >
            {/* Slim Crimson Progress Bar along bottom of Mini-Player card */}
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-zinc-800/80">
              <div 
                className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Left: Artwork + Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 shadow-md border border-white/[0.08]">
                <img
                  src={getThumbnailArtwork(track.thumbnail)}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{track.title}</p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{track.artist}</p>
              </div>
            </div>

            {/* Right: Quick Controls (Heart + Play/Pause) */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLike();
                }}
                className="p-2 text-zinc-400 hover:text-rose-500 active:scale-90 transition-transform"
                aria-label="Like"
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayPause();
                }}
                className="w-10 h-10 rounded-full bg-gradient-to-tr from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-rose-500/40 active:scale-90 transition-transform"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FLOATING ISLAND BOTTOM NAVIGATION BAR (Apple / Spotify Style Capsule)
          ========================================================================= */}
      <nav 
        className="fixed left-4 right-4 z-20 rounded-full bg-[#0d0d12]/92 backdrop-blur-2xl border border-white/10 shadow-[0_20px_45px_rgba(0,0,0,0.95)] py-2 px-5 flex items-center justify-around"
        style={{ bottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
      >
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center py-1 gap-1 active:scale-90 transition-all ${
            activeTab === 'home' ? 'text-rose-500 font-bold scale-105' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center py-1 gap-1 active:scale-90 transition-all ${
            activeTab === 'search' ? 'text-rose-500 font-bold scale-105' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px]">Search</span>
        </button>

        <button
          onClick={() => setActiveTab('library')}
          className={`flex flex-col items-center justify-center py-1 gap-1 active:scale-90 transition-all ${
            activeTab === 'library' ? 'text-rose-500 font-bold scale-105' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[10px]">Library</span>
        </button>

        {onOpenAudioLab && (
          <button
            onClick={onOpenAudioLab}
            className="flex flex-col items-center justify-center py-1 gap-1 text-zinc-400 hover:text-amber-400 active:scale-90 transition-all"
          >
            <Sliders className="w-5 h-5 text-amber-400" />
            <span className="text-[10px]">Audio Lab</span>
          </button>
        )}
      </nav>

      {/* =========================================================================
          FULL-SCREEN NOW PLAYING SHEET (Spotify / Apple Music Dual-Stage Experience)
          ========================================================================= */}
      {isNowPlayingExpanded && track && (
        <div 
          className="fixed inset-0 z-50 bg-[#07070a] flex flex-col justify-between p-5 animate-in slide-in-from-bottom duration-300 shadow-2xl overflow-hidden"
          style={{
            paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))'
          }}
        >
          {/* Subtle Dynamic Ambient Glow behind player */}
          <div className="absolute inset-0 bg-gradient-to-b from-rose-950/30 via-zinc-950/40 to-[#07070a] pointer-events-none" />

          {/* Top Bar: Pull Down Chevron & Header */}
          <div className="relative z-10 flex items-center justify-between">
            <button
              onClick={() => setIsNowPlayingExpanded(false)}
              className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-zinc-300 hover:text-white active:scale-90 transition-all shadow-sm"
              aria-label="Collapse"
            >
              <ChevronDown className="w-6 h-6" />
            </button>

            <div className="text-center">
              <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-400">PLAYING FROM STUDIO</span>
              <p className="text-xs font-bold text-white tracking-wide">Ghosttunes Mobile</p>
            </div>

            <button
              onClick={onOpenAbout}
              className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center text-zinc-300 hover:text-white active:scale-90 transition-all shadow-sm"
              aria-label="Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>

          {/* =====================================================================
              CENTRAL STAGE: Seamless Toggle between Artwork Mode & Live Lyrics Mode
              ===================================================================== */}
          {!showLyricsTab ? (
            /* MODE A: Prominent Album Artwork (Apple Music Style) */
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4">
              <div 
                onClick={onPlayPause}
                className={`relative aspect-square w-[76vw] max-w-[330px] rounded-3xl overflow-hidden shadow-[0_25px_60px_-10px_rgba(225,29,72,0.4)] border border-white/10 cursor-pointer transition-all duration-500 active:scale-[0.98] ${
                  isPlaying ? 'scale-100 ring-1 ring-white/20' : 'scale-[0.94] opacity-90'
                }`}
              >
                <img
                  src={getOptimizedArtwork(track.thumbnail)}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          ) : (
            /* MODE B: Time-Synced Live Lyrics Column (Apple Music Style) */
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-2 overflow-hidden w-full">
              <div 
                ref={lyricsContainerRef}
                className="w-full h-full overflow-y-auto pt-[20vh] pb-[25vh] px-4 space-y-5 text-center scroll-smooth no-scrollbar"
              >
                {loadingLyrics ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                    <Loader2 className="w-7 h-7 animate-spin text-rose-500" />
                    <p className="text-sm font-medium">Fetching synchronized lyrics...</p>
                  </div>
                ) : lyrics && lyrics.length > 0 ? (
                  lyrics.map((line, idx) => {
                    const isActive = idx === activeLyricIndex;
                    return (
                      <div
                        key={`lyric-${line.time}-${idx}`}
                        ref={isActive ? activeLyricRef : null}
                        onClick={() => onSeek(line.time)}
                        className={`cursor-pointer transition-all duration-300 py-2 select-none active:scale-95 ${
                          isActive
                            ? 'text-white font-extrabold text-2xl scale-105 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                            : 'text-zinc-500 font-medium text-lg hover:text-zinc-300'
                        }`}
                      >
                        {line.text}
                      </div>
                    );
                  })
                ) : plainLyrics ? (
                  <div className="text-zinc-300 text-base leading-relaxed whitespace-pre-line py-8">
                    {plainLyrics}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-zinc-400 gap-3">
                    <Music2 className="w-10 h-10 text-zinc-600" />
                    <p className="text-base font-bold text-zinc-300">No synchronized lyrics found</p>
                    <p className="text-xs text-zinc-500">Enjoy the audio in high fidelity</p>
                    <button
                      onClick={() => setShowLyricsTab(false)}
                      className="mt-3 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-semibold text-white transition-all"
                    >
                      Return to Artwork
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Song Details & Favorite */}
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1 mr-3">
                <h2 className="text-2xl font-black text-white truncate tracking-tight">{track.title}</h2>
                <p className="text-base text-zinc-400 truncate mt-0.5 font-medium">{track.artist}</p>
              </div>
              <button
                onClick={onToggleLike}
                className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center active:scale-90 transition-transform shadow-sm"
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
              </button>
            </div>

            {/* Scrubber Progress Slider */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>{formatTime(currentTime)}</span>
                <span>-{formatTime(remaining)}</span>
              </div>
            </div>

            {/* Primary Controls Row: Centered, Glowing Play/Pause */}
            <div className="flex items-center justify-between px-2 pt-1">
              <button
                onClick={onToggleShuffle}
                className={`p-2.5 rounded-full transition-transform active:scale-90 ${
                  isShuffle ? 'text-rose-500' : 'text-zinc-400 hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={onPrev}
                className="p-3 text-white active:scale-90 transition-transform"
                title="Previous"
              >
                <SkipBack className="w-7 h-7 fill-current" />
              </button>

              {/* Large Glowing Circular Play/Pause Button */}
              <button
                onClick={onPlayPause}
                className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_35px_rgba(255,255,255,0.4)] active:scale-90 hover:scale-105 transition-all"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-8 h-8 fill-current" />
                ) : (
                  <Play className="w-8 h-8 fill-current ml-1" />
                )}
              </button>

              <button
                onClick={onNext}
                className="p-3 text-white active:scale-90 transition-transform"
                title="Next"
              >
                <SkipForward className="w-7 h-7 fill-current" />
              </button>

              <button
                onClick={onToggleRepeat}
                className={`p-2.5 rounded-full transition-transform active:scale-90 ${
                  isRepeat ? 'text-rose-500' : 'text-zinc-400 hover:text-white'
                }`}
                title="Repeat"
              >
                {isRepeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Bottom Actions: Lyrics Toggle & Audio Lab */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.08] text-xs font-semibold text-zinc-300">
              <button
                onClick={() => setShowLyricsTab(!showLyricsTab)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full transition-all active:scale-95 ${
                  showLyricsTab
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40'
                    : 'bg-white/[0.06] text-zinc-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                <Mic2 className="w-4 h-4" />
                <span>{showLyricsTab ? 'Artwork' : 'Lyrics'}</span>
              </button>

              {onOpenAudioLab && (
                <button
                  onClick={() => {
                    setIsNowPlayingExpanded(false);
                    onOpenAudioLab();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] text-amber-400 hover:bg-white/10 border border-white/10 active:scale-95"
                >
                  <Sliders className="w-4 h-4" />
                  <span>Equalizer</span>
                </button>
              )}

              {onDownloadTrack && (
                <button
                  onClick={() => onDownloadTrack(track)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] text-cyan-400 hover:bg-white/10 border border-white/10 active:scale-95"
                >
                  {downloadedTrackIds.has(track.id) ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Downloaded</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
