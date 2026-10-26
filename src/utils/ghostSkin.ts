// src/utils/ghostSkin.ts
// GhostSkin: Adaptive Visual Engine for Song-Specific Worlds

export type SkinArchetype = 
  | 'editorial' 
  | 'expressive_handwritten' 
  | 'kinetic_bold' 
  | 'minimal_spacious' 
  | 'dreamy_floating' 
  | 'gritty_noir';

export interface GhostSkinProfile {
  id: string;
  trackTitle: string;
  artist: string;
  archetype: SkinArchetype;

  colors: {
    primary: string;           // Main dominant color (hex or rgb)
    secondary: string;         // Harmonic secondary accent
    accent: string;            // Vibrant focal color (waveform, active buttons)
    glow: string;              // Ambient glow (rgba)
    ambient: string;           // Diffuse backlight (rgba)
    surface: string;           // Glass card surfaces (rgba)
    border: string;            // Border stroke (rgba)
    cardGlow: string;          // Box shadow for artwork card
    textActive: string;        // Active lyric color
    textActiveGradient?: string; // Optional rich gradient for active lyric
    textSubdued: string;       // Color for previous/upcoming lyrics
    dockWaveform: string;      // Scrubber fill color
    dockButtonBg: string;      // Play/Pause button background
    dockButtonText: string;    // Play/Pause button text/icon color
  };

  lighting: {
    glowSize: string;          // CSS dimension (e.g. '50vw')
    glowBlur: string;          // CSS blur (e.g. '130px')
    glowPosition: 'center' | 'left' | 'right' | 'split';
    vignette: string;          // Gradient string for radial darkening
    backlightRays: boolean;    // Radial light flare
    bloomOpacity: number;      // 0.15 - 0.55
  };

  texture: {
    style: 'none' | 'grit' | 'film_grain' | 'smoke' | 'stars' | 'tape';
    opacity: number;
    accentFlourish?: 'none' | 'brush_slash' | 'crown_doodle' | 'sparkle' | 'wave_underline';
    flourishColor?: string;
  };

  lyrics: {
    archetype: SkinArchetype;
    fontFamily: string;
    fontWeight: number | string;
    fontClass: string;
    fontSizeDesktop: string;
    fontSizeMobile: string;
    letterSpacing: string;
    lineHeight: string;
    textTransform?: 'none' | 'uppercase';
    textShadow: string;
    activeAnimation: string;
  };

  artworkFrame: {
    style: 'glass' | 'neon_rim' | 'noir_stark' | 'minimal';
    border: string;
    boxShadow: string;
  };
}

// Memory cache of extracted profiles by track ID / key
export const ghostSkinCache = new Map<string, GhostSkinProfile>();

// Simple string hash for deterministic fallback variety
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Derives a complete, deterministic GhostSkinProfile from track metadata and artwork analysis.
 */
