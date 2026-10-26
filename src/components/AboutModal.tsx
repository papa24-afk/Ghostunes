// src/components/AboutModal.tsx
import React, { useEffect } from 'react';
import { X, Download, Heart, ExternalLink, ShieldCheck, Sparkles, Music2, Code2 } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const appVersion = '1.0.0';
  const githubRepoUrl = 'https://github.com/papa24-afk/Ghostunes';
  const releasesUrl = 'https://github.com/papa24-afk/Ghostunes/releases';
  const issuesUrl = 'https://github.com/papa24-afk/Ghostunes/issues';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg bg-zinc-950/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Top Glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 bg-[#e0536c]/20 blur-3xl pointer-events-none rounded-full" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer outline-none"
          title="Close (Esc)"
          aria-label="Close About Dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with App Logo & Title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-3 flex items-center justify-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#9e2a40] via-[#e0536c] to-rose-400 p-0.5 shadow-lg shadow-[#9e2a40]/30">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                <Music2 className="w-8 h-8 text-[#ff8099]" />
              </div>
            </div>
            <Sparkles className="w-4 h-4 text-[#ff8099] absolute -top-1 -right-1 animate-pulse" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Ghosttunes
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#e0536c]/20 text-[#ff8099] border border-[#e0536c]/30">
              v{appVersion}
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs font-sans">
            Premium Open-Source Desktop Music Player for Windows
          </p>
        </div>

        {/* About Description */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 text-xs text-zinc-300 leading-relaxed font-sans">
          <p className="mb-2">
            Ghosttunes is crafted for music enthusiasts who demand an ad-free, high-fidelity listening experience. Built with native synchronized karaoke lyrics, an offline SQLite catalog engine, intelligent autoplay radio, and deep personalization.
          </p>
          <p className="text-zinc-400 text-[11px]">
            Created and maintained by <span className="text-white font-medium">papa24-afk</span> with contributions from developers worldwide.
          </p>
        </div>

        {/* Tech Stack Badges */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-6 text-[10px] text-zinc-400 font-mono">
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">React 19</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">TypeScript</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Electron 45</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Vite</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">Tailwind CSS</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">SQLite</span>
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5">InnerTube</span>
        </div>

        {/* Action Links */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <a
            href={releasesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#e0536c] hover:bg-[#c9425a] text-white text-xs font-semibold tracking-tight transition-all active:scale-[0.98] shadow-md shadow-[#e0536c]/20"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Exe</span>
          </a>

          <a
            href={githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-medium tracking-tight transition-all active:scale-[0.98]"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub Repository</span>
          </a>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500 font-sans">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>MIT Licensed • Open Source</span>
          </div>

          <a
            href={issuesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <span>Feedback & Issues</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
};
