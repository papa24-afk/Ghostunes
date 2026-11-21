import { Track } from '../types';

/** Recent search words and songs played from search (shown under the search bar), kept on this PC. */
const QUERIES_KEY = 'ghosttunes_recent_searches';
const PLAYS_KEY = 'ghosttunes_recent_search_plays';
const MAX_QUERIES = 10;
const MAX_PLAYS = 15;

function read<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function getRecentQueries(): string[] {
  return read<string>(QUERIES_KEY).filter(q => typeof q === 'string' && q.trim());
}

export function getRecentPlays(): Track[] {
  return read<Track>(PLAYS_KEY).filter(t => t && typeof t.id === 'string');
}

export function addRecentQuery(query: string) {
  const q = query.trim();
  if (!q) return;
  const rest = getRecentQueries().filter(x => x.toLocaleLowerCase() !== q.toLocaleLowerCase());
  write(QUERIES_KEY, [q, ...rest].slice(0, MAX_QUERIES));
}

export function addRecentPlay(track: Track) {
  if (!track?.id) return;
  // Keep only what the card needs (no local file paths or large fields).
  const slim: Track = {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    durationSeconds: track.durationSeconds,
    thumbnail: track.thumbnail,
  } as Track;
  const rest = getRecentPlays().filter(t => t.id !== track.id);
  write(PLAYS_KEY, [slim, ...rest].slice(0, MAX_PLAYS));
}

export function removeRecentQuery(query: string) {
  write(QUERIES_KEY, getRecentQueries().filter(q => q !== query));
}

export function clearRecentQueries() {
  write(QUERIES_KEY, []);
}

export function clearRecentPlays() {
  write(PLAYS_KEY, []);
}
