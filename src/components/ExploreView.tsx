// src/components/ExploreView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Track, Playlist, HistoryItem } from '../types';
import { 
  Play, 
  Pause, 
  Heart, 
  MoreHorizontal, 
  Disc3, 
  AlertCircle, 
  RotateCcw, 
  Plus, 
  ListPlus, 
  Search, 
  Music,
  ChevronLeft,
  Shuffle,
  Trash2,
  Edit3,
  Layers,
  Check,
  Music2,
  ExternalLink,
  Download,
  CheckCircle2,
  Loader2,
  FolderSync,
  Dna,
  ShieldCheck, LayoutGrid, List, TrendingUp, CloudUpload, RotateCw, SlidersHorizontal, Sparkles
} from 'lucide-react';
import { getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';
import { TrackCollection } from './TrackCollection';
import { Artwork } from './Artwork';
import { MixesRow } from './MixesRow';
import { ArtistAvatar } from './ArtistAvatar';
import { upgradeToHighResArtwork } from '../utils/artwork';
import { getAllDownloadedTracks, getTopTracks, importLocalFiles } from '../services/desktopService';
import { getApiUrl } from '../utils/api';

/** Library lists made automatically: your most played, songs kept on this PC, your own files. */
const SMART_LISTS: Record<string, { name: string; description: string }> = {
  'smart:top': { name: 'My top 100', description: 'Your most played songs, counted from every listen' },
  'smart:cached': { name: 'Cached', description: 'Songs you’ve played are kept on this PC, so they start instantly and play offline (your last 80)' },
  'smart:uploaded': { name: 'Uploaded', description: 'Music files from your computer' },
};

export const GENRE_CHIPS = [
  'Trending',
  'Afrobeats',
  'Hip Hop',
  'R&B',
  'Amapiano',
  'Dancehall',
  'Rock',
  'Pop',
  'Indie'
];

interface Props {
  searchQuery: string;
  selectedGenre: string;
  onSelectGenre: (genre: string) => void;
  searchResults: Track[];
  genreTracks: Track[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  currentTrack: Track | null;
  isPlaying: boolean;
  favorites: Track[];
  playlists?: Playlist[];
  history?: HistoryItem[];
  activeTab?: 'explore' | 'library' | 'favorites';
  onPlayTrack: (track: Track, newQueue?: Track[]) => void;
  onTogglePlayPause: () => void;
  onToggleFavorite: (track: Track) => void;
  onOpenAddToPlaylist?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  isDataSaver?: boolean;
  onOpenImportModal?: () => void;
  onOpenBackupModal?: () => void;
  onCreateNewPlaylist?: () => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onRenamePlaylist?: (playlistId: string, newName: string) => void;
  onRemoveTrackFromPlaylist?: (playlistId: string, trackId: string) => void;
  selectedPlaylistId?: string | null;
  onSelectPlaylist?: (playlistId: string | null) => void;
  downloadedTrackIds?: Set<string>;
  downloadingTrackIds?: Set<string>;
  downloadingPlaylistIds?: Set<string>;
  pausedDownloadingTrackIds?: Set<string>;
  pausedDownloadingPlaylistIds?: Set<string>;
  onDownloadTrack?: (track: Track) => void;
  onDownloadPlaylist?: (playlist: Playlist, tracks: Track[]) => void;
  onOpenPlaylistRescue?: (playlist: Playlist) => void;
  onOpenArtist?: (artistName: string, artistId?: string) => void;
  onNavigateView?: (view: any) => void;
}

const CrispArtwork: React.FC<{ track: Track; className?: string; isDataSaver?: boolean }> = ({ track, className = '', isDataSaver = false }) => (
  <div className={`aspect-square w-full rounded-xl overflow-hidden ${className}`}>
    <Artwork src={track.thumbnail} localSrc={track.local_artwork_url} trackId={track.id} alt={track.title} isDataSaver={isDataSaver} />
  </div>
);

// 4-Artwork Collage Component for Playlist Covers
const PlaylistCollage: React.FC<{ playlist: Playlist; isDataSaver?: boolean }> = ({ playlist, isDataSaver = false }) => {
  if (playlist.thumbnail) {
    return (
      <img
        src={playlist.thumbnail}
        alt={playlist.name}
        className="w-full h-full object-cover"
      />
    );
  }

  const sampleTracks = playlist.tracks.slice(0, 4);
  if (sampleTracks.length === 0) {
    return (
      <div className="w-full h-full bg-[#18181c] flex items-center justify-center text-zinc-600">
        <Music className="w-8 h-8 opacity-40" />
      </div>
    );
  }

  if (sampleTracks.length < 4) {
    return <Artwork src={getOptimizedArtwork(sampleTracks[0].thumbnail, isDataSaver)} trackId={sampleTracks[0].id} alt={playlist.name} isDataSaver={isDataSaver} />;
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2">
      {sampleTracks.map((t, idx) => (
        <Artwork key={idx} src={getOptimizedArtwork(t.thumbnail, isDataSaver)} trackId={t.id} alt="" isDataSaver={isDataSaver} />
      ))}
    </div>
  );
};

export const ExploreView: React.FC<Props> = ({
  searchQuery,
  selectedGenre,
  onSelectGenre,
  searchResults,
  genreTracks,
  loading,
  error,
  onRetry,
  currentTrack,
  isPlaying,
  favorites,
  playlists = [],
  history = [],
  activeTab = 'explore',
  onPlayTrack,
  onTogglePlayPause,
  onToggleFavorite,
  onOpenAddToPlaylist,
  onAddToQueue,
  isDataSaver = false,
  onOpenImportModal,
  onOpenBackupModal,
  onCreateNewPlaylist,
  onDeletePlaylist,
  onRenamePlaylist,
  onRemoveTrackFromPlaylist,
  selectedPlaylistId: passedSelectedPlaylistId,
  onSelectPlaylist,
  downloadedTrackIds,
  downloadingTrackIds,
  downloadingPlaylistIds,
  pausedDownloadingTrackIds,
  pausedDownloadingPlaylistIds,
  onDownloadTrack,
  onDownloadPlaylist,
  onOpenPlaylistRescue,
  onOpenArtist,
  onNavigateView
}) => {
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<'tracks' | 'playlists' | 'artists' | 'albums' | 'podcasts'>('playlists');
  const [libraryView, setLibraryView] = useState<'list' | 'grid'>('list');
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [isSearchInputOpen, setIsSearchInputOpen] = useState(false);
  const [openMenuPlaylistId, setOpenMenuPlaylistId] = useState<string | null>(null);
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [internalSelectedPlaylistId, setInternalSelectedPlaylistId] = useState<string | null>(passedSelectedPlaylistId || null);
  const selectedPlaylistId = passedSelectedPlaylistId !== undefined ? passedSelectedPlaylistId : internalSelectedPlaylistId;
  const setSelectedPlaylistId = (id: string | null) => {
    setInternalSelectedPlaylistId(id);
    onSelectPlaylist?.(id);
  };
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('saved');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return localStorage.getItem('ghost_collection_view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
  });
  useEffect(() => { setCollectionQuery(''); setSortOrder('saved'); }, [activeTab, selectedPlaylistId]);
  useEffect(() => { try { localStorage.setItem('ghost_collection_view', viewMode); } catch {} }, [viewMode]);
  const filterText = collectionQuery.trim().toLocaleLowerCase();
  const filteredPlaylists = playlists.filter(playlist => !filterText || `${playlist.name} ${playlist.description || ''}`.toLocaleLowerCase().includes(filterText))
    .sort((a, b) => sortOrder === 'title' ? a.name.localeCompare(b.name) : b.createdAt - a.createdAt);
  const collectionControls = (includeFilter = true, includeLayout = true) => (
    <div className="flex flex-wrap items-center gap-3 py-4">
      {includeFilter && <input aria-label="Search this collection" placeholder="Search this collection…" value={collectionQuery} onChange={event => setCollectionQuery(event.target.value)} className="min-w-0 flex-1 sm:max-w-xs rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-rose-400/50" />}
      <select aria-label="Sort collection" value={sortOrder} onChange={event => setSortOrder(event.target.value)} className="rounded-lg border border-white/10 bg-[#141418] px-3 py-2 text-xs text-zinc-300">
        <option value="saved">Recently saved</option><option value="title">Title A–Z</option>{activeTab !== 'library' && <option value="artist">Artist A–Z</option>}
      </select>
      {includeLayout && <div className="flex gap-1 ml-auto" role="group" aria-label="Collection layout">
        <button onClick={() => setViewMode('grid')} title="Grid view" aria-label="Grid view" aria-pressed={viewMode === 'grid'} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-[#9e2a40]/25 text-rose-300' : 'text-zinc-400 hover:bg-white/5'}`}><LayoutGrid className="w-4 h-4" /></button>
        <button onClick={() => setViewMode('list')} title="List view" aria-label="List view" aria-pressed={viewMode === 'list'} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-[#9e2a40]/25 text-rose-300' : 'text-zinc-400 hover:bg-white/5'}`}><List className="w-4 h-4" /></button>
      </div>}
    </div>
  );

  // Close overflow menus on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMenuTrackId(null);
      setOpenMenuPlaylistId(null);
    };
    if (openMenuTrackId || openMenuPlaylistId) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuTrackId, openMenuPlaylistId]);

  // Selected playlist object
  const isSmartList = Boolean(selectedPlaylistId?.startsWith('smart:'));
  const [smartTracks, setSmartTracks] = useState<Record<string, Track[]>>({});
  const [smartLoading, setSmartLoading] = useState(false);
  const loadSmartList = async (id: string) => {
    setSmartLoading(true);
    try {
      let tracks: Track[] = [];
      if (id === 'smart:top') tracks = await getTopTracks(100);
      else if (id === 'smart:cached') {
        const res = await fetch(getApiUrl('/api/cache'));
        tracks = (await res.json()).tracks || [];
      } else if (id === 'smart:uploaded') {
        const all = await getAllDownloadedTracks();
        tracks = all.filter(t => t.id.startsWith('local_') || (t as any).source === 'local_import');
      }
      setSmartTracks(m => ({ ...m, [id]: tracks }));
    } catch {
      setSmartTracks(m => ({ ...m, [id]: [] }));
    } finally {
      setSmartLoading(false);
    }
  };
  useEffect(() => {
    if (selectedPlaylistId && SMART_LISTS[selectedPlaylistId]) loadSmartList(selectedPlaylistId);
  }, [selectedPlaylistId]);

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    const smart = SMART_LISTS[selectedPlaylistId];
    if (smart) return { id: selectedPlaylistId, name: smart.name, description: smart.description, tracks: smartTracks[selectedPlaylistId] || [], createdAt: 0 } as Playlist;
    return playlists.find(p => p.id === selectedPlaylistId) || null;
  }, [selectedPlaylistId, playlists, smartTracks]);

  // Determine active raw track collection based on tab and search
  const rawTracks = useMemo(() => {
    if (activeTab === 'favorites') {
      return favorites;
    }
    if (searchQuery.trim().length > 0) {
      return searchResults;
    }
    return genreTracks.length > 0 ? genreTracks : searchResults;
  }, [activeTab, searchQuery, searchResults, genreTracks, favorites]);

  // Deduplication for explore & search grid
  const displayTracks = useMemo(() => {
    const seenIds = new Set<string>();
    return rawTracks.filter(track => {
      if (!track?.id || seenIds.has(track.id)) return false;
      seenIds.add(track.id);
      return true;
    });
  }, [rawTracks]);
  const visibleTracks = displayTracks.filter(track => activeTab !== 'favorites' || !filterText ||
    `${track.title} ${track.artist} ${track.album || ''}`.toLocaleLowerCase().includes(filterText))
    .sort((a, b) => sortOrder === 'title' ? a.title.localeCompare(b.title) : sortOrder === 'artist' ? a.artist.localeCompare(b.artist) : 0);

  // Featured Top Result (Left Column)
  const topResult: Track | null = useMemo(() => {
    if (displayTracks.length === 0) return null;
    return displayTracks[0];
  }, [displayTracks]);

  const isTopResultPlaying = currentTrack?.id === topResult?.id && isPlaying;
  const isTopResultLiked = topResult ? favorites.some(f => String(f?.id ?? '').trim() === String(topResult.id).trim()) : false;

  // Permanent Playlist Deletion Confirmation Dialog Modal
  const renderDeleteModal = () => {
    if (!playlistToDelete) return null;
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150 select-none"
        onClick={() => setPlaylistToDelete(null)}
      >
        <div 
          className="w-full max-w-md p-6 rounded-3xl bg-[#141418] border border-white/15 shadow-2xl text-white space-y-4 animate-in zoom-in-95"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Delete Playlist
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Permanent removal confirmation
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-zinc-300 leading-relaxed bg-white/[0.02] p-3.5 rounded-2xl border border-white/5">
            <p>
              Are you sure you want to remove <span className="font-semibold text-white">"{playlistToDelete.name}"</span>?
            </p>
            {playlistToDelete.source ? (
              <p className="text-zinc-400">
                This was imported from <span className="text-zinc-200 capitalize">{playlistToDelete.source}</span>. Only the Ghosttunes copy will be deleted. The original playlist on {playlistToDelete.source === 'spotify' ? 'Spotify' : 'YouTube Music'} will not be modified.
              </p>
            ) : (
              <p className="text-zinc-400">
                This action is permanent and cannot be undone. Individual songs will remain safe in your catalogue and favourites.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              onClick={() => setPlaylistToDelete(null)}
              className="px-4 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const id = playlistToDelete.id;
                if (onDeletePlaylist) {
                  onDeletePlaylist(id);
                }
                if (selectedPlaylistId === id) {
                  setSelectedPlaylistId(null);
                }
                setPlaylistToDelete(null);
              }}
              className="px-5 py-2 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Playlist</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =========================================================================
  // VIEW: PLAYLIST DETAIL VIEW (When user clicks into an individual playlist)
  // =========================================================================
  if (activeTab === 'library' && selectedPlaylist) {
    const isPlaylistPlaying = selectedPlaylist.tracks.some(t => t.id === currentTrack?.id) && isPlaying;
    const playlistTracks = selectedPlaylist.tracks.filter(track => !filterText || `${track.title} ${track.artist}`.toLocaleLowerCase().includes(filterText)).sort((a, b) => sortOrder === 'title' ? a.title.localeCompare(b.title) : 0);
    const hasUnmatched = selectedPlaylist.unmatchedTracks && selectedPlaylist.unmatchedTracks.length > 0;

    const handlePlayAll = () => {
      if (selectedPlaylist.tracks.length > 0) {
        onPlayTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks);
      }
    };

    const handleShufflePlay = () => {
      if (selectedPlaylist.tracks.length > 0) {
        const shuffled = [...selectedPlaylist.tracks].sort(() => Math.random() - 0.5);
        onPlayTrack(shuffled[0], shuffled);
      }
    };

    const handleSaveRename = () => {
      if (renameText.trim() && onRenamePlaylist) {
        onRenamePlaylist(selectedPlaylist.id, renameText.trim());
      }
      setIsRenaming(false);
    };

    return (
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto px-6 sm:px-10 xl:px-16 pt-3 pb-24 scrollbar-thin select-none">
        
        {/* Back to Library Navigation */}
        <button
          onClick={() => setSelectedPlaylistId(null)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors mb-5 w-fit cursor-pointer group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Library</span>
        </button>

        {/* Hero Header Card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 pb-6 border-b border-white/[0.08]">
          <div className="w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden bg-[#18181c] border border-white/10 shadow-2xl flex-shrink-0">
            <PlaylistCollage playlist={selectedPlaylist} isDataSaver={isDataSaver} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Clean Metadata Row (No vibecoded source pills or dots) */}
            <div className="flex items-center gap-2 mb-2 text-xs text-zinc-400">
              <span className="font-medium text-zinc-300">{selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? 'song' : 'songs'}</span>
              {selectedPlaylist.sourceAuthor && (
                <>
                  <span className="text-zinc-600">•</span>
                  <span>Curated by {selectedPlaylist.sourceAuthor}</span>
                </>
              )}
            </div>

            {/* Title / Inline Rename */}
            {isRenaming ? (
              <div className="flex items-center gap-2 my-1">
                <input
                  type="text"
                  value={renameText}
                  onChange={e => setRenameText(e.target.value)}
                  className="bg-[#18181f] border border-white/20 rounded-xl px-3 py-1.5 text-xl font-bold text-white outline-none"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveRename();
                    if (e.key === 'Escape') setIsRenaming(false);
                  }}
                />
                <button
                  onClick={handleSaveRename}
                  className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 group">
                <h1 className="font-serif text-2xl sm:text-4xl font-bold text-white tracking-tight truncate">
                  {selectedPlaylist.name}
                </h1>
                {onRenamePlaylist && !isSmartList && (
                  <button
                    onClick={() => {
                      setRenameText(selectedPlaylist.name);
                      setIsRenaming(true);
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Rename playlist"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            <p className="text-xs sm:text-sm text-zinc-400 mt-1 line-clamp-2">
              {selectedPlaylist.description || (selectedPlaylist.sourceAuthor ? `Curated by ${selectedPlaylist.sourceAuthor}` : 'Ghosttunes collection')}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => isPlaylistPlaying ? onTogglePlayPause() : handlePlayAll()}
                disabled={selectedPlaylist.tracks.length === 0}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all active:scale-95 cursor-pointer ${
                  selectedPlaylist.tracks.length > 0
                    ? 'bg-[#6b1828] hover:bg-[#852033] text-white hover:scale-105'
                    : 'bg-white/5 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isPlaylistPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                <span>{isPlaylistPlaying ? 'Pause' : 'Play All'}</span>
              </button>

              <button
                onClick={handleShufflePlay}
                disabled={selectedPlaylist.tracks.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                title="Shuffle playlist"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>

              {onDownloadPlaylist && (
                <button
                  onClick={() => onDownloadPlaylist(selectedPlaylist, selectedPlaylist.tracks)}
                  disabled={selectedPlaylist.tracks.length === 0}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-semibold transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                    pausedDownloadingPlaylistIds?.has(selectedPlaylist.id)
                      ? 'bg-[#9e2a40]/20 text-[#e0536c] border-[#9e2a40]/40 hover:bg-[#9e2a40]/30'
                      : downloadingPlaylistIds?.has(selectedPlaylist.id)
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white'
                  }`}
                  title={
                    pausedDownloadingPlaylistIds?.has(selectedPlaylist.id)
                      ? "Playlist download paused. Click to play / resume."
                      : downloadingPlaylistIds?.has(selectedPlaylist.id)
                      ? "Playlist download in progress. Click to pause."
                      : "Download all songs in playlist for offline playback"
                  }
                >
                  {pausedDownloadingPlaylistIds?.has(selectedPlaylist.id) ? (
                    <Play className="w-3.5 h-3.5 fill-current text-[#e0536c]" />
                  ) : downloadingPlaylistIds?.has(selectedPlaylist.id) ? (
                    <Pause className="w-3.5 h-3.5 text-cyan-300" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {pausedDownloadingPlaylistIds?.has(selectedPlaylist.id) 
                      ? 'Resume Playlist' 
                      : downloadingPlaylistIds?.has(selectedPlaylist.id) 
                      ? 'Pause Playlist' 
                      : 'Download Playlist'}
                  </span>
                </button>
              )}

              {selectedPlaylistId === 'smart:uploaded' && (
                <button
                  onClick={async () => { const r = await importLocalFiles(); if (r.imported > 0) loadSmartList('smart:uploaded'); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  title="Add music files from your computer"
                >
                  <CloudUpload className="w-3.5 h-3.5" />
                  <span>Add files</span>
                </button>
              )}

              {onOpenPlaylistRescue && !isSmartList && (
                <button
                  onClick={() => onOpenPlaylistRescue(selectedPlaylist)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#9e2a40]/15 hover:bg-[#9e2a40]/25 border border-[#9e2a40]/30 text-[#e0536c] text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  title="Diagnose & Repair Missing or Broken Tracks"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Rescue & Repair</span>
                </button>
              )}

              {onDeletePlaylist && !isSmartList && (
                <button
                  onClick={() => setPlaylistToDelete(selectedPlaylist)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 border border-white/10 transition-colors cursor-pointer ml-auto text-xs font-semibold"
                  title="Remove playlist from Library"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Playlist</span>
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Unmatched Tracks Banner (if any) */}
        {hasUnmatched && (
          <div className="my-5 p-4 rounded-2xl bg-[#9e2a40]/10 border border-[#9e2a40]/20 text-[#e0536c]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-[#e0536c]" />
                <span>
                  {selectedPlaylist.unmatchedTracks!.length} {selectedPlaylist.unmatchedTracks!.length === 1 ? 'track' : 'tracks'} could not be matched automatically
                </span>
              </div>
              <button
                onClick={() => setShowUnmatched(!showUnmatched)}
                className="text-xs text-[#e0536c] hover:underline cursor-pointer"
              >
                {showUnmatched ? 'Hide details' : 'View unmatched songs'}
              </button>
            </div>

            {showUnmatched && (
              <div className="mt-3 pt-3 border-t border-[#9e2a40]/20 space-y-1.5 text-xs">
                {selectedPlaylist.unmatchedTracks!.map((ut, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 text-zinc-300">
                    <span className="truncate flex-1 pr-2">
                      {ut.title} - <span className="text-zinc-400">{ut.artist}</span>
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {ut.duration || 'External'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {collectionControls(true, false)}
        {/* Tracklist Table */}
        <div className="mt-6 space-y-1">
          {playlistTracks.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <Music2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{filterText ? 'No songs match this search.' : 'No songs in this playlist yet.'}</p>
            </div>
          ) : (
            playlistTracks.map((t, idx) => {
              const isCurrent = currentTrack?.id === t.id;
              const isTrackPlaying = isCurrent && isPlaying;
              const isLiked = favorites.some(f => String(f?.id ?? '').trim() === String(t.id).trim());

              return (
                <div
                  key={`${t.id}-${idx}`}
                  onClick={() => isCurrent ? onTogglePlayPause() : onPlayTrack(t, selectedPlaylist.tracks)}
                  className={`group flex items-center justify-between p-2.5 sm:p-3 rounded-2xl cursor-pointer transition-colors ${
                    isCurrent ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-zinc-300 hover:text-white'
                  }`}
                >
                  {/* Left: Index & Artwork & Title */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <span className="w-5 text-right text-xs font-mono text-zinc-500 flex-shrink-0 group-hover:hidden">
                      {idx + 1}
                    </span>
                    <button
                      className="w-5 flex items-center justify-center text-white hidden group-hover:flex flex-shrink-0"
                      title="Play"
                    >
                      {isTrackPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 flex-shrink-0">
                      <Artwork src={getOptimizedArtwork(t.thumbnail, isDataSaver, t.id)} localSrc={t.local_artwork_url} trackId={t.id} alt="" isDataSaver={isDataSaver} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs sm:text-sm font-semibold truncate ${isCurrent ? 'text-rose-400' : ''}`}>
                        {t.title}
                      </p>
                      <p 
                        onClick={(e) => {
                          if (onOpenArtist && t.artist) {
                            e.stopPropagation();
                            onOpenArtist(t.artist);
                          }
                        }}
                        className="text-[11px] text-zinc-400 hover:text-white hover:underline truncate mt-0.5 cursor-pointer"
                        title={`View ${t.artist} profile`}
                      >
                        {t.artist}
                      </p>
                    </div>
                  </div>

                  {/* Center: Album (hidden on small screens) */}
                  <div className="hidden md:block w-1/3 min-w-0 px-4 text-left">
                    <p className="text-xs text-zinc-400 truncate">
                      {t.album || 'Single'}
                    </p>
                  </div>

                  {/* Right: Duration & Actions */}
                  <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleFavorite(t)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title={isLiked ? "Remove favorite" : "Favorite"}
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>

                    {onDownloadTrack && (
                      <button
                        onClick={() => onDownloadTrack(t)}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          downloadedTrackIds?.has(t.id)
                            ? 'text-emerald-400'
                            : pausedDownloadingTrackIds?.has(t.id)
                            ? 'text-[#e0536c]'
                            : downloadingTrackIds?.has(t.id)
                            ? 'text-cyan-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                        title={
                          downloadedTrackIds?.has(t.id)
                            ? 'Downloaded for offline playback'
                            : pausedDownloadingTrackIds?.has(t.id)
                            ? 'Download paused. Click to play / resume.'
                            : downloadingTrackIds?.has(t.id)
                            ? 'Downloading track. Click to pause.'
                            : 'Download track for offline playback'
                        }
                      >
                        {downloadedTrackIds?.has(t.id) ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : pausedDownloadingTrackIds?.has(t.id) ? (
                          <Play className="w-4 h-4 text-[#e0536c] fill-current" />
                        ) : downloadingTrackIds?.has(t.id) ? (
                          <Pause className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    <span className="text-xs font-mono text-zinc-500 w-10 text-right">
                      {t.duration || '3:30'}
                    </span>

                    {onRemoveTrackFromPlaylist && !isSmartList && (
                      <button
                        onClick={() => onRemoveTrackFromPlaylist(selectedPlaylist.id, t.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        title="Remove from playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Permanent Playlist Deletion Confirmation Dialog Modal */}
        {renderDeleteModal()}

      </div>
    );
  }

  // =========================================================================
  // VIEW: LIBRARY OVERVIEW (When activeTab === 'library' and no playlist selected)
  // =========================================================================
  if (activeTab === 'library') {
    const totalLikedCount = favorites.length;
    const downloadedCount = downloadedTrackIds?.size || 0;
    const isSearchingLib = librarySearchQuery.trim().length > 0;

    return (
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto px-6 sm:px-10 xl:px-16 pt-4 pb-28 scrollbar-thin select-none relative">
        
        {/* Top Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-none">
          {[
            { id: 'tracks', label: 'Tracks' },
            { id: 'playlists', label: 'Playlists' },
            { id: 'artists', label: 'Artists' },
            { id: 'albums', label: 'Albums' },
            { id: 'podcasts', label: 'Podcasts' }
          ].map(tab => {
            const isActive = libraryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLibraryTab(tab.id as any)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#5c1324] text-white border border-[#8a2238] shadow-md'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/5'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Second Control Row: Sort Dropdown, Search, and View Mode Toggle */}
        <div className="flex items-center justify-between gap-3 py-3 border-b border-white/[0.06] mb-4">
          <div className="flex items-center gap-2.5">
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="appearance-none bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-300 text-xs font-medium py-2 pl-3.5 pr-8 rounded-full outline-none cursor-pointer transition-colors"
                title="Sort order"
              >
                <option value="saved">Date added</option>
                <option value="title">Title A–Z</option>
                <option value="recent">Recently played</option>
              </select>
              <ChevronLeft className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 -rotate-90 pointer-events-none" />
            </div>

            {/* Search Button / Input */}
            <div className="flex items-center">
              {isSearchInputOpen ? (
                <div className="flex items-center gap-2 bg-zinc-900 border border-white/15 px-3 py-1.5 rounded-full">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    value={librarySearchQuery}
                    onChange={(e) => setLibrarySearchQuery(e.target.value)}
                    placeholder="Search library..."
                    autoFocus
                    className="bg-transparent text-xs text-white outline-none w-36 sm:w-48 placeholder-zinc-500"
                  />
                  <button onClick={() => { setIsSearchInputOpen(false); setLibrarySearchQuery(''); }} className="text-zinc-500 hover:text-white">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSearchInputOpen(true)}
                  className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Search library"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* View Toggle: List View (Active Pink Pill) / Grid View */}
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-full border border-white/10">
            <button
              type="button"
              onClick={() => setLibraryView('list')}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                libraryView === 'list'
                  ? 'bg-[#f0a8b4] text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setLibraryView('grid')}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                libraryView === 'grid'
                  ? 'bg-[#f0a8b4] text-zinc-950 shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            PINNED SMART COLLECTIONS (Top 5 Gradient Squares)
           ========================================================================= */}
        {!isSearchingLib && (libraryTab === 'playlists' || libraryTab === 'tracks') && (
          <div className="space-y-1 mb-4">
            {/* 1. Liked */}
            <div
              onClick={() => {
                if (onNavigateView) onNavigateView('favorites');
                else if (favorites.length > 0) onPlayTrack(favorites[0], favorites);
              }}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff2a6d] via-[#d1105a] to-[#7b003a] flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                  <Heart className="w-6 h-6 fill-white text-white drop-shadow" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-rose-300 transition-colors">
                    Liked
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Favorite songs • {totalLikedCount} {totalLikedCount === 1 ? 'song' : 'songs'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (favorites.length > 0) onPlayTrack(favorites[0], favorites);
                }}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Play favorites"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* 2. Downloaded */}
            <div
              onClick={() => {
                if (onNavigateView) onNavigateView('downloads');
              }}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#ff9f1c] via-[#f77f00] to-[#d62828] flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                  <Download className="w-6 h-6 text-white stroke-[2.2] drop-shadow" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-300 transition-colors">
                    Downloaded
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Offline songs • {downloadedCount} {downloadedCount === 1 ? 'song' : 'songs'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateView) onNavigateView('downloads');
                }}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="View downloads"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* 3. My top 100 */}
            <div
              onClick={() => setSelectedPlaylistId('smart:top')}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#52b788] via-[#2d6a4f] to-[#1b4332] flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-6 h-6 text-white stroke-[2.4] drop-shadow" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                    My top 100
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Your top songs • Most played
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateView) onNavigateView('memory');
                }}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Top stats"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* 4. Cached */}
            <div
              onClick={() => setSelectedPlaylistId('smart:cached')}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#06d6a0] via-[#118ab2] to-[#073b4c] flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                  <RotateCw className="w-6 h-6 text-white stroke-[2.2] drop-shadow" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                    Cached
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Cached songs • Instant offline audio
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* 5. Uploaded */}
            <div
              onClick={() => setSelectedPlaylistId('smart:uploaded')}
              className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4cc9f0] via-[#4895ef] to-[#4361ee] flex items-center justify-center shadow-lg shrink-0 group-hover:scale-105 transition-transform">
                  <CloudUpload className="w-6 h-6 text-white stroke-[2.2] drop-shadow" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
                    Uploaded
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Your uploaded songs & local files
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            USER & IMPORTED PLAYLISTS (Always showing official playlist cover!)
           ========================================================================= */}
        {libraryView === 'list' ? (
          <div className="space-y-1">
            {filteredPlaylists.map(pl => {
              // IMPORTANT: Prioritize real playlist cover (cover_url or thumbnail) over track 0 album cover!
              const coverImg = pl.cover_url || pl.thumbnail || (pl as any).coverUrl || pl.tracks?.[0]?.thumbnail;
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="flex items-center justify-between p-2 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer group select-none relative"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-white/5 shrink-0 group-hover:scale-105 transition-transform shadow-md">
                      {coverImg ? (
                        <img src={coverImg} alt={pl.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                          <Disc3 className="w-6 h-6 text-zinc-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white group-hover:text-rose-300 transition-colors truncate">
                        {pl.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">
                        {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                        {pl.source ? ` • ${pl.source.toUpperCase()}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuPlaylistId(openMenuPlaylistId === pl.id ? null : pl.id);
                      }}
                      className="p-2 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      title="Playlist options"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {openMenuPlaylistId === pl.id && (
                      <div className="absolute right-0 top-full mt-1 w-44 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl py-1 z-50">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlaylistId(pl.id);
                            setOpenMenuPlaylistId(null);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-white/10 text-xs text-white flex items-center gap-2 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Open Playlist</span>
                        </button>
                        {onDeletePlaylist && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuPlaylistId(null);
                              setPlaylistToDelete(pl);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-rose-500/20 text-xs text-rose-400 flex items-center gap-2 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Playlist</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredPlaylists.map(pl => {
              const coverImg = pl.cover_url || pl.thumbnail || (pl as any).coverUrl || pl.tracks?.[0]?.thumbnail;
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className="group relative cursor-pointer flex flex-col"
                >
                  <div className="w-full aspect-square rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 shadow-lg group-hover:scale-105 transition-transform mb-2">
                    {coverImg ? (
                      <img src={coverImg} alt={pl.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                        <Disc3 className="w-8 h-8 text-zinc-400" />
                      </div>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-white truncate group-hover:text-rose-300 transition-colors">
                    {pl.name}
                  </h3>
                  <p className="text-xs text-zinc-400 truncate">
                    {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating + New playlist Button (Bottom Right) */}
        {onCreateNewPlaylist && (
          <div className="fixed bottom-24 right-8 z-30 flex items-center gap-2">
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="flex items-center gap-2 px-4 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white text-xs font-semibold shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer backdrop-blur-md"
                title="Import playlist"
              >
                <Layers className="w-4 h-4 text-rose-400" />
                <span>Import</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCreateNewPlaylist}
              className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#9e5a6a] hover:bg-[#b36b7b] text-white text-xs sm:text-sm font-semibold shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
              title="New playlist"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>New playlist</span>
            </button>
          </div>
        )}

        {/* Delete confirmation modal */}
        {renderDeleteModal()}
      </div>
    );
  }

  const searching = activeTab === 'explore' && Boolean(searchQuery.trim());
  const busy = activeTab === 'explore' && loading;
  const artists = searching ? [...new Set(displayTracks.map(track => track.artist))]
    .filter(artist => artist.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())).slice(0, 6) : [];

  return (
    <main className="flex-1 w-full min-h-0 overflow-y-auto p-6 lg:p-8 pb-28 scrollbar-thin select-none">
      
      {/* View Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white tracking-tight">
            {activeTab === 'favorites' ? 'Favourites' : searching ? `Results for “${searchQuery.trim()}”` : 'Explore'}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            {activeTab === 'favorites' 
              ? `${favorites.length} songs you love, all in one place.` 
              : searching 
              ? 'Songs and artists matching your search.' 
              : 'Find something for your next listening session.'}
          </p>
        </div>
        {activeTab === 'favorites' && favorites.length > 0 && (
          <button 
            onClick={() => onPlayTrack(visibleTracks[0], visibleTracks)} 
            disabled={!visibleTracks.length} 
            className="px-5 py-2.5 rounded-full bg-[#9e2a40] hover:bg-[#b3334c] text-white disabled:opacity-40 text-sm font-semibold flex items-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Play favourites</span>
          </button>
        )}
      </div>

      {/* Genre Chips (When in Explore & not searching) */}
      {activeTab === 'explore' && !searching && (
        <div className="flex gap-2 overflow-x-auto pb-5 scrollbar-none" aria-label="Browse by genre">
          {GENRE_CHIPS.map(genre => (
            <button 
              key={genre} 
              onClick={() => onSelectGenre(genre)} 
              aria-pressed={selectedGenre === genre} 
              className={`whitespace-nowrap px-4 py-2 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                selectedGenre === genre 
                  ? 'bg-[#5c1324] border-[#8a2238] text-white shadow-md' 
                  : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white hover:bg-white/[0.07]'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'favorites' && collectionControls()}

      {/* Error Banner */}
      {activeTab === 'explore' && error && (
        <div role="alert" className="flex items-center justify-between gap-4 p-4 mb-5 rounded-2xl bg-rose-950/40 border border-rose-500/20 text-sm text-rose-200">
          <span>{error}</span>
          <button onClick={onRetry} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-900/60 hover:bg-rose-900 text-white font-semibold cursor-pointer shrink-0">
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading Indicator */}
      {busy && (
        <div role="status" className="flex items-center gap-2 text-sm text-zinc-400 py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#e0536c]" />
          <span>{searching ? 'Searching music…' : 'Loading music…'}</span>
        </div>
      )}

      {/* =========================================================================
          SEARCH RESULTS VIEW: Top Result + Artists with Avatars + Songs List
         ========================================================================= */}
      {!busy && searching && (
        <div>
          {/* Top Result Card */}
          {topResult && (
            <section className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#141418] p-4 mb-6 max-w-2xl shadow-xl">
              <button 
                onClick={() => isTopResultPlaying ? onTogglePlayPause() : onPlayTrack(topResult, [topResult])} 
                aria-label={`Play top result: ${topResult.title}`} 
                className="w-20 h-20 shrink-0 rounded-xl overflow-hidden shadow cursor-pointer"
              >
                <CrispArtwork track={topResult} isDataSaver={isDataSaver} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-rose-300 mb-1">Top result</p>
                <h2 className="text-base sm:text-lg font-bold text-white line-clamp-2 leading-snug">{topResult.title}</h2>
                <p className="text-xs sm:text-sm text-zinc-400 truncate mt-0.5">{topResult.artist} · {topResult.duration || 'Song'}</p>
              </div>
              <button 
                onClick={() => currentTrack?.id === topResult.id ? onTogglePlayPause() : onPlayTrack(topResult, [topResult])} 
                aria-label={isTopResultPlaying ? 'Pause top result' : 'Play top result'} 
                className="p-3.5 rounded-full bg-[#9e2a40] hover:bg-[#b3334c] text-white shadow-xl cursor-pointer hover:scale-105 transition-all"
              >
                {isTopResultPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
            </section>
          )}

          {/* Artists Matching Search (REAL Circular Avatars + Name + "Artist" Subtitle) */}
          {artists.length > 0 && onOpenArtist && (
            <section className="mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {artists.map(artist => (
                  <button 
                    key={artist} 
                    onClick={() => onOpenArtist(artist)} 
                    className="flex items-center gap-3.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-all text-left group cursor-pointer shadow-sm"
                  >
                    <ArtistAvatar name={artist} size={50} className="shadow-md group-hover:scale-105 transition-transform" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white text-sm truncate group-hover:text-rose-300 transition-colors">
                        {artist}
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">Artist</div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Songs List */}
          {visibleTracks.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
                Songs ({visibleTracks.length})
              </h2>
              <TrackCollection 
                tracks={visibleTracks} 
                view="list" 
                currentTrack={currentTrack} 
                isPlaying={isPlaying} 
                favorites={favorites} 
                isDataSaver={isDataSaver} 
                onPlayTrack={(t) => onPlayTrack(t, [t])} 
                onTogglePlayPause={onTogglePlayPause} 
                onToggleFavorite={onToggleFavorite} 
                onOpenArtist={onOpenArtist} 
                onAddToQueue={onAddToQueue} 
                onOpenAddToPlaylist={onOpenAddToPlaylist} 
                onDownloadTrack={onDownloadTrack} 
                downloadedTrackIds={downloadedTrackIds} 
                downloadingTrackIds={downloadingTrackIds} 
                pausedDownloadingTrackIds={pausedDownloadingTrackIds} 
              />
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          EXPLORE VIEW: 3-Row Grid with Quick Mix Dice Card (Index 0)
         ========================================================================= */}
      {!busy && !searching && activeTab === 'explore' && visibleTracks.length > 0 && (
        <div className="space-y-6">
          <MixesRow kind="personal" history={history} favorites={favorites} isDataSaver={isDataSaver} onPlay={(list) => onPlayTrack(list[0], list)} />
          <MixesRow kind="moods" history={history} favorites={favorites} isDataSaver={isDataSaver} onPlay={(list) => onPlayTrack(list[0], list)} />
          <div className="relative group/carousel">
            {/* Carousel Navigation Chevrons */}
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('explore-carousel-scroll');
                if (el) el.scrollBy({ left: -460, behavior: 'smooth' });
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center shadow-2xl backdrop-blur-md border border-white/15 cursor-pointer z-20 transition-all opacity-0 group-hover/carousel:opacity-100 hover:scale-105"
              title="Scroll left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('explore-carousel-scroll');
                if (el) el.scrollBy({ left: 460, behavior: 'smooth' });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center shadow-2xl backdrop-blur-md border border-white/15 cursor-pointer z-20 transition-all opacity-90 group-hover/carousel:opacity-100 hover:scale-105"
              title="Scroll right"
            >
              <ChevronLeft className="w-5 h-5 rotate-180" />
            </button>

            {/* 3-Row Grid */}
            <div 
              id="explore-carousel-scroll"
              className="grid grid-rows-3 grid-flow-col auto-cols-[165px] sm:auto-cols-[185px] md:auto-cols-[205px] gap-3.5 overflow-x-auto pb-4 scroll-smooth scrollbar-none select-none"
            >
              {/* Card 0: The Quick Mix / Dice Card (5 Pastel Pink Dots) */}
              <div
                onClick={() => {
                  if (visibleTracks.length > 0) {
                    const randomIndex = Math.floor(Math.random() * visibleTracks.length);
                    onPlayTrack(visibleTracks[randomIndex], visibleTracks);
                  }
                }}
                className="relative aspect-square rounded-2xl p-4 bg-gradient-to-br from-[#4a121e] via-[#2c0c15] to-[#14060a] border border-white/10 hover:border-white/20 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] cursor-pointer flex flex-col justify-between group"
                title="Quick Mix • Tap for a surprise mix"
              >
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-16 h-16 grid grid-cols-3 grid-rows-3 p-1">
                    <div className="flex items-center justify-center"><div className="w-3.5 h-3.5 rounded-full bg-[#d1a1ae] shadow-[0_0_8px_rgba(209,161,174,0.6)]" /></div>
                    <div />
                    <div className="flex items-center justify-center"><div className="w-3.5 h-3.5 rounded-full bg-[#d1a1ae] shadow-[0_0_8px_rgba(209,161,174,0.6)]" /></div>
                    <div />
                    <div className="flex items-center justify-center"><div className="w-3.5 h-3.5 rounded-full bg-[#d1a1ae] shadow-[0_0_8px_rgba(209,161,174,0.6)]" /></div>
                    <div />
                    <div className="flex items-center justify-center"><div className="w-3.5 h-3.5 rounded-full bg-[#d1a1ae] shadow-[0_0_8px_rgba(209,161,174,0.6)]" /></div>
                    <div />
                    <div className="flex items-center justify-center"><div className="w-3.5 h-3.5 rounded-full bg-[#d1a1ae] shadow-[0_0_8px_rgba(209,161,174,0.6)]" /></div>
                  </div>
                </div>
                <div className="mt-auto">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300/80">Surprise Mix</span>
                  <p className="text-sm font-bold text-white leading-tight">Quick Mix</p>
                </div>
              </div>

              {/* Cards 1..N: Full-Bleed Media Cards */}
              {visibleTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isTrackPlaying = isCurrent && isPlaying;
                // Cards are ~250px: 544px art is sharp (2x) and far lighter than 1080px, so a full grid loads reliably.
                const highResCover = (upgradeToHighResArtwork(track.thumbnail) || track.thumbnail || '').replace(/=w1080-h1080/, '=w544-h544');
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    onClick={() => isCurrent ? onTogglePlayPause() : onPlayTrack(track, visibleTracks)}
                    className={`relative aspect-square rounded-2xl overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] bg-zinc-900 border ${
                      isCurrent ? 'border-rose-400 shadow-[0_0_20px_rgba(224,83,108,0.35)]' : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="block w-full h-full transition-transform duration-500 group-hover:scale-105">
                      <Artwork src={highResCover} localSrc={track.local_artwork_url} trackId={track.id} alt={track.title} isDataSaver={isDataSaver} />
                    </span>

                    {/* Dark gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 via-45% to-transparent pointer-events-none" />

                    {/* Source badge */}
                    <div className="absolute top-2.5 left-2.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80">
                      <Music2 className="w-3 h-3" />
                    </div>

                    {/* Center play button on hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="w-11 h-11 rounded-full bg-[#9e2a40] text-white flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
                        {isTrackPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                      </div>
                    </div>

                    {/* Bottom Overlaid Text */}
                    <div className="absolute bottom-0 inset-x-0 p-3 select-none">
                      <div className="text-[10px] font-semibold text-rose-300/90 uppercase tracking-wider truncate mb-0.5 drop-shadow">
                        {track.artist}
                      </div>
                      <div className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight drop-shadow-md">
                        {track.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Secondary Shelf: More Hits / Mixed For You */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
              Mixed for you ({visibleTracks.length} tracks)
            </h2>
            <TrackCollection 
              tracks={visibleTracks.slice(0, 18)} 
              view="list" 
              currentTrack={currentTrack} 
              isPlaying={isPlaying} 
              favorites={favorites} 
              isDataSaver={isDataSaver} 
              onPlayTrack={onPlayTrack} 
              onTogglePlayPause={onTogglePlayPause} 
              onToggleFavorite={onToggleFavorite} 
              onOpenArtist={onOpenArtist} 
              onAddToQueue={onAddToQueue} 
              onOpenAddToPlaylist={onOpenAddToPlaylist} 
              onDownloadTrack={onDownloadTrack} 
              downloadedTrackIds={downloadedTrackIds} 
              downloadingTrackIds={downloadingTrackIds} 
              pausedDownloadingTrackIds={pausedDownloadingTrackIds} 
            />
          </div>
        </div>
      )}

      {/* Favorites tab rendering */}
      {!busy && !searching && activeTab === 'favorites' && visibleTracks.length > 0 && (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">
            Saved songs ({visibleTracks.length})
          </h2>
          <TrackCollection 
            tracks={visibleTracks} 
            view={viewMode} 
            currentTrack={currentTrack} 
            isPlaying={isPlaying} 
            favorites={favorites} 
            isDataSaver={isDataSaver} 
            onPlayTrack={onPlayTrack} 
            onTogglePlayPause={onTogglePlayPause} 
            onToggleFavorite={onToggleFavorite} 
            onOpenArtist={onOpenArtist} 
            onAddToQueue={onAddToQueue} 
            onOpenAddToPlaylist={onOpenAddToPlaylist} 
            onDownloadTrack={onDownloadTrack} 
            downloadedTrackIds={downloadedTrackIds} 
            downloadingTrackIds={downloadingTrackIds} 
            pausedDownloadingTrackIds={pausedDownloadingTrackIds} 
          />
        </>
      )}

      {/* Empty State */}
      {!busy && visibleTracks.length === 0 && (
        <div className="py-16 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
          <Music className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
          <h2 className="text-lg font-semibold text-white">
            {activeTab === 'favorites' && !filterText ? 'Your favourites start here' : 'No songs found'}
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-sm mx-auto">
            {activeTab === 'favorites' 
              ? (filterText ? 'Try another title or artist.' : 'Tap the heart on a song to save it here.') 
              : 'Try another search or explore a different genre.'}
          </p>
        </div>
      )}
    </main>
  );
};
