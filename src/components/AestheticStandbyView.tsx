import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Track, LyricLine } from '../types';
import { 
  X, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Sparkles, 
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ListMusic,
  Mic2
} from 'lucide-react';

interface Props {
  track: Track;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics: LyricLine[];
  queue: Track[];
  volume?: number;
  isMuted?: boolean;
  isShuffle?: boolean;
  isRepeat?: boolean | 'one';
  onClose: () => void;
  onSeek: (time: number) => void;
  onPlayPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onPlayTrack?: (track: Track) => void;
  onToggleShuffle?: () => void;
  onToggleRepeat?: () => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  onOpenLyrics?: () => void;
}

type WallpaperPreset = 'artwork' | 'midnight' | 'cyberpunk' | 'minimal';

export const AestheticStandbyView: React.FC<Props> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  lyrics,
  queue,
  volume = 0.8,
  isMuted = false,
  isShuffle = false,
  isRepeat = false,
  onClose,
  onSeek,
  onPlayPause,
  onNext,
  onPrev,
  onPlayTrack,
  onToggleShuffle,
  onToggleRepeat,
  onVolumeChange,
  onToggleMute,
  onOpenLyrics
}) => {
  // Real-time digital clock for iOS StandBy aesthetic
  const [clockTime, setClockTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClockTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedHours = clockTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const formattedDate = clockTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // 3D Card mouse-tracking tilt
  const [tilt, setTilt] = useState({ x: -6, y: 8 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [wallpaper, setWallpaper] = useState<WallpaperPreset>('midnight');

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Handle smooth 3D tilt tracking
  const handleMouseMove = (e: React.MouseEvent) => {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    const normX = (clientX - innerWidth / 2) / (innerWidth / 2);
    const normY = (clientY - innerHeight / 2) / (innerHeight / 2);
    setTilt({
      x: -normY * 10,
      y: normX * 12
    });
  };

  // Keyboard shortcut support
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
    };
  }, [onClose, onPlayPause]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const cycleWallpaper = () => {
    const presets: WallpaperPreset[] = ['midnight', 'artwork', 'cyberpunk', 'minimal'];
    const nextIdx = (presets.indexOf(wallpaper) + 1) % presets.length;
    setWallpaper(presets[nextIdx]);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remaining = Math.max(0, duration - currentTime);

  // Synchronized active lyric line
  const activeLyric = useMemo(() => {
    if (!lyrics || lyrics.length === 0) return null;
    let current: string | null = null;
    for (let i = 0; i < lyrics.length; i++) {
      if (currentTime >= lyrics[i].time) {
        if (lyrics[i].text && lyrics[i].text.trim().length > 0) {
          current = lyrics[i].text.trim();
        }
      } else {
        break;
      }
    }
    return current;
  }, [currentTime, lyrics]);

  // Curated wallpaper background styles matching iBaila aesthetics
  const getWallpaperBackground = () => {
    switch (wallpaper) {
      case 'midnight':
        return {
          background: 'linear-gradient(135deg, #091220 0%, #0d2137 40%, #050b14 100%)',
          overlay: 'radial-gradient(ellipse at 70% 30%, rgba(20, 110, 180, 0.25) 0%, transparent 60%)'
        };
      case 'cyberpunk':
        return {
          background: 'linear-gradient(135deg, #180927 0%, #2a0845 50%, #0b0213 100%)',
          overlay: 'radial-gradient(ellipse at 40% 70%, rgba(236, 72, 153, 0.28) 0%, transparent 60%)'
        };
      case 'minimal':
        return {
          background: '#070709',
          overlay: 'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.05) 0%, transparent 70%)'
        };
      case 'artwork':
      default:
        return {
          background: '#09090b',
          overlay: 'radial-gradient(circle at 50% 35%, rgba(244, 63, 94, 0.25) 0%, transparent 65%)'
        };
    }
  };

  const wpStyle = getWallpaperBackground();

  return (
    <div
      id="aesthetic-standby-view"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 text-white flex flex-col justify-between overflow-hidden select-none animate-in fade-in duration-500"
      style={{ backgroundColor: wpStyle.background }}
    >
      {/* 1. Atmospheric Wallpaper Canvas */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        {/* Dynamic Artwork Blur Layer */}
        <div
          className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-125 ${
            wallpaper === 'artwork' ? 'opacity-70 blur-[70px] saturate-150' : 'opacity-30 blur-[90px] saturate-100'
          }`}
          style={{ backgroundImage: `url(${track.thumbnail})` }}
        />

        {/* Ambient Radial Overlay */}
        <div 
          className="absolute inset-0 transition-all duration-700 pointer-events-none"
          style={{ background: wpStyle.overlay }}
        />

        {/* Cinematic Vignette */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at center, transparent 30%, rgba(5, 5, 8, 0.65) 80%, rgba(5, 5, 8, 0.95) 100%)'
          }}
        />
      </div>

      {/* 2. Top Header Bar: Date / Clock & Ambient Controls */}
      <header className="relative z-20 flex items-center justify-between px-6 py-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 shadow-lg">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="text-xs font-black tracking-wider uppercase text-amber-100">StandBy Canvas</span>
          </div>

          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
              isQueueOpen
                ? 'bg-white/15 text-white border-white/20'
                : 'bg-white/5 text-zinc-400 hover:text-white border-white/10'
            }`}
            title="Toggle Queue Drawer"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Queue</span>
          </button>
        </div>

        {/* Right Action Icons: Wallpaper Cycle, Fullscreen, Close */}
        <div className="flex items-center gap-2">
          <button
            onClick={cycleWallpaper}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-all active:scale-95 border border-white/10"
            title={`Cycle Wallpaper (${wallpaper})`}
          >
            <ImageIcon className="w-4 h-4" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-all active:scale-95 border border-white/10"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-all active:scale-95 border border-white/10"
            title="Exit StandBy Mode (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 3. Center Canvas Area: iOS Clock, 3D Tilted Card, Floating Sticker Lyrics & Queue */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-2 overflow-hidden">
        {/* Floating Translucent Queue Drawer (Left) */}
        <aside
          className={`absolute left-4 top-4 bottom-24 z-30 w-72 sm:w-80 backdrop-blur-2xl bg-zinc-950/60 border border-white/10 rounded-3xl p-4 shadow-2xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${
            isQueueOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : '-translate-x-full opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <img
                src={track.thumbnail}
                alt={track.title}
                className="w-7 h-7 rounded-lg object-cover border border-white/15"
              />
              <div>
                <h3 className="text-xs font-black text-white flex items-center gap-1">
                  Continue Playing <span className="text-[10px] text-zinc-400">▾</span>
                </h3>
                <p className="text-[10px] text-zinc-400 font-medium">Up next on YouTube Music</p>
              </div>
            </div>
            <button
              onClick={() => setIsQueueOpen(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Queue Track List */}
          <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1 scrollbar-none">
            {queue && queue.length > 0 ? (
              queue.slice(0, 15).map((qTrack, idx) => {
                const isCurrent = qTrack.id === track.id;
                return (
                  <div
                    key={`${qTrack.id}-${idx}`}
                    onClick={() => onPlayTrack && onPlayTrack(qTrack)}
                    className={`flex items-center gap-3 p-2 rounded-2xl cursor-pointer transition-all ${
                      isCurrent
                        ? 'bg-white/15 border border-white/20 shadow-md'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <img
                      src={qTrack.thumbnail}
                      alt={qTrack.title}
                      className="w-10 h-10 rounded-xl object-cover flex-shrink-0 shadow"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-xs font-bold truncate leading-tight ${isCurrent ? 'text-amber-300' : 'text-zinc-200'}`}>
                        {qTrack.title}
                      </h4>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">{qTrack.artist}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-xs">
                <ListMusic className="w-8 h-8 opacity-40 mb-2" />
                <p>Queue is empty</p>
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas Composition */}
        <div className="relative w-full max-w-5xl flex flex-col items-center justify-center text-center">
          {/* Giant iOS StandBy Clock Typography */}
          <div className="flex flex-col items-center mb-4 sm:mb-6 animate-in fade-in duration-700">
            <span className="text-xs sm:text-sm font-black uppercase tracking-[0.25em] text-white/50 mb-1 drop-shadow-md">
              {formattedDate}
            </span>
            <h1 className="font-serif font-black text-6xl sm:text-8xl md:text-9xl text-white/85 tracking-tighter leading-none drop-shadow-[0_15px_45px_rgba(0,0,0,0.8)]">
              {formattedHours}
            </h1>
          </div>

          {/* Interactive 3D Perspective Glass Music Card */}
          <div
            style={{
              transform: `perspective(1100px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transformStyle: 'preserve-3d'
            }}
            className="relative group transition-transform duration-200 ease-out z-20 flex flex-col items-center"
          >
            {/* Card Body */}
            <div className="relative p-3.5 sm:p-4 rounded-3xl bg-zinc-900/60 backdrop-blur-2xl border border-white/20 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.85)] max-w-xs sm:max-w-sm flex flex-col items-center">
              {/* Top Banner Tag (e.g. Yellow album header like RANSOM) */}
              <div className="w-full bg-amber-400 text-zinc-950 text-center font-black text-[11px] sm:text-xs py-1 px-3 rounded-xl uppercase tracking-wider mb-2.5 shadow-md truncate">
                {track.album || track.title}
              </div>

              {/* Artwork Container */}
              <div className="relative aspect-square w-52 sm:w-64 rounded-2xl overflow-hidden shadow-2xl border border-white/10 group-hover:scale-[1.02] transition-transform duration-500">
                <img
                  src={track.thumbnail}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
                {/* Glossy Sheen Overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent pointer-events-none" />
              </div>

              {/* Card Meta Under Artwork */}
              <div className="w-full mt-3 text-left px-1">
                <h2 className="text-sm sm:text-base font-black text-white truncate leading-tight">
                  {track.title}
                </h2>
                <p className="text-xs text-zinc-400 font-medium truncate mt-0.5">
                  {track.artist}
                </p>
              </div>

              {/* Pill Button: Listen Lyrics */}
              <div className="mt-3 flex items-center justify-between w-full pt-2 border-t border-white/10">
                <button
                  onClick={onOpenLyrics}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-200 transition-all border border-white/15 shadow-sm"
                >
                  <Mic2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Listen Lyrics</span>
                </button>

                <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Kinetic "Sticker" Lyrics in the Open Canvas */}
          <div className="mt-6 sm:mt-8 min-h-[4rem] flex items-center justify-center px-4 max-w-2xl z-20">
            {activeLyric ? (
              <p
                key={activeLyric}
                className="font-black italic text-2xl sm:text-4xl md:text-5xl text-amber-100 tracking-wide drop-shadow-[0_8px_30px_rgba(0,0,0,0.95)] animate-in fade-in zoom-in-95 duration-400 text-center leading-tight"
                style={{
                  textShadow: '0 4px 20px rgba(0, 0, 0, 0.9), 0 0 40px rgba(251, 191, 36, 0.35)'
                }}
              >
                "{activeLyric}"
              </p>
            ) : (
              <p className="text-xs sm:text-sm font-semibold tracking-wider text-zinc-400/80 uppercase">
                ♪ Ghosttunes Aesthetic StandBy • Ready to Stream ♪
              </p>
            )}
          </div>
        </div>
      </main>

      {/* 4. Floating Glass Mini-Player Dock (Bottom) */}
      <footer className="relative z-30 pb-6 px-4 flex justify-center">
        <div className="backdrop-blur-2xl bg-zinc-950/75 border border-white/15 rounded-full px-5 py-3 shadow-2xl flex items-center gap-4 sm:gap-6 max-w-2xl w-full justify-between">
          {/* Mini Artwork & Track Info */}
          <div className="flex items-center gap-3 min-w-0 max-w-[30%] sm:max-w-[28%]">
            <img
              src={track.thumbnail}
              alt={track.title}
              className={`w-9 h-9 rounded-full object-cover border border-white/15 flex-shrink-0 shadow ${
                isPlaying ? 'animate-spin-slow' : ''
              }`}
            />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate leading-tight">
                {track.title}
              </h4>
              <p className="text-[10px] text-zinc-400 truncate">{track.artist}</p>
            </div>
          </div>

          {/* Center Playback Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {onToggleShuffle && (
              <button
                onClick={onToggleShuffle}
                className={`p-1.5 rounded-full transition-all ${
                  isShuffle ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </button>
            )}

            {onPrev && (
              <button
                onClick={onPrev}
                className="p-1.5 rounded-full text-zinc-300 hover:text-white transition-all active:scale-95"
                title="Previous track"
              >
                <SkipBack className="w-4 h-4 fill-current" />
              </button>
            )}

            {onPlayPause && (
              <button
                onClick={onPlayPause}
                className="p-2.5 rounded-full bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black shadow-lg shadow-amber-400/40 transition-all active:scale-95 hover:scale-105"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            )}

            {onNext && (
              <button
                onClick={onNext}
                className="p-1.5 rounded-full text-zinc-300 hover:text-white transition-all active:scale-95"
                title="Next track"
              >
                <SkipForward className="w-4 h-4 fill-current" />
              </button>
            )}

            {onToggleRepeat && (
              <button
                onClick={onToggleRepeat}
                className={`p-1.5 rounded-full transition-all ${
                  isRepeat ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-400 hover:text-white'
                }`}
                title="Repeat"
              >
                {isRepeat === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Right Meta: YouTube Music Badge & Volume */}
          <div className="flex items-center gap-3">
            {/* YouTube Music Source Pill Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/20 border border-red-500/30 text-[10px] font-bold text-red-300 shadow-sm">
              <svg className="w-3.5 h-3.5 fill-current text-red-500" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>YT Music</span>
            </div>

            {/* Volume */}
            {onVolumeChange && onToggleMute && (
              <div className="hidden md:flex items-center gap-1.5">
                <button
                  onClick={onToggleMute}
                  className="p-1 text-zinc-400 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="w-14 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
