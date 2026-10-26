import React, { useState, useEffect, useRef } from 'react';
import { Track, Playlist, HistoryItem } from '../types';
import { 
  X, 
  Search, 
  Heart, 
  ListMusic, 
  Play, 
  Clock, 
  FolderPlus, 
  Plus, 
  Trash2, 
  Loader2,
  Compass,
  AlertCircle,
  RotateCcw,
  MoreHorizontal,
  Disc3
} from 'lucide-react';
import { getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';
import { memoryGenreCache, memorySearchCache, recordDataSaved } from '../utils/dataSaver';
import { getApiUrl } from '../utils/api';

interface Props {
  isOpen: boolean;
  initialTab?: 'search' | 'library' | 'favorites' | 'history' | 'playlists';
  onClose: () => void;
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  currentTrack: Track | null;
  favorites: Track[];
  playlists: Playlist[];
  history: HistoryItem[];
  toggleFavorite: (track: Track) => void;
  createPlaylist: (name: string, description?: string) => Playlist;
  addTrackToPlaylist: (playlistId: string, track: Track) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  onOpenAddToPlaylist: (track: Track) => void;
  isDataSaver?: boolean;
}

const GENRE_CHIPS = [
  'Trending',
  'Afrobeats',
  'Hip Hop',
  'R&B',
  'Pop',
  'Amapiano',
  'Dancehall',
  'Rock',
  'Indie',
  'Classical'
];

// Robust artwork component with high-res resolution, fallback mechanism, and placeholder
const DrawerTrackArtwork: React.FC<{
  track: Track;
  className?: string;
  isDataSaver?: boolean;
}> = ({ track, className = '', isDataSaver = false }) => {
  const primaryUrl = isDataSaver 
    ? getThumbnailArtwork(track.thumbnail) 
    : getOptimizedArtwork(track.thumbnail, false);
  const fallbackUrl = track.id ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : '';
  const [currentSrc, setCurrentSrc] = useState(primaryUrl);
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCurrentSrc(isDataSaver ? getThumbnailArtwork(track.thumbnail) : getOptimizedArtwork(track.thumbnail, false));
    setHasError(false);
    setLoaded(false);
  }, [track.thumbnail, track.id, isDataSaver]);

  const handleError = () => {
    if (fallbackUrl && currentSrc !== fallbackUrl) {
      setCurrentSrc(fallbackUrl);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className={`relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-900 ${className}`}>
      {!loaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-tr from-zinc-900 via-zinc-800 to-zinc-900 animate-pulse flex items-center justify-center">
          <Disc3 className="w-5 h-5 text-white/20 animate-spin" />
        </div>
      )}
      {!hasError ? (
        <img
          src={currentSrc}
          alt={track.title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={`w-full h-full object-cover transition-all duration-300 ${
            loaded ? 'opacity-100 group-hover:scale-105' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-600 p-2 text-center">
          <Disc3 className="w-7 h-7 text-zinc-700 mb-1" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">No Artwork</span>
        </div>
      )}
    </div>
  );
};

export const ExploreDrawer: React.FC<Props> = ({
  isOpen,
  initialTab = 'search',
  onClose,
  onPlayTrack,
  currentTrack,
  favorites,
  playlists,
  history,
  toggleFavorite,
  createPlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  deletePlaylist,
  onOpenAddToPlaylist,
  isDataSaver = false
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'library'>('search');
  const [librarySubTab, setLibrarySubTab] = useState<'favorites' | 'playlists' | 'history'>('favorites');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [selectedGenre, setSelectedGenre] = useState('Trending');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const genreAbortRef = useRef<AbortController | null>(null);

  // Sync initial tab when opened
  useEffect(() => {
    if (isOpen) {
      if (initialTab === 'favorites') {
        setActiveTab('library');
        setLibrarySubTab('favorites');
      } else if (initialTab === 'history') {
        setActiveTab('library');
        setLibrarySubTab('history');
      } else if (initialTab === 'playlists') {
        setActiveTab('library');
        setLibrarySubTab('playlists');
      } else if (initialTab === 'search' || initialTab === 'library') {
        setActiveTab(initialTab);
      }
    }
  }, [isOpen, initialTab]);

  // Load initial genre tracks if empty
  useEffect(() => {
    if (isOpen && genreTracks.length === 0) {
      fetchGenreTracks('Trending');
    }
  }, [isOpen]);

  // Escape key closes drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside closes track dropdown menu
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuTrackId(null);
    if (openMenuTrackId) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuTrackId]);

  // Auto-debounce search query (300ms) with cancellation
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(trimmed);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const executeSearch = async (query: string) => {
    if (!query) return;

    // Check client-side memory cache
    const cacheKey = query.toLowerCase();
    if (memorySearchCache.has(cacheKey)) {
      setSearchResults(memorySearchCache.get(cacheKey)!);
      recordDataSaved(4500); // Saved network payload bytes
      return;
    }

    // Cancel any previous search in flight
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(query)}`), {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      memorySearchCache.set(cacheKey, results);
      setSearchResults(results);
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Expected cancellation
      console.error('Search failed', e);
      setError(e.message || 'Search request failed. Please check connection.');
    } finally {
      if (searchAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const fetchGenreTracks = async (genre: string) => {
    setSelectedGenre(genre);

    // Check client-side memory cache
    if (memoryGenreCache.has(genre)) {
      setGenreTracks(memoryGenreCache.get(genre)!);
      recordDataSaved(3500); // Saved network payload bytes
      return;
    }

    // Cancel any previous genre fetch in flight
    if (genreAbortRef.current) {
      genreAbortRef.current.abort();
    }
    const controller = new AbortController();
    genreAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const q = genre === 'Trending' ? 'Trending Hits' : genre;
      const res = await fetch(getApiUrl(`/api/genre?q=${encodeURIComponent(q)}`), {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      const tracks = data.tracks || [];
      memoryGenreCache.set(genre, tracks);
      setGenreTracks(tracks);
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Expected cancellation
      console.error('Failed to fetch genre tracks', e);
      setError(e.message || 'Failed to fetch tracks. Please check connection.');
    } finally {
      if (genreAbortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      executeSearch(searchQuery.trim());
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
  };

  if (!isOpen) return null;

  const currentDisplayTracks = searchResults.length > 0 ? searchResults : genreTracks;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Dimmed Soft Backdrop (Player visible in remaining 30-40% viewport) */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
        aria-label="Close Explore & Library Panel"
      />

      {/* Spacious Full-Height Overlay (60-65% Desktop Viewport Width) */}
      <div className="relative w-full md:w-[70%] lg:w-[65%] xl:w-[62%] 2xl:w-[60%] max-w-6xl bg-[#0d0d12]/98 backdrop-blur-3xl border-l border-white/[0.08] shadow-[0_0_80px_rgba(0,0,0,0.85)] h-full flex flex-col z-10 animate-in slide-in-from-right duration-300 font-sans">
        
        {/* =====================================================================
            1. FIXED TOP HEADER: Tabs & Search Bar (Locked while results scroll)
           ===================================================================== */}
        <div className="flex-shrink-0 border-b border-white/[0.08] bg-[#0d0d12] px-6 py-4 space-y-3.5 z-20">
          
          {/* Tabs row & Close button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 rounded-2xl border border-white/5">
              <button
                onClick={() => { setActiveTab('search'); setSelectedPlaylist(null); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all outline-none ${
                  activeTab === 'search'
                    ? 'bg-zinc-800 text-white border border-white/10 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Explore & Search</span>
              </button>

              <button
                onClick={() => { setActiveTab('library'); setSelectedPlaylist(null); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all outline-none ${
                  activeTab === 'library'
                    ? 'bg-zinc-800 text-white border border-white/10 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Library</span>
              </button>
            </div>

            {/* Always visible Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white/30"
              title="Close Panel (Esc)"
              aria-label="Close Panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search field (Fixed at top in search tab) */}
          {activeTab === 'search' && (
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs, artists, albums on YouTube Music..."
                className="w-full bg-zinc-900/90 border border-white/10 rounded-2xl pl-11 pr-10 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSearchResults([]); setError(null); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-white transition-colors"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </form>
          )}

          {/* Genre chips (Scrollable row) */}
          {activeTab === 'search' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-nowrap">
              {GENRE_CHIPS.map(g => {
                const isSelected = selectedGenre === g && searchResults.length === 0;
                return (
                  <button
                    key={g}
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      fetchGenreTracks(g);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border outline-none ${
                      isSelected
                        ? 'bg-white/15 text-white border-white/25 shadow-sm'
                        : 'bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 border-white/[0.06] hover:bg-white/[0.05]'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          )}

        </div>

        {/* =====================================================================
            2. SCROLLABLE RESULTS AREA (Independent scrolling)
           ===================================================================== */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin">
          
          {/* --- EXPLORE & SEARCH CONTENT --- */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
                  {searchResults.length > 0 ? `Search Results (${searchResults.length})` : `${selectedGenre} Hits`}
                </h3>
                {loading && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading...</span>
                  </div>
                )}
              </div>

              {/* Error Notification */}
              {error && (
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/20 text-red-200 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                  <button
                    onClick={() => fetchGenreTracks(selectedGenre)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-900/40 hover:bg-red-800/50 border border-red-500/30 text-white font-medium transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Loading Skeletons */}
              {loading && currentDisplayTracks.length === 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex flex-col p-2.5 rounded-2xl bg-zinc-900/40 border border-white/[0.04] animate-pulse">
                      <div className="aspect-square w-full rounded-xl bg-zinc-800/60 mb-2.5" />
                      <div className="h-3 bg-zinc-800/60 rounded w-3/4 mb-1.5" />
                      <div className="h-2.5 bg-zinc-800/40 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty Search State */}
              {!loading && !error && searchResults.length === 0 && searchQuery && (
                <div className="py-16 text-center text-zinc-500 flex flex-col items-center justify-center">
                  <Search className="w-8 h-8 text-zinc-600 mb-2" />
                  <p className="font-semibold text-zinc-300 text-sm">No results found</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                    We couldn't find any results for "{searchQuery}". Try searching by song name or artist.
                  </p>
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                    className="mt-3.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium border border-white/10 transition-colors"
                  >
                    Clear Search
                  </button>
                </div>
              )}

              {/* Responsive Grid of Track Cards (3-4 Columns on Desktop) */}
              {currentDisplayTracks.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                  {currentDisplayTracks.map(t => {
                    const isCurrent = currentTrack?.id === t.id;
                    const isLiked = favorites.some(f => f.id === t.id);

                    return (
                      <div
                        key={t.id}
                        className="group relative flex flex-col p-2.5 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900/75 border border-white/[0.05] hover:border-white/15 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-xl"
                        onClick={() => onPlayTrack(t, currentDisplayTracks)}
                      >
                        {/* Square Album Cover with Robust Fallback */}
                        <div className="relative">
                          <DrawerTrackArtwork track={t} isDataSaver={isDataSaver} />

                          {/* Hover Play Button Overlay */}
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl pointer-events-none">
                            <div className="w-10 h-10 rounded-full bg-white text-black shadow-2xl flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform">
                              <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                            </div>
                          </div>
                        </div>

                        {/* Metadata Beneath Card */}
                        <div className="w-full mt-2.5 px-0.5 flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <p 
                              title={t.title}
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                isCurrent ? 'text-white font-bold' : 'text-zinc-200 group-hover:text-white'
                              }`}
                            >
                              {t.title}
                            </p>
                            <p 
                              title={t.artist}
                              className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5"
                            >
                              {t.artist}
                            </p>
                          </div>

                          {/* Overflow Menu Button */}
                          <div className="relative flex items-center flex-shrink-0" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setOpenMenuTrackId(openMenuTrackId === t.id ? null : t.id)}
                              className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                              title="More options"
                              aria-label="More options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {/* Dropdown Action Menu */}
                            {openMenuTrackId === t.id && (
                              <div 
                                className="absolute right-0 bottom-full mb-1.5 w-44 bg-zinc-900 border border-white/15 rounded-xl shadow-2xl py-1.5 z-40 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    toggleFavorite(t);
                                    setOpenMenuTrackId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors"
                                >
                                  <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
                                  <span>{isLiked ? 'Remove from Favourites' : 'Add to Favourites'}</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onOpenAddToPlaylist(t);
                                    setOpenMenuTrackId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5 text-zinc-400" />
                                  <span>Add to Playlist...</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* --- LIBRARY CONTENT --- */}
          {activeTab === 'library' && (
            <div className="space-y-5">
              {/* Library Subtabs */}
              <div className="flex items-center gap-1.5 p-1 bg-zinc-900/80 rounded-2xl border border-white/[0.06]">
                <button
                  onClick={() => { setLibrarySubTab('favorites'); setSelectedPlaylist(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all outline-none ${
                    librarySubTab === 'favorites' 
                      ? 'bg-zinc-800 text-white border border-white/10 shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${librarySubTab === 'favorites' ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span>Favourites ({favorites.length})</span>
                </button>
                <button
                  onClick={() => { setLibrarySubTab('playlists'); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all outline-none ${
                    librarySubTab === 'playlists' 
                      ? 'bg-zinc-800 text-white border border-white/10 shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  <span>Playlists ({playlists.length})</span>
                </button>
                <button
                  onClick={() => { setLibrarySubTab('history'); setSelectedPlaylist(null); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all outline-none ${
                    librarySubTab === 'history' 
                      ? 'bg-zinc-800 text-white border border-white/10 shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>History ({history.length})</span>
                </button>
              </div>

              {/* FAVORITES VIEW */}
              {librarySubTab === 'favorites' && (
                <div>
                  {favorites.length === 0 ? (
                    <div className="py-16 text-center text-zinc-500 text-xs">
                      <Heart className="w-8 h-8 mx-auto mb-2 opacity-30 text-rose-400" />
                      <p className="font-semibold text-zinc-300 text-sm">No favourites yet</p>
                      <p className="text-zinc-500 mt-1">Click the heart on any song or album card to save it here</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {favorites.map(t => {
                        const isCurrent = currentTrack?.id === t.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => onPlayTrack(t, favorites)}
                            className={`group flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${
                              isCurrent
                                ? 'bg-white/[0.08] border-l-[3px] border-l-white border-t-transparent border-r-transparent border-b-transparent text-white'
                                : 'bg-white/[0.02] hover:bg-white/[0.06] border-transparent hover:border-white/[0.06] text-zinc-300 hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                              <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900 shadow">
                                <img 
                                  src={getThumbnailArtwork(t.thumbnail)} 
                                  alt={t.title} 
                                  loading="lazy"
                                  className="w-full h-full object-cover" 
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    if (!img.src.includes('ytimg.com') && t.id) {
                                      img.src = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
                                    }
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                  <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs sm:text-sm font-semibold truncate ${isCurrent ? 'text-white font-bold' : 'text-zinc-100 group-hover:text-white'}`}>
                                  {t.title}
                                </p>
                                <p className="text-[11px] sm:text-xs text-zinc-400 truncate mt-0.5">{t.artist}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <span className="text-xs font-mono text-zinc-500 mr-1">{t.duration}</span>
                              <button
                                onClick={() => toggleFavorite(t)}
                                className="p-1.5 text-rose-500/90 hover:bg-white/10 rounded-lg transition-colors"
                                title="Remove from Favourites"
                                aria-label="Remove from Favourites"
                              >
                                <Heart className="w-4 h-4 fill-rose-500/90" />
                              </button>
                              <button
                                onClick={() => onOpenAddToPlaylist(t)}
                                className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                title="Add to playlist"
                                aria-label="Add to playlist"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* PLAYLISTS VIEW */}
              {librarySubTab === 'playlists' && (
                <div className="space-y-4">
                  {/* Create Playlist Bar */}
                  <form onSubmit={handleCreatePlaylist} className="flex gap-2">
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="New playlist name..."
                      className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
                    />
                    <button
                      type="submit"
                      disabled={!newPlaylistName.trim()}
                      className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/20 disabled:opacity-40 text-white text-xs font-semibold border border-white/10 transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create</span>
                    </button>
                  </form>

                  {/* Playlists List / Detail */}
                  {selectedPlaylist ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/10">
                        <div>
                          <button
                            onClick={() => setSelectedPlaylist(null)}
                            className="text-xs text-zinc-400 hover:text-white mb-1 transition-colors flex items-center gap-1"
                          >
                            ← Back to all playlists
                          </button>
                          <h4 className="text-sm font-bold text-white">{selectedPlaylist.name}</h4>
                          <p className="text-[11px] text-zinc-500">{selectedPlaylist.tracks.length} tracks</p>
                        </div>
                        {selectedPlaylist.tracks.length > 0 && (
                          <button
                            onClick={() => onPlayTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-black text-xs font-semibold shadow hover:scale-105 active:scale-95 transition-all"
                          >
                            <Play className="w-3.5 h-3.5 fill-black" />
                            <span>Play All</span>
                          </button>
                        )}
                      </div>

                      {selectedPlaylist.tracks.length === 0 ? (
                        <div className="py-12 text-center text-zinc-500 text-xs">
                          <p>This playlist is empty.</p>
                          <p className="mt-1">Add tracks by clicking the "+" menu on any song card.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {selectedPlaylist.tracks.map(t => (
                            <div
                              key={t.id}
                              onClick={() => onPlayTrack(t, selectedPlaylist.tracks)}
                              className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.06] cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                                  <img 
                                    src={getThumbnailArtwork(t.thumbnail)} 
                                    alt={t.title} 
                                    loading="lazy"
                                    className="w-full h-full object-cover" 
                                    onError={(e) => {
                                      const img = e.currentTarget;
                                      if (!img.src.includes('ytimg.com') && t.id) {
                                        img.src = `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`;
                                      }
                                    }}
                                  />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-white truncate">{t.title}</p>
                                  <p className="text-[11px] text-zinc-400 truncate">{t.artist}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <span className="text-xs font-mono text-zinc-500">{t.duration}</span>
                                <button
                                  onClick={() => removeTrackFromPlaylist(selectedPlaylist.id, t.id)}
                                  className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                                  title="Remove from playlist"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {playlists.length === 0 ? (
                        <div className="py-12 text-center text-zinc-500 text-xs">
                          <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                          <p className="font-semibold text-zinc-300 text-sm">No playlists yet</p>
                          <p className="text-zinc-500 mt-1">Create one above to organize your favorite songs</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {playlists.map(pl => (
                            <div
                              key={pl.id}
                              onClick={() => setSelectedPlaylist(pl)}
                              className="p-3.5 rounded-xl bg-zinc-900/60 hover:bg-zinc-900 border border-white/5 hover:border-white/15 cursor-pointer transition-all group"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <ListMusic className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePlaylist(pl.id);
                                  }}
                                  className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                                  title="Delete playlist"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <h4 className="text-xs font-bold text-white truncate">{pl.name}</h4>
                              <p className="text-[10px] text-zinc-400 mt-0.5">{pl.tracks.length} tracks</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* HISTORY VIEW */}
              {librarySubTab === 'history' && (
                <div>
                  {history.length === 0 ? (
                    <div className="py-16 text-center text-zinc-500 text-xs">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-30 text-zinc-400" />
                      <p className="font-semibold text-zinc-300 text-sm">No listening history</p>
                      <p className="text-zinc-500 mt-1">Songs you play will automatically appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map((item, idx) => {
                        const isCurrent = currentTrack?.id === item.track.id;
                        return (
                          <div
                            key={`hist-${item.track.id}-${idx}`}
                            onClick={() => onPlayTrack(item.track)}
                            className="group flex items-center justify-between p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.06] cursor-pointer transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                              <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-900 flex-shrink-0">
                                <img 
                                  src={getThumbnailArtwork(item.track.thumbnail)} 
                                  alt={item.track.title} 
                                  loading="lazy"
                                  className="w-full h-full object-cover" 
                                  onError={(e) => {
                                    const img = e.currentTarget;
                                    if (!img.src.includes('ytimg.com') && item.track.id) {
                                      img.src = `https://i.ytimg.com/vi/${item.track.id}/hqdefault.jpg`;
                                    }
                                  }}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs font-semibold truncate ${isCurrent ? 'text-white font-bold' : 'text-zinc-200 group-hover:text-white'}`}>
                                  {item.track.title}
                                </p>
                                <p className="text-[11px] text-zinc-400 truncate">{item.track.artist}</p>
                              </div>
                            </div>
                            <span className="text-xs font-mono text-zinc-500">{item.track.duration}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

      </div>
    </div>
  );
};
