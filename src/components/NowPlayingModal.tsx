import React, { useState, useEffect, useRef } from 'react';
import { Track, LyricLine } from '../types';
import { 
  ChevronDown, 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Repeat, 
  Repeat1, 
  Volume2, 
  VolumeX, 
  Heart, 
  Mic2, 
  ListMusic, 
  Disc3, 
  Plus, 
  Trash2,
  Sparkles
} from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';

interface Props {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isRepeat: boolean | 'one';
  isShuffle: boolean;
  isLiked: boolean;
  queue: Track[];
  queueIndex: number;
  lyrics: LyricLine[];
  plainLyrics?: string;
  loadingLyrics: boolean;
  autoplay: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onClose: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onToggleRepeat: () => void;
  onToggleShuffle: () => void;
  onToggleLike: () => void;
  onSelectTrack: (track: Track) => void;
  onRemoveFromQueue: (index: number) => void;
  onClearQueue: () => void;
  onToggleAutoplay: () => void;
  onOpenAddToPlaylist: (track: Track) => void;
  onOpenStandby?: () => void;
}

export const NowPlayingModal: React.FC<Props> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isRepeat,
  isShuffle,
  isLiked,
  queue,
  queueIndex,
  lyrics,
  plainLyrics,
  loadingLyrics,
  autoplay,
  audioRef,
  onClose,
  onPlayPause,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleRepeat,
  onToggleShuffle,
  onToggleLike,
  onSelectTrack,
  onRemoveFromQueue,
  onClearQueue,
  onToggleAutoplay,
  onOpenAddToPlaylist,
  onOpenStandby
}) => {
  const [activeTab, setActiveTab] = useState<'cover' | 'lyrics' | 'queue'>('cover');
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  // Time formatters
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remainingTime = Math.max(0, duration - currentTime);

  // Find active lyric line
  let activeLyricIndex = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (currentTime >= lyrics[i].time) {
      activeLyricIndex = i;
    } else {
      break;
    }
  }

  const isProgrammaticScrollRef = useRef(false);
  const autoResumeTimeoutRef = useRef<any>(null);

  const scrollToActiveLyric = (smooth = true) => {
    if (activeLyricRef.current) {
      isProgrammaticScrollRef.current = true;
      activeLyricRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'center'
      });
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
    }
  };

  // Smooth scroll lyrics to center when active line changes
  useEffect(() => {
    if (!userScrolled && activeLyricIndex >= 0 && activeTab === 'lyrics') {
      scrollToActiveLyric(true);
    }
  }, [activeLyricIndex, activeTab, userScrolled]);

  useEffect(() => {
    setUserScrolled(false);
  }, [track.id, activeTab]);

  // Handle genuine user interaction on lyrics container
  const handleLyricsUserInteraction = () => {
    if (isProgrammaticScrollRef.current) return;
    setUserScrolled(true);

    if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    autoResumeTimeoutRef.current = setTimeout(() => {
      setUserScrolled(false);
      scrollToActiveLyric(true);
    }, 8000);
  };

  const resumeAutoScroll = () => {
    if (autoResumeTimeoutRef.current) clearTimeout(autoResumeTimeoutRef.current);
    setUserScrolled(false);
    scrollToActiveLyric(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-2xl text-white overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Dynamic Ambient Background Glow */}
      <div 
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[140px] opacity-25 pointer-events-none transition-all duration-1000 bg-cover bg-center"
        style={{ backgroundImage: `url(${track.thumbnail})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/70 to-zinc-950 pointer-events-none" />

      {/* Top Bar Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all active:scale-95 flex items-center gap-2 text-xs font-semibold"
          title="Minimize to player bar"
        >
          <ChevronDown className="w-5 h-5" />
          <span className="hidden sm:inline">Minimize</span>
        </button>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-xl border border-white/10 shadow-inner">
          <button
            onClick={() => setActiveTab('cover')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'cover'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Disc3 className="w-4 h-4" />
            <span>Now Playing</span>
          </button>
          <button
            onClick={() => { setActiveTab('lyrics'); setUserScrolled(false); }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'lyrics'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mic2 className="w-4 h-4" />
            <span>Lyrics</span>
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'queue'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ListMusic className="w-4 h-4" />
            <span>Queue ({queue.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onOpenStandby && (
            <button
              onClick={() => {
                onClose();
                onOpenStandby();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 text-xs font-bold transition-all border border-amber-400/20 shadow-sm"
              title="Open Aesthetic StandBy Canvas"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">StandBy</span>
            </button>
          )}

          {/* Quick Add To Playlist */}
          <button
            onClick={() => onOpenAddToPlaylist(track)}
            className="p-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all active:scale-95"
            title="Add to Playlist"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center justify-center">
        {/* TAB 1: COVER ARTWORK & DETAILS */}
        {activeTab === 'cover' && (
          <div className="w-full max-w-lg flex flex-col items-center">
            {/* Album Artwork Card */}
            <div className="relative aspect-square w-64 sm:w-80 md:w-96 rounded-3xl overflow-hidden shadow-2xl shadow-rose-950/30 border border-white/10 group mb-6 transition-all duration-500">
              <img
                src={track.thumbnail}
                alt={track.title}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? 'scale-100' : 'scale-95 opacity-90'
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Track Info & Like Action */}
            <div className="w-full flex items-center justify-between gap-4 mb-6">
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white truncate leading-tight tracking-tight">
                  {track.title}
                </h2>
                <p className="text-sm sm:text-base text-zinc-400 font-medium truncate mt-1">
                  {track.artist}
                  {track.album && <span className="text-zinc-600 font-normal"> • {track.album}</span>}
                </p>
              </div>

              <button
                onClick={onToggleLike}
                className={`p-3 rounded-2xl border transition-all active:scale-95 ${
                  isLiked
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-500'
                    : 'bg-zinc-900 border-white/5 text-zinc-400 hover:text-white hover:border-white/20'
                }`}
                title={isLiked ? 'Remove from favorites' : 'Save to favorites'}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-rose-500' : ''}`} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE SYNCHRONIZED LYRICS */}
        {activeTab === 'lyrics' && (
          <div className="w-full max-w-2xl flex-1 flex flex-col items-center justify-between h-full relative">
            <div
              ref={lyricsContainerRef}
              onWheel={handleLyricsUserInteraction}
              onTouchMove={handleLyricsUserInteraction}
              className="w-full flex-1 overflow-y-auto px-4 py-8 space-y-6 text-center select-none"
            >
              {loadingLyrics ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3 py-20">
                  <Mic2 className="w-8 h-8 animate-pulse text-rose-500" />
                  <p className="text-sm font-semibold">Fetching synced lyrics...</p>
                </div>
              ) : lyrics.length > 0 ? (
                lyrics.map((line, idx) => {
                  const isActive = idx === activeLyricIndex;
                  return (
                    <p
                      key={idx}
                      ref={isActive ? activeLyricRef : null}
                      onClick={() => { onSeek(line.time); resumeAutoScroll(); }}
                      className={`cursor-pointer transition-all duration-300 font-extrabold select-none ${
                        isActive
                          ? 'text-white text-2xl sm:text-3xl md:text-4xl scale-105 drop-shadow-[0_4px_24px_rgba(244,63,94,0.7)]'
                          : 'text-zinc-600 hover:text-zinc-300 text-lg sm:text-xl opacity-60'
                      }`}
                    >
                      {line.text}
                    </p>
                  );
                })
              ) : plainLyrics ? (
                <div className="whitespace-pre-line text-zinc-300 text-base sm:text-lg leading-relaxed font-medium">
                  {plainLyrics}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2 py-20">
                  <p className="text-base font-semibold">No lyrics found for this song.</p>
                  <p className="text-xs text-zinc-600">Sync is powered by LRCLIB</p>
                </div>
              )}
            </div>

            {/* Resume Auto-scroll Floating Pill */}
            {userScrolled && lyrics.length > 0 && activeLyricIndex >= 0 && (
              <button
                onClick={resumeAutoScroll}
                className="absolute bottom-4 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/40 flex items-center gap-2 transition-transform active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Resume Auto-Scroll</span>
              </button>
            )}
          </div>
        )}

        {/* TAB 3: UP NEXT QUEUE */}
        {activeTab === 'queue' && (
          <div className="w-full max-w-2xl flex-1 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-white/5 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Up Next</h3>
                <p className="text-xs text-zinc-400">{queue.length} tracks queued</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onToggleAutoplay}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    autoplay
                      ? 'bg-rose-600/20 border-rose-500/40 text-rose-400'
                      : 'bg-zinc-900 border-white/5 text-zinc-400'
                  }`}
                  title="Automatically add recommended tracks when the queue finishes"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Autoplay {autoplay ? 'ON' : 'OFF'}</span>
                </button>

                {queue.length > 0 && (
                  <button
                    onClick={onClearQueue}
                    className="p-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-white/5 transition-all text-xs"
                    title="Clear queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {queue.map((item, idx) => {
                const isCurrent = idx === queueIndex;
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    onClick={() => onSelectTrack(item)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group ${
                      isCurrent
                        ? 'bg-rose-500/15 border-rose-500/40'
                        : 'bg-zinc-900/60 border-white/5 hover:bg-zinc-850 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                        {isCurrent && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-rose-400' : 'text-white'}`}>
                          {item.title}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">{item.artist}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">{item.duration}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromQueue(idx);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-opacity"
                        title="Remove from queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Deck */}
      <footer className="relative z-10 bg-zinc-950/80 border-t border-white/5 px-6 py-5">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">
          {/* Seek Bar */}
          <div className="w-full flex items-center gap-3 text-xs text-zinc-400 font-semibold font-mono">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
            />
            <span>-{formatTime(remainingTime)}</span>
          </div>

          {/* Core Controls */}
          <div className="flex items-center justify-between pt-1">
            {/* Visualizer pill */}
            <div className="hidden sm:block">
              <AudioVisualizer audioRef={audioRef} isPlaying={isPlaying} />
            </div>

            {/* Playback Buttons */}
            <div className="flex items-center gap-4 sm:gap-6 mx-auto sm:mx-0">
              <button
                onClick={onToggleShuffle}
                className={`p-2.5 rounded-full transition-all active:scale-95 ${
                  isShuffle ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-400 hover:text-white'
                }`}
                title="Shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={onPrev}
                className="p-2.5 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                title="Previous track"
              >
                <SkipBack className="w-6 h-6 fill-current" />
              </button>

              <button
                onClick={onPlayPause}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-600/40 transition-all active:scale-95 hover:scale-105"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
              </button>

              <button
                onClick={onNext}
                className="p-2.5 rounded-full text-zinc-200 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                title="Next track"
              >
                <SkipForward className="w-6 h-6 fill-current" />
              </button>

              <button
                onClick={onToggleRepeat}
                className={`p-2.5 rounded-full transition-all active:scale-95 ${
                  isRepeat ? 'text-rose-500 bg-rose-500/10' : 'text-zinc-400 hover:text-white'
                }`}
                title={isRepeat === 'one' ? 'Repeat One' : isRepeat ? 'Repeat All' : 'Repeat Off'}
              >
                {isRepeat === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
              </button>
            </div>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2 min-w-32">
              <button
                onClick={onToggleMute}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
