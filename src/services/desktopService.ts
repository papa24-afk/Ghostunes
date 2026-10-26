// src/services/desktopService.ts
import { Track, DownloadRecord, LyricLine, SongDnaProfile, ListeningHistoryRecord, ListeningStats } from '../types';

export const isDesktopApp = (): boolean => {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);
};

export const getDesktopPlatform = (): string => {
  return window.electronAPI?.platform || 'web';
};

// Check network status
export const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

// Listen to network changes
export const subscribeNetworkStatus = (callback: (online: boolean) => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
};

// Get local track if available in SQLite & on disk
export const getLocalTrack = async (trackId: string): Promise<Track | null> => {
  if (!isDesktopApp() || !window.electronAPI?.getLocalTrack) return null;
  try {
    return await window.electronAPI.getLocalTrack(trackId);
  } catch (err) {
    console.warn('[DesktopService] getLocalTrack error:', err);
    return null;
  }
};

// Get all offline-ready downloaded tracks
export const getAllDownloadedTracks = async (): Promise<Track[]> => {
  if (!isDesktopApp() || !window.electronAPI?.getAllDownloadedTracks) return [];
  try {
    return await window.electronAPI.getAllDownloadedTracks();
  } catch (err) {
    console.warn('[DesktopService] getAllDownloadedTracks error:', err);
    return [];
  }
};

// Download a track
export const downloadTrack = async (track: Track): Promise<{ success: boolean; reason?: string; alreadyDownloaded?: boolean }> => {
  if (!isDesktopApp() || !window.electronAPI?.downloadTrack) {
    return { success: false, reason: 'Downloads are only available in the Ghosttunes Desktop app.' };
  }
  try {
    return await window.electronAPI.downloadTrack(track);
  } catch (err: any) {
    return { success: false, reason: err.message || 'Download failed' };
  }
};

// Download a full playlist
export const downloadPlaylist = async (playlist: any, tracks: Track[]): Promise<any> => {
  if (!isDesktopApp() || !window.electronAPI?.downloadPlaylist) {
    return { total: 0, completed: 0, failed: 0, message: 'Downloads are only available in the Ghosttunes Desktop app.' };
  }
  try {
    return await window.electronAPI.downloadPlaylist(playlist, tracks);
  } catch (err: any) {
    return { total: tracks.length, completed: 0, failed: tracks.length, error: err.message };
  }
};

// Pause playlist download
export const pausePlaylistDownload = async (playlistId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.pausePlaylistDownload) return false;
  try {
    return await window.electronAPI.pausePlaylistDownload(playlistId);
  } catch {
    return false;
  }
};

// Resume playlist download
export const resumePlaylistDownload = async (playlistId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.resumePlaylistDownload) return false;
  try {
    return await window.electronAPI.resumePlaylistDownload(playlistId);
  } catch {
    return false;
  }
};

// Delete a downloaded track
export const deleteDownload = async (trackId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.deleteDownload) return false;
  try {
    const res = await window.electronAPI.deleteDownload(trackId);
    return res.success;
  } catch (err) {
    console.warn('[DesktopService] deleteDownload error:', err);
    return false;
  }
};

// Get all download records
export const getAllDownloads = async (): Promise<DownloadRecord[]> => {
  if (!isDesktopApp() || !window.electronAPI?.getAllDownloads) return [];
  try {
    return await window.electronAPI.getAllDownloads();
  } catch {
    return [];
  }
};

// Pause active download
export const pauseDownload = async (downloadId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.pauseDownload) return false;
  try {
    return await window.electronAPI.pauseDownload(downloadId);
  } catch {
    return false;
  }
};

// Resume / play paused download
export const resumeDownload = async (downloadId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.resumeDownload) return false;
  try {
    const res = await window.electronAPI.resumeDownload(downloadId);
    return res.success;
  } catch {
    return false;
  }
};

// Pause all active downloads
export const pauseAllDownloads = async (): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.pauseAllDownloads) return false;
  try {
    return await window.electronAPI.pauseAllDownloads();
  } catch {
    return false;
  }
};

// Resume / play all paused downloads
export const resumeAllDownloads = async (): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.resumeAllDownloads) return false;
  try {
    return await window.electronAPI.resumeAllDownloads();
  } catch {
    return false;
  }
};

