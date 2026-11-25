// YouTube Music account (signed in on this PC): your playlists and liked songs.
//
// The desktop app signs in on the official Google page in its own window and hands the session
// here. It's kept in memory only (the app stores it encrypted on disk with the OS keychain) and
// these routes only answer this PC itself, never other devices on the network.
import crypto from 'crypto';
import { resolveYouTubePlaylist } from './serverPlaylistImport.js';

const ORIGIN = 'https://music.youtube.com';
const API = `${ORIGIN}/youtubei/v1`;
const CLIENT_VERSION = '1.20250310.01.00';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let auth = null; // { cookie, visitorData, dataSyncId, authUser }
let accountCache = null;

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);

function sapisid(cookie) {
  const m = cookie.match(/(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID)=([^;]+)/);
  return m ? m[1] : null;
}

/** "id||" = your own account; "pageId||userId" = a brand channel (send pageId as onBehalfOfUser). */
function onBehalfOf(dataSyncId = '') {
  const [first, second] = String(dataSyncId).split('||');
  return second ? first : null;
}

export function ytmHeaders(a) {
  const ts = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1').update(`${ts} ${sapisid(a.cookie)} ${ORIGIN}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'User-Agent': UA,
    Origin: ORIGIN,
    'X-Origin': ORIGIN,
    Referer: `${ORIGIN}/`,
    Cookie: a.cookie,
    Authorization: `SAPISIDHASH ${ts}_${hash}`,
    'X-Goog-AuthUser': String(a.authUser || '0'),
    'X-Goog-Visitor-Id': a.visitorData || '',
    'X-Youtube-Client-Name': '67',
    'X-Youtube-Client-Version': CLIENT_VERSION,
  };
}

async function call(endpoint, body = {}, query = '') {
  if (!auth) throw Object.assign(new Error('not_signed_in'), { status: 401 });
  const onBehalf = onBehalfOf(auth.dataSyncId);
  const res = await fetch(`${API}/${endpoint}?prettyPrint=false${query}`, {
    method: 'POST',
    headers: ytmHeaders(auth),
    body: JSON.stringify({
      context: {
        client: { clientName: 'WEB_REMIX', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'US', visitorData: auth.visitorData },
        user: onBehalf ? { onBehalfOfUser: onBehalf } : {},
      },
      ...body,
    }),
    signal: AbortSignal.timeout(20000),
  });
  // Only 401 means the sign-in itself expired. 403 can just mean "not for this item" (some mixes).
  if (res.status === 401) throw Object.assign(new Error('session_expired'), { status: 401 });
  if (!res.ok) throw Object.assign(new Error(`youtube_music_${res.status}`), { status: 502 });
  return res.json();
}

// ---------------------------------------------------------------------------------- parsing
// YouTube Music's responses are deep and change shape often, so we walk the whole tree and pick
// out the item renderers we know, wherever they are.

function walk(node, visit) {
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (visit(k, v) === false) continue;
    walk(v, visit);
  }
}

const text = (t) => (t?.runs ? t.runs.map(r => r.text).join('') : t?.simpleText || '');
const bestThumb = (node) => {
  let url = '';
  walk(node, (k, v) => { if (k === 'thumbnails' && Array.isArray(v) && v.length) url = v[v.length - 1].url; });
  return url;
};
const toSeconds = (d = '') => d.split(':').reduce((s, p) => s * 60 + (Number(p) || 0), 0);

