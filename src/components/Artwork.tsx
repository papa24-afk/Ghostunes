import React, { useEffect, useState } from 'react';
import { Music2 } from 'lucide-react';
import { getArtworkCandidates } from '../utils/artwork';
import { getApiUrl } from '../utils/api';

/** A source that neither loads nor fails within this long (slow or blocked network) is skipped. */
const STALL_MS = 5000;

interface Props {
  src?: string | null;
  localSrc?: string | null;
  trackId?: string;
  alt?: string;
  className?: string;
  isDataSaver?: boolean;
  loading?: 'eager' | 'lazy';
}

export function Artwork(props: Props) {
  // Remount the loader when its source changes so a previous failure is never sticky.
  return (
    <ArtworkLoader
      key={`${props.trackId || ''}:${props.src || ''}:${props.localSrc || ''}:${props.isDataSaver}`}
      {...props}
    />
  );
}

function ArtworkLoader({
  src,
  localSrc,
  trackId,
  alt = '',
  className = '',
  isDataSaver = false,
  loading = 'lazy',
}: Props) {
  const candidates = getArtworkCandidates(src, trackId, localSrc, isDataSaver);
  // Last resort: this PC's server fetches (and caches) the cover itself.
  if (trackId && /^[\w-]{11}$/.test(trackId)) {
    const proxied = getApiUrl(`/api/artwork/${trackId}`);
    if (!candidates.includes(proxied)) candidates.push(proxied);
  }
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const candidate = candidates[index];
  const next = () => { setLoaded(false); setIndex((previous) => previous + 1); };

  // Skip a source that hangs (no load, no error) instead of waiting on it forever.
  useEffect(() => {
    if (!candidate || loaded || loading === 'lazy') return;
    const timer = window.setTimeout(next, STALL_MS);
    return () => window.clearTimeout(timer);
  }, [candidate, loaded, loading]);

  return (
    <span
      className={`relative block w-full h-full overflow-hidden bg-zinc-900 ${className}`}
      data-artwork-state={candidate ? (loaded ? 'image' : 'loading') : 'unavailable'}
    >
      {/* Placeholder underneath until a real image has loaded: never a broken-image box or alt text. */}
      {!loaded && (
        <span
          role={!candidate && alt ? 'img' : undefined}
          aria-label={!candidate && alt ? `${alt} — artwork unavailable` : undefined}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#321321] to-zinc-900 text-rose-300/60"
        >
          <Music2 className="w-1/3 h-1/3 max-w-10 max-h-10" />
        </span>
      )}
      {candidate && (
        <img
          key={candidate}
          src={candidate}
          alt={alt}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth < 32 || event.currentTarget.naturalHeight < 32) next();
            else setLoaded(true);
          }}
          onError={next}
          className={`relative w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}