// Cancel active download
export const cancelDownload = async (downloadId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.cancelDownload) return false;
  try {
    return await window.electronAPI.cancelDownload(downloadId);
  } catch {
    return false;
  }
};

// Retry failed download
export const retryDownload = async (downloadId: string): Promise<boolean> => {
  if (!isDesktopApp() || !window.electronAPI?.retryDownload) return false;
  try {
    const res = await window.electronAPI.retryDownload(downloadId);
    return res.success;
  } catch {
    return false;
  }
};

// Storage stats
export const getStorageStats = async () => {
  if (!isDesktopApp() || !window.electronAPI?.getStorageStats) {
    return { downloadedCount: 0, totalBytes: 0, totalFormatted: '0 MB' };
  }
  try {
    return await window.electronAPI.getStorageStats();
  } catch {
    return { downloadedCount: 0, totalBytes: 0, totalFormatted: '0 MB' };
  }
};

// Cache and read lyrics
export const cacheLyrics = async (trackId: string, lyrics: LyricLine[], format: string = 'synced', plainLyrics: string = '') => {
  if (!isDesktopApp() || !window.electronAPI?.cacheLyrics) return;
  try {
    await window.electronAPI.cacheLyrics(trackId, lyrics, format, plainLyrics);
  } catch (e) {
    console.warn('[DesktopService] cacheLyrics error:', e);
  }
};

export const getCachedLyrics = async (trackId: string): Promise<{ lyrics: LyricLine[]; format: string; plainLyrics?: string } | null> => {
  if (!isDesktopApp() || !window.electronAPI?.getCachedLyrics) return null;
  try {
    return await window.electronAPI.getCachedLyrics(trackId);
  } catch {
    return null;
  }
};

// Import local audio files
export const importLocalFiles = async (): Promise<{ imported: number; tracks: Track[] }> => {
  if (!isDesktopApp() || !window.electronAPI?.importLocalFiles) {
    return { imported: 0, tracks: [] };
  }
  try {
    return await window.electronAPI.importLocalFiles();
  } catch {
    return { imported: 0, tracks: [] };
  }
};

// Open folder
export const openStorageFolder = async (type: 'media' | 'artwork' = 'media') => {
  if (!isDesktopApp() || !window.electronAPI?.openFolder) return;
  try {
    await window.electronAPI.openFolder(type);
  } catch (e) {
    console.warn('[DesktopService] openFolder error:', e);
  }
};

// Subscribe to download progress
export const subscribeDownloadProgress = (callback: (record: DownloadRecord) => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onDownloadProgress) return () => {};
  return window.electronAPI.onDownloadProgress(callback);
};

// Subscribe to playlist download progress
export const subscribePlaylistProgress = (callback: (progress: any) => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onPlaylistProgress) return () => {};
  return window.electronAPI.onPlaylistProgress(callback);
};

// Subscribe to app menu Backup & Restore trigger
export const subscribeOpenBackupModal = (callback: () => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onOpenBackupModal) return () => {};
  return window.electronAPI.onOpenBackupModal(callback);
};

// Unified Fullscreen Toggle (Native Electron window or HTML5 Fullscreen)
export const toggleDesktopFullscreen = async (): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.toggleFullscreen) {
    try {
      return await window.electronAPI.toggleFullscreen();
    } catch (e) {
      console.warn('[DesktopService] toggleFullscreen error:', e);
    }
  }
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  } else {
    try {
      await document.exitFullscreen();
      return false;
    } catch {
      return false;
    }
  }
};

// Check if currently fullscreen
export const isDesktopFullscreen = async (): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.isFullscreen) {
    try {
      return await window.electronAPI.isFullscreen();
    } catch {
      return !!document.fullscreenElement;
    }
  }
  return !!document.fullscreenElement;
};

// Subscribe to fullscreen changes
export const subscribeFullscreenChange = (callback: (isFs: boolean) => void) => {
  let unsubscribeElectron: (() => void) | null = null;
  if (isDesktopApp() && window.electronAPI?.onFullscreenChange) {
    unsubscribeElectron = window.electronAPI.onFullscreenChange(callback);
  }

  const handleDomFullscreen = () => {
    callback(!!document.fullscreenElement);
  };
  document.addEventListener('fullscreenchange', handleDomFullscreen);

  return () => {
    if (unsubscribeElectron) unsubscribeElectron();
    document.removeEventListener('fullscreenchange', handleDomFullscreen);
  };
};

