// src/components/CinematicLyricsView.tsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LyricLine, Track } from '../types';
import { 
  X, 
  Maximize2, 
  Minimize2, 
  Loader2, 
  Music2, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Volume2, 
  VolumeX, 
  RotateCcw,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Heart,
  MoreHorizontal,
  Download,
  CheckCircle2
} from 'lucide-react';
import { getOptimizedArtwork } from '../utils/artwork';
import { getChronologicalLyrics, findActiveLyricIndex } from '../utils/lyricsParser';
import { toggleDesktopFullscreen, subscribeFullscreenChange } from '../services/desktopService';

interface Props {
  track: Track;
  prevTrack?: Track;
  nextTrack?: Track;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics: LyricLine[];
  plainLyrics?: string;
  loading: boolean;
  lyricsFormat?: 'synced' | 'plain' | 'paragraph' | 'none';
  plainStanzas?: string[][];
  isInstrumental?: boolean;
  onRetry?: () => void;
  palette?: any;
  isDataSaver?: boolean;
  volume?: number;
  isMuted?: boolean;
  onClose: () => void;
  onSeek: (time: number) => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  ghostSkin?: any;
  isLiked?: boolean;
  onToggleLike?: () => void;
  isShuffle?: boolean;
  onToggleShuffle?: () => void;
  isRepeat?: boolean | 'one';
  onToggleRepeat?: () => void;
  onDownload?: (track: Track) => void;
  isDownloaded?: boolean;
  isDownloading?: boolean;
}

