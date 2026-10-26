import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Track, LyricLine, Playlist, HistoryItem, AutoplayMode } from './types';
import { parseLrc, parseLyricsPayload, LyricFormat } from './utils/lyricsParser';
import { DesktopPlayerView } from './components/DesktopPlayerView';
import { CinematicLyricsView } from './components/CinematicLyricsView';
import { PlaylistModal } from './components/PlaylistModal';
import { CreatePlaylistModal } from './components/CreatePlaylistModal';
import { ImportPlaylistModal } from './components/ImportPlaylistModal';
import { DataSaverModal } from './components/DataSaverModal';
import { AppearanceModal } from './components/AppearanceModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { GhostDjModal } from './components/GhostDjModal';
import { AudioLabModal } from './components/AudioLabModal';
import { PlaylistRescueModal } from './components/PlaylistRescueModal';
import { ListeningRoomModal } from './components/ListeningRoomModal';
import { AboutModal } from './components/AboutModal';
import { audioLab } from './services/audioLabEngine';
import { musicMemory } from './services/musicMemoryService';
import { listeningRooms } from './services/listeningRoomsService';
import { getNextRadioTrack } from './services/ghostDjEngine';
import { generateAutoplayBatch } from './services/smartAutoplayService';
import { 
  WALLPAPER_PRESETS, 
  saveCustomWallpaper, 
  loadCustomWallpaper, 
  clearCustomWallpaper 
} from './utils/wallpaperStorage';
import { getOptimizedArtwork } from './utils/artwork';
import { GhostSkinProfile, deriveGhostSkinProfile, getFallbackGhostSkin } from './utils/ghostSkin';
import { 
  TrackPalette, 
  getFallbackPalette, 
  extractArtworkPalette, 
  applyGlowSettings 
} from './utils/palette';
import { 
  ThemeSettings, 
  getThemeSettings, 
  saveThemeSettings, 
  THEME_OVERRIDE_PALETTES 
} from './utils/themeSettings';
import { 
  isDesktopApp, 
  subscribeNetworkStatus, 
  getLocalTrack, 
  getAllDownloadedTracks, 
  downloadTrack, 
  pauseDownload,
  resumeDownload,
  downloadPlaylist, 
  pausePlaylistDownload,
  resumePlaylistDownload,
  cacheLyrics, 
  getCachedLyrics,
  subscribeDownloadProgress,
  subscribePlaylistProgress,
  subscribeOpenBackupModal,
  toggleMiniWidget,
  isMiniWidgetOpen,
  broadcastPlaybackState,
  sendWidgetAction,
  subscribeWidgetSync,
  subscribeExecuteWidgetAction,
  subscribeRequestStateSync,
  subscribeMiniWidgetClosed
} from './services/desktopService';
import { FloatingWidgetView } from './components/FloatingWidgetView';
import { 
  DataSaverConfig, 
  getDefaultDataSaverConfig, 
  saveDataSaverConfig, 
  memoryLyricsCache,
  memoryGenreCache,
  memorySearchCache,
  recordDataSaved 
} from './utils/dataSaver';
import { getApiUrl } from './utils/api';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

const DEFAULT_TIMELESS_LRC = `[00:00.00] ♪ (Intro)
[00:28.58] Oh, yeah
[00:30.37] Oh, yeah, no
[00:33.85] Ever since I was a jit, knew I was the shit (ooh, yeah)
[00:37.79] Shorty keep wanna come 'round, she wanna get hit
[00:41.69] She think she the main because I keep her by my side
[00:45.84] Double-O, bust down the watch, she know that I'm timeless
[00:50.35] I put my son in some Rick
[00:52.39] I pull that gun off the hip
[00:54.41] Pockets on 22 clips
[00:56.92] I break her heart, Comme Garçons
[00:58.98] Put on a shirt, get put on a blimp
[01:00.81] Bitch like a stain, get ready to lick
[01:02.86] I had to tell her that ever since I was a jit, knew I was the shit
[01:07.35] She singin' my songs, she wanna die lit, tryna get hit
[01:11.56] House like a bank (house like a bank), deposit this bit
[01:14.43] 'Posit that check
[01:15.95] Smile on my face (yeah), ain't fakin' shit
[01:18.73] Come and get checked
[01:19.82] Ice on my neck, double-O wrist
[01:21.85] She in the scat, hell of a 'Cat
[01:23.80] Fresh out the trench, 400 packs
[01:25.80] Uh, yeah, I'm spinnin' in Paris
[01:27.72] Dress for these hoes, they finna flock
[01:29.72] Just poured a four in a soda, it popped
[01:31.73] Them drugs finna hit, I'm feelin' Hell
[01:33.69] I'm wrestlin' all of my demons, I feel like The Rock (shit, huh)
[01:35.50] Ooh, yeah (ooh, yeah)
[01:36.80] Ever since I was a kid
[01:37.79] I been legit (ooh, yeah)
[01:41.78] If I was you, I would cut up my wrist (yeah)
[01:45.46] XO tatted all over her body, oh
[01:49.71] She just wanna roll and I don't mind it, yeah
[01:53.74] Ever since I was jit, I been legit (ooh, nah)
[01:57.74] You should let her go, she wanna be it (mm, yes)
[02:00.43] City on fire when I'm comin' home
[02:04.22] Fill up the sky, fill it up with smoke
[02:08.20] Got a long drive, I gotta go alone
[02:11.96] She wanna die, she wanna die slow
[02:16.14] She singin' my songs, she wanna die lit
[02:18.99] Sing it word for word, she know that I'm timeless
[02:22.95] Double-O, bust down the watch, she know that I'm timeless
[02:26.96] I'm in this bitch, and I'm with the clique
[02:28.98] I'm on a roll, they cannot control
[02:30.93] She wanna fuck, she wanna go
[02:32.89] I break her heart, Comme Garçons
[02:34.90] Put on a shirt, get put on a blimp
[02:36.87] Bitch like a stain, get ready to lick
[02:38.93] I had to tell her that ever since I was a jit, knew I was the shit
[02:43.37] She singin' my songs, she wanna die lit, tryna get hit
[02:47.38] House like a bank, deposit this bit
[02:50.41] 'Posit that check
[02:51.90] Smile on my face, ain't fakin' shit
[02:54.67] Come and get checked
[02:55.77] Ice on my neck, double-O wrist
[02:57.81] She in the scat, hell of a 'Cat
[02:59.78] Fresh out the trench, 400 packs
[03:01.81] Uh, yeah, I'm spinnin' in Paris
[03:03.73] Dress for these hoes, they finna flock
[03:05.74] Just poured a four in a soda, it popped
[03:07.75] Them drugs finna hit, I'm feelin' Hell
[03:09.72] I'm wrestlin' all of my demons, I feel like The Rock
[03:11.51] Ooh, yeah
[03:12.79] Ever since I was a kid
[03:13.78] I been legit
[03:17.76] If I was you, I would cut up my wrist
[03:21.46] XO tatted all over her body, oh
[03:25.71] She just wanna roll and I don't mind it, yeah
[03:29.74] Ever since I was jit, I been legit
[03:33.74] You should let her go, she wanna be it
[03:36.43] City on fire when I'm comin' home
[03:40.23] Fill up the sky, fill it up with smoke
[03:44.20] Got a long drive, I gotta go alone
[03:47.96] She wanna die, she wanna die slow
[03:52.14] Timeless, yeah, timeless
[03:56.14] She know that I'm timeless
[04:00.14] Timeless, yeah, timeless
[04:04.14] She know that I'm timeless`;

const DEFAULT_TRACKS: Track[] = [
  {
    id: 'a4O-abCXsfA',
    title: 'Timeless (feat. Playboi Carti)',
    artist: 'The Weeknd',
    album: 'Hurry Up Tomorrow',
    thumbnail: 'https://yt3.googleusercontent.com/9ds8ikP1c3pkqRFeztLdUu5w3wUZrhYD2U9pUM5eStacumTocYtHieEGcAKQo5CsBvSB_m4bVCUAs_eXJA=w544-h544-l90-rj',
    duration: '4:16',
    durationSeconds: 256
  },
  {
    id: 'ZqSlV5LmrTg',
    title: 'Snooze',
    artist: 'SZA',
    album: 'SOS',
    thumbnail: 'https://yt3.googleusercontent.com/o3i9-dA34xDjbw1hz4nhJO6LA6V4-ZYjs_kh7aUA0sq1pieJejt_Hnor-Rxl77GA1ugAFqxcmEUwy3c=w544-h544-l90-rj',
    duration: '3:21',
    durationSeconds: 201
  },
  {
    id: 'HBgTiMrtEgI',
    title: 'First Person Shooter (feat. J. Cole)',
    artist: 'Drake',
    album: 'For All The Dogs',
    thumbnail: 'https://yt3.googleusercontent.com/LNtaC8gTrKrnikWZwYenbpcW-1rTN9dOTvislu7UXVJELwo4ZRjrMfSW1ioPwklP5ktl8dgkWcilopNd=w544-h544-l90-rj',
    duration: '4:07',
    durationSeconds: 247
  },
  {
    id: '3az-NQCK57c',
    title: 'City Boys',
    artist: 'Burna Boy',
    album: 'I Told Them...',
    thumbnail: 'https://yt3.googleusercontent.com/aLiyrbgT5FmrRJhs51pu8Juo8dUprNOW2LrzGKr2dpMiiKiC7dkWGCPAonrJikoc3V_OLRJ9cm04p-CxAQ=w544-h544-l90-rj',
    duration: '3:33',
    durationSeconds: 213
  },
  {
    id: 'aC9HkZW2hZk',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    album: 'Lover',
    thumbnail: 'https://yt3.googleusercontent.com/OhxDTHQOQzSrcdgH9hzqzp1v22GYDE-QKnkryvCeq4ddx-3K3_c8oDXN0E6NvHlMn1q4XV59aHr0oL4f=w544-h544-l90-rj',
    duration: '2:58',
    durationSeconds: 178
  },
  {
    id: '2nR1zrNzgcY',
    title: 'FEIN (feat. Playboi Carti)',
    artist: 'Travis Scott',
    album: 'UTOPIA',
    thumbnail: 'https://yt3.googleusercontent.com/eBvJuWpjg0Mx8DBa5WIhCzEopXyMnxkjWSU895BDGjTpNeqrliLrv3zGqNNuCUoXL1EkEAr5VQ3cx2pW=w544-h544-l90-rj',
    duration: '3:11',
    durationSeconds: 191
  },
  {
    id: '3_g2un5M350',
    title: 'Starboy (feat. Daft Punk)',
    artist: 'The Weeknd',
    album: 'Starboy',
    thumbnail: 'https://yt3.googleusercontent.com/dcxXIIlest09vnvKznWM9VWQXu1EL7lKxBzXGzwgmVjmMNBm1dEWT_0qn1xrEZYyKF_qRE1TLq8P_JY_mQ=w544-h544-l90-rj',
    duration: '3:50',
    durationSeconds: 230
  }
];

