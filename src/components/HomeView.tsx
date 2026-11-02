import React from 'react';
import { ArrowRight, Play, Pause, Music2, Plus, Layers } from 'lucide-react';
import { Track, Playlist, HistoryItem } from '../types';
import { SavedSession } from '../utils/session';
import { getOptimizedArtwork } from '../utils/artwork';
import { TrackCollection } from './TrackCollection';
import { Artwork } from './Artwork';

interface Props {
  track: Track | null;
  isPlaying: boolean;
  history: HistoryItem[];
  favorites: Track[];
  playlists: Playlist[];
  savedSession: SavedSession | null;
  isDataSaver: boolean;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  onPlayPause: () => void;
  onToggleFavorite: (track: Track) => void;
  onNowPlaying: () => void;
  onExplore: () => void;
  onLibrary: () => void;
  onSelectPlaylist: (id: string) => void;
  onResumeSession?: (queue: Track[], index: number, time: number) => void;
  onCreateNewPlaylist?: () => void;
  onOpenImportModal?: () => void;
  onOpenArtist?: (artist: string) => void;
}

export function HomeView(props: Props) {
  const { track, isPlaying, history, favorites, playlists, savedSession, isDataSaver } = props;
  const resumeTrack = savedSession?.queue[savedSession.currentIndex];
  const recentTracks = history
    .map((item) => item.track)
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .slice(0, 6);
  const featuredTrack =
    isPlaying || savedSession || history.some((item) => item.track.id === track?.id)
      ? track || resumeTrack
      : null;
  return (
    <main className="w-full max-w-[1500px] mx-auto p-6 lg:p-8 pb-28 space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-rose-300 mb-2">YOUR MUSIC, YOUR SPACE</p>
          <h1 className="font-serif text-3xl lg:text-4xl">Welcome back</h1>
          <p className="text-sm text-zinc-400 mt-2">
            Pick up where you left off, or find your next favourite.
          </p>
        </div>
        <button
          onClick={props.onExplore}
          className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white"
        >
          Explore music <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      {featuredTrack && (
        <section className="flex flex-wrap items-center gap-5 p-5 lg:p-6 rounded-2xl bg-gradient-to-r from-[#421421]/70 to-[#141418] border border-white/[0.08]">
          <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden shrink-0 bg-zinc-900">
            <Artwork src={featuredTrack.thumbnail} localSrc={featuredTrack.local_artwork_url} trackId={featuredTrack.id} isDataSaver={isDataSaver} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <p className="text-xs text-rose-300 mb-2">{isPlaying ? 'NOW PLAYING' : 'CONTINUE LISTENING'}</p>
            <h2 className="font-serif text-2xl line-clamp-2">{featuredTrack.title}</h2>
            <p className="text-sm text-zinc-400 mt-1">{featuredTrack.artist}</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={() => {
                  if (!track && resumeTrack && props.onResumeSession)
                    props.onResumeSession(
                      savedSession!.queue,
                      savedSession!.currentIndex,
                      savedSession!.currentTime,
                    );
                  else props.onPlayPause();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#9e2a40] hover:bg-[#b8334d] text-sm font-semibold"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={props.onNowPlaying}
                className="px-4 py-2 rounded-full border border-white/15 hover:bg-white/5 text-sm"
              >
                Open Now Playing
              </button>
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl">Your playlists</h2>
          <button onClick={props.onLibrary} className="text-xs text-zinc-400 hover:text-white">
            View library <ArrowRight className="w-3 h-3 inline ml-1" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {playlists.slice(0, 6).map((playlist) => (
            <button
              key={playlist.id}
              onClick={() => props.onSelectPlaylist(playlist.id)}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] text-left min-w-0"
            >
              <div className="w-12 h-12 bg-[#9e2a40]/20 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                {playlist.thumbnail || playlist.tracks[0]?.thumbnail ? (
                  <Artwork src={playlist.thumbnail || playlist.tracks[0]?.thumbnail} trackId={playlist.tracks[0]?.id} isDataSaver={isDataSaver} />
                ) : (
                  <Music2 className="w-5 h-5 text-rose-300" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{playlist.name}</p>
                <p className="text-xs text-zinc-400 mt-1">{playlist.tracks.length} songs</p>
              </div>
            </button>
          ))}
          {playlists.length === 0 && (
            <div className="sm:col-span-2 rounded-xl border border-dashed border-white/15 p-5">
              <p className="text-sm text-zinc-300">Make room for your favourites.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Create a playlist or bring in one you already love.
              </p>
              <div className="flex flex-wrap gap-4 mt-4">
                {props.onCreateNewPlaylist && (
                  <button onClick={props.onCreateNewPlaylist} className="flex items-center gap-2 text-sm">
                    <Plus className="w-4 h-4" />
                    Create playlist
                  </button>
                )}
                {props.onOpenImportModal && (
                  <button
                    onClick={props.onOpenImportModal}
                    className="flex items-center gap-2 text-sm text-rose-300"
                  >
                    <Layers className="w-4 h-4" />
                    Import playlist
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      {recentTracks.length > 0 && (
        <section>
          <h2 className="font-serif text-xl mb-4">Recently played</h2>
          <TrackCollection
            tracks={recentTracks}
            currentTrack={track}
            isPlaying={isPlaying}
            favorites={favorites}
            isDataSaver={isDataSaver}
            onPlayTrack={props.onPlayTrack}
            onTogglePlayPause={props.onPlayPause}
            onToggleFavorite={props.onToggleFavorite}
            onOpenArtist={props.onOpenArtist}
          />
        </section>
      )}
      {favorites.length > 0 && (
        <section>
          <h2 className="font-serif text-xl mb-4">Your favourites</h2>
          <TrackCollection
            tracks={favorites.slice(0, 6)}
            currentTrack={track}
            isPlaying={isPlaying}
            favorites={favorites}
            isDataSaver={isDataSaver}
            onPlayTrack={props.onPlayTrack}
            onTogglePlayPause={props.onPlayPause}
            onToggleFavorite={props.onToggleFavorite}
            onOpenArtist={props.onOpenArtist}
          />
        </section>
      )}
    </main>
  );
}
