// src/components/DownloadsView.tsx
import React, { useState, useEffect } from 'react';
import { Track, DownloadRecord } from '../types';
import { 
  Download, 
  Check,
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Trash2, 
  RotateCcw, 
  X, 
  Folder, 
  Upload, 
  HardDrive, 
  Play, 
  Pause,
  Wifi, 
  WifiOff, 
  Music,
  Loader2
} from 'lucide-react';
import { 
  getAllDownloadedTracks, 
  getAllDownloads, 
  pauseDownload,
  resumeDownload,
  pauseAllDownloads,
  resumeAllDownloads,
  cancelDownload, 
  retryDownload, 
  deleteDownload, 
  getStorageStats, 
  importLocalFiles, 
  openStorageFolder,
  isDesktopApp
} from '../services/desktopService';

interface Props {
  isOfflineMode: boolean;
  onToggleOfflineMode: () => void;
  onPlayTrack: (track: Track, queue?: Track[]) => void;
  currentTrackId?: string;
  isPlaying?: boolean;
  onTrackDeleted?: (trackId: string) => void;
}

export const DownloadsView: React.FC<Props> = ({
  isOfflineMode,
  onToggleOfflineMode,
  onPlayTrack,
  currentTrackId,
  isPlaying = false,
  onTrackDeleted
}) => {
  const [tab, setTab] = useState<'downloaded' | 'progress' | 'failed'>('downloaded');
  const [downloadedTracks, setDownloadedTracks] = useState<Track[]>([]);
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);
  const [storage, setStorage] = useState({ downloadedCount: 0, totalBytes: 0, totalFormatted: '0 MB' });
  const [loading, setLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  const loadData = async () => {
    try {
      const [tracks, allDownloads, stats] = await Promise.all([
        getAllDownloadedTracks(),
        getAllDownloads(),
        getStorageStats()
      ]);
      setDownloadedTracks(tracks);
      setDownloads(allDownloads);
      setStorage(stats);
    } catch (e) {
      console.warn('[DownloadsView] Load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const res = await importLocalFiles();
      if (res.imported > 0) {
        await loadData();
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (trackId: string) => {
    await deleteDownload(trackId);
    await loadData();
    onTrackDeleted?.(trackId);
  };

  const handlePause = async (downloadId: string) => {
    await pauseDownload(downloadId);
    await loadData();
  };

  const handleResume = async (downloadId: string) => {
    await resumeDownload(downloadId);
    await loadData();
  };

  const handlePauseAll = async () => {
    await pauseAllDownloads();
    await loadData();
  };

  const handleResumeAll = async () => {
    await resumeAllDownloads();
    await loadData();
  };

  const handleCancel = async (downloadId: string) => {
    await cancelDownload(downloadId);
    await loadData();
  };

  const handleRetry = async (downloadId: string) => {
    await retryDownload(downloadId);
    await loadData();
  };

  const inProgressDownloads = downloads.filter(d => d.status === 'downloading' || d.status === 'queued' || d.status === 'paused');
  const downloadingCount = downloads.filter(d => d.status === 'downloading' || d.status === 'queued').length;
  const pausedCount = downloads.filter(d => d.status === 'paused').length;
  const failedDownloads = downloads.filter(d => d.status === 'failed' || d.status === 'unsupported' || d.status === 'cancelled');

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-6 py-8 overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Downloads & Offline Library
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/[0.06] border border-white/10 text-zinc-300">
              <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
              <span>{storage.totalFormatted}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage your offline music storage, downloaded tracks, and personal music files.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Offline Mode Toggle Button */}
          <button
            onClick={onToggleOfflineMode}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer active:scale-95 ${
              isOfflineMode 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30' 
                : 'bg-white/[0.05] text-zinc-300 border-white/10 hover:bg-white/10'
            }`}
            title="Toggle offline-only mode"
          >
            {isOfflineMode ? <WifiOff className="w-4 h-4 text-amber-400" /> : <Wifi className="w-4 h-4 text-emerald-400" />}
            <span>{isOfflineMode ? 'Offline Mode Active' : 'Online Mode'}</span>
          </button>

          {/* Import Local Audio */}
          {isDesktopApp() && (
            <>
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-all cursor-pointer active:scale-95"
                title="Import MP3, FLAC, or WAV files from your computer"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>Import Audio</span>
              </button>

              <button
                onClick={() => openStorageFolder('media')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/[0.05] hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer"
                title="Open local media folder in Finder / File Explorer"
              >
                <Folder className="w-4 h-4" />
                <span className="hidden sm:inline">Folder</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Offline Mode Banner when Active */}
      {isOfflineMode && (
        <div className="mt-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Offline Mode is Active:</strong> Playing exclusively from downloaded files and local imports. Streaming requests are paused.
            </span>
          </div>
          <button
            onClick={onToggleOfflineMode}
            className="text-amber-300 hover:text-white underline text-xs font-semibold cursor-pointer"
          >
            Switch to Online
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-3 mt-6 pb-2 border-b border-white/[0.06]">
        <button
          onClick={() => setTab('downloaded')}
          className={`flex items-center gap-2 pb-2 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
            tab === 'downloaded' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Downloaded ({downloadedTracks.length})</span>
          {tab === 'downloaded' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
        </button>

        <button
          onClick={() => setTab('progress')}
          className={`flex items-center gap-2 pb-2 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
            tab === 'progress' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Active & Paused ({inProgressDownloads.length})</span>
          {tab === 'progress' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
        </button>

        <button
          onClick={() => setTab('failed')}
          className={`flex items-center gap-2 pb-2 text-xs sm:text-sm font-semibold transition-all relative cursor-pointer ${
            tab === 'failed' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>Notice / Failed ({failedDownloads.length})</span>
          {tab === 'failed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
        </button>
      </div>

      {/* Content Area */}
      <div className="mt-6">
        {/* TAB 1: DOWNLOADED TRACKS */}
        {tab === 'downloaded' && (
          <div>
            {downloadedTracks.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <Download className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
                <h3 className="text-base font-semibold text-zinc-300">No downloaded tracks yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                  Click the download button on any song or playlist, or import local MP3/FLAC files to listen completely offline.
                </p>
                {isDesktopApp() && (
                  <button
                    onClick={handleImport}
                    className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white border border-white/10 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Local Music</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {downloadedTracks.map((track, idx) => {
                  const isCurrent = currentTrackId === track.id;
                  const sizeMb = track.file_size ? (track.file_size / (1024 * 1024)).toFixed(1) + ' MB' : '';

                  return (
                    <div
                      key={track.id}
                      className={`flex items-center justify-between p-3 rounded-xl transition-colors group ${
                        isCurrent ? 'bg-white/[0.08] border border-white/15' : 'hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <span className="w-5 text-center text-xs text-zinc-500 font-mono">
                          {idx + 1}
                        </span>

                        <div 
                          onClick={() => onPlayTrack(track, downloadedTracks)}
                          className="relative w-11 h-11 rounded-lg overflow-hidden bg-zinc-900 border border-white/10 flex-shrink-0 cursor-pointer group/art"
                        >
                          <img 
                            src={track.local_artwork_url || track.thumbnail} 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-current" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 
                            onClick={() => onPlayTrack(track, downloadedTracks)}
                            className="text-sm font-semibold text-white truncate cursor-pointer hover:underline"
                          >
                            {track.title}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5 truncate">
                            <span className="truncate">{track.artist}</span>
                            {track.album && <span>• {track.album}</span>}
                            {sizeMb && <span className="text-zinc-500">({sizeMb})</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span title="Offline ready" aria-label="Offline ready" className="flex items-center">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        </span>

                        <button
                          onClick={() => handleDelete(track.id)}
                          className="p-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove from downloaded offline storage"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IN PROGRESS & PAUSED */}
        {tab === 'progress' && (
          <div>
            {inProgressDownloads.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <Clock className="w-10 h-10 mx-auto text-zinc-600 mb-3" />
                <h3 className="text-base font-semibold text-zinc-300">No active or paused downloads</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                  When you download tracks or playlists, real-time progress will appear here. You can pause, play (resume), or cancel at any time.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Batch Pause / Resume Header */}
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                  <span className="text-xs text-zinc-400">
                    {downloadingCount > 0 && <span>{downloadingCount} downloading</span>}
                    {downloadingCount > 0 && pausedCount > 0 && <span> • </span>}
                    {pausedCount > 0 && <span className="text-amber-400">{pausedCount} paused</span>}
                  </span>

                  <div className="flex items-center gap-2">
                    {downloadingCount > 0 && (
                      <button
                        onClick={handlePauseAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 transition-all cursor-pointer"
                        title="Pause all active downloads"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause All</span>
                      </button>
                    )}
                    {pausedCount > 0 && (
                      <button
                        onClick={handleResumeAll}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
                        title="Resume all paused downloads"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Resume All</span>
                      </button>
                    )}
                  </div>
                </div>

                {inProgressDownloads.map((dl) => {
                  const isPaused = dl.status === 'paused';
                  return (
                    <div 
                      key={dl.id}
                      className={`p-4 rounded-xl border flex flex-col gap-2.5 transition-all ${
                        isPaused 
                          ? 'bg-amber-500/[0.04] border-amber-500/20' 
                          : 'bg-white/[0.03] border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {dl.thumbnail ? (
                            <img src={dl.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-900" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                              <Music className="w-5 h-5 text-zinc-500" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-white truncate">{dl.title}</h4>
                            <p className="text-xs text-zinc-400 truncate">{dl.artist}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                            isPaused 
                              ? 'text-amber-300 bg-amber-500/15 border-amber-500/30' 
                              : 'text-cyan-300 bg-cyan-500/15 border-cyan-500/30'
                          }`}>
                            {isPaused ? 'Paused' : 'Downloading'}
                          </span>

                          <span className="text-xs font-mono font-semibold text-zinc-300">
                            {dl.progress}%
                          </span>

                          {/* Pause / Play (Resume) Button */}
                          {isPaused ? (
                            <button
                              onClick={() => handleResume(dl.id)}
                              className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                              title="Resume download"
                              aria-label="Resume download"
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePause(dl.id)}
                              className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors cursor-pointer"
                              title="Pause download"
                              aria-label="Pause download"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}

                          {/* Cancel Download Button */}
                          <button
                            onClick={() => handleCancel(dl.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                            title="Cancel download"
                            aria-label="Cancel download"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-200 ${
                            isPaused ? 'bg-amber-400' : 'bg-cyan-400'
                          }`}
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FAILED & PROVIDER NOTICES */}
        {tab === 'failed' && (
          <div>
            {failedDownloads.length === 0 ? (
              <div className="py-16 text-center text-zinc-500">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500/40 mb-3" />
                <h3 className="text-base font-semibold text-zinc-300">All clear</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
                  No failed downloads or provider restriction notices.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {failedDownloads.map((dl) => (
                  <div 
                    key={dl.id}
                    className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.08] flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {dl.thumbnail ? (
                        <img src={dl.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover bg-zinc-900" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <Music className="w-5 h-5 text-zinc-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-white truncate">{dl.title}</h4>
                        <p className="text-xs text-rose-300 mt-0.5">
                          {dl.error_message || 'Download could not be completed.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl.status !== 'unsupported' && (
                        <button
                          onClick={() => handleRetry(dl.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition-all cursor-pointer"
                          title="Retry download"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(dl.track_id)}
                        className="p-2 rounded-lg text-zinc-500 hover:text-white transition-colors cursor-pointer"
                        title="Dismiss notice"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
