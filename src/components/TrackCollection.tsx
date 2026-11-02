import React, { useState } from 'react';
import {
  Play,
  Pause,
  Heart,
  Plus,
  ListPlus,
  Download,
  CheckCircle2,
  MoreHorizontal,
  Music2,
} from 'lucide-react';
import { Track } from '../types';
import { Artwork } from './Artwork';

interface Props {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  favorites: Track[];
  view?: 'grid' | 'list';
  isDataSaver?: boolean;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onTogglePlayPause: () => void;
  onToggleFavorite: (track: Track) => void;
  onOpenArtist?: (artist: string) => void;
  onAddToQueue?: (track: Track) => void;
  onOpenAddToPlaylist?: (track: Track) => void;
  onDownloadTrack?: (track: Track) => void;
  downloadedTrackIds?: Set<string>;
  downloadingTrackIds?: Set<string>;
  pausedDownloadingTrackIds?: Set<string>;
}

export function TrackCollection({
  tracks,
  currentTrack,
  isPlaying,
  favorites,
  view = 'grid',
  isDataSaver = false,
  onPlayTrack,
  onTogglePlayPause,
  onToggleFavorite,
  onOpenArtist,
  onAddToQueue,
  onOpenAddToPlaylist,
  onDownloadTrack,
  downloadedTrackIds,
  downloadingTrackIds,
  pausedDownloadingTrackIds,
}: Props) {
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const likedIds = new Set(favorites.map((track) => track.id));
  return (
    <div
      className={
        view === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4'
          : 'flex flex-col gap-1'
      }
    >
      {tracks.map((track, index) => {
        const active = currentTrack?.id === track.id;
        const liked = likedIds.has(track.id);
        const downloaded = downloadedTrackIds?.has(track.id);
        const downloading = downloadingTrackIds?.has(track.id);
        const paused = pausedDownloadingTrackIds?.has(track.id);
        const play = () => (active ? onTogglePlayPause() : onPlayTrack(track, tracks));
        return (
          <article
            key={`${track.id}-${index}`}
            className={`group relative min-w-0 rounded-xl border transition-colors ${active ? 'border-[#9e2a40]/50 bg-[#9e2a40]/10' : 'border-transparent hover:bg-white/[0.04]'} ${view === 'list' ? 'flex items-center gap-3 p-2' : 'p-2.5 bg-white/[0.02]'}`}
          >
            <button
              onClick={play}
              aria-label={`${active && isPlaying ? 'Pause' : 'Play'} ${track.title}`}
              title={track.title}
              className={`relative overflow-hidden rounded-lg bg-zinc-900 shrink-0 ${view === 'list' ? 'w-11 h-11' : 'w-full aspect-square mb-3'}`}
            >
              <Artwork src={track.thumbnail} localSrc={track.local_artwork_url} trackId={track.id} isDataSaver={isDataSaver} />
              <span
                className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
              >
                {active && isPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white" />
                )}
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <button
                onClick={play}
                title={track.title}
                className={`text-left text-sm font-semibold leading-snug ${view === 'list' ? 'block truncate max-w-full' : 'line-clamp-2 min-h-[2.5rem]'} ${active ? 'text-rose-300' : 'text-zinc-100'}`}
              >
                {track.title}
              </button>
              <button
                onClick={() => onOpenArtist?.(track.artist)}
                disabled={!onOpenArtist}
                title={track.artist}
                className="block max-w-full truncate text-xs text-zinc-400 hover:text-white disabled:hover:text-zinc-400 mt-1"
              >
                {track.artist}
              </button>
            </div>
            {view === 'list' && (
              <span className="hidden lg:block text-xs text-zinc-500 truncate w-1/5" title={track.album}>
                {track.album}
              </span>
            )}
            <div className={`flex items-center gap-1 ${view === 'grid' ? 'mt-3' : ''}`}>
              <span className="text-[11px] tabular-nums text-zinc-500 mr-auto">{track.duration || '—'}</span>
              <button
                onClick={() => onToggleFavorite(track)}
                aria-label={`${liked ? 'Remove' : 'Add'} ${track.title} ${liked ? 'from' : 'to'} favourites`}
                aria-pressed={liked}
                title={liked ? 'Remove from favourites' : 'Add to favourites'}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400"
              >
                <Heart className={`w-4 h-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
              <button
                onClick={() => setMenuIndex(menuIndex === index ? null : index)}
                aria-label={`More options for ${track.title}`}
                aria-expanded={menuIndex === index}
                className="p-2 rounded-full hover:bg-white/10 text-zinc-400"
                title="More options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
            {menuIndex === index && (
              <>
                <button
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close song options"
                  onClick={() => setMenuIndex(null)}
                />
                <div className="absolute right-2 bottom-12 z-50 w-48 p-1 rounded-xl border border-white/10 bg-[#19191e] shadow-xl text-xs">
                  {onAddToQueue && (
                    <button
                      className="collection-menu-item"
                      onClick={() => {
                        onAddToQueue(track);
                        setMenuIndex(null);
                      }}
                    >
                      <ListPlus className="w-4 h-4" />
                      Add to queue
                    </button>
                  )}
                  {onOpenAddToPlaylist && (
                    <button
                      className="collection-menu-item"
                      onClick={() => {
                        onOpenAddToPlaylist(track);
                        setMenuIndex(null);
                      }}
                    >
                      <Plus className="w-4 h-4" />
                      Add to playlist
                    </button>
                  )}
                  {onDownloadTrack && (
                    <button
                      disabled={downloaded}
                      className="collection-menu-item disabled:opacity-50"
                      onClick={() => {
                        onDownloadTrack(track);
                        setMenuIndex(null);
                      }}
                    >
                      {downloaded ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : downloading ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {downloaded
                        ? 'Downloaded'
                        : paused
                          ? 'Resume download'
                          : downloading
                            ? 'Pause download'
                            : 'Download'}
                    </button>
                  )}
                  <button
                    className="collection-menu-item"
                    onClick={() => {
                      onToggleFavorite(track);
                      setMenuIndex(null);
                    }}
                  >
                    <Heart className="w-4 h-4" />
                    {liked ? 'Remove favourite' : 'Add to favourites'}
                  </button>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
