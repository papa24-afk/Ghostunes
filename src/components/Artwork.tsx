import React, { useState } from 'react';
import { Music2 } from 'lucide-react';
import { getArtworkCandidates } from '../utils/artwork';

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
  const [index, setIndex] = useState(0);
  const candidate = candidates[index];
  return (
    <span
      className={`relative block w-full h-full overflow-hidden bg-zinc-900 ${className}`}
      data-artwork-state={candidate ? 'image' : 'unavailable'}
    >
      {candidate ? (
        <img
          src={candidate}
          alt={alt}
          loading={loading}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            if (event.currentTarget.naturalWidth < 32 || event.currentTarget.naturalHeight < 32)
              setIndex((previous) => previous + 1);
          }}
          onError={() => setIndex((previous) => previous + 1)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          role={alt ? 'img' : undefined}
          aria-label={alt ? `${alt} — artwork unavailable` : undefined}
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#321321] to-zinc-900 text-rose-300/60"
        >
          <Music2 className="w-1/3 h-1/3 max-w-10 max-h-10" />
        </span>
      )}
    </span>
  );
}