/** An album page's header: title, artist ("Kanye West") and cover (album rows don't list the artist). */
export function parseAlbumHeader(json) {
  let h = null;
  walk(json, (k, v) => { if (!h && (k === 'musicResponsiveHeaderRenderer' || k === 'musicDetailHeaderRenderer')) { h = v; return false; } });
  if (!h) return null;
  let artist = text(h.straplineTextOne);
  if (!artist) {
    artist = (h.subtitle?.runs || [])
      .filter(r => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST')
      .map(r => r.text).join(', ');
  }
  return { title: text(h.title), artist, cover: bestThumb(h.thumbnail) };
}

/** Album songs get the album's artist, title and cover where their own row has none. */
export function withAlbumHeader(tracks, header) {
  if (!header) return tracks;
  return tracks.map(t => ({
    ...t,
    artist: t.artist === 'Unknown Artist' && header.artist ? header.artist : t.artist,
    album: t.album || header.title,
    thumbnail: /i\.ytimg\.com\/vi\//.test(t.thumbnail || '') && header.cover ? header.cover : t.thumbnail,
  }));
}

export function parsePlaylists(json) {
  const out = [];
  const seen = new Set();
  walk(json, (k, v) => {
    if (k !== 'musicTwoRowItemRenderer') return;
    const browseId = v.navigationEndpoint?.browseEndpoint?.browseId || '';
    if (!browseId.startsWith('VL')) return false; // only playlists (not albums/artists)
    const id = browseId.slice(2);
    if (seen.has(id)) return false;
    seen.add(id);
    out.push({ id, title: text(v.title), subtitle: text(v.subtitle), thumbnail: bestThumb(v.thumbnailRenderer) });
    return false;
  });
  return out;
}

export function parseTracks(json) {
  const out = [];
  const seen = new Set();
  walk(json, (k, v) => {
    if (k !== 'musicResponsiveListItemRenderer') return;
    let videoId = v.playlistItemData?.videoId || '';
    if (!videoId) walk(v, (kk, vv) => { if (!videoId && kk === 'watchEndpoint' && vv?.videoId) videoId = vv.videoId; });
    if (!videoId || seen.has(videoId)) return false;
    seen.add(videoId);
    const cols = (v.flexColumns || []).map(c => c.musicResponsiveListItemFlexColumnRenderer?.text);
    const runs = cols[1]?.runs || [];
    // Artist runs link to a channel/artist page; fall back to the first run.
    const artistRuns = runs.filter(r => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ARTIST');
    const albumRun = runs.find(r => r.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType === 'MUSIC_PAGE_TYPE_ALBUM');
    const duration = text(v.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text);
    out.push({
      id: videoId,
      title: text(cols[0]) || 'Unknown title',
      artist: (artistRuns.length ? artistRuns.map(r => r.text).join(', ') : runs[0]?.text) || 'Unknown Artist',
      album: albumRun?.text || '',
      duration,
      durationSeconds: toSeconds(duration),
      thumbnail: bestThumb(v.thumbnail) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
    return false;
  });
  return out;
}

/** Your YouTube Music home: shelves ("Quick picks", "Mixed for you"...) of songs, playlists, albums, artists. */
export function parseHome(json) {
  const sections = [];
  walk(json, (k, v) => {
    if (k !== 'musicCarouselShelfRenderer' && k !== 'musicImmersiveCarouselShelfRenderer') return;
    const h = v.header?.musicCarouselShelfBasicHeaderRenderer || v.header?.musicImmersiveCarouselShelfBasicHeaderRenderer || {};
    const title = text(h.title);
    const items = [];
    for (const c of v.contents || []) {
      const two = c.musicTwoRowItemRenderer;
      const row = c.musicResponsiveListItemRenderer;
      if (two) {
        const nav = two.navigationEndpoint || {};
        const browseId = nav.browseEndpoint?.browseId || '';
        const videoId = nav.watchEndpoint?.videoId;
        const base = { title: text(two.title), subtitle: text(two.subtitle), thumbnail: bestThumb(two.thumbnailRenderer) };
        if (browseId.startsWith('VL')) items.push({ kind: 'playlist', id: browseId.slice(2), ...base });
        else if (browseId.startsWith('MPRE')) items.push({ kind: 'album', id: browseId, ...base });
        else if (browseId.startsWith('UC')) items.push({ kind: 'artist', id: browseId, ...base });
        else if (videoId) items.push({ kind: 'song', id: videoId, ...base, artist: base.subtitle.split(' • ').slice(-1)[0] || '' });
      } else if (row) {
        const [t] = parseTracks({ x: { musicResponsiveListItemRenderer: row } });
        if (t) items.push({ kind: 'song', id: t.id, title: t.title, subtitle: t.artist, artist: t.artist, thumbnail: t.thumbnail, track: t });
      }
    }
    if (title && items.length) sections.push({ title, items });
    return false;
  });
  return sections;
}

export function parseContinuation(json) {
  let token = null;
  walk(json, (k, v) => {
    if (token) return false;
    if (k === 'continuationCommand' && v?.token) token = v.token;
    else if (k === 'nextContinuationData' && v?.continuation) token = v.continuation;
  });
  return token;
}

export function parseAccount(json) {
  let account = null;
  walk(json, (k, v) => {
    if (account || k !== 'activeAccountHeaderRenderer') return;
    account = { name: text(v.accountName), photo: bestThumb(v.accountPhoto), handle: text(v.channelHandle) };
    return false;
  });
  return account;
}

async function browseAll(browseId, parse, maxPages = 15) {
  let json = await call('browse', { browseId });
  const items = parse(json);
  for (let page = 1; page < maxPages; page++) {
    const token = parseContinuation(json);
    if (!token) break;
    json = await call('browse', { continuation: token });
    const more = parse(json);
    if (!more.length) break;
    const ids = new Set(items.map(i => i.id));
    items.push(...more.filter(i => !ids.has(i.id)));
  }
  return items;
}

// ---------------------------------------------------------------------------------- routes

export function registerYtmAccountRoutes(app, { getInnertube, onSession = () => {} } = {}) {
  const guard = (handler) => async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ error: 'this_pc_only' });
    try {
      await handler(req, res);
    } catch (err) {
      if (err.status === 401 && err.message === 'session_expired') { auth = null; accountCache = null; onSession(undefined); }
      res.status(err.status || 500).json({ error: err.message });
    }
  };

  // The desktop app hands over the signed-in session (at sign-in and on every start).
  app.post('/api/ytm/auth', guard(async (req, res) => {
    const { cookie, visitorData, dataSyncId, authUser } = req.body || {};
    if (typeof cookie !== 'string' || !sapisid(cookie)) return res.status(400).json({ error: 'invalid_session' });
    auth = { cookie, visitorData: String(visitorData || ''), dataSyncId: String(dataSyncId || ''), authUser: String(authUser || '0') };
    accountCache = null;
    onSession(cookie); // songs also stream signed in (works on networks YouTube blocks for anonymous play)
    res.json({ ok: true });
  }));

  app.delete('/api/ytm/auth', guard(async (req, res) => {
    auth = null;
    accountCache = null;
    onSession(undefined);
    res.json({ ok: true });
  }));

  // Who's signed in (name + photo), or { signedIn: false }.
  app.get('/api/ytm/account', guard(async (req, res) => {
    if (!auth) return res.json({ signedIn: false });
    if (!accountCache) accountCache = parseAccount(await call('account/account_menu')) || { name: 'YouTube Music', photo: '' };
    res.json({ signedIn: true, ...accountCache });
  }));

  // Your library playlists, with Liked Music first.
  app.get('/api/ytm/playlists', guard(async (req, res) => {
    const lists = await browseAll('FEmusic_liked_playlists', parsePlaylists, 5);
    const liked = lists.find(p => p.id === 'LM') || { id: 'LM', title: 'Liked Music', subtitle: 'Auto playlist', thumbnail: '' };
    res.json({ playlists: [liked, ...lists.filter(p => p.id !== 'LM')] });
  }));

  // Songs in one of your playlists ("LM" = Liked Music).
  app.get('/api/ytm/playlist/:id', guard(async (req, res) => {
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) return res.status(400).json({ error: 'invalid_id' });
    // Albums ("MPREb_...") are browsed as they are; playlists with "VL" in front.
    if (auth) {
      try {
        let tracks;
        if (id.startsWith('MPRE')) {
          const page = await call('browse', { browseId: id });
          tracks = withAlbumHeader(parseTracks(page), parseAlbumHeader(page));
        } else tracks = await browseAll(`VL${id}`, parseTracks);
        if (tracks.length || id === 'LM') return res.json({ tracks });
      } catch (err) {
        if (id === 'LM' || err.message === 'session_expired') throw err;
      }
    }
    // Not signed in, or YouTube refused this one signed-in: load it the public way (works for public playlists/mixes).
    if (id === 'LM' || !getInnertube) return res.status(401).json({ error: 'not_signed_in' });
    const pub = await resolveYouTubePlaylist(await getInnertube(), id);
    res.json({ tracks: pub.tracks.map(t => ({ id: t.sourceId, title: t.title, artist: t.artist, album: t.album, duration: t.duration, durationSeconds: t.durationSeconds, thumbnail: t.thumbnail })) });
  }));

  // Your YouTube Music home feed (personal shelves), for the Home screen.
  app.get('/api/ytm/home', guard(async (req, res) => {
    const json = await call('browse', { browseId: 'FEmusic_home' });
    let sections = parseHome(json);
    // One more page of shelves if there is one.
    const token = parseContinuation(json);
    if (token) {
      try { sections = sections.concat(parseHome(await call('browse', { continuation: token }))); } catch {}
    }
    res.json({ sections: sections.slice(0, 12) });
  }));

  // What you've played on YouTube Music recently (feeds "Your mixes").
  app.get('/api/ytm/history', guard(async (req, res) => {
    res.json({ tracks: (await browseAll('FEmusic_history', parseTracks, 2)).slice(0, 200) });
  }));
}
