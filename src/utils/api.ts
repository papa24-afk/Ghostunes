// src/utils/api.ts
import { isDesktopApp } from '../services/desktopService';

/**
 * Checks if running inside a native mobile container (Capacitor).
 */
export function isCapacitorNative(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());
}

/**
 * Returns the base URL for the Ghosttunes backend API.
 * In desktop (Electron) mode or file:// protocol, requests are directed to the local backend on 127.0.0.1:3001.
 * In browser web mode, relative paths are used so the Vite dev server proxy or current host handles them.
 * In Android / Capacitor mobile mode, it checks for a custom server URL, environment variable, or local LAN/emulator host.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // 1. Custom server URL stored by user in settings
    const customUrl = localStorage.getItem('ghosttunes_api_url');
    if (customUrl && customUrl.trim()) {
      return customUrl.trim().replace(/\/+$/, '');
    }

    // 2. Vite environment variable
    if (import.meta.env.VITE_API_BASE_URL) {
      return (import.meta.env.VITE_API_BASE_URL as string).replace(/\/+$/, '');
    }

    // 3. Desktop / file protocol
    if (window.location.protocol === 'file:' || isDesktopApp()) {
      return 'http://127.0.0.1:3001';
    }

    // 4. Capacitor native mobile
    if (isCapacitorNative()) {
      return 'http://10.0.2.2:3001';
    }
  }
  return '';
}

/**
 * Updates or removes the custom backend server URL for mobile/remote environments.
 */
export function setCustomApiUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('ghosttunes_api_url', url.trim());
    } else {
      localStorage.removeItem('ghosttunes_api_url');
    }
  }
}

/**
 * Prepends the appropriate API base URL to an endpoint path.
 * e.g. getApiUrl('/api/genre') -> 'http://127.0.0.1:3001/api/genre' (desktop)
 *                             -> '/api/genre' (browser dev)
 */
export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
