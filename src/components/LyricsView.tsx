import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LyricLine, Track } from '../types';
import { 
  X, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Maximize, 
  Minimize, 
  Sparkles, 
  Film, 
  Zap, 
  CloudSun,
  Mic2,
  Volume2,
  VolumeX,
  Music2
} from 'lucide-react';

export type LyricStyle = 'cinematic' | 'kinetic' | 'dream';

interface ExtractedPalette {
  primary: string;
  secondary: string;
  glow: string;
}

interface Props {
  track: Track;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics: LyricLine[];
  plainLyrics?: string;
  loading: boolean;
  volume?: number;
  isMuted?: boolean;
  onClose: () => void;
  onSeek: (time: number) => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
}

export const LyricsView: React.FC<Props> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  lyrics,
  plainLyrics,
  loading,
  volume = 0.8,
  isMuted = false,
  onClose,
  onSeek,
  onPlayPause,
  onNext,
  onPrev,
  onVolumeChange,
  onToggleMute
}) => {
  const [style, setStyle] = useState<LyricStyle>(() => {
    try {
      const saved = localStorage.getItem('metrolist_lyric_style');
      return (saved as LyricStyle) || 'cinematic';
    } catch {
      return 'cinematic';
    }
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Dynamic color extraction & atmospheric ambient palette
  const [palette, setPalette] = useState<ExtractedPalette>({
    primary: 'rgba(244, 63, 94, 0.40)', // luminous rose
    secondary: 'rgba(168, 85, 247, 0.28)', // vibrant purple
    glow: 'rgba(244, 63, 94, 0.22)'
  });

  // Crossfade state between track artwork transitions
  const [activeArtwork, setActiveArtwork] = useState(track.thumbnail);
  const [prevArtwork, setPrevArtwork] = useState<string | null>(null);
  const [isCrossfading, setIsCrossfading] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const isProgrammaticScrollRef = useRef(false);
  const autoResumeTimeoutRef = useRef<any>(null);

  // Detect system reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Handle crossfade when track changes
  useEffect(() => {
    if (track.thumbnail && track.thumbnail !== activeArtwork) {
      setPrevArtwork(activeArtwork);
      setActiveArtwork(track.thumbnail);
      setIsCrossfading(true);
      const timer = setTimeout(() => {
        setPrevArtwork(null);
        setIsCrossfading(false);
      }, 950);
      return () => clearTimeout(timer);
    }
  }, [track.thumbnail, activeArtwork]);

  // Extract vibrant ambient palette from track thumbnail via offscreen canvas
  useEffect(() => {
    if (!track.thumbnail) return;
    let isMounted = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = track.thumbnail;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        let maxSaturation = 0;
        let vibrantR = 244, vibrantG = 63, vibrantB = 94;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const lum = (max + min) / 2;

          // Filter out near-blacks and near-whites to capture authentic album color
          if (lum > 28 && lum < 230) {
            rSum += r;
            gSum += g;
            bSum += b;
            count++;

            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat > maxSaturation) {
              maxSaturation = sat;
              vibrantR = r;
              vibrantG = g;
              vibrantB = b;
            }
          }
        }

        if (count > 0 && isMounted) {
          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);

          setPalette({
            primary: `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 0.42)`,
            secondary: `rgba(${avgR}, ${avgG}, ${avgB}, 0.32)`,
            glow: `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 0.22)`
          });
        }
      } catch {
        // Fallback gracefully on CORS or canvas errors
      }
    };

    return () => {
      isMounted = false;
    };
  }, [track.thumbnail]);

  // Save selected style to localStorage
  const handleStyleChange = (newStyle: LyricStyle) => {
    setStyle(newStyle);
    try {
      localStorage.setItem('metrolist_lyric_style', newStyle);
    } catch (e) {
      console.error(e);
    }
  };

  // Filter out blank or whitespace-only lines to preserve beautiful vertical rhythm
  const validLyrics = useMemo(() => lyrics.filter(l => l.text && l.text.trim().length > 0), [lyrics]);

  // Find active line index based on genuine playback time
  let activeIndex = -1;
  for (let i = 0; i < validLyrics.length; i++) {
    if (currentTime >= validLyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  // Scroll container so the active lyric line is centered in the available view
  const scrollToActiveLine = useCallback((smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    isProgrammaticScrollRef.current = true;
    const activeEl = activeLineRef.current;

    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!activeEl) {
      // At the start of the song, scroll to top so intro is visible
      container.scrollTo({
        top: 0,
        behavior: (smooth && !prefersReducedMotion) ? 'smooth' : 'auto'
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 500);
      return;
    }

    const containerHeight = container.clientHeight;
    const activeTop = activeEl.offsetTop;
    const activeHeight = activeEl.clientHeight;

    // Visual center calculation: active line center aligns with container center
    const targetTop = activeTop - (containerHeight / 2) + (activeHeight / 2);

    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: (smooth && !prefersReducedMotion) ? 'smooth' : 'auto'
    });

    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 700);
  }, []);

  // Auto-scroll to active lyric when activeIndex changes unless user intentionally scrolled
  useEffect(() => {
    if (!userScrolled && activeIndex >= 0) {
      scrollToActiveLine(true);
    }
  }, [activeIndex, userScrolled, style, scrollToActiveLine]);

  // Reset userScrolled when track changes
  useEffect(() => {
    setUserScrolled(false);
    if (activeIndex >= 0) {
      scrollToActiveLine(false);
    }
  }, [track.id]);

  // Only trigger userScrolled on genuine human gestures (mouse wheel, touch drag)
  const handleUserScrollGesture = () => {
    if (isProgrammaticScrollRef.current) return;
    setUserScrolled(true);

    // Auto-resume after 8 seconds of inactivity so user never gets left behind
    if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    autoResumeTimeoutRef.current = setTimeout(() => {
      setUserScrolled(false);
      scrollToActiveLine(true);
    }, 8000);
  };

  const resumeAutoScroll = () => {
    if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    setUserScrolled(false);
    scrollToActiveLine(true);
  };

  // Handle escape key, space play/pause & native fullscreen changes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === ' ' && onPlayPause && e.target === document.body) {
        e.preventDefault();
        onPlayPause();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    };
  }, [onClose, onPlayPause]);

  // Toggle native browser fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Auto-hide controls on mouse idle for true cinematic immersion
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remaining = Math.max(0, duration - currentTime);

  // Dynamic visual style configurations
  const styleClasses = {
    cinematic: {
      bgOverlay: 'bg-black/15',
      artworkModifier: 'scale-115 blur-[45px] sm:blur-[60px] saturate-[1.75] brightness-[0.72]',
      bloomModifier: 'scale-130 blur-[75px] sm:blur-[90px] saturate-200 opacity-55 mix-blend-screen',
      activeText: 'text-white font-black tracking-tight scale-100 sm:scale-105 drop-shadow-[0_4px_35px_rgba(255,255,255,0.55)]',
      transition: prefersReducedMotion ? '' : 'transition-all duration-500 ease-out'
    },
    kinetic: {
      bgOverlay: 'bg-black/10',
      artworkModifier: 'scale-120 blur-[40px] sm:blur-[50px] saturate-[2.1] brightness-[0.75] hue-rotate-15',
      bloomModifier: 'scale-135 blur-[70px] sm:blur-[85px] saturate-[2.3] opacity-65 mix-blend-color-dodge',
      activeText: 'bg-gradient-to-r from-white via-rose-100 to-rose-400 bg-clip-text text-transparent font-black tracking-normal scale-105 sm:scale-110 drop-shadow-[0_8px_35px_rgba(244,63,94,0.65)]',
      transition: prefersReducedMotion ? '' : 'transition-all duration-400 cubic-bezier(0.16, 1, 0.3, 1)'
    },
    dream: {
      bgOverlay: 'bg-black/20 backdrop-blur-xl',
      artworkModifier: 'scale-125 blur-[55px] sm:blur-[70px] saturate-[1.6] brightness-[0.70] motion-safe:animate-pulse',
      bloomModifier: 'scale-140 blur-[85px] sm:blur-[105px] saturate-[1.9] opacity-60 mix-blend-screen',
      activeText: 'text-rose-50 font-extrabold tracking-wide scale-100 sm:scale-105 drop-shadow-[0_0_40px_rgba(251,113,133,0.75)]',
      transition: prefersReducedMotion ? '' : 'transition-all duration-700 ease-in-out'
    }
  }[style];

  return (
    <div
      id="lyrics-view-container"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-zinc-950 text-white flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-500"
    >
      {/* 1. Atmospheric Ambient Artwork Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none bg-zinc-950">
        {/* Previous artwork layer for smooth crossfade transitions */}
        {prevArtwork && (
          <div
            key={`prev-${prevArtwork}`}
            className="absolute inset-0 bg-cover bg-center animate-out fade-out duration-1000 scale-120 blur-[50px] sm:blur-[65px] saturate-150 brightness-75 opacity-70"
            style={{ backgroundImage: `url(${prevArtwork})` }}
          />
        )}

        {/* Primary Artwork Cloud - rich blurred colors directly from album artwork */}
        <div
          key={`curr-${activeArtwork}`}
          className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-out opacity-85 ${styleClasses.artworkModifier}`}
          style={{ backgroundImage: `url(${activeArtwork})` }}
        />

        {/* Secondary Artwork Bloom - expansive glowing aura */}
        <div
          className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-out ${styleClasses.bloomModifier}`}
          style={{ backgroundImage: `url(${activeArtwork})` }}
        />

        {/* Dynamic color extraction radial aura */}
        <div
          className="absolute inset-0 transition-all duration-1000 ease-out pointer-events-none opacity-60"
          style={{
            background: `radial-gradient(circle at 50% 32%, ${palette.primary} 0%, transparent 65%),
                         radial-gradient(circle at 18% 75%, ${palette.secondary} 0%, transparent 55%),
                         radial-gradient(circle at 82% 70%, ${palette.primary} 0%, transparent 55%)`
          }}
        />

        {/* Atmospheric Dark Shroud & Vignette (maintains >10:1 WCAG contrast while preserving gorgeous color) */}
        <div 
          className="absolute inset-0 pointer-events-none transition-colors duration-700"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(8, 8, 12, 0.28) 0%, rgba(8, 8, 12, 0.64) 65%, rgba(8, 8, 12, 0.88) 100%)'
          }}
        />
        {/* Subtle linear top & bottom shadow for razor-sharp controls readability */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-zinc-950/70 via-transparent to-zinc-950/85" />
        <div className={`absolute inset-0 pointer-events-none transition-colors duration-700 ${styleClasses.bgOverlay}`} />
      </div>

      {/* 2. Top Header Bar */}
      <header
        className={`relative z-20 flex items-center justify-between px-6 py-4 sm:py-5 border-b border-white/10 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none sm:opacity-40 sm:hover:opacity-100 sm:pointer-events-auto'
        }`}
      >
        {/* Track Title and Artist */}
        <div className="flex items-center gap-3.5 min-w-0 max-w-[50%] sm:max-w-[40%]">
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl object-cover shadow-xl border border-white/15 flex-shrink-0"
          />
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold text-white truncate leading-tight">
              {track.title}
            </h2>
            <p className="text-xs text-zinc-300 font-medium truncate mt-0.5">
              {track.artist}
            </p>
          </div>
        </div>

        {/* Visual Style Selector & Actions */}
        <div className="flex items-center gap-2">
          {/* Desktop Style pills */}
          <div className="hidden sm:flex items-center bg-zinc-900/80 backdrop-blur-md p-1 rounded-2xl border border-white/10 shadow-inner">
            <button
              onClick={() => handleStyleChange('cinematic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                style === 'cinematic'
                  ? 'bg-white text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Cinematic: Crisp contrast & dramatic typography"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Cinematic</span>
            </button>
            <button
              onClick={() => handleStyleChange('kinetic')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                style === 'kinetic'
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-600/40'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Kinetic: Expressive motion & vibrant energy"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Kinetic</span>
            </button>
            <button
              onClick={() => handleStyleChange('dream')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                style === 'dream'
                  ? 'bg-rose-400 text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Dream: Ethereal glow & floating ambient typography"
            >
              <CloudSun className="w-3.5 h-3.5" />
              <span>Dream</span>
            </button>
          </div>

          {/* Mobile Style Switcher Pills */}
          <div className="flex sm:hidden items-center bg-zinc-900/80 backdrop-blur-md p-0.5 rounded-xl border border-white/10">
            <button
              onClick={() => handleStyleChange('cinematic')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                style === 'cinematic' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-400'
              }`}
              title="Cinematic"
            >
              <Film className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleStyleChange('kinetic')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                style === 'kinetic' ? 'bg-rose-600 text-white shadow-sm' : 'text-zinc-400'
              }`}
              title="Kinetic"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleStyleChange('dream')}
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                style === 'dream' ? 'bg-rose-400 text-zinc-950 shadow-sm' : 'text-zinc-400'
              }`}
              title="Dream"
            >
              <CloudSun className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Exit / Close */}
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
            title="Exit lyrics mode (Esc)"
            aria-label="Close Lyrics View"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      {/* 3. Main Center: Cinematic Lyrics Display with Viewport Center Padding */}
      <div
        ref={scrollContainerRef}
        onWheel={handleUserScrollGesture}
        onTouchMove={handleUserScrollGesture}
        className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-12 pt-[38vh] pb-[46vh] flex flex-col items-center justify-start text-center space-y-7 sm:space-y-9 scrollbar-none"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center my-auto text-zinc-300 gap-4">
            <Mic2 className="w-12 h-12 text-rose-500 animate-pulse" />
            <p className="text-xl sm:text-2xl font-bold tracking-tight">Syncing lyrics with performance...</p>
            <p className="text-xs text-zinc-400">Live query via LRCLIB & Better Lyrics</p>
          </div>
        ) : validLyrics.length > 0 ? (
          <>
            {validLyrics.map((line, idx) => {
              const isActive = idx === activeIndex;
              const distance = activeIndex >= 0 ? Math.abs(idx - activeIndex) : (idx === 0 ? 1 : idx + 1);

              // Long line font scaling for optimal readability
              const isLong = line.text.length > 45;
              const fontSizeClass = isActive
                ? isLong
                  ? 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-tight'
                  : 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-tight'
                : isLong
                ? 'text-base sm:text-xl md:text-2xl lg:text-3xl leading-snug'
                : 'text-lg sm:text-2xl md:text-3xl lg:text-4xl leading-snug';

              // Legible and atmospheric lyric hierarchy based on distance
              let lineStyle = '';
              if (isActive) {
                lineStyle = styleClasses.activeText;
              } else if (distance === 1) {
                // Immediate neighbor: highly legible, crisp, high contrast
                lineStyle = style === 'kinetic'
                  ? 'text-rose-100/90 font-bold opacity-80 blur-0 scale-[0.98]'
                  : style === 'dream'
                  ? 'text-rose-200/90 font-semibold opacity-75 blur-[0.2px] scale-[0.98]'
                  : 'text-zinc-100 font-bold opacity-80 blur-0 scale-[0.98]';
              } else if (distance === 2) {
                // Secondary neighbor: comfortably readable
                lineStyle = style === 'kinetic'
                  ? 'text-zinc-300 font-semibold opacity-60 blur-[0.4px] scale-95'
                  : style === 'dream'
                  ? 'text-zinc-300 font-medium opacity-55 blur-[0.5px] scale-95'
                  : 'text-zinc-300 font-semibold opacity-58 blur-[0.4px] scale-95';
              } else if (distance === 3) {
                // Tertiary distance: gentle secondary depth
                lineStyle = 'text-zinc-400 font-medium opacity-42 blur-[0.6px] scale-92';
              } else {
                // Distant lines: atmospheric poetry, never completely black or illegible
                lineStyle = 'text-zinc-500 font-normal opacity-30 blur-[0.8px] scale-90';
              }

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  data-lyric-line="true"
                  data-lyric-idx={idx}
                  onClick={() => {
                    onSeek(line.time);
                    resumeAutoScroll();
                  }}
                  className={`w-full max-w-4xl mx-auto px-4 sm:px-6 cursor-pointer transform-gpu ${
                    prefersReducedMotion ? '' : styleClasses.transition
                  }`}
                >
                  <p
                    className={`${fontSizeClass} ${lineStyle} select-none break-words text-balance text-center transition-all duration-300 hover:opacity-100 hover:text-white hover:blur-0 hover:scale-[1.01]`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })}
          </>
        ) : plainLyrics ? (
          <div className="w-full max-w-2xl mx-auto whitespace-pre-line text-zinc-200 text-xl sm:text-2xl leading-loose font-medium my-auto px-6">
            {plainLyrics}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center my-auto text-zinc-400 gap-3">
            <Music2 className="w-12 h-12 text-rose-500/60" />
            <p className="text-xl sm:text-2xl font-bold text-zinc-200">Instrumental / No synced lyrics found</p>
            <p className="text-sm text-zinc-400">Enjoy the music in atmospheric mode</p>
          </div>
        )}
      </div>

      {/* 4. Floating 'Resume Auto-Scroll' pill if user scrolled away */}
      {userScrolled && validLyrics.length > 0 && activeIndex >= 0 && (
        <div className="absolute bottom-28 left-0 right-0 z-30 flex justify-center pointer-events-auto animate-in fade-in slide-in-from-bottom-3 duration-300">
          <button
            onClick={resumeAutoScroll}
            className="px-5 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-2xl shadow-rose-600/50 flex items-center gap-2 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4" />
            <span>Resume Auto-Scroll</span>
          </button>
        </div>
      )}

      {/* 5. Minimalistic Bottom Player Controls Deck */}
      <footer
        className={`relative z-20 bg-zinc-950/85 backdrop-blur-xl border-t border-white/10 px-6 sm:px-12 py-4 sm:py-5 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none sm:opacity-35 sm:hover:opacity-100 sm:pointer-events-auto'
        }`}
      >
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          {/* Progress Seek Bar */}
          <div className="w-full flex items-center gap-3 text-xs text-zinc-300 font-mono font-semibold">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500 hover:h-2 transition-all"
              aria-label="Seek track position"
            />
            <span className="w-10 text-left">-{formatTime(remaining)}</span>
          </div>

          {/* Minimal Playback Controls */}
          <div className="flex items-center justify-between">
            <div className="text-xs text-zinc-400 flex items-center gap-2">
              <span className="font-semibold text-zinc-200 capitalize">{style} Mode</span>
              <span>•</span>
              <span className="hidden sm:inline">Press Esc to exit</span>
              <span className="sm:hidden">Tap X to exit</span>
            </div>

            {/* Play / Next / Prev */}
            <div className="flex items-center gap-4">
              {onPrev && (
                <button
                  onClick={onPrev}
                  className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                  title="Previous track"
                  aria-label="Previous track"
                >
                  <SkipBack className="w-5 h-5 fill-current" />
                </button>
              )}

              {onPlayPause && (
                <button
                  onClick={onPlayPause}
                  className="p-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 transition-all active:scale-95 hover:scale-105"
                  title={isPlaying ? 'Pause' : 'Play'}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>
              )}

              {onNext && (
                <button
                  onClick={onNext}
                  className="p-2 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                  title="Next track"
                  aria-label="Next track"
                >
                  <SkipForward className="w-5 h-5 fill-current" />
                </button>
              )}
            </div>

            {/* Volume control if available */}
            {onVolumeChange && onToggleMute ? (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={onToggleMute}
                  className="p-1.5 text-zinc-300 hover:text-white transition-colors"
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
                  className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  aria-label="Volume slider"
                />
              </div>
            ) : (
              <div className="w-20" />
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