// =========================================================================
// Floating Desktop Mini-Player Widget Services
// =========================================================================

export const toggleMiniWidget = async (): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.toggleMiniWidget) {
    try {
      return await window.electronAPI.toggleMiniWidget();
    } catch (e) {
      console.warn('[DesktopService] toggleMiniWidget error:', e);
    }
  }
  return false;
};

export const isMiniWidgetOpen = async (): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.isMiniWidgetOpen) {
    try {
      return await window.electronAPI.isMiniWidgetOpen();
    } catch {
      return false;
    }
  }
  return false;
};

export const toggleWidgetPin = async (): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.toggleWidgetPin) {
    try {
      return await window.electronAPI.toggleWidgetPin();
    } catch {
      return false;
    }
  }
  return false;
};

export const expandToMain = () => {
  if (isDesktopApp() && window.electronAPI?.expandToMain) {
    window.electronAPI.expandToMain();
  }
};

export const closeMiniWidget = () => {
  if (isDesktopApp() && window.electronAPI?.closeMiniWidget) {
    window.electronAPI.closeMiniWidget();
  }
};

export const broadcastPlaybackState = (state: any) => {
  if (isDesktopApp() && window.electronAPI?.broadcastPlaybackState) {
    window.electronAPI.broadcastPlaybackState(state);
  }
};

export const sendWidgetAction = (action: { type: string; payload?: any }) => {
  if (isDesktopApp() && window.electronAPI?.sendWidgetAction) {
    window.electronAPI.sendWidgetAction(action);
  }
};

export const subscribeWidgetSync = (callback: (state: any) => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onSyncState) return () => {};
  return window.electronAPI.onSyncState(callback);
};

export const subscribeExecuteWidgetAction = (callback: (action: { type: string; payload?: any }) => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onExecuteWidgetAction) return () => {};
  return window.electronAPI.onExecuteWidgetAction(callback);
};

export const subscribeRequestStateSync = (callback: () => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onRequestStateSync) return () => {};
  return window.electronAPI.onRequestStateSync(callback);
};

export const subscribeMiniWidgetClosed = (callback: () => void) => {
  if (!isDesktopApp() || !window.electronAPI?.onMiniWidgetClosed) return () => {};
  return window.electronAPI.onMiniWidgetClosed(callback);
};

// ==========================================
// Song DNA Persistence & Retrieval
// ==========================================
export const getSongDna = async (trackId: string): Promise<SongDnaProfile | null> => {
  if (isDesktopApp() && window.electronAPI?.getSongDna) {
    try {
      return await window.electronAPI.getSongDna(trackId);
    } catch (e) {
      console.warn('[DesktopService] getSongDna error:', e);
    }
  }
  // Browser fallback
  try {
    const raw = localStorage.getItem(`ghost_dna_${trackId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSongDna = async (dna: SongDnaProfile): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.saveSongDna) {
    try {
      await window.electronAPI.saveSongDna(dna);
      return true;
    } catch (e) {
      console.warn('[DesktopService] saveSongDna error:', e);
    }
  }
  // Browser fallback
  try {
    localStorage.setItem(`ghost_dna_${dna.track_id}`, JSON.stringify(dna));
    return true;
  } catch {
    return false;
  }
};

export const getAllSongDna = async (): Promise<SongDnaProfile[]> => {
  if (isDesktopApp() && window.electronAPI?.getAllSongDna) {
    try {
      return await window.electronAPI.getAllSongDna();
    } catch (e) {
      console.warn('[DesktopService] getAllSongDna error:', e);
      return [];
    }
  }
  // Browser fallback
  const dnas: SongDnaProfile[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ghost_dna_')) {
        const item = localStorage.getItem(key);
        if (item) dnas.push(JSON.parse(item));
      }
    }
  } catch {}
  return dnas;
};

// ==========================================
// Music Memory (Listening Graph)
// ==========================================
export const recordListeningPlay = async (entry: Partial<ListeningHistoryRecord>): Promise<string | null> => {
  if (isDesktopApp() && window.electronAPI?.recordPlay) {
    try {
      return await window.electronAPI.recordPlay(entry);
    } catch (e) {
      console.warn('[DesktopService] recordPlay error:', e);
    }
  }
  // Browser fallback
  try {
    const raw = localStorage.getItem('ghost_listening_history');
    const history: ListeningHistoryRecord[] = raw ? JSON.parse(raw) : [];
    const newEntry: ListeningHistoryRecord = {
      id: `play_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      track_id: entry.track_id || '',
      title: entry.title || 'Untitled',
      artist: entry.artist || 'Unknown Artist',
      album: entry.album || '',
      duration: entry.duration || 0,
      played_at: entry.played_at || Date.now(),
      duration_played: entry.duration_played || 0,
      completion_ratio: entry.completion_ratio || 0,
      session_id: entry.session_id,
      source: entry.source || 'manual'
    };
    history.unshift(newEntry);
    if (history.length > 500) history.pop();
    localStorage.setItem('ghost_listening_history', JSON.stringify(history));
    return newEntry.id;
  } catch {
    return null;
  }
};

