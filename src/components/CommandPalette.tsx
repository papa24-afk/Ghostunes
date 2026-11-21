import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, ListMusic, Music2, Search, Zap } from 'lucide-react';
import { Playlist, Track } from '../types';
import { getApiUrl } from '../utils/api';
import { Artwork } from './Artwork';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

type Item =
  | { kind: 'action'; key: string; action: PaletteAction }
  | { kind: 'playlist'; key: string; playlist: Playlist }
  | { kind: 'song'; key: string; track: Track; list: Track[] };

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

/**
 * Ctrl+K: one box to play any song, open a playlist, or run an action (go to a page, play/pause,
 * sleep timer...). Arrow keys to move, Enter to choose, Esc to close.
 */
export function CommandPalette({
  open,
  onClose,
  actions,
  playlists,
  onPlayTrack,
  onOpenPlaylist,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  playlists: Playlist[];
  onPlayTrack: (track: Track) => void;
  onOpenPlaylist: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSongs([]);
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  // Songs from the same search the app uses, after a short pause in typing.
  useEffect(() => {
    const q = query.trim();
    setSongs([]); // never show (or pick with Enter) results for an older query
    if (!open || q.length < 2) { setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(getApiUrl(`/api/search?q=${encodeURIComponent(q)}`), { signal: controller.signal });
        const data = await res.json();
        const list: Track[] = (data.results || data.tracks || []).slice(0, 6);
        setSongs(list);
      } catch {}
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, open]);

  const items: Item[] = useMemo(() => {
    const q = norm(query.trim());
    const matches = (text: string) => !q || norm(text).includes(q);
    const acts = actions.filter(a => matches(`${a.label} ${a.keywords || ''}`)).slice(0, q ? 5 : 8);
    const pls = q ? playlists.filter(p => matches(p.name || p.title || '')).slice(0, 4) : [];
    // Matching actions and playlists first (they're instant), then songs.
    return [
      ...(q ? acts.map(a => ({ kind: 'action' as const, key: `a-${a.id}`, action: a })) : []),
      ...pls.map(p => ({ kind: 'playlist' as const, key: `p-${p.id}`, playlist: p })),
      ...songs.map((t, i) => ({ kind: 'song' as const, key: `s-${t.id}-${i}`, track: t, list: songs })),
      ...(q ? [] : acts.map(a => ({ kind: 'action' as const, key: `a-${a.id}`, action: a }))),
    ];
  }, [query, songs, playlists, actions]);

  useEffect(() => { setActive(a => Math.min(a, Math.max(0, items.length - 1))); }, [items.length]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    if (item.kind === 'action') item.action.run();
    else if (item.kind === 'playlist') onOpenPlaylist(item.playlist.id);
    else onPlayTrack(item.track);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
  };

  const section = (i: number) => {
    const kind = items[i].kind;
    if (i > 0 && items[i - 1].kind === kind) return null;
    const title = kind === 'song' ? 'Songs' : kind === 'playlist' ? 'Your playlists' : 'Actions';
    return <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</p>;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-[min(640px,92vw)] rounded-2xl bg-[#121215] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
        role="dialog"
        aria-label="Quick search"
      >
        <div className="flex items-center gap-3 px-4 border-b border-white/10">
          <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Play a song, open a playlist, or do something…"
            className="flex-1 bg-transparent py-4 text-[15px] text-white placeholder-zinc-500 outline-none"
            aria-label="Quick search"
          />
          {loading && <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-[#e0536c] animate-spin" />}
          <kbd className="text-[10px] text-zinc-500 border border-white/10 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto pb-2">
          {items.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-500 text-center">{loading ? 'Searching…' : 'Nothing found.'}</p>
          )}
          {items.map((item, i) => (
            <React.Fragment key={item.key}>
              {section(i)}
              <button
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(item)}
                className={`w-full flex items-center gap-3 px-3 py-2 mx-0 text-left cursor-pointer ${i === active ? 'bg-white/[0.07]' : ''}`}
              >
                {item.kind === 'song' ? (
                  <span className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0">
                    <Artwork src={item.track.thumbnail} trackId={item.track.id} alt="" loading="eager" />
                  </span>
                ) : (
                  <span className="w-9 h-9 rounded-md bg-white/5 flex items-center justify-center flex-shrink-0">
                    {item.kind === 'playlist' ? <ListMusic className="w-4 h-4 text-[#e0536c]" /> : <Zap className="w-4 h-4 text-zinc-300" />}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white truncate">
                    {item.kind === 'song' ? item.track.title : item.kind === 'playlist' ? (item.playlist.name || item.playlist.title) : item.action.label}
                  </span>
                  <span className="block text-xs text-zinc-500 truncate">
                    {item.kind === 'song' ? [item.track.artist, item.track.duration].filter(Boolean).join(' · ')
                      : item.kind === 'playlist' ? `${item.playlist.tracks.length} songs`
                      : item.action.hint || ''}
                  </span>
                </span>
                {i === active && <CornerDownLeft className="w-4 h-4 text-zinc-500 flex-shrink-0" />}
                {item.kind === 'song' && i !== active && <Music2 className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-white/10 text-[11px] text-zinc-500">
          <span><kbd className="font-sans">↑↓</kbd> move</span>
          <span><kbd className="font-sans">Enter</kbd> choose</span>
          <span><kbd className="font-sans">Ctrl K</kbd> open anywhere</span>
        </div>
      </div>
    </div>
  );
}