export async function deriveGhostSkinProfile(
  artworkUrl?: string | null,
  trackId?: string,
  title?: string,
  artist?: string
): Promise<GhostSkinProfile> {
  const safeId = trackId || `${title || 'unknown'}__${artist || 'unknown'}`;
  const cacheKey = safeId;

  if (ghostSkinCache.has(cacheKey)) {
    return ghostSkinCache.get(cacheKey)!;
  }

  const safeTitle = title || 'Unknown Title';
  const safeArtist = artist || 'Unknown Artist';
  const seed = hashString(`${safeId}__${safeTitle}__${safeArtist}`);

  // Default fallback profile based on seed
  const fallback = createDeterministicProfile(safeId, safeTitle, safeArtist, seed);

  if (!artworkUrl || typeof window === 'undefined') {
    ghostSkinCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const profile = await new Promise<GhostSkinProfile>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timer = setTimeout(() => {
        resolve(fallback);
      }, 1800);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const size = 32;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(fallback);
            return;
          }

          ctx.drawImage(img, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size).data;

          let rTotal = 0, gTotal = 0, bTotal = 0, satTotal = 0, lumTotal = 0;
          let validPixels = 0;

          // 12 Hue buckets (every 30 degrees)
          const hueBuckets = Array.from({ length: 12 }, () => ({
            count: 0,
            weight: 0,
            rSum: 0,
            gSum: 0,
            bSum: 0
          }));

          for (let i = 0; i < imageData.length; i += 4) {
            const r = imageData[i];
            const g = imageData[i + 1];
            const b = imageData[i + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const l = (max + min) / 510;
            const sat = max === min ? 0 : (max - min) / (l > 0.5 ? (510 - max - min) : (max + min));

            rTotal += r;
            gTotal += g;
            bTotal += b;
            satTotal += sat;
            lumTotal += l;
            validPixels++;

            if (sat >= 0.15 && l >= 0.12 && l <= 0.88) {
              let h = 0;
              if (max === min) {
                h = 0;
              } else if (max === r) {
                h = (60 * ((g - b) / (max - min)) + 360) % 360;
              } else if (max === g) {
                h = (60 * ((b - r) / (max - min)) + 120) % 360;
              } else {
                h = (60 * ((r - g) / (max - min)) + 240) % 360;
              }

              const bIdx = Math.floor(h / 30) % 12;
              const weight = sat * Math.sin(l * Math.PI);
              hueBuckets[bIdx].count++;
              hueBuckets[bIdx].weight += weight;
              hueBuckets[bIdx].rSum += r;
              hueBuckets[bIdx].gSum += g;
              hueBuckets[bIdx].bSum += b;
            }
          }

          const avgSat = validPixels > 0 ? satTotal / validPixels : 0;
          const avgLum = validPixels > 0 ? lumTotal / validPixels : 0;

          // Find dominant hue bucket
          let bestIdx = -1;
          let bestWeight = 0;
          for (let b = 0; b < 12; b++) {
            if (hueBuckets[b].weight > bestWeight) {
              bestWeight = hueBuckets[b].weight;
              bestIdx = b;
            }
          }

          const dominantHue = bestIdx !== -1 ? bestIdx * 30 + 15 : (seed % 360);
          const dominantR = bestIdx !== -1 && hueBuckets[bestIdx].count > 0 
            ? Math.round(hueBuckets[bestIdx].rSum / hueBuckets[bestIdx].count) 
            : Math.round(rTotal / validPixels);
          const dominantG = bestIdx !== -1 && hueBuckets[bestIdx].count > 0 
            ? Math.round(hueBuckets[bestIdx].gSum / hueBuckets[bestIdx].count) 
            : Math.round(gTotal / validPixels);
          const dominantB = bestIdx !== -1 && hueBuckets[bestIdx].count > 0 
            ? Math.round(hueBuckets[bestIdx].bSum / hueBuckets[bestIdx].count) 
            : Math.round(bTotal / validPixels);

          const profile = buildProfileFromPhysics({
            id: safeId,
            title: safeTitle,
            artist: safeArtist,
            dominantHue,
            r: dominantR,
            g: dominantG,
            b: dominantB,
            avgSat,
            avgLum,
            seed
          });

          resolve(profile);
        } catch {
          resolve(fallback);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(fallback);
      };

      img.src = artworkUrl;
    });

    ghostSkinCache.set(cacheKey, profile);
    return profile;
  } catch {
    ghostSkinCache.set(cacheKey, fallback);
    return fallback;
  }
}

/**
 * Builds an authentic, rich GhostSkin profile by combining artwork color physics
 * with song mood, title semantics, and deterministic variation.
 */
