# Ghosttunes Mobile: test results

Status on 2026-11-17. **Not done.** Tests 1–10 have not been run because no Android device or emulator could run on this PC yet. Windows Hypervisor Platform is off (`HypervisorPresent = False`), so the emulator has no acceleration. The AVD `GhostPixel` (Pixel 7, API 35, Google APIs x86_64) is created and ready.

Second blocker found while testing: **YouTube is refusing stream lookups from this network** ("Sign in to confirm you're not a bot"). The unmodified installed Ghosttunes on port 3001 fails the same way, so this isn't caused by these changes. The 36 songs already downloaded on the PC (`%APPDATA%\metrolist-web\media`, e.g. *City Boys*, *Starboy*) still stream and can be used for the on-device tests.

| # | Test | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Fresh install → onboarding → search → play | **Not run** | Needs emulator |
| 2 | Pause / resume / next / prev / seek 1:30 | **Not run** | Needs emulator |
| 3 | Album auto-advance | **Not run** | Needs emulator |
| 4 | Screen off 60 s keeps playing | **Not run** | Needs emulator |
| 5 | Swiped from recents; media_session dispatch | **Not run** | Needs emulator |
| 6 | Download, stop server, play offline | **Not run** | Needs emulator |
| 7 | Kill + relaunch restores song + position | **Not run** | Needs emulator |
| 8 | Synced lyrics in sync | **Not run** (server side OK) | `/api/lyrics` returns 63 synced LRC lines for *City Boys*; `LrcTest` passes |
| 9 | PUSH handoff to PC | **Not run on device** (server side OK) | `tests/handoff-endpoints.cjs` 8/8 against the branch server (push 409 offline, SSE delivery, status, sanitising, queue cap 500→300) |
| 10 | PULL handoff from PC | **Not run on device** (server side OK) | Same script: presence → `/desktop` live position 100 → 101.01 s, release delivered |
| 11 | Flick detection | **Unit tests pass**; device and synthetic-trigger checks not run | `./gradlew :app:testDebugUnitTest`: 20/20 `FlickDetectorTest` (walking, running, pick-up, table, face-down, pocket ± proximity, 20 noise seeds), 29/29 overall |
| 12 | Desktop app still builds and plays | **Builds; packaged server streams** | `npm run typecheck` clean, `npm test` passes (15/15 + suites + 13 flick), `npm run build:installer` → `release/Ghosttunes-Setup-1.0.9.exe`; packaged `Ghosttunes.exe` server: health OK, `/api/stream/3az-NQCK57c` 200, 2,634,105 bytes. Desktop UI playback not exercised. |

## Build evidence

- `assembleDebug`: BUILD SUCCESSFUL, `app-debug.apk` 24.5 MB.
- `assembleRelease`: BUILD SUCCESSFUL, R8-minified, `app-release.apk` 3.55 MB, signed (`apksigner verify`: CN=Ghosttunes Mobile, SHA-256 `4002b8da…d38809`), `targetSdkVersion 35`, default server `http://10.11.104.3:3001` present in the dex.
- Server additions S1–S5 verified with curl (see `docs/API.md`). After `prepare`, the first audio byte took 0.22 s instead of ~10 s.

## To finish

1. Enable Windows Hypervisor Platform and reboot (PLAN.md §8, Route B).
2. Close the installed Ghosttunes (it holds port 3001 with the old server), install the new `Ghosttunes-Setup-1.0.9.exe`, open it.
3. Then tests 1–11 run on the emulator against `http://10.0.2.2:3001`, with `dumpsys media_session`, `dumpsys audio`, screenshots, a screen recording and logcat saved here. Screenshots for the design review go in `docs/screenshots/` (currently empty).
