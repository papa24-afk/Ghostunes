/**
 * Helper to obtain optimized album artwork from streaming providers and YouTube Music.
 * Supports web-first Data Saver mode to minimize byte transfers on mobile networks.
 * Fully supports offline local artwork resolution for downloaded tracks in Electron/desktop mode.
 */

// Offline artwork URL registry mapping trackId -> local artwork URL
const offlineArtworkRegistry = new Map<string, string>();

/**
 * Registers offline artwork URLs for downloaded tracks.
 */
export function registerOfflineArtworks(tracks: { id: string; thumbnail?: string; local_artwork_url?: string }[]): void {
  tracks.forEach((t) => {
    if (t.id) {
      if (t.local_artwork_url) {
        offlineArtworkRegistry.set(t.id, t.local_artwork_url);
      } else if (t.thumbnail && (t.thumbnail.includes('/api/artwork/') || t.thumbnail.startsWith('ghost-media://'))) {
        offlineArtworkRegistry.set(t.id, t.thumbnail);
      } else {
        offlineArtworkRegistry.set(t.id, `http://127.0.0.1:3001/api/artwork/${t.id}`);
      }
    }
  });
}

/**
 * Retrieves the local offline artwork URL for a track if available.
 */
export function getOfflineArtworkUrl(trackId?: string | null): string | null {
  if (!trackId) return null;
  return offlineArtworkRegistry.get(trackId) || `http://127.0.0.1:3001/api/artwork/${trackId}`;
}

export function getHighResArtwork(url?: string | null, trackId?: string | null): string {
  return getOptimizedArtwork(url, false, trackId);
}

/**
 * Returns optimized artwork URL respecting Data Saver settings and offline mode.
 */
export function getOptimizedArtwork(url?: string | null, isDataSaver = false, trackId?: string | null): string {
  if (!url) {
    if (trackId && offlineArtworkRegistry.has(trackId)) {
      return offlineArtworkRegistry.get(trackId)!;
    }
    return '';
  }

  // If already a local artwork URL or media protocol, return as-is
  if (url.includes('/api/artwork/') || url.startsWith('ghost-media://') || url.startsWith('data:')) {
    return url;
  }

  // If offline and track has registered offline artwork, prefer local artwork
  if (trackId && offlineArtworkRegistry.has(trackId) && typeof navigator !== 'undefined' && !navigator.onLine) {
    return offlineArtworkRegistry.get(trackId)!;
  }

  // Google / YouTube Music CDN images:
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (/=w\d+-h\d+/.test(url)) {
      const sizeParam = isDataSaver ? '=w260-h260-l90-rj' : '=w544-h544-l90-rj';
      return url.replace(/=w\d+-h\d+[^?]*/, sizeParam);
    }
    if (/=s\d+/.test(url)) {
      const sizeParam = isDataSaver ? '=s300' : '=s600';
      return url.replace(/=s\d+[^?]*/, sizeParam);
    }
  }

  // Apple Music / iTunes CDN images
  if (url.includes('mzstatic.com')) {
    const sizeParam = isDataSaver ? '/300x300bb.' : '/600x600bb.';
    return url.replace(/\/\d+x\d+bb\./, sizeParam);
  }

  // Standard YouTube video thumbnails
  if (url.includes('i.ytimg.com/vi/')) {
    if (isDataSaver) {
      if (url.endsWith('/hqdefault.jpg')) {
        return url.replace(/\/hqdefault\.jpg$/, '/mqdefault.jpg');
      }
    } else {
      if (url.endsWith('/default.jpg') || url.endsWith('/mqdefault.jpg')) {
        return url.replace(/\/(default|mqdefault)\.jpg$/, '/hqdefault.jpg');
      }
    }
  }

  return url;
}

/**
 * Ultra-compact thumbnail URL for search lists, queue rows, and drawer items.
 */
export function getThumbnailArtwork(url?: string | null, trackId?: string | null): string {
  if (!url) {
    if (trackId && offlineArtworkRegistry.has(trackId)) {
      return offlineArtworkRegistry.get(trackId)!;
    }
    return '';
  }

  // If already a local artwork URL or media protocol, return as-is
  if (url.includes('/api/artwork/') || url.startsWith('ghost-media://') || url.startsWith('data:')) {
    return url;
  }

  // If offline and track has registered offline artwork, prefer local artwork
  if (trackId && offlineArtworkRegistry.has(trackId) && typeof navigator !== 'undefined' && !navigator.onLine) {
    return offlineArtworkRegistry.get(trackId)!;
  }

  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (/=w\d+-h\d+/.test(url)) {
      return url.replace(/=w\d+-h\d+[^?]*/, '=w120-h120-l90-rj');
    }
    if (/=s\d+/.test(url)) {
      return url.replace(/=s\d+[^?]*/, '=s120');
    }
  }

  if (url.includes('mzstatic.com')) {
    return url.replace(/\/\d+x\d+bb\./, '/120x120bb.');
  }

  if (url.includes('i.ytimg.com/vi/')) {
    if (url.endsWith('/hqdefault.jpg')) {
      return url.replace(/\/hqdefault\.jpg$/, '/mqdefault.jpg');
    }
  }

  return url;
}
