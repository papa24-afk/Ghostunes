import React from 'react';
import { Track } from '../types';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Repeat, 
  Repeat1,
  Shuffle, 
  Mic2, 
  Heart,
  Maximize2,
  Plus,
  Sparkles,
  Download,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';
import ghostIcon from '../assets/icon.png';
import { upgradeToHighResArtwork } from '../utils/artwork';

interface Props {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isRepeat: boolean | 'one';
  isShuffle: boolean;
  isLiked: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleLike: () => void;
  onOpenLyrics: () => void;
  onOpenStandby?: () => void;
  onOpenNowPlaying: () => void;
  onOpenAddToPlaylist?: (track: Track) => void;
  onDownloadTrack?: (track: Track) => void;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  isPaused?: boolean;
}

export const PlayerBar: React.FC<Props> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isRepeat,
  isShuffle,
  isLiked,
  audioRef,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onToggleLike,
  onOpenLyrics,
  onOpenStandby,
  onOpenNowPlaying,
  onOpenAddToPlaylist,
  onDownloadTrack,
  isDownloaded = false,
  isDownloading = false,
  isPaused = false
}) => {
  if (!currentTrack) return null;

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remaining = Math.max(0, duration - currentTime);

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-2xl border-t border-white/10 px-3 py-2.5 sm:px-6 shadow-2xl transition-all"
      style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5 sm:gap-2">
        {/* Sleek Seek Bar */}
        <div className="w-full flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs text-zinc-400 font-mono font-medium">
          <span className="w-9 sm:w-10 text-right">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500 hover:h-2 transition-all"
          />
          <span className="w-9 sm:w-10 text-left">-{formatTime(remaining)}</span>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Track Info (Clickable to open Now Playing) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-[45%] sm:max-w-[30%]">
            <div 
              onClick={onOpenNowPlaying}
              className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden shadow-md flex-shrink-0 cursor-pointer group"
              title="Click to open Now Playing"
            >
              <img
                src={(typeof navigator === 'undefined' || navigator.onLine) && currentTrack.thumbnail && currentTrack.thumbnail.startsWith('http') && !currentTrack.thumbnail.includes('/api/artwork/')
                  ? upgradeToHighResArtwork(currentTrack.thumbnail)
                  : (currentTrack.local_artwork_url || (isDownloaded ? `http://127.0.0.1:3001/api/artwork/${currentTrack.id}` : currentTrack.thumbnail))}
                alt={currentTrack.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (currentTrack?.id && !img.src.includes('/api/artwork/')) {
                    img.src = `http://127.0.0.1:3001/api/artwork/${currentTrack.id}`;
                  } else {
                    img.src = ghostIcon;
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
            </div>

            <div 
              onClick={onOpenNowPlaying} 
              className="min-w-0 cursor-pointer group"
              title="Click to open Now Playing"
            >
              <h4 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-rose-400 transition-colors">
                {currentTrack.title}
              </h4>
              <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">{currentTrack.artist}</p>
            </div>

            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              <button
                onClick={onToggleLike}
                className={`p-1 sm:p-1.5 rounded-full hover:bg-white/10 transition-all active:scale-95 ${
                  isLiked ? 'text-rose-500' : 'text-zinc-400 hover:text-white'
                }`}
                title={isLiked ? 'Unlike' : 'Like'}
              >
                <Heart className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLiked ? 'fill-rose-500' : ''}`} />
              </button>

              {onDownloadTrack && (
                <button
                  onClick={() => onDownloadTrack(currentTrack)}
                  className={`p-1.5 rounded-full hover:bg-white/10 transition-all active:scale-95 cursor-pointer ${
                    isDownloaded
                      ? 'text-emerald-400'
                      : isPaused
                      ? 'text-amber-400'
                      : isDownloading
                      ? 'text-cyan-400'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                  title={
                    isDownloaded
                      ? 'Downloaded for offline playback'
                      : isPaused
                      ? 'Download paused. Click to play / resume.'
                      : isDownloading
                      ? 'Downloading track. Click to pause.'
                      : 'Download song for offline playback'
                  }
                  aria-label="Download song"
                >
                  {isDownloaded ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : isPaused ? (
                    <Play className="w-4 h-4 text-amber-400 fill-current" />
                  ) : isDownloading ? (
                    <Pause className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              )}

              {onOpenAddToPlaylist && (
                <button
                  onClick={() => onOpenAddToPlaylist(currentTrack)}
                  className="hidden md:flex p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-all active:scale-95"
                  title="Add to playlist"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Main Playback Buttons */}
          <div className="flex items-center gap-1.5 sm:gap-4">
            <button
              onClick={onToggleShuffle}
              className={`hidden sm:flex p-2 rounded-full hover:bg-white/10 transition-all active:scale-95 ${
                isShuffle ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-400 hover:text-white'
              }`}
              title="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={onPrev}
              className="p-1.5 sm:p-2 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title="Previous"
            >
              <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            <button
              onClick={onPlayPause}
              className="p-2.5 sm:p-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/40 transition-all active:scale-95 hover:scale-105"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-current" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current ml-0.5" />}
            </button>

            <button
              onClick={onNext}
              className="p-1.5 sm:p-2 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              title="Next"
            >
              <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>

            <button
              onClick={onToggleRepeat}
              className={`hidden sm:flex p-2 rounded-full hover:bg-white/10 transition-all active:scale-95 ${
                isRepeat ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-400 hover:text-white'
              }`}
              title={isRepeat === 'one' ? 'Repeat One' : isRepeat ? 'Repeat All' : 'Repeat Off'}
            >
              {isRepeat === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>

          {/* Extra Controls: Visualizer, Lyrics, Volume, Expand */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="hidden lg:block">
              <AudioVisualizer audioRef={audioRef} isPlaying={isPlaying} />
            </div>

            <button
              id="playerbar-lyrics-btn"
              onClick={onOpenLyrics}
              className="flex items-center gap-1 sm:gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-white transition-all border border-white/5"
              title="View live synced lyrics"
            >
              <Mic2 className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">Lyrics</span>
            </button>

            {onOpenStandby && (
              <button
                id="playerbar-standby-btn"
                onClick={onOpenStandby}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-amber-200 transition-all border border-amber-500/20 shadow-sm"
                title="Aesthetic StandBy Canvas (iBaila Style)"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">StandBy</span>
              </button>
            )}

            {/* Volume */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={onToggleMute}
                className="p-1.5 text-zinc-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
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
                className="w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>

            {/* Expand button */}
            <button
              onClick={onOpenNowPlaying}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all border border-white/5"
              title="Expand Now Playing"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
