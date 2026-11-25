// Readers for the answers Spotify's own web player gets (its "pathfinder" queries). Spotify reshapes
// these now and then, so they look for what they need (a playlist's uri and name, a track's name,
// artists and length) wherever it sits instead of following one exact path. Same rules as the phone's
// SpotifyPathfinder.kt.
export const OPS = { PROFILE: 'profileAttributes', LIBRARY: 'libraryV3', LIKED: 'fetchLibraryTracks', PLAYLIST: 'fetchPlaylist', HOME: 'home' };

const str = (v) => (typeof v === 'string' ? v : null);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function walk(e, stop, visit) {
  if (Array.isArray(e)) e.forEach(x => walk(x, stop, visit));
  else if (isObj(e)) { if (stop(e)) visit(e); else Object.values(e).forEach(x => walk(x, stop, visit)); }
}

export function firstUrl(e) {
  let found = '';
  const go = (x) => {
    if (found) return;
    if (Array.isArray(x)) x.forEach(go);
    else if (isObj(x)) {
      if (typeof x.url === 'string' && x.url.startsWith('http')) { found = x.url; return; }
      Object.values(x).forEach(go);
    }
  };
  go(e);
  return found;
}

export function firstNumber(e, key) {
  const queue = e != null ? [e] : [];
  while (queue.length) {
    const x = queue.shift();
    if (Array.isArray(x)) queue.push(...x);
    else if (isObj(x)) {
      if (typeof x[key] === 'number') return x[key];
      queue.push(...Object.values(x));
    }
  }
  return null;
}

export function errors(e) {
  const first = Array.isArray(e?.errors) ? e.errors[0] : null;
  return first ? (str(first.message) || 'error') : null;
}

export function profile(e) {
  let out = null;
  walk(e, o => str(o.name) != null && ('avatar' in o || 'username' in o), o => { if (!out) out = { name: o.name, photo: firstUrl(o.avatar) }; });
  return out;
}

/** Spotify descriptions carry a little HTML (links to artists, &amp;): plain text only. */
export function plain(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

export function playlists(e) {
  const out = new Map();
  walk(e, o => str(o.uri)?.startsWith('spotify:playlist:') && str(o.name) != null, o => {
    const id = o.uri.slice('spotify:playlist:'.length);
    if (out.has(id)) return;
    let owner = null;
    if (isObj(o.ownerV2)) walk(o.ownerV2, x => str(x.name) != null, x => { if (!owner) owner = x.name; });
    const description = plain(o.description);
    out.set(id, { id, title: o.name, subtitle: description || ['Playlist', owner].filter(Boolean).join(' · '), thumbnail: firstUrl(o.images ?? o.image ?? o.coverArt) });
  });
  return [...out.values()];
}

const isTrack = (o) => str(o.name) != null && (o.__typename === 'Track' || (o.__typename == null && str(o.uri)?.startsWith('spotify:track:')));

/** Songs in a playlist or Liked Songs page, as the matcher's sources. */
export function tracks(e, startOrder = 1) {
  const out = [];
  walk(e, isTrack, o => {
    const artists = [];
    walk(o.artists ?? o.firstArtist, x => str(x.name) != null, x => artists.push(x.name));
    const ms = firstNumber(o.trackDuration ?? o.duration, 'totalMilliseconds') ?? (typeof o.duration_ms === 'number' ? o.duration_ms : 0);
    const secs = Math.round(ms / 1000);
    out.push({
      sourceId: str(o.uri)?.replace('spotify:track:', '') || '',
      sourcePlatform: 'spotify',
      title: o.name,
      artist: [...new Set(artists)].join(', '),
      album: str(o.albumOfTrack?.name) || '',
      duration: secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '',
      durationSeconds: secs,
      thumbnail: firstUrl(o.albumOfTrack?.coverArt),
      order: startOrder + out.length,
    });
  });
  return out;
}

export const total = (e) => firstNumber(e, 'totalCount');

/** Your Spotify home: each shelf's title and its playlists (radio, mixes, editorial). Shelves with none are skipped. */
export function homeSections(e) {
  const out = [];
  walk(e, o => isObj(o.sectionItems), o => {
    let title = str(o.data?.title?.text) || str(o.title?.text) || str(o.data?.title) || '';
    if (!title) walk(o.data ?? o, x => typeof x.text === 'string', x => { if (!title) title = x.text; });
    const items = playlists(o.sectionItems);
    if (title && items.length) out.push({ title, items });
  });
  return out;
}
