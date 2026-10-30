// src/components/AboutModal.tsx
import React, { useEffect, useState } from 'react';
import { 
  X, 
  ArrowLeft, 
  Download, 
  RefreshCw, 
  Check, 
  AlertCircle, 
  ExternalLink, 
  Sparkles, 
  Music2, 
  ShieldCheck 
} from 'lucide-react';
import { 
  openExternalLink, 
  getUpdateState, 
  checkAppUpdates, 
  downloadAppUpdate, 
  installAppUpdate, 
  deferAppUpdate, 
  subscribeUpdateStatus, 
  UpdateStatus 
} from '../services/desktopService';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [updateState, setUpdateState] = useState<UpdateStatus>({
    status: 'idle',
    currentVersion: '1.0.0',
    availableVersion: null,
    progress: null,
    error: null,
    lastChecked: null
  });
  const [isCheckingManual, setIsCheckingManual] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Fetch initial updater state on open
      getUpdateState().then(state => {
        if (state) setUpdateState(state);
      });
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Subscribe to real-time update events from electron main process
  useEffect(() => {
    const unsub = subscribeUpdateStatus((status) => {
      setUpdateState(status);
      if (status.status !== 'checking') {
        setIsCheckingManual(false);
      }
    });
    return unsub;
  }, []);

  if (!isOpen) return null;

  const appVersion = updateState.currentVersion || '1.0.0';
  const developerName = 'D!g!†@L G#0$†';
  const whatsappUrl = 'https://wa.me/kobb.y298';
  const githubRepoUrl = 'https://github.com/papa24-afk/Ghostunes';
  const releasesUrl = 'https://github.com/papa24-afk/Ghostunes/releases';

  const handleCheckUpdates = async () => {
    setIsCheckingManual(true);
    try {
      const res = await checkAppUpdates();
      if (res) {
        setUpdateState(res);
      }
    } catch (e: any) {
      setUpdateState(prev => ({
        ...prev,
        status: 'error',
        error: e?.message || 'Failed to check for updates'
      }));
    } finally {
      setIsCheckingManual(false);
    }
  };

  const handleStartDownload = async () => {
    try {
      await downloadAppUpdate();
    } catch (e) {
      console.error('Download update error:', e);
    }
  };

  const handleInstallNow = () => {
    installAppUpdate();
  };

  const handleDefer = () => {
    deferAppUpdate();
    setUpdateState(prev => ({ ...prev, status: 'idle' }));
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Right Drawer Slide-over Panel */}
      <div 
        className="relative w-full max-w-md h-full bg-[#0c0c0f] border-l border-white/[0.08] shadow-2xl text-white flex flex-col overflow-y-auto animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Ambient Glow */}
        <div className="absolute top-0 right-0 w-72 h-36 bg-[#e0536c]/15 blur-3xl pointer-events-none rounded-full" />

        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0c0c0f]/80 backdrop-blur-md sticky top-0 z-20">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors cursor-pointer group outline-none"
            title="Back to Player (Esc)"
            aria-label="Back to Player"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="text-sm font-semibold text-zinc-200 group-hover:text-white">About Ghosttunes</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer outline-none"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 p-6 space-y-6">
          {/* App Brand & Version Card */}
          <div className="flex flex-col items-center text-center pt-2 pb-1">
            <div className="relative mb-3.5 flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#9e2a40] via-[#e0536c] to-rose-400 p-0.5 shadow-xl shadow-[#9e2a40]/30">
                <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                  <Music2 className="w-8 h-8 text-[#ff8099]" />
                </div>
              </div>
              <Sparkles className="w-4 h-4 text-[#ff8099] absolute -top-1 -right-1 animate-pulse" />
            </div>

            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              Ghosttunes
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e0536c]/20 text-[#ff8099] border border-[#e0536c]/30 font-mono">
                v{appVersion}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-2 max-w-xs leading-relaxed font-sans">
              A premium music player with immersive lyrics, smart playlists, offline playback and more.
            </p>
          </div>

          {/* Metadata Rows: Developer, WhatsApp Contact, GitHub Repository */}
          <div className="space-y-2.5">
            {/* Developer Attribution Card */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-xs text-zinc-400 font-medium">Developer</span>
              <span className="text-xs font-semibold text-white tracking-wide font-mono px-2 py-0.5 rounded bg-white/5 border border-white/5">
                {developerName}
              </span>
            </div>

            {/* Contact Developer via WhatsApp */}
            <button
              onClick={() => openExternalLink(whatsappUrl)}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] hover:bg-emerald-500/[0.08] border border-white/[0.06] hover:border-emerald-500/30 transition-all cursor-pointer group text-left"
              title="Open WhatsApp chat with developer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center text-[#25D366] group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-medium text-white group-hover:text-emerald-300 transition-colors">
                    Contact Developer
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono">
                    WhatsApp Chat
                  </div>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
            </button>

            {/* Official GitHub Repository */}
            <button
              onClick={() => openExternalLink(githubRepoUrl)}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer group text-left"
              title="Open GitHub repository"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-zinc-300 group-hover:text-white transition-colors">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-xs font-medium text-white">Source Repository</div>
                  <div className="text-[11px] text-zinc-400 font-mono">papa24-afk/Ghostunes</div>
                </div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Automatic Updates System Card */}
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Software Updates
              </span>
              {updateState.lastChecked && (
                <span className="text-[10px] text-zinc-500 font-mono">
                  Checked {new Date(updateState.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Status Feedback Display */}
            {updateState.status === 'checking' || isCheckingManual ? (
              <div className="flex items-center gap-2.5 p-3 rounded-lg bg-white/[0.02] border border-white/5 text-xs text-zinc-300">
                <RefreshCw className="w-4 h-4 text-[#e0536c] animate-spin flex-shrink-0" />
                <span>Checking for newer versions on GitHub...</span>
              </div>
            ) : updateState.status === 'available' ? (
              <div className="space-y-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <Sparkles className="w-4 h-4 flex-shrink-0" />
                  <span>Version {updateState.availableVersion} is available!</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleStartDownload}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Download Update
                  </button>
                  <button
                    onClick={handleDefer}
                    className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-xs transition-colors cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              </div>
            ) : updateState.status === 'downloading' ? (
              <div className="space-y-2 p-3 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
                <div className="flex items-center justify-between text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-[#e0536c] animate-bounce" />
                    Downloading Update...
                  </span>
                  <span className="font-mono text-zinc-400">
                    {updateState.progress?.percent || 0}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#9e2a40] to-[#e0536c] transition-all duration-300"
                    style={{ width: `${updateState.progress?.percent || 0}%` }}
                  />
                </div>
              </div>
            ) : updateState.status === 'downloaded' ? (
              <div className="space-y-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-medium">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Update downloaded and ready to install!</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleInstallNow}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs transition-colors cursor-pointer"
                  >
                    Restart & Install Now
                  </button>
                  <button
                    onClick={handleDefer}
                    className="py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-300 text-xs transition-colors cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              </div>
            ) : updateState.status === 'up-to-date' ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/[0.07] border border-emerald-500/20 text-xs text-emerald-400 font-sans">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Ghosttunes is up to date (v{appVersion}).</span>
              </div>
            ) : updateState.status === 'offline' ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/[0.07] border border-amber-500/20 text-xs text-amber-400 font-sans">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Offline: Unable to reach update servers.</span>
              </div>
            ) : updateState.status === 'error' ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/[0.07] border border-rose-500/20 text-xs text-rose-400 font-sans">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{updateState.error || 'Update check failed.'}</span>
              </div>
            ) : null}

            {/* Action Buttons: Check for Updates & View Changelog */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleCheckUpdates}
                disabled={updateState.status === 'checking' || isCheckingManual}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-medium tracking-tight transition-all active:scale-[0.98] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingManual ? 'animate-spin' : ''}`} />
                <span>Check for Updates</span>
              </button>

              <button
                onClick={() => openExternalLink(releasesUrl)}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-300 hover:text-white text-xs font-medium tracking-tight transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>View Changelog</span>
                <ExternalLink className="w-3 h-3 text-zinc-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.06] bg-[#0c0c0f]/80 backdrop-blur-md flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>MIT Licensed • Open Source</span>
          </div>
          <span className="font-mono text-zinc-600">
            Electron • {typeof window !== 'undefined' && ((window as any).electronAPI?.platform === 'darwin' || /Macintosh|Mac OS X/i.test(navigator.userAgent)) ? 'macOS' : 'Windows'}
          </span>
        </div>
      </div>
    </div>
  );
};
