// src/utils/api.ts
import { isDesktopApp } from '../services/desktopService';

/**
 * Returns the base URL for the Ghosttunes backend API.
 * In desktop (Electron) mode or file:// protocol, requests are directed to the local backend on 127.0.0.1:3001.
 * In browser web mode, relative paths are used so the Vite dev server proxy or current host handles them.
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:' || isDesktopApp()) {
      return 'http://127.0.0.1:3001';
    }
  }
  return '';
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