function buildProfileFromPhysics(params: {
  id: string;
  title: string;
  artist: string;
  dominantHue: number;
  r: number;
  g: number;
  b: number;
  avgSat: number;
  avgLum: number;
  seed: number;
}): GhostSkinProfile {
  const { id, title, artist, dominantHue, r, g, b, avgSat, avgLum, seed } = params;
  const lowerTitle = title.toLowerCase();
  const lowerArtist = artist.toLowerCase();

  // 1. Archetype Classification (determines subtle frame & atmosphere, lyrics always remain refined serif)
  const isMonochrome = avgSat < 0.22 && (avgLum < 0.35 || avgLum > 0.65);
  const isNoirTrack = lowerTitle.includes('survivor') || lowerTitle.includes('fire') || (lowerArtist.includes('kweku') && lowerTitle.includes('survivor')) || isMonochrome;

  let archetype: SkinArchetype = 'editorial';
  if (isNoirTrack) {
    archetype = 'gritty_noir';
  } else if (dominantHue >= 260 && dominantHue <= 330) {
    archetype = 'dreamy_floating';
  } else if (dominantHue >= 85 && dominantHue <= 175) {
    archetype = 'minimal_spacious';
  } else if (dominantHue >= 335 || dominantHue <= 25) {
    archetype = 'kinetic_bold';
  } else {
    archetype = 'editorial';
  }

  // 2. Song-driven artwork color extraction (no forced yellow, blue or orange)
  let primary: string;
  let secondary: string;
  let accent: string;
  let glow: string;
  let ambient: string;
  let surface: string;
  let border: string;
  let cardGlow: string;
  let dockWaveform: string;
  let dockButtonBg: string;
  let dockButtonText: string;

  if (isMonochrome) {
    // Elegant monochrome / silver-noir world derived from black-and-white photography
    primary = '#e4e4e7';
    secondary = '#a1a1aa';
    accent = '#ffffff';
    glow = 'rgba(255, 255, 255, 0.12)';
    ambient = 'rgba(255, 255, 255, 0.08)';
    surface = 'rgba(18, 18, 22, 0.72)';
    border = 'rgba(255, 255, 255, 0.18)';
    cardGlow = '0 0 50px rgba(255, 255, 255, 0.08)';
    dockWaveform = '#e4e4e7';
    dockButtonBg = '#ffffff';
    dockButtonText = '#000000';
  } else {
    // Dynamic color harmony derived directly from artwork pixel analysis
    primary = `rgb(${r}, ${g}, ${b})`;
    const satPct = Math.min(85, Math.max(45, Math.round(avgSat * 100)));
    const lumPct = Math.min(65, Math.max(45, Math.round(avgLum * 100)));
    accent = `hsl(${dominantHue}, ${satPct}%, ${Math.min(72, lumPct + 10)}%)`;
    secondary = `hsl(${(dominantHue + 25) % 360}, ${Math.max(35, satPct - 15)}%, ${lumPct}%)`;
    glow = `rgba(${r}, ${g}, ${b}, 0.28)`;
    ambient = `rgba(${r}, ${g}, ${b}, 0.18)`;
    surface = `rgba(${Math.max(10, Math.round(r * 0.10))}, ${Math.max(10, Math.round(g * 0.10))}, ${Math.max(14, Math.round(b * 0.10))}, 0.72)`;
    border = `rgba(${r}, ${g}, ${b}, 0.24)`;
    cardGlow = `0 0 50px rgba(${r}, ${g}, ${b}, 0.26)`;
    dockWaveform = accent;
    dockButtonBg = accent;
    dockButtonText = lumPct > 55 ? '#000000' : '#ffffff';
  }

  // 3. Snooze-Inspired Refined Serif Lyrics Design System (Shared across ALL songs)
  const textActive = '#ffffff';
  const textActiveGradient = undefined;
  const textSubdued = 'rgba(255, 255, 255, 0.60)';

  const fontFamily = '"Playfair Display", Georgia, serif';
  const fontWeight = 600;
  const fontClass = 'font-serif';
  const fontSizeDesktop = 'clamp(2.1rem, 3.8vw, 3.6rem)';
  const fontSizeMobile = 'clamp(1.5rem, 6.0vw, 2.1rem)';
  const letterSpacing = '-0.015em';
  const lineHeight = '1.22';
  const textTransform: 'none' | 'uppercase' = 'none';
  const textShadow = '0 2px 20px rgba(0, 0, 0, 0.85)';
  const activeAnimation = 'animate-lyric-rise';

  // No decorative underlines, crowns, brush slashes or scribbles
  const accentFlourish: 'none' = 'none';
  const flourishColor = undefined;

  // Atmospheric lighting and frame
  const lightingGlowPosition: 'center' | 'left' | 'right' | 'split' = seed % 2 === 0 ? 'split' : 'center';
  const backlightRays = false;
  const bloomOpacity = isMonochrome ? 0.20 : 0.34;
  const textureStyle: 'none' | 'grit' | 'film_grain' | 'smoke' | 'stars' | 'tape' = 'none';
  const textureOpacity = 0.12;

  const frameStyle: 'glass' | 'neon_rim' | 'noir_stark' | 'minimal' = isMonochrome ? 'noir_stark' : 'glass';
  const frameBorder = isMonochrome 
    ? '1px solid rgba(255, 255, 255, 0.25)' 
    : `1.5px solid ${border}`;
  const frameBoxShadow = `0 25px 65px rgba(0, 0, 0, 0.85), ${cardGlow}`;

  return {
    id,
    trackTitle: title,
    artist,
    archetype,
    colors: {
      primary,
      secondary,
      accent,
      glow,
      ambient,
      surface,
      border,
      cardGlow,
      textActive,
      textActiveGradient,
      textSubdued,
      dockWaveform,
      dockButtonBg,
      dockButtonText
    },
    lighting: {
      glowSize: '55vw',
      glowBlur: '130px',
      glowPosition: lightingGlowPosition,
      vignette: 'radial-gradient(ellipse at center, transparent 35%, rgba(6,6,8,0.92) 100%)',
      backlightRays,
      bloomOpacity
    },
    texture: {
      style: textureStyle,
      opacity: textureOpacity,
      accentFlourish,
      flourishColor
    },
    lyrics: {
      archetype,
      fontFamily,
      fontWeight,
      fontClass,
      fontSizeDesktop,
      fontSizeMobile,
      letterSpacing,
      lineHeight,
      textTransform,
      textShadow,
      activeAnimation
    },
    artworkFrame: {
      style: frameStyle,
      border: frameBorder,
      boxShadow: frameBoxShadow
    }
  };
}

