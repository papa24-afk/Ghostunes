// src/components/ArtistProfileView.tsx
import React, { useState, useEffect } from 'react';
import { Track, ArtistProfile, AlbumDetails, ArtistRelease, RelatedArtist } from '../types';
import { getApiUrl } from '../utils/api';
import { ArtistAvatar } from './ArtistAvatar';
import { 
  ChevronLeft, 
  Play, 
  Pause, 
  Shuffle, 
  Heart, 
  Plus, 
  ListPlus, 
  Disc3, 
  Users, 
  Info, 
  Calendar, 
  Clock, 
  AlertCircle, 
  Loader2,
  X
} from 'lucide-react';

interface ArtistProfileViewProps {
  artistQuery: { id?: string; name: string };
  onBack: () => void;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  currentTrack?: Track | null;
  isPlaying?: boolean;
  onOpenArtist: (name: string, id?: string) => void;
  favorites?: Track[];
  onToggleFavorite?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onOpenAddToPlaylist?: (track: Track) => void;
}

export const ArtistProfileView: React.FC<ArtistProfileViewProps> = ({
  artistQuery,
  onBack,
  onPlayTrack,
  currentTrack,
  isPlaying = false,
  onOpenArtist,
  favorites = [],
  onToggleFavorite,
  onAddToQueue,
  onOpenAddToPlaylist
}) => {
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedBio, setExpandedBio] = useState<boolean>(false);

  // Album inspection modal state
  const [inspectingAlbumId, setInspectingAlbumId] = useState<string | null>(null);
  const [albumData, setAlbumData] = useState<AlbumDetails | null>(null);
  const [albumLoading, setAlbumLoading] = useState<boolean>(false);
  const [albumError, setAlbumError] = useState<string | null>(null);

  const fetchArtistProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (artistQuery.id) params.set('id', artistQuery.id);
      if (artistQuery.name) params.set('name', artistQuery.name);

      const res = await fetch(getApiUrl(`/api/artist?${params.toString()}`));
      if (!res.ok) {
        throw new Error(`Failed to load artist profile (${res.status})`);
      }
      const data: ArtistProfile = await res.json();
      setProfile(data);
    } catch (err: any) {
      console.warn('[ArtistProfileView] Fetch error:', err);
      setError(err?.message || 'Unable to load artist profile. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtistProfile();
    setExpandedBio(false);
    setInspectingAlbumId(null);
    setAlbumData(null);
  }, [artistQuery.id, artistQuery.name]);

  // Fetch album details when user clicks an album card
  const handleOpenAlbum = async (album: ArtistRelease) => {
    setInspectingAlbumId(album.id);
    setAlbumLoading(true);
    setAlbumError(null);
    try {
      const res = await fetch(getApiUrl(`/api/album?id=${encodeURIComponent(album.id)}`));
      if (!res.ok) {
        throw new Error(`Failed to load album tracks (${res.status})`);
      }
      const data: AlbumDetails = await res.json();
      setAlbumData(data);
    } catch (err: any) {
      console.warn('[ArtistProfileView] Album load error:', err);
      setAlbumError(err?.message || 'Failed to load album tracks.');
    } finally {
      setAlbumLoading(false);
    }
  };

  const handlePlayTopTracks = (shuffle = false) => {
    if (!profile || profile.topTracks.length === 0) return;
    const tracksToPlay = shuffle ? [...profile.topTracks].sort(() => Math.random() - 0.5) : profile.topTracks;
    onPlayTrack(tracksToPlay[0], tracksToPlay);
  };

  // Loading skeleton state
  if (loading) {
    return (
      <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 overflow-y-auto animate-in fade-in duration-200">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-6 py-1 px-2.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Skeleton Banner */}
        <div className="w-full h-64 rounded-3xl bg-zinc-900/60 border border-white/5 animate-pulse relative overflow-hidden flex items-end p-8">
          <div className="flex items-center gap-5 w-full">
            <div className="w-24 h-24 rounded-full bg-zinc-800 animate-pulse" />
            <div className="space-y-2 flex-1">
              <div className="w-48 h-8 rounded-lg bg-zinc-800 animate-pulse" />
              <div className="w-32 h-4 rounded bg-zinc-800 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Skeleton Track rows */}
        <div className="mt-10 space-y-3">
          <div className="w-32 h-5 rounded bg-zinc-800/80 mb-4" />
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="h-14 rounded-2xl bg-zinc-900/40 border border-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <div className="flex-1 w-full max-w-4xl mx-auto px-6 py-16 text-center">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-8 py-1.5 px-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="p-8 rounded-3xl bg-[#121318] border border-white/10 max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Artist Profile Unavailable</h3>
          <p className="text-xs text-zinc-400 mb-6">{error || 'Could not load data for this artist.'}</p>
          <button
            onClick={fetchArtistProfile}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#9e2a40] hover:bg-[#b8334d] text-white transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isCurrentArtistPlaying = currentTrack && (
    currentTrack.artist.toLowerCase().includes(profile.name.toLowerCase()) ||
    profile.name.toLowerCase().includes(currentTrack.artist.toLowerCase())
  ) && isPlaying;

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-6 overflow-y-auto space-y-8 select-none">
      {/* Back Navigation Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white py-1.5 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors cursor-pointer group"
          title="Return to previous view"
          aria-label="Back"
        >
          <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back</span>
        </button>
      </div>

      {/* Hero Header with Banner and Metadata */}
      <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-[#0d0e12] shadow-2xl">
        {/* Background Banner */}
        {profile.banner ? (
          <div className="absolute inset-0 z-0">
            <img 
              src={profile.banner} 
              alt={profile.name} 
              className="w-full h-full object-cover object-top filter brightness-[0.45] blur-sm scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d0e12] via-[#0d0e12]/70 to-transparent" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-[#1a0a10] via-[#0d0e12] to-[#121318]" />
        )}

        <div className="relative z-10 p-6 sm:p-10 flex flex-col sm:flex-row items-center sm:items-end gap-6 pt-16 sm:pt-28">
          {/* Circular Portrait */}
          <ArtistAvatar 
            name={profile.name} 
            src={profile.avatar} 
            size={112} 
            className="ring-4 ring-white/10 shadow-2xl shrink-0" 
          />

          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[#e0536c] bg-[#9e2a40]/20 border border-[#9e2a40]/40 px-2.5 py-0.5 rounded-full mb-2">
              <span>Verified Artist</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-serif font-extrabold text-white tracking-tight truncate drop-shadow-md">
              {profile.name}
            </h1>
            {profile.subscribers && (
              <p className="text-xs text-zinc-400 mt-1 flex items-center justify-center sm:justify-start gap-1.5 font-medium">
                <Users className="w-3.5 h-3.5 text-zinc-500" />
                <span>{profile.subscribers}</span>
              </p>
            )}
          </div>

          {/* Quick Play Controls */}
          {profile.topTracks.length > 0 && (
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => handlePlayTopTracks(false)}
                className="px-5 py-2.5 rounded-full bg-[#9e2a40] hover:bg-[#b8334d] text-white text-xs font-bold transition-all shadow-lg shadow-[#9e2a40]/30 hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
                title="Play top songs"
              >
                {isCurrentArtistPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                <span>{isCurrentArtistPlaying ? 'Playing' : 'Play'}</span>
              </button>
              <button
                onClick={() => handlePlayTopTracks(true)}
                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-105 active:scale-95 cursor-pointer"
                title="Shuffle artist tracks"
                aria-label="Shuffle artist tracks"
              >
                <Shuffle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Official Biography (if available) */}
      {profile.description && (
        <div className="p-6 rounded-2xl bg-[#101115] border border-white/[0.06] shadow-md">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
            <Info className="w-3.5 h-3.5 text-[#e0536c]" />
            <span>About {profile.name}</span>
          </div>
          <p className={`text-xs text-zinc-400 leading-relaxed ${expandedBio ? '' : 'line-clamp-3'}`}>
            {profile.description}
          </p>
          {profile.description.length > 220 && (
            <button
              onClick={() => setExpandedBio(!expandedBio)}
              className="mt-2 text-[11px] font-semibold text-[#e0536c] hover:underline cursor-pointer"
            >
              {expandedBio ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* Popular Tracks Section */}
      {profile.topTracks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <h2 className="text-base font-serif font-bold text-white tracking-tight">Popular Tracks</h2>
            <span className="text-[11px] text-zinc-500 font-mono">{profile.topTracks.length} tracks</span>
          </div>

          <div className="space-y-1">
            {profile.topTracks.map((t, idx) => {
              const isItemPlaying = currentTrack?.id === t.id && isPlaying;
              const isFav = favorites.some(f => String(f?.id ?? '').trim() === String(t.id).trim());

              return (
                <div
                  key={`artist-track-${t.id}-${idx}`}
                  onClick={() => onPlayTrack(t, profile.topTracks)}
                  className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isItemPlaying
                      ? 'bg-[#9e2a40]/15 border-[#9e2a40]/40 text-white'
                      : 'bg-white/[0.015] hover:bg-white/[0.05] border-transparent hover:border-white/5 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Index / Playing indicator */}
                    <span className="w-5 text-center text-xs font-mono text-zinc-500 group-hover:text-white shrink-0">
                      {isItemPlaying ? (
                        <div className="w-3 h-3 rounded-full bg-[#e0536c] mx-auto animate-pulse" />
                      ) : (
                        idx + 1
                      )}
                    </span>

                    {/* Track Artwork */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
                      <img src={t.thumbnail} alt="" className="w-full h-full object-cover" />
                    </div>

                    {/* Title & Album */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate ${isItemPlaying ? 'text-[#e0536c]' : 'text-white'}`}>
                        {t.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                        {t.album || profile.name}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Duration */}
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(t);
                        }}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isFav ? 'text-rose-500' : 'text-zinc-500 hover:text-white opacity-0 group-hover:opacity-100'
                        }`}
                        title={isFav ? "Favorited" : "Add to favorites"}
                      >
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    )}

                    {onAddToQueue && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToQueue(t);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-white transition-all cursor-pointer"
                        title="Add to queue"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {onOpenAddToPlaylist && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAddToPlaylist(t);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-zinc-500 hover:text-white transition-all cursor-pointer"
                        title="Add to playlist"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <span className="text-[11px] font-mono text-zinc-500 w-10 text-right">
                      {t.duration || '3:30'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Albums Section */}
      {profile.albums.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <h2 className="text-base font-serif font-bold text-white tracking-tight">Albums & Discography</h2>
            <span className="text-[11px] text-zinc-500 font-mono">{profile.albums.length} releases</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {profile.albums.map((album) => (
              <div
                key={`album-${album.id}`}
                onClick={() => handleOpenAlbum(album)}
                className="group p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-[#9e2a40]/50 transition-all cursor-pointer flex flex-col"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/10 mb-2 relative">
                  {album.thumbnail ? (
                    <img src={album.thumbnail} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-800">
                      <Disc3 className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-[#9e2a40] text-white flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <p className="text-xs font-semibold text-white truncate group-hover:text-[#e0536c] transition-colors">
                  {album.title}
                </p>
                {album.year && (
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    {album.year}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Singles & EPs Section */}
      {profile.singles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <h2 className="text-base font-serif font-bold text-white tracking-tight">Singles & EPs</h2>
            <span className="text-[11px] text-zinc-500 font-mono">{profile.singles.length} singles</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {profile.singles.map((single) => (
              <div
                key={`single-${single.id}`}
                onClick={() => handleOpenAlbum(single)}
                className="group p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-[#9e2a40]/50 transition-all cursor-pointer flex flex-col"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/10 mb-2 relative">
                  {single.thumbnail ? (
                    <img src={single.thumbnail} alt={single.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-800">
                      <Disc3 className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-[#9e2a40] text-white flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                <p className="text-xs font-semibold text-white truncate group-hover:text-[#e0536c] transition-colors">
                  {single.title}
                </p>
                {single.year && (
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    {single.year}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similar Artists Section */}
      {profile.similarArtists.length > 0 && (
        <div className="space-y-3 pb-8">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <h2 className="text-base font-serif font-bold text-white tracking-tight">Fans Also Like</h2>
            <span className="text-[11px] text-zinc-500 font-mono">{profile.similarArtists.length} artists</span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {profile.similarArtists.map((rel) => (
              <div
                key={`rel-${rel.id || rel.name}`}
                onClick={() => onOpenArtist(rel.name, rel.id)}
                className="group flex flex-col items-center text-center p-3 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <ArtistAvatar 
                  name={rel.name} 
                  src={rel.avatar} 
                  size={72} 
                  className="mb-2 group-hover:ring-2 group-hover:ring-[#e0536c]/60 transition-all shadow-lg" 
                />
                <p className="text-xs font-medium text-zinc-300 group-hover:text-white truncate w-full">
                  {rel.name}
                </p>
                <span className="text-[10px] text-zinc-500">Artist</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          ALBUM INSPECTION DRAWER / MODAL
         ========================================================================= */}
      {inspectingAlbumId && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setInspectingAlbumId(null)}
        >
          <div 
            className="w-full max-w-2xl bg-[#121318] border border-white/10 rounded-2xl p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
                  {albumData?.thumbnail ? (
                    <img src={albumData.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-800">
                      <Disc3 className="w-8 h-8" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">
                    {albumData?.title || 'Loading album...'}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {albumData?.artist || profile.name} {albumData?.year ? `• ${albumData.year}` : ''}
                  </p>
                  {albumData?.durationText && (
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                      {albumData.durationText}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {albumData && albumData.tracks.length > 0 && (
                  <button
                    onClick={() => {
                      onPlayTrack(albumData.tracks[0], albumData.tracks);
                      setInspectingAlbumId(null);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-[#9e2a40] hover:bg-[#b8334d] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-[#9e2a40]/30"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play All</span>
                  </button>
                )}
                <button
                  onClick={() => setInspectingAlbumId(null)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  title="Close (Esc)"
                  aria-label="Close album modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto pr-1 py-4 flex-1 space-y-1">
              {albumLoading ? (
                <div className="py-16 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#e0536c]" />
                  <span className="text-xs">Fetching album tracklist...</span>
                </div>
              ) : albumError ? (
                <div className="py-12 text-center text-zinc-400">
                  <p className="text-xs text-rose-400 mb-2">{albumError}</p>
                </div>
              ) : albumData && albumData.tracks.length > 0 ? (
                albumData.tracks.map((t, idx) => {
                  const isTrackActive = currentTrack?.id === t.id && isPlaying;
                  return (
                    <div
                      key={`album-track-${t.id}-${idx}`}
                      onClick={() => {
                        onPlayTrack(t, albumData.tracks);
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl border transition-colors cursor-pointer ${
                        isTrackActive
                          ? 'bg-[#9e2a40]/15 border-[#9e2a40]/40 text-white'
                          : 'bg-white/[0.015] hover:bg-white/[0.05] border-transparent hover:border-white/5 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-5 text-center text-xs font-mono text-zinc-500 shrink-0">
                          {isTrackActive ? <div className="w-2.5 h-2.5 rounded-full bg-[#e0536c] mx-auto animate-pulse" /> : idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-medium truncate ${isTrackActive ? 'text-[#e0536c]' : 'text-white'}`}>
                            {t.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 truncate">
                            {t.artist}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-zinc-500 shrink-0 ml-3">
                        {t.duration || '3:30'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  No tracks available for this release.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