export const CinematicLyricsView: React.FC<Props> = ({
  track,
  prevTrack,
  nextTrack,
  currentTime,
  duration,
  isPlaying,
  lyrics,
  plainLyrics,
  loading,
  lyricsFormat = 'synced',
  plainStanzas = [],
  isInstrumental = false,
  onRetry,
  palette,
  isDataSaver = false,
  volume = 0.8,
  isMuted = false,
  onClose,
  onSeek,
  onPlayPause,
  onNext,
  onPrev,
  onVolumeChange,
  onToggleMute,
  isLiked = false,
  onToggleLike,
  isShuffle = false,
  onToggleShuffle,
  isRepeat = false,
  onToggleRepeat,
  onDownload,
  isDownloaded = false,
  isDownloading = false
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const isProgrammaticScrollRef = useRef(false);
  const autoResumeTimeoutRef = useRef<any>(null);

  const highResThumb = getOptimizedArtwork(track?.thumbnail, isDataSaver);
  const prevThumb = prevTrack ? getOptimizedArtwork(prevTrack.thumbnail, isDataSaver) : highResThumb;
  const nextThumb = nextTrack ? getOptimizedArtwork(nextTrack.thumbnail, isDataSaver) : highResThumb;

  // Format time display
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  const calculateScrubTime = (clientX: number) => {
    if (!scrubberRef.current) return 0;
    const rect = scrubberRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * (duration || 200);
  };

  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
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
    e.stopPropagation();
    setIsScrubbing(true);
    const newTime = calculateScrubTime(e.clientX);
    setScrubTime(newTime);
  };

  const handleScrubberTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
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

  const activeDisplayTime = isScrubbing && scrubTime !== null ? scrubTime : currentTime;
  const remaining = Math.max(0, (duration || 200) - activeDisplayTime);
  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, activeDisplayTime / duration)) : 0;
  const progressPercent = progressRatio * 100;

  // Filter & sort lyrics chronologically
  const validLyrics = useMemo(() => {
    return getChronologicalLyrics(lyrics);
  }, [lyrics]);

  // Calculate active lyric index
  const activeIndex = useMemo(() => {
    return findActiveLyricIndex(validLyrics, currentTime);
  }, [currentTime, validLyrics]);

  // Smooth scroll container to visual center of active lyric
  const scrollToActiveLine = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isProgrammaticScrollRef.current = true;
    const activeEl = activeLineRef.current;

    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!activeEl) {
      container.scrollTo({
        top: 0,
        behavior: (smooth && !prefersReducedMotion) ? 'smooth' : 'auto'
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 350);
      return;
    }

    const rectEl = activeEl.getBoundingClientRect();
    const rectContainer = container.getBoundingClientRect();
    const currentScrollTop = container.scrollTop;
    const elTopRelativeToContainer = rectEl.top - rectContainer.top + currentScrollTop;
    const targetTop = elTopRelativeToContainer - (container.clientHeight / 2) + (rectEl.height / 2);

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: (smooth && !prefersReducedMotion) ? 'smooth' : 'auto'
    });

    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 400);
  }, []);

  // Auto-scroll when activeIndex changes
  useEffect(() => {
    if (!userScrolled && activeIndex >= 0) {
      const raf = requestAnimationFrame(() => {
        scrollToActiveLine(true);
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [activeIndex, userScrolled, scrollToActiveLine]);

  // Initial scroll when opening Ghost Mode or changing track
  useEffect(() => {
    setUserScrolled(false);
    const timer = setTimeout(() => {
      scrollToActiveLine(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [track?.id, scrollToActiveLine]);

  // Handle user scrolling
  const handleUserScrollGesture = () => {
    if (isProgrammaticScrollRef.current) return;
    setUserScrolled(true);

    if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    autoResumeTimeoutRef.current = setTimeout(() => {
      setUserScrolled(false);
      scrollToActiveLine(true);
    }, 4500);
  };

  const resumeAutoScroll = () => {
    setUserScrolled(false);
    scrollToActiveLine(true);
  };

  // Fullscreen toggle (supports native Electron window & HTML5 fullscreen)
  const toggleFullscreen = () => {
    toggleDesktopFullscreen().then(isFs => {
      setIsFullscreen(isFs);
    }).catch(() => {});
  };

  useEffect(() => {
    return subscribeFullscreenChange((isFs) => {
      setIsFullscreen(isFs);
    });
  }, []);

  // Auto-hide controls when idle; awake on any mouse or touch activity
  const wakeControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 6000);
  }, []);

  const handleMouseMove = () => {
    wakeControls();
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        onPlayPause?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          onNext?.();
        } else {
          onSeek(Math.min(duration || 100, currentTime + 5));
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev?.();
        } else {
          onSeek(Math.max(0, currentTime - 5));
        }
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNext?.();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        onSeek(Math.min(duration || 100, currentTime + 10));
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 10));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        onVolumeChange?.(Math.min(1, volume + 0.05));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onVolumeChange?.(Math.max(0, volume - 0.05));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTime, duration, volume, onPlayPause, onSeek, onVolumeChange, onClose]);

  return (
    <div
      id="cinematic-lyrics-canvas"
      ref={containerRef}
      onMouseMove={wakeControls}
      onTouchStart={wakeControls}
      onTouchMove={wakeControls}
      onClick={wakeControls}
      className="fixed inset-0 z-40 bg-[#08090b] text-white flex flex-col justify-between overflow-hidden select-none font-sans"
    >
      {/* =========================================================================
          BACKGROUND: Deep Charcoal Base with Subdued, Blurred Artwork Ambient
         ========================================================================= */}
      <div 
        className="absolute inset-0 bg-cover bg-center scale-110 pointer-events-none z-0 transition-all duration-1000 ease-out"
        style={{ 
          backgroundImage: `url(${highResThumb})`,
          opacity: 0.18,
          filter: 'blur(75px) brightness(0.32) saturate(1.15)'
        }}
      />

      {/* Subtle Artwork Tint Wash if palette is present */}
      {palette?.darkMuted && (
        <div 
          className="absolute inset-0 pointer-events-none z-0 opacity-15 mix-blend-color"
          style={{ backgroundColor: palette.darkMuted }}
        />
      )}

      {/* Dark Charcoal Scrim & Subtle Vignette (Eliminates excessive glows) */}
      <div className="absolute inset-0 bg-[#08090b]/80 pointer-events-none z-[1]" />
      <div 
        className="absolute inset-0 pointer-events-none z-[1]" 
        style={{
          background: 'radial-gradient(circle at center, rgba(8,9,11,0.25) 0%, rgba(8,9,11,0.85) 70%, rgba(8,9,11,0.98) 100%)'
        }}
      />

      {/* =========================================================================
          TOP BAR: Small Crisp Album Cover + Track Info (Left) & Minimal Controls (Right)
         ========================================================================= */}
      <header
        className={`relative z-20 flex items-center justify-between px-6 sm:px-10 lg:px-16 pt-7 pb-2 transition-opacity duration-300 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-30 hover:opacity-100'
        }`}
      >
        {/* Top-Left: Small, Crisp Square Album Cover with Song Title & Artist (Clean sans-serif) */}
        <div className="flex items-center gap-3 select-none min-w-0 max-w-[50vw]">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shadow-md flex-shrink-0">
            <img 
              src={highResThumb} 
              alt={track?.title} 
              className="w-full h-full object-cover select-none" 
            />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 
              title={track?.title}
              className="text-sm sm:text-base font-semibold text-white truncate tracking-tight leading-tight font-sans"
            >
              {track?.title}
            </h2>
            <p 
              title={track?.artist}
              className="text-xs font-normal text-zinc-400 truncate mt-0.5 font-sans"
            >
              {track?.artist}
            </p>
          </div>
        </div>

        {/* Top-Right: Fullscreen & Exit Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all active:scale-95 outline-none cursor-pointer touch-manipulation"
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white text-xs font-medium tracking-tight transition-all active:scale-95 outline-none cursor-pointer touch-manipulation font-sans"
            title="Exit lyrics (Esc)"
            aria-label="Exit Lyrics View"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          CENTER STAGE: Layered Album Art Carousel (Left) + Editorial Serif Lyrics (Right)
         ========================================================================= */}
      <div className="relative z-10 flex-1 w-full min-h-0 flex flex-col lg:flex-row items-center justify-center px-6 sm:px-10 lg:px-16 overflow-hidden gap-8 lg:gap-14 xl:gap-20">
        
        {/* ---------------------------------------------------------------------
            LEFT REGION: Layered Album Artwork Carousel with Card & Side Buttons
           --------------------------------------------------------------------- */}
        <div className="w-full lg:w-[46%] xl:w-[44%] flex flex-col items-center justify-center flex-shrink-0 select-none py-2 lg:py-0">
          <div className="relative flex items-center justify-center w-[340px] sm:w-[420px] lg:w-[460px] xl:w-[500px] h-[340px] sm:h-[400px] lg:h-[440px]">
            
            {/* Carousel Navigation Chevron: Left (Previous) */}
            {onPrev && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPrev();
                }}
                className="absolute -left-2 sm:-left-3 lg:-left-5 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#141518]/90 hover:bg-[#1a1b20] border border-white/10 text-white flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-xl hover:scale-105"
                title="Previous track"
                aria-label="Previous track"
              >
                <ChevronLeft className="w-5 h-5 text-zinc-300 hover:text-white" />
              </button>
            )}

            {/* Carousel Navigation Chevron: Right (Next) */}
            {onNext && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNext();
                }}
                className="absolute -right-2 sm:-right-3 lg:-right-5 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#141518]/90 hover:bg-[#1a1b20] border border-white/10 text-white flex items-center justify-center backdrop-blur-md cursor-pointer transition-all active:scale-95 shadow-xl hover:scale-105"
                title="Next track"
                aria-label="Next track"
              >
                <ChevronRight className="w-5 h-5 text-zinc-300 hover:text-white" />
              </button>
            )}

            {/* 1. Behind Left: Previous Track Cover (Tilted -6deg, scaled down, layered depth) */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                onPrev?.();
              }}
              className="absolute left-1 sm:left-3 lg:left-5 z-[1] w-48 sm:w-56 lg:w-68 h-[240px] sm:h-[280px] lg:h-[330px] rounded-2xl overflow-hidden bg-[#121316] border border-white/10 shadow-2xl opacity-35 hover:opacity-60 transition-all duration-300 cursor-pointer scale-[0.84] -rotate-6"
              title={prevTrack ? `Previous: ${prevTrack.title}` : 'Previous track'}
            >
              <img 
                src={prevThumb} 
                alt=""
                className="w-full h-full object-cover brightness-75 select-none" 
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>

            {/* 2. Behind Right: Next Track Cover (Tilted +6deg, scaled down, layered depth) */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                onNext?.();
              }}
              className="absolute right-1 sm:right-3 lg:right-5 z-[1] w-48 sm:w-56 lg:w-68 h-[240px] sm:h-[280px] lg:h-[330px] rounded-2xl overflow-hidden bg-[#121316] border border-white/10 shadow-2xl opacity-35 hover:opacity-60 transition-all duration-300 cursor-pointer scale-[0.84] rotate-6"
              title={nextTrack ? `Next: ${nextTrack.title}` : 'Next track'}
            >
              <img 
                src={nextThumb} 
                alt=""
                className="w-full h-full object-cover brightness-75 select-none" 
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>

            {/* 3. Center Front: Main Album Card (Crisp square art + card footer with Title/Artist/Like/More) */}
            <div 
              className="relative z-10 w-56 sm:w-68 lg:w-80 xl:w-88 rounded-2xl overflow-hidden bg-[#121316] border border-white/10 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.85)] flex flex-col transition-all duration-300 hover:scale-[1.01]"
            >
              {/* Artwork Container */}
              <div 
                onClick={onPlayPause}
                className="relative aspect-square w-full overflow-hidden bg-black/50 group cursor-pointer"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                <img 
                  src={highResThumb} 
                  alt={track?.title} 
                  className="w-full h-full object-cover select-none" 
                />

                {/* Play / Pause Subtle Overlay on Hover */}
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shadow-lg transition-transform group-hover:scale-105">
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    )}
                  </div>
                </div>
              </div>

              {/* Integrated Card Footer: Song Title, Artist, Heart & More Options */}
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-[#121316] border-t border-white/[0.06] flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 
                    title={track?.title}
                    className="text-sm sm:text-base font-semibold text-white truncate tracking-tight font-sans"
                  >
                    {track?.title}
                  </h3>
                  <p 
                    title={track?.artist}
                    className="text-xs text-zinc-400 truncate mt-0.5 font-sans"
                  >
                    {track?.artist}
                  </p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {onDownload && (
                    <button
                      onClick={() => onDownload(track)}
                      disabled={isDownloading}
                      className={`p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${
                        isDownloaded ? 'text-emerald-400' : isDownloading ? 'text-amber-400' : 'text-zinc-400 hover:text-white'
                      }`}
                      title={isDownloaded ? "Downloaded for offline playback" : isDownloading ? "Downloading track..." : "Download track for offline playback"}
                      aria-label="Download track"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      ) : isDownloaded ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={onToggleLike}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title={isLiked ? "Remove from Favorites" : "Add to Favorites"}
                    aria-label={isLiked ? "Remove from Favorites" : "Add to Favorites"}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : 'text-zinc-400 hover:text-zinc-200'}`} />
                  </button>
                  <button
                    onClick={onToggleLike}
                    className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title="More options"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="w-4 h-4 text-zinc-400 hover:text-white" />
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ---------------------------------------------------------------------
            RIGHT REGION: Dedicated Serif Lyrics Column (Cormorant Garamond)
           --------------------------------------------------------------------- */}
        <div className="relative flex-1 w-full h-full min-h-0 flex items-center justify-center lg:justify-start overflow-hidden pr-4 sm:pr-8 lg:pr-14">
          <div
            ref={scrollContainerRef}
            onWheel={handleUserScrollGesture}
            onTouchMove={handleUserScrollGesture}
            className="relative w-full h-full overflow-y-auto pt-[35vh] pb-[35vh] flex flex-col items-center lg:items-start text-center lg:text-left space-y-5 sm:space-y-6 scrollbar-none max-w-xl xl:max-w-2xl"
          >
            {loading ? (
              <div className="flex flex-col items-center justify-center my-auto text-zinc-400 gap-3 w-full font-sans">
                <Loader2 className="w-7 h-7 animate-spin text-white/60" />
                <p className="text-sm font-medium tracking-tight">
                  Loading lyrics...
                </p>
              </div>
            ) : lyricsFormat === 'synced' && validLyrics.length > 0 ? (
              validLyrics.map((line, idx) => {
                const isActive = idx === activeIndex;
                const distance = activeIndex >= 0 ? Math.abs(idx - activeIndex) : (idx === 0 ? 1 : idx + 1);

                let lineWrapperClass = 'py-1 transition-all duration-300 ease-out';
                let opacityStyle = 1;

                if (isActive) {
                  lineWrapperClass = 'py-3 sm:py-4 opacity-100';
                  opacityStyle = 1;
                } else if (distance === 1) {
                  opacityStyle = 0.70;
                } else if (distance === 2) {
                  opacityStyle = 0.45;
                } else if (distance === 3) {
                  opacityStyle = 0.30;
                } else {
                  opacityStyle = 0.16;
                }

                return (
                  <div
                    key={`lyric-line-${line.time}-${idx}`}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => {
                      if (typeof line.time === 'number') {
                        onSeek(line.time);
                        setUserScrolled(false);
                      }
                    }}
                    style={{ opacity: opacityStyle }}
                    className={`w-full cursor-pointer select-none group font-cormorant font-serif ${lineWrapperClass}`}
                  >
                    <p
                      className={`font-serif tracking-normal leading-[1.25] break-words max-w-xl lg:max-w-2xl transition-all duration-300 ${
                        isActive
                          ? 'text-[#fcfcfc] font-semibold sm:font-bold text-[clamp(2.1rem,3.2vw,3.35rem)]'
                          : 'text-zinc-400 font-normal text-[clamp(1.2rem,1.8vw,1.85rem)] group-hover:text-zinc-200'
                      }`}
                    >
                      {line.text}
                    </p>
                  </div>
                );
              })
            ) : (lyricsFormat === 'paragraph' || lyricsFormat === 'plain' || plainLyrics) && (plainStanzas?.length || plainLyrics) ? (
              <div className="w-full max-w-xl flex flex-col items-center lg:items-start space-y-6 my-auto py-8 text-center lg:text-left font-cormorant font-serif">
                <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-zinc-400 font-sans">
                  <Music2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Plain text lyrics • Not synchronized</span>
                </div>
                {(plainStanzas && plainStanzas.length > 0 ? plainStanzas : [plainLyrics?.split('\n').filter(Boolean) || []]).map((stanza, sIdx) => (
                  <div key={`c-stanza-${sIdx}`} className="space-y-2 w-full">
                    {stanza.map((line, lIdx) => (
                      <p
                        key={`c-line-${sIdx}-${lIdx}`}
                        className="font-serif font-normal text-[clamp(1.25rem,1.85vw,1.85rem)] leading-relaxed break-words text-zinc-300 hover:text-white transition-colors"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : isInstrumental ? (
              <div className="flex flex-col items-center lg:items-start justify-center my-auto text-white/80 gap-3 max-w-md text-center lg:text-left font-sans">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                  <Music2 className="w-6 h-6 text-zinc-300" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Instrumental Performance
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  This track features no vocal lyrics. Immerse yourself in the composition.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center lg:items-start justify-center my-auto text-zinc-400 gap-3 max-w-md text-center lg:text-left font-sans">
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                  <Music2 className="w-6 h-6 text-zinc-400" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Lyrics unavailable
                </h3>
                <p className="text-xs text-zinc-400/80 leading-relaxed">
                  No lyrics were found for this track.
                </p>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    disabled={loading}
                    className={`mt-2 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-white text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10 transition-all cursor-pointer font-sans ${
                      loading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'
                    }`}
                    title={loading ? 'Searching...' : 'Retry lyrics lookup'}
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{loading ? 'Searching...' : 'Retry Lookup'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Discreet Right Scroll Pill Indicator */}
          <div className="hidden lg:block absolute right-2 top-1/2 -translate-y-1/2 w-1 h-14 bg-white/15 rounded-full pointer-events-none" />
        </div>

      </div>

      {/* =========================================================================
          RESUME AUTO-SCROLL FLOATING PILL (Appears if user manually scrolled away)
         ========================================================================= */}
      {userScrolled && validLyrics.length > 0 && activeIndex >= 0 && (
        <div className="absolute bottom-28 left-0 right-0 z-30 flex justify-center pointer-events-auto">
          <button
            onClick={resumeAutoScroll}
            className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold shadow-2xl flex items-center gap-1.5 transition-all active:scale-95 hover:bg-zinc-200 cursor-pointer font-sans"
          >
            <span>Resume Auto-Scroll</span>
          </button>
        </div>
      )}

      {/* =========================================================================
          BOTTOM PLAYBACK BAR: Understated Floating Capsule (Matching Reference Mockup)
         ========================================================================= */}
      <footer
        className={`relative z-20 px-6 sm:px-12 pb-8 pt-2 transition-opacity duration-300 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-30 hover:opacity-100'
        }`}
      >
        <div className="max-w-xl mx-auto px-6 py-3.5 rounded-full bg-[#101114]/90 backdrop-blur-xl border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.8)] flex flex-col gap-2 font-sans">
          
          {/* Top Line: Scrubber & Timestamps */}
          <div className="flex items-center gap-3 text-xs font-mono select-none">
            {/* Elapsed Time */}
            <span className="w-10 text-right text-zinc-400 text-[11px] font-medium select-none">
              {formatTime(activeDisplayTime)}
            </span>

            {/* Scrubber Progress Bar */}
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
              title="Seek / Forward playback"
            >
              <div className="w-full h-1 group-hover:h-1.5 bg-white/20 rounded-full overflow-hidden relative transition-all duration-150">
                <div 
                  className="h-full bg-white rounded-full transition-all duration-75"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Scrubber Playhead Thumb */}
              <div 
                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-sm pointer-events-none transition-transform duration-75 ${
                  isScrubbing ? 'scale-150 ring-2 ring-white/50' : 'group-hover:scale-125'
                }`}
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            {/* Remaining Time */}
            <span className="w-10 text-left text-zinc-400 text-[11px] font-medium select-none">
              -{formatTime(remaining)}
            </span>
          </div>

          {/* Bottom Line: Playback Controls (Shuffle, Prev, Rewind 10s, Play/Pause, Forward 10s, Next, Repeat, Volume) */}
          <div className="flex items-center justify-between px-2 pt-0.5">
            {/* Left: Shuffle */}
            <button
              onClick={onToggleShuffle}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isShuffle ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title={isShuffle ? 'Shuffle enabled' : 'Shuffle disabled'}
            >
              <Shuffle className="w-3.5 h-3.5" />
            </button>

            {/* Center: Previous, Rewind 10s, Play/Pause, Forward 10s, Next */}
            <div className="flex items-center gap-2.5 sm:gap-4">
              <button
                onClick={onPrev}
                className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Previous track (P / Shift+ArrowLeft)"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>

              <button
                onClick={() => onSeek(Math.max(0, currentTime - 10))}
                className="p-1 text-zinc-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                title="Rewind 10 seconds (J / ArrowLeft)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Solid White Circular Play/Pause Button with Black Icon */}
              <button
                onClick={onPlayPause}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>

              <button
                onClick={() => onSeek(Math.min(duration || 100, currentTime + 10))}
                className="p-1 text-zinc-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                title="Forward 10 seconds (L / ArrowRight)"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onNext}
                className="p-1 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                title="Next track (N / Shift+ArrowRight)"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            </div>

            {/* Right: Repeat & Volume */}
            <div className="flex items-center gap-3">
              <button
                onClick={onToggleRepeat}
                className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                  isRepeat ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={isRepeat === 'one' ? 'Repeat One' : isRepeat ? 'Repeat All' : 'Repeat Off'}
              >
                {isRepeat === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
              </button>

              {onToggleMute && onVolumeChange && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={onToggleMute}
                    className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <div 
                    className="relative w-16 h-3 flex items-center cursor-pointer group"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                      onVolumeChange(ratio);
                    }}
                    title="Volume"
                  >
                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-white rounded-full"
                        style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                      />
                    </div>
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-white shadow-sm pointer-events-none"
                      style={{ left: `${(isMuted ? 0 : volume) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>
      </footer>

    </div>
  );
};
