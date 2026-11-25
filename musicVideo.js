// Finding a song's real music video for the Song / Video switch. A song on YouTube Music is often the
// "art track" (a video that's just the cover), so like YouTube Music we look for the official music
// video of the same title by the same artist. Same rules as the phone's MusicVideo.kt.
export const VIDEOS_FILTER = 'EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D';

const runsText = (t) => (t?.runs || []).map(r => r.text || '').join('');

function firstString(e, key) {
  if (Array.isArray(e)) {
    for (const v of e) { const s = firstString(v, key); if (s) return s; }
  } else if (e && typeof e === 'object') {
    if (typeof e[key] === 'string') return e[key];
    for (const v of Object.values(e)) { const s = firstString(v, key); if (s) return s; }
  }
  return null;
}

/** Video results of a search, in order. */
export function results(e) {
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') {
      const r = x.musicResponsiveListItemRenderer;
      if (r) {
        const id = r.playlistItemData?.videoId || firstString(r, 'videoId');
        const cols = (r.flexColumns || []).map(c => runsText(c.musicResponsiveListItemFlexColumnRenderer?.text));
        if (id && cols.length) out.push({ id, title: cols[0], subtitle: cols[1] || '', official: firstString(r, 'musicVideoType') === 'MUSIC_VIDEO_TYPE_OMV' });
      } else Object.values(x).forEach(walk);
    }
  };
  walk(e);
  return out;
}

/** Lower case, no "(feat. …)" / "[…]", letters and digits only. */
export const norm = (s) => String(s || '').toLowerCase().replace(/[([].*?[)\]]/g, ' ').replace(/\b(feat|ft)\.?\s.*$/, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Uploads that aren't the real video: lyric videos, visualizers, audio-only, edits, live, covers. */
const NOT_THE_VIDEO = /\b(lyrics?|visuali[sz]er|audio|slowed|sped ?up|reverb|8d|karaoke|instrumental|live|remix|cover|nightcore|loop|1 hour)\b/gi;
const OFFICIAL_VIDEO = /official (music )?video|music video/i;

/**
 * The real music video: official, same title, same (first) artist, not a lyric video / visualizer /
 * audio upload / live or remixed version (unless the song itself is one), titles saying "Official Video"
 * first. Null when there isn't one.
 */
export function pick(list, title, artist) {
  const t = norm(title);
  const a = norm(String(artist || '').split(/,|&| x /i)[0]);
  if (!t) return null;
  const songWords = String(title).toLowerCase();
  const ok = list.filter(r => {
    const rt = norm(r.title);
    const titleOk = rt === t || rt.startsWith(t + ' ') || rt.endsWith(' ' + t) || (t.length >= 4 && rt.includes(t));
    const artistOk = !a || a === 'unknown artist' || norm(r.subtitle).includes(a) || rt.includes(a);
    const clean = [...String(r.title).matchAll(NOT_THE_VIDEO)].every(m => songWords.includes(m[0].toLowerCase()));
    return r.official && titleOk && artistOk && clean;
  });
  const hit = ok.find(r => OFFICIAL_VIDEO.test(r.title)) || ok[0];
  return hit ? hit.id : null;
}

const cache = new Map();

/** The official music video id for a song, or null. Cached. */
export async function findMusicVideo(title, artist) {
  const key = title + '|' + artist;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://music.youtube.com', Referer: 'https://music.youtube.com/' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20250310.01.00', hl: 'en', gl: 'US' } },
      query: title + ' ' + artist,
      params: VIDEOS_FILTER,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const id = pick(results(await res.json()), title, artist);
  cache.set(key, id);
  return id;
}
