import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Track, LyricLine, Playlist, HistoryItem, AutoplayMode } from '../types';
import { 
  Home,
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Volume2, 
  VolumeX, 
  ListMusic, 
  Search, 
  Maximize, 
  Minimize, 
  Image as WallpaperIcon,
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Heart,
  X,
  Upload,
  RotateCcw,
  RotateCw,
  Loader2,
  MoreHorizontal,
  Disc3,
  Moon,
  Zap,
  Music2,
  Sparkles,
  Download,
  CheckCircle2,
  Wifi,
  WifiOff,
  FolderSync,
  PictureInPicture2,
  History,
  BarChart3,
  Sliders,
  Radio,
  Info,
  Compass,
  Plus
} from 'lucide-react';
import { DownloadsView } from './DownloadsView';
import { MusicMemoryView } from './MusicMemoryView';
import { ArtistProfileView } from './ArtistProfileView';
import { getHighResArtwork, getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';
import { WALLPAPER_PRESETS } from '../utils/wallpaperStorage';
import { TrackPalette, getFallbackPalette } from '../utils/palette';
import { segmentParagraphLyrics, getChronologicalLyrics, findActiveLyricIndex } from '../utils/lyricsParser';
import { GhostSkinProfile, getFallbackGhostSkin } from '../utils/ghostSkin';
import { ExploreView } from './ExploreView';
import { toggleDesktopFullscreen, subscribeFullscreenChange } from '../services/desktopService';

interface Props {
  track: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics: LyricLine[];
  plainLyrics?: string;
  loadingLyrics?: boolean;
  lyricsFormat?: 'synced' | 'plain' | 'paragraph' | 'none';
  plainStanzas?: string[][];
  isInstrumental?: boolean;
  onRetryLyrics?: () => void;
  palette?: TrackPalette;
  ghostSkin?: GhostSkinProfile;
  onOpenAppearanceModal?: () => void;
  onOpenAbout?: () => void;
  queue: Track[];
  queueIndex: number;
  volume: number;
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: boolean | 'one';
  isLiked: boolean;
  isDataSaver?: boolean;
  onOpenDataSaver?: () => void;
  wallpaperMode: 'artwork' | 'custom' | 'ambient';
  onSetWallpaperMode: (mode: 'artwork' | 'custom' | 'ambient') => void;
  wallpaper: string;
  isCustomWallpaper: boolean;
  onSelectPreset: (presetId: string) => void;
  onUploadWallpaper: (file: File) => Promise<void>;
  onResetWallpaper: () => void;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleLike: () => void;
  onOpenLyrics: () => void;
  onOpenExplore?: (tab?: 'search' | 'library' | 'favorites' | 'history' | 'playlists') => void;
  onGoHome?: () => void;
  isExploreOpen?: boolean;

  // New Editorial Navigation and Explore & Search View props
  currentView: 'home' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist';
  onViewChange: (view: 'home' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist') => void;
  artistQuery?: { id?: string; name: string } | null;
  onOpenArtist?: (name: string, id?: string) => void;
  onBackFromArtist?: () => void;
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
  onAddToQueue?: (track: Track) => void;
  onOpenImportModal?: () => void;
  onOpenBackupModal?: () => void;
  onCreateNewPlaylist?: () => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onRenamePlaylist?: (playlistId: string, newName: string) => void;
  onRemoveTrackFromPlaylist?: (playlistId: string, trackId: string) => void;
  isOfflineMode?: boolean;
  onToggleOfflineMode?: () => void;
  onDownloadTrack?: (track: Track) => void;
  onDownloadPlaylist?: (playlist: Playlist, tracks: Track[]) => void;
  downloadedTrackIds?: Set<string>;
  downloadingTrackIds?: Set<string>;
  downloadingPlaylistIds?: Set<string>;
  pausedDownloadingTrackIds?: Set<string>;
  pausedDownloadingPlaylistIds?: Set<string>;
  onTrackDeleted?: (trackId: string) => void;
  onToggleFloatingWidget?: () => void;
  isWidgetActive?: boolean;
  onOpenGhostDj?: () => void;
  onOpenAudioLab?: () => void;
  onOpenListeningRoom?: () => void;
  onOpenPlaylistRescue?: (playlist: Playlist) => void;
  onResumeSession?: (tracks: Track[], index: number, time: number) => void;
  selectedPlaylistId?: string | null;
  onSelectPlaylist?: (playlistId: string | null) => void;
  isAutoplayEnabled?: boolean;
  onToggleAutoplay?: () => void;
  autoplayMode?: AutoplayMode;
  onChangeAutoplayMode?: (mode: AutoplayMode) => void;
  onRemoveFromQueue?: (trackId: string, index: number) => void;
}

export const DesktopPlayerView: React.FC<Props> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  lyrics,
  plainLyrics,
  loadingLyrics = false,
  lyricsFormat = 'synced',
  plainStanzas = [],
  isInstrumental = false,
  onRetryLyrics,
  palette: passedPalette,
  ghostSkin: passedGhostSkin,
  onOpenAppearanceModal,
  onOpenAbout,
  onToggleFloatingWidget,
  isWidgetActive = false,
  queue,
  queueIndex,
  volume,
  isMuted,
  isShuffle,
  isRepeat,
  isLiked,
  isDataSaver = false,
  onOpenDataSaver,
  wallpaperMode,
  onSetWallpaperMode,
  wallpaper,
  isCustomWallpaper,
  onSelectPreset,
  onUploadWallpaper,
  onResetWallpaper,
  onSeek,
  onPlayPause,
  onNext,
  onPrev,
  onPlayTrack,
  onToggleShuffle,
  onToggleRepeat,
  onVolumeChange,
  onToggleMute,
  onToggleLike,
  onOpenLyrics,
  onOpenExplore,
  onGoHome,
  currentView,
  onViewChange,
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
  onAddToQueue,
  onOpenImportModal,
  onOpenBackupModal,
  onCreateNewPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onRemoveTrackFromPlaylist,
  isOfflineMode = false,
  onToggleOfflineMode,
  onDownloadTrack,
  onDownloadPlaylist,
  downloadedTrackIds,
  downloadingTrackIds,
  downloadingPlaylistIds,
  pausedDownloadingTrackIds,
  pausedDownloadingPlaylistIds,
  onTrackDeleted,
  onOpenGhostDj,
  onOpenAudioLab,
  onOpenListeningRoom,
  onOpenPlaylistRescue,
  onResumeSession,
  selectedPlaylistId,
  onSelectPlaylist,
  isAutoplayEnabled = true,
  onToggleAutoplay,
  autoplayMode = 'balanced',
  onChangeAutoplayMode,
  onRemoveFromQueue,
  artistQuery,
  onOpenArtist,
  onBackFromArtist
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);
  const [isStudioMenuOpen, setIsStudioMenuOpen] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ghosttunes_sidebar_collapsed') === 'true';
    }
    return false;
  });

  const [autoCollapseOnPlay, setAutoCollapseOnPlay] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ghosttunes_auto_collapse_on_play') !== 'false';
    }
    return true;
  });

  const [expandedPlaylistIds, setExpandedPlaylistIds] = useState<Set<string>>(new Set(['sb-gospel']));

  useEffect(() => {
    localStorage.setItem('ghosttunes_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem('ghosttunes_auto_collapse_on_play', String(autoCollapseOnPlay));
  }, [autoCollapseOnPlay]);

  // Automatic collapse on track playback start (with toggleable user setting)
  const prevTrackIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPlaying && autoCollapseOnPlay && track && track.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = track.id;
      setIsSidebarCollapsed(true);
    }
  }, [isPlaying, track, autoCollapseOnPlay]);

  // Keyboard shortcut Ctrl+B / Cmd+B for sidebar toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const togglePlaylistExpansion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // DO NOT trigger playback or navigation!
    setExpandedPlaylistIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sidebarPlaylists = useMemo(() => {
    return (playlists || []).map(p => ({
      id: p.id,
      name: p.title || (p as any).name || 'Custom Playlist',
      cover_url: p.cover_url || (p as any).coverUrl || '',
      tracks: p.tracks || []
    }));
  }, [playlists]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  const calculateScrubTime = (clientX: number) => {
    if (!scrubberRef.current) return 0;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * (duration || 100);
  };

  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {}
    setIsScrubbing(true);
    const newTime = calculateScrubTime(e.clientX);
    setScrubTime(newTime);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent) => {
    if (!isScrubbing) return;
    const newTime = calculateScrubTime(e.clientX);
    setScrubTime(newTime);
  };

  const handleScrubberPointerUp = (e: React.PointerEvent) => {
    if (!isScrubbing) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
    setIsScrubbing(false);
    const finalTime = scrubTime !== null ? scrubTime : calculateScrubTime(e.clientX);
    setScrubTime(null);
    onSeek(finalTime);
  };

  const handleScrubberPointerCancel = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
    setIsScrubbing(false);
    setScrubTime(null);
  };

  const handleScrubberMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    const newTime = calculateScrubTime(e.clientX);
    setScrubTime(newTime);
  };

  const handleScrubberTouchStart = (e: React.TouchEvent) => {
    setIsScrubbing(true);
    const newTime = calculateScrubTime(e.touches[0].clientX);
    setScrubTime(newTime);
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newTime = calculateScrubTime(e.clientX);
      setScrubTime(newTime);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        const newTime = calculateScrubTime(e.touches[0].clientX);
        setScrubTime(newTime);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsScrubbing(false);
      const newTime = calculateScrubTime(e.clientX);
      setScrubTime(null);
      onSeek(newTime);
    };

    const handleTouchEnd = () => {
      setIsScrubbing(false);
      if (scrubTime !== null) {
        onSeek(scrubTime);
      }
      setScrubTime(null);
    };

    const handleTouchCancel = () => {
      setIsScrubbing(false);
      setScrubTime(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchCancel);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [isScrubbing, scrubTime, duration, onSeek]);

  // Per-song adaptive palette fallback if not passed by parent
  const activePalette = useMemo(() => {
    return passedPalette || getFallbackPalette(track?.id, track?.title, track?.artist);
  }, [passedPalette, track?.id, track?.title, track?.artist]);

  // Per-song GhostSkin profile
  const skin = useMemo(() => {
    return passedGhostSkin || (track ? getFallbackGhostSkin(track.id, track.title, track.artist) : undefined);
  }, [passedGhostSkin, track?.id, track?.title, track?.artist]);

  // Normalized stanzas: guaranteed readable lines and structured stanzas
  const effectiveStanzas = useMemo(() => {
    if (plainStanzas && plainStanzas.length > 0) return plainStanzas;
    if (plainLyrics) return segmentParagraphLyrics(plainLyrics);
    return [];
  }, [plainStanzas, plainLyrics]);

  // Compact editorial preview stanzas for plain / unsynchronized lyrics (up to 4-5 lines total with proper stanza breaks)
  const previewStanzas = useMemo(() => {
    if (!effectiveStanzas || effectiveStanzas.length === 0) return [];
    const result: string[][] = [];
    let totalLines = 0;
    for (const stanza of effectiveStanzas) {
      const stanzaLines: string[] = [];
      for (const line of stanza) {
        if (line && line.trim()) {
          stanzaLines.push(line.trim());
          totalLines++;
        }
        if (totalLines >= 5) break;
      }
      if (stanzaLines.length > 0) {
        result.push(stanzaLines);
      }
      if (totalLines >= 5) break;
    }
    return result;
  }, [effectiveStanzas]);

  const handleGoHome = () => {
    setIsQueueOpen(false);
    setIsWallpaperModalOpen(false);
    onViewChange('home');
    onGoHome?.();
  };

  // Fullscreen sync and toggle (supports native Electron window and HTML5 fullscreen)
  useEffect(() => {
    return subscribeFullscreenChange((isFs) => {
      setIsFullscreen(isFs);
    });
  }, []);

  const toggleFullscreen = () => {
    toggleDesktopFullscreen().then(isFs => {
      setIsFullscreen(isFs);
    }).catch(() => {});
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeDisplayTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (activeDisplayTime / duration) * 100)) : 0;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          onNext();
        } else {
          onSeek(Math.min(duration || 100, currentTime + 5));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev();
        } else {
          onSeek(Math.max(0, currentTime - 5));
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        onPlayPause();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 10));
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onPlayPause();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        onSeek(Math.min(duration || 100, currentTime + 10));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onVolumeChange(Math.min(1, volume + 0.05));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onVolumeChange(Math.max(0, volume - 0.05));
      } else if (e.key === 'q' || e.key === 'Q') {
        setIsQueueOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        if (isQueueOpen) setIsQueueOpen(false);
        if (isWallpaperModalOpen) setIsWallpaperModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext, onPrev, onPlayPause, onSeek, currentTime, duration, volume, onVolumeChange, onOpenLyrics, isQueueOpen, isWallpaperModalOpen]);

  // Wheel navigation (debounced)
  const lastWheelTime = useRef(0);
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 280) return;
    if (Math.abs(e.deltaX) > 20 || Math.abs(e.deltaY) > 20) {
      lastWheelTime.current = now;
      if (e.deltaX > 20 || e.deltaY > 20) {
        onNext();
      } else {
        onPrev();
      }
    }
  };

  // Touch swipe navigation for mobile
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        onPrev();
      } else {
        onNext();
      }
    }
    touchStartX.current = null;
  };

  // Safe active queue
  const activeQueue = queue && queue.length > 0 ? queue : (track ? [track] : []);

  // Safe current playback metadata
  const currentTitle = track?.title || (activeQueue[queueIndex]?.title ?? 'Timeless');
  const currentArtist = track?.artist || (activeQueue[queueIndex]?.artist ?? 'The Weeknd');
  const currentArtwork = track?.thumbnail 
    ? getOptimizedArtwork(track.thumbnail, isDataSaver) 
    : getOptimizedArtwork(activeQueue[queueIndex]?.thumbnail, isDataSaver);

  // Compute wrapped offsets for continuous 3D shelf
  const N = activeQueue.length;
  const visibleCards = useMemo(() => {
    return activeQueue.map((item, idx) => {
      let offset = idx - queueIndex;
      if (N >= 5) {
        offset = ((offset % N) + N) % N;
        if (offset > N / 2) offset -= N;
      }
      return { item, idx, offset };
    }).filter(({ offset }) => Math.abs(offset) <= 3);
  }, [activeQueue, queueIndex, N]);

  // Preload nearby carousel artwork (disabled when Data Saver is active to save mobile data)
  useEffect(() => {
    if (isDataSaver) return;
    visibleCards.forEach(({ item }) => {
      const url = getOptimizedArtwork(item.thumbnail, false);
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [visibleCards, isDataSaver]);

  // Synchronized Lyrics Calculation using shared chronological engine
  const validLyrics = useMemo(() => {
    return getChronologicalLyrics(lyrics);
  }, [lyrics]);

  // Shared active line index calculation (synchronized with Ghost Mode)
  const activeIndex = useMemo(() => {
    return findActiveLyricIndex(validLyrics, currentTime);
  }, [currentTime, validLyrics]);

  // Dynamic sliding window of ~4 lines centered around playback position
  const previewWindow = useMemo(() => {
    if (validLyrics.length === 0) return [];

    if (activeIndex === -1) {
      // Intro state: show the opening lines (up to 4) ready for playback
      return validLyrics.slice(0, 4).map((line, idx) => ({
        ...line,
        originalIndex: idx,
        state: idx === 0 ? ('opening' as const) : ('upcoming' as const),
      }));
    }

    // Centered window around active line (1 previous, 1 active, 2 upcoming)
    let start = activeIndex - 1;
    let end = activeIndex + 2;

    if (start < 0) {
      start = 0;
      end = Math.min(validLyrics.length - 1, 3);
    } else if (end >= validLyrics.length) {
      end = validLyrics.length - 1;
      start = Math.max(0, end - 3);
    }

    const items = [];
    for (let i = start; i <= end; i++) {
      let state: 'previous' | 'active' | 'upcoming';
      if (i < activeIndex) {
        state = 'previous';
      } else if (i === activeIndex) {
        state = 'active';
      } else {
        state = 'upcoming';
      }
      items.push({
        ...validLyrics[i],
        originalIndex: i,
        state,
      });
    }
    return items;
  }, [validLyrics, activeIndex]);

  return (
    <div
      id="desktop-player-canvas"
      className="w-full h-screen h-[100vh] bg-transparent text-white flex flex-col justify-between overflow-hidden relative font-['Inter',sans-serif] select-none"
    >
      {/* =========================================================================
          TOP EDITORIAL NAVIGATION BAR: Brand Wordmark, Tabs, Search & Quick Actions
         ========================================================================= */}
      <header className="titlebar-drag-region relative z-30 w-full pl-6 sm:pl-10 pr-6 sm:pr-36 md:pr-40 pt-3.5 pb-2.5 flex items-center justify-between pointer-events-auto flex-shrink-0 bg-[#09090b]/90 backdrop-blur-md border-b border-white/[0.04]">
        {/* Left: Sidebar Toggle, Brand Wordmark & Primary Tabs */}
        <div className="flex items-center gap-4 sm:gap-6">
          {/* Sidebar Collapse / Expand Toggle Button */}
          <div className="titlebar-no-drag hidden md:flex items-center">
            <button
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              title={isSidebarCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-[#e0536c]" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-zinc-400" />
              )}
            </button>
          </div>

          {/* Brand Wordmark (Editorial Serif, Bold, Warm-White) */}
          <div className="flex items-center gap-3 titlebar-no-drag">
            <button
              onClick={handleGoHome}
              className="flex items-center select-none py-1 group outline-none focus-visible:ring-1 focus-visible:ring-white/30 rounded touch-manipulation cursor-pointer"
              title="Ghosttunes Home"
              aria-label="Ghosttunes Home"
            >
              <span className="text-[20px] sm:text-[23px] font-serif font-bold tracking-tight text-white group-hover:text-zinc-200 transition-colors">
                Ghosttunes
              </span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-1.5 titlebar-no-drag">
            <button
              onClick={handleGoHome}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'home'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Home"
              aria-label="Home"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            <button
              onClick={() => onViewChange('explore')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'explore'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Explore & Search"
              aria-label="Explore & Search"
            >
              <span>Explore</span>
            </button>

            <button
              onClick={() => onViewChange('library')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'library'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Your Library"
              aria-label="Your Library"
            >
              <span>Library</span>
            </button>

            <button
              onClick={() => onViewChange('favorites')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'favorites'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Favourites"
              aria-label="Favourites"
            >
              <Heart className={`w-3.5 h-3.5 ${currentView === 'favorites' ? 'fill-rose-500 text-rose-500' : ''}`} />
              <span>Favourites</span>
            </button>

            <button
              onClick={() => onViewChange('downloads')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'downloads'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Downloads & Offline Library"
              aria-label="Downloads & Offline Library"
            >
              <Download className="w-3.5 h-3.5 text-zinc-300" />
              <span>Downloads</span>
              {isOfflineMode && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#9e2a40]" title="Offline Mode" />
              )}
            </button>

            <button
              onClick={() => onViewChange('memory')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                currentView === 'memory'
                  ? 'text-white font-semibold bg-white/10 shadow-sm'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
              title="Listening Stats & History"
              aria-label="Stats"
            >
              <BarChart3 className="w-3.5 h-3.5 text-zinc-300" />
              <span>Stats</span>
            </button>
          </nav>
        </div>

        {/* Center: Integrated Top Search Bar */}
        <div className="flex-1 max-w-sm sm:max-w-md mx-4 hidden md:block titlebar-no-drag">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) {
                onViewChange('explore');
              }
            }} 
            className="relative w-full"
          >
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                if (currentView !== 'explore') {
                  onViewChange('explore');
                }
              }}
              placeholder="Search songs, artists, albums..."
              className="w-full bg-[#141417] hover:bg-[#18181c] focus:bg-[#151518] border border-white/10 focus:border-white/30 rounded-full pl-9 pr-9 py-1.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* Right: Primary Creative Tools & Consolidated Studio Utilities */}
        <div className="flex items-center gap-2 titlebar-no-drag">
          {onOpenAudioLab && (
            <button
              onClick={onOpenAudioLab}
              className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-[#9e2a40]/60 flex items-center justify-center text-zinc-400 hover:text-[#e0536c] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer"
              title="Audio Lab: 10-Band EQ & Limiter"
              aria-label="Audio Lab"
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          {onToggleFloatingWidget && (
            <button
              onClick={onToggleFloatingWidget}
              className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30 touch-manipulation cursor-pointer active:scale-95 ${
                isWidgetActive 
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' 
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-400 hover:text-white'
              }`}
              title={isWidgetActive ? "Close Floating Widget" : "Open Floating Mini-Player Widget"}
              aria-label="Floating Mini-Player Widget"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Consolidated Studio Utilities Menu */}
          <div className="relative">
            <button
              onClick={() => setIsStudioMenuOpen(!isStudioMenuOpen)}
              className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 flex items-center justify-center text-zinc-400 hover:text-white transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer"
              title="Studio Utilities"
              aria-label="Studio Utilities"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isStudioMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-52 rounded-xl bg-[#141418] border border-white/10 shadow-2xl p-1 z-50 space-y-0.5 animate-fade-in"
                onMouseLeave={() => setIsStudioMenuOpen(false)}
              >
                {onOpenListeningRoom && (
                  <button
                    onClick={() => { setIsStudioMenuOpen(false); onOpenListeningRoom(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                    title="Listening Rooms: Synchronized Audio"
                    aria-label="Listening Rooms"
                  >
                    <Radio className="w-4 h-4 text-[#e0536c]" />
                    <span>Listening Rooms</span>
                  </button>
                )}

                {onOpenAppearanceModal && (
                  <button
                    onClick={() => { setIsStudioMenuOpen(false); onOpenAppearanceModal(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                    title="Appearance & Adaptive Lighting Settings"
                    aria-label="Appearance & Adaptive Lighting"
                  >
                    <Sparkles className="w-4 h-4 text-[#e0536c]" />
                    <span>Appearance & Lighting</span>
                  </button>
                )}

                <button
                  onClick={() => { setIsStudioMenuOpen(false); setIsWallpaperModalOpen(true); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                  title="Ambient Wallpaper"
                  aria-label="Ambient Wallpaper"
                >
                  <WallpaperIcon className="w-4 h-4 text-zinc-400" />
                  <span>Ambient Wallpaper</span>
                </button>

                {onOpenDataSaver && (
                  <button
                    onClick={() => { setIsStudioMenuOpen(false); onOpenDataSaver(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                    title="Data Saver Settings"
                    aria-label="Data Saver Settings"
                  >
                    <Zap className={`w-4 h-4 ${isDataSaver ? 'text-emerald-400' : 'text-zinc-400'}`} />
                    <span>Data Saver {isDataSaver ? '(Active)' : ''}</span>
                  </button>
                )}

                <div className="border-t border-white/[0.06] my-1" />

                {onOpenBackupModal && (
                  <button
                    onClick={() => { setIsStudioMenuOpen(false); onOpenBackupModal(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                    title="Backup & Restore Library"
                    aria-label="Backup and Restore Library"
                  >
                    <FolderSync className="w-4 h-4 text-zinc-400" />
                    <span>Backup & Restore</span>
                  </button>
                )}

                {onOpenAbout && (
                  <button
                    onClick={() => { setIsStudioMenuOpen(false); onOpenAbout(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                    title="About Ghosttunes"
                    aria-label="About Ghosttunes"
                  >
                    <Info className="w-4 h-4 text-[#e0536c]" />
                    <span>About Ghosttunes</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Search Bar Row (Shown when screen is below md) */}
      <div className="w-full px-6 pb-2 block md:hidden">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              onViewChange('explore');
            }
          }} 
          className="relative w-full"
        >
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (currentView !== 'explore') {
                onViewChange('explore');
              }
            }}
            placeholder="Search songs, artists, albums..."
            className="w-full bg-[#141417] hover:bg-[#18181c] border border-white/10 rounded-full pl-9 pr-9 py-1.5 text-xs text-white placeholder-zinc-500 outline-none transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-white transition-colors"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* =========================================================================
          MIDDLE CONTENT REGION: Left Sidebar Panel + Active View Content
         ========================================================================= */}
      <div className="flex-1 w-full min-h-0 flex flex-row overflow-hidden relative">
        {/* Left Secondary Panel / Sidebar */}
        <aside 
          className={`h-full bg-[#08080a] border-r border-white/[0.04] hidden md:flex flex-col justify-between flex-shrink-0 select-none overflow-y-auto scrollbar-none z-20 transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'w-16 p-2' : 'w-56 xl:w-60 p-3.5'
          }`}
        >
          {isSidebarCollapsed ? (
            /* COLLAPSED ICON-ONLY SIDEBAR (w-16) */
            <div className="h-full flex flex-col justify-between items-center py-1">
              <div className="w-full flex flex-col items-center space-y-2">
                {/* Home */}
                <button
                  onClick={handleGoHome}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'home'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Home"
                >
                  {currentView === 'home' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <Home className={`w-4 h-4 ${currentView === 'home' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                </button>

                {/* Explore */}
                <button
                  onClick={() => onViewChange('explore')}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'explore'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Explore & Search"
                >
                  {currentView === 'explore' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <Compass className={`w-4 h-4 ${currentView === 'explore' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                </button>

                {/* Library */}
                <button
                  onClick={() => onViewChange('library')}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'library'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Your Library"
                >
                  {currentView === 'library' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <ListMusic className={`w-4 h-4 ${currentView === 'library' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                </button>

                {/* Favourites */}
                <button
                  onClick={() => onViewChange('favorites')}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'favorites'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Favourites"
                >
                  {currentView === 'favorites' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <Heart className={`w-4 h-4 ${currentView === 'favorites' ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
                </button>

                {/* Downloads */}
                <button
                  onClick={() => onViewChange('downloads')}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'downloads'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Downloads & Offline Library"
                >
                  {currentView === 'downloads' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <Download className={`w-4 h-4 ${currentView === 'downloads' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                </button>

                {/* Stats */}
                <button
                  onClick={() => onViewChange('memory')}
                  className={`w-10 h-10 relative flex items-center justify-center rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    currentView === 'memory'
                      ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Listening Stats & History"
                >
                  {currentView === 'memory' && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                  )}
                  <BarChart3 className={`w-4 h-4 ${currentView === 'memory' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                </button>

                {/* Divider */}
                <div className="w-8 h-px bg-white/[0.06] my-2" />

                {/* Playlist Avatars in Collapsed Mode */}
                <div className="space-y-2 flex flex-col items-center">
                  {sidebarPlaylists.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (onCreateNewPlaylist) onCreateNewPlaylist();
                        else if (onOpenImportModal) onOpenImportModal();
                      }}
                      className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-[#9e2a40]/20 border border-dashed border-white/20 hover:border-[#9e2a40] text-zinc-400 hover:text-[#e0536c] flex items-center justify-center transition-colors cursor-pointer"
                      title="Create or Import Playlist"
                      aria-label="Create or Import Playlist"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  ) : (
                    sidebarPlaylists.slice(0, 6).map((pl: any) => {
                      const isSelected = selectedPlaylistId === pl.id && currentView === 'library';
                      return (
                        <button
                          key={pl.id}
                          onClick={() => {
                            onSelectPlaylist?.(pl.id);
                            onViewChange('library');
                          }}
                          className={`w-8 h-8 rounded-lg overflow-hidden bg-zinc-800 border transition-colors cursor-pointer flex-shrink-0 ${
                            isSelected
                              ? 'border-[#e0536c] ring-1 ring-[#e0536c]'
                              : 'border-white/10 hover:border-[#9e2a40]/60'
                          }`}
                          title={pl.name}
                        >
                          {pl.cover_url ? (
                            <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-gradient-to-tr from-zinc-900 to-zinc-800">
                              <Disc3 className="w-4 h-4 text-zinc-400" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {onOpenAbout && (
                <button
                  onClick={onOpenAbout}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer mt-2"
                  title="About Ghosttunes"
                  aria-label="About Ghosttunes"
                >
                  <Info className="w-4 h-4 text-zinc-400 hover:text-[#e0536c]" />
                </button>
              )}

              {/* Expand Toggle at Bottom of Collapsed Mode */}
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer mt-4"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4 text-[#e0536c]" />
              </button>
            </div>
          ) : (
            /* EXPANDED FULL SIDEBAR (w-56 / w-60) */
            <div className="space-y-6">
              {/* BROWSE */}
              <div>
                <div className="text-[11px] font-mono tracking-wider text-zinc-500 uppercase px-3 pb-2 select-none">
                  Browse
                </div>
                <div className="space-y-1">
                  {/* Home */}
                  <button
                    onClick={handleGoHome}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'home'
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Home"
                  >
                    {currentView === 'home' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <Home className={`w-4 h-4 ${currentView === 'home' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                    <span>Home</span>
                  </button>

                  {/* Explore */}
                  <button
                    onClick={() => onViewChange('explore')}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'explore'
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Explore & Search"
                  >
                    {currentView === 'explore' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <Compass className={`w-4 h-4 ${currentView === 'explore' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                    <span>Explore</span>
                  </button>

                  {/* Library */}
                  <button
                    onClick={() => {
                      onSelectPlaylist?.(null);
                      onViewChange('library');
                    }}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'library' && !selectedPlaylistId
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Your Library"
                  >
                    {currentView === 'library' && !selectedPlaylistId && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <ListMusic className={`w-4 h-4 ${currentView === 'library' && !selectedPlaylistId ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                    <span>Library</span>
                  </button>

                  {/* Favourites */}
                  <button
                    onClick={() => onViewChange('favorites')}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'favorites'
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Favourites"
                  >
                    {currentView === 'favorites' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <Heart className={`w-4 h-4 ${currentView === 'favorites' ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
                    <span>Favourites</span>
                  </button>

                  {/* Downloads */}
                  <button
                    onClick={() => onViewChange('downloads')}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'downloads'
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Downloads & Offline Library"
                  >
                    {currentView === 'downloads' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <Download className={`w-4 h-4 ${currentView === 'downloads' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                    <span>Downloads</span>
                  </button>

                  {/* Stats */}
                  <button
                    onClick={() => onViewChange('memory')}
                    className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer text-left ${
                      currentView === 'memory'
                        ? 'bg-[#9e2a40]/15 text-[#e0536c]'
                        : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                    title="Listening Stats & History"
                  >
                    {currentView === 'memory' && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#9e2a40] rounded-r" />
                    )}
                    <BarChart3 className={`w-4 h-4 ${currentView === 'memory' ? 'text-[#e0536c]' : 'text-zinc-400'}`} />
                    <span>Stats</span>
                  </button>
                </div>
              </div>

              {/* PLAYLISTS WITH EXPANDABLE SUB-DESTINATIONS */}
              <div>
                <div className="flex items-center justify-between px-3 pb-2 select-none">
                  <span className="text-[11px] font-mono tracking-wider text-zinc-500 uppercase">
                    Playlists
                  </span>
                  <button
                    onClick={() => {
                      if (onCreateNewPlaylist) {
                        onCreateNewPlaylist();
                      } else if (onOpenImportModal) {
                        onOpenImportModal();
                      }
                    }}
                    className="p-1 hover:text-white text-zinc-500 rounded transition-colors cursor-pointer"
                    title="Create Playlist"
                    aria-label="Create Playlist"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {sidebarPlaylists.length === 0 ? (
                  <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5 text-center">
                    <p className="text-xs text-zinc-400 font-medium mb-1">No playlists yet</p>
                    <p className="text-[11px] text-zinc-500 mb-3">Create or import a playlist to start organizing your library.</p>
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (onCreateNewPlaylist) onCreateNewPlaylist();
                          else if (onOpenImportModal) onOpenImportModal();
                        }}
                        className="w-full py-1.5 px-2 rounded-lg bg-[#9e2a40]/20 hover:bg-[#9e2a40]/30 text-[#e0536c] text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Create Playlist</span>
                      </button>
                      {onOpenImportModal && (
                        <button
                          type="button"
                          onClick={onOpenImportModal}
                          className="w-full py-1.5 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3 h-3" />
                          <span>Import Playlist</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {sidebarPlaylists.map((pl: any) => {
                      const isPlExpanded = expandedPlaylistIds.has(pl.id);
                      const isSelected = selectedPlaylistId === pl.id && currentView === 'library';
                      return (
                        <div key={pl.id} className="space-y-0.5">
                          <div
                            onClick={() => {
                              onSelectPlaylist?.(pl.id);
                              onViewChange('library');
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-pointer group select-none ${
                              isSelected
                                ? 'bg-[#9e2a40]/20 text-[#e0536c]'
                                : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                            }`}
                            title={pl.name}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-5 h-5 rounded-md overflow-hidden bg-zinc-800 border border-white/5 flex-shrink-0">
                                {pl.cover_url ? (
                                  <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-500 bg-gradient-to-tr from-zinc-900 to-zinc-800">
                                    <Disc3 className="w-3 h-3 text-zinc-400" />
                                  </div>
                                )}
                              </div>
                              <span className={`truncate font-medium ${isSelected ? 'text-[#e0536c]' : 'group-hover:text-zinc-200'}`}>
                                {pl.name}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => togglePlaylistExpansion(pl.id, e)}
                              className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-white transition-colors cursor-pointer flex-shrink-0"
                              title={isPlExpanded ? "Collapse sub-destinations" : "Expand sub-destinations"}
                              aria-label="Toggle playlist sub-destinations"
                            >
                              {isPlExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                              )}
                            </button>
                          </div>

                          {/* Expandable Child Sub-destinations */}
                          {isPlExpanded && (
                            <div className="pl-6 pr-2 py-0.5 space-y-0.5 border-l border-white/[0.06] ml-4 animate-in fade-in duration-150">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectPlaylist?.(pl.id);
                                  onViewChange('library');
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-[#e0536c] hover:bg-white/[0.03] transition-colors text-left cursor-pointer group"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-[#e0536c] transition-colors" />
                                <span>All Tracks ({pl.tracks?.length || 0})</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectPlaylist?.(pl.id);
                                  onViewChange('library');
                                }}
                                className="w-full flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-[#e0536c] hover:bg-white/[0.03] transition-colors text-left cursor-pointer group"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 group-hover:bg-[#e0536c] transition-colors" />
                                <span>Recently Added</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Setting: Auto-collapse on play & Collapse action */}
              <div className="pt-4 border-t border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between px-2 text-[11px] text-zinc-400">
                  <span className="truncate select-none">Auto-collapse on play</span>
                  <button
                    onClick={() => setAutoCollapseOnPlay(!autoCollapseOnPlay)}
                    className={`w-7 h-4 rounded-full transition-colors relative cursor-pointer outline-none ${
                      autoCollapseOnPlay ? 'bg-[#9e2a40]' : 'bg-zinc-700'
                    }`}
                    title={autoCollapseOnPlay ? 'Auto-collapse is ON' : 'Auto-collapse is OFF'}
                    aria-label="Toggle auto-collapse on play"
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                        autoCollapseOnPlay ? 'left-3.5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {onOpenAbout && (
                  <button
                    onClick={onOpenAbout}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[11px] text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer text-left mb-1"
                    title="About Ghosttunes"
                  >
                    <Info className="w-3.5 h-3.5 text-[#e0536c]" />
                    <span>About Ghosttunes</span>
                  </button>
                )}

                <button
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-colors cursor-pointer text-left"
                  title="Collapse sidebar (Ctrl+B)"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                  <span>Collapse Sidebar</span>
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content Area beside Sidebar */}
        <div className="flex-1 min-w-0 h-full flex flex-col overflow-y-auto relative">
          {currentView === 'home' ? (
        <div className="flex-1 w-full min-h-0 flex flex-col lg:flex-row items-center justify-between relative overflow-hidden px-6 sm:px-10 xl:px-16 py-2 pb-24">
        
        {/* =====================================================================
            LEFT REGION (~44-46% on Desktop): The Realistic 3D Album Focus Stage
           ===================================================================== */}
        <main 
          className="w-full lg:w-[46%] xl:w-[44%] h-full flex items-center justify-center relative select-none py-2 flex-shrink-0"
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Navigation Chevron: Previous */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-0 sm:left-2 z-40 p-2 sm:p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-xl border border-white/10 transition-all hover:scale-110 active:scale-95 shadow-xl group focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
            title="Previous track"
            aria-label="Previous track"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* 3D Perspective Stage Container */}
          <div 
            className="relative w-full max-w-lg h-[320px] sm:h-[350px] md:h-[380px] xl:h-[400px] flex items-center justify-center"
            style={{
              perspective: '1200px',
              perspectiveOrigin: '50% 50%',
              transformStyle: 'preserve-3d'
            }}
          >
            {visibleCards.map(({ item, idx, offset }) => {
              const absOffset = Math.abs(offset);
              const sign = Math.sign(offset);
              const isCenter = absOffset === 0;
              const isHovered = hoveredIdx === idx;

              // Balanced 3D perspective spacing keeping carousel contained inside its left column
              let translateX = 0;
              let translateZ = 0;
              let rotateY = 0;
              let scale = 1;
              let opacity = 1;
              let filter = 'none';
              let zIndex = 50;

              if (absOffset === 0) {
                translateX = 0;
                translateZ = 35;
                rotateY = 0;
                scale = 1.0;
                opacity = 1.0;
                filter = 'none'; // Selected artwork is NEVER blurred!
                zIndex = 50;
              } else if (absOffset === 1) {
                translateX = sign * 135;
                translateZ = -45;
                rotateY = -sign * 22;
                scale = 0.84;
                opacity = 0.60;
                filter = 'blur(2px) brightness(0.75)';
                zIndex = 40;
              } else if (absOffset === 2) {
                translateX = sign * 215;
                translateZ = -95;
                rotateY = -sign * 32;
                scale = 0.70;
                opacity = 0.28;
                filter = 'blur(4px) brightness(0.50)';
                zIndex = 30;
              } else if (absOffset === 3) {
                translateX = sign * 275;
                translateZ = -145;
                rotateY = -sign * 40;
                scale = 0.58;
                opacity = 0.12;
                filter = 'blur(6px) brightness(0.35)';
                zIndex = 20;
              }

              // Interactive Hover Elevation for background cards
              if (isHovered && !isCenter) {
                scale += 0.04;
                opacity += 0.18;
                filter = 'blur(0.5px) brightness(0.92)';
                zIndex += 10;
              }

              const artwork = isDataSaver
                ? (isCenter ? getOptimizedArtwork(item.thumbnail, true) : getThumbnailArtwork(item.thumbnail))
                : getHighResArtwork(item.thumbnail);

              return (
                <div
                  key={`shelf-${item.id}-${idx}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${item.title} by ${item.artist}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isCenter) {
                      onPlayPause();
                    } else {
                      onPlayTrack(item, activeQueue);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isCenter) onPlayPause();
                      else onPlayTrack(item, activeQueue);
                    }
                  }}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className="absolute cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] select-none pointer-events-auto group focus-visible:ring-1 focus-visible:ring-white/25 focus-visible:rounded-2xl outline-none"
                  style={{
                    transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                    zIndex,
                    opacity,
                    filter,
                    transformStyle: 'preserve-3d',
                    WebkitBoxReflect: isCenter 
                      ? 'below 8px linear-gradient(to bottom, transparent 65%, rgba(0,0,0,0.3) 100%)' 
                      : 'below 6px linear-gradient(to bottom, transparent 75%, rgba(0,0,0,0.18) 100%)'
                  }}
                >
                  {/* Plaque / Album Card with Edge-to-Edge Artwork and Separate Info Section */}
                  <div 
                    className={`w-[230px] sm:w-[260px] md:w-[285px] xl:w-[310px] rounded-2xl flex flex-col p-2.5 transition-all duration-300 ${
                      isCenter
                        ? 'bg-[#121217]/90 border border-white/15 shadow-[0_22px_55px_rgba(0,0,0,0.88)] ring-1 ring-white/10'
                        : 'bg-[#0f0f13]/80 border border-white/[0.08] shadow-[0_12px_30px_rgba(0,0,0,0.7)] hover:border-white/20'
                    }`}
                  >
                    {/* 1. Square Artwork Container (Edge-to-Edge, Consistent Square, No Black Bars, Object-fit Cover) */}
                    <div className="w-full aspect-square rounded-xl overflow-hidden bg-black relative shadow-inner">
                      <img
                        src={artwork}
                        alt={item.title}
                        loading={isCenter ? 'eager' : 'lazy'}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (!img.src.includes('ytimg.com')) {
                            img.src = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
                          }
                        }}
                      />

                      {/* Hover Play Button Overlay for Background Cards */}
                      {!isCenter && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                            <Play className="w-4.5 h-4.5 fill-black text-black ml-0.5" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Separate, Compact Information Section BELOW Artwork (No Overlay Text or PLAYING Badge) */}
                    <div className="w-full mt-2.5 px-1 flex items-center justify-between">
                      <div className="min-w-0 flex-1 mr-2 text-left">
                        <h3 
                          title={`${item.title} by ${item.artist}`}
                          className="text-xs sm:text-[13px] font-semibold text-white truncate leading-tight tracking-tight"
                        >
                          {item.title}
                        </h3>
                        <p 
                          title={item.artist}
                          onClick={(e) => {
                            if (onOpenArtist && item.artist) {
                              e.stopPropagation();
                              onOpenArtist(item.artist);
                            }
                          }}
                          className={`text-[11px] text-zinc-400 truncate mt-0.5 font-normal ${
                            onOpenArtist && item.artist ? 'hover:text-white hover:underline cursor-pointer' : ''
                          }`}
                        >
                          {item.artist}
                        </p>
                      </div>

                      {/* Favorite & Options (Neutral, Restrained, No Bright Cyan) */}
                      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (isCenter) onToggleLike();
                          }}
                          className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
                          title={isCenter && isLiked ? 'Favourited' : 'Add to Favourites'}
                          aria-label="Add to Favourites"
                        >
                          <Heart 
                            className={`w-3.5 h-3.5 transition-colors ${
                              isCenter && isLiked 
                                ? 'fill-rose-500/85 text-rose-500/85' 
                                : 'text-zinc-500 hover:text-zinc-200'
                            }`} 
                          />
                        </button>
                        <button
                          onClick={() => onOpenExplore?.('library')}
                          className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
                          title="More options"
                          aria-label="More options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                  </div>

                  {/* Ground Shadow for floor perspective */}
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-[85%] h-5 bg-black/90 blur-xl rounded-full pointer-events-none" />
                </div>
              );
            })}
          </div>

          {/* Navigation Chevron: Next */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-0 sm:right-2 z-40 p-2 sm:p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-xl border border-white/10 transition-all hover:scale-110 active:scale-95 shadow-xl group focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
            title="Next track"
            aria-label="Next track"
          >
            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </main>

        {/* =====================================================================
            RIGHT REGION (~46-48% on Desktop): Dedicated Properly Contained Lyrics Stage
            Refined Typography (Inter / Manrope clean sans-serif, bold active, medium grey upcoming)
           ===================================================================== */}
        <aside 
          role="region"
          aria-label="Lyrics preview"
          className="flex w-full lg:w-[48%] xl:w-[46%] h-auto lg:h-full min-h-0 flex-col justify-center items-start px-4 lg:pl-10 xl:pl-16 pr-4 sm:pr-8 relative z-20 select-none ml-auto my-auto font-serif"
        >
          {/* Centered Floating Lyrics Stage with Snug Spacing Aligned Vertically with Album Card */}
          <div 
            className="flex flex-col items-start justify-center space-y-2.5 text-left w-full min-w-0"
            style={{ maxWidth: 'min(42vw, 560px)' }}
          >
            {loadingLyrics ? (
              <div className="flex items-center gap-3 text-white/50 py-6">
                <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
                <span className="font-serif font-medium text-sm text-zinc-400">Synchronizing lyrics...</span>
              </div>
            ) : lyricsFormat === 'synced' && validLyrics.length > 0 ? (
              <div className="space-y-1 w-full text-left">
                {previewWindow.map((item) => {
                  if (item.state === 'active') {
                    return (
                      <div 
                        key={`active-lyric-${item.originalIndex}-${item.time}`}
                        className="animate-lyric-rise w-full min-w-0 flex flex-col items-start justify-start my-1"
                      >
                        <p 
                          onClick={onOpenLyrics}
                          className="font-serif font-semibold text-[clamp(1.65rem,2.35vw,2.4rem)] leading-[1.22] text-white tracking-[-0.015em] drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)] break-words cursor-pointer select-none transition-all duration-300 text-left"
                          style={{ 
                            overflowWrap: 'break-word',
                            fontFamily: '"Playfair Display", Georgia, serif',
                            color: '#ffffff',
                            textShadow: '0 2px 14px rgba(0, 0, 0, 0.85)'
                          }}
                          title="Click to open fullscreen lyrics"
                        >
                          {item.text}
                        </p>
                      </div>
                    );
                  }

                  if (item.state === 'opening') {
                    return (
                      <div
                        key={`opening-lyric-${item.originalIndex}-${item.time}`}
                        className="w-full min-w-0 flex justify-start my-1"
                      >
                        <p 
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeek(item.time);
                          }}
                          className="font-serif font-medium text-[clamp(1.4rem,1.9vw,2.0rem)] leading-[1.25] text-white/85 hover:text-white tracking-[-0.015em] break-words cursor-pointer select-none transition-colors duration-200 text-left w-full"
                          style={{ 
                            overflowWrap: 'break-word',
                            fontFamily: '"Playfair Display", Georgia, serif'
                          }}
                          title={`Seek to start of vocals: ${item.text}`}
                        >
                          {item.text}
                        </p>
                      </div>
                    );
                  }

                  if (item.state === 'previous') {
                    return (
                      <p 
                        key={`prev-lyric-${item.originalIndex}-${item.time}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(item.time);
                        }}
                        className="font-serif font-normal text-[clamp(1.05rem,1.35vw,1.35rem)] leading-snug text-white/55 hover:text-white/80 transition-colors duration-200 cursor-pointer select-none text-left break-words w-full tracking-[-0.01em] my-1"
                        style={{ 
                          overflowWrap: 'break-word',
                          fontFamily: '"Playfair Display", Georgia, serif'
                        }}
                        title={`Seek to: ${item.text}`}
                      >
                        {item.text}
                      </p>
                    );
                  }

                  // Upcoming lyrics (progressive dimming)
                  const isImmediateNext = item.originalIndex === (activeIndex >= 0 ? activeIndex + 1 : 1);
                  return (
                    <p 
                      key={`next-lyric-${item.originalIndex}-${item.time}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSeek(item.time);
                      }}
                      className={`font-serif font-normal ${
                        isImmediateNext 
                          ? 'text-[clamp(1.1rem,1.45vw,1.45rem)] text-white/45 hover:text-white/70' 
                          : 'text-[clamp(0.95rem,1.25vw,1.25rem)] text-white/25 hover:text-white/50'
                      } leading-snug transition-colors duration-200 cursor-pointer select-none text-left break-words w-full tracking-[-0.01em] my-1`}
                      style={{ 
                        overflowWrap: 'break-word',
                        fontFamily: '"Playfair Display", Georgia, serif'
                      }}
                      title={`Seek to: ${item.text}`}
                    >
                      {item.text}
                    </p>
                  );
                })}
              </div>
            ) : previewStanzas && previewStanzas.length > 0 ? (
              <div 
                onClick={onOpenLyrics}
                className="w-full flex flex-col items-start space-y-3 cursor-pointer group text-left"
                title="Click to open full lyrics"
              >
                {previewStanzas.map((stanza, sIdx) => (
                  <div key={`prev-stanza-${sIdx}`} className="space-y-1.5 w-full">
                    {stanza.map((line, lIdx) => {
                      const isFirstOpeningLine = sIdx === 0 && lIdx === 0;
                      return (
                        <p 
                          key={`prev-line-${sIdx}-${lIdx}`} 
                          className={`font-serif ${
                            isFirstOpeningLine
                              ? 'font-semibold text-[clamp(1.35rem,1.85vw,1.95rem)] leading-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.8)] tracking-[-0.015em]'
                              : 'font-normal text-[clamp(1.05rem,1.35vw,1.35rem)] leading-snug text-white/50 group-hover:text-white/80 transition-colors drop-shadow-md tracking-[-0.01em]'
                          } break-words text-left w-full`}
                          style={{ 
                            overflowWrap: 'break-word',
                            fontFamily: '"Playfair Display", Georgia, serif'
                          }}
                        >
                          {line}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : isInstrumental ? (
              <div 
                onClick={onOpenLyrics}
                className="py-4 flex flex-col items-start justify-center gap-1.5 cursor-pointer text-left w-full group"
                title="Click to open full lyrics"
              >
                <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium">
                  <Music2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Instrumental</span>
                </div>
                <p className="font-serif font-semibold text-lg sm:text-xl text-zinc-200 group-hover:text-white transition-colors">
                  Instrumental Performance
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed max-w-sm">
                  This composition features no vocal lyrics.
                </p>
              </div>
            ) : (
              <div className="py-4 flex flex-col items-start justify-center gap-1 text-left w-full">
                <div className="flex items-center gap-2 text-zinc-600 text-xs font-medium">
                  <Music2 className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Lyrics</span>
                </div>
                <p className="font-['Inter','Manrope',sans-serif] font-medium text-base sm:text-lg text-zinc-400">
                  Lyrics unavailable for this track
                </p>
                {onRetryLyrics && (
                  <button
                    onClick={onRetryLyrics}
                    disabled={loadingLyrics}
                    className={`mt-1.5 text-xs transition-colors flex items-center gap-1.5 font-medium ${
                      loadingLyrics
                        ? 'text-zinc-500 cursor-not-allowed opacity-75'
                        : 'text-zinc-500 hover:text-zinc-300 cursor-pointer'
                    }`}
                  >
                    <RotateCcw className={`w-3 h-3 ${loadingLyrics ? 'animate-spin text-zinc-400' : ''}`} />
                    <span>{loadingLyrics ? 'Searching lyrics...' : 'Retry lookup'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Soft Atmospheric Per-Song Ambient Glow behind Lyrics Stage */}
        <div 
          className="absolute -top-[5%] right-0 w-[42vw] h-[42vw] max-w-[550px] max-h-[550px] rounded-full blur-[130px] pointer-events-none transition-all duration-1000 ease-out z-[1]"
          style={{
            background: activePalette.ambient,
            opacity: 0.35
          }}
        />

      </div>
      ) : currentView === 'downloads' ? (
        <DownloadsView
          isOfflineMode={!!isOfflineMode}
          onToggleOfflineMode={onToggleOfflineMode || (() => {})}
          onPlayTrack={onPlayTrack}
          currentTrackId={track?.id}
          isPlaying={isPlaying}
          onTrackDeleted={onTrackDeleted}
        />
      ) : currentView === 'memory' ? (
        <MusicMemoryView
          onBack={() => onViewChange('home')}
          onPlayTrack={onPlayTrack}
          onResumeSession={onResumeSession}
          onOpenArtist={onOpenArtist}
        />
      ) : currentView === 'artist' && artistQuery ? (
        <ArtistProfileView
          artistQuery={artistQuery}
          onBack={onBackFromArtist || (() => onViewChange('home'))}
          onPlayTrack={onPlayTrack}
          currentTrack={track}
          isPlaying={isPlaying}
          onOpenArtist={onOpenArtist || (() => {})}
          favorites={favorites}
          onToggleFavorite={onToggleLike}
          onAddToQueue={onAddToQueue}
          onOpenAddToPlaylist={onOpenAddToPlaylist}
        />
      ) : (
        <ExploreView
          searchQuery={searchQuery}
          selectedGenre={selectedGenre}
          onSelectGenre={onSelectGenre}
          searchResults={searchResults}
          genreTracks={genreTracks}
          loading={searchLoading}
          error={searchError}
          onRetry={onRetrySearch}
          currentTrack={track}
          isPlaying={isPlaying}
          favorites={favorites}
          playlists={playlists}
          history={history}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={onSelectPlaylist}
          activeTab={currentView === 'favorites' ? 'favorites' : currentView === 'library' ? 'library' : 'explore'}
          onPlayTrack={onPlayTrack}
          onTogglePlayPause={onPlayPause}
          onToggleFavorite={onToggleLike}
          onOpenAddToPlaylist={onOpenAddToPlaylist}
          onAddToQueue={onAddToQueue}
          isDataSaver={isDataSaver}
          onOpenImportModal={onOpenImportModal}
          onOpenBackupModal={onOpenBackupModal}
          onCreateNewPlaylist={onCreateNewPlaylist}
          onDeletePlaylist={onDeletePlaylist}
          onRenamePlaylist={onRenamePlaylist}
          onRemoveTrackFromPlaylist={onRemoveTrackFromPlaylist}
          downloadedTrackIds={downloadedTrackIds}
          downloadingTrackIds={downloadingTrackIds}
          downloadingPlaylistIds={downloadingPlaylistIds}
          pausedDownloadingTrackIds={pausedDownloadingTrackIds}
          pausedDownloadingPlaylistIds={pausedDownloadingPlaylistIds}
          onDownloadTrack={onDownloadTrack}
          onDownloadPlaylist={onDownloadPlaylist}
          onOpenPlaylistRescue={onOpenPlaylistRescue}
          onOpenArtist={onOpenArtist}
        />
      )}
        </div>
      </div>

      {/* =========================================================================
          FIXED BOTTOM PLAYBACK BAR: Compact, Fixed Bar with Burgundy Accents
         ========================================================================= */}
      <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#09090b]/95 backdrop-blur-2xl border-t border-white/[0.08] px-6 sm:px-10 py-2.5 flex items-center justify-between gap-4 sm:gap-6 shadow-[0_-10px_40px_rgba(0,0,0,0.8)] pointer-events-auto">
        <div className="w-full flex items-center justify-between gap-4 sm:gap-6">
          
          {/* 1. LEFT: Current Track Thumbnail, Title, Artist, and Heart Favorite */}
          <div className="flex items-center gap-3 min-w-0 sm:w-[240px] flex-shrink-0">
            <div className="w-11 h-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 shadow">
              <img
                src={currentArtwork}
                alt={currentTitle}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.includes('ytimg.com') && track?.id) {
                    img.src = `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`;
                  }
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-[13px] font-semibold text-white truncate leading-tight">
                {currentTitle}
              </p>
              <p 
                onClick={(e) => {
                  if (onOpenArtist && currentArtist && currentArtist !== 'Unknown Artist') {
                    e.stopPropagation();
                    onOpenArtist(currentArtist);
                  }
                }}
                className={`text-[11px] text-zinc-400 truncate mt-0.5 ${
                  onOpenArtist && currentArtist && currentArtist !== 'Unknown Artist'
                    ? 'hover:text-white hover:underline cursor-pointer'
                    : ''
                }`}
                title={currentArtist ? `View ${currentArtist}` : undefined}
              >
                {currentArtist}
              </p>
            </div>
            <button
              onClick={onToggleLike}
              className="p-1 rounded-full text-zinc-400 hover:text-white transition-colors flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer"
              title={isLiked ? "Remove from Favourites" : "Add to Favourites"}
              aria-label={isLiked ? "Remove from Favourites" : "Add to Favourites"}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-400 hover:text-white'}`} />
            </button>

            {track && onDownloadTrack && (
              <button
                onClick={() => onDownloadTrack(track)}
                className={`p-1 rounded-full transition-colors flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-white/30 cursor-pointer ${
                  downloadedTrackIds?.has(track.id)
                    ? 'text-emerald-400'
                    : pausedDownloadingTrackIds?.has(track.id)
                    ? 'text-[#e0536c] hover:text-[#f26d84]'
                    : downloadingTrackIds?.has(track.id)
                    ? 'text-cyan-400 hover:text-[#e0536c]'
                    : 'text-zinc-400 hover:text-white'
                }`}
                title={
                  downloadedTrackIds?.has(track.id)
                    ? 'Downloaded for offline playback'
                    : pausedDownloadingTrackIds?.has(track.id)
                    ? 'Download paused. Click to play / resume.'
                    : downloadingTrackIds?.has(track.id)
                    ? 'Downloading track. Click to pause.'
                    : 'Download song for offline playback'
                }
                aria-label="Download song"
              >
                {downloadedTrackIds?.has(track.id) ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : pausedDownloadingTrackIds?.has(track.id) ? (
                  <Play className="w-4 h-4 text-[#e0536c] fill-current" />
                ) : downloadingTrackIds?.has(track.id) ? (
                  <Pause className="w-4 h-4 text-cyan-400" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          {/* 2. CENTRE: Transport Controls & Burgundy Scrubber */}
          <div className="flex-1 w-full max-w-sm sm:max-w-md flex flex-col items-center">
            {/* Transport buttons */}
            <div className="flex items-center gap-2.5 sm:gap-4">
              {/* Shuffle Button */}
              <div className="relative group">
                <button
                  onClick={onToggleShuffle}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer ${
                    isShuffle ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={isShuffle ? 'Shuffle enabled' : 'Shuffle disabled'}
                  aria-label="Toggle Shuffle"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {isShuffle ? 'Shuffle: On' : 'Shuffle: Off'}
                </span>
              </div>

              {/* Previous Track */}
              <div className="relative group">
                <button
                  onClick={onPrev}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                  title="Previous track"
                  aria-label="Previous track"
                >
                  <SkipBack className="w-4 h-4 fill-current" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  Previous track
                </span>
              </div>

              {/* Rewind 10s */}
              <div className="relative group">
                <button
                  onClick={() => onSeek(Math.max(0, currentTime - 10))}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                  title="Rewind 10 seconds (J / ArrowLeft)"
                  aria-label="Rewind 10 seconds"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  -10s
                </span>
              </div>

              {/* Play / Pause Button (Clean White tactile button, dark icon) */}
              <div className="relative group">
                <button
                  onClick={onPlayPause}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4 fill-black text-black" />
                  ) : (
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  )}
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {isPlaying ? 'Pause' : 'Play'}
                </span>
              </div>

              {/* Forward 10s */}
              <div className="relative group">
                <button
                  onClick={() => onSeek(Math.min(duration || 100, currentTime + 10))}
                  className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-90 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                  title="Forward 10 seconds (L / ArrowRight)"
                  aria-label="Forward 10 seconds"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  +10s
                </span>
              </div>

              {/* Next Track */}
              <div className="relative group">
                <button
                  onClick={onNext}
                  className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                  title="Next track"
                  aria-label="Next track"
                >
                  <SkipForward className="w-4 h-4 fill-current" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  Next track
                </span>
              </div>

              {/* Repeat Button */}
              <div className="relative group">
                <button
                  onClick={onToggleRepeat}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer ${
                    isRepeat ? 'text-white bg-white/15' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={isRepeat === 'one' ? 'Repeat One' : isRepeat ? 'Repeat All' : 'Repeat Off'}
                  aria-label="Toggle Repeat"
                >
                  {isRepeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  {isRepeat === 'one' ? 'Repeat: One' : isRepeat ? 'Repeat: All' : 'Repeat: Off'}
                </span>
              </div>
            </div>

            {/* Scrubber row with Timestamps & Burgundy Bar */}
            <div className="w-full flex items-center gap-2 mt-1 px-1 select-none">
              <span className="text-[10px] font-mono text-zinc-400 w-8 text-right select-none">
                {formatTime(activeDisplayTime)}
              </span>
              <div 
                ref={scrubberRef}
                onPointerDown={handleScrubberPointerDown}
                onPointerMove={handleScrubberPointerMove}
                onPointerUp={handleScrubberPointerUp}
                onPointerCancel={handleScrubberPointerCancel}
                onMouseDown={handleScrubberMouseDown}
                onTouchStart={handleScrubberTouchStart}
                style={{ touchAction: 'none' }}
                className="relative flex-1 h-7 py-2.5 -my-2 flex items-center cursor-pointer group touch-none select-none"
                title="Seek / Forward track"
              >
                <div className="w-full h-1.5 group-hover:h-2 bg-[#27272a] rounded-full overflow-hidden relative transition-all duration-150">
                  <div 
                    className="h-full bg-[#9e2a40] group-hover:bg-[#b8334d] rounded-full transition-all duration-75"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div 
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(158,42,64,0.6)] border border-white/50 transition-transform duration-75 pointer-events-none ${
                    isScrubbing ? 'scale-125 ring-2 ring-[#e0536c]/60' : 'group-hover:scale-125'
                  }`}
                  style={{ left: `${progressPercent}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-zinc-400 w-8 select-none">
                {duration > 0 ? formatTime(duration) : '4:16'}
              </span>
            </div>
          </div>

          {/* 3. RIGHT: Volume, Lyrics, Fullscreen */}
          <div className="flex items-center gap-2 sm:gap-3 sm:w-[240px] justify-end flex-shrink-0">
            {/* Volume Control with Burgundy Slider */}
            <div className="hidden sm:flex items-center gap-1.5 px-1 relative group">
              <button
                onClick={onToggleMute}
                className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
                title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
                aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-14 sm:w-16 h-1 bg-[#27272a] accent-[#9e2a40] rounded-full appearance-none cursor-pointer focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
                aria-label="Volume Slider"
              />
            </div>

            {/* Vertical Divider */}
            <div className="h-6 w-px bg-white/10 mx-0.5 hidden sm:block" />

            {/* Floating Mini-Player Widget Button */}
            {onToggleFloatingWidget && (
              <div className="relative group">
                <button
                  onClick={onToggleFloatingWidget}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 outline-none cursor-pointer touch-manipulation ${
                    isWidgetActive
                      ? 'text-rose-400 bg-rose-500/15'
                      : 'text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={isWidgetActive ? "Close Floating Widget" : "Floating Mini-Player Widget (PiP)"}
                  aria-label="Floating Mini-Player Widget"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                  Floating Widget
                </span>
              </div>
            )}

            {/* Queue Button */}
            <div className="relative group">
              <button
                onClick={() => setIsQueueOpen(prev => !prev)}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 outline-none cursor-pointer ${
                  isQueueOpen ? 'text-[#e0536c] bg-[#9e2a40]/20' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
                title="Play Queue (Q)"
                aria-label="Open Queue"
              >
                <ListMusic className="w-4 h-4" />
              </button>
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                Queue (Q)
              </span>
            </div>

            {/* Lyrics Button */}
            <div className="relative group">
              <button
                onClick={onOpenLyrics}
                className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 outline-none cursor-pointer"
                title="Fullscreen Lyrics (L)"
                aria-label="Fullscreen Lyrics"
              >
                <Music2 className="w-4 h-4" />
              </button>
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                Lyrics (L)
              </span>
            </div>

            {/* Fullscreen Button */}
            <div className="relative group">
              <button
                onClick={toggleFullscreen}
                className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 outline-none cursor-pointer"
                title="Toggle Fullscreen"
                aria-label="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-900 border border-white/15 text-[10px] font-medium text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </span>
            </div>
          </div>

        </div>
      </footer>

      {/* =========================================================================
          SLIDE-OVER QUEUE DRAWER (Real upcoming tracks with instant playback)
         ========================================================================= */}
      <div
        className={`fixed top-0 bottom-20 left-0 z-50 w-[300px] sm:w-[360px] bg-black/90 backdrop-blur-3xl border-r border-white/10 p-5 transform transition-transform duration-400 ease-out flex flex-col ${
          isQueueOpen ? 'translate-x-0 shadow-[20px_0_60px_rgba(0,0,0,0.9)]' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>Up Next</span>
            </h2>
            <p className="text-[11px] text-zinc-400">
              {activeQueue.length} {activeQueue.length === 1 ? 'track' : 'tracks'} queued
            </p>
          </div>
          <button
            onClick={() => setIsQueueOpen(false)}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors focus-visible:ring-1 focus-visible:ring-white/25 outline-none cursor-pointer"
            title="Close Queue (Esc)"
            aria-label="Close Queue"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Smart Autoplay Radio Controls */}
        <div className="py-2.5 border-b border-white/10 select-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className={`w-3.5 h-3.5 ${isAutoplayEnabled ? 'text-[#e0536c]' : 'text-zinc-500'}`} />
              <div>
                <span className="text-xs font-semibold text-zinc-200">Smart Autoplay Radio</span>
                <p className="text-[10px] text-zinc-500">Auto-continue when queue ends</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleAutoplay}
              className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                isAutoplayEnabled ? 'bg-[#9e2a40]' : 'bg-zinc-800'
              }`}
              title={isAutoplayEnabled ? "Autoplay is ON" : "Autoplay is OFF"}
              aria-label="Toggle Smart Autoplay"
            >
              <span
                className={`block w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  isAutoplayEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Autoplay Mode Selector Pills */}
          {isAutoplayEnabled && (
            <div className="mt-2.5 grid grid-cols-4 gap-1 animate-in fade-in duration-200">
              {(
                [
                  { id: 'similar', label: 'Similar' },
                  { id: 'artist', label: 'Artist' },
                  { id: 'discover', label: 'Discover' },
                  { id: 'balanced', label: 'Balanced' }
                ] as const
              ).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onChangeAutoplayMode?.(m.id)}
                  className={`py-1 text-[10px] font-medium rounded-lg text-center transition-colors cursor-pointer ${
                    autoplayMode === m.id
                      ? 'bg-[#9e2a40]/30 text-[#e0536c] border border-[#9e2a40]/50'
                      : 'text-zinc-400 bg-white/[0.03] hover:bg-white/[0.08] hover:text-white border border-transparent'
                  }`}
                  title={`Mode: ${m.label}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable Song Queue List */}
        <div className="overflow-y-auto space-y-1.5 pr-1 py-3 flex-1 scrollbar-none">
          {activeQueue.map((item, idx) => {
            const isActive = idx === queueIndex;
            const thumb = getHighResArtwork(item.thumbnail);
            const isRec = item.isAutoplay;
            return (
              <div
                key={`drawer-${item.id}-${idx}`}
                onClick={() => {
                  onPlayTrack(item);
                  setIsQueueOpen(false);
                }}
                className={`group flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-all duration-200 relative ${
                  isActive
                    ? 'border-l-[3.5px] border-[#e0536c] bg-white/[0.08] backdrop-blur-xl'
                    : isRec
                    ? 'border border-dashed border-[#9e2a40]/30 bg-[#9e2a40]/5 hover:bg-[#9e2a40]/15'
                    : 'border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.07] hover:border-white/10 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="relative w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900 border border-white/10">
                  <img
                    src={thumb}
                    alt={item.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.src.includes('ytimg.com')) {
                        img.src = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
                      }
                    }}
                  />
                  {isActive && isPlaying && (
                    <div className="absolute inset-0 bg-[#9e2a40]/30 flex items-center justify-center">
                      <span className="w-2 h-2 rounded-full bg-[#e0536c] animate-pulse" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p 
                      onClick={(e) => {
                        if (onOpenArtist && item.artist) {
                          e.stopPropagation();
                          onOpenArtist(item.artist);
                        }
                      }}
                      className={`text-[11px] text-zinc-400 truncate ${
                        onOpenArtist && item.artist ? 'hover:text-white hover:underline cursor-pointer' : ''
                      }`}
                      title={item.artist ? `View ${item.artist}` : undefined}
                    >
                      {item.artist}
                    </p>
                    {isRec && item.recommendationReason && (
                      <span className="text-[9px] font-mono text-[#e0536c] bg-[#9e2a40]/20 px-1 py-0.2 rounded shrink-0">
                        {item.recommendationReason}
                      </span>
                    )}
                  </div>
                </div>

                <span className={`text-[10px] font-mono shrink-0 ${isActive ? 'text-zinc-300' : 'text-zinc-500'}`}>
                  {item.duration || '3:30'}
                </span>

                {onRemoveFromQueue && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromQueue(item.id, idx);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 text-zinc-500 hover:text-rose-400 rounded transition-all cursor-pointer ml-1"
                    title="Remove from queue"
                    aria-label="Remove from queue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          WALLPAPER SETTINGS MODAL (Now Playing Artwork / Custom / Dark Ambient)
         ========================================================================= */}
      {isWallpaperModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setIsWallpaperModalOpen(false)}
        >
          <div 
            className="w-full max-w-xl bg-zinc-900/95 border border-white/15 rounded-2xl p-6 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">Wallpaper Atmosphere</h3>
                <p className="text-xs text-zinc-400">Choose how the background reacts to your music</p>
              </div>
              <button 
                onClick={() => setIsWallpaperModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Three Wallpaper Modes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-5">
              {/* Option 1: Now Playing Artwork (Default) */}
              <button
                onClick={() => onSetWallpaperMode('artwork')}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between h-28 relative group focus-visible:ring-1 focus-visible:ring-white/25 outline-none ${
                  wallpaperMode === 'artwork'
                    ? 'border-white/40 bg-white/[0.08] ring-1 ring-white/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Disc3 className={`w-5 h-5 ${wallpaperMode === 'artwork' ? 'text-white' : 'text-zinc-400'}`} />
                  {wallpaperMode === 'artwork' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-white border border-white/15 uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Now Playing Artwork</h4>
                  <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                    Automatically follows the current song's album art with soft ambient blur
                  </p>
                </div>
              </button>

              {/* Option 2: Custom Wallpaper */}
              <button
                onClick={() => onSetWallpaperMode('custom')}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between h-28 relative group focus-visible:ring-1 focus-visible:ring-white/25 outline-none ${
                  wallpaperMode === 'custom'
                    ? 'border-white/40 bg-white/[0.08] ring-1 ring-white/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <WallpaperIcon className={`w-5 h-5 ${wallpaperMode === 'custom' ? 'text-white' : 'text-zinc-400'}`} />
                  {wallpaperMode === 'custom' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-white border border-white/15 uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Custom Wallpaper</h4>
                  <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                    Select a preset illustration or upload your own wallpaper image
                  </p>
                </div>
              </button>

              {/* Option 3: Dark Ambient */}
              <button
                onClick={() => onSetWallpaperMode('ambient')}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between h-28 relative group focus-visible:ring-1 focus-visible:ring-white/25 outline-none ${
                  wallpaperMode === 'ambient'
                    ? 'border-white/40 bg-white/[0.08] ring-1 ring-white/15'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Moon className={`w-5 h-5 ${wallpaperMode === 'ambient' ? 'text-white' : 'text-zinc-400'}`} />
                  {wallpaperMode === 'ambient' && (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-white border border-white/15 uppercase">
                      Active
                    </span>
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Dark Ambient</h4>
                  <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                    Restrained deep obsidian dark gradient without artwork
                  </p>
                </div>
              </button>
            </div>

            {/* Custom Presets Grid (Shown when Custom mode is selected) */}
            {wallpaperMode === 'custom' && (
              <div className="space-y-3 pt-2 pb-1 border-t border-white/10">
                <span className="text-xs font-semibold text-zinc-200 block">Preset Wallpapers:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {WALLPAPER_PRESETS.map((preset) => {
                    const isSelected = wallpaper === preset.id && !isCustomWallpaper;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => {
                          onSelectPreset(preset.id);
                        }}
                        className={`relative rounded-xl overflow-hidden aspect-video border text-left transition-all group focus-visible:ring-1 focus-visible:ring-white/25 outline-none ${
                          isSelected ? 'border-white/60 ring-1 ring-white/30 scale-[1.02]' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <img 
                          src={preset.file} 
                          alt={preset.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2">
                          <span className="text-[10px] font-medium text-white truncate">{preset.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upload Custom & Reset Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-white/10">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    await onUploadWallpaper(file);
                  }
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 transition-all focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Custom Image</span>
              </button>

              <button
                onClick={() => {
                  onResetWallpaper();
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-all focus-visible:ring-1 focus-visible:ring-white/25 outline-none"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Artwork Default</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
