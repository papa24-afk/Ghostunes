# Ghosttunes Provider Capabilities & Legal Offline Audit

This document details the official API capabilities, terms of service, and offline restrictions for music streaming services integrated with Ghosttunes, establishing compliance with official developer policies.

---

## 1. Spotify

- **Catalogue Search & Metadata:**
  - Fully permitted via the official Spotify Web API (`/v1/search`, `/v1/tracks`, `/v1/albums`, `/v1/artists`).
  - Returns metadata including titles, artists, album artwork URLs, duration, and popularity.
- **Playlist Retrieval:**
  - Public playlists: accessible via client credentials token.
  - User private playlists: requires user OAuth authorization with `playlist-read-private` and `playlist-read-collaborative` scopes.
- **Playback Capabilities:**
  - Spotify Web Playback SDK is officially supported for browser playback in approved environments. Requires an active Spotify Premium subscription and relies on Widevine DRM Encrypted Media Extensions (EME).
- **Offline Downloads & Caching:**
  - **Strictly Prohibited.**
  - **Spotify Developer Terms (§III.2.b):** Explicitly states developers may not *"download, re-transmit, copy, or otherwise make available audio content or permanent copies"* outside Spotify's official first-party client applications.
  - **Enforcement in Ghosttunes:** Spotify tracks are marked with `online_only` / `drm_protected`. Ghosttunes does not attempt to rip, decrypt, or permanently download Spotify streams.

---

## 2. Apple Music

- **Catalogue Search & Metadata:**
  - Permitted via Apple Music API (`/v1/catalog/{storefront}/search`, `/v1/catalog/{storefront}/songs`).
  - Requires Apple Developer Team ID, MusicKit Key, and valid Developer Token (JWT).
- **Playlist Retrieval:**
  - Public Apple Music editorial and user playlists are retrievable.
  - User personal library access requires `MusicKit JS` authorization with a valid Music User Token (MUT).
- **Playback Capabilities:**
  - MusicKit JS allows browser audio playback for authenticated Apple Music subscribers, streaming protected HLS/FairPlay DRM streams.
- **Offline Downloads & Caching:**
  - **Strictly Prohibited.**
  - **Apple Music API Policy:** Offline storage of Apple Music audio streams is exclusively reserved for Apple's native apps (iOS Music app, macOS Music app, Windows Apple Music app). Third-party Web/Electron apps cannot decrypt or persist FairPlay DRM streams for offline storage.
  - **Enforcement in Ghosttunes:** Apple Music catalogue items are tagged as `online_only`. Ghosttunes informs the user when a track requires an active Apple Music subscription and internet access.

---

## 3. Deezer

- **Catalogue Search & Metadata:**
  - Public Deezer API allows search (`https://api.deezer.com/search`) and playlist fetching (`https://api.deezer.com/playlist/{id}`).
- **Playlist Retrieval:**
  - Supported for public playlists. User library requires OAuth (`basic_access`, `listening_history`).
- **Playback Capabilities:**
  - The public Deezer API provides 30-second preview audio clips. Full track streaming requires the Deezer JavaScript SDK or native partner SDKs with a paid Deezer HiFi/Premium account.
- **Offline Downloads & Caching:**
  - **Strictly Prohibited.**
  - **Deezer API Terms of Use:** Offline playback and file caching are forbidden for third-party client integrations. Third-party developers cannot store or record audio streams.
  - **Enforcement in Ghosttunes:** Deezer tracks are tagged as `online_only`.

---

## 4. YouTube / YouTube Music

- **Catalogue Search & Metadata:**
  - YouTube Data API v3 and YouTube Music endpoints provide track metadata, artist info, and playlist items.
- **Playlist Retrieval:**
  - Supported for public and unlisted playlists. Private playlists require Google OAuth.
- **Playback Capabilities:**
  - Official playback is provided via the YouTube IFrame Player API (`YT.Player`), which streams audio/video with player controls, analytics, and advertising compliance.
- **Offline Downloads & Caching:**
  - **Terms of Service Restriction:** Google Developer Terms of Service (§II.4.a) strictly prohibit *"downloading, capturing, or caching YouTube audio or video content"* without express written consent from Google or YouTube Premium offline features within official mobile applications.
  - **Enforcement in Ghosttunes:** Ghosttunes respects source authorization. Tracks from YouTube are streamed online via the player interface; permanent offline caching is only enabled for user-owned audio files and authorized audio sources.

---

## 5. Ghosttunes Managed Local Music Library & Authorized Sources

To deliver a 100% compliant, fully functional offline music experience on Windows, Ghosttunes implements a **Managed Local Music Library**:

1. **User-Imported Audio:** Users can import their own personal audio files (MP3, FLAC, WAV, AAC, OGG, M4A) directly into Ghosttunes' local library. Ghosttunes reads ID3 metadata and stores the files in the managed application storage directory.
2. **Authorized Sources:** Audio tracks explicitly distributed under Creative Commons (CC-BY, CC0), public domain, direct artist downloads, or licensed feeds are supported for individual and playlist downloads.
3. **Local Offline Playback:**
   - Serviced entirely through Electron's custom protocol (`ghosttunes-media://`) with full HTTP Range request support (`206 Partial Content`) for instantaneous seeking.
   - Zero dependence on the external network or Express server when offline.
   - Synchronized LRC lyrics and album artwork are cached in local SQLite and loaded offline.
4. **UI Transparency:**
   - Tracks with local audio files are marked with a green `Offline Ready` checkmark badge.
   - Tracks from third-party streaming providers that prohibit offline downloads are marked with `Online Streaming Only`.
