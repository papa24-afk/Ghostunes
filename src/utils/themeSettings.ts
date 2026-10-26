// src/utils/themeSettings.ts
// Appearance & Adaptive Lighting settings with local persistence

import { TrackPalette } from './palette';

export type ThemeMode = 'auto' | 'cyan' | 'indigo' | 'crimson' | 'emerald' | 'champagne';
export type GlowIntensity = 'vibrant' | 'subtle' | 'none';

export interface ThemeSettings {
  mode: ThemeMode;
  glowIntensity: GlowIntensity;
}

const STORAGE_KEY = 'metrolist_theme_settings';

export const THEME_OVERRIDE_PALETTES: Record<Exclude<ThemeMode, 'auto'>, TrackPalette> = {
  cyan: {
    primary: '#0ea5e9',
    accent: '#38bdf8',
    dark: '#03070d',
    ambient: 'rgba(14, 165, 233, 0.12)',
    glow: 'rgba(14, 165, 233, 0.22)',
    textAccent: '#7dd3fc',
    inkGradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    hue: 198
  },
  indigo: {
    primary: '#6366f1',
    accent: '#818cf8',
    dark: '#05040f',
    ambient: 'rgba(99, 102, 241, 0.12)',
    glow: 'rgba(99, 102, 241, 0.22)',
    textAccent: '#a5b4fc',
    inkGradient: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
    hue: 235
  },
  crimson: {
    primary: '#e11d48',
    accent: '#fb7185',
    dark: '#0c0205',
    ambient: 'rgba(225, 29, 72, 0.12)',
    glow: 'rgba(225, 29, 72, 0.22)',
    textAccent: '#fca5a5',
    inkGradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    hue: 345
  },
  emerald: {
    primary: '#059669',
    accent: '#34d399',
    dark: '#020b06',
    ambient: 'rgba(5, 150, 105, 0.12)',
    glow: 'rgba(5, 150, 105, 0.22)',
    textAccent: '#6ee7b7',
    inkGradient: 'linear-gradient(135deg, #34d399 0%, #059669 100%)',
    hue: 160
  },
  champagne: {
    primary: '#b45309',
    accent: '#d97706',
    dark: '#0a0602',
    ambient: 'rgba(180, 83, 9, 0.08)',
    glow: 'rgba(180, 83, 9, 0.15)',
    textAccent: '#fef3c7',
    inkGradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    hue: 38
  }
};

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  mode: 'auto',
  glowIntensity: 'vibrant'
};

export function getThemeSettings(): ThemeSettings {
  if (typeof window === 'undefined') return DEFAULT_THEME_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      mode: ['auto', 'cyan', 'indigo', 'crimson', 'emerald', 'champagne'].includes(parsed.mode) 
        ? parsed.mode 
        : 'auto',
      glowIntensity: ['vibrant', 'subtle', 'none'].includes(parsed.glowIntensity) 
        ? parsed.glowIntensity 
        : 'vibrant'
    };
  } catch {
    return DEFAULT_THEME_SETTINGS;
  }
}

export function saveThemeSettings(settings: ThemeSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save theme settings to localStorage', err);
  }
}
