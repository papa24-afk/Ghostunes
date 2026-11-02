## Summary of Changes

Ghosttunes duplicated its navigation, used a large search-result layout for saved songs, and could mix different songs' details in session recovery. This change gives the desktop app a dedicated Home screen, clearer collection layouts, and consistent playback recovery. It also repairs the Android debug build and lets phone testers configure a reachable music server.

- Keep primary navigation in the sidebar; add section back/forward controls and an explicit Now Playing destination.
- Preserve provider artwork URLs with bounded image fallbacks, anchor the collapse toggle at the sidebar edge, and keep final rows above the player.
- Add compact search results, collection filtering/sorting, saved grid/list layouts, and upcoming queue reordering.
- Present simple Audio Lab presets with advanced equalizer controls available on demand.
- Scope keyboard shortcuts to the active screen so spacebar can repeatedly pause and resume without duplicate handling.
- Restore the saved queue and position after metadata loads. Show playback errors with retry instead of silently substituting another song.
- Update one history row per listen, correct the play-count label, and calculate artist/album counts from recorded data. Preserve existing historical entries.
- Align Android with the Capacitor 7 toolchain, add portable APK build/verification commands, and add a tested mobile music-server setting. The debug runner enables HTTP access for local Wi-Fi testing.

## Type of Change

- [x] Bug fix
- [x] New feature
- [x] Documentation update
- [x] Test addition or improvement

## Verification & Testing

- [x] `npm run typecheck`
- [x] `npm test` — original desktop engine tests plus session/history regressions
- [x] `npm run build`
- [x] `npm run test:ui` — headless Chrome at 1440×900 and 1024×768 with fixture data and generated silent audio
- [x] `npm run verify:android` — debug APK assembly, the existing scaffold unit test, and Android lint (zero errors; 23 warnings)
- [x] `npm run test:android:ui` — mobile navigation, search and custom server setting with mocked responses
- [x] APK debug signature and packaged web assets verified
- [ ] Native Electron and packaged DMG smoke test
- [ ] Android device install, live streaming and background playback

Browser interaction checks cover Home, navigation, search, collection filters, session details, metadata-ready resume using generated silent audio, queue ordering, Audio Lab, playback failure, artwork recovery, and fully visible final rows at laptop sizes. Run instructions are in `docs/desktop-experience.md`.

## UI Changes

Browser checks save review screenshots under the ignored `test_sandbox/ui` directory. Attach the relevant screenshots when opening this PR.

## Contributor Checklist

- [x] Performed a self-review.
- [x] Added regression coverage for session recovery and history checkpoints.
- [x] Updated documentation for changed desktop behaviour.
- [x] No secrets, environment files, or personal listening data are included.

Android output is a debug test APK. It needs a reachable Node backend; native managed offline downloads and background playback are not verified. Android version identity remains `1.0.2` / code `1`, and production release signing is still configured with the debug key. Test setup and artifact details are in `docs/android-verification.md`.

Native macOS installation/update validation remains separate from this UI and playback change.
