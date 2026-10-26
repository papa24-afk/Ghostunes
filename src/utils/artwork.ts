/**
 * Helper to obtain optimized album artwork from streaming providers and YouTube Music.
 * Supports web-first Data Saver mode to minimize byte transfers on mobile networks.
 */

export function getHighResArtwork(url?: string | null): string {
  return getOptimizedArtwork(url, false);
}

/**
 * Returns optimized artwork URL respecting Data Saver settings.
 * On Data Saver mode, requests compact medium resolution (saves ~75-80% image bytes).
 */
export function getOptimizedArtwork(url?: string | null, isDataSaver = false): string {
  if (!url) return '';

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
export function getThumbnailArtwork(url?: string | null): string {
  if (!url) return '';

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
