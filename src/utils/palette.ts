// src/utils/palette.ts
// Artwork-driven, restrained, cinematic adaptive lighting with tasteful color normalization

export interface TrackPalette {
  primary: string;       // Subtle primary accent
  accent: string;        // Secondary harmonic tone
  dark: string;          // Deep neutral dark tone
  ambient: string;       // Soft, low-opacity diffuse glow (never muddy)
  glow: string;          // Restrained halo tint
  textAccent: string;    // Clean high-contrast accent tint
  inkGradient: string;   // Tasteful gradient for timelines and badges
  hue: number;           // Normalized hue (0 - 360)
}

// Curated reference palettes adhering strictly to the Lil Uzi Vert quality benchmark:
// clean, dark, atmospheric, never oversaturated or muddy.
const DEFAULT_PALETTES: Record<string, TrackPalette> = {
  // Quality benchmark: Lil Uzi Vert - Cool cyan & electric blue
  'lil_uzi_ref': {
    primary: '#0ea5e9',
    accent: '#38bdf8',
    dark: '#03070d',
    ambient: 'rgba(14, 165, 233, 0.12)',
    glow: 'rgba(14, 165, 233, 0.22)',
    textAccent: '#7dd3fc',
    inkGradient: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
    hue: 198
  },
  // The Weeknd - Timeless (Deep Crimson & Slate)
  'a4O-abCXsfA': {
    primary: '#e11d48',
    accent: '#fb7185',
    dark: '#0c0205',
    ambient: 'rgba(225, 29, 72, 0.12)',
    glow: 'rgba(225, 29, 72, 0.22)',
    textAccent: '#fca5a5',
    inkGradient: 'linear-gradient(135deg, #fb7185 0%, #e11d48 100%)',
    hue: 345
  },
  // The Weeknd - Starboy (Neon Crimson & Cyan Violet)
  '3_g2un5M350': {
    primary: '#6366f1',
    accent: '#38bdf8',
    dark: '#05040f',
    ambient: 'rgba(99, 102, 241, 0.12)',
    glow: 'rgba(99, 102, 241, 0.22)',
    textAccent: '#a5b4fc',
    inkGradient: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
    hue: 235
  },
  // SZA - Snooze (Oceanic Azure)
  'ZqSlV5LmrTg': {
    primary: '#0284c7',
    accent: '#38bdf8',
    dark: '#02060b',
    ambient: 'rgba(2, 132, 199, 0.12)',
    glow: 'rgba(2, 132, 199, 0.22)',
    textAccent: '#7dd3fc',
    inkGradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
    hue: 200
  },
  // Burna Boy / Afrobeats: Soft warm champagne & muted gold (NOT harsh yellow or muddy orange)
  '3az-NQCK57c': {
    primary: '#d97706',
    accent: '#f59e0b',
    dark: '#0b0702',
    ambient: 'rgba(217, 119, 6, 0.10)',
    glow: 'rgba(217, 119, 6, 0.18)',
    textAccent: '#fef3c7',
    inkGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    hue: 40
  },
  // Taylor Swift - Cruel Summer (Soft Blush Rose)
  'aC9HkZW2hZk': {
    primary: '#db2777',
    accent: '#f472b6',
    dark: '#0b0207',
    ambient: 'rgba(219, 39, 119, 0.12)',
    glow: 'rgba(219, 39, 119, 0.22)',
    textAccent: '#fbcfe8',
    inkGradient: 'linear-gradient(135deg, #f472b6 0%, #db2777 100%)',
    hue: 330
  },
  // Travis Scott - FEIN (Smoky Slate & Copper)
  '2nR1zrNzgcY': {
    primary: '#c2410c',
    accent: '#ea580c',
    dark: '#0b0401',
    ambient: 'rgba(194, 65, 12, 0.10)',
    glow: 'rgba(194, 65, 12, 0.18)',
    textAccent: '#fed7aa',
    inkGradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    hue: 20
  }
};

/**
 * Normalizes an HSL hue and saturation to avoid muddy yellows and harsh neon washes.
 * Yellows (35-65 deg) are softened into elegant warm champagne/ivory or paired with cool slate.
 */
function normalizeHueAndSat(rawHue: number, rawSat: number, rawLightness: number) {
  let hue = rawHue;
  let sat = Math.min(0.70, Math.max(0.35, rawSat)); // Cap saturation to prevent neon/muddy wash
  let l = Math.min(0.65, Math.max(0.48, rawLightness));

  // If hue is in the yellow/orange band (35 - 65 deg):
  // Desaturate significantly to avoid sickening yellow/greenish muddy cast
  if (hue >= 35 && hue <= 68) {
    sat = Math.min(sat, 0.42); // Soft warm champagne / cream tone
    l = Math.max(l, 0.58);
  }

  return { hue, sat, l };
}