/**
 * Creates a deterministic profile when artwork image data is not available.
 */
export function createDeterministicProfile(
  id: string,
  title: string,
  artist: string,
  seed: number
): GhostSkinProfile {
  const hues = [198, 42, 305, 345, 160, 215];
  const domHue = hues[seed % hues.length];
  return buildProfileFromPhysics({
    id,
    title,
    artist,
    dominantHue: domHue,
    r: Math.round(128 + 127 * Math.cos((domHue * Math.PI) / 180)),
    g: Math.round(128 + 127 * Math.cos(((domHue - 120) * Math.PI) / 180)),
    b: Math.round(128 + 127 * Math.cos(((domHue + 120) * Math.PI) / 180)),
    avgSat: 0.5,
    avgLum: 0.5,
    seed
  });
}

/**
 * Returns a fallback GhostSkin profile immediately while async derivation runs.
 */
export function getFallbackGhostSkin(
  trackId?: string,
  title?: string,
  artist?: string
): GhostSkinProfile {
  const safeId = trackId || 'default';
  const safeTitle = title || 'Unknown Title';
  const safeArtist = artist || 'Unknown Artist';
  const seed = hashString(`${safeId}__${safeTitle}__${safeArtist}`);
  return createDeterministicProfile(safeId, safeTitle, safeArtist, seed);
}
