# Android verification

This repository includes an Android Capacitor shell. An APK build and a working public Android release are separate checks.

## Source findings

| Area | Finding |
| --- | --- |
| Build entrypoint | The original command called `gradlew.bat` on every OS. `npm run build:apk` now uses a portable Node runner. |
| Native toolchain | Aligned with Capacitor 7: Java 21, Android Gradle Plugin 8.7.2, Gradle 8.11.1, Android SDK 35. The app previously overrode Java 21 with Java 17 and used an older plugin/wrapper. |
| Backend | Native mobile defaults to `http://10.0.2.2:3001`, which reaches a development computer from an Android emulator. The APK does not bundle the Node/Express server. A real phone can set a reachable backend in Settings → Music server, or use a URL supplied at build time through `VITE_API_BASE_URL`. |
| Offline library | SQLite downloads, local import, and download management use Electron APIs. Android's Download action follows the browser download path; this is not an implemented native offline library. |
| Background playback | No native foreground audio service is declared in the app manifest. Lock-screen/background behaviour requires device testing. Permissions alone do not verify playback. |
| Release identity | Android declares version name `1.0.2` and version code `1`; the JavaScript package is `1.0.5`. Versioning must be reconciled against any previously distributed APK before publishing an update. |
| Signing | The existing release build configuration uses the debug signing configuration. A production signing identity has not been provided or verified. |
| Automated release | The GitHub release workflow builds macOS and Windows installers, not Android APKs or app bundles. |
| Instrumentation | Corrected the scaffold test's expected package from `com.getcapacitor.app` to `com.ghosttunes.app`. This is a package check, not a music playback test. |

Toolchain versions follow the [Capacitor 7 upgrade guide](https://capacitorjs.com/docs/v7/updating/7-0).

## Reproduce the build checks

Install Java 21 and Android SDK 35, including platform tools and SDK build tools. Configure `JAVA_HOME` and `ANDROID_HOME` or the Android project's local SDK path. Then:

```sh
npm ci
npm run verify:android
```

This builds the web assets, syncs Capacitor, assembles a debug APK, runs Android unit tests, and runs debug lint. It does not run device instrumentation tests or publish a release.

The APK output is `android/app/build/outputs/apk/debug/app-debug.apk`. To build only the development APK:

```sh
npm run build:apk
```

The debug build runner enables Android WebView mixed content so the test APK can connect to a local HTTP backend. Other Capacitor syncs leave this setting off. Desktop `localhost` and the emulator alias are not a public backend.

## Install without USB debugging

Download the test APK on the phone, open it, and allow installation from that browser if Android prompts. USB debugging is not needed to install the APK this way. Device logs and automated native tests remain unavailable without debugging access.

For a test using your Mac as the backend:

1. Keep the Mac and phone on the same Wi-Fi.
2. Run `npm run server` from this repository on the Mac.
3. Find the Mac's Wi-Fi IP address in System Settings → Wi-Fi → Details → TCP/IP.
4. Open the APK's Settings → Music server and enter `http://MAC_WIFI_IP:3001`, replacing `MAC_WIFI_IP` with that address. Tap **Save and reconnect**.

Keep the backend running during testing. A phone using mobile data cannot reach that local Wi-Fi address. A separately hosted backend is needed for testing away from the Mac's network.

APKs and `release/` are ignored by Git. Push the source branch, then attach the APK to a GitHub **prerelease** through Releases → Draft a new release. Use an Android test tag such as `android-test-1`; tags starting with `v` trigger the existing desktop release workflow. Pushing source alone does not upload an APK.

## Mobile renderer check

With the local web preview running, `tests/android-mobile.browser.cjs` checks Home, Search, and Library at a Pixel-sized viewport. It simulates Capacitor detection and mocks API responses. It does not establish native WebView, live streaming, background playback, or offline download support.

## Verification results

- Production web build: passed.
- Capacitor Android sync: passed.
- TypeScript and desktop/session/artwork tests: passed.
- Mobile renderer navigation/search and saving a custom server with fixture data: passed.
- `npm run verify:android`: passed with Java 21, SDK 35, AGP 8.7.2 and Gradle 8.11.1.
- Android unit tests: passed (one existing scaffold arithmetic test; no playback coverage).
- Android debug lint: passed with zero errors and 23 warnings about scaffold resources, icons, deprecated checks, manifest ordering and newer dependency versions.
- APK signature verification: passed with the Android debug certificate.
- Packaged web assets: checked byte-for-byte against the current `dist/` build; test HTTP server support confirmed in packaged Capacitor configuration.
- Device install, live streaming, background audio and native offline behaviour: not verified.
- Production signed release: not verified.

## Test artifact

Built on 2 November 2026:

- File: `release/Ghosttunes-Android-test-1.0.2.apk` (about 14 MB).
- Package: `com.ghosttunes.app`; native version `1.0.2` / code `1`.
- Minimum Android API 23 (Android 6); target API 35.
- SHA-256: `ae6699a23125c3fd0ad435f7c9813c6371934d3c99ea1fc40656aaee5b566ea8`.

The checksum file is beside the APK. This is an installable debug build for manual testing, not a verified production release. No files have been pushed or uploaded to GitHub.

## Push the branch yourself

```sh
cd /Users/king/Documents/Ghostunes
git status --short
git add .
git diff --cached --stat
git commit -m "Improve desktop experience and prepare Android test build"
git push -u origin feat/desktop-experience-polish
```

PR description: `docs/desktop-experience-pr.md`. After pushing, attach the APK and its checksum file to an Android test prerelease as described above. The APK is intentionally excluded from the source commit.