/**
 * Deterministic hash-based palette generator for arbitrary tracks.
 */
export function getFallbackPalette(id?: string, title?: string, artist?: string): TrackPalette {
  if (id && DEFAULT_PALETTES[id]) {
    return DEFAULT_PALETTES[id];
  }

  const normTitle = (title || '').toLowerCase();
  const normArtist = (artist || '').toLowerCase();

  // If artist/title references Lil Uzi Vert or cyan/blue
  if (normArtist.includes('uzi') || normTitle.includes('uzi') || normTitle.includes('cyan') || normTitle.includes('blue')) {
    return DEFAULT_PALETTES['lil_uzi_ref'];
  }

  // Generate pleasant, balanced HSL values from string hash
  const str = `${id || ''}-${title || ''}-${artist || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const rawHue = Math.abs(hash % 360);
  const { hue, sat, l } = normalizeHueAndSat(rawHue, 0.65, 0.55);
  const hueAccent = (hue + 25) % 360;

  const satPct = Math.round(sat * 100);
  const lPct = Math.round(l * 100);

  const primary = `hsl(${hue}, ${satPct}%, ${lPct}%)`;
  const accent = `hsl(${hueAccent}, ${satPct}%, ${Math.min(75, lPct + 10)}%)`;
  const textAccent = `hsl(${hue}, ${Math.max(25, satPct - 20)}%, 82%)`; // Soft, crystal clear
  const dark = `hsl(${hue}, 20%, 3%)`;
  const ambient = `hsla(${hue}, ${satPct}%, ${lPct}%, 0.11)`;
  const glow = `hsla(${hue}, ${satPct}%, ${lPct}%, 0.20)`;
  const inkGradient = `linear-gradient(135deg, ${accent} 0%, ${primary} 100%)`;

  return { primary, accent, dark, ambient, glow, textAccent, inkGradient, hue };
}

// In-memory cache to prevent repeated canvas work for the same image/track
const paletteCache = new Map<string, TrackPalette>();

/**
 * Adjusts ambient and glow intensity according to the user's appearance setting.
 */
export function applyGlowSettings(palette: TrackPalette, intensity: 'vibrant' | 'subtle' | 'none'): TrackPalette {
  if (intensity === 'none') {
    return {
      ...palette,
      ambient: 'transparent',
      glow: 'transparent'
    };
  }

  if (intensity === 'subtle') {
    return {
      ...palette,
      ambient: palette.ambient.replace(/[\d.]+\)$/, '0.05)'),
      glow: palette.glow.replace(/[\d.]+\)$/, '0.09)')
    };
  }

  return palette;
}

/**
 * Extract dominant vibrant colours from an image URL using an offscreen canvas.
 * Filters out muddy browns, sick yellows, and dark backgrounds.
 * Normalizes tones into clean, cinematic, tasteful accents.
 */
export async function extractArtworkPalette(
  imageUrl?: string, 
  trackId?: string, 
  title?: string,
  artist?: string
): Promise<TrackPalette> {
  const cacheKey = imageUrl || trackId || title || 'default';
  if (paletteCache.has(cacheKey)) {
    return paletteCache.get(cacheKey)!;
  }

  const fallback = getFallbackPalette(trackId, title, artist);

  if (!imageUrl || typeof window === 'undefined') {
    paletteCache.set(cacheKey, fallback);
    return fallback;
  }

  try {
    const palette = await new Promise<TrackPalette>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timer = setTimeout(() => {
        resolve(fallback);
      }, 1200);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(fallback);
            return;
          }

          const size = 48;
          canvas.width = size;
          canvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);

          const imageData = ctx.getImageData(0, 0, size, size).data;

          // 12 hue buckets (every 30 degrees)
          interface Bucket {
            count: number;
            weight: number;
            rSum: number;
            gSum: number;
            bSum: number;
          }

          const buckets: Bucket[] = Array.from({ length: 12 }, () => ({
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

            // Discard near-black, near-white, or desaturated pixels
            if (sat < 0.24 || l < 0.18 || l > 0.85) {
              continue;
            }

            // Calculate hue (0 - 360)
            let hue = 0;
            if (max === min) {
              hue = 0;
            } else if (max === r) {
              hue = (60 * ((g - b) / (max - min)) + 360) % 360;
            } else if (max === g) {
              hue = (60 * ((b - r) / (max - min)) + 120) % 360;
            } else {
              hue = (60 * ((r - g) / (max - min)) + 240) % 360;
            }

            const bucketIdx = Math.floor(hue / 30) % 12;

            // Reduce weight of yellow/muddy orange bucket (bucket 1 = 30-60 deg)
            // to prioritize richer jewel tones, blues, cyans, crimsons, or teals
            let weight = sat * Math.sin(l * Math.PI);
            if (bucketIdx === 1) {
              weight *= 0.35; // Downweight muddy yellow
            }

            buckets[bucketIdx].count++;
            buckets[bucketIdx].weight += weight;
            buckets[bucketIdx].rSum += r;
            buckets[bucketIdx].gSum += g;
            buckets[bucketIdx].bSum += b;
          }

          // Find the dominant hue bucket
          let bestIdx = -1;
          let bestWeight = 0;
          for (let b = 0; b < 12; b++) {
            if (buckets[b].weight > bestWeight) {
              bestWeight = buckets[b].weight;
              bestIdx = b;
            }
          }

          if (bestIdx === -1 || bestWeight < 1.5) {
            resolve(fallback);
            return;
          }

          let primaryR = Math.round(buckets[bestIdx].rSum / buckets[bestIdx].count);
          let primaryG = Math.round(buckets[bestIdx].gSum / buckets[bestIdx].count);
          let primaryB = Math.round(buckets[bestIdx].bSum / buckets[bestIdx].count);

          const domHue = bestIdx * 30 + 15;

          // If the dominant color is yellow/amber, soften it into champagne/warm silver
          if (domHue >= 35 && domHue <= 68) {
            // Mix with subtle warm ivory/white to prevent dirty yellow wash
            primaryR = Math.round(primaryR * 0.70 + 230 * 0.30);
            primaryG = Math.round(primaryG * 0.65 + 215 * 0.35);
            primaryB = Math.round(primaryB * 0.50 + 190 * 0.50);
          }

          // Subtle secondary harmonic
          let secIdx = -1;
          let secWeight = 0;
          for (let b = 0; b < 12; b++) {
            if (b !== bestIdx && buckets[b].weight > secWeight) {
              secWeight = buckets[b].weight;
              secIdx = b;
            }
          }

          let secR = Math.min(255, Math.round(primaryR * 0.88 + 25));
          let secG = Math.min(255, Math.round(primaryG * 0.88 + 35));
          let secB = Math.min(255, Math.round(primaryB * 0.88 + 45));

          if (secIdx !== -1 && buckets[secIdx].count > 0 && secWeight > bestWeight * 0.30) {
            secR = Math.round(buckets[secIdx].rSum / buckets[secIdx].count);
            secG = Math.round(buckets[secIdx].gSum / buckets[secIdx].count);
            secB = Math.round(buckets[secIdx].bSum / buckets[secIdx].count);
          }

          const primary = `rgb(${primaryR}, ${primaryG}, ${primaryB})`;
          const accent = `rgb(${secR}, ${secG}, ${secB})`;
          const dark = '#07070a'; // Keep base background consistently dark, clean & cinematic
          const ambient = `rgba(${primaryR}, ${primaryG}, ${primaryB}, 0.11)`; // Very low opacity, diffuse
          const glow = `rgba(${primaryR}, ${primaryG}, ${primaryB}, 0.20)`;

          // Soft, crystal-clear text highlight with guaranteed high contrast against dark backdrops
          const textR = Math.min(255, Math.round(primaryR * 0.40 + 255 * 0.60));
          const textG = Math.min(255, Math.round(primaryG * 0.40 + 255 * 0.60));
          const textB = Math.min(255, Math.round(primaryB * 0.40 + 255 * 0.60));
          const textAccent = `rgb(${textR}, ${textG}, ${textB})`;

          const inkGradient = `linear-gradient(135deg, rgb(${secR}, ${secG}, ${secB}) 0%, rgb(${primaryR}, ${primaryG}, ${primaryB}) 100%)`;

          resolve({
            primary,
            accent,
            dark,
            ambient,
            glow,
            textAccent,
            inkGradient,
            hue: domHue
          });
        } catch {
          resolve(fallback);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(fallback);
      };

      img.src = imageUrl;
    });

    paletteCache.set(cacheKey, palette);
    return palette;
  } catch {
    paletteCache.set(cacheKey, fallback);
    return fallback;
  }
}
