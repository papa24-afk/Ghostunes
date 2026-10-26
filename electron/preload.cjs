// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, validated desktop API to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Track & Local Playback
  getLocalTrack: (trackId) => ipcRenderer.invoke('ghosttunes:get-local-track', trackId),
  getAllDownloadedTracks: () => ipcRenderer.invoke('ghosttunes:get-downloaded-tracks'),
  deleteDownload: (trackId) => ipcRenderer.invoke('ghosttunes:delete-download', trackId),

  // Downloads Management
  downloadTrack: (track) => ipcRenderer.invoke('ghosttunes:download-track', track),
  pauseDownload: (downloadId) => ipcRenderer.invoke('ghosttunes:pause-download', downloadId),
  resumeDownload: (downloadId) => ipcRenderer.invoke('ghosttunes:resume-download', downloadId),
  pauseAllDownloads: () => ipcRenderer.invoke('ghosttunes:pause-all-downloads'),
  resumeAllDownloads: () => ipcRenderer.invoke('ghosttunes:resume-all-downloads'),
  cancelDownload: (downloadId) => ipcRenderer.invoke('ghosttunes:cancel-download', downloadId),
  retryDownload: (downloadId) => ipcRenderer.invoke('ghosttunes:retry-download', downloadId),
  getAllDownloads: () => ipcRenderer.invoke('ghosttunes:get-downloads'),
  downloadPlaylist: (playlist, tracks) => ipcRenderer.invoke('ghosttunes:download-playlist', { playlist, tracks }),
  pausePlaylistDownload: (playlistId) => ipcRenderer.invoke('ghosttunes:pause-playlist-download', playlistId),
  resumePlaylistDownload: (playlistId) => ipcRenderer.invoke('ghosttunes:resume-playlist-download', playlistId),
  cancelPlaylistDownload: (playlistId) => ipcRenderer.invoke('ghosttunes:cancel-playlist-download', playlistId),
  getStorageStats: () => ipcRenderer.invoke('ghosttunes:get-storage-stats'),

  // Offline Lyrics Cache
  cacheLyrics: (trackId, lyrics, format, plain) => ipcRenderer.invoke('ghosttunes:cache-lyrics', { trackId, lyrics, format, plain }),
  getCachedLyrics: (trackId) => ipcRenderer.invoke('ghosttunes:get-cached-lyrics', trackId),

  // Song DNA
  saveSongDna: (dna) => ipcRenderer.invoke('ghosttunes:save-song-dna', dna),
  getSongDna: (trackId) => ipcRenderer.invoke('ghosttunes:get-song-dna', trackId),
  getAllSongDna: () => ipcRenderer.invoke('ghosttunes:get-all-song-dna'),

  // Music Memory (Listening Graph)
  recordPlay: (entry) => ipcRenderer.invoke('ghosttunes:record-play', entry),
  getListeningHistory: (params) => ipcRenderer.invoke('ghosttunes:get-listening-history', params),
  getListeningStats: () => ipcRenderer.invoke('ghosttunes:get-listening-stats'),
  clearListeningHistory: (options) => ipcRenderer.invoke('ghosttunes:clear-listening-history', options),
  exportListeningData: () => ipcRenderer.invoke('ghosttunes:export-listening-data'),

  // Local File Import & Storage
  importLocalFiles: () => ipcRenderer.invoke('ghosttunes:import-local-files'),
  openFolder: (type) => ipcRenderer.invoke('ghosttunes:open-folder', type),
  openExternalUrl: (url) => ipcRenderer.invoke('ghosttunes:open-external-url', url),

  // Progress Event Subscriptions
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ghosttunes:download-progress', handler);
    return () => ipcRenderer.removeListener('ghosttunes:download-progress', handler);
  },
  onPlaylistProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('ghosttunes:playlist-progress', handler);
    return () => ipcRenderer.removeListener('ghosttunes:playlist-progress', handler);
  },
  onOpenBackupModal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('ghosttunes:open-backup-modal', handler);
    return () => ipcRenderer.removeListener('ghosttunes:open-backup-modal', handler);
  },

  // Window Controls & Fullscreen
  windowMinimize: () => ipcRenderer.send('ghosttunes:window-minimize'),
  windowMaximize: () => ipcRenderer.send('ghosttunes:window-maximize'),
  windowClose: () => ipcRenderer.send('ghosttunes:window-close'),
  isMaximized: () => ipcRenderer.invoke('ghosttunes:is-maximized'),
  toggleFullscreen: () => ipcRenderer.invoke('ghosttunes:toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('ghosttunes:is-fullscreen'),
  onFullscreenChange: (callback) => {
    const handler = (_event, isFs) => callback(isFs);
    ipcRenderer.on('ghosttunes:fullscreen-change', handler);
    return () => ipcRenderer.removeListener('ghosttunes:fullscreen-change', handler);
  },

  // Floating Widget (Desktop Picture-in-Picture Mini-Player)
  toggleMiniWidget: () => ipcRenderer.invoke('ghosttunes:toggle-mini-widget'),
  isMiniWidgetOpen: () => ipcRenderer.invoke('ghosttunes:is-mini-widget-open'),
  toggleWidgetPin: () => ipcRenderer.invoke('ghosttunes:widget-toggle-pin'),
  expandToMain: () => ipcRenderer.send('ghosttunes:expand-to-main'),
  closeMiniWidget: () => ipcRenderer.send('ghosttunes:close-mini-widget'),
  broadcastPlaybackState: (state) => ipcRenderer.send('ghosttunes:broadcast-playback-state', state),
  sendWidgetAction: (action) => ipcRenderer.send('ghosttunes:widget-action', action),
  onSyncState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('ghosttunes:sync-state', handler);
    return () => ipcRenderer.removeListener('ghosttunes:sync-state', handler);
  },
  onExecuteWidgetAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('ghosttunes:execute-widget-action', handler);
    return () => ipcRenderer.removeListener('ghosttunes:execute-widget-action', handler);
  },
  onRequestStateSync: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('ghosttunes:request-state-sync', handler);
    return () => ipcRenderer.removeListener('ghosttunes:request-state-sync', handler);
  },
  onMiniWidgetClosed: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('ghosttunes:mini-widget-closed', handler);
    return () => ipcRenderer.removeListener('ghosttunes:mini-widget-closed', handler);
  },

  // Secure Windows Auto-Updater API
  updater: {
    getState: () => ipcRenderer.invoke('ghosttunes:updater-get-state'),
    checkForUpdates: () => ipcRenderer.invoke('ghosttunes:updater-check'),
    startDownload: () => ipcRenderer.invoke('ghosttunes:updater-download'),
    installUpdate: () => ipcRenderer.invoke('ghosttunes:updater-install'),
    deferUpdate: () => ipcRenderer.invoke('ghosttunes:updater-defer'),
    onUpdateStatus: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('ghosttunes:updater-status', handler);
      return () => ipcRenderer.removeListener('ghosttunes:updater-status', handler);
    }
  }
});
