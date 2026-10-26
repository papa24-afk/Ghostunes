// src/components/ArtistAvatar.tsx
import React, { useState, useEffect } from 'react';

interface ArtistAvatarProps {
  name: string;
  src?: string | null;
  size?: number | string; // e.g. 40 or 'w-10 h-10'
  className?: string;
}

export const ArtistAvatar: React.FC<ArtistAvatarProps> = ({
  name,
  src,
  size = 40,
  className = ''
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset state when src or artist changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src, name]);

  const initials = (name || 'Artist')
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || (name || 'AR').slice(0, 2).toUpperCase() || 'AR';

  const showImage = Boolean(src) && !hasError;
  const sizeStyle = typeof size === 'number' ? { width: `${size}px`, height: `${size}px` } : undefined;
  const sizeClass = typeof size === 'string' ? size : '';

  return (
    <div
      style={sizeStyle}
      className={`relative rounded-full overflow-hidden bg-zinc-800 border border-white/[0.08] flex-shrink-0 select-none ${sizeClass} ${className}`}
    >
      {showImage && (
        <img
          src={src!}
          alt={name}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
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
