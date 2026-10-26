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
  ShieldCheck
} from 'lucide-react';
import { getOptimizedArtwork, getThumbnailArtwork } from '../utils/artwork';

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

// Artwork component with fallback to YouTube HQ default thumbnail
const CrispArtwork: React.FC<{
  track: Track;
  className?: string;
  isDataSaver?: boolean;
}> = ({ track, className = '', isDataSaver = false }) => {
  const primaryUrl = isDataSaver 
    ? getThumbnailArtwork(track.thumbnail) 
    : getOptimizedArtwork(track.thumbnail, false);
  const fallbackUrl = track.id ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : '';
  const [src, setSrc] = useState(primaryUrl || fallbackUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const nextUrl = isDataSaver ? getThumbnailArtwork(track.thumbnail) : getOptimizedArtwork(track.thumbnail, false);
    setSrc(nextUrl || fallbackUrl);
    setHasError(false);
  }, [track.thumbnail, track.id, isDataSaver, fallbackUrl]);

  const handleError = () => {
    if (fallbackUrl && src !== fallbackUrl) {
      setSrc(fallbackUrl);
    } else {
      setHasError(true);
    }
  };

  return (
    <div className={`relative aspect-square w-full rounded-xl overflow-hidden bg-[#141416] select-none ${className}`}>
      {!hasError ? (
        <img
          src={src}
          alt={track.title}
          loading="eager"
          decoding="async"
          onError={handleError}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#141416] text-zinc-600 p-2 text-center">
          <Disc3 className="w-7 h-7 text-zinc-700 mb-1" />
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider">No Artwork</span>
        </div>
      )}
    </div>
  );
};

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
  const selectedPlaylistId = passedSelectedPlaylistId !== undefined && passedSelectedPlaylistId !== null ? passedSelectedPlaylistId : internalSelectedPlaylistId;
  const setSelectedPlaylistId = (id: string | null) => {
    setInternalSelectedPlaylistId(id);
    onSelectPlaylist?.(id);
  };
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [showUnmatched, setShowUnmatched] = useState(false);

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
    const seenTitles = new Set<string>();
    const unique: Track[] = [];

    for (const t of rawTracks) {
      if (!t || !t.id) continue;
      if (seenIds.has(t.id)) continue;

      const normTitle = (t.title || '')
        .toLowerCase()
        .replace(/[\(\[\{].*?[\)\]\}]/g, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      const normArtist = (t.artist || '').toLowerCase().trim();
      const normKey = `${normTitle}__${normArtist}`;

      if (seenTitles.has(normKey)) continue;

      seenIds.add(t.id);
      seenTitles.add(normKey);
      unique.push(t);
    }

    const filtered: Track[] = [];
    const artistCounts = new Map<string, number>();

    for (const t of unique) {
      const art = (t.artist || '').toLowerCase().trim();
      const isSoundFx = art.includes('sound ideas') || art.includes('sound effects') || (t.title || '').toLowerCase().includes('sound effects');
      const count = artistCounts.get(art) || 0;

      if (isSoundFx && count >= 1) continue;
      if (count >= 5 && unique.length > 10) continue;

      artistCounts.set(art, count + 1);
      filtered.push(t);
    }

    return filtered.length >= 4 ? filtered : unique;
  }, [rawTracks]);

  // Featured Top Result (Left Column)
  const topResult: Track | null = useMemo(() => {
    if (displayTracks.length === 0) return null;
    return displayTracks[0];
  }, [displayTracks]);

  const isTopResultPlaying = currentTrack?.id === topResult?.id && isPlaying;
  const isTopResultLiked = topResult ? favorites.some(f => String(f?.id ?? '').trim() === String(topResult.id).trim()) : false;

  const formatTrackMeta = (track: Track) => {
    const format = track.album ? 'Album' : 'Single';
    const genre = selectedGenre && selectedGenre !== 'Trending' ? selectedGenre : 'Afrobeats';
    const dur = track.duration || '';
    if (dur) return `${format} • ${dur}`;
    return `${format} • 2024 • ${genre}`;
  };

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
                onClick={handlePlayAll}
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

        {/* Tracklist Table */}
        <div className="mt-6 space-y-1">
          {selectedPlaylist.tracks.length === 0 ? (
            <div className="py-16 text-center text-zinc-500">
              <Music2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No songs in this playlist yet.</p>
            </div>
          ) : (
            selectedPlaylist.tracks.map((t, idx) => {
              const isCurrent = currentTrack?.id === t.id;
              const isTrackPlaying = isCurrent && isPlaying;
              const isLiked = favorites.some(f => String(f?.id ?? '').trim() === String(t.id).trim());

              return (
                <div
                  key={`${t.id}-${idx}`}
                  onClick={() => onPlayTrack(t, selectedPlaylist.tracks)}
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
                        src={getOptimizedArtwork(t.thumbnail, isDataSaver)}
                        alt=""
                        className="w-full h-full object-cover"
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

          <div className="flex items-center gap-2.5">
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

        {/* Playlists Shelf */}
        <div className="mt-7">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Playlists ({playlists.length})
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {playlists.map(pl => {
                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className="group relative flex flex-col p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/15 transition-all cursor-pointer shadow-md"
                  >
                    {/* Artwork Container */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#18181c] border border-white/5 mb-3 shadow">
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

        {/* Favourites Quick Shelf */}
        {favorites.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
              Favourites ({favorites.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {favorites.slice(0, 6).map(track => (
                <div
                  key={track.id}
                  onClick={() => onPlayTrack(track, favorites)}
                  className="group flex flex-col p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.03] transition-all cursor-pointer"
                >
                  <div className="aspect-square w-full rounded-lg overflow-hidden mb-2 bg-zinc-800">
                    <img src={getOptimizedArtwork(track.thumbnail, isDataSaver)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                  <p 
                    onClick={(e) => {
                      if (onOpenArtist && track.artist) {
                        e.stopPropagation();
                        onOpenArtist(track.artist);
                      }
                    }}
                    className="text-[10px] text-zinc-400 hover:text-white hover:underline truncate cursor-pointer"
                    title={`View ${track.artist} profile`}
                  >
                    {track.artist}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Permanent Playlist Deletion Confirmation Dialog Modal */}
        {renderDeleteModal()}

      </div>
    );
  }

  // =========================================================================
  // VIEW: EXPLORE / SEARCH / FAVORITES (Standard 2-Column Editorial View)
  // =========================================================================
  return (
    <div className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto px-6 sm:px-10 xl:px-16 pt-3 pb-24 scrollbar-thin select-none">
      
      {/* Genre Filters (Explore Tab) */}
      {activeTab === 'explore' && (
        <div className="flex items-center gap-2.5 overflow-x-auto pb-5 scrollbar-none flex-nowrap flex-shrink-0">
          {GENRE_CHIPS.map(g => {
            const isSelected = selectedGenre === g;
            return (
              <button
                key={g}
                onClick={() => onSelectGenre(g)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border outline-none cursor-pointer focus-visible:ring-1 focus-visible:ring-white/30 ${
                  isSelected
                    ? 'bg-[#5c1324] text-white border-[#8a2238] shadow-sm font-semibold'
                    : 'bg-[#141416] text-[#a1a1aa] hover:text-white border-white/[0.08] hover:bg-[#1a1a1e]'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-500/20 text-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800/60 border border-red-500/30 text-white font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading state when initial list is empty */}
      {loading && displayTracks.length === 0 && (
        <div className="flex-1 flex flex-col lg:flex-row gap-8 items-start animate-pulse">
          <div className="w-full lg:w-[35%] xl:w-[32%] bg-[#121215] border border-white/[0.06] rounded-2xl p-5 flex flex-col gap-4">
            <div className="aspect-square w-full rounded-xl bg-zinc-800/50" />
            <div className="h-7 bg-zinc-800/50 rounded w-3/4" />
            <div className="h-4 bg-zinc-800/40 rounded w-1/2" />
          </div>
          <div className="flex-1 w-full grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="aspect-square w-full rounded-xl bg-zinc-800/40" />
                <div className="h-4 bg-zinc-800/50 rounded w-3/4" />
                <div className="h-3 bg-zinc-800/30 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && displayTracks.length === 0 && (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <Search className="w-10 h-10 text-zinc-600 mb-3" />
          <h3 className="font-serif text-2xl text-white font-normal">No results found</h3>
          <p className="text-sm text-zinc-400 mt-1 max-w-sm">
            {searchQuery
              ? `We couldn't find any results for "${searchQuery}". Try searching by song name, artist, or exploring a genre.`
              : 'No tracks available in this section.'}
          </p>
          <button
            onClick={() => onSelectGenre('Trending')}
            className="mt-5 px-5 py-2 rounded-full bg-[#6b1828] hover:bg-[#852033] text-white text-xs font-medium shadow-md transition-colors cursor-pointer"
          >
            Explore Trending
          </button>
        </div>
      )}

      {/* Two-Column Editorial Layout */}
      {displayTracks.length > 0 && (
        <div className="flex-1 w-full min-h-0 flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
          
          {/* LEFT COLUMN: Featured Top Result */}
          {topResult && (
            <div className="w-full lg:w-[35%] xl:w-[32%] flex-shrink-0 bg-[#121215] border border-white/[0.08] rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-400 font-semibold">
                    TOP RESULT
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Match 1 of {displayTracks.length}
                  </span>
                </div>

                <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-black border border-white/[0.05] group">
                  <CrispArtwork track={topResult} isDataSaver={isDataSaver} />
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <button
                      onClick={() => {
                        if (topResult) {
                          if (currentTrack?.id === topResult.id) {
                            onTogglePlayPause();
                          } else {
                            onPlayTrack(topResult, displayTracks);
                          }
                        }
                      }}
                      className="w-14 h-14 rounded-full bg-[#6b1828]/90 hover:bg-[#852033] text-white flex items-center justify-center shadow-2xl transform transition-transform group-hover:scale-105 active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                      title={isTopResultPlaying ? "Pause" : "Play"}
                      aria-label={isTopResultPlaying ? "Pause" : "Play"}
                    >
                      {isTopResultPlaying ? (
                        <Pause className="w-6 h-6 fill-white text-white" />
                      ) : (
                        <Play className="w-6 h-6 fill-white text-white ml-0.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-5">
                  <h2 
                    title={topResult.title}
                    className="font-serif text-2xl sm:text-3xl font-medium text-white tracking-tight leading-tight truncate"
                  >
                    {topResult.title}
                  </h2>
                  <p 
                    title={topResult.artist}
                    onClick={(e) => {
                      if (onOpenArtist && topResult.artist) {
                        e.stopPropagation();
                        onOpenArtist(topResult.artist);
                      }
                    }}
                    className="text-zinc-400 hover:text-white hover:underline text-sm sm:text-base font-normal mt-1 truncate cursor-pointer"
                  >
                    {topResult.artist}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {formatTrackMeta(topResult)}
                  </p>
                </div>
              </div>

              {/* Actions row */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] flex items-center gap-3">
                <button
                  onClick={() => topResult && onPlayTrack(topResult, displayTracks)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#6b1828] hover:bg-[#852033] text-white text-xs font-semibold shadow-lg hover:shadow-xl transition-all active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  title={`Play ${topResult.title}`}
                >
                  <Play className="w-3.5 h-3.5 fill-white text-white" />
                  <span>Play</span>
                </button>

                <button
                  onClick={() => topResult && onToggleFavorite(topResult)}
                  className={`p-2.5 rounded-full border transition-all active:scale-95 cursor-pointer outline-none ${
                    isTopResultLiked
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'bg-[#18181c] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                  }`}
                  title={isTopResultLiked ? "Remove from Favourites" : "Favourite"}
                >
                  <Heart className={`w-4 h-4 ${isTopResultLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
                </button>

                {topResult && onDownloadTrack && (
                  <button
                    onClick={() => onDownloadTrack(topResult)}
                    className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-full border transition-all active:scale-95 cursor-pointer outline-none text-xs font-semibold ${
                      downloadedTrackIds?.has(topResult.id)
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : pausedDownloadingTrackIds?.has(topResult.id)
                        ? 'bg-[#9e2a40]/20 border-[#9e2a40]/40 text-[#e0536c] hover:bg-[#9e2a40]/30'
                        : downloadingTrackIds?.has(topResult.id)
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30'
                        : 'bg-[#18181c] border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                    title={
                      downloadedTrackIds?.has(topResult.id)
                        ? 'Downloaded for offline playback'
                        : pausedDownloadingTrackIds?.has(topResult.id)
                        ? 'Download paused. Click to play / resume.'
                        : downloadingTrackIds?.has(topResult.id)
                        ? 'Downloading track. Click to pause.'
                        : 'Download track for offline playback'
                    }
                  >
                    {downloadedTrackIds?.has(topResult.id) ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : pausedDownloadingTrackIds?.has(topResult.id) ? (
                      <Play className="w-3.5 h-3.5 text-[#e0536c] fill-current" />
                    ) : downloadingTrackIds?.has(topResult.id) ? (
                      <Pause className="w-3.5 h-3.5 text-cyan-400" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {downloadedTrackIds?.has(topResult.id)
                        ? 'Downloaded'
                        : pausedDownloadingTrackIds?.has(topResult.id)
                        ? 'Resume'
                        : downloadingTrackIds?.has(topResult.id)
                        ? 'Pause'
                        : 'Download'}
                    </span>
                  </button>
                )}

                {onOpenAddToPlaylist && (
                  <button
                    onClick={() => topResult && onOpenAddToPlaylist(topResult)}
                    className="p-2.5 rounded-full bg-[#18181c] border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none"
                    title="Add to Playlist"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* RIGHT COLUMN: Results Grid */}
          <div className="flex-1 w-full min-w-0">
            <div className="flex items-center justify-between mb-3.5">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                {activeTab === 'favorites' ? 'All Favourites' : 'Tracks'} ({displayTracks.length})
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
              {displayTracks.map((track) => {
                const isCurrent = currentTrack?.id === track.id;
                const isTrackPlaying = isCurrent && isPlaying;
                const isLiked = favorites.some(f => String(f?.id ?? '').trim() === String(track.id).trim());

                return (
                  <div
                    key={track.id}
                    className="group relative flex flex-col cursor-pointer outline-none"
                    onClick={() => onPlayTrack(track, displayTracks)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onPlayTrack(track, displayTracks);
                      }
                    }}
                  >
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#141416] border border-white/[0.04] group-hover:border-white/15 transition-all duration-200 shadow-md">
                      <CrispArtwork track={track} isDataSaver={isDataSaver} />

                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                        <div className="w-10 h-10 rounded-full bg-[#6b1828] text-white shadow-xl flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform">
                          {isTrackPlaying ? (
                            <Pause className="w-4 h-4 fill-white text-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-white text-white ml-0.5" />
                          )}
                        </div>
                      </div>

                      {isCurrent && (
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/70 backdrop-blur-md border border-white/20 text-[9px] font-mono text-white flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          <span>{isTrackPlaying ? 'PLAYING' : 'PAUSED'}</span>
                        </div>
                      )}
                    </div>

                    <div className="w-full mt-2.5 flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p 
                          title={track.title}
                          className={`text-xs sm:text-sm font-semibold truncate transition-colors ${
                            isCurrent ? 'text-rose-300' : 'text-zinc-200 group-hover:text-white'
                          }`}
                        >
                          {track.title}
                        </p>
                        <p 
                          title={track.artist}
                          onClick={(e) => {
                            if (onOpenArtist && track.artist) {
                              e.stopPropagation();
                              onOpenArtist(track.artist);
                            }
                          }}
                          className="text-[11px] sm:text-xs text-zinc-400 hover:text-white hover:underline truncate mt-0.5 cursor-pointer"
                        >
                          {track.artist}
                        </p>
                        <p className="text-[10px] sm:text-[11px] text-zinc-500 truncate mt-0.5">
                          {track.album ? `${track.album}` : `Single • ${track.duration || '2024'}`}
                        </p>
                      </div>

                      <div 
                        className="relative flex items-center gap-0.5 flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        {onDownloadTrack && (
                          <button
                            onClick={() => onDownloadTrack(track)}
                            className={`p-1.5 sm:p-1 rounded-lg transition-colors cursor-pointer outline-none touch-manipulation ${
                              downloadedTrackIds?.has(track.id)
                                ? 'text-emerald-400 opacity-100'
                                : pausedDownloadingTrackIds?.has(track.id)
                                ? 'text-[#e0536c] opacity-100'
                                : downloadingTrackIds?.has(track.id)
                                ? 'text-cyan-400 opacity-100 hover:text-[#e0536c]'
                                : 'text-zinc-400 hover:text-white hover:bg-white/10 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
                            }`}
                            title={
                              downloadedTrackIds?.has(track.id)
                                ? 'Downloaded for offline playback'
                                : pausedDownloadingTrackIds?.has(track.id)
                                ? 'Download paused. Click to play / resume.'
                                : downloadingTrackIds?.has(track.id)
                                ? 'Downloading track. Click to pause.'
                                : 'Download track for offline playback'
                            }
                            aria-label="Download track"
                          >
                            {downloadedTrackIds?.has(track.id) ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : pausedDownloadingTrackIds?.has(track.id) ? (
                              <Play className="w-4 h-4 text-[#e0536c] fill-current" />
                            ) : downloadingTrackIds?.has(track.id) ? (
                              <Pause className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => setOpenMenuTrackId(openMenuTrackId === track.id ? null : track.id)}
                          className="p-1.5 sm:p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 outline-none touch-manipulation cursor-pointer"
                          title="More options"
                          aria-label="More options"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {openMenuTrackId === track.id && (
                          <div 
                            className="absolute right-0 bottom-full mb-1.5 w-44 bg-[#18181c] border border-white/15 rounded-xl shadow-2xl py-1.5 z-40 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                            onClick={e => e.stopPropagation()}
                          >
                            {onDownloadTrack && (
                              <button
                                onClick={() => {
                                  onDownloadTrack(track);
                                  setOpenMenuTrackId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                {downloadedTrackIds?.has(track.id) ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400 font-medium">Downloaded</span>
                                  </>
                                ) : pausedDownloadingTrackIds?.has(track.id) ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 text-[#e0536c] fill-current" />
                                    <span className="text-[#e0536c]">Resume Download</span>
                                  </>
                                ) : downloadingTrackIds?.has(track.id) ? (
                                  <>
                                    <Pause className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="text-cyan-300">Pause Download</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                                    <span>Download Song</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              onClick={() => {
                                onToggleFavorite(track);
                                setOpenMenuTrackId(null);
                              }}
                              className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors"
                            >
                              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500 text-rose-500' : 'text-zinc-400'}`} />
                              <span>{isLiked ? 'Remove from Favourites' : 'Add to Favourites'}</span>
                            </button>
                            {onOpenAddToPlaylist && (
                              <button
                                onClick={() => {
                                  onOpenAddToPlaylist(track);
                                  setOpenMenuTrackId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Add to Playlist...</span>
                              </button>
                            )}
                            {onAddToQueue && (
                              <button
                                onClick={() => {
                                  onAddToQueue(track);
                                  setOpenMenuTrackId(null);
                                }}
                                className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 text-zinc-200 hover:bg-white/10 transition-colors"
                              >
                                <ListPlus className="w-3.5 h-3.5 text-zinc-400" />
                                <span>Add to Queue</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

      {/* Permanent Playlist Deletion Confirmation Dialog Modal */}
      {renderDeleteModal()}

    </div>
  );
};