export const getListeningHistory = async (limit = 100, offset = 0): Promise<ListeningHistoryRecord[]> => {
  if (isDesktopApp() && window.electronAPI?.getListeningHistory) {
    try {
      return await window.electronAPI.getListeningHistory({ limit, offset });
    } catch (e) {
      console.warn('[DesktopService] getListeningHistory error:', e);
      return [];
    }
  }
  try {
    const raw = localStorage.getItem('ghost_listening_history');
    const history: ListeningHistoryRecord[] = raw ? JSON.parse(raw) : [];
    return history.slice(offset, offset + limit);
  } catch {
    return [];
  }
};

export const getListeningStats = async (): Promise<ListeningStats> => {
  if (isDesktopApp() && window.electronAPI?.getListeningStats) {
    try {
      return await window.electronAPI.getListeningStats();
    } catch (e) {
      console.warn('[DesktopService] getListeningStats error:', e);
    }
  }
  // Browser fallback aggregation
  try {
    const raw = localStorage.getItem('ghost_listening_history');
    const history: ListeningHistoryRecord[] = raw ? JSON.parse(raw) : [];
    const artistMap: Record<string, { plays: number; seconds: number; thumbnail?: string }> = {};
    const trackMap: Record<string, { track_id: string; title: string; artist: string; plays: number; last_played: number; thumbnail?: string }> = {};
    let totalSeconds = 0;

    history.forEach(h => {
      totalSeconds += (h.duration_played || 0);
      const art = h.artist || 'Unknown Artist';
      const thumb = (h as any).thumbnail || (h.track_id?.length === 11 ? `https://i.ytimg.com/vi/${h.track_id}/hqdefault.jpg` : '');

      if (!artistMap[art]) artistMap[art] = { plays: 0, seconds: 0, thumbnail: thumb };
      artistMap[art].plays += 1;
      artistMap[art].seconds += (h.duration_played || 0);
      if (thumb && !artistMap[art].thumbnail) artistMap[art].thumbnail = thumb;

      const tid = h.track_id;
      if (!trackMap[tid]) {
        trackMap[tid] = { track_id: tid, title: h.title, artist: h.artist, plays: 0, last_played: h.played_at, thumbnail: thumb };
      }
      trackMap[tid].plays += 1;
      if (thumb && !trackMap[tid].thumbnail) trackMap[tid].thumbnail = thumb;
      if (h.played_at > trackMap[tid].last_played) trackMap[tid].last_played = h.played_at;
    });

    const topArtists = Object.entries(artistMap)
      .map(([artist, data]) => ({ artist, plays: data.plays, total_seconds: data.seconds, thumbnail: data.thumbnail }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 10);

    const topTracks = Object.values(trackMap)
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 15);

    return {
      totalPlays: history.length,
      totalListeningMinutes: Math.round(totalSeconds / 60),
      uniqueTracks: Object.keys(trackMap).length,
      topArtists,
      topTracks
    };
  } catch {
    return { totalPlays: 0, totalListeningMinutes: 0, uniqueTracks: 0, topArtists: [], topTracks: [] };
  }
};

