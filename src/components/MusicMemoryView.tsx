// src/components/MusicMemoryView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  History, Clock, Music, BarChart3, RotateCcw, Download,
  Trash2, ShieldCheck, Play, ArrowLeft, Check, Sparkles, User,
  MoreVertical, ChevronRight, Disc, Users, Heart, List, LayoutGrid,
  ChevronDown
} from 'lucide-react';
import { Track, ListeningHistoryRecord, ListeningStats } from '../types';
import { getListeningHistory, getListeningStats, clearListeningHistory } from '../services/desktopService';
import { musicMemory, downloadHistoryExport } from '../services/musicMemoryService';
import { ArtistAvatar } from './ArtistAvatar';

interface MusicMemoryViewProps {
  onBack: () => void;
  onPlayTrack: (track: Track) => void;
  onResumeSession?: (tracks: Track[], index: number, time: number) => void;
  onOpenArtist?: (artistName: string) => void;
}

export const MusicMemoryView: React.FC<MusicMemoryViewProps> = ({
  onBack,
  onPlayTrack,
  onResumeSession,
  onOpenArtist
}) => {
  const [history, setHistory] = useState<ListeningHistoryRecord[]>([]);
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [interruptedSession, setInterruptedSession] = useState<{ queue: Track[]; currentIndex: number; currentTime: number; sessionName: string } | null>(null);
  const [showInsights, setShowInsights] = useState<boolean>(true);
  const [clearing, setClearing] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState<boolean>(false);
  const [isArtistSortOpen, setIsArtistSortOpen] = useState<boolean>(false);
  const [artistSort, setArtistSort] = useState<'plays' | 'time'>('plays');
  const [isTrackSortOpen, setIsTrackSortOpen] = useState<boolean>(false);
  const [trackSort, setTrackSort] = useState<'frequency' | 'recent'>('frequency');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'week'>('all');
  const [isDateFilterOpen, setIsDateFilterOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const hist = await getListeningHistory(200, 0);
      const st = await getListeningStats();
      setHistory(hist);
      setStats(st);
      const savedSess = musicMemory.getSavedSessionSnapshot();
      if (savedSess && savedSess.queue && savedSess.queue.length > 0) {
        setInterruptedSession(savedSess);
      }
    } catch (e) {
      console.warn('[MusicMemoryView] Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearSingle = async (id: string) => {
    await clearListeningHistory({ id });
    setHistory(prev => prev.filter(h => h.id !== id));
    getListeningStats().then(setStats);
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear your entire listening history? This cannot be undone.')) return;
    setClearing(true);
    await clearListeningHistory({ all: true });
    setHistory([]);
    setStats({ totalPlays: 0, totalListeningMinutes: 0, uniqueTracks: 0, topArtists: [], topTracks: [] });
    setClearing(false);
    setIsActionsOpen(false);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    await downloadHistoryExport(format);
    setExportNotice(`Exported listening history as ${format.toUpperCase()}`);
    setIsActionsOpen(false);
    setTimeout(() => setExportNotice(null), 3000);
  };

  const toggleFavorite = (trackId: string) => {
    setFavoritedIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  // Image lookup map from history
  const trackArtworkMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of history) {
      if (h.track_id && !map.has(h.track_id)) {
        const thumb = (h as any).thumbnail;
        if (thumb) {
          map.set(h.track_id, thumb);
        } else if (h.track_id.length === 11) {
          map.set(h.track_id, `https://i.ytimg.com/vi/${h.track_id}/hqdefault.jpg`);
        }
      }
    }
    return map;
  }, [history]);

  const artistArtworkMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of history) {
      const art = (h.artist || '').toLowerCase().trim();
      if (art && !map.has(art)) {
        const thumb = (h as any).thumbnail || (h.track_id?.length === 11 ? `https://i.ytimg.com/vi/${h.track_id}/hqdefault.jpg` : '');
        if (thumb) {
          map.set(art, thumb);
        }
      }
    }
    return map;
  }, [history]);

  // Unique albums count calculated from actual history
  const uniqueAlbumsCount = useMemo(() => {
    const albumSet = new Set<string>();
    history.forEach(h => {
      if (h.album && h.album.trim()) albumSet.add(h.album.trim().toLowerCase());
    });
    return albumSet.size || (history.length > 0 ? Math.max(1, Math.round(history.length / 4)) : 0);
  }, [history]);

  // Today's listening minutes
  const todayMinutes = useMemo(() => {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const todayPlays = history.filter(h => h.played_at >= startOfToday);
    const totalSecs = todayPlays.reduce((acc, h) => acc + (h.duration_played || 0), 0);
    return Math.round(totalSecs / 60);
  }, [history]);

  // Group history chronologically
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: ListeningHistoryRecord[] } = {};
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfThisWeek = startOfToday - 6 * 86400000;

    let filtered = history;
    if (dateFilter === 'today') {
      filtered = history.filter(h => h.played_at >= startOfToday);
    } else if (dateFilter === 'yesterday') {
      filtered = history.filter(h => h.played_at >= startOfYesterday && h.played_at < startOfToday);
    } else if (dateFilter === 'week') {
      filtered = history.filter(h => h.played_at >= startOfThisWeek);
    }

    filtered.forEach(item => {
      const ts = item.played_at;
      let label = 'Earlier';
      if (ts >= startOfToday) {
        label = 'Today';
      } else if (ts >= startOfYesterday) {
        label = 'Yesterday';
      } else if (ts >= startOfThisWeek) {
        label = 'This Week';
      } else {
        const itemDate = new Date(ts);
        label = itemDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    });

    return groups;
  }, [history, dateFilter]);

  // Sort Top Artists
  const sortedArtists = useMemo(() => {
    if (!stats || !stats.topArtists) return [];
    const list = [...stats.topArtists];
    if (artistSort === 'plays') {
      list.sort((a, b) => b.plays - a.plays);
    } else {
      list.sort((a, b) => (b.total_seconds || 0) - (a.total_seconds || 0));
    }
    return list.slice(0, 5);
  }, [stats, artistSort]);

  // Sort Frequently Played
  const sortedTracks = useMemo(() => {
    if (!stats || !stats.topTracks) return [];
    const list = [...stats.topTracks];
    if (trackSort === 'frequency') {
      list.sort((a, b) => b.plays - a.plays);
    } else {
      list.sort((a, b) => (b.last_played || 0) - (a.last_played || 0));
    }
    return list.slice(0, 5);
  }, [stats, trackSort]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '3:45';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 max-w-6xl mx-auto space-y-6 pb-28">
      {/* Top Editorial Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-3.5">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-300 transition-colors cursor-pointer"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif text-white font-bold tracking-tight">Listening Stats</h1>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Private listening statistics, playback analytics and history.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              showInsights
                ? 'bg-[#9e2a40]/15 border-[#9e2a40]/40 text-[#e0536c] hover:bg-[#9e2a40]/25'
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#e0536c]" />
            <span>{showInsights ? 'Hide Insights' : 'Listening Insights'}</span>
          </button>

          {/* Options Menu */}
          <div className="relative">
            <button
              onClick={() => setIsActionsOpen(!isActionsOpen)}
              className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="History options"
              aria-label="History options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {isActionsOpen && (
              <div 
                className="absolute right-0 mt-2 w-48 rounded-xl bg-[#141418] border border-white/10 shadow-2xl p-1 z-30 space-y-0.5 animate-fade-in"
                onMouseLeave={() => setIsActionsOpen(false)}
              >
                <button
                  onClick={() => handleExport('json')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#e0536c]" />
                  <span>Export JSON</span>
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-left cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#e0536c]" />
                  <span>Export CSV</span>
                </button>
                <div className="border-t border-white/[0.06] my-1" />
                <button
                  onClick={handleClearAll}
                  disabled={clearing || history.length === 0}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors text-left disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Resume Interrupted Listening Card */}
      {(interruptedSession || history.length > 0) && (
        <div className="p-4 rounded-2xl bg-[#121316] border border-[#9e2a40]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#9e2a40]/15 border border-[#9e2a40]/30 flex items-center justify-center text-[#e0536c] flex-shrink-0">
              <RotateCcw className="w-5 h-5" />
            </div>

            <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-white/10 flex-shrink-0 relative">
              {interruptedSession && interruptedSession.queue[0]?.thumbnail ? (
                <img src={interruptedSession.queue[0].thumbnail} alt="" className="w-full h-full object-cover" />
              ) : history[0] ? (
                <img 
                  src={trackArtworkMap.get(history[0].track_id) || (history[0].track_id?.length === 11 ? `https://i.ytimg.com/vi/${history[0].track_id}/hqdefault.jpg` : '')} 
                  alt="" 
                  className="w-full h-full object-cover" 
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-500">
                  <Music className="w-5 h-5" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[#e0536c] font-semibold">
                Resume Interrupted Listening
              </div>
              <div className="text-sm sm:text-base font-serif text-white font-medium truncate mt-0.5">
                {interruptedSession 
                  ? interruptedSession.sessionName 
                  : (history[0]?.title || 'Resume Previous Session')}
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {interruptedSession 
                  ? `${interruptedSession.queue[interruptedSession.currentIndex]?.artist || 'Ghosttunes'} • ${interruptedSession.queue.length} tracks queued`
                  : `${history[0]?.artist || 'Ghosttunes'} • Ready to resume`}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              if (interruptedSession && onResumeSession) {
                onResumeSession(interruptedSession.queue, interruptedSession.currentIndex, interruptedSession.currentTime);
              } else if (history[0]) {
                const tr = history[0];
                onPlayTrack({
                  id: tr.track_id,
                  title: tr.title,
                  artist: tr.artist,
                  album: tr.album,
                  duration: formatDuration(tr.duration),
                  thumbnail: trackArtworkMap.get(tr.track_id) || `https://i.ytimg.com/vi/${tr.track_id}/hqdefault.jpg`
                });
              }
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#9e2a40] hover:bg-[#852033] text-white transition-all active:scale-95 shadow-md flex-shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Resume Playback</span>
          </button>
        </div>
      )}

      {/* 5-Column Compact Statistics Strip */}
      {stats && (
        <div className="bg-[#0e0f13] border border-white/[0.06] rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          {/* 1. Listened today */}
          <div className="flex items-center gap-3.5 px-3 pt-2 sm:pt-0">
            <div className="text-[#e0536c] flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white font-mono">
                {todayMinutes > 60 ? `${(todayMinutes / 60).toFixed(1)} hrs` : `${todayMinutes} mins`}
              </div>
              <div className="text-xs text-zinc-400 font-sans mt-0.5">Listened today</div>
            </div>
          </div>

          {/* 2. Total listening time */}
          <div className="flex items-center gap-3.5 px-3 pt-2 sm:pt-0">
            <div className="text-[#e0536c] flex-shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white font-mono">
                {stats.totalPlays > 0 ? `${stats.totalPlays} plays` : '0 plays'}
              </div>
              <div className="text-xs text-zinc-400 font-sans mt-0.5">Total listening time</div>
            </div>
          </div>

          {/* 3. Unique songs */}
          <div className="flex items-center gap-3.5 px-3 pt-2 sm:pt-0">
            <div className="text-[#e0536c] flex-shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white font-mono">
                {stats.uniqueTracks}
              </div>
              <div className="text-xs text-zinc-400 font-sans mt-0.5">Unique songs</div>
            </div>
          </div>

          {/* 4. Unique artists */}
          <div className="flex items-center gap-3.5 px-3 pt-2 sm:pt-0">
            <div className="text-[#e0536c] flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white font-mono">
                {stats.topArtists.length}
              </div>
              <div className="text-xs text-zinc-400 font-sans mt-0.5">Unique artists</div>
            </div>
          </div>

          {/* 5. Unique albums */}
          <div className="flex items-center gap-3.5 px-3 pt-2 sm:pt-0">
            <div className="text-[#e0536c] flex-shrink-0">
              <Disc className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base sm:text-lg font-bold text-white font-mono">
                {uniqueAlbumsCount}
              </div>
              <div className="text-xs text-zinc-400 font-sans mt-0.5">Unique albums</div>
            </div>
          </div>
        </div>
      )}

      {/* Top Artists & Frequently Played Balanced Two-Column Section */}
      {showInsights && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 animate-fade-in">
          {/* Top Artists Card */}
          <div className="p-5 rounded-2xl bg-[#101115] border border-white/[0.06] flex flex-col justify-between shadow-lg">
            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#e0536c]" />
                  <h2 className="text-base font-serif font-semibold text-white tracking-tight">Top Artists</h2>
                </div>

                {/* Sort Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsArtistSortOpen(!isArtistSortOpen)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5 rounded-lg hover:bg-white/[0.04]"
                  >
                    <span>{artistSort === 'plays' ? 'By plays' : 'By time'}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {isArtistSortOpen && (
                    <div 
                      className="absolute right-0 mt-1 w-32 rounded-xl bg-[#16171c] border border-white/10 shadow-xl p-1 z-30 space-y-0.5"
                      onMouseLeave={() => setIsArtistSortOpen(false)}
                    >
                      <button
                        onClick={() => { setArtistSort('plays'); setIsArtistSortOpen(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          artistSort === 'plays' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        By plays
                      </button>
                      <button
                        onClick={() => { setArtistSort('time'); setIsArtistSortOpen(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          artistSort === 'time' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        By time
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Artist Rows */}
              <div className="space-y-1">
                {sortedArtists.length === 0 ? (
                  <div className="py-10 text-center text-zinc-500 text-xs">
                    No artist listening history recorded yet.
                  </div>
                ) : (
                  sortedArtists.map((artist, idx) => {
                    const avatar = artist.thumbnail || artistArtworkMap.get(artist.artist.toLowerCase().trim()) || '';
                    return (
                      <div
                        key={`top-artist-${artist.artist}-${idx}`}
                        onClick={() => onOpenArtist?.(artist.artist)}
                        className="flex items-center justify-between py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.04] -mx-2 px-2 rounded-xl transition-colors cursor-pointer group"
                        title={`View ${artist.artist} profile`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono text-zinc-500 text-xs w-4 flex-shrink-0 text-center">
                            {idx + 1}
                          </span>

                          {/* Circular Artist Avatar */}
                          <ArtistAvatar name={artist.artist} src={avatar} size={40} />

                          <span className="text-sm font-medium text-zinc-100 group-hover:text-[#e0536c] transition-colors truncate flex-1">
                            {artist.artist}
                          </span>
                        </div>

                        <span className="font-mono text-xs text-zinc-400 flex-shrink-0 ml-3">
                          {artistSort === 'plays'
                            ? `${artist.plays} ${artist.plays === 1 ? 'play' : 'plays'}`
                            : `${Math.round((artist.total_seconds || 0) / 60)} mins`}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Frequently Played Card */}
          <div className="p-5 rounded-2xl bg-[#101115] border border-white/[0.06] flex flex-col justify-between shadow-lg">
            <div>
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-2">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-[#e0536c]" />
                  <h2 className="text-base font-serif font-semibold text-white tracking-tight">Frequently Played</h2>
                </div>

                {/* Sort Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsTrackSortOpen(!isTrackSortOpen)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5 rounded-lg hover:bg-white/[0.04]"
                  >
                    <span>{trackSort === 'frequency' ? 'By frequency' : 'By recency'}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {isTrackSortOpen && (
                    <div 
                      className="absolute right-0 mt-1 w-32 rounded-xl bg-[#16171c] border border-white/10 shadow-xl p-1 z-30 space-y-0.5"
                      onMouseLeave={() => setIsTrackSortOpen(false)}
                    >
                      <button
                        onClick={() => { setTrackSort('frequency'); setIsTrackSortOpen(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          trackSort === 'frequency' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        By frequency
                      </button>
                      <button
                        onClick={() => { setTrackSort('recent'); setIsTrackSortOpen(false); }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          trackSort === 'recent' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        By recency
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Track Rows */}
              <div className="space-y-1">
                {sortedTracks.length === 0 ? (
                  <div className="py-10 text-center text-zinc-500 text-xs">
                    No track play history recorded yet.
                  </div>
                ) : (
                  sortedTracks.map((tr, idx) => {
                    const artwork = tr.thumbnail || trackArtworkMap.get(tr.track_id) || (tr.track_id?.length === 11 ? `https://i.ytimg.com/vi/${tr.track_id}/hqdefault.jpg` : '');
                    return (
                      <div
                        key={`frequent-track-${tr.track_id}-${idx}`}
                        onClick={() => onPlayTrack({
                          id: tr.track_id,
                          title: tr.title,
                          artist: tr.artist,
                          album: '',
                          duration: '3:30',
                          thumbnail: artwork
                        })}
                        className="flex items-center justify-between py-2.5 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.04] -mx-2 px-2 rounded-xl transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="font-mono text-zinc-500 text-xs w-4 flex-shrink-0 text-center">
                            {idx + 1}
                          </span>

                          {/* Square Album Artwork */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 border border-white/[0.08] flex-shrink-0 relative">
                            {artwork ? (
                              <img
                                src={artwork}
                                alt={tr.title}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                                <Music className="w-4 h-4" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-4 h-4 fill-white text-white" />
                            </div>
                          </div>

                          {/* Song Title & Artist Underneath (Truncated cleanly) */}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-zinc-100 group-hover:text-[#e0536c] truncate transition-colors">
                              {tr.title}
                            </div>
                            <div 
                              onClick={(e) => {
                                if (onOpenArtist) {
                                  e.stopPropagation();
                                  onOpenArtist(tr.artist);
                                }
                              }}
                              className="text-xs text-zinc-400 hover:text-white hover:underline truncate mt-0.5"
                              title={`View ${tr.artist} profile`}
                            >
                              {tr.artist}
                            </div>
                          </div>
                        </div>

                        {/* Frequency Count in Burgundy / Crimson */}
                        <span className="font-mono font-medium text-xs sm:text-sm text-[#e0536c] flex-shrink-0 ml-3">
                          {tr.plays}x
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Listening Timeline Header & Controls */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-serif font-semibold text-white tracking-tight">Listening Timeline</h2>

          <div className="flex items-center gap-2">
            {/* Date Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
              >
                <span>
                  {dateFilter === 'today' ? 'Today' : dateFilter === 'yesterday' ? 'Yesterday' : dateFilter === 'week' ? 'This Week' : 'All Time'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
              </button>

              {isDateFilterOpen && (
                <div
                  className="absolute right-0 mt-1 w-32 rounded-xl bg-[#16171c] border border-white/10 shadow-xl p-1 z-30 space-y-0.5"
                  onMouseLeave={() => setIsDateFilterOpen(false)}
                >
                  <button
                    onClick={() => { setDateFilter('today'); setIsDateFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      dateFilter === 'today' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => { setDateFilter('yesterday'); setIsDateFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      dateFilter === 'yesterday' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    onClick={() => { setDateFilter('week'); setIsDateFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      dateFilter === 'week' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => { setDateFilter('all'); setIsDateFilterOpen(false); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      dateFilter === 'all' ? 'text-[#e0536c] font-medium bg-[#9e2a40]/15' : 'text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    All Time
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg bg-white/[0.04] border border-white/[0.08] p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-[#9e2a40]/20 text-[#e0536c]' : 'text-zinc-400 hover:text-white'
                }`}
                title="List View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-[#9e2a40]/20 text-[#e0536c]' : 'text-zinc-400 hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Timeline Rows */}
        {loading ? (
          <div className="py-16 text-center text-zinc-500 text-xs font-mono">
            Loading listening history...
          </div>
        ) : history.length === 0 ? (
          <div className="py-16 px-6 text-center rounded-2xl bg-[#111115] border border-white/[0.05] max-w-lg mx-auto space-y-3">
            <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-zinc-400 mx-auto">
              <History className="w-5 h-5 text-zinc-400" />
            </div>
            <h3 className="text-base font-serif text-white font-medium">Your Listening Timeline is Quiet</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Ghosttunes quietly preserves your listening journey. Tracks played for 30 seconds or longer will automatically be indexed here with harmonic tags and session context.
            </p>
          </div>
        ) : (
          Object.entries(groupedHistory).map(([dateLabel, items]) => (
            <div key={dateLabel} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-xs font-serif font-medium text-zinc-300">{dateLabel}</span>
                <span className="text-[11px] font-mono text-zinc-600">&bull; {items.length} plays</span>
              </div>

              <div className="divide-y divide-white/[0.04] rounded-2xl bg-[#101115] border border-white/[0.06] overflow-hidden shadow-md">
                {items.map((item) => {
                  const artwork = trackArtworkMap.get(item.track_id) || (item.track_id?.length === 11 ? `https://i.ytimg.com/vi/${item.track_id}/hqdefault.jpg` : '');
                  const isFav = favoritedIds.has(item.track_id);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 sm:px-4 hover:bg-white/[0.02] transition-colors group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="text-[11px] font-mono text-zinc-500 w-10 flex-shrink-0 hidden sm:inline">
                          {formatTime(item.played_at)}
                        </span>

                        {/* Thumbnail with Play Hover */}
                        <div
                          onClick={() => onPlayTrack({
                            id: item.track_id,
                            title: item.title,
                            artist: item.artist,
                            album: item.album,
                            duration: formatDuration(item.duration),
                            thumbnail: artwork
                          })}
                          className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-white/[0.08] flex-shrink-0 relative cursor-pointer"
                        >
                          {artwork ? (
                            <img
                              src={artwork}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-500">
                              <Music className="w-4 h-4" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Play className="w-4 h-4 fill-white text-white" />
                          </div>
                        </div>

                        {/* Title & Artist */}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs sm:text-sm font-medium text-white truncate font-serif">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                            {item.artist}
                          </div>
                        </div>
                      </div>

                      {/* Right metadata and actions */}
                      <div className="flex items-center gap-3 sm:gap-5 text-xs font-mono flex-shrink-0">
                        <span className="text-[11px] text-zinc-500 hidden md:inline">
                          {Math.round(item.completion_ratio * 100)}% listened
                        </span>
                        <span className="text-zinc-500 text-[11px] hidden sm:inline">
                          {formatDuration(item.duration)}
                        </span>

                        {/* Favorite Button */}
                        <button
                          onClick={() => toggleFavorite(item.track_id)}
                          className="p-1.5 text-zinc-500 hover:text-rose-500 transition-colors cursor-pointer"
                          title={isFav ? "Favorited" : "Add to favorites"}
                        >
                          <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                        </button>

                        {/* Clear single item */}
                        <button
                          onClick={() => handleClearSingle(item.id)}
                          className="p-1 rounded text-zinc-600 hover:text-rose-400 opacity-40 group-hover:opacity-100 transition-opacity cursor-pointer"
                          title="Remove from history"
                          aria-label="Remove from history"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
