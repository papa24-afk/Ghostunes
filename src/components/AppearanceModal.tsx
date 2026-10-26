import React from 'react';
import { X, Sparkles, Check, Eye } from 'lucide-react';
import { ThemeSettings, ThemeMode, GlowIntensity, THEME_OVERRIDE_PALETTES } from '../utils/themeSettings';
import { TrackPalette } from '../utils/palette';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: ThemeSettings;
  onUpdateSettings: (newSettings: ThemeSettings) => void;
  currentPalette: TrackPalette;
  trackTitle?: string;
  artist?: string;
}

const PRESET_OPTIONS: { id: ThemeMode; label: string; desc: string; color: string; sampleGradient: string }[] = [
  {
    id: 'auto',
    label: 'Automatic Artwork',
    desc: 'Intelligently adapts to each song’s album artwork (Default)',
    color: '#38bdf8',
    sampleGradient: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 50%, #e11d48 100%)'
  },
  {
    id: 'cyan',
    label: 'Cool Cyan & Blue',
    desc: 'Subtle, tasteful lighting (Lil Uzi benchmark)',
    color: '#0ea5e9',
    sampleGradient: THEME_OVERRIDE_PALETTES.cyan.inkGradient
  },
  {
    id: 'indigo',
    label: 'Nocturnal Indigo & Sapphire',
    desc: 'Deep cinematic midnight atmosphere',
    color: '#6366f1',
    sampleGradient: THEME_OVERRIDE_PALETTES.indigo.inkGradient
  },
  {
    id: 'crimson',
    label: 'Dark Crimson & Rose',
    desc: 'Restrained noir tone with slate base',
    color: '#e11d48',
    sampleGradient: THEME_OVERRIDE_PALETTES.crimson.inkGradient
  },
  {
    id: 'emerald',
    label: 'Mint Emerald & Teal',
    desc: 'Soft, organic luminescence',
    color: '#059669',
    sampleGradient: THEME_OVERRIDE_PALETTES.emerald.inkGradient
  },
  {
    id: 'champagne',
    label: 'Muted Champagne & Warm Ivory',
    desc: 'Soft luxury warmth (no muddy yellow/orange)',
    color: '#d97706',
    sampleGradient: THEME_OVERRIDE_PALETTES.champagne.inkGradient
  }
];

const GLOW_OPTIONS: { id: GlowIntensity; label: string; desc: string }[] = [
  {
    id: 'vibrant',
    label: 'Subtle Atmospheric',
    desc: 'Diffuse, low-opacity ambient lighting and lyric halos'
  },
  {
    id: 'subtle',
    label: 'Minimal Glow',
    desc: 'Restrained, very gentle ambient lighting'
  },
  {
    id: 'none',
    label: 'Clean / Zero Glow',
    desc: 'Pure dark aesthetic with zero glowing background orbs'
  }
];

export const AppearanceModal: React.FC<Props> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  currentPalette,
  trackTitle,
  artist
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in font-['Inter','Manrope',sans-serif]">
      <div 
        className="w-full max-w-lg bg-zinc-950/95 border border-white/10 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] p-6 sm:p-7 relative overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle diffuse ambient corner glow reflecting current palette */}
        <div 
          className="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl pointer-events-none opacity-20 transition-colors duration-700"
          style={{ background: currentPalette.primary }}
        />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md transition-colors duration-500"
              style={{ background: currentPalette.ambient }}
            >
              <Sparkles className="w-5 h-5" style={{ color: currentPalette.textAccent }} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <span>Appearance & Lighting</span>
              </h2>
              <p className="text-xs text-zinc-400">
                Tasteful artwork-driven lighting and lyric highlighting
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

        {/* Live Preview Card */}
        <div 
          className="my-5 p-4 rounded-2xl border border-white/10 relative overflow-hidden transition-all duration-500 shadow-inner"
          style={{
            background: `radial-gradient(ellipse at top right, ${currentPalette.ambient} 0%, rgba(12,12,16,0.95) 75%)`
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>Atmosphere Preview</span>
            </span>
            <span 
              className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-white/10 text-zinc-300 font-semibold"
              style={{ backgroundColor: currentPalette.ambient }}
            >
              {settings.mode === 'auto' ? 'Per-Song Adaptive' : `${settings.mode.toUpperCase()} Override`}
            </span>
          </div>
          <p 
            className="text-base sm:text-lg font-bold leading-tight drop-shadow-md break-words text-white"
            style={{ 
              textShadow: `0 0 16px ${currentPalette.ambient}`
            }}
          >
            {trackTitle || 'Now Playing Track'}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
            <span>{artist ? `by ${artist}` : 'Subtle, cinematic lighting'}</span>
            <span 
              className="inline-block w-2 h-2 rounded-full" 
              style={{ backgroundColor: currentPalette.textAccent }} 
            />
          </p>
        </div>

        <div className="space-y-5 max-h-[58vh] overflow-y-auto pr-1">
          {/* Section 1: Color Palette */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2.5">
              Atmosphere & Accent Color
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = settings.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => onUpdateSettings({ ...settings, mode: opt.id })}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-white/40 bg-white/10 shadow-sm'
                        : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15'
                    }`}
                  >
                    <div 
                      className="w-4 h-4 rounded-full mt-0.5 flex-shrink-0 border border-white/20 shadow-sm"
                      style={{ background: opt.sampleGradient }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                          {opt.label}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white ml-1 flex-shrink-0" />}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-tight mt-0.5 truncate">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Glow Intensity */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2.5">
              Lighting & Ambient Halo
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GLOW_OPTIONS.map((gOpt) => {
                const isSelected = settings.glowIntensity === gOpt.id;
                return (
                  <button
                    key={gOpt.id}
                    onClick={() => onUpdateSettings({ ...settings, glowIntensity: gOpt.id })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-white/40 bg-white/10 shadow-sm'
                        : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                        {gOpt.label}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight">
                      {gOpt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Settings saved to local preferences</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold transition-all active:scale-95 shadow-md cursor-pointer touch-manipulation"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
