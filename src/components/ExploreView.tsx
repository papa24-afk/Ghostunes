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
  ShieldCheck, LayoutGrid, List
} from 'lucide-react';
import { getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';
import { TrackCollection } from './TrackCollection';
import { Artwork } from './Artwork';

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
    return (
      <img
        src={getOptimizedArtwork(sampleTracks[0].thumbnail, isDataSaver)}
        alt={playlist.name}
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2">
      {sampleTracks.map((t, idx) => (
        <img
          key={idx}
          src={getOptimizedArtwork(t.thumbnail, isDataSaver)}
          alt=""
          className="w-full h-full object-cover"
        />
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
  onOpenArtist
}) => {
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
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
  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return playlists.find(p => p.id === selectedPlaylistId) || null;
  }, [selectedPlaylistId, playlists]);

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
                {onRenamePlaylist && (
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

              {onOpenPlaylistRescue && (
                <button
                  onClick={() => onOpenPlaylistRescue(selectedPlaylist)}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#9e2a40]/15 hover:bg-[#9e2a40]/25 border border-[#9e2a40]/30 text-[#e0536c] text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                  title="Diagnose & Repair Missing or Broken Tracks"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Rescue & Repair</span>
                </button>
              )}

              {onDeletePlaylist && (
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
                      <img
                        src={t.local_artwork_url || getOptimizedArtwork(t.thumbnail, isDataSaver, t.id)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (t.id && !img.src.includes('/api/artwork/')) {
                            img.src = `http://127.0.0.1:3001/api/artwork/${t.id}`;
                          }
                        }}
                      />
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

                    {onRemoveTrackFromPlaylist && (
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
    return (
      <div className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto px-6 sm:px-10 xl:px-16 pt-3 pb-24 scrollbar-thin select-none">
        
        {/* Library Header with Import & Create Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold text-white tracking-tight">
              My Library
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Your playlists, collections, and imported music from Spotify, Apple Music, YouTube Music, and Deezer
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onOpenImportModal && (
              <button
                onClick={onOpenImportModal}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#6b1828] hover:bg-[#852033] text-white text-xs font-semibold shadow-lg hover:scale-[1.02] active:scale-95 transition-all cursor-pointer"
                title="Import playlist from Spotify, Apple Music, YouTube Music, or Deezer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Import Playlist</span>
                <span className="flex items-center gap-1 pl-1 border-l border-white/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1ed760]" title="Spotify" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#fc3c44]" title="Apple Music" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff0000]" title="YouTube Music" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[#a238ff]" title="Deezer" />
                </span>
              </button>
            )}

            {onCreateNewPlaylist && (
              <button
                onClick={onCreateNewPlaylist}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                title="Create a new playlist"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Playlist</span>
              </button>
            )}

            {onOpenBackupModal && (
              <button
                onClick={onOpenBackupModal}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                title="Backup & Restore Library"
              >
                <FolderSync className="w-3.5 h-3.5 text-cyan-400" />
                <span>Backup & Restore</span>
              </button>
            )}
          </div>
        </div>

        {collectionControls()}

        {/* Playlists Shelf */}
        <div className="mt-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Playlists ({filteredPlaylists.length})
          </h2>

          {playlists.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center text-center space-y-4 my-4">
              <div className="w-14 h-14 rounded-2xl bg-[#6b1828]/20 border border-[#852033]/30 flex items-center justify-center text-[#ff8099]">
                <Layers className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white tracking-tight">
                  No Playlists Found
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">
                  Import your favorite playlists directly from Spotify, Apple Music, YouTube Music, or Deezer, or start an empty playlist.
                </p>
              </div>
              {onOpenImportModal && (
                <button
                  onClick={onOpenImportModal}
                  className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6b1828] hover:bg-[#852033] text-white text-xs font-semibold shadow-lg hover:scale-105 transition-all cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                  <span>Import Playlist (Spotify, Apple, YouTube, Deezer)</span>
                </button>
              )}
            </div>
          ) : (
            <div className={viewMode === 'list' ? 'flex flex-col gap-2' : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-4'}>
              {filteredPlaylists.map(pl => {
                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedPlaylistId(pl.id); } }}
                    className={`group relative flex ${viewMode === 'list' ? 'flex-row items-center gap-4' : 'flex-col'} p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/15 transition-all cursor-pointer`}
                  >
                    {/* Artwork Container */}
                    <div className={`relative ${viewMode === 'list' ? 'w-14 h-14 shrink-0' : 'aspect-square w-full mb-3'} rounded-xl overflow-hidden bg-[#18181c] border border-white/5 shadow`}>
                      <PlaylistCollage playlist={pl} isDataSaver={isDataSaver} />

                      {/* Hover Play Button */}
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pl.tracks.length > 0) onPlayTrack(pl.tracks[0], pl.tracks);
                          }}
                          className="w-11 h-11 rounded-full bg-[#6b1828] hover:bg-[#852033] text-white shadow-xl flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform cursor-pointer"
                          title="Play all"
                        >
                          <Play className="w-4 h-4 fill-white ml-0.5" />
                        </button>
                      </div>

                      {/* Three-dot Context Menu Button */}
                      <div className="absolute top-2 right-2 z-20" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setOpenMenuPlaylistId(openMenuPlaylistId === pl.id ? null : pl.id)}
                          className="w-7 h-7 rounded-full bg-black/70 hover:bg-black/95 backdrop-blur-md border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-md"
                          title="Playlist options"
                          aria-label="Playlist options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {openMenuPlaylistId === pl.id && (
                          <div 
                            className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-[#141419] border border-white/15 shadow-2xl py-1 text-xs z-30 animate-in fade-in duration-150 select-none"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setOpenMenuPlaylistId(null);
                                if (pl.tracks.length > 0) onPlayTrack(pl.tracks[0], pl.tracks);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-white/10 text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Play Playlist</span>
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenuPlaylistId(null);
                                setSelectedPlaylistId(pl.id);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-white/10 text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View Details</span>
                            </button>
                            {onDownloadPlaylist && (
                              <button
                                onClick={() => {
                                  setOpenMenuPlaylistId(null);
                                  if (pl.tracks.length > 0) {
                                    onDownloadPlaylist(pl, pl.tracks);
                                  }
                                }}
                                disabled={pl.tracks.length === 0 || downloadingPlaylistIds?.has(pl.id)}
                                className="w-full px-3 py-2 text-left hover:bg-white/10 text-zinc-300 hover:text-white flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                              >
                                {downloadingPlaylistIds?.has(pl.id) ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e0536c]" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                                <span>{downloadingPlaylistIds?.has(pl.id) ? 'Downloading...' : 'Download Playlist'}</span>
                              </button>
                            )}
                            <div className="my-1 border-t border-white/[0.08]" />
                            <button
                              onClick={() => {
                                setOpenMenuPlaylistId(null);
                                setPlaylistToDelete(pl);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Playlist</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <h3 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-rose-300 transition-colors">
                      {pl.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {pl.tracks.length} {pl.tracks.length === 1 ? 'song' : 'songs'}
                      {pl.unmatchedTracks && pl.unmatchedTracks.length > 0 ? ` • ${pl.unmatchedTracks.length} unlinked` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {playlists.length > 0 && filteredPlaylists.length === 0 && <p className="text-sm text-zinc-400 py-4">No playlists match this search.</p>}
        {favorites.length > 0 && <section className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-400 mb-4">Saved songs</h2>
          <TrackCollection tracks={favorites.filter(track => !filterText || `${track.title} ${track.artist} ${track.album || ''}`.toLocaleLowerCase().includes(filterText)).sort((a, b) => sortOrder === 'title' ? a.title.localeCompare(b.title) : 0).slice(0, filterText ? undefined : 6)} view={viewMode} currentTrack={currentTrack} isPlaying={isPlaying} favorites={favorites} isDataSaver={isDataSaver} onPlayTrack={onPlayTrack} onTogglePlayPause={onTogglePlayPause} onToggleFavorite={onToggleFavorite} onOpenArtist={onOpenArtist} onAddToQueue={onAddToQueue} onOpenAddToPlaylist={onOpenAddToPlaylist} />
        </section>}

        {/* Permanent Playlist Deletion Confirmation Dialog Modal */}
        {renderDeleteModal()}

      </div>
    );
  }

  const searching = activeTab === 'explore' && Boolean(searchQuery.trim());
  const busy = activeTab === 'explore' && loading;
  const artists = searching ? [...new Set(displayTracks.map(track => track.artist))]
    .filter(artist => artist.toLocaleLowerCase().includes(searchQuery.trim().toLocaleLowerCase())).slice(0, 6) : [];
  return (
    <main className="flex-1 w-full min-h-0 overflow-y-auto p-6 lg:p-8 pb-28 scrollbar-thin">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div><h1 className="font-serif text-3xl">{activeTab === 'favorites' ? 'Favourites' : searching ? `Results for “${searchQuery.trim()}”` : 'Explore'}</h1>
          <p className="text-sm text-zinc-400 mt-2">{activeTab === 'favorites' ? `${favorites.length} songs you love, all in one place.` : searching ? 'Songs and artists matching your search.' : 'Find something for your next listening session.'}</p></div>
        {activeTab === 'favorites' && favorites.length > 0 && <button onClick={() => onPlayTrack(visibleTracks[0], visibleTracks)} disabled={!visibleTracks.length} className="px-4 py-2 rounded-full bg-[#9e2a40] disabled:opacity-40 text-sm flex items-center gap-2"><Play className="w-4 h-4 fill-current" />Play favourites</button>}
      </div>
      {activeTab === 'explore' && !searching && <div className="flex gap-2 overflow-x-auto pb-5" aria-label="Browse by genre">{GENRE_CHIPS.map(genre => <button key={genre} onClick={() => onSelectGenre(genre)} aria-pressed={selectedGenre === genre} className={`whitespace-nowrap px-4 py-2 text-xs rounded-full border ${selectedGenre === genre ? 'bg-[#5c1324] border-[#8a2238] text-white' : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-white'}`}>{genre}</button>)}</div>}
      {activeTab === 'favorites' && collectionControls()}
      {activeTab === 'explore' && error && <div role="alert" className="flex items-center justify-between gap-4 p-4 mb-5 rounded-xl bg-rose-950/40 border border-rose-500/20 text-sm"><span>{error}</span><button onClick={onRetry} className="flex items-center gap-2 shrink-0"><RotateCcw className="w-4 h-4" />Retry</button></div>}
      {busy && <div role="status" className="flex items-center gap-2 text-sm text-zinc-400 py-4"><Loader2 className="w-4 h-4 animate-spin" />{searching ? 'Searching music…' : 'Loading music…'}</div>}
      {!busy && searching && topResult && <section className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#141418] p-4 mb-6 max-w-2xl">
        <button onClick={() => isTopResultPlaying ? onTogglePlayPause() : onPlayTrack(topResult, displayTracks)} aria-label={`Play top result: ${topResult.title}`} className="w-20 h-20 shrink-0"><CrispArtwork track={topResult} isDataSaver={isDataSaver} /></button>
        <div className="min-w-0 flex-1"><p className="text-[10px] uppercase tracking-wider text-rose-300 mb-1">Top result</p><h2 className="text-lg font-semibold line-clamp-2">{topResult.title}</h2><p className="text-sm text-zinc-400 truncate">{topResult.artist} · {topResult.duration || 'Song'}</p></div>
        <button onClick={() => currentTrack?.id === topResult.id ? onTogglePlayPause() : onPlayTrack(topResult, displayTracks)} aria-label={isTopResultPlaying ? 'Pause top result' : 'Play top result'} className="p-3 rounded-full bg-[#9e2a40]">{isTopResultPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}</button>
      </section>}
      {!busy && artists.length > 0 && onOpenArtist && <section className="mb-6"><h2 className="text-sm font-semibold mb-3">Artists</h2><div className="flex flex-wrap gap-2">{artists.map(artist => <button key={artist} onClick={() => onOpenArtist(artist)} className="px-4 py-2 text-sm rounded-full bg-white/5 border border-white/10 hover:bg-white/10">{artist}</button>)}</div></section>}
      {!busy && visibleTracks.length > 0 && <>
        <h2 className="text-sm text-zinc-400 mb-3">{activeTab === 'favorites' ? 'Saved songs' : 'Songs'} ({visibleTracks.length})</h2>
        <TrackCollection tracks={visibleTracks} view={searching ? 'list' : viewMode} currentTrack={currentTrack} isPlaying={isPlaying} favorites={favorites} isDataSaver={isDataSaver} onPlayTrack={onPlayTrack} onTogglePlayPause={onTogglePlayPause} onToggleFavorite={onToggleFavorite} onOpenArtist={onOpenArtist} onAddToQueue={onAddToQueue} onOpenAddToPlaylist={onOpenAddToPlaylist} onDownloadTrack={onDownloadTrack} downloadedTrackIds={downloadedTrackIds} downloadingTrackIds={downloadingTrackIds} pausedDownloadingTrackIds={pausedDownloadingTrackIds} />
      </>}
      {!busy && visibleTracks.length === 0 && <div className="py-14 text-center rounded-xl border border-dashed border-white/10"><Music className="w-8 h-8 mx-auto text-zinc-600 mb-3" /><h2 className="text-lg">{activeTab === 'favorites' && !filterText ? 'Your favourites start here' : 'No songs found'}</h2><p className="text-sm text-zinc-400 mt-2">{activeTab === 'favorites' ? filterText ? 'Try another title or artist.' : 'Tap the heart on a song to save it here.' : 'Try another search or explore a different genre.'}</p></div>}
    </main>
  );
};
