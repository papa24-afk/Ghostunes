# Ghosttunes 🎵

[![Build Status](https://github.com/papa24-afk/Ghostunes/actions/workflows/ci.yml/badge.svg)](https://github.com/papa24-afk/Ghostunes/actions/workflows/ci.yml)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Electron Version](https://img.shields.io/badge/electron-45.0.0-blue.svg)](https://www.electronjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/papa24-afk/Ghostunes?color=e0536c&label=Windows%20Installer)](https://github.com/papa24-afk/Ghostunes/releases/latest)

> **Ghosttunes** is a modern, high-fidelity music streaming and desktop player application for Windows. Powered by React, TypeScript, and Electron, it combines ad-free streaming with real-time synchronized karaoke lyrics, an offline SQLite download engine, intelligent autoplay radio, and deep personalization.

---

## 📥 Download Windows Installer

Get the latest production release ready to run on Windows 10 & 11:

[**⬇️ Download Ghosttunes-Setup-1.0.0.exe (137 MB)**](https://github.com/papa24-afk/Ghostunes/releases/download/v1.0.0/Ghosttunes-Setup-1.0.0.exe)

* **Current Version:** `1.0.0`
* **Official Release Notes:** [Ghosttunes v1.0.0 on GitHub Releases](https://github.com/papa24-afk/Ghostunes/releases/tag/v1.0.0)
* **SHA-256 Checksum:** `E7773F3C8BB513EDC2CDEF5C8382AA9008A0194846F7FCF55810EE98EAD3481E`

---

## ✨ Features

- **Ad-Free Music Streaming:** Fast, unthrottled streaming powered by YouTube's InnerTube music catalog.
- **Synchronized Karaoke Lyrics:** Real-time word- and line-level synchronized lyrics via LRCLIB and community lyric sources, with click-to-seek support.
- **Robust Offline Engine:** Download songs and playlists directly to local storage with automated SQLite metadata caching, duplicate prevention, and pause/resume support using HTTP Range requests.
- **Smart Autoplay Radio:** Continuous music recommendation engine with four distinct modes:
  - *Similar Tracks:* Sonic similarity and catalog clustering.
  - *Artist Focus:* Deeper dives into catalog from the same or related artists.
  - *Discover:* Curated recommendations outside immediate rotation.
  - *Balanced:* Smart blend of familiar hits and fresh discoveries.
- **Playlist Management & Multi-Platform Import:** Create, reorder, rename, and manage playlists. Import external playlists from Spotify, Deezer, Apple Music, and YouTube with fuzzy-matching reconciliation.
- **Visual Customization & Wallpapers:** Choose from dynamic theme presets, OLED deep black, custom desktop wallpapers with blur controls, and tailored player layouts.
- **System Media Integration:** Native Windows System Media Transport Controls (SMTC) integration, keyboard media key listeners, and HTML5 `MediaSession` lock screen support.
- **Audio Lab & Listening Rooms:** Audio tuning features and experimental synchronized multi-client listening rooms.

---

## 🏗️ Architecture

Ghosttunes operates as a hybrid Electron desktop application:

```text
┌────────────────────────────────────────────────────────┐
│                   Electron Main Process                │
│    (Window management, SQLite database, IPC bridge)    │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
┌──────────────▼──────────┐    ┌──────────▼──────────────┐
│  React 19 + TypeScript   │    │  Local Express Server   │
│     Frontend (Vite)     │◄───┤    (Port 3001 Proxy)    │
│ (Tailwind CSS, Lucide)  │    │ (Stream & API Handler)  │
└─────────────────────────┘    └─────────────────────────┘
```

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS.
- **Desktop Runtime:** Electron 45, custom native IPC channels, secure preload isolation.
- **Persistence:** SQLite (`better-sqlite3`) for playlists, favorites, offline download manifests, and listening history.
- **Audio Engine:** HTML5 Web Audio API, native audio element routing, and stream proxying.

---

## 📋 Prerequisites

Before setting up Ghosttunes locally, ensure you have:

- **Windows 10 or Windows 11 (x64)**
- **Node.js:** `v18.0.0` or higher (LTS recommended)
- **npm:** `v9.0.0` or higher
- **Git**

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/papa24-afk/Ghostunes.git
cd Ghostunes
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example configuration file:

```bash
cp .env.example .env
```

*(Optional)* Configure Spotify, Deezer, or Apple Music keys in `.env` if you wish to use external playlist import features. Core streaming and offline playback work out of the box without any third-party API keys.

### 4. Run in Development Mode

Run the local backend and Vite frontend simultaneously:

```bash
# Web browser development mode
npm run dev
```

Open your browser at `http://localhost:5173`.

To run the complete **Electron Desktop** application in development:

```bash
npm run desktop:dev
```

---

## 🧪 Testing & Verification

Run the test suite to verify the offline engine, database persistence, and stream handling:

```bash
npm test
```

Type check the TypeScript codebase:

```bash
npx tsc --noEmit
```

Build the production web bundle:

```bash
npm run build
```

---

## 📦 Packaging Production Binaries

### Build Portable Directory

```bash
npm run build:desktop
```
The unpacked binary will be generated in `release/win-unpacked/Ghosttunes.exe`.

### Build Windows NSIS Setup Installer

```bash
npm run build:installer
```
The installer executable will be generated in `release/Ghosttunes-Setup-1.0.0.exe`.

---

## 🤝 Contributing

We welcome contributions from developers worldwide! Please review our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before opening an issue or submitting a pull request.

1. **Fork** the repository on GitHub.
2. **Create a branch** for your feature or bugfix (`git checkout -b feature/amazing-feature`).
3. **Commit your changes** with descriptive commit messages.
4. **Verify tests and builds** pass cleanly (`npm test`, `npx tsc --noEmit`, `npm run build`).
5. **Open a Pull Request** against the `main` branch.

---

## 🔒 Security

For security vulnerability disclosures, please refer to our [Security Policy](SECURITY.md). Do not report vulnerabilities publicly via GitHub issues.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — see the [LICENSE](LICENSE) file for details.
