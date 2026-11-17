// src/components/ArtistAvatar.tsx
import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/api';

interface ArtistAvatarProps {
  name: string;
  src?: string | null;
  size?: number | string; // e.g. 40 or 'w-10 h-10'
  className?: string;
  artistId?: string;
}

// Module-level in-memory cache to prevent redundant avatar fetches
const avatarCache = new Map<string, string>();
const pendingFetches = new Map<string, Promise<string | null>>();

async function fetchAvatarForArtist(name: string, artistId?: string): Promise<string | null> {
  const cacheKey = (artistId || name).trim().toLowerCase();
  if (avatarCache.has(cacheKey)) {
    return avatarCache.get(cacheKey)!;
  }
  if (pendingFetches.has(cacheKey)) {
    return pendingFetches.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const param = artistId 
        ? `id=${encodeURIComponent(artistId)}` 
        : `name=${encodeURIComponent(name)}`;
      const res = await fetch(getApiUrl(`/api/artist-avatar?${param}`));
      if (!res.ok) return null;
      const data = await res.json();
      const url = data.avatar || data.avatarUrl || null;
      if (url) {
        avatarCache.set(cacheKey, url);
      }
      return url;
    } catch {
      return null;
    } finally {
      pendingFetches.delete(cacheKey);
    }
  })();

  pendingFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export const ArtistAvatar: React.FC<ArtistAvatarProps> = ({
  name,
  src,
  size = 40,
  className = '',
  artistId
}) => {
  const cacheKey = (artistId || name).trim().toLowerCase();
  const [dynamicSrc, setDynamicSrc] = useState<string | null>(() => {
    return src || avatarCache.get(cacheKey) || null;
  });
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Auto-fetch avatar if src not provided
  useEffect(() => {
    if (src) {
      setDynamicSrc(src);
      setHasError(false);
      return;
    }

    if (avatarCache.has(cacheKey)) {
      setDynamicSrc(avatarCache.get(cacheKey)!);
      setHasError(false);
      return;
    }

    if (!name || name === 'Unknown Artist') return;

    let isMounted = true;
    fetchAvatarForArtist(name, artistId).then(fetchedUrl => {
      if (isMounted && fetchedUrl) {
        setDynamicSrc(fetchedUrl);
        setHasError(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src, name, artistId, cacheKey]);

  const initials = (name || 'Artist')
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || (name || 'AR').slice(0, 2).toUpperCase() || 'AR';

  const effectiveSrc = dynamicSrc;
  const showImage = Boolean(effectiveSrc) && !hasError;
  const sizeStyle = typeof size === 'number' ? { width: `${size}px`, height: `${size}px` } : undefined;
  const sizeClass = typeof size === 'string' ? size : '';

  return (
    <div
      style={sizeStyle}
      className={`relative rounded-full overflow-hidden bg-zinc-800 border border-white/[0.08] flex-shrink-0 select-none ${sizeClass} ${className}`}
    >
      {showImage && (
        <img
          src={effectiveSrc!}
          alt={name}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Render fallback initials ONLY when image is missing or failed to load, OR while initial image is still loading */}
      {(!showImage || !isLoaded) && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-zinc-800 text-zinc-300 font-semibold select-none uppercase tracking-wider"
          style={{ fontSize: typeof size === 'number' ? `${Math.round(size * 0.35)}px` : '12px' }}
        >
          {initials}
        </div>
      )}
    </div>
  );
};