export function App() {
  // Standalone Electron Desktop Mini-Player Widget Mode check
  const isStandaloneMiniWidget = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'mini-widget';
  }, []);

  const [widgetSyncState, setWidgetSyncState] = useState<{
    track: Track | null;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    lyrics: LyricLine[];
    volume: number;
    isMuted: boolean;
    isLiked: boolean;
    isShuffle: boolean;
    isRepeat: boolean | 'one';
  }>({
    track: null,
    currentTime: 0,
    duration: 210,
    isPlaying: false,
    lyrics: [],
    volume: 0.8,
    isMuted: false,
    isLiked: false,
    isShuffle: false,
    isRepeat: false
  });

  useEffect(() => {
    if (!isStandaloneMiniWidget) return;
    try {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      document.body.style.overflow = 'hidden';
    } catch {}
    const unsub = subscribeWidgetSync((state) => {
      if (state) setWidgetSyncState(prev => ({ ...prev, ...state }));
    });
    return () => unsub();
  }, [isStandaloneMiniWidget]);

  // Playback state: pre-seeded with iconic reference tracks for instantaneous 3D shelf display
  const [currentTrack, setCurrentTrack] = useState<Track | null>(DEFAULT_TRACKS[0]);
  const [queue, setQueue] = useState<Track[]>(DEFAULT_TRACKS);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_TRACKS[0].durationSeconds || 256);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isRepeat, setIsRepeat] = useState<boolean | 'one'>(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [autoplay, setAutoplay] = useState<boolean>(() => {
    try {
      return localStorage.getItem('metrolist_autoplay') !== 'false';
    } catch {
      return true;
    }
  });

  const [autoplayMode, setAutoplayMode] = useState<AutoplayMode>(() => {
    try {
      return (localStorage.getItem('ghosttunes_autoplay_mode') as AutoplayMode) || 'balanced';
    } catch {
      return 'balanced';
    }
  });

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const autoplayRejectedIdsRef = useRef<Set<string>>(new Set());
  const sessionPlayedIdsRef = useRef<Set<string>>(new Set());
  const isAutoplayFetchingRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem('ghosttunes_autoplay_mode', autoplayMode);
    } catch (e) {
      console.error('Failed to save autoplayMode', e);
    }
  }, [autoplayMode]);

  // Wallpaper mode: 'artwork' (Default) | 'custom' | 'ambient'
  const [wallpaperMode, setWallpaperMode] = useState<'artwork' | 'custom' | 'ambient'>(() => {
    try {
      return (localStorage.getItem('metrolist_wallpaper_mode') as any) || 'artwork';
    } catch {
      return 'artwork';
    }
  });

  const handleSetWallpaperMode = (mode: 'artwork' | 'custom' | 'ambient') => {
    setWallpaperMode(mode);
    try {
      localStorage.setItem('metrolist_wallpaper_mode', mode);
    } catch {}
  };

  // Wallpaper state: persisted in IndexedDB for custom uploads & localStorage for preset ID
  const [wallpaper, setWallpaper] = useState<string>(() => {
    try {
      return localStorage.getItem('metrolist_wallpaper') || 'dark_anime';
    } catch {
      return 'dark_anime';
    }
  });
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string | null>(null);

  // Restore custom wallpaper from IndexedDB if user previously selected custom
  useEffect(() => {
    const initWallpaper = async () => {
      try {
        const saved = localStorage.getItem('metrolist_wallpaper');
        if (saved === 'custom') {
          const customUrl = await loadCustomWallpaper();
          if (customUrl) {
            setCustomWallpaperUrl(customUrl);
            setWallpaper('custom');
          } else {
            setWallpaper('dark_anime');
          }
        } else if (saved && WALLPAPER_PRESETS.some(p => p.id === saved)) {
          setWallpaper(saved);
        } else {
          setWallpaper('dark_anime');
        }
      } catch {
        setWallpaper('dark_anime');
      }
    };
    initWallpaper();
  }, []);

  // Data Saver configuration state
  const [dataSaverConfig, setDataSaverConfig] = useState<DataSaverConfig>(getDefaultDataSaverConfig);
  const [isDataSaverModalOpen, setIsDataSaverModalOpen] = useState(false);

  const handleSaveDataSaver = (newConfig: DataSaverConfig) => {
    setDataSaverConfig(newConfig);
    saveDataSaverConfig(newConfig);
  };

  // Appearance & Per-Song Adaptive Lighting state
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getThemeSettings);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  const handleUpdateThemeSettings = (newSettings: ThemeSettings) => {
    setThemeSettings(newSettings);
    saveThemeSettings(newSettings);
  };

  // Active per-song palette state
  const [currentPalette, setCurrentPalette] = useState<TrackPalette>(() => {
    const fallback = getFallbackPalette(DEFAULT_TRACKS[0].id, DEFAULT_TRACKS[0].title, DEFAULT_TRACKS[0].artist);
    const initialSettings = getThemeSettings();
    if (initialSettings.mode !== 'auto') {
      return applyGlowSettings(THEME_OVERRIDE_PALETTES[initialSettings.mode], initialSettings.glowIntensity);
    }
    return applyGlowSettings(fallback, initialSettings.glowIntensity);
  });

  const paletteRequestIdRef = useRef(0);
  const lyricsAbortControllerRef = useRef<AbortController | null>(null);

  // Extract artwork palette on track change or theme settings change (with race condition prevention)
  useEffect(() => {
    const requestId = ++paletteRequestIdRef.current;

    if (themeSettings.mode !== 'auto') {
      const override = THEME_OVERRIDE_PALETTES[themeSettings.mode];
      setCurrentPalette(applyGlowSettings(override, themeSettings.glowIntensity));
      return;
    }

    if (!currentTrack) return;

    const artworkUrl = getOptimizedArtwork(
      currentTrack.thumbnail, 
      dataSaverConfig.enabled && dataSaverConfig.lowDataArtwork
    );

    extractArtworkPalette(
      artworkUrl, 
      currentTrack.id, 
      currentTrack.title, 
      currentTrack.artist
    ).then((extracted) => {
      // Discard stale responses from previous songs on rapid track changes
      if (requestId === paletteRequestIdRef.current) {
        setCurrentPalette(applyGlowSettings(extracted, themeSettings.glowIntensity));
      }
    });
  }, [
    currentTrack?.id, 
    currentTrack?.thumbnail, 
    currentTrack?.title, 
    currentTrack?.artist, 
    themeSettings.mode, 
    themeSettings.glowIntensity,
    dataSaverConfig.enabled,
    dataSaverConfig.lowDataArtwork
  ]);

  // GhostSkin visual profile state
  const [ghostSkin, setGhostSkin] = useState<GhostSkinProfile>(() => {
    return getFallbackGhostSkin(DEFAULT_TRACKS[0].id, DEFAULT_TRACKS[0].title, DEFAULT_TRACKS[0].artist);
  });
  const ghostSkinRequestIdRef = useRef(0);

  // Derive GhostSkin profile from artwork and metadata
  useEffect(() => {
    const requestId = ++ghostSkinRequestIdRef.current;
    if (!currentTrack) return;

    const artworkUrl = getOptimizedArtwork(
      currentTrack.thumbnail,
      dataSaverConfig.enabled && dataSaverConfig.lowDataArtwork
    );

    deriveGhostSkinProfile(
      artworkUrl,
      currentTrack.id,
      currentTrack.title,
      currentTrack.artist
    ).then((profile) => {
      if (requestId === ghostSkinRequestIdRef.current) {
        setGhostSkin(profile);
      }
    });
  }, [
    currentTrack?.id,
    currentTrack?.thumbnail,
    currentTrack?.title,
    currentTrack?.artist,
    dataSaverConfig.enabled,
    dataSaverConfig.lowDataArtwork
  ]);

  const targetWallpaperUrl = useMemo(() => {
    if (wallpaperMode === 'artwork') {
      return currentTrack?.thumbnail 
        ? getOptimizedArtwork(currentTrack.thumbnail, dataSaverConfig.enabled && dataSaverConfig.lowDataArtwork) 
        : '';
    }
    if (wallpaperMode === 'custom') {
      if (wallpaper === 'custom' && customWallpaperUrl) {
        return customWallpaperUrl;
      }
      const preset = WALLPAPER_PRESETS.find(p => p.id === wallpaper) || WALLPAPER_PRESETS[0];
      return preset.file;
    }
    return ''; // 'ambient'
  }, [wallpaperMode, currentTrack?.thumbnail, wallpaper, customWallpaperUrl, dataSaverConfig.enabled, dataSaverConfig.lowDataArtwork]);

  // Seamless crossfading background system
  const [currentBgUrl, setCurrentBgUrl] = useState<string>(() => {
    return currentTrack?.thumbnail 
      ? getOptimizedArtwork(currentTrack.thumbnail, dataSaverConfig.enabled && dataSaverConfig.lowDataArtwork) 
      : '';
  });
  const [prevBgUrl, setPrevBgUrl] = useState<string>('');
  const [isCrossfading, setIsCrossfading] = useState(false);

  useEffect(() => {
    if (targetWallpaperUrl === currentBgUrl) return;

    if (!targetWallpaperUrl) {
      setPrevBgUrl(currentBgUrl);
      setCurrentBgUrl('');
      setIsCrossfading(true);
      const timer = setTimeout(() => {
        setIsCrossfading(false);
        setPrevBgUrl('');
      }, 700);
      return () => clearTimeout(timer);
    }

    // Preload target artwork before crossfade to prevent any flashing
    const img = new Image();
    img.src = targetWallpaperUrl;
    img.onload = () => {
      setPrevBgUrl(currentBgUrl);
      setCurrentBgUrl(targetWallpaperUrl);
      setIsCrossfading(true);
      const timer = setTimeout(() => {
        setIsCrossfading(false);
        setPrevBgUrl('');
      }, 700);
    };
    img.onerror = () => {
      setCurrentBgUrl(targetWallpaperUrl);
    };
  }, [targetWallpaperUrl, currentBgUrl]);

  const handleSelectPreset = (presetId: string) => {
    setWallpaper(presetId);
    setWallpaperMode('custom');
    try {
      localStorage.setItem('metrolist_wallpaper', presetId);
      localStorage.setItem('metrolist_wallpaper_mode', 'custom');
    } catch {}
  };

  const handleUploadWallpaper = async (file: File) => {
    const objectUrl = await saveCustomWallpaper(file);
    setCustomWallpaperUrl(objectUrl);
    setWallpaper('custom');
    setWallpaperMode('custom');
    try {
      localStorage.setItem('metrolist_wallpaper', 'custom');
      localStorage.setItem('metrolist_wallpaper_mode', 'custom');
    } catch {}
  };

  const handleResetWallpaper = async () => {
    await clearCustomWallpaper();
    setCustomWallpaperUrl(null);
    setWallpaper('dark_anime');
    setWallpaperMode('artwork');
    try {
      localStorage.setItem('metrolist_wallpaper', 'dark_anime');
      localStorage.setItem('metrolist_wallpaper_mode', 'artwork');
    } catch {}
  };

  // Views & Editorial Navigation
  const [currentView, setCurrentView] = useState<'home' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist'>('home');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [downloadedTrackIds, setDownloadedTrackIds] = useState<Set<string>>(new Set());
  const [activeDownloadingTrackIds, setActiveDownloadingTrackIds] = useState<Set<string>>(new Set());
  const [activeDownloadingPlaylistIds, setActiveDownloadingPlaylistIds] = useState<Set<string>>(new Set());
  const [pausedDownloadingTrackIds, setPausedDownloadingTrackIds] = useState<Set<string>>(new Set());
  const [pausedDownloadingPlaylistIds, setPausedDownloadingPlaylistIds] = useState<Set<string>>(new Set());
  const [showLyrics, setShowLyrics] = useState(false);
  const [playlistModalTrack, setPlaylistModalTrack] = useState<Track | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreatePlaylistOpen, setIsCreatePlaylistOpen] = useState(false);
  const [selectedArtistQuery, setSelectedArtistQuery] = useState<{ id?: string; name: string } | null>(null);
  const navHistoryRef = useRef<Array<'home' | 'explore' | 'library' | 'favorites' | 'downloads' | 'memory' | 'artist'>>(['home']);

  const handleOpenArtist = (name: string, id?: string) => {
    if (!name || !name.trim()) return;
    navHistoryRef.current.push(currentView);
    setSelectedArtistQuery({ name: name.trim(), id });
    setCurrentView('artist');
    setShowLyrics(false);
  };

  const handleBackFromArtist = () => {
    const prev = navHistoryRef.current.pop() || 'home';
    setCurrentView(prev);
  };

  // Million-Dollar Product Expansion Modals
  const [isGhostDjOpen, setIsGhostDjOpen] = useState(false);
  const [isAudioLabOpen, setIsAudioLabOpen] = useState(false);
  const [isListeningRoomOpen, setIsListeningRoomOpen] = useState(false);
  const [isPlaylistRescueOpen, setIsPlaylistRescueOpen] = useState(false);
  const [rescueTargetPlaylist, setRescueTargetPlaylist] = useState<Playlist | null>(null);
  const [isRadioActive, setIsRadioActive] = useState(false);
  const radioRejectedIdsRef = useRef<Set<string>>(new Set());

  // Search & Genre States (Unified across app)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('Trending');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);
  const genreAbortRef = useRef<AbortController | null>(null);

  // Search execution with client memory cache & request cancellation
  const executeSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    if (memorySearchCache.has(cacheKey)) {
      setSearchResults(memorySearchCache.get(cacheKey)!);
      recordDataSaved(4500);
      return;
    }

    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(trimmed)}`), {
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      const results = data.results || [];
      memorySearchCache.set(cacheKey, results);
      setSearchResults(results);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('Search failed', e);
      setSearchError(e.message || 'Search request failed. Please check connection.');
    } finally {
      if (searchAbortRef.current === controller) {
        setSearchLoading(false);
      }
    }
  };

  // Genre tracks fetch with client memory cache & request cancellation
  const fetchGenreTracks = async (genre: string) => {
    setSelectedGenre(genre);

    if (memoryGenreCache.has(genre)) {
      setGenreTracks(memoryGenreCache.get(genre)!);
      recordDataSaved(3500);
      return;
    }

    if (genreAbortRef.current) {
      genreAbortRef.current.abort();
    }
    const controller = new AbortController();
    genreAbortRef.current = controller;

    setSearchLoading(true);
    setSearchError(null);
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
      if (e.name === 'AbortError') return;
      console.error('Failed to fetch genre tracks', e);
      setSearchError(e.message || 'Failed to fetch tracks. Please check connection.');
    } finally {
      if (genreAbortRef.current === controller) {
        setSearchLoading(false);
      }
    }
  };

  // Pre-load initial Trending tracks on mount
  useEffect(() => {
    fetchGenreTracks('Trending');
  }, []);

  // Debounced search query listener (300ms)
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(trimmed);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Favorites state
  const [favorites, setFavorites] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem('metrolist_favorites');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_TRACKS.slice(0, 6);
    } catch {
      return DEFAULT_TRACKS.slice(0, 6);
    }
  });

  // Playlists state
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem('metrolist_playlists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // History state
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('metrolist_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Lyrics state: pre-seeded with synced lyrics for instantaneous cinematic display
  const [lyrics, setLyrics] = useState<LyricLine[]>(() => parseLrc(DEFAULT_TIMELESS_LRC));
  const [plainLyrics, setPlainLyrics] = useState<string | undefined>();
  const [lyricsFormat, setLyricsFormat] = useState<LyricFormat>('synced');
  const [plainStanzas, setPlainStanzas] = useState<string[][]>([]);
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSeekingRef = useRef(false);
  const seekTimeoutRef = useRef<any>(null);
  const isLocalActiveRef = useRef(false);
  const fallbackAttemptedRef = useRef<Set<string>>(new Set());
  const isRepeatRef = useRef(isRepeat);
  isRepeatRef.current = isRepeat;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const currentTrackRef = useRef<Track | null>(null);
  currentTrackRef.current = currentTrack;

  // Sync offline downloads in Desktop mode
  const refreshDownloadedTracks = async () => {
    if (isDesktopApp()) {
      try {
        const tracks = await getAllDownloadedTracks();
        setDownloadedTrackIds(new Set(tracks.map(t => t.id)));
      } catch (err) {
        console.warn('[Desktop] Error loading downloaded tracks:', err);
      }
    }
  };

  const handleTrackDeleted = (trackId: string) => {
    setDownloadedTrackIds(prev => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
    refreshDownloadedTracks();
  };

  useEffect(() => {
    refreshDownloadedTracks();

    const unsubNetwork = subscribeNetworkStatus((online) => {
      if (!online) {
        setIsOfflineMode(true);
      }
    });

    const unsubDl = subscribeDownloadProgress((record) => {
      if (record.status === 'downloading') {
        setActiveDownloadingTrackIds(prev => new Set(prev).add(record.track_id));
        setPausedDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
      } else if (record.status === 'paused') {
        setActiveDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
        setPausedDownloadingTrackIds(prev => new Set(prev).add(record.track_id));
      } else if (record.status === 'completed') {
        refreshDownloadedTracks();
        setActiveDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
        setPausedDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
      } else if (record.status === 'failed' || record.status === 'cancelled' || record.status === 'unsupported') {
        setActiveDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
        setPausedDownloadingTrackIds(prev => {
          const next = new Set(prev);
          next.delete(record.track_id);
          return next;
        });
      }
    });

    const unsubPl = subscribePlaylistProgress((progress) => {
      if (progress.isFinished) {
        refreshDownloadedTracks();
        setActiveDownloadingPlaylistIds(prev => {
          const next = new Set(prev);
          next.delete(progress.playlistId);
          return next;
        });
        setPausedDownloadingPlaylistIds(prev => {
          const next = new Set(prev);
          next.delete(progress.playlistId);
          return next;
        });
      } else if (progress.isPaused) {
        setActiveDownloadingPlaylistIds(prev => {
          const next = new Set(prev);
          next.delete(progress.playlistId);
          return next;
        });
        setPausedDownloadingPlaylistIds(prev => new Set(prev).add(progress.playlistId));
      } else {
        setActiveDownloadingPlaylistIds(prev => new Set(prev).add(progress.playlistId));
        setPausedDownloadingPlaylistIds(prev => {
          const next = new Set(prev);
          next.delete(progress.playlistId);
          return next;
        });
      }
    });

    const unsubBackup = subscribeOpenBackupModal(() => {
      setIsBackupModalOpen(true);
    });

    const unsubRoom = listeningRooms.subscribe((state) => {
      const room = listeningRooms.getActiveRoom();
      if (!room.isHost && state.currentTrack && audioRef.current) {
        if (currentTrackRef.current?.id !== state.currentTrack.id) {
          playTrack(state.currentTrack);
        } else {
          listeningRooms.alignAudioDrift(audioRef.current, state.playbackTime, state.isPlaying);
        }
      }
    });

    return () => {
      unsubNetwork();
      unsubDl();
      unsubPl();
      unsubBackup();
      unsubRoom();
    };
  }, []);

  const handleDownloadTrack = async (track: Track) => {
    if (!track?.id) return;

    if (!isDesktopApp()) {
      // In web browser: trigger direct download of the audio file
      const link = document.createElement('a');
      link.href = getApiUrl(`/api/download/${track.id}`);
      link.download = `${track.title} - ${track.artist}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    if (activeDownloadingTrackIds.has(track.id)) {
      await pauseDownload(track.id);
      return;
    }

    if (pausedDownloadingTrackIds.has(track.id)) {
      await resumeDownload(track.id);
      return;
    }

    setActiveDownloadingTrackIds(prev => new Set(prev).add(track.id));
    try {
      const res = await downloadTrack(track);
      if (res.success) {
        await refreshDownloadedTracks();
      } else if (res.reason) {
        alert(res.reason);
      }
    } catch (err: any) {
      console.error('[Download] Failed to download track:', err);
    } finally {
      setActiveDownloadingTrackIds(prev => {
        const next = new Set(prev);
        next.delete(track.id);
        return next;
      });
    }
  };

  const handleDownloadPlaylist = async (playlist: Playlist, tracks?: Track[]) => {
    const listTracks = tracks || playlist.tracks || [];
    if (listTracks.length === 0) {
      alert('This playlist has no tracks to download.');
      return;
    }

    if (!isDesktopApp()) {
      alert(`Downloading ${listTracks.length} tracks for offline listening is supported directly in the Ghosttunes Desktop app.`);
      return;
    }

    if (activeDownloadingPlaylistIds.has(playlist.id)) {
      await pausePlaylistDownload(playlist.id);
      return;
    }

    if (pausedDownloadingPlaylistIds.has(playlist.id)) {
      await resumePlaylistDownload(playlist.id);
      return;
    }

    setActiveDownloadingPlaylistIds(prev => new Set(prev).add(playlist.id));
    try {
      await downloadPlaylist(playlist, listTracks);
      await refreshDownloadedTracks();
    } catch (err: any) {
      console.error('[Download] Failed to download playlist:', err);
    } finally {
      setActiveDownloadingPlaylistIds(prev => {
        const next = new Set(prev);
        next.delete(playlist.id);
        return next;
      });
    }
  };

  // Real-time audio playback clock synchronizer
  useEffect(() => {
    let animId: number;
    let lastReportedTime = -1;

    const syncPlaybackClock = () => {
      const audio = audioRef.current;
      if (
        audio &&
        !audio.seeking &&
        !isSeekingRef.current &&
        typeof audio.currentTime === 'number' &&
        !isNaN(audio.currentTime)
      ) {
        const curTime = audio.currentTime;
        if (Math.abs(curTime - lastReportedTime) >= 0.05) {
          lastReportedTime = curTime;
          setCurrentTime(curTime);
        }
        if (typeof audio.duration === 'number' && !isNaN(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      }
      animId = requestAnimationFrame(syncPlaybackClock);
    };

    animId = requestAnimationFrame(syncPlaybackClock);
    return () => cancelAnimationFrame(animId);
  }, []);

  // Persist storage
  useEffect(() => {
    try {
      localStorage.setItem('metrolist_favorites', JSON.stringify(favorites));
    } catch (e) {
      console.error('Failed to save favorites', e);
    }
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem('metrolist_playlists', JSON.stringify(playlists));
    } catch (e) {
      console.error('Failed to save playlists', e);
    }
  }, [playlists]);

  useEffect(() => {
    try {
      localStorage.setItem('metrolist_history', JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save history', e);
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem('metrolist_autoplay', String(autoplay));
    } catch (e) {
      console.error('Failed to save autoplay', e);
    }
  }, [autoplay]);

  useEffect(() => {
    try {
      localStorage.setItem('metrolist_wallpaper', wallpaper);
    } catch (e) {
      console.error('Failed to save wallpaper', e);
    }
  }, [wallpaper]);

  // Initial load: Fetch trending hits from YouTube Music to supplement queue
  // If Data Saver is active with reducedPreload, defer queue expansion until user opens Explore
  useEffect(() => {
    if (dataSaverConfig.enabled && dataSaverConfig.reducedPreload) {
      return;
    }

    const fetchInitialTracks = async () => {
      try {
        const res = await fetch(getApiUrl('/api/genre?q=Trending%20Hits'));
        if (res.ok) {
          const data = await res.json();
          const tracks = data.tracks || [];
          if (tracks.length > 0) {
            setQueue(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newItems = tracks.filter((t: Track) => !existingIds.has(t.id));
              return [...prev, ...newItems];
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch initial tracks', err);
      }
    };

    fetchInitialTracks();
  }, []);

  // Keyboard shortcut Ctrl+K / Cmd+K / / to open Search & Explore
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCurrentView(prev => prev === 'explore' ? 'home' : 'explore');
      } else if (e.key === '/' && e.target === document.body) {
        e.preventDefault();
        setCurrentView('explore');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Fetch lyrics with intelligent multi-tier matching, client-side memory caching, and race condition prevention
  const fetchLyrics = async (track: Track, forceFresh = false) => {
    // Abort previous in-flight lyrics request to prevent race conditions during rapid track skip or retry
    if (lyricsAbortControllerRef.current) {
      lyricsAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    lyricsAbortControllerRef.current = controller;

    setLoadingLyrics(true);
    setLyrics([]);
    setPlainLyrics(undefined);
    setPlainStanzas([]);
    setIsInstrumental(false);
    setLyricsFormat('none');

    // 1. Check client-side in-memory cache first (only use cache if it has verified synchronized lyrics or confirmed instrumental)
    if (!forceFresh && memoryLyricsCache.has(track.id)) {
      const cached = memoryLyricsCache.get(track.id)!;
      if (cached.syncedLyrics || cached.instrumental) {
        setIsInstrumental(Boolean(cached.instrumental));
        const parsed = parseLyricsPayload(cached.syncedLyrics, cached.plainLyrics, cached.instrumental);
        setLyrics(parsed.syncedLines);
        setPlainLyrics(parsed.rawText);
        setLyricsFormat(parsed.format);
        setPlainStanzas(parsed.plainStanzas);
        setLoadingLyrics(false);
        recordDataSaved(1500); // Record network data conserved by instant cache hit
        return;
      }
    }

    // 2. Check offline SQLite cached lyrics in desktop mode
    if (!forceFresh && isDesktopApp()) {
      try {
        const dbCached = await getCachedLyrics(track.id);
        if (dbCached && ((dbCached.lyrics && dbCached.lyrics.length > 0) || (dbCached.plainLyrics && dbCached.plainLyrics.trim().length > 0))) {
          setLyrics(dbCached.lyrics || []);
          setLyricsFormat(dbCached.format as any || (dbCached.plainLyrics ? 'plain' : 'synced'));
          setPlainLyrics(dbCached.plainLyrics || '');
          setLoadingLyrics(false);
          return;
        }
      } catch (e) {
        console.warn('[DesktopLyrics] Cache lookup notice:', e);
      }
    }

    if (forceFresh) {
      memoryLyricsCache.delete(track.id);
    }

    try {
      const params = new URLSearchParams({
        title: track.title,
        artist: track.artist,
        duration: String(track.durationSeconds || Math.round(duration) || 200),
        id: track.id,
        _v: '3' // Cache-buster to bypass stale browser disk cache
      });
      if (track.album) {
        params.append('album', track.album);
      }
      if (forceFresh) {
        params.append('fresh', '1');
      }

      const res = await fetch(getApiUrl(`/api/lyrics?${params}`), { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        // Cache in memory for subsequent instant accesses only if synchronized or instrumental
        if (data.syncedLyrics || data.instrumental) {
          memoryLyricsCache.set(track.id, {
            syncedLyrics: data.syncedLyrics,
            plainLyrics: data.plainLyrics,
            instrumental: Boolean(data.instrumental)
          });
        }
        setIsInstrumental(Boolean(data.instrumental));
        const parsed = parseLyricsPayload(data.syncedLyrics, data.plainLyrics, data.instrumental);
        setLyrics(parsed.syncedLines);
        setPlainLyrics(parsed.rawText);
        setLyricsFormat(parsed.format);
        setPlainStanzas(parsed.plainStanzas);

        // Cache in SQLite for offline desktop use
        if (isDesktopApp() && parsed.syncedLines.length > 0) {
          cacheLyrics(track.id, parsed.syncedLines, parsed.format, parsed.rawText);
        }
      } else {
        setIsInstrumental(false);
        setLyricsFormat('none');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was intentionally superseded by a newer track or retry; do not overwrite state
        return;
      }
      console.error('Lyrics fetch error', err);
      setIsInstrumental(false);
      setLyricsFormat('none');
    } finally {
      if (lyricsAbortControllerRef.current === controller) {
        setLoadingLyrics(false);
      }
    }
  };

  // Automatically fetch lyrics when active track changes
  useEffect(() => {
    if (currentTrack) {
      fetchLyrics(currentTrack);
    }
  }, [currentTrack?.id]);

  const handleNextRef = useRef<() => void>(() => {});
  const handlePrevRef = useRef<() => void>(() => {});



  // Real-time playback clock is directly driven by the HTML5 audio element's onTimeUpdate and onSeeked events.
  // Tab visibility listener: record background conservation when user switches away
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && dataSaverConfig.enabled) {
        recordDataSaved(250);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [dataSaverConfig.enabled]);

  // Smart Autoplay recommendations handler
  const triggerAutoplayBatch = async (trackToContinueFrom: Track): Promise<boolean> => {
    if (isAutoplayFetchingRef.current) return false;
    isAutoplayFetchingRef.current = true;
    try {
      const libraryTracks = playlists.flatMap(p => p.tracks);
      const batchResult = await generateAutoplayBatch({
        currentTrack: trackToContinueFrom,
        mode: autoplayMode,
        queue,
        playedHistoryIds: sessionPlayedIdsRef.current,
        rejectedIds: autoplayRejectedIdsRef.current,
        userFavorites: favorites,
        libraryTracks,
        batchSize: 4
      });

      if (batchResult.tracks.length > 0) {
        setQueue(prev => [...prev, ...batchResult.tracks]);
        return true;
      }
    } catch (err) {
      console.warn('[SmartAutoplay] Failed to generate recommendations:', err);
    } finally {
      isAutoplayFetchingRef.current = false;
    }
    return false;
  };

  // Next track (Forward to next song)
  const handleNext = async () => {
    if (queue.length === 0) return;

    if (isRepeat === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }

    if (isShuffle) {
      const nextIndex = Math.floor(Math.random() * queue.length);
      setQueueIndex(nextIndex);
      playTrack(queue[nextIndex], queue);
      return;
    }

    const nextIndex = queueIndex + 1;

    // Normal queue advance: user still has tracks queued
    if (nextIndex < queue.length) {
      setQueueIndex(nextIndex);
      playTrack(queue[nextIndex], queue);
      return;
    }

    // Queue exhausted! Check repeat modes first
    if (isRepeat === true) {
      setQueueIndex(0);
      playTrack(queue[0], queue);
      return;
    }

    // Check if Autoplay is enabled
    if (autoplayRef.current && currentTrack) {
      const success = await triggerAutoplayBatch(currentTrack);
      if (success) {
        setQueue(updatedQueue => {
          if (nextIndex < updatedQueue.length) {
            setQueueIndex(nextIndex);
            playTrack(updatedQueue[nextIndex], updatedQueue);
          }
          return updatedQueue;
        });
        return;
      }
    }

    // If autoplay is disabled or yielded no tracks, stop playback gracefully
    setIsPlaying(false);
  };
  handleNextRef.current = handleNext;

  // Queue track removal handler
  const handleRemoveFromQueue = (trackId: string, index: number) => {
    autoplayRejectedIdsRef.current.add(trackId);
    setQueue(prev => {
      const nextQueue = prev.filter((_, idx) => idx !== index);
      if (index < queueIndex) {
        setQueueIndex(prevIdx => Math.max(0, prevIdx - 1));
      } else if (index === queueIndex) {
        if (nextQueue.length > 0) {
          const nextIdx = Math.min(queueIndex, nextQueue.length - 1);
          setQueueIndex(nextIdx);
          playTrack(nextQueue[nextIdx], nextQueue);
        } else {
          setIsPlaying(false);
        }
      }
      return nextQueue;
    });
  };

  // Prev track
  const handlePrev = () => {
    if (queue.length === 0) return;
    if (currentTime > 3) {
      handleSeek(0);
      return;
    }

    const prevIndex = queueIndex - 1 < 0 ? queue.length - 1 : queueIndex - 1;
    setQueueIndex(prevIndex);
    playTrack(queue[prevIndex], queue);
  };
  handlePrevRef.current = handlePrev;

  // Play a selected track
  const playTrack = async (track: Track, newQueue?: Track[]) => {
    setCurrentTrack(track);
    sessionPlayedIdsRef.current.add(track.id);

    if (newQueue) {
      setQueue(newQueue);
      const idx = newQueue.findIndex(t => t.id === track.id);
      setQueueIndex(idx !== -1 ? idx : 0);
    } else {
      const idx = queue.findIndex(t => t.id === track.id);
      if (idx !== -1) {
        setQueueIndex(idx);
      } else {
        setQueue(prev => [...prev, track]);
        setQueueIndex(queue.length);
      }
    }

    setCurrentTime(0);
    setDuration(track.durationSeconds || 210);

    // Record into history
    setHistory(prev => {
      const filtered = prev.filter(item => item.track.id !== track.id);
      return [{ track, playedAt: Date.now() }, ...filtered].slice(0, 50);
    });

    const isSameTrack = currentTrackRef.current?.id === track.id;

    // Check if offline file exists in desktop SQLite
    let localAudioUrl = track.local_audio_url || null;
    if (!localAudioUrl && isDesktopApp()) {
      try {
        const local = await getLocalTrack(track.id);
        if (local?.isOfflinePlayable && local.local_audio_url) {
          localAudioUrl = local.local_audio_url;
        }
      } catch (e) {
        console.warn('[DesktopPlay] getLocalTrack notice:', e);
      }
    }

    // 1. Determine audio source URL (Local offline or Online streaming)
    let audioSourceUrl: string | null = null;
    let isLocal = false;

    if (localAudioUrl) {
      audioSourceUrl = localAudioUrl;
      isLocal = true;
    } else if (isOfflineMode || (!navigator.onLine && isDesktopApp())) {
      console.warn('[Playback] Cannot stream online track while in Offline Mode:', track.title);
      isLocalActiveRef.current = false;
      setIsPlaying(false);
      return;
    } else {
      audioSourceUrl = getApiUrl(`/api/stream/${track.id}`);
      isLocal = false;
    }

    isLocalActiveRef.current = isLocal;

    if (audioRef.current) {
      audioRef.current.src = audioSourceUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.muted = isMuted;

      musicMemory.onTrackChange(track, track.durationSeconds || 210);

      // Broadcast to listening room if host
      const activeRoom = listeningRooms.getActiveRoom();
      if (activeRoom.roomId && activeRoom.isHost) {
        listeningRooms.sendAction('change_track', { track });
      }

      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('[Audio] Play error:', err.message);
      });
    }

    // Save session recovery snapshot
    musicMemory.saveSessionSnapshot(newQueue || queue, queueIndex, 0, track.title);

    // Fetch live lyrics for this track if not already loaded
    if (!isSameTrack || (!lyrics.length && !plainLyrics)) {
      fetchLyrics(track);
    }
  };

  // Play/pause toggle
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src && currentTrack) {
      playTrack(currentTrack);
      return;
    }

    audioLab.resume();
    const activeRoom = listeningRooms.getActiveRoom();

    if (audio.paused) {
      audio.play().then(() => {
        setIsPlaying(true);
        musicMemory.onPlaybackStateChange(true, audio.currentTime);
        if (activeRoom.roomId && activeRoom.isHost) {
          listeningRooms.sendAction('play', { time: audio.currentTime });
        }
      }).catch(() => {});
    } else {
      audio.pause();
      setIsPlaying(false);
      musicMemory.onPlaybackStateChange(false, audio.currentTime);
      if (activeRoom.roomId && activeRoom.isHost) {
        listeningRooms.sendAction('pause', { time: audio.currentTime });
      }
    }
  };

  // Seek / Forward within track (with loadedmetadata guard for network streams)
  const handleSeek = (time: number) => {
    const audio = audioRef.current;
    isSeekingRef.current = true;
    setCurrentTime(time);

    const activeRoom = listeningRooms.getActiveRoom();
    if (activeRoom.roomId && activeRoom.isHost) {
      listeningRooms.sendAction('seek', { time });
    }

    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => {
      isSeekingRef.current = false;
    }, 500);

    if (!audio) return;

    const applySeek = () => {
      try {
        if (audioRef.current) {
          audioRef.current.currentTime = time;
        }
      } catch (err) {
        console.warn('[Audio] Failed to set currentTime on audio element:', err);
      }
    };

    if (!audio.src && currentTrack) {
      playTrack(currentTrack).then(() => {
        if (audioRef.current) {
          if (audioRef.current.readyState >= 1) {
            applySeek();
          } else {
            audioRef.current.addEventListener('loadedmetadata', applySeek, { once: true });
          }
        }
      });
      return;
    }

    if (audio.readyState >= 1) {
      applySeek();
    } else {
      audio.addEventListener('loadedmetadata', applySeek, { once: true });
    }
  };

  // Volume
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      audioRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  // Repeat toggle (Cycle: false -> true -> 'one')
  const cycleRepeat = () => {
    if (isRepeat === false) {
      setIsRepeat(true);
    } else if (isRepeat === true) {
      setIsRepeat('one');
    } else {
      setIsRepeat(false);
    }
  };

  const toggleFavorite = (track: Track) => {
    setFavorites(prev => {
      const exists = prev.some(t => t.id === track.id);
      if (exists) return prev.filter(t => t.id !== track.id);
      return [track, ...prev];
    });
  };

  // Playlist actions
  const createPlaylist = (name: string, description?: string, coverUrl?: string): Playlist => {
    const newPl: Playlist = {
      id: 'pl_' + Date.now(),
      name,
      description,
      cover_url: coverUrl,
      tracks: [],
      createdAt: Date.now()
    };
    setPlaylists(prev => [newPl, ...prev]);
    return newPl;
  };

  const handleCreatePlaylistModal = (name: string, description?: string, coverUrl?: string) => {
    const newPl = createPlaylist(name, description, coverUrl);
    setSelectedPlaylistId(newPl.id);
    setCurrentView('library');
  };

  const addTrackToPlaylist = (playlistId: string, track: Track) => {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        if (pl.tracks.some(t => t.id === track.id)) return pl;
        return { ...pl, tracks: [...pl.tracks, track] };
      }
      return pl;
    }));
  };

  const removeTrackFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists(prev => prev.map(pl => {
      if (pl.id === playlistId) {
        return { ...pl, tracks: pl.tracks.filter(t => t.id !== trackId) };
      }
      return pl;
    }));
  };

  const deletePlaylist = (playlistId: string) => {
    setPlaylists(prev => prev.filter(pl => pl.id !== playlistId));
  };

  const handleRenamePlaylist = (playlistId: string, newName: string) => {
    setPlaylists(prev => prev.map(pl => pl.id === playlistId ? { ...pl, name: newName } : pl));
  };

  const handleSaveImportedPlaylist = (newPlaylist: Playlist, duplicateMode?: 'create' | 'update' | 'copy') => {
    setPlaylists(prev => {
      if (duplicateMode === 'update') {
        const exists = prev.some(p => p.id === newPlaylist.id);
        if (exists) {
          return prev.map(p => p.id === newPlaylist.id ? newPlaylist : p);
        }
      }
      return [newPlaylist, ...prev];
    });
  };

  // Restore Library from Backup
  const handleRestoreBackup = (data: {
    playlists?: Playlist[];
    favorites?: Track[];
    history?: HistoryItem[];
    settings?: any;
    mergeMode: 'merge' | 'replace';
    queueDownloads?: boolean;
    offlineTrackList?: Track[];
  }) => {
    const isMerge = data.mergeMode !== 'replace';

    // 1. Playlists
    if (Array.isArray(data.playlists)) {
      setPlaylists(prev => {
        let updated: Playlist[];
        if (isMerge) {
          const existingMap = new Map(prev.map(p => [(p.name || '').toLowerCase().trim(), p]));
          const merged = [...prev];
          data.playlists!.forEach(importedPl => {
            const key = (importedPl.name || '').toLowerCase().trim();
            if (existingMap.has(key)) {
              const existing = existingMap.get(key)!;
              const existingTrackIds = new Set(existing.tracks.map(t => t.id));
              const newTracks = (importedPl.tracks || []).filter(t => !existingTrackIds.has(t.id));
              existing.tracks = [...existing.tracks, ...newTracks];
            } else {
              merged.push(importedPl);
            }
          });
          updated = merged;
        } else {
          updated = data.playlists!;
        }
        try { localStorage.setItem('metrolist_playlists', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }

    // 2. Favorites
    if (Array.isArray(data.favorites)) {
      setFavorites(prev => {
        let updated: Track[];
        if (isMerge) {
          const existingIds = new Set(prev.map(t => t.id));
          const newFaves = data.favorites!.filter(t => !existingIds.has(t.id));
          updated = [...prev, ...newFaves];
        } else {
          updated = data.favorites!;
        }
        try { localStorage.setItem('metrolist_favorites', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }

    // 3. History
    if (Array.isArray(data.history)) {
      setHistory(prev => {
        const updated = isMerge ? [...prev, ...data.history!] : data.history!;
        try { localStorage.setItem('metrolist_history', JSON.stringify(updated)); } catch {}
        return updated;
      });
    }

    // 4. Settings
    if (data.settings) {
      if (data.settings.wallpaper) {
        setWallpaper(data.settings.wallpaper);
        try { localStorage.setItem('metrolist_wallpaper', data.settings.wallpaper); } catch {}
      }
      if (data.settings.wallpaperMode) {
        setWallpaperMode(data.settings.wallpaperMode);
        try { localStorage.setItem('metrolist_wallpaper_mode', data.settings.wallpaperMode); } catch {}
      }
      if (data.settings.themeSettings) {
        setThemeSettings(data.settings.themeSettings);
        try { localStorage.setItem('ghosttunes_theme_settings', JSON.stringify(data.settings.themeSettings)); } catch {}
      }
    }

    // 5. Offline downloads queuing if requested on Desktop app
    if (data.queueDownloads && Array.isArray(data.offlineTrackList) && isDesktopApp()) {
      data.offlineTrackList.forEach(t => {
        if (!downloadedTrackIds.has(t.id)) {
          handleDownloadTrack(t);
        }
      });
    }
  };

  // Native MediaSession support
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'Ghosttunes',
        artwork: [{ src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNext());
    }
  }, [currentTrack, isPlaying]);

  // Handle Escape key: if document is in native fullscreen, exit fullscreen;
  // else if cinematic lyrics is open, exit cinematic lyrics view.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (showLyrics) {
          setShowLyrics(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLyrics]);

  // Windows System Media Transport Controls & Media Keys Integration
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && currentTrack) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album || 'Ghosttunes',
          artwork: [
            { src: currentTrack.thumbnail, sizes: '512x512', type: 'image/jpeg' }
          ]
        });

        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        navigator.mediaSession.setActionHandler('play', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('pause', () => togglePlayPause());
        navigator.mediaSession.setActionHandler('previoustrack', () => handlePrev());
        navigator.mediaSession.setActionHandler('nexttrack', () => handleNext());
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) handleSeek(details.seekTime);
        });
      } catch (err) {
        console.warn('[MediaSession] Setup notice:', err);
      }
    }
  }, [currentTrack?.id, isPlaying]);

  // Floating widget states (desktop mini window & in-app overlay)
  const [isInAppWidgetOpen, setIsInAppWidgetOpen] = useState(false);
  const [isDesktopWidgetActive, setIsDesktopWidgetActive] = useState(false);

  // Broadcast current playback state to the desktop floating mini-widget window
  useEffect(() => {
    if (isStandaloneMiniWidget) return;
    broadcastPlaybackState({
      track: currentTrack,
      currentTime,
      duration,
      isPlaying,
      lyrics,
      volume,
      isMuted,
      isLiked: favorites.some(f => f.id === currentTrack?.id),
      isShuffle,
      isRepeat
    });
  }, [
    isStandaloneMiniWidget,
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.thumbnail,
    currentTime,
    duration,
    isPlaying,
    lyrics,
    volume,
    isMuted,
    favorites,
    isShuffle,
    isRepeat
  ]);

  // Execute widget actions sent from the desktop mini player window
  useEffect(() => {
    if (isStandaloneMiniWidget) return;

    const unsubAction = subscribeExecuteWidgetAction((action) => {
      if (!action) return;
      switch (action.type) {
        case 'play':
          if (audioRef.current?.paused) audioRef.current.play().catch(() => {});
          break;
        case 'pause':
          audioRef.current?.pause();
          break;
        case 'next':
          handleNextRef.current();
          break;
        case 'prev':
          handlePrevRef.current();
          break;
        case 'seek':
          if (typeof action.payload === 'number') handleSeek(action.payload);
          break;
        case 'toggleLike':
          if (currentTrackRef.current) toggleFavorite(currentTrackRef.current);
          break;
        case 'toggleShuffle':
          setIsShuffle(prev => !prev);
          break;
        case 'toggleRepeat':
          cycleRepeat();
          break;
        case 'toggleMute':
          toggleMute();
          break;
      }
    });

    const unsubReq = subscribeRequestStateSync(() => {
      broadcastPlaybackState({
        track: currentTrackRef.current,
        currentTime: audioRef.current?.currentTime || 0,
        duration: audioRef.current?.duration || 210,
        isPlaying: !audioRef.current?.paused,
        lyrics,
        volume,
        isMuted,
        isLiked: favorites.some(f => f.id === currentTrackRef.current?.id),
        isShuffle,
        isRepeat
      });
    });

    const unsubClosed = subscribeMiniWidgetClosed(() => {
      setIsDesktopWidgetActive(false);
    });

    return () => {
      unsubAction();
      unsubReq();
      unsubClosed();
    };
  }, [isStandaloneMiniWidget, lyrics, volume, isMuted, favorites, isShuffle, isRepeat]);

  // Check if desktop mini widget is already open on launch
  useEffect(() => {
    if (isDesktopApp() && !isStandaloneMiniWidget) {
      isMiniWidgetOpen().then(isOpen => setIsDesktopWidgetActive(isOpen)).catch(() => {});
    }
  }, [isStandaloneMiniWidget]);

  const handleToggleFloatingWidget = async () => {
    if (isDesktopApp()) {
      const isOpen = await toggleMiniWidget();
      setIsDesktopWidgetActive(isOpen);
    } else {
      setIsInAppWidgetOpen(prev => !prev);
    }
  };

  // If running in standalone Electron mini-widget window, render widget only
  if (isStandaloneMiniWidget) {
    return (
      <FloatingWidgetView
        standalone={true}
        track={widgetSyncState.track}
        currentTime={widgetSyncState.currentTime}
        duration={widgetSyncState.duration}
        isPlaying={widgetSyncState.isPlaying}
        lyrics={widgetSyncState.lyrics}
        volume={widgetSyncState.volume}
        isMuted={widgetSyncState.isMuted}
        isLiked={widgetSyncState.isLiked}
        isShuffle={widgetSyncState.isShuffle}
        isRepeat={widgetSyncState.isRepeat}
        onPlayPause={() => sendWidgetAction({ type: widgetSyncState.isPlaying ? 'pause' : 'play' })}
        onNext={() => sendWidgetAction({ type: 'next' })}
        onPrev={() => sendWidgetAction({ type: 'prev' })}
        onSeek={(time) => sendWidgetAction({ type: 'seek', payload: time })}
        onToggleLike={() => sendWidgetAction({ type: 'toggleLike' })}
        onToggleShuffle={() => sendWidgetAction({ type: 'toggleShuffle' })}
        onToggleRepeat={() => sendWidgetAction({ type: 'toggleRepeat' })}
        onToggleMute={() => sendWidgetAction({ type: 'toggleMute' })}
      />
    );
  }

  return (
    <div className="w-full h-full min-h-screen bg-black text-white select-none relative overflow-hidden font-sans">
      {/* 1. DEDICATED FULL-SCREEN BACKGROUND LAYER SYSTEM (Behind all UI elements) */}
      <div 
        id="metrolist-background-system" 
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none bg-black"
      >
        {/* Dark Ambient Base */}
        <div className="absolute inset-0 bg-[#09090d]" />

        {/* Previous Background Layer (crossfades smoothly on track change) */}
        {prevBgUrl && (
          <div 
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out ${
              isCrossfading ? 'opacity-0' : 'opacity-100'
            } scale-110 filter blur-[55px] brightness-[0.28]`}
            style={{
              backgroundImage: `url("${prevBgUrl}")`,
              backgroundPosition: 'center center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat'
            }}
          />
        )}

        {/* Current Active Background Layer (Now Playing Artwork or Custom Image) */}
        {currentBgUrl && (
          <div 
            id="metrolist-wallpaper-image"
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out scale-110 filter blur-[55px] brightness-[0.28]"
            style={{
              backgroundImage: `url("${currentBgUrl}")`,
              backgroundPosition: 'center center',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat'
            }}
          />
        )}

        {/* Translucent Dark Overlay for clean contrast and zero artificial neon glow */}
        <div className="absolute inset-0 bg-black/55 pointer-events-none" />
      </div>

      {/* 2. FOREGROUND: DESKTOP PLAYER VIEW (Smoothly fades & scales when lyrics mode opens) */}
      <div 
        className={`w-full h-full min-h-screen relative z-10 transition-all duration-500 ease-out ${
          showLyrics
            ? 'opacity-0 scale-95 pointer-events-none invisible' 
            : 'opacity-100 scale-100 pointer-events-auto visible'
        }`}
      >
        <DesktopPlayerView
          track={currentTrack}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          lyrics={lyrics}
          plainLyrics={plainLyrics}
          loadingLyrics={loadingLyrics}
          lyricsFormat={lyricsFormat}
          plainStanzas={plainStanzas}
          isInstrumental={isInstrumental}
          onRetryLyrics={() => currentTrack && fetchLyrics(currentTrack, true)}
          palette={currentPalette}
          ghostSkin={ghostSkin}
          onOpenAppearanceModal={() => setIsAppearanceModalOpen(true)}
          onOpenAbout={() => setIsAboutModalOpen(true)}
          isDataSaver={dataSaverConfig.enabled}
          onOpenDataSaver={() => setIsDataSaverModalOpen(true)}
          queue={queue}
          queueIndex={queueIndex}
          volume={volume}
          isMuted={isMuted}
          isShuffle={isShuffle}
          isRepeat={isRepeat}
          isLiked={favorites.some(t => t.id === currentTrack?.id)}
          wallpaperMode={wallpaperMode}
          onSetWallpaperMode={handleSetWallpaperMode}
          wallpaper={wallpaper}
          isCustomWallpaper={wallpaperMode === 'custom' && wallpaper === 'custom'}
          onSelectPreset={handleSelectPreset}
          onUploadWallpaper={handleUploadWallpaper}
          onResetWallpaper={handleResetWallpaper}
          onSeek={handleSeek}
          onPlayPause={togglePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onPlayTrack={(t, q) => playTrack(t, q || queue)}
          onToggleShuffle={() => setIsShuffle(!isShuffle)}
          onToggleRepeat={cycleRepeat}
          onVolumeChange={handleVolumeChange}
          onToggleMute={toggleMute}
          onToggleLike={() => currentTrack && toggleFavorite(currentTrack)}
          onOpenLyrics={() => setShowLyrics(true)}
          onGoHome={() => {
            setCurrentView('home');
            setShowLyrics(false);
          }}
          currentView={currentView}
          onViewChange={(view) => setCurrentView(view)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedGenre={selectedGenre}
          onSelectGenre={(g) => {
            setSearchQuery('');
            fetchGenreTracks(g);
          }}
          searchResults={searchResults}
          genreTracks={genreTracks}
          searchLoading={searchLoading}
          searchError={searchError}
          onRetrySearch={() => searchQuery.trim() ? executeSearch(searchQuery) : fetchGenreTracks(selectedGenre)}
          favorites={favorites}
          playlists={playlists}
          history={history}
          onOpenAddToPlaylist={(t) => setPlaylistModalTrack(t)}
          onAddToQueue={(t) => setQueue(prev => [...prev, t])}
          onOpenImportModal={() => setIsImportModalOpen(true)}
          onOpenBackupModal={() => setIsBackupModalOpen(true)}
          onCreateNewPlaylist={() => setIsCreatePlaylistOpen(true)}
          artistQuery={selectedArtistQuery}
          onOpenArtist={handleOpenArtist}
          onBackFromArtist={handleBackFromArtist}
          onDeletePlaylist={deletePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
          onRemoveTrackFromPlaylist={removeTrackFromPlaylist}
          isOfflineMode={isOfflineMode}
          onToggleOfflineMode={() => setIsOfflineMode(prev => !prev)}
          onDownloadTrack={handleDownloadTrack}
          onDownloadPlaylist={handleDownloadPlaylist}
          downloadedTrackIds={downloadedTrackIds}
          downloadingTrackIds={activeDownloadingTrackIds}
          downloadingPlaylistIds={activeDownloadingPlaylistIds}
          pausedDownloadingTrackIds={pausedDownloadingTrackIds}
          pausedDownloadingPlaylistIds={pausedDownloadingPlaylistIds}
          onTrackDeleted={handleTrackDeleted}
          onToggleFloatingWidget={handleToggleFloatingWidget}
          isWidgetActive={isDesktopWidgetActive || isInAppWidgetOpen}
          onOpenGhostDj={() => setIsGhostDjOpen(true)}
          onOpenAudioLab={() => setIsAudioLabOpen(true)}
          onOpenListeningRoom={() => setIsListeningRoomOpen(true)}
          onOpenPlaylistRescue={(p) => { setRescueTargetPlaylist(p); setIsPlaylistRescueOpen(true); }}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          isAutoplayEnabled={autoplay}
          onToggleAutoplay={() => setAutoplay(prev => !prev)}
          autoplayMode={autoplayMode}
          onChangeAutoplayMode={setAutoplayMode}
          onRemoveFromQueue={handleRemoveFromQueue}
          onResumeSession={(sessionTracks, index, time) => {
            if (sessionTracks.length > 0) {
              setQueue(sessionTracks);
              setQueueIndex(index);
              playTrack(sessionTracks[index] || sessionTracks[0]);
              setTimeout(() => {
                if (audioRef.current && time > 0) {
                  audioRef.current.currentTime = time;
                }
              }, 400);
            }
          }}
        />
      </div>

      {/* 3. FOREGROUND: FULL-SCREEN CINEMATIC LYRICS MODE (Smoothly transitions in/out) */}
      <div
        className={`fixed inset-0 z-30 transition-all duration-500 ease-out ${
          showLyrics && currentTrack
            ? 'opacity-100 scale-100 pointer-events-auto visible'
            : 'opacity-0 scale-105 pointer-events-none invisible'
        }`}
      >
        {currentTrack && (
          <CinematicLyricsView
            track={currentTrack}
            prevTrack={
              queue.length > 1 
                ? queue[(queueIndex - 1 + queue.length) % queue.length] 
                : (playlists.flatMap(p => p.tracks).find(t => t.id !== currentTrack.id) || undefined)
            }
            nextTrack={
              queue.length > 1 
                ? queue[(queueIndex + 1) % queue.length] 
                : (playlists.flatMap(p => p.tracks).filter(t => t.id !== currentTrack.id)[1] || undefined)
            }
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            lyrics={lyrics}
            plainLyrics={plainLyrics}
            loading={loadingLyrics}
            lyricsFormat={lyricsFormat}
            plainStanzas={plainStanzas}
            isInstrumental={isInstrumental}
            onRetry={() => currentTrack && fetchLyrics(currentTrack, true)}
            palette={currentPalette}
            ghostSkin={ghostSkin}
            isDataSaver={dataSaverConfig.enabled && dataSaverConfig.lowDataArtwork}
            volume={volume}
            isMuted={isMuted}
            isLiked={favorites.some(t => t.id === currentTrack.id)}
            onToggleLike={() => currentTrack && toggleFavorite(currentTrack)}
            isShuffle={isShuffle}
            onToggleShuffle={() => setIsShuffle(!isShuffle)}
            isRepeat={isRepeat}
            onToggleRepeat={cycleRepeat}
            onClose={() => setShowLyrics(false)}
            onSeek={handleSeek}
            onPlayPause={togglePlayPause}
            onNext={handleNext}
            onPrev={handlePrev}
            onVolumeChange={handleVolumeChange}
            onToggleMute={toggleMute}
            onDownload={handleDownloadTrack}
            isDownloaded={downloadedTrackIds.has(currentTrack.id)}
            isDownloading={activeDownloadingTrackIds.has(currentTrack.id)}
          />
        )}
      </div>

      {/* 4. Add To Playlist Modal */}
      {playlistModalTrack && (
        <PlaylistModal
          track={playlistModalTrack.id ? playlistModalTrack : null}
          playlists={playlists}
          onClose={() => setPlaylistModalTrack(null)}
          onCreatePlaylist={createPlaylist}
          onAddTrackToPlaylist={addTrackToPlaylist}
          onOpenImportModal={() => setIsImportModalOpen(true)}
        />
      )}

      {/* 4a. Dedicated Create Playlist Modal */}
      <CreatePlaylistModal
        isOpen={isCreatePlaylistOpen}
        onClose={() => setIsCreatePlaylistOpen(false)}
        onCreate={handleCreatePlaylistModal}
        existingPlaylists={playlists}
      />

      {/* 5. Import Playlist Modal (Spotify & YouTube Music) */}
      <ImportPlaylistModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingPlaylists={playlists}
        onSavePlaylist={handleSaveImportedPlaylist}
        onOpenPlaylist={() => setCurrentView('library')}
      />

      {/* 6. Ghosttunes Web Data Saver Settings Modal */}
      <DataSaverModal
        isOpen={isDataSaverModalOpen}
        onClose={() => setIsDataSaverModalOpen(false)}
        config={dataSaverConfig}
        onSave={handleSaveDataSaver}
      />

      {/* 7. Ghosttunes Appearance & Adaptive Lighting Settings Modal */}
      <AppearanceModal
        isOpen={isAppearanceModalOpen}
        onClose={() => setIsAppearanceModalOpen(false)}
        settings={themeSettings}
        onUpdateSettings={handleUpdateThemeSettings}
        currentPalette={currentPalette}
        trackTitle={currentTrack?.title}
        artist={currentTrack?.artist}
      />

      {/* 8. Ghosttunes Library Backup & Restore Modal */}
      <BackupRestoreModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        playlists={playlists}
        favorites={favorites}
        history={history}
        currentPalette={currentPalette}
        wallpaper={wallpaper}
        wallpaperMode={wallpaperMode}
        themeSettings={themeSettings}
        downloadedTrackIds={downloadedTrackIds}
        onRestore={handleRestoreBackup}
      />



      {/* 10. Ghost DJ Intelligent Session Builder */}
      <GhostDjModal
        isOpen={isGhostDjOpen}
        onClose={() => setIsGhostDjOpen(false)}
        candidateTracks={(() => {
          const pool = [...queue, ...favorites, ...playlists.flatMap(p => p.tracks)];
          const seen = new Set<string>();
          return pool.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
        })()}
        currentTrack={currentTrack}
        listeningHistory={history.map(h => ({
          id: `h_${h.playedAt}`,
          track_id: h.track.id,
          title: h.track.title,
          artist: h.track.artist,
          duration: h.track.durationSeconds || 180,
          played_at: h.playedAt,
          duration_played: 180,
          completion_ratio: 1,
          source: 'manual' as const
        }))}
        onPlaySession={(sessionTracks) => {
          if (sessionTracks.length > 0) {
            playTrack(sessionTracks[0], sessionTracks);
          }
        }}
        onSaveAsPlaylist={(name, sessionTracks) => {
          createPlaylist(name);
          setTimeout(() => {
            const pl = playlists.find(p => p.name === name);
            if (pl) {
              sessionTracks.forEach(t => addTrackToPlaylist(pl.id, t));
            }
          }, 300);
        }}
      />

      {/* 11. Audio Lab Studio Equalizer & DSP Modal */}
      <AudioLabModal
        isOpen={isAudioLabOpen}
        onClose={() => setIsAudioLabOpen(false)}
        isPlaying={isPlaying}
      />

      {/* 12. Smart Playlist Rescue & Repair Modal */}
      <PlaylistRescueModal
        isOpen={isPlaylistRescueOpen}
        onClose={() => setIsPlaylistRescueOpen(false)}
        playlist={rescueTargetPlaylist}
        onSaveRescuedPlaylist={(fixed) => {
          handleSaveImportedPlaylist(fixed, 'update');
        }}
        onPreviewTrack={(t) => playTrack(t)}
      />

      {/* 13. Listening Rooms Real-time Social Hub */}
      <ListeningRoomModal
        isOpen={isListeningRoomOpen}
        onClose={() => setIsListeningRoomOpen(false)}
        currentTrack={currentTrack}
      />

      {/* 14. About Ghosttunes Information & Release Modal */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
      {/* 9. Floating Widget In-App Draggable Capsule */}
      {isInAppWidgetOpen && (
        <FloatingWidgetView
          standalone={false}
          track={currentTrack}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          lyrics={lyrics}
          volume={volume}
          isMuted={isMuted}
          isLiked={favorites.some(f => f.id === currentTrack?.id)}
          isShuffle={isShuffle}
          isRepeat={isRepeat}
          onPlayPause={togglePlayPause}
          onNext={handleNext}
          onPrev={handlePrev}
          onSeek={handleSeek}
          onToggleLike={() => currentTrack && toggleFavorite(currentTrack)}
          onToggleShuffle={() => setIsShuffle(!isShuffle)}
          onToggleRepeat={cycleRepeat}
          onVolumeChange={handleVolumeChange}
          onToggleMute={toggleMute}
          onClose={() => setIsInAppWidgetOpen(false)}
          onExpand={() => setIsInAppWidgetOpen(false)}
        />
      )}

      {/* Universal Native Audio Element for Local & Online Playback */}
      <audio
        ref={audioRef}
        preload="auto"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (typeof t === 'number' && !isNaN(t)) {
            setCurrentTime(t);
            musicMemory.onTimeUpdate(t, e.currentTarget.duration || duration);
          }
        }}
        onSeeked={(e) => {
          isSeekingRef.current = false;
          const t = e.currentTarget.currentTime;
          if (typeof t === 'number' && !isNaN(t)) {
            setCurrentTime(t);
          }
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (d && !isNaN(d) && d > 0) {
            setDuration(d);
          }
        }}
        onPlay={(e) => {
          musicMemory.onPlaybackStateChange(true, e.currentTarget.currentTime);
          setIsPlaying(true);
        }}
        onPause={(e) => {
          musicMemory.onPlaybackStateChange(false, e.currentTarget.currentTime);
          setIsPlaying(false);
        }}
        onEnded={() => {
          // Ghost Radio auto-continuation
          if (isRadioActive && currentTrackRef.current) {
            const pool = [...favorites, ...playlists.flatMap(p => p.tracks)];
            const recentIds = new Set(queue.map(t => t.id));
            const nextRadio = getNextRadioTrack(
              currentTrackRef.current,
              pool,
              radioRejectedIdsRef.current,
              recentIds,
              'balanced'
            );
            if (nextRadio.track) {
              setQueue(prev => [...prev, nextRadio.track!]);
            }
          }

          if (isRepeatRef.current === 'one') {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => {});
            }
          } else {
            handleNextRef.current();
          }
        }}
        onError={async () => {
          console.warn('[Audio] Playback error encountered on audio element');
          const targetTrack = currentTrackRef.current;
          if (!targetTrack) return;

          // 1. If local offline file failed, seamlessly fall back to online streaming
          if (isLocalActiveRef.current) {
            console.warn(`[Audio Fallback] Local playback failed for "${targetTrack.title}", falling back to online stream...`);
            isLocalActiveRef.current = false;
            if (audioRef.current) {
              audioRef.current.src = getApiUrl(`/api/stream/${targetTrack.id}`);
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(e => console.warn('[Audio Fallback] Stream play notice:', e.message));
            }
            return;
          }

          // 2. If online stream failed, search for an alternate catalogue track
          if (!fallbackAttemptedRef.current.has(targetTrack.id)) {
            fallbackAttemptedRef.current.add(targetTrack.id);
            try {
              const query = `${targetTrack.title} ${targetTrack.artist} audio`;
              const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(query)}`));
              if (res.ok) {
                const data = await res.json();
                const alt = (data.results || []).find((r: Track) => r.id !== targetTrack.id);
                if (alt && audioRef.current) {
                  console.log(`[Auto-Fallback] Playing alternate audio track for "${alt.title}" (${alt.id})`);
                  currentTrackRef.current = { ...targetTrack, id: alt.id };
                  setCurrentTrack(prev => prev ? ({ ...prev, id: alt.id }) : prev);
                  audioRef.current.src = getApiUrl(`/api/stream/${alt.id}`);
                  audioRef.current.play().catch(() => {});
                  return;
                }
              }
            } catch (e) {
              console.error('Alternative search error', e);
            }
          }
          handleNextRef.current();
        }}
      />
    </div>
  );
}
