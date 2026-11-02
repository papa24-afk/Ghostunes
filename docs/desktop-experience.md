# Desktop experience

The sidebar is the main desktop navigation. The header provides section back/forward navigation, music search, Now Playing, and tools. Sidebar auto-collapse is off by default for new preferences; an existing saved preference is respected. Change it under **Settings & help → Preferences**. Developer contact is in the same menu under Help. The collapse toggle sits at the left edge above the sidebar; native macOS builds leave space for their window controls.

Home shows the current or saved listening session, playlists, recent music, and favourites. Now Playing opens the artwork carousel and lyrics. Search shows a compact top result and a song list, with artist links when matching artist names occur in the returned songs. Genre browsing is separate from a typed search.

Library and Favourites support collection filtering and sorting. Their grid/list preference is saved on this device. Playlist details provide their own song filter. The queue opens from the bottom player or the Q shortcut. Use the up/down buttons to reorder upcoming songs; the current song and previously played entries stay in place.

Audio Lab starts with presets. Expand **Advanced equalizer** to adjust individual frequencies and preamp gain.

Covers retain the provider's supplied image URL, then try available image sizes and video thumbnails if loading fails. Albums use their own artwork rather than treating release IDs as video IDs. When no image is available, the app displays a consistent music icon instead of a broken image. The player bar occupies its own layout row so the final song or release can scroll fully into view.

Spacebar toggles playback once per press in the active desktop or lyrics screen. Hidden views do not consume playback shortcuts, and typing in search leaves playback alone.

## Playback and listening history

The last queue, index, and position are restored without automatically playing audio. Press Resume or Play to continue. The saved position is applied once audio metadata is ready. Snapshots are refreshed every five seconds and when pausing or leaving the app.

A local file failure may retry the same recording online when offline mode is disabled. Failed streams show a retry action and preserve the selected song's identity. Playback no longer silently substitutes the first alternative search result.

Listening checkpoints update one history row for each listen. Pausing and resuming retains that row; selecting a song again creates a new listen. Existing historical rows are preserved because the app cannot safely distinguish an old duplicate from a separate listen. Artist and album counts use recorded values, and the play count is labelled Total plays.

## Verification

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` includes the original desktop engine tests and the session/history and artwork regression checks. To run only the latter:

```sh
npm run test:experience
```

Browser checks also verify artwork recovery, the collapse toggle position, and final rows above the player at both laptop sizes. For browser interaction checks, start the development server in one terminal:

```sh
npm run client -- --host 127.0.0.1
```

In another terminal, run:

```sh
npm run test:ui
```

The browser suite uses Google Chrome's standard macOS installation by default. Set `CHROME_PATH` to a Chrome/Chromium executable elsewhere, or install Playwright's Chromium on other platforms. Set `TEST_BASE_URL` when the preview uses another address.

Tests use a fresh browser profile, fixture catalogue data, and generated silent audio. Screenshots are written to the ignored `test_sandbox/ui` directory. These checks do not validate the live music provider, macOS signing, installer updates, or native media keys; verify those separately in a packaged build.
