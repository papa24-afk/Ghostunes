// Spotify account (signed in on this PC): your playlists and Liked Songs, played through Ghosttunes.
//
// The desktop app gets a short-lived Spotify access token from Spotify's own web player after you sign
// in and hands it here (memory only). Songs are matched to YouTube for playback with the same matcher
// as playlist import. These routes only answer this PC itself.
//
// Spotify throttles its public Web API for the web player's token (429), so we mostly ask the way the
// web player itself does: the desktop app notes the web player's own requests ("templates": address,
// method, body) and we resend them with our playlist / page numbers. The Web API is the fallback.
import { matchTracksAgainstCatalogue, resolveSpotifyPlaylist } from './serverPlaylistImport.js';
import * as pf from './spotifyPathfinder.js';

let token = null; // { accessToken, expiresAt, clientToken, appVersion }
let templates = {}; // operation name -> { url, method, body }
let accountCache = null;
let homeScrape = []; // home shelves as read off the web player's page (when its request can't be resent)
const matched = new Map(); // playlist id -> { at, tracks, unmatched }
const LIKED = 'liked';
const NO_TEMPLATE = 'no_template';

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
const signedOut = () => Object.assign(new Error('signed_out'), { status: 401 });

async function api(pathOrUrl) {
  if (!token || Date.now() > token.expiresAt) throw signedOut();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.spotify.com/v1/${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` }, signal: AbortSignal.timeout(20000) });
  if (res.status === 401) { token = null; throw signedOut(); }
  if (res.status === 429) throw Object.assign(new Error('spotify_busy'), { status: 503 });
  if (!res.ok) throw Object.assign(new Error(`spotify_${res.status}`), { status: 502 });
  return res.json();
}

async function paged(first, max) {
  const out = [];
  let next = first;
  while (next && out.length < max) {
    const page = await api(next);
    out.push(...(page.items || []));
    next = page.next;
  }
  return out.slice(0, max);
}

/** Resend the web player's [op] request with changed variables. */
async function query(op, editVars) {
  if (!token || Date.now() > token.expiresAt) throw signedOut();
  const tpl = templates[op];
  if (!tpl?.body) throw new Error(NO_TEMPLATE);
  const body = { ...tpl.body, variables: editVars({ ...(tpl.body.variables || {}) }) };
  const headers = {
    authorization: `Bearer ${token.accessToken}`, 'app-platform': 'WebPlayer', accept: 'application/json',
    ...(token.clientToken ? { 'client-token': token.clientToken } : {}),
    ...(token.appVersion ? { 'spotify-app-version': token.appVersion } : {}),
  };
  let url = tpl.url;
  const init = { headers, signal: AbortSignal.timeout(20000) };
  if (tpl.method === 'POST') {
    init.method = 'POST';
    init.body = JSON.stringify(body);
    headers['content-type'] = 'application/json;charset=UTF-8';
  } else {
    const u = new URL(tpl.url);
    for (const [k, v] of Object.entries(body)) u.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    url = u.toString();
  }
  const res = await fetch(url, init);
  if (res.status === 401) throw signedOut();
  if (res.status === 429) throw Object.assign(new Error('spotify_busy'), { status: 503 });
  const json = await res.json().catch(() => null);
  const err = json ? pf.errors(json) : null;
  if (!res.ok || !json || (err && !json.data)) {
    // Spotify updated its web player: forget this one; the app learns the new request on its next refresh.
    if ((res.status >= 400 && res.status < 500) || /PersistedQuery/i.test(err || '')) delete templates[op];
    throw Object.assign(new Error(`spotify_${res.status}`), { status: 502 });
  }
  return json;
}

/** Page through a list (your library, a playlist's songs, Liked Songs). */
async function pages(op, limit, max, read, extra = (v) => v) {
  const out = [];
  let offset = 0;
  let total = null;
  while (offset < max && (total == null || offset < total)) {
    const page = await query(op, (v) => ({ ...extra(v), offset, limit }));
    const items = read(page);
    if (total == null) total = pf.total(page);
    out.push(...items);
    if (!items.length && (total == null || offset === 0)) break;
    offset += limit;
  }
  return out.slice(0, max);
}

/** The web player's way first, then the Web API. A sign-out is passed straight on. */
async function either(primary, fallback) {
  try {
    return await primary();
  } catch (err) {
    if (err.status === 401) throw err;
    try {
      return await fallback();
    } catch (fb) {
      throw err.message === NO_TEMPLATE || fb.status === 401 ? fb : err;
    }
  }
}

/** Spotify track object -> what the matcher needs (skips episodes, local files, removed tracks). */
export function spotifySource(track, order) {
  if (!track || (track.type && track.type !== 'track') || track.is_local || !track.name) return null;
  const secs = Math.round((track.duration_ms || 0) / 1000);
  return {
    sourceId: track.id || '',
    sourcePlatform: 'spotify',
    title: track.name,
    artist: (track.artists || []).map(a => a.name).filter(Boolean).join(', '),
    album: track.album?.name || '',
    duration: secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : '',
    durationSeconds: secs,
    thumbnail: track.album?.images?.[0]?.url || '',
    order,
  };
}

/** Only requests to Spotify's own servers, with a JSON body, are kept. */
export function acceptTemplates(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const op of Object.values(pf.OPS)) {
    const v = raw[op];
    if (v && typeof v.url === 'string' && /^https:\/\/[a-z0-9.-]+\.spotify\.com\//.test(v.url) && v.body && typeof v.body === 'object') {
      out[op] = { url: v.url, method: v.method === 'POST' ? 'POST' : 'GET', body: v.body };
    }
  }
  return out;
}

/** Home shelves read off the page: titles and playlist cards, checked and trimmed. */
export function acceptHome(raw) {
  if (!Array.isArray(raw)) return [];
  const clean = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return raw.slice(0, 30).map(s => ({
    title: clean(s?.title, 120),
    items: (Array.isArray(s?.items) ? s.items : []).slice(0, 50)
      .filter(i => typeof i?.id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(i.id))
      .map(i => ({ id: i.id, title: clean(i.title, 200), subtitle: clean(i.subtitle, 300), thumbnail: /^https:\/\//.test(i.thumbnail || '') ? clean(i.thumbnail, 2048) : '' })),
  })).filter(s => s.title && s.items.length);
}

export function registerSpotifyAccountRoutes(app, { getInnertube }) {
  const guard = (handler) => async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'this_pc_only' });
    try {
      await handler(req, res);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  };

  app.post('/api/spotify-account/token', guard(async (req, res) => {
    const { accessToken, expiresAt, clientToken, appVersion } = req.body || {};
    if (typeof accessToken !== 'string' || accessToken.length < 20) return res.status(400).json({ error: 'invalid_token' });
    token = {
      accessToken,
      expiresAt: Number(expiresAt) || Date.now() + 3000000,
      clientToken: typeof clientToken === 'string' ? clientToken : null,
      appVersion: typeof appVersion === 'string' ? appVersion : null,
    };
    templates = { ...templates, ...acceptTemplates(req.body?.templates) };
    const scraped = acceptHome(req.body?.home);
    if (scraped.length) homeScrape = scraped;
    accountCache = null;
    res.json({ ok: true });
  }));

  app.delete('/api/spotify-account/token', guard(async (req, res) => {
    token = null;
    accountCache = null;
    matched.clear();
    templates = {};
    homeScrape = [];
    res.json({ ok: true });
  }));

  app.get('/api/spotify-account/account', guard(async (req, res) => {
    if (!token) return res.json({ signedIn: false });
    if (!accountCache) {
      try {
        accountCache = await either(
          async () => {
            const p = pf.profile(await query(pf.OPS.PROFILE, v => v));
            if (!p) throw new Error(NO_TEMPLATE);
            return p;
          },
          async () => { const me = await api('me'); return { name: me.display_name || 'Spotify', photo: me.images?.[0]?.url || '' }; },
        );
      } catch (err) {
        if (err.status === 401) throw err;
        return res.json({ signedIn: true, name: 'Spotify', photo: '' }); // your name can wait; your music still works
      }
    }
    res.json({ signedIn: true, ...accountCache });
  }));

  // Liked Songs first, then your playlists.
  app.get('/api/spotify-account/playlists', guard(async (req, res) => {
    const list = await either(
      async () => {
        const all = await pages(pf.OPS.LIBRARY, 50, 300, pf.playlists, v => ('flatten' in v ? { ...v, flatten: true } : v));
        return [...new Map(all.map(p => [p.id, p])).values()];
      },
      async () => (await paged('me/playlists?limit=50', 300)).filter(p => p?.id).map(p => ({
        id: p.id,
        title: p.name || 'Playlist',
        subtitle: ['Playlist', p.owner?.display_name, p.tracks?.total != null ? `${p.tracks.total} songs` : null].filter(Boolean).join(' · '),
        thumbnail: p.images?.[0]?.url || '',
      })),
    );
    res.json({ playlists: [{ id: LIKED, title: 'Liked Songs', subtitle: 'Your saved songs', thumbnail: '' }, ...list] });
  }));

  // Your Spotify home shelves (radio, mixes, made for you). Cached for 30 minutes.
  let homeCache = null;
  app.get('/api/spotify-account/home', guard(async (req, res) => {
    if (!token) return res.json({ sections: [] });
    // ?fresh=1 (Refresh on Home) asks Spotify again.
    if (req.query.fresh !== '1' && homeCache && Date.now() - homeCache.at < 30 * 60 * 1000) return res.json({ sections: homeCache.sections });
    let sections = [];
    try {
      sections = pf.homeSections(await query(pf.OPS.HOME, v => v));
    } catch (err) {
      if (err.status === 401) throw err;
    }
    if (!sections.length) sections = homeScrape;
    if (sections.length) homeCache = { at: Date.now(), sections };
    res.json({ sections });
  }));

  // Songs of a playlist (or Liked Songs), matched to playable songs. Cached for 30 minutes.
  app.get('/api/spotify-account/playlist/:id', guard(async (req, res) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9]{1,64}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
    const hit = matched.get(id);
    if (hit && Date.now() - hit.at < 30 * 60 * 1000) return res.json({ tracks: hit.tracks, unmatched: hit.unmatched });
    let sources;
    try {
      const viaPlayer = () => (id === LIKED
        ? pages(pf.OPS.LIKED, 50, 1000, (p) => pf.tracks(p))
        : pages(pf.OPS.PLAYLIST, 100, 1000, (p) => pf.tracks(p), v => ({ ...v, uri: `spotify:playlist:${id}` })));
      const viaWebApi = async () => {
        const items = id === LIKED ? await paged('me/tracks?limit=50', 1000) : await paged(`playlists/${id}/tracks?limit=100`, 1000);
        return items.map((it, i) => spotifySource(it?.track, i + 1)).filter(Boolean);
      };
      sources = (await either(viaPlayer, viaWebApi)).map((t, i) => ({ ...t, order: i + 1 }));
    } catch (err) {
      // Not signed in (or Spotify refused): public playlists still load from their public page.
      if (id === LIKED) throw err;
      const pub = await resolveSpotifyPlaylist(id, {});
      sources = (pub.tracks || []).map((t, i) => ({ ...t, sourcePlatform: 'spotify', order: t.order || i + 1 }));
    }
    const results = await matchTracksAgainstCatalogue(await getInnertube(), sources);
    const tracks = results
      .sort((a, b) => a.order - b.order)
      .filter(r => r.candidate)
      .map(r => ({ ...r.candidate, album: r.candidate.album || r.sourceTrack?.album || '' }));
    const unique = [...new Map(tracks.map(t => [t.id, t])).values()];
    const unmatched = results.filter(r => !r.candidate).length;
    matched.set(id, { at: Date.now(), tracks: unique, unmatched });
    res.json({ tracks: unique, unmatched });
  }));
}
