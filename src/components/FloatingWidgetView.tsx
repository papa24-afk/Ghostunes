// src/components/FloatingWidgetView.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Track, LyricLine } from '../types';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Maximize2, 
  X, 
  Pin, 
  PinOff,
  Music2
} from 'lucide-react';
import { getHighResArtwork, getThumbnailArtwork } from '../utils/artwork';
import { expandToMain, closeMiniWidget, toggleWidgetPin } from '../services/desktopService';

interface Props {
  track: Track | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  lyrics?: LyricLine[];
  volume?: number;
  isMuted?: boolean;
  isLiked?: boolean;
  isShuffle?: boolean;
  isRepeat?: boolean | 'one';
  standalone?: boolean; // True when rendered inside the separate Electron mini-window
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onToggleLike?: () => void;
  onToggleShuffle?: () => void;
  onToggleRepeat?: () => void;
  onVolumeChange?: (vol: number) => void;
  onToggleMute?: () => void;
  onClose?: () => void;
  onExpand?: () => void;
}

export const FloatingWidgetView: React.FC<Props> = ({
  track,
  currentTime,
  duration,
  isPlaying,
  isShuffle = false,
  isRepeat = false,
  standalone = false,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onToggleShuffle,
  onToggleRepeat,
  onClose,
  onExpand
}) => {
  const [isPinned, setIsPinned] = useState(true);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);

  // In-app draggable position (only used when not standalone)
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      return { x: Math.max(16, window.innerWidth - 460), y: Math.max(16, window.innerHeight - 230) };
    }
    return { x: 30, y: 30 };
  });
  const isDraggingInApp = useRef(false);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle in-app dragging
  const handleDragStart = (clientX: number, clientY: number) => {
    if (standalone) return;
    isDraggingInApp.current = true;
    dragOffset.current = {
      x: clientX - position.x,
      y: clientY - position.y
    };
  };

  useEffect(() => {
    if (standalone) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingInApp.current) return;
      const newX = Math.max(8, Math.min(window.innerWidth - 440, e.clientX - dragOffset.current.x));
      const newY = Math.max(8, Math.min(window.innerHeight - 210, e.clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingInApp.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [standalone]);

  const activeDisplayTime = scrubTime !== null ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (activeDisplayTime / duration) * 100)) : 0;

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

  const handleTogglePin = async () => {
    if (standalone) {
      const next = await toggleWidgetPin();
      setIsPinned(next);
    } else {
      setIsPinned(!isPinned);
    }
  };

  const handleExpand = () => {
    if (standalone) {
      expandToMain();
    } else {
      onExpand?.();
    }
  };

  const handleClose = () => {
    if (standalone) {
      closeMiniWidget();
    } else {
      onClose?.();
    }
  };

  const currentArtwork = track ? (getHighResArtwork(track.thumbnail) || getThumbnailArtwork(track.thumbnail)) : '';
  const currentTitle = track?.title || 'Ghosttunes';

  const formatClock = (seconds: number) => {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate 32 audio waveform bars
  const [waveSeed, setWaveSeed] = useState(0);
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setWaveSeed(prev => (prev + 1) % 100);
    }, 180);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const waveformBars = useMemo(() => {
    // Symmetrical frequencies
    const count = 32;
    const bars: number[] = [];
    for (let i = 0; i < count; i++) {
      const distFromCenter = Math.abs(i - count / 2) / (count / 2);
      const baseHeight = Math.max(3, Math.round(18 * (1 - distFromCenter * 0.65)));
      if (isPlaying) {
        // dynamic jitter
        const pseudoRand = Math.sin((i + 1) * 3.7 + waveSeed * 0.8) * 0.5 + 0.5;
        const dynamicH = Math.max(3, Math.min(22, Math.round(baseHeight * (0.6 + pseudoRand * 0.8))));
        bars.push(dynamicH);
      } else {
        bars.push(Math.max(3, Math.round(baseHeight * 0.5)));
      }
    }
    return bars;
  }, [isPlaying, waveSeed]);

  return (
    <div
      style={{
        ...(!standalone ? { left: `${position.x}px`, top: `${position.y}px` } : {}),
        WebkitAppRegion: standalone ? 'drag' : 'auto'
      } as any}
      onPointerDown={(e) => {
        if (!standalone && (e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'SVG' && (e.target as HTMLElement).tagName !== 'INPUT') {
          handleDragStart(e.clientX, e.clientY);
        }
      }}
      className={`${
        standalone
          ? 'w-full h-full bg-[#181a1d]'
          : 'fixed z-50 w-[440px] shadow-[0_24px_60px_rgba(0,0,0,0.85)] bg-[#181a1d]/95 animate-in fade-in zoom-in-95 duration-200'
      } rounded-[28px] border border-white/[0.08] p-4 flex items-center gap-5 text-white select-none backdrop-blur-2xl font-['Inter',sans-serif] relative overflow-hidden`}
    >
      {/* Discreet Window Drag Header & Control Buttons */}
      <div
        className="absolute top-2 right-3 flex items-center gap-1 z-20"
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as any} className="flex items-center gap-1">
          <button
            onClick={handleTogglePin}
            className={`p-1 rounded-md transition-colors cursor-pointer outline-none ${
              isPinned ? 'text-[#8da274] bg-[#7c8f65]/20' : 'text-zinc-500 hover:text-white'
            }`}
            title={isPinned ? 'Unpin window' : 'Pin window on top'}
          >
            {isPinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>

          <button
            onClick={handleExpand}
            className="p-1 rounded-md text-zinc-500 hover:text-white transition-colors cursor-pointer outline-none"
            title="Expand to Full App"
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          <button
            onClick={handleClose}
            className="p-1 rounded-md text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer outline-none"
            title="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* LEFT: Rounded Rectangular Album Artwork matching Reference Image */}
      <div 
        style={{ WebkitAppRegion: standalone ? 'drag' : 'auto' } as any}
        className="w-[140px] h-[140px] rounded-2xl overflow-hidden bg-zinc-900 border border-white/[0.08] flex-shrink-0 shadow-xl relative"
      >
        {currentArtwork ? (
          <img 
            src={currentArtwork} 
            alt={currentTitle} 
            className="w-full h-full object-cover pointer-events-none select-none" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Music2 className="w-8 h-8" />
          </div>
        )}
      </div>

      {/* RIGHT: Title, Sound Waveform, Scrubber, and Olive Controls */}
      <div 
        style={{ WebkitAppRegion: standalone ? 'no-drag' : 'auto' } as any}
        className="flex-1 min-w-0 flex flex-col justify-between py-1 pr-1"
      >
        {/* Title in Editorial Serif */}
        <div className="pr-12">
          <h2 
            title={currentTitle}
            className="font-serif text-2xl font-medium tracking-tight text-[#f2efe9] truncate"
          >
            {currentTitle}
          </h2>
        </div>

        {/* Audio Frequency Waveform Bars */}
        <div className="flex items-center justify-center gap-[3px] h-6 py-1">
          {waveformBars.map((height, i) => (
            <span
              key={i}
              style={{ height: `${height}px` }}
              className="w-[2.5px] bg-[#7c8f65] rounded-full transition-all duration-150 opacity-90"
            />
          ))}
        </div>

        {/* Progress Bar & Timestamps */}
        <div className="space-y-1">
          <div
            ref={scrubberRef}
            onPointerDown={handleScrubberPointerDown}
            onPointerMove={handleScrubberPointerMove}
            onPointerUp={handleScrubberPointerUp}
            onPointerCancel={handleScrubberPointerCancel}
            className="relative w-full h-3 flex items-center cursor-pointer group"
          >
            <div className="w-full h-[3px] bg-[#2a2d32] rounded-full overflow-hidden">
              <div
                style={{ width: `${progressPercent}%` }}
                className="h-full bg-[#7c8f65] rounded-full"
              />
            </div>
            <div
              style={{ left: `${progressPercent}%` }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-[#e4e8dc] shadow-sm pointer-events-none group-hover:scale-125 transition-transform"
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 select-none">
            <span>{formatClock(activeDisplayTime)}</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>

        {/* Playback Controls Row */}
        <div className="flex items-center justify-between pt-1">
          {/* Shuffle */}
          <button
            onClick={onToggleShuffle}
            className={`p-1 transition-colors cursor-pointer outline-none ${
              isShuffle ? 'text-[#8da274]' : 'text-zinc-500 hover:text-white'
            }`}
            title="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          {/* Previous */}
          <button
            onClick={onPrev}
            className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer outline-none"
            title="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          {/* Center Olive Play / Pause Button */}
          <button
            onClick={onPlayPause}
            className="w-10 h-10 rounded-full bg-[#7c8f65] hover:bg-[#8da274] text-[#141712] flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer outline-none"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-[#141712]" />
            ) : (
              <Play className="w-4 h-4 fill-[#141712] ml-0.5" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={onNext}
            className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer outline-none"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={onToggleRepeat}
            className={`p-1 transition-colors cursor-pointer outline-none ${
              isRepeat ? 'text-[#8da274]' : 'text-zinc-500 hover:text-white'
            }`}
            title="Repeat"
          >
            {isRepeat === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
