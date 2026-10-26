export type AutoplayMode = 'similar' | 'artist' | 'discover' | 'balanced';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration: string;
  durationSeconds?: number;
  thumbnail: string;
  isOfflinePlayable?: boolean;
  local_audio_url?: string;
  local_artwork_url?: string;
  source?: string;
  file_size?: number;
  isAutoplay?: boolean;
  recommendationReason?: string;
  recommendationMode?: AutoplayMode;
}

export interface DownloadRecord {
  id: string;
  track_id: string;
  title: string;
  artist: string;
  thumbnail: string;
  source_url?: string;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'unsupported';
  progress: number;
  bytes_downloaded: number;
  total_bytes: number;
  error_message?: string;
}

export interface WordTime {
  word: string;
  time: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  words?: WordTime[];
}

export interface Playlist {
  id: string;
  name: string;
  title?: string;
  description?: string;
  cover_url?: string;
  tracks: Track[];
  createdAt: number;
  source?: 'local' | 'spotify' | 'youtube' | 'apple' | 'deezer';
  sourceUrl?: string;
  sourceId?: string;
  sourceAuthor?: string;
  thumbnail?: string;
  unmatchedTracks?: {
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    sourcePlatform?: 'spotify' | 'youtube' | 'apple' | 'deezer';
    sourceId?: string;
  }[];
}

export interface ArtistRelease {
  id: string;
  title: string;
  year?: string;
  thumbnail: string;
}

export interface RelatedArtist {
  id: string;
  name: string;
  avatar: string;
}

export interface ArtistProfile {
  id: string;
  name: string;
  avatar: string;
  banner?: string;
  description?: string;
  subscribers?: string;
  topTracks: Track[];
  albums: ArtistRelease[];
  singles: ArtistRelease[];
  similarArtists: RelatedArtist[];
}

export interface AlbumDetails {
  id: string;
  title: string;
  artist: string;
  year?: string;
  thumbnail: string;
  description?: string;
  trackCount?: number;
  durationText?: string;
  tracks: Track[];
}

export interface HistoryItem {
  track: Track;
  playedAt: number;
}

export type DnaProvenance = 'measured' | 'provider' | 'inferred';

export interface SongDnaProfile {
  track_id: string;
  bpm: number | null;
  energy: number; // 0 to 1
  danceability: number; // 0 to 1
  acousticness: number; // 0 to 1
  instrumentalness: number; // 0 to 1
  valence: number; // 0 to 1 (mood)
  mood_label: string;
  genre_labels: string[];
  provenance: DnaProvenance;
  confidence: number; // 0 to 100
  analysis_version?: number;
  analyzed_at?: number;
}

export interface ListeningHistoryRecord {
  id: string;
  track_id: string;
  title: string;
  artist: string;
  album?: string;
  duration: number;
  played_at: number;
  duration_played: number;
  completion_ratio: number;
  session_id?: string;
  source: 'manual' | 'dj' | 'radio' | 'playlist';
}

export interface ListeningStats {
  totalPlays: number;
  totalListeningMinutes: number;
  uniqueTracks: number;
  topArtists: { artist: string; plays: number; total_seconds: number; thumbnail?: string }[];
  topTracks: { track_id: string; title: string; artist: string; plays: number; last_played: number; thumbnail?: string }[];
}

export interface AudioLabPreset {
  id: string;
  name: string;
  description: string;
  gains: number[]; // 10 bands in dB
  preamp: number; // dB
  normalizer: boolean;
}

export interface PlaylistRescueMatch {
  originalIndex: number;
  originalTrack: {
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    sourcePlatform?: string;
  };
  matchedTrack: Track | null;
  confidence: number; // 0 to 100
  matchReason: string;
  status: 'matched' | 'low_confidence' | 'unmatched' | 'replaced';
  candidates: Track[];
}

export interface ListeningRoomMember {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
  pingMs: number;
}

export interface ListeningRoomState {
  roomId: string;
  roomName: string;
  hostId: string;
  isHost: boolean;
  currentTrack: Track | null;
  playbackTime: number;
  isPlaying: boolean;
  serverTimestamp: number;
  members: ListeningRoomMember[];
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      getLocalTrack: (trackId: string) => Promise<Track | null>;
      getAllDownloadedTracks: () => Promise<Track[]>;
      deleteDownload: (trackId: string) => Promise<{ success: boolean }>;
      downloadTrack: (track: any) => Promise<{ success: boolean; reason?: string; localAudioPath?: string; paused?: boolean }>;
      pauseDownload: (downloadId: string) => Promise<boolean>;
      resumeDownload: (downloadId: string) => Promise<{ success: boolean; message?: string }>;
      pauseAllDownloads: () => Promise<boolean>;
      resumeAllDownloads: () => Promise<boolean>;
      cancelDownload: (downloadId: string) => Promise<boolean>;
      retryDownload: (downloadId: string) => Promise<{ success: boolean; message?: string }>;
      getAllDownloads: () => Promise<DownloadRecord[]>;
      downloadPlaylist: (playlist: any, tracks: any[]) => Promise<any>;
      pausePlaylistDownload: (playlistId: string) => Promise<boolean>;
      resumePlaylistDownload: (playlistId: string) => Promise<boolean>;
      cancelPlaylistDownload: (playlistId: string) => Promise<boolean>;
      getStorageStats: () => Promise<{ downloadedCount: number; totalBytes: number; totalFormatted: string }>;
      cacheLyrics: (trackId: string, lyrics: any, format?: string, plain?: string) => Promise<{ success: boolean }>;
      getCachedLyrics: (trackId: string) => Promise<{ lyrics: LyricLine[]; format: string; plainLyrics?: string } | null>;
      saveSongDna: (dna: SongDnaProfile) => Promise<{ success: boolean }>;
      getSongDna: (trackId: string) => Promise<SongDnaProfile | null>;
      getAllSongDna: () => Promise<SongDnaProfile[]>;
      recordPlay: (entry: Partial<ListeningHistoryRecord>) => Promise<string>;
      getListeningHistory: (params?: { limit?: number; offset?: number }) => Promise<ListeningHistoryRecord[]>;
      getListeningStats: () => Promise<ListeningStats>;
      clearListeningHistory: (options?: { all?: boolean; trackId?: string; id?: string; beforeTimestamp?: number }) => Promise<any>;
      exportListeningData: () => Promise<any>;
      importLocalFiles: () => Promise<{ imported: number; tracks: Track[] }>;
      openFolder: (type: 'media' | 'artwork') => Promise<{ success: boolean }>;
      onDownloadProgress: (callback: (record: DownloadRecord) => void) => () => void;
      onPlaylistProgress: (callback: (progress: any) => void) => () => void;
      onOpenBackupModal: (callback: () => void) => () => void;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      isMaximized: () => Promise<boolean>;
      toggleFullscreen: () => Promise<boolean>;
      isFullscreen: () => Promise<boolean>;
      onFullscreenChange: (callback: (isFs: boolean) => void) => () => void;
      toggleMiniWidget: () => Promise<boolean>;
      isMiniWidgetOpen: () => Promise<boolean>;
      toggleWidgetPin: () => Promise<boolean>;
      expandToMain: () => void;
      closeMiniWidget: () => void;
      broadcastPlaybackState: (state: any) => void;
      sendWidgetAction: (action: { type: string; payload?: any }) => void;
      onSyncState: (callback: (state: any) => void) => () => void;
      onExecuteWidgetAction: (callback: (action: { type: string; payload?: any }) => void) => () => void;
      onRequestStateSync: (callback: () => void) => () => void;
      onMiniWidgetClosed: (callback: () => void) => () => void;
    };
  }
}

