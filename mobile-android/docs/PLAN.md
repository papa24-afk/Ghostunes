# Ghosttunes Mobile — plan

A native Android app (Kotlin, Compose, Media3) that uses the PC's Ghosttunes server as its backend. New code in `mobile-android/`; the old Capacitor app in `android/` is not touched or reused.

Status: **Phase 0 — waiting for approval.** Decisions that need you are in [§9](#9-decisions-for-you).

---

## 1. What "Spotify / Apple Music level" means here

Notes on how the two reference apps handle each surface, and what Ghosttunes takes from them. We match the craft, not the branding.

**Now Playing**
- *Spotify:* full-bleed vertical gradient from the artwork's dominant color into near-black. Art is a large square (≈ screen width − 48dp), slight corner radius. Title is big and bold, left-aligned, with the artist underneath in grey and a heart on the right. Thin scrubber with elapsed/remaining in small grey numbers. One big round white play button flanked by prev/next; shuffle and repeat sit at the edges in grey and turn green with a dot when active. Device picker bottom-left, share and queue bottom-right. Swipe the art sideways to skip. Swipe down (or the chevron) collapses to the mini-player. Lyrics card further down the scroll.
- *Apple Music:* art **shrinks** with a spring when paused and grows back on play, which is the most "alive" detail in either app. Background is a blurred, slowly moving wash of the art's colors. Controls are bare glyphs with no circles. Volume slider at the bottom. Lyrics/AirPlay/Queue are three icons in a row along the bottom edge. Synced lyrics are huge, bold, left-aligned, the active line in full white and the rest dimmed, scrolling smoothly; tapping a line seeks.
- **Ghosttunes:** Spotify's structure (left-aligned title + like, scrubber, five-button transport, device/share/queue row) with Apple's paused-art spring and big-type lyrics. Background is a palette-derived vertical gradient (dominant → #0B0B0C), cross-faded over 600ms between tracks. No blur wash: it's costly and reads as glassmorphism.

**Mini-player**
- *Spotify:* a 56dp floating rounded bar above the bottom nav, tinted with the art's color. Small art, title/artist stacked (title scrolls if long), device + play/pause icons, a 2dp progress line along the bottom edge. Swipe left/right to skip. Tap to expand with the art flying into place.
- *Apple Music:* a flat translucent bar, art + title + play + next, no artist.
- **Ghosttunes:** Spotify's model on a #18181B surface with a faint palette tint (12% mix). Shared-element transition: art, title and play button move into their Now Playing positions.

**Album / artist headers**
- *Spotify album:* square art centred over a gradient from its dominant color, title, artist avatar + name, "Album · 2025", then a row with download/⋮ and a large green play button that **sticks to the top bar** once the header scrolls away. The art shrinks and fades as you scroll; the top bar fades in with the title.
- *Spotify artist:* full-bleed photo with the name in huge type over it, parallax as you scroll, monthly listeners, Follow, then Popular (5 rows), Discography (horizontal), Fans also like.
- *Apple Music:* similar, with more white space and a centred title.
- **Ghosttunes:** Spotify's structure. Album art collapses on scroll; artist banner parallax at 0.5×; the Play/Shuffle pair becomes sticky. Header gradient from the palette.

**Search**
- *Spotify:* empty state is "Browse all", a grid of colored genre tiles with a tilted art crop. Typing gives instant results with a top-result card (big art, name, type) and filter chips (Songs, Artists, Albums, Playlists, Podcasts). Recent searches with × to remove.
- *Apple Music:* a segmented control (Apple Music / Library), suggestions while typing, results grouped by type.
- **Ghosttunes:** Spotify's model. Debounced 250ms; suggestions from `/api/search/suggestions` while typing, results on submit or after 600ms idle. Browse tiles are solid colors picked from each genre's top-track artwork (real art, no emoji).

**List rows**
- *Spotify:* 56dp art + title (white, 16sp) / subtitle (grey, 14sp, "Song · Artist"), ⋮ on the right, the playing row's title in green with an animated equalizer. Long-press opens a bottom sheet with the art at the top.
- **Ghosttunes:** 64dp row, 48dp art with 4dp radius, rose title + 3-bar equalizer on the playing row, downloaded badge (a small check) before the subtitle, ⋮ with a 48dp touch target. Long-press opens the action sheet with a haptic.

**Transitions and motion**
- Both apps use springs, not linear tweens. Lists fade-through on tab switch (no slide). Pushes to detail screens slide in from the right with a slight parallax on the screen beneath. Back is predictive on Android (Spotify supports it).
- Press feedback is a scale to ~0.96, not a ripple, on cards and art.
- **Ghosttunes:** same rules. Ripples only on rows (they're expected there).

---

## 2. Features and what powers them

| Feature | Endpoint(s) | Notes |
| --- | --- | --- |
| Connect to PC, auto-detect | `GET /api/health` | /24 scan of the phone's Wi-Fi subnet, 64 parallel probes, 400ms timeout |
| Home: Trending | `GET /api/home` | |
| Home: Jump back in, recent artists | local history (Room) | |
| Home: Made for you (3–4 mixes) | `GET /api/smart-radio` | seeded from the most-played local tracks |
| Home: genre shelves | `GET /api/genre?q=` | Afrobeats, Hip Hop, R&B, Amapiano… |
| Search suggestions | `GET /api/search/suggestions` | |
| Search songs | `GET /api/search` | |
| Search artists / albums / playlists, top result | **S3** `GET /api/search/all` | new |
| Artist page | `GET /api/artist`, `/api/artist-avatar` | **S2** fixes top-track durations |
| Album page | `GET /api/album` | |
| Playlist page (YouTube) | **S4** `GET /api/playlist` | new |
| User playlists, liked songs, history | local (Room) | not synced with the desktop in v1 |
| Playback | `GET /api/stream/:id` | Range, ExoPlayer progressive |
| Fast start / preload | **S1** `GET /api/stream/:id/prepare` | new; called on tap and ~30s before the next track |
| Autoplay when the queue ends | `GET /api/smart-radio` | |
| Taste feedback | `POST /api/smart-radio/feedback` | complete / skip |
| Synced lyrics | `GET /api/lyrics` | LRC parse on the phone |
| Downloads | `GET /api/download/:id` | WorkManager, plays with the server off |
| Artwork fallback | `GET /api/artwork/:id` | when a CDN URL fails |
| Send to PC / Get from PC | `/api/handoff/*` | already implemented on this branch |
| Listening rooms | `/api/rooms/*` | **not in v1** (see §9) |

Proposed server additions S1–S4 are described in [API.md](API.md#proposed-server-additions-small-additive-safe). All are new routes or bug fixes; no existing response changes.

---

## 3. Screens and navigation

```
Onboarding (first run / server unreachable)
   └── Main scaffold
        ├── Home      ─┐
        ├── Search     ├── bottom nav (3 tabs), each its own back stack
        ├── Library   ─┘
        │     ├── Album
        │     ├── Artist ── Album
        │     ├── Playlist (YouTube or user)
        │     ├── Liked songs / Downloads / History
        │     └── Settings ── Debug (tap version ×7)
        ├── Mini-player (above the nav, shared element →)
        └── Now Playing (full-screen overlay, swipe down to close)
              ├── Lyrics (full-screen, from Now Playing)
              ├── Queue (bottom sheet)
              ├── Sleep timer (sheet)
              └── Device sheet: "This phone" / "Ghosttunes on <PC>"

HandoffActivity (translucent, NFC / VIEW intent, no main UI)
Quick Settings tile "Send to PC"
```

Settings is reached from an avatar/gear in the Home header (Spotify's pattern), not a fourth tab.

Navigation Compose with type-safe routes. Predictive back on every screen (`android:enableOnBackInvokedCallback="true"`); Now Playing collapses with the back gesture's progress driving the animation.

---

## 4. Design system

### Color

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0B0B0C` | app background |
| `surface1` | `#121214` | sheets, nav bar |
| `surface2` | `#18181B` | mini-player, cards, chips |
| `surface3` | `#222226` | pressed / selected chip |
| `outline` | `#2A2A2E` | 1dp dividers (rarely) |
| `text` | `#F4F4F5` | primary text, icons |
| `textSecondary` | `#A1A1AA` | subtitles (7.4:1 on bg) |
| `textTertiary` | `#7C7C85` | meta, disabled (4.6:1 on bg) |
| `accent` | `#E0536C` | play button, active states, now-playing row, progress (5.2:1 on bg) |
| `accentPressed` | `#C8455D` | |
| `onAccent` | `#0B0B0C` | glyph on the rose play button |
| `error` | `#F2777A` | |

The accent appears in at most three places per screen. Palette colors (from the artwork) are only used as backgrounds and darkened so white text always passes 4.5:1: take Vibrant → DarkVibrant → Dominant, then clamp HSL lightness to ≤ 0.32 and saturation to ≤ 0.65.

### Type: Inter (bundled, OFL), tabular figures for every time

| Style | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `display` | 32 / 38 | 800 | −0.5 | artist name, album title |
| `headline` | 24 / 30 | 700 | −0.3 | screen titles, greeting |
| `title` | 20 / 26 | 700 | −0.2 | section headers, Now Playing title (22/28) |
| `bodyLarge` | 16 / 22 | 600 | 0 | row title, mini-player title |
| `body` | 14 / 20 | 400 | 0 | row subtitle, descriptions |
| `label` | 12 / 16 | 600 | 0.2 | chips, buttons, badges |
| `caption` | 11 / 14 | 500 | 0.2 | times (tnum), meta |
| `lyric` | 28 / 36 | 800 | −0.3 | synced lyrics |

Seven sizes, nothing else. All text uses `sp`, single-line text ellipsizes, and every layout is checked at font scale 1.3.

### Spacing, size, shape

- 8dp grid with 4dp half-steps: `4, 8, 12, 16, 24, 32, 48`. Screen edges 16dp. Section gap 32dp.
- Rows 64dp (48dp art). Compact rows (queue) 56dp (40dp art). Touch targets ≥ 48dp.
- Cards: 152dp art in carousels, 8dp gap, title 2 lines max.
- Radii: art in rows 4dp, cards 6dp, Now Playing art 8dp, sheets 16dp top, chips/buttons full pill, artists circular.
- No elevation shadows. Separation comes from surface color steps.

### Icons

One set: Material Symbols **Rounded**, weight 400, filled variants only for active states (like, play). 24dp default, 20dp in rows, 32dp transport, 40dp play glyph in a 64dp rose circle.

### Motion

| Token | Spec | Use |
| --- | --- | --- |
| `press` | spring(damping 0.6, stiffness 800), scale 0.96 | cards, art, buttons |
| `expand` | spring(damping 0.88, stiffness 380) | mini-player ↔ Now Playing, sheets |
| `artPause` | spring(damping 0.7, stiffness 300), scale 1.0 ↔ 0.86 | Now Playing art |
| `fade` | 220ms emphasized decelerate | content fade-through, tab switches |
| `color` | 600ms linear | palette background changes |
| `push` | 300ms emphasized, slide 1/4 + fade | detail screens |

Haptics: `CONFIRM` on play/pause and like, `CLOCK_TICK` on skip and scrubber detents, `LONG_PRESS` on long-press, a 35ms one-shot when a flick fires.

### Loading

Content-shaped skeletons (row = 48dp square + two bars; card = square + bar) with a slow 1.2s shimmer on `surface2`. Nothing on a blank screen with a spinner. Images fade in over 180ms once loaded; the space they take never changes (fixed aspect ratios), so there's no layout shift.

---

## 5. Wireframes

```
HOME                                   SEARCH (typing)
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Good evening                  (⚙)│   │ ┌──────────────────────────────┐ │
│                                  │   │ │ ⌕  burna boy               ✕ │ │
│ ┌──────┐ ┌──────┐ ┌──────┐       │   │ └──────────────────────────────┘ │
│ │ art  │ │ art  │ │ art  │  ›    │   │ (Songs)(Artists)(Albums)(Playlists)
│ └──────┘ └──────┘ └──────┘       │   │                                  │
│ Jump back in                     │   │ Top result                       │
│                                  │   │ ┌──────────────────────────────┐ │
│ Made for you                     │   │ │ ( avatar )  Burna Boy        │ │
│ ┌────────┐ ┌────────┐ ┌───────   │   │ │            Artist        ▶  │ │
│ │ mix    │ │ mix    │ │ mix      │   │ └──────────────────────────────┘ │
│ │  art   │ │  art   │ │          │   │ Songs                            │
│ └────────┘ └────────┘ └───────   │   │ ▢ City Boys                    ⋮ │
│ City Boys Radio  Last Last Radio │   │   Burna Boy · 2:34               │
│                                  │   │ ▢ Want It All (feat. Polo G)   ⋮ │
│ Your artists                     │   │   Burna Boy · 3:53               │
│ (●) (●) (●) (●) (●)              │   │ Artists                          │
│ Burna Wizkid Tems ...            │   │ (●) Burna Boy  (●) Crayon   ›    │
│                                  │   │ Albums                           │
│ Trending now                     │   │ ┌──────┐ ┌──────┐ ┌──────┐       │
│ ▢ Angela · John Blaq           ⋮ │   │ └──────┘ └──────┘ └──────┘       │
├──────────────────────────────────┤   ├──────────────────────────────────┤
│ ▢ City Boys        ⇄  ▶          │   │ ▢ City Boys        ⇄  ▶          │  mini-player
│ ─────────────                    │   │ ─────────────                    │  2dp progress
├──────────────────────────────────┤   ├──────────────────────────────────┤
│  Home      Search      Library   │   │  Home      Search      Library   │
└──────────────────────────────────┘   └──────────────────────────────────┘
Empty search = recent searches + "Browse" tiles (solid colors from real art).

LIBRARY                                ALBUM
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ Your Library                 ＋  │   │ ‹                             ⋮  │  bar fades in on scroll
│ (Playlists)(Artists)(Downloaded) │   │      ┌──────────────────┐        │
│ ⇅ Recently played         ☷ / ▤ │   │      │                  │        │  palette gradient
│ ▢ Liked Songs                    │   │      │    album art     │        │  art shrinks + fades
│   Playlist · 84 songs            │   │      │                  │        │  on scroll
│ ▢ Downloads                      │   │      └──────────────────┘        │
│   12 songs · 54 MB               │   │ No Sign Of Weakness              │
│ ▢ Late night                     │   │ (●) Burna Boy                    │
│   Playlist · 23 songs            │   │ Album · 2025 · 16 songs, 47 min  │
│ ◯ Burna Boy                      │   │ ↓  ⋮                 ⤨   (▶)    │  sticky when scrolled
│   Artist                         │   │ No Panic                       ⋮ │
│ ▢ History                        │   │ Burna Boy                        │
│                                  │   │ No Sign of Weakness            ⋮ │
│                                  │   │ Burna Boy                        │
├──────────────────────────────────┤   │ ...  swipe → queue, ← like       │
│ mini-player                      │   ├──────────────────────────────────┤
│  Home      Search      Library   │   │ mini-player / nav                │
└──────────────────────────────────┘   └──────────────────────────────────┘

ARTIST                                 NOW PLAYING
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ‹                                │   │ ⌄     PLAYING FROM ALBUM      ⋮  │
│░░░░░░░░ banner photo ░░░░░░░░░░░░│   │       No Sign Of Weakness        │
│░░ parallax 0.5×      ░░░░░░░░░░░░│   │                                  │
│ Burna Boy                        │   │  ┌────────────────────────────┐  │
│ (display 32 over the photo)      │   │  │                            │  │
├──────────────────────────────────┤   │  │                            │  │  springs to 86%
│ Follow             ⤨       (▶)   │   │  │        album art           │  │  when paused;
│ Popular                          │   │  │                            │  │  swipe ← → skips
│ 1 ▢ Dai Dai                    ⋮ │   │  │                            │  │
│ 2 ▢ Last Last                  ⋮ │   │  └────────────────────────────┘  │
│ ...                              │   │ City Boys                     ♡  │
│ Discography    Albums | Singles  │   │ Burna Boy                        │
│ ┌──────┐ ┌──────┐ ┌──────┐       │   │ ━━━━━━━━━●──────────────────     │
│ └──────┘ └──────┘ └──────┘       │   │ 0:47                       -1:47 │  tabular
│ Fans also like                   │   │  ⤨     ⏮      (  ▶  )    ⏭    ↻ │
│ (●) (●) (●) (●)                  │   │                                  │
├──────────────────────────────────┤   │ 🖥 This phone           ⤴    ☰  │  device · share · queue
│ mini-player / nav                │   │ ┌ Lyrics ────────────────────┐   │  scroll down →
└──────────────────────────────────┘   │ │ I'm a sexy yout, you ...   │   │  lyrics card
                                       └──────────────────────────────────┘
(The 🖥 above stands for the Material "devices" glyph; no emoji in the UI.)

LYRICS                                 QUEUE (bottom sheet, 90% height)
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ⌄  City Boys · Burna Boy         │   │           ───                    │
│                                  │   │ Now playing                      │
│ Ayo, I'm not even gonna lie      │ dim│ ▢ City Boys · Burna Boy     ▮▮▮ │
│                                  │   │ Next in queue          Clear     │
│ I'm a sexy yout,                 │ ← active: full white, 28sp 800      │
│ you understand?                  │   │ ▢ Last Last · Burna Boy      ≡   │  drag handle
│                                  │   │ ▢ Ye · Burna Boy             ≡   │
│ Gyal all over the globe          │ dim│ Next from: City Boys Radio      │
│                                  │   │ ▢ Kilometre · Burna Boy      ≡   │
│ (tap any line to seek;           │   │ ...                              │
│  auto-scroll pauses 4s           │   │ swipe a row away to remove       │
│  after manual scroll)            │   │ ⤨ Shuffle   ↻ Repeat   ☾ Timer   │
│ ━━━━━━●──────────  ▶            │   └──────────────────────────────────┘
└──────────────────────────────────┘   palette background, same as Now Playing

SETTINGS
┌──────────────────────────────────┐
│ ‹  Settings                      │
│ YOUR PC                          │
│ Server          10.11.104.3:3001 │
│ ● Connected · Ghosttunes 1.0.9   │
│ [ Test connection ]  [ Find PC ] │
│ PLAYBACK                         │
│ Streaming quality        High  › │
│ Crossfade                 Off  › │
│ DOWNLOADS                        │
│ Download quality         High  › │
│ Storage used    54 MB     Manage │
│ SEND TO PC                       │
│ Flick to PC                 [●]  │
│ Sensitivity   Low ─●── High      │
│ Flick in background         [●]  │
│   while playing, screen on       │
│ NFC sticker          How to set up│
│ ABOUT                            │
│ Version 1.0.0 (1)  ← tap ×7 → Debug
└──────────────────────────────────┘
```

---

## 6. Architecture

```
mobile-android/
  settings.gradle.kts, gradle/libs.versions.toml
  app/
    data/      api (Retrofit + kotlinx.serialization), db (Room), prefs (DataStore), repositories
    playback/  PlaybackService (MediaLibraryService), PlayerFactory, QueueStore, StreamResolver
    handoff/   HandoffClient, HandoffCoordinator, FlickDetector (pure Kotlin), FlickSensor,
               HandoffActivity (translucent), SendToPcTileService
    download/  DownloadWorker, DownloadRepository
    ui/        theme (tokens), components, home, search, library, album, artist, playlist,
               nowplaying, lyrics, queue, settings, onboarding, debug
  baselineprofile/   macrobenchmark module that generates the startup profile
  docs/              API.md, PLAN.md, HANDOFF.md, screenshots/, proof/
```

- **Single activity**, Compose, Navigation Compose, **Hilt** for DI, ViewModels with `StateFlow` UI state.
- **Playback:** `MediaLibraryService` + ExoPlayer.
  - `AudioAttributes(USAGE_MEDIA, CONTENT_TYPE_MUSIC)` with `handleAudioFocus = true`.
  - `setHandleAudioBecomingNoisy(true)` pauses on headphone unplug.
  - `WAKE_MODE_NETWORK` keeps the CPU and Wi-Fi awake while streaming.
  - Data source: `ResolvingDataSource` maps `ghosttunes://track/<id>` → local file if downloaded, else `http://<pc>/api/stream/<id>`, wrapped in a 256 MB `SimpleCache` over `OkHttpDataSource`.
  - The full queue is in ExoPlayer's timeline, so it buffers the next item itself. `StreamResolver` additionally calls S1 `prepare` on tap and 30 s before each transition.
  - Notification, lock screen and Bluetooth/headset buttons come from `MediaSession` for free.
  - The UI talks to the service only through a `MediaController`.
- **Restore:** queue + index + position are saved to Room/DataStore every 5 s and on pause. `onPlaybackResumption` supports Android's "resume" media card.
- **Downloads:** `DownloadWorker` (foreground, progress notification) → `filesDir/downloads/<id>.audio` + `<id>.jpg`, recorded in Room. Album/playlist downloads enqueue one unique work per track.
- **Images:** Coil 3 with the OkHttp client, 50 MB disk cache, URL size rewriting (API.md §Track). Palette is extracted from a 128px bitmap on a background dispatcher and cached per track id.
- **Cleartext HTTP:** Android's network security config can't express "any private-network IP", and the PC address is entered at runtime. So `base-config` allows cleartext, and an OkHttp interceptor **rejects any `http://` request whose host isn't a private, link-local or loopback address** (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, 10.0.2.2). Images and everything external stay HTTPS-only. (Same effect as "local server only", enforced in code.)
- **Handoff:** `HandoffCoordinator` (in the service process, so NFC/tile/flick work without the UI) implements PUSH/PULL exactly as the desktop does (poll 300 ms, 15 s timeout, release on timeout, 0.9 s fade with `player.volume`). The pill is shown by whichever UI is on top (main activity or `HandoffActivity`); if none is, a short notification-style toast.
- **Flick:** `FlickDetector` is a pure Kotlin class, a port of the desktop detector that's already tested: push ≥ 19 m/s² with > 70% on one axis, brake ≥ 11 m/s² opposite within 380 ms, steady-before window, warm-up, 5 s cooldown. Sensitivity scales the thresholds (Low ×1.2, Medium ×1.0, High ×0.85). `FlickSensor` registers `TYPE_LINEAR_ACCELERATION` at 10 ms (fallback: accelerometer + low-pass gravity). It's registered in the activity while the app is visible, and in the service only while **playing + screen interactive + background setting on**. It unregisters on pause or `SCREEN_OFF`.
- **Pocket rejection** (new vs desktop): also require the proximity sensor to read "far" when available, and require the device not to be face-down (gravity z > −7). The JVM tests cover pocket traces explicitly.

### Libraries (exact versions pinned in Phase 1 from the current stable releases)

Kotlin 2.x + Compose compiler plugin, AGP 8.x, Compose BOM, Material 3 (theme fully overridden), Navigation Compose, Media3 (exoplayer, session, datasource-okhttp), Retrofit + kotlinx-serialization converter, OkHttp, Coil 3, Room (KSP), DataStore, WorkManager, Hilt, androidx.palette, profileinstaller + baselineprofile plugin. Tests: JUnit 4, Turbine, Robolectric (only where needed).

- **minSdk 26.** compileSdk/targetSdk = the latest *stable* platform. API 37 is installed here; I'll confirm it's final (not a preview) with `sdkmanager --list` in Phase 1, else use 36.

---

## 7. Phases

| Phase | Deliverable | Proof |
| --- | --- | --- |
| **0** | API.md, PLAN.md (this) | real curl captures |
| **1** | Gradle project, design system, onboarding + subnet scan, PlaybackService, a bare search → play screen; server S1 + S2 | `dumpsys media_session` PLAYING, position moving, logcat clean; commit |
| **2** | All screens (Home, Search, Library, Album, Artist, Playlist, Now Playing, Lyrics, Queue, mini-player, Settings); server S3 + S4 | design review loop, screenshots in `docs/screenshots/`; commit |
| **3** | Downloads, restore, preload, artwork cache, paging, baseline profile, error states | offline play with the server stopped; design review again; commit |
| **4** | Phone handoff (PUSH/PULL), flick (activity + service), NFC translucent activity, QS tile, debug screen, HANDOFF.md | JVM flick tests; handoff against the desktop app; commit |
| **5** | Tests 1–12 from your brief, RESULTS.md | dumpsys / screencap / screenrecord / logcat per test |
| **6** | Release APK signed with a local keystore (outside git), default server pre-filled, desktop installer rebuilt | tests 1, 2, 4, 9 rerun on the release APK |

The desktop app only gets S1–S4 (additive) plus the handoff work already on this branch. `npm run typecheck`, `npm test` and `tests/handoff-endpoints.cjs` are rerun after every server change.

---

## 8. Environment check (2026-11-17)

| Item | Status |
| --- | --- |
| JDK | ✅ 21.0.5 at `C:\Users\Ghost\tools\jdk-21` (also 17.0.12) |
| Android SDK | ✅ at `C:\Users\Ghost\tools\android-sdk` (not `%LOCALAPPDATA%\Android\Sdk`): platforms 35, 37.0; build-tools 34, 35, 36; platform-tools 37.0.1 |
| Android Studio | ❌ not installed |
| Emulator package, system images, AVDs | ❌ none |
| CPU virtualization | ✅ enabled in firmware |
| Windows hypervisor (needed by the emulator) | ❌ not active (`HypervisorPresent = False`) |
| Phone over USB | none connected (`adb devices` empty) |
| RAM / free disk on C: | 13.9 GB / 22.9 GB (emulator + image + Gradle caches need ~10 GB) |
| PC Wi-Fi IPv4 | 10.11.104.3 (network "ug.edu.gh", Windows profile **Public**) |
| Port 3001 | held by the installed Ghosttunes 1.0.9 (`C:\Program Files\Ghosttunes`), which doesn't have the handoff routes |

### What you need to do before Phase 1

The only step I can't do for you is turning on the Windows hypervisor (admin + reboot). Everything else can be done from the command line with the SDK you already have. Pick one route:

**Route A — Android Studio (simplest, ~3 GB more disk)**
1. Download Android Studio from https://developer.android.com/studio and run the installer with defaults.
2. Open it → *More Actions* → *SDK Manager*. Set *Android SDK Location* to `C:\Users\Ghost\tools\android-sdk` so it reuses your SDK.
3. *SDK Tools* tab → tick **Android Emulator** and **Android Emulator hypervisor driver (installer)** → Apply.
4. *Device Manager* → *Create device* → **Pixel 8** → system image **API 35, Google APIs, x86_64** → Finish.
5. Start the AVD once to confirm it boots.

**Route B — no Android Studio (lighter)**
1. Open **Turn Windows features on or off** (Start → type `optionalfeatures`), tick **Windows Hypervisor Platform**, OK, and **reboot**.
   Or from an admin PowerShell:
   ```powershell
   Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
   ```
2. Tell me it's done. I'll then run:
   ```bash
   sdkmanager "emulator" "system-images;android-35;google_apis;x86_64"
   avdmanager create avd -n GhostPixel -k "system-images;android-35;google_apis;x86_64" -d pixel_8
   emulator -avd GhostPixel -gpu host
   ```
   (~2.5 GB download.)

With either route, **quit the installed Ghosttunes on the PC while I test**, or let me use a different port for the dev server. Its server on 3001 is the old one without handoff, and the emulator reaches the PC only at `10.0.2.2:3001`.

---

## 9. Decisions for you

1. **Emulator route:** A (Android Studio) or B (command line + enable Windows Hypervisor Platform)?
2. **Server additions S1–S4:** OK to add? S1 (stream prepare) is the important one; without it every new song takes ~10 s to start.
3. **Real phone:** will you plug yours in with USB debugging for Phase 5 (needed to prove the physical flick and NFC)?
4. **Campus Wi-Fi:** your PC is on "ug.edu.gh". University networks usually block device-to-device traffic, so a real phone may not reach `10.11.104.3:3001` even with the firewall open. The emulator isn't affected. For real-phone tests, a phone hotspot or home Wi-Fi may be needed.
5. **Out of scope for v1 unless you say otherwise:** listening rooms, syncing playlists/likes with the desktop, Chromecast, Android Auto, widgets, tablets/landscape layouts.
6. **Release signing:** I'll generate `ghosttunes-mobile.jks` outside the repo (in `%USERPROFILE%\.ghosttunes-keys\`) and report the passwords in the final summary, as you asked. Note that anyone who reads that summary can sign updates as you.