export const clearListeningHistory = async (options?: { all?: boolean; trackId?: string; id?: string; beforeTimestamp?: number }): Promise<any> => {
  if (isDesktopApp() && window.electronAPI?.clearListeningHistory) {
    try {
      return await window.electronAPI.clearListeningHistory(options);
    } catch (e) {
      console.warn('[DesktopService] clearListeningHistory error:', e);
    }
  }
  try {
    if (options?.all) {
      localStorage.removeItem('ghost_listening_history');
    } else {
      let raw = localStorage.getItem('ghost_listening_history');
      if (raw) {
        let history: ListeningHistoryRecord[] = JSON.parse(raw);
        if (options?.trackId) history = history.filter(h => h.track_id !== options.trackId);
        if (options?.id) history = history.filter(h => h.id !== options.id);
        if (options?.beforeTimestamp) history = history.filter(h => h.played_at >= (options.beforeTimestamp || 0));
        localStorage.setItem('ghost_listening_history', JSON.stringify(history));
      }
    }
    return { success: true };
  } catch {
    return { success: false };
  }
};

export const exportListeningData = async (): Promise<any> => {
  if (isDesktopApp() && window.electronAPI?.exportListeningData) {
    try {
      return await window.electronAPI.exportListeningData();
    } catch (e) {
      console.warn('[DesktopService] exportListeningData error:', e);
    }
  }
  const history = await getListeningHistory(1000);
  const stats = await getListeningStats();
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    developerCredits: 'D!g!†@L G#0$†',
    stats,
    history
  };
};

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'offline' | 'error' | 'restarting';
  currentVersion: string;
  availableVersion?: string | null;
  releaseDate?: string | null;
  releaseNotes?: string | null;
  progress?: {
    percent: number;
    bytesPerSecond?: number;
    transferred?: number;
    total?: number;
  } | null;
  error?: string | null;
  lastChecked?: string | null;
}

export const openExternalLink = async (targetUrl: string): Promise<boolean> => {
  if (isDesktopApp() && window.electronAPI?.openExternalUrl) {
    try {
      const res = await window.electronAPI.openExternalUrl(targetUrl);
      return res?.success !== false;
    } catch (e) {
      console.warn('[DesktopService] openExternalUrl error:', e);
    }
  }
  if (typeof window !== 'undefined') {
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
};

export const getUpdateState = async (): Promise<UpdateStatus | null> => {
  if (isDesktopApp() && window.electronAPI?.updater?.getState) {
    try {
      return await window.electronAPI.updater.getState();
    } catch (e) {
      console.warn('[DesktopService] getUpdateState error:', e);
    }
  }
  return null;
};

export const checkAppUpdates = async (): Promise<UpdateStatus | null> => {
  if (isDesktopApp() && window.electronAPI?.updater?.checkForUpdates) {
    try {
      return await window.electronAPI.updater.checkForUpdates();
    } catch (e) {
      console.warn('[DesktopService] checkAppUpdates error:', e);
    }
  }
  return null;
};

export const downloadAppUpdate = async (): Promise<{ success: boolean; error?: string }> => {
  if (isDesktopApp() && window.electronAPI?.updater?.startDownload) {
    try {
      return await window.electronAPI.updater.startDownload();
    } catch (e) {
      console.warn('[DesktopService] downloadAppUpdate error:', e);
      return { success: false, error: String(e) };
    }
  }
  return { success: false, error: 'Updater not available in browser mode' };
};

export const installAppUpdate = (): void => {
  if (isDesktopApp() && window.electronAPI?.updater?.installUpdate) {
    try {
      window.electronAPI.updater.installUpdate();
    } catch (e) {
      console.warn('[DesktopService] installAppUpdate error:', e);
    }
  }
};

export const deferAppUpdate = (): void => {
  if (isDesktopApp() && window.electronAPI?.updater?.deferUpdate) {
    try {
      window.electronAPI.updater.deferUpdate();
    } catch (e) {
      console.warn('[DesktopService] deferAppUpdate error:', e);
    }
  }
};

export const subscribeUpdateStatus = (callback: (status: UpdateStatus) => void): (() => void) => {
  if (isDesktopApp() && window.electronAPI?.updater?.onUpdateStatus) {
    return window.electronAPI.updater.onUpdateStatus(callback);
  }
  return () => {};
};
