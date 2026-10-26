// src/utils/dataSaver.ts
// Ghosttunes Web-First Data Saver & Client Cache System

export interface DataSaverConfig {
  enabled: boolean;
  reducedPreload: boolean;
  lowDataArtwork: boolean;
  cacheEnabled: boolean;
  lightweightVisuals: boolean;
}

const STORAGE_KEY = 'ghosttunes_data_saver_config';
const CACHE_STATS_KEY = 'ghosttunes_data_saver_saved_bytes';

// Default configuration with auto-detection of browser's Save-Data header
// and default-enabled for new users on mobile-sized viewports / devices
export function getDefaultDataSaverConfig(): DataSaverConfig {
  const isBrowserSaveData = typeof navigator !== 'undefined' && 
    (navigator as any).connection && 
    (navigator as any).connection.saveData === true;

  const isMobileScreen = typeof window !== 'undefined' && (
    window.innerWidth <= 768 || 
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) ||
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  );

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return { ...JSON.parse(saved) };
    }
  } catch {}

  return {
    enabled: Boolean(isBrowserSaveData || isMobileScreen),
    reducedPreload: true,
    lowDataArtwork: true,
    cacheEnabled: true,
    lightweightVisuals: true
  };
}

export function saveDataSaverConfig(config: DataSaverConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

// In-memory runtime caches to avoid duplicate network fetches
export const memoryLyricsCache = new Map<string, { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }>();
export const memoryGenreCache = new Map<string, any[]>();
export const memorySearchCache = new Map<string, any[]>();

// Track estimated network data saved (in bytes)
export function recordDataSaved(bytes: number) {
  if (bytes <= 0) return;
  try {
    const current = Number(localStorage.getItem(CACHE_STATS_KEY) || '0');
    localStorage.setItem(CACHE_STATS_KEY, String(current + bytes));
  } catch {}
}

export function getEstimatedDataSavedMB(): string {
  try {
    const bytes = Number(localStorage.getItem(CACHE_STATS_KEY) || '0');
    return (bytes / (1024 * 1024)).toFixed(1);
  } catch {
    return '0.0';
  }
}

// Clear all website-cached resources
export function clearGhosttunesCache(): { cleared: boolean; message: string } {
  memoryLyricsCache.clear();
  memoryGenreCache.clear();
  memorySearchCache.clear();

  try {
    // Clear lyrics cache from localStorage if any
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('ghosttunes_lyrics_') || key.startsWith('ghosttunes_cache_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(CACHE_STATS_KEY);
    return { cleared: true, message: 'Website cache cleared successfully' };
  } catch (e: any) {
    return { cleared: false, message: e.message || 'Failed to clear cache' };
  }
}
