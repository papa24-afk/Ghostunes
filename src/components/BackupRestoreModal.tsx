import React, { useState, useRef } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  FolderSync, 
  FileCheck, 
  Check, 
  Copy, 
  FileText, 
  AlertCircle, 
  Heart, 
  ListMusic, 
  Settings, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { Playlist, Track, HistoryItem } from '../types';
import { TrackPalette } from '../utils/palette';
import { isDesktopApp } from '../services/desktopService';

export interface BackupData {
  app: 'Ghosttunes';
  version: string;
  exportedAt: string;
  playlists: Playlist[];
  favorites: Track[];
  history: HistoryItem[];
  settings?: {
    wallpaper?: string;
    wallpaperMode?: string;
    themeSettings?: any;
    dataSaverConfig?: any;
  };
  offlineManifest?: {
    trackCount: number;
    tracks: { id: string; title: string; artist: string; album?: string; duration?: string; thumbnail?: string }[];
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  favorites: Track[];
  history: HistoryItem[];
  currentPalette: TrackPalette;
  wallpaper: string;
  wallpaperMode: string;
  themeSettings?: any;
  downloadedTrackIds?: Set<string>;
  onRestore: (data: {
    playlists?: Playlist[];
    favorites?: Track[];
    history?: HistoryItem[];
    settings?: any;
    mergeMode: 'merge' | 'replace';
    queueDownloads?: boolean;
    offlineTrackList?: Track[];
  }) => void;
}

export const BackupRestoreModal: React.FC<Props> = ({
  isOpen,
  onClose,
  playlists,
  favorites,
  history,
  currentPalette,
  wallpaper,
  wallpaperMode,
  themeSettings,
  downloadedTrackIds = new Set(),
  onRestore
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [copied, setCopied] = useState(false);
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState<'merge' | 'replace'>('merge');
  const [queueDownloads, setQueueDownloads] = useState(true);
  const [restoredSuccess, setRestoredSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Build current backup snapshot
  const generateBackupData = (): BackupData => {
    // Derive offline track metadata manifest from playlists and favorites
    const knownTracks = new Map<string, Track>();
    playlists.forEach(pl => pl.tracks?.forEach(t => knownTracks.set(t.id, t)));
    favorites.forEach(t => knownTracks.set(t.id, t));

    const offlineTracks: { id: string; title: string; artist: string; album?: string; duration?: string; thumbnail?: string }[] = [];
    downloadedTrackIds.forEach(id => {
      const t = knownTracks.get(id);
      if (t) {
        offlineTracks.push({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          duration: t.duration || '0:00',
          thumbnail: t.thumbnail
        });
      }
    });

    return {
      app: 'Ghosttunes',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      playlists: playlists || [],
      favorites: favorites || [],
      history: history || [],
      settings: {
        wallpaper,
        wallpaperMode,
        themeSettings
      },
      offlineManifest: {
        trackCount: offlineTracks.length,
        tracks: offlineTracks
      }
    };
  };

  const handleExportDownload = () => {
    const data = generateBackupData();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghosttunes-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyClipboard = () => {
    const data = generateBackupData();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setRestoredSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || (typeof parsed !== 'object')) {
          throw new Error('Selected file does not contain valid JSON data.');
        }

        // Validate structure (must contain at least playlists or favorites)
        const hasPlaylists = Array.isArray(parsed.playlists);
        const hasFavorites = Array.isArray(parsed.favorites);
        if (!hasPlaylists && !hasFavorites) {
          throw new Error('This file is missing Ghosttunes library data (playlists or favorites).');
        }

        setParsedBackup(parsed);
      } catch (err: any) {
        setParseError(err.message || 'Failed to parse backup file');
        setParsedBackup(null);
      }
    };
    reader.onerror = () => {
      setParseError('Unable to read selected file.');
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = () => {
    if (!parsedBackup) return;

    const offlineTrackList: Track[] = (parsedBackup.offlineManifest?.tracks || []).map(t => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration || '0:00',
      durationSeconds: 210,
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`
    }));

    onRestore({
      playlists: parsedBackup.playlists,
      favorites: parsedBackup.favorites,
      history: parsedBackup.history,
      settings: parsedBackup.settings,
      mergeMode,
      queueDownloads: queueDownloads && isDesktopApp(),
      offlineTrackList
    });

    const plCount = parsedBackup.playlists?.length || 0;
    const favCount = parsedBackup.favorites?.length || 0;
    setRestoredSuccess(`Library restored! ${plCount} playlist${plCount === 1 ? '' : 's'} and ${favCount} favorite${favCount === 1 ? '' : 's'} imported.`);
    setParsedBackup(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-['Inter','Manrope',sans-serif]">
      <div 
        className="w-full max-w-xl bg-zinc-950/95 border border-white/10 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] p-6 sm:p-7 relative overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle ambient corner light */}
        <div 
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-20 transition-colors duration-700"
          style={{ background: currentPalette.primary }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-colors duration-500"
              style={{ background: currentPalette.ambient }}
            >
              <FolderSync className="w-5 h-5" style={{ color: currentPalette.textAccent }} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <span>Backup & Restore Library</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Easily transfer your playlists, favorites, and settings across PCs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-zinc-900/80 rounded-xl border border-white/5 my-5 relative z-10">
          <button
            onClick={() => { setActiveTab('export'); setParseError(null); setRestoredSuccess(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'export'
                ? 'bg-zinc-800 text-white shadow-sm border border-white/10'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Backup</span>
          </button>
          <button
            onClick={() => { setActiveTab('import'); setParseError(null); setRestoredSuccess(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
              activeTab === 'import'
                ? 'bg-zinc-800 text-white shadow-sm border border-white/10'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore / Import</span>
          </button>
        </div>

        {/* Success message banner */}
        {restoredSuccess && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-300">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{restoredSuccess}</span>
          </div>
        )}

        {/* TAB 1: EXPORT */}
        {activeTab === 'export' && (
          <div className="space-y-4 relative z-10">
            <div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Current Library Summary</span>
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                    <ListMusic className="w-3.5 h-3.5" />
                    <span>Playlists</span>
                  </div>
                  <div className="text-lg font-bold text-white">{playlists.length}</div>
                </div>

                <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    <span>Favorites</span>
                  </div>
                  <div className="text-lg font-bold text-white">{favorites.length}</div>
                </div>

                <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Offline</span>
                  </div>
                  <div className="text-lg font-bold text-white">{downloadedTrackIds.size}</div>
                </div>

                <div className="p-3 bg-zinc-950/70 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>Settings</span>
                  </div>
                  <div className="text-xs font-medium text-emerald-400 mt-1">Included</div>
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed pt-1">
                Exporting creates a portable <span className="text-zinc-200 font-mono">.json</span> file containing all playlist tracklists, your favorited tracks, and custom player settings. When you install Ghosttunes on another computer, simply load this file in the Restore tab.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleExportDownload}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98]"
                style={{ 
                  background: currentPalette.primary, 
                  color: '#000'
                }}
              >
                <Download className="w-4 h-4" />
                <span>Download Backup (.json)</span>
              </button>

              <button
                onClick={handleCopyClipboard}
                className="py-2.5 px-4 rounded-xl text-xs sm:text-sm font-medium bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white flex items-center gap-2 transition-all active:scale-[0.98]"
                title="Copy JSON to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: IMPORT / RESTORE */}
        {activeTab === 'import' && (
          <div className="space-y-4 relative z-10">
            {/* File selector zone */}
            {!parsedBackup ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-white/30 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".json,application/json" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
                <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-white/10 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:scale-105 transition-all mb-3 shadow">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-white mb-1">
                  Choose or drag & drop a Ghosttunes backup
                </h4>
                <p className="text-xs text-zinc-500 max-w-xs">
                  Select the <span className="font-mono text-zinc-400">ghosttunes-backup-*.json</span> file exported from your other PC
                </p>
              </div>
            ) : (
              /* Backup preview card */
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-zinc-900/70 border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <FileCheck className="w-4 h-4" />
                      <span>Valid Backup File Loaded</span>
                    </span>
                    <button
                      onClick={() => { setParsedBackup(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="text-xs text-zinc-400 hover:text-white underline"
                    >
                      Choose another file
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-zinc-950/80 rounded-xl border border-white/5">
                      <div className="text-base font-bold text-white">{parsedBackup.playlists?.length || 0}</div>
                      <div className="text-[11px] text-zinc-400">Playlists</div>
                    </div>
                    <div className="p-2.5 bg-zinc-950/80 rounded-xl border border-white/5">
                      <div className="text-base font-bold text-rose-400">{parsedBackup.favorites?.length || 0}</div>
                      <div className="text-[11px] text-zinc-400">Favorites</div>
                    </div>
                    <div className="p-2.5 bg-zinc-950/80 rounded-xl border border-white/5">
                      <div className="text-base font-bold text-cyan-400">{parsedBackup.offlineManifest?.trackCount || 0}</div>
                      <div className="text-[11px] text-zinc-400">Offline Tracks</div>
                    </div>
                  </div>

                  {parsedBackup.playlists && parsedBackup.playlists.length > 0 && (
                    <div className="text-xs text-zinc-400 pt-1">
                      <span className="text-zinc-300 font-medium">Included Playlists: </span>
                      {parsedBackup.playlists.slice(0, 4).map(p => p.name).join(', ')}
                      {parsedBackup.playlists.length > 4 ? ` +${parsedBackup.playlists.length - 4} more` : ''}
                    </div>
                  )}
                </div>

                {/* Import Strategy Options */}
                <div className="p-3.5 bg-zinc-900/40 rounded-xl border border-white/5 space-y-2">
                  <div className="text-xs font-medium text-zinc-300">Restore Strategy:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setMergeMode('merge')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        mergeMode === 'merge'
                          ? 'bg-zinc-800 border-white/30 text-white font-medium'
                          : 'bg-zinc-950/50 border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <div className="font-semibold mb-0.5">Merge (Recommended)</div>
                      <div className="text-[11px] text-zinc-400">Keep current songs and add missing ones</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMergeMode('replace')}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        mergeMode === 'replace'
                          ? 'bg-zinc-800 border-rose-500/40 text-white font-medium'
                          : 'bg-zinc-950/50 border-white/5 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <div className="font-semibold text-rose-300 mb-0.5">Overwrite</div>
                      <div className="text-[11px] text-zinc-400">Replace current library entirely</div>
                    </button>
                  </div>

                  {/* Offline tracks re-download option in Desktop app */}
                  {isDesktopApp() && (parsedBackup.offlineManifest?.trackCount || 0) > 0 && (
                    <label className="flex items-center gap-2.5 pt-2 cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={queueDownloads} 
                        onChange={(e) => setQueueDownloads(e.target.checked)} 
                        className="rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-0"
                      />
                      <span className="text-xs text-zinc-300">
                        Queue {parsedBackup.offlineManifest?.trackCount} offline songs to download on this PC
                      </span>
                    </label>
                  )}
                </div>

                {/* Confirm Restore Button */}
                <button
                  onClick={handleExecuteRestore}
                  className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] mt-2"
                  style={{ 
                    background: currentPalette.primary, 
                    color: '#000'
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Restore Library from Backup</span>
                </button>
              </div>
            )}

            {/* Error message */}
            {parseError && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
