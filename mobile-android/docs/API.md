# Ghosttunes server API — what the phone uses

Captured on 2026-11-17 by running `node server.js` (branch `feat/mobile-app`, on port 3011 because the installed desktop app already held 3001) and calling every endpoint with `curl`. Responses below are real, trimmed only where marked `…`. Timings are from this PC on a warm Innertube session.

- **Base URL:** `http://<pc-ip>:3001` (emulator: `http://10.0.2.2:3001`). Plain HTTP, CORS `*`, JSON bodies up to 2 MB.
- **No auth.** Anyone on the LAN can call it. The phone only allows cleartext to the configured host (network security config).
- **Errors:** `400 {"error": "..."}` for missing params, `500 {"error": "..."}` for upstream failures, `404` for unknown ids.

## The Track shape

Everything that lists songs returns this shape (`src/types.ts`). The phone uses it unchanged, including for handoff.

```json
{
  "id": "3az-NQCK57c",            // YouTube video id, 11 chars — also the stream id
  "title": "City Boys",
  "artist": "Burna Boy",
  "album": "I Told Them...",       // may be ""
  "duration": "2:34",
  "durationSeconds": 154,
  "thumbnail": "https://yt3.googleusercontent.com/…=w120-h120-l90-rj"
}
```

Optional fields seen: `artistId`, `artists[] {name,id}`, `artist_thumbnail`, `isAutoplay`, `recommendationReason`, `recommendationMode`, `source`.

