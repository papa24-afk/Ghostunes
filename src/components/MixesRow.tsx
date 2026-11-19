import React, { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { HistoryItem, Track } from '../types';
import { getApiUrl } from '../utils/api';
import { Artwork } from './Artwork';

/**
 * "Your mixes" (like YouTube Music's): a Supermix of your top artists, one mix per artist you play
 * most (that artist + similar artists), a Discover Mix (similar artists only) and genre mixes.
 * Each mix is the same smart radio the player uses; click a card to play the whole mix.
 */

type MixDef = {
  id: string;
  title: string;
  seed?: Track;
  /** Genre mixes find their seed song by searching. */
  genre?: string;
  mode: 'balanced' | 'similar';
  /** Supermix: blend of other mixes. */
  blendOf?: string[];
};

/** Each mood/genre mix grows (via the smart radio) from a well-known song that sets the vibe. */
const MOOD_SEEDS: Record<string, string> = {
  'Chill': 'Khalid Location',
  'Workout': 'Eminem Till I Collapse',
  'Party': 'Pitbull Give Me Everything',
  'Late Night': 'Frank Ocean Thinkin Bout You',
  'Afrobeats': 'Wizkid Essence',
  'Hip Hop': 'Kendrick Lamar HUMBLE',
  'R&B': 'Brent Faiyaz Dead Man Walking',
  'Amapiano': 'Uncle Waffles Tanzania',
  'Love Songs': 'Ed Sheeran Perfect',
  'Gospel': 'Maverick City Music Jireh',
  'Dancehall': 'Popcaan Family',
  'Throwback': 'Usher Yeah',
};
const MOODS_AND_GENRES = Object.keys(MOOD_SEEDS);
const TINTS = ['#e0536c', '#7c5cff', '#18b4a6', '#f59e0b', '#3b82f6', '#ec4899', '#22c55e', '#f97316', '#a855f7', '#06b6d4'];

const primaryArtist = (artist = '') => artist.split(/,|&| x | feat\.?| ft\.?/i)[0].trim();
const mixCache = new Map<string, Track[]>();

async function fetchRadio(seed: Track, mode: string): Promise<Track[]> {
  const key = `${seed.id}:${mode}`;
  if (mixCache.has(key)) return mixCache.get(key)!;
  const res = await fetch(getApiUrl(`/api/smart-radio?id=${encodeURIComponent(seed.id)}&title=${encodeURIComponent(seed.title)}&artist=${encodeURIComponent(seed.artist)}&mode=${mode}`));
  const data = await res.json();
  const tracks: Track[] = (data.tracks || []).map((t: any) => ({
    id: String(t.id),
    title: String(t.title || ''),
    artist: String(t.artist || ''),
    album: t.album ? String(t.album) : '',
    duration: t.duration ? String(t.duration) : '',
    durationSeconds: Number(t.durationSeconds) || 0,
    thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`,
  }));
  mixCache.set(key, tracks);
  return tracks;
}

async function genreSeed(genre: string): Promise<Track | undefined> {
  const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(MOOD_SEEDS[genre] || `${genre} hits`)}`));
  const data = await res.json();
  return (data.results || [])[0];
}

/** Interleave lists (a1, b1, c1, a2, b2...) without repeating a song. */
function blend(lists: Track[][]): Track[] {
  const out: Track[] = [];
  const seen = new Set<string>();
  const n = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < n; i++) for (const l of lists) {
    const t = l[i];
    if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); }
  }
  return out;
}

