import React, { useState } from 'react';
import { 
  X, 
  Zap, 
  Wifi, 
  Image as ImageIcon, 
  Database, 
  Trash2, 
  Check, 
  Activity, 
  Layers 
} from 'lucide-react';
import { 
  DataSaverConfig, 
  saveDataSaverConfig, 
  clearGhosttunesCache, 
  getEstimatedDataSavedMB 
} from '../utils/dataSaver';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: DataSaverConfig;
  onUpdateConfig?: (newConfig: DataSaverConfig) => void;
  onSave?: (newConfig: DataSaverConfig) => void;
}

export const DataSaverModal: React.FC<Props> = ({
  isOpen,
  onClose,
  config,
  onUpdateConfig,
  onSave
}) => {
  const [clearedNotice, setClearedNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const notifyChange = (updated: DataSaverConfig) => {
    onUpdateConfig?.(updated);
    onSave?.(updated);
    saveDataSaverConfig(updated);
  };

  const handleToggleMaster = () => {
    const updated: DataSaverConfig = {
      ...config,
      enabled: !config.enabled
    };
    notifyChange(updated);
  };

  const handleToggleOption = (key: keyof Omit<DataSaverConfig, 'enabled'>) => {
    const updated: DataSaverConfig = {
      ...config,
      [key]: !config[key]
    };
    notifyChange(updated);
  };

  const handleClearCache = () => {
    const res = clearGhosttunesCache();
    setClearedNotice(res.message);
    setTimeout(() => setClearedNotice(null), 3000);
  };

  const savedMB = getEstimatedDataSavedMB();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-md bg-[#101014] border border-white/10 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] p-6 z-10 font-['Inter','Manrope',sans-serif] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/10 text-zinc-400'}`}>
              <Zap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Data Saver</h2>
              <p className="text-xs text-zinc-400">Web-first low bandwidth mode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white transition-colors outline-none"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Toggle Banner */}
        <div className="mt-5 p-4 rounded-2xl bg-zinc-900/80 border border-white/[0.08] flex items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="text-sm font-semibold text-white block">
              {config.enabled ? 'Data Saver Enabled' : 'Data Saver Off'}
            </span>
            <span className="text-xs text-zinc-400 leading-relaxed block mt-0.5">
              Auto-enabled on mobile screens and low-bandwidth connections. Conserves mobile data by optimizing artwork, lazy audio streaming, and smart caching.
            </span>
          </div>
          <button
            onClick={handleToggleMaster}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors outline-none cursor-pointer flex-shrink-0 ${
              config.enabled ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            aria-checked={config.enabled}
            role="switch"
          >
            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {/* Granular Sub-Preferences */}
        <div className="mt-5 space-y-3">
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider px-1">
            Optimization Preferences
          </p>

          {/* 1. Audio Preload */}
          <div 
            onClick={() => handleToggleOption('reducedPreload')}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <Wifi className="w-4 h-4 text-zinc-400" />
              <div>
                <p className="text-xs font-semibold text-zinc-200">Lazy Audio Streaming</p>
                <p className="text-[11px] text-zinc-400">Stream audio on-demand, avoid queue preloading</p>
              </div>
            </div>
            <input 
              type="checkbox" 
              checked={config.reducedPreload} 
              readOnly 
              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          {/* 2. Low Data Artwork */}
          <div 
            onClick={() => handleToggleOption('lowDataArtwork')}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="w-4 h-4 text-zinc-400" />
              <div>
                <p className="text-xs font-semibold text-zinc-200">Optimized Artwork</p>
                <p className="text-[11px] text-zinc-400">Load mobile-friendly covers, saves ~75% bytes</p>
              </div>
            </div>
            <input 
              type="checkbox" 
              checked={config.lowDataArtwork} 
              readOnly 
              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          {/* 3. Browser Cache */}
          <div 
            onClick={() => handleToggleOption('cacheEnabled')}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-zinc-400" />
              <div>
                <p className="text-xs font-semibold text-zinc-200">Smart Browser Caching</p>
                <p className="text-[11px] text-zinc-400">Reuse lyrics, searches, and genre hits locally</p>
              </div>
            </div>
            <input 
              type="checkbox" 
              checked={config.cacheEnabled} 
              readOnly 
              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>

          {/* 4. Lightweight Visuals */}
          <div 
            onClick={() => handleToggleOption('lightweightVisuals')}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-zinc-400" />
              <div>
                <p className="text-xs font-semibold text-zinc-200">Lightweight Visuals</p>
                <p className="text-[11px] text-zinc-400">Pause background motion when tab is in background</p>
              </div>
            </div>
            <input 
              type="checkbox" 
              checked={config.lightweightVisuals} 
              readOnly 
              className="accent-emerald-500 w-4 h-4 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Stats & Cache Management */}
        <div className="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Estimated saved: <strong className="text-white">{savedMB} MB</strong></span>
          </div>

          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-colors outline-none"
            title="Clear cached website lyrics and queries"
          >
            <Trash2 className="w-3 h-3 text-zinc-400" />
            <span>Clear Cache</span>
          </button>
        </div>

        {clearedNotice && (
          <div className="mt-3 p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-1.5 justify-center animate-in fade-in">
            <Check className="w-3.5 h-3.5" />
            <span>{clearedNotice}</span>
          </div>
        )}

      </div>
    </div>
  );
};