**Artwork sizes.** Search, home and genre return **120 px** thumbnails. The phone rewrites Google-CDN URLs before loading (same rule as the server's `upgradeArtworkUrl`):
`=w120-h120-…` → `=w544-h544-l90-rj` for rows, `=w1080-h1080-l90-rj` for Now Playing; `i.ytimg.com/vi/<id>/hqdefault.jpg` → `maxresdefault.jpg` with `hqdefault` fallback.

---

## Health

`GET /api/health` — 4 ms

```json
{"status":"ok","uptime":1.37,"timestamp":1794952339000}
```

Used by onboarding, the subnet scan and the "PC unreachable" screen.

## Search

`GET /api/search?q=burna%20boy%20city%20boys` — 1.2 s cold, cached 30 min. Songs only, max 30.

```json
{"results":[
  {"id":"3az-NQCK57c","title":"City Boys","artist":"Burna Boy","album":"I Told Them...","duration":"2:34","durationSeconds":154,"thumbnail":"https://yt3.googleusercontent.com/aLiyrb…=w120-h120-l90-rj"},
  {"id":"725qoCPzhlM","title":"Want It All (feat. Polo G)","artist":"Burna Boy","album":"Want It All","duration":"3:53","durationSeconds":233,"thumbnail":"…"},
  …]}
```

`GET /api/search` → `400 {"error":"Query required"}`

### Suggestions

`GET /api/search/suggestions?q=wizk` — 160 ms

```json
{"suggestions":["wizkid","wizkid songs","wizkid old songs","wizkid ojuelegba","wizkid final","wizkid ft drake"],
 "recommended":[
  {"id":"bafL0dvy1rU","videoId":"bafL0dvy1rU","browseId":"","title":"Final (Baba Nla)","artist":"Wizkid","type":"track","subtitle":"Track • Wizkid","thumbnail":"https://i.ytimg.com/vi/bafL0dvy1rU/hq720.jpg"},
  …]}
```

`type` is `"track"` or `"artist"` (artist rows carry `browseId`). Never errors; returns empty lists on failure.

## Home and browse

`GET /api/home` — 670 ms, cached 1 h. A fixed "Trending Hits" search, 25 tracks.

```json
{"tracks":[{"id":"iDYZvg8MrV4","title":"Angela","artist":"John Blaq","album":"Angela","duration":"3:32","durationSeconds":212,"thumbnail":"…=w120-h120-l90-rj"}, …]}
```

`GET /api/genre?q=Afrobeats` — 570 ms, cached 1 h. Same as search with a mood/genre query, 30 tracks: `{"tracks":[Track…]}`.

## Artist

`GET /api/artist?name=Burna%20Boy` or `?id=UCr61sufuLt7_eB7ak1bXHIg` — 1.2 s, cached 1 h.

```json
{
 "id": "UCr61sufuLt7_eB7ak1bXHIg",
 "name": "Burna Boy",
 "avatar": "https://lh3.googleusercontent.com/_QE_u2…=w2510-h1045-p-l90-rj",
 "banner": "https://lh3.googleusercontent.com/_QE_u2…=w2510-h1045-p-l90-rj",
 "description": "No Sign of Weakness Out Now!",
 "subscribers": "",
 "topTracks": [{"id":"lFQdcPTTzSg","title":"Dai Dai","artist":"Shakira, Burna Boy","album":"","duration":"3:30","durationSeconds":210,"thumbnail":"…=w120-h120-l90-rj"}, …],
 "albums":  [{"id":"MPREb_XFwa882atws","title":"No Sign Of Weakness","year":"2025","thumbnail":"…=w544-h544-l90-rj"}, …],
 "singles": [{"id":"MPREb_WmYxY1nkWGl","title":"Dai Dai","year":"2026","thumbnail":"…"}, …],
 "similarArtists": [{"id":"UC97hKW1a1rzrMnzkKwaNx_g","name":"Crayon","avatar":"…=w544-h544-p-l90-rj"}, …]
}
```

Counts in this capture: 5 top tracks, 10 albums, 10 singles, 10 similar artists.
**Bug:** top tracks report a placeholder `"3:30"` / `210` duration (see proposal S2).

`GET /api/artist-avatar?name=Burna%20Boy` — `{"avatar":"https://lh3.googleusercontent.com/…=w544-h544-p-l90-rj"}`

## Album

`GET /api/album?id=MPREb_XFwa882atws` — 620 ms, cached 2 h.

```json
{
 "id": "MPREb_XFwa882atws",
 "title": "No Sign Of Weakness",
 "artist": "Burna Boy",
 "year": "2025",
 "description": "No Sign of Weakness is the eighth studio album by Nigerian singer Burna Boy. …",
 "thumbnail": "https://yt3.googleusercontent.com/TmTbew…=w544-h544-l90-rj",
 "durationText": "16 songs • 47 minutes",
 "trackCount": 16,
 "tracks": [
  {"id":"04T5ruuMVqA","title":"No Panic","artist":"Burna Boy","album":"No Sign Of Weakness","duration":"2:40","durationSeconds":160,"thumbnail":"…"},
  {"id":"poY4czC8h3o","title":"No Sign of Weakness","artist":"Burna Boy","album":"No Sign Of Weakness","duration":"2:56","durationSeconds":176,"thumbnail":"…"},
  …]
}
```

`GET /api/album` → `400 {"error":"Album ID required"}`

## Playlists

There is **no playlist-details endpoint**. YouTube playlists can only be resolved by URL through `POST /api/playlist/import/resolve {url}` (meant for the desktop import flow). User playlists live on each device (desktop: localStorage; phone: Room). See proposal S4.

## Streaming

`GET /api/stream/:id` — the audio itself. Supports `Range` (HTTP 206).

Song not downloaded on the PC (live YouTube path):

```
$ curl -r 0-1023 /api/stream/725qoCPzhlM
HTTP/1.1 206 Partial Content
Content-Type: audio/mp4; codecs="mp4a.40.2"
Content-Range: bytes 0-1023/3764883
Accept-Ranges: bytes
→ 10.0 s   (first request: server resolves stream info, cached 2 h)

$ curl -r 2000000-2000999 /api/stream/725qoCPzhlM
206, Content-Range: bytes 2000000-2000999/3764883   → 0.045 s

$ curl /api/stream/725qoCPzhlM -o live.m4a
200, 3,764,883 bytes in 1.7 s — "ISO Media, MPEG v4 system, Dynamic Adaptive Streaming over HTTP" (fragmented MP4 / AAC)
```

Song downloaded on the PC (served from `%APPDATA%\…\media`):

```
206, Content-Type: audio/mpeg, Content-Range: bytes 0-1023/2634105 → 0.017 s
file says: WebM   ← the file is named .mp3 and labelled audio/mpeg but is WebM/Opus
```

Phone implications:
- **Time to first sound is ~10 s for an uncached song.** The phone must warm the stream info before it's needed (tap → warm immediately; next-in-queue → warm 30 s before the end). See proposal S1.
- ExoPlayer's `DefaultExtractorsFactory` sniffs the container, so the wrong `Content-Type` on downloaded files is harmless. Don't rely on the MIME type.
- Seeking is cheap once warm (byte ranges, ~45 ms).

`GET /api/download/:id` — the full file for offline use. Picks the best audio format of **any** container:

```
206, Content-Type: audio/webm; codecs="opus", Content-Disposition: attachment; filename="725qoCPzhlM.mp3", Content-Range: bytes 0-99/4410355
```

The phone saves downloads as `<id>.audio` and lets ExoPlayer sniff. Same ~10 s warm-up on first call.

`GET /api/artwork/:id` — 200 `image/jpeg`, 115,604 bytes (PC's offline art, else live `maxresdefault`/`hqdefault`). Used as a fallback when a thumbnail URL 404s.

## Lyrics

`GET /api/lyrics?title=City%20Boys&artist=Burna%20Boy&album=I%20Told%20Them...&duration=154&id=3az-NQCK57c` — 900 ms. `fresh=1` bypasses the cache.

```json
{
 "syncedLyrics": "[00:00.00] Ayo, I'm not even gonna lie, …\n[00:06.79] I'm a sexy yout, you understand?\n[00:09.80] …",
 "plainLyrics": "…",
 "instrumental": false,
 "source": "better_lyrics"
}
```

63 synced lines, 1,843 chars of plain text in this capture. `syncedLyrics` is LRC (`[mm:ss.xx] text`); may be `null` when only plain lyrics exist. `title` is required (400 otherwise).

## Recommendations

`GET /api/related?id=3az-NQCK57c` — 950 ms, cached 1 h. YouTube "Up next", 25 tracks, `maxresdefault` thumbnails.

```json
{"tracks":[{"id":"PUz1BVmRwLU","title":"23","artist":"Burna Boy","album":"Twice As Tall","duration":"4:06","durationSeconds":246,"thumbnail":"https://i.ytimg.com/vi/PUz1BVmRwLU/maxresdefault.jpg"}, …]}
```

`GET /api/smart-radio?id=3az-NQCK57c&title=City%20Boys&artist=Burna%20Boy&duration=154[&mode=balanced|similar|artist|discover]` — 2.3 s, 20 tracks.

```json
{
 "seed": {"id":"3az-NQCK57c","title":"City Boys","artist":"Burna Boy","artistId":"UCr61sufuLt7_eB7ak1bXHIg","durationSeconds":154,"features":{"energy":0.5,"valence":0.5,"danceability":0.5,"acousticness":0.3,"bpm":110,"vector":[…]}, …},
 "mode": "balanced",
 "tracks": [{"id":"2cNFrajBk0k","title":"Last Last","artist":"Burna Boy","artistId":"UCr61sufuLt7_eB7ak1bXHIg","artists":[{"name":"Burna Boy","id":"UCr61sufuLt7_eB7ak1bXHIg"}],"album":"Love, Damini","duration":"2:53","durationSeconds":173,"thumbnail":"…=w544-h544-p-l90-rj","artist_thumbnail":"…","isAutoplay":true,"recommendationReason":"Smart Radio (BALANCED)","recommendationMode":"balanced"}, …],
 "diagnostics": {"timestamp":…, "mode":…, "seedTrack":…, "recommendations":…, "userStats":…, "mixStats":…}
}
```

`POST /api/smart-radio/feedback {track_id, title, artist, action, duration_played, total_duration}` — `action` is e.g. `complete` / `skip`. Feeds the PC's SQLite taste profile, so phone listening improves radio on both devices.

Response: `200` with an **empty body** (the handler returns `res.json(undefined)`). The phone treats any 2xx as success and doesn't parse the body. Missing `track_id`/`action` → `400`.

`GET /api/smart-radio/diagnostics` — last run's diagnostics (debug screen only).

## Phone ⇄ PC handoff (already on this branch)

From `serverHandoff.js`. Verified by `tests/handoff-endpoints.cjs` (8/8 passing on 2026-11-17).

| Method | Path | Body / response |
| --- | --- | --- |
| GET | `/api/handoff/desktop` | `{"online":false,"nowPlaying":null,"serverTime":1794952356409}` (live capture, no desktop connected) |
| POST | `/api/handoff/push` | `{snapshot:{track,queue,queueIndex,position,isPlaying,deviceName}}` → `{id, stampedAt}`; `409 {"error":"desktop_offline"}`; `400 {"error":"invalid_snapshot"}` |
| GET | `/api/handoff/:id` | `{id, status:"pending"|"playing"|"failed", error}`; 404 unknown |
| POST | `/api/handoff/release` | `{reason}` → `{ok:true, delivered:n}` |
| GET | `/api/handoff/events` | SSE, desktop only |
| POST | `/api/handoff/presence` | desktop only |
| POST | `/api/handoff/:id/status` | desktop only |

The server sanitizes snapshots (drops `local_*` fields, replaces non-http artwork with `i.ytimg.com/vi/<id>/hqdefault.jpg`, caps the queue at 300 around the current track) and stamps them with PC time.

## Listening rooms (not used by the phone in v1)

`POST /api/rooms/create {roomName, hostName, initialTrack}`:

```json
{"roomId":"GHOST-4D6","hostToken":"2102c7f3…","hostId":"user_p5bk70xt",
 "roomState":{"roomId":"GHOST-4D6","roomName":"Test","hostId":"user_p5bk70xt","isHost":true,"collaborative":false,"currentTrack":null,"playbackTime":0,"isPlaying":false,"serverTimestamp":1794952356885,"members":[{"id":"user_p5bk70xt","name":"Phone","isHost":true,"joinedAt":1794952356885,"lastSeen":1794952356885,"pingMs":12}]}}
```

Also `POST /api/rooms/join {roomId, memberName}`, `GET /api/rooms/:id/events` (SSE), `POST /api/rooms/:id/action {action, payload, token, memberId}`, `GET /api/rooms/:id/sync`.

## Not for the phone

Playlist import (`/api/playlist/import/*`), provider auth (`/api/spotify/*`, `/api/deezer/*`, `/api/providers/status`, `/api/playlists/connected`): desktop flows that need OAuth in a browser.

---

## Server additions for the phone (implemented on this branch)

All additive (`serverMobile.js` + small changes in `server.js`); existing responses are unchanged. Verified with curl on 2026-11-17, plus `npm run typecheck`, `npm test` and `tests/handoff-endpoints.cjs` (all passing).

### S1 `GET /api/stream/:id/prepare`

Fills the stream-info cache **and** pulls one byte through the download path (the first download for a track has its own warm-up beyond `getInfo`). The phone calls it for the next track as soon as a track starts.

```
GET /api/stream/a2YHUTPk6Hc/prepare
{"ok":true,"id":"a2YHUTPk6Hc","mimeType":"audio/mp4; codecs=\"mp4a.40.2\"","contentLength":3503056,"tookMs":14592}
then GET /api/stream/a2YHUTPk6Hc  (Range 0-1023)  → 206 in 0.22 s   (was ~10 s cold)
```

`/api/stream/bad/prepare` → `400 {"error":"invalid_id"}`. Upstream failure → `502 {"ok":false,...}`.

### S2 Artist top-track durations

`/api/artist` top songs now carry real durations (looked up in parallel, 4 s cap, cached with the artist page). Before → after for Burna Boy: `Dai Dai 3:30 → 3:44`, `Last Last 3:30 → 2:53`. If a lookup fails the old placeholder stays.

### S3 `GET /api/search/all?q=`

```json
{"query":"burna boy",
 "top":{"type":"artist","item":{"id":"UCr61sufuLt7_eB7ak1bXHIg","name":"Burna Boy","avatar":"…","subtitle":"Artist • 632M monthly audience"}},
 "songs":[{"id":"KjNRMSyeEok","title":"Pree Me","artist":"Burna Boy","artistId":"UCr61sufuLt7_eB7ak1bXHIg","album":"Redemption","duration":"3:21","durationSeconds":201,"thumbnail":"…"}, …20],
 "artists":[…10], "albums":[{"id":"MPREb_XFwa882atws","title":"No Sign Of Weakness","artist":"Burna Boy","year":"2025","type":"album","thumbnail":"…"}, …10],
 "playlists":[{"id":"PLX0yRpY9uxn4wJWndOffj3zUvFTmnjooh","title":"Burna Boy - NO STRESS","author":"John Perea","itemCount":"","thumbnail":"…"}, …10]}
```

0.8 s, cached 30 min. Top result: an artist whose name matches the query, else a song whose title matches exactly ("essence" → Wizkid's *Essence*), else an album, else the first song.

### S4 `GET /api/playlist?id=`

```json
{"id":"PLX0yRpY9uxn4wJWndOffj3zUvFTmnjooh","title":"Burna Boy - NO STRESS","author":"","description":"NO STRESS",
 "subtitle":"332 views • 7 tracks • 26 minutes","thumbnail":"…=s1200","trackCount":6,
 "tracks":[{"id":"c4Fyvg4T6pQ","title":"Burna Boy – NO STRESS (Official Music Video)","artist":"Les tubes français","duration":"4:52","durationSeconds":292,…}, …]}
```

0.5 s. Unknown id → `404 {"error":"Playlist not found: no playable tracks"}`.

### S5 `?quality=low` on `/api/stream/:id` and `/api/download/:id`

Optional. Picks `lowestaudio` instead of `highestaudio` (Settings → Data saver). Without it, behaviour is exactly as before.