export function MixesRow({
  kind = 'personal',
  history,
  favorites,
  onPlay,
  isDataSaver = false,
}: {
  /** personal: Supermix + your artists + Discover. moods: mood & genre mixes. */
  kind?: 'personal' | 'moods';
  history: HistoryItem[];
  favorites: Track[];
  onPlay: (tracks: Track[]) => void;
  isDataSaver?: boolean;
}) {
  // Your top artists: favourites count double, recent plays count once.
  const defs: MixDef[] = useMemo(() => {
    if (kind === 'moods') return MOODS_AND_GENRES.map(g => ({ id: `genre:${g}`, title: `${g} Mix`, genre: g, mode: 'balanced' as const }));
    const score = new Map<string, { name: string; score: number; seed: Track }>();
    const add = (t: Track, w: number) => {
      const name = primaryArtist(t.artist);
      if (!name || /unknown/i.test(name)) return;
      const key = name.toLocaleLowerCase();
      const cur = score.get(key);
      if (cur) cur.score += w;
      else score.set(key, { name, score: w, seed: t });
    };
    history.slice(0, 300).forEach(h => h?.track && add(h.track, 1));
    favorites.forEach(t => add(t, 2));
    const top = [...score.values()].sort((a, b) => b.score - a.score).slice(0, 5);

    const list: MixDef[] = top.map(a => ({ id: `artist:${a.name}`, title: `${a.name} Mix`, seed: a.seed, mode: 'balanced' }));
    if (top.length >= 2) list.unshift({ id: 'supermix', title: 'Your Supermix', mode: 'balanced', blendOf: list.slice(0, 3).map(m => m.id) });
    const discoverSeed = favorites[0] || history[0]?.track;
    if (discoverSeed) list.push({ id: 'discover', title: 'Discover Mix', seed: discoverSeed, mode: 'similar' });
    return list;
    // Only rebuild when your top artists could have changed (not on every progress tick).
  }, [kind, history.length, history[0]?.track?.id, favorites.length]);

  const [mixes, setMixes] = useState<Record<string, Track[]>>({});

  useEffect(() => {
    let cancelled = false;
    const queue = defs.filter(d => !d.blendOf);
    let next = 0;
    // A few at a time so the page stays quick.
    const worker = async () => {
      while (!cancelled && next < queue.length) {
        const d = queue[next++];
        try {
          const seed = d.seed || (d.genre ? await genreSeed(d.genre) : undefined);
          if (!seed) continue;
          const radio = await fetchRadio(seed, d.mode);
          const tracks = [seed, ...radio.filter(t => t.id !== seed.id)];
          if (!cancelled && tracks.length > 1) setMixes(m => ({ ...m, [d.id]: tracks }));
        } catch {}
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [defs]);

  const ready = defs
    .map((d, i) => ({ def: d, tint: TINTS[i % TINTS.length], tracks: d.blendOf ? blend(d.blendOf.map(id => mixes[id] || [])) : mixes[d.id] }))
    .filter(m => m.tracks && m.tracks.length > 1);

  if (defs.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold text-white">{kind === 'moods' ? 'Mixes for every mood' : 'Your mixes'}</h2>
          <p className="text-xs text-zinc-400">{kind === 'moods' ? "Pick a vibe, we'll keep it going" : "Endless mixes of artists you love and ones you'll like"}</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none">
        {ready.length === 0 && defs.slice(0, 5).map(d => (
          <div key={d.id} className="w-[180px] flex-shrink-0">
            <div className="w-[180px] h-[180px] rounded-2xl bg-white/[0.04] animate-pulse" />
            <div className="mt-2 h-3 w-24 rounded bg-white/[0.05]" />
          </div>
        ))}
        {ready.map(({ def, tint, tracks }) => {
          const covers: Track[] = [];
          const seenArtists = new Set<string>();
          for (const t of tracks!) {
            const a = primaryArtist(t.artist).toLocaleLowerCase();
            if (!seenArtists.has(a)) { seenArtists.add(a); covers.push(t); }
            if (covers.length === 4) break;
          }
          while (covers.length < 4 && tracks![covers.length]) covers.push(tracks![covers.length]);
          const artists = [...new Set(tracks!.map(t => primaryArtist(t.artist)).filter(Boolean))].slice(0, 3);
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => onPlay(tracks!)}
              className="group w-[180px] flex-shrink-0 text-left cursor-pointer"
              title={`Play ${def.title}`}
            >
              <div className="relative w-[180px] h-[180px] rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/25 transition-colors shadow-lg">
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                  {covers.slice(0, 4).map(t => (
                    <Artwork key={t.id} src={t.thumbnail} trackId={t.id} alt="" isDataSaver={isDataSaver} />
                  ))}
                </div>
                <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${tint}f2 0%, ${tint}99 38%, transparent 75%)` }} />
                <div className="absolute left-3 right-3 bottom-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Mix</p>
                  <p className="text-lg font-extrabold leading-tight text-white drop-shadow line-clamp-2">{def.title.replace(/ Mix$/, '')}</p>
                </div>
                <span className="absolute right-3 top-3 w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-xl opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white truncate">{def.title}</p>
              <p className="text-xs text-zinc-400 line-clamp-2">{artists.join(', ')}{artists.length ? ' and more' : ''}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
