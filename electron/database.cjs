// electron/database.cjs
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class GhosttunesDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.initTables();
  }

  initTables() {
    // Schema Migrations & Base Tables
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT,
        album TEXT,
        duration REAL,
        thumbnail TEXT,
        local_audio_path TEXT,
        local_artwork_path TEXT,
        file_size INTEGER DEFAULT 0,
        mime_type TEXT,
        source TEXT,
        offline_available INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS downloads (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        thumbnail TEXT,
        source_url TEXT,
        status TEXT NOT NULL,
        progress REAL DEFAULT 0,
        bytes_downloaded INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        error_message TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS playlist_tracks (
        playlist_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        track_order INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, track_id)
      );

      CREATE TABLE IF NOT EXISTS favorites (
        track_id TEXT PRIMARY KEY,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lyrics_cache (
        track_id TEXT PRIMARY KEY,
        lyrics_json TEXT,
        lyrics_format TEXT,
        plain_lyrics TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS song_dna (
        track_id TEXT PRIMARY KEY,
        bpm REAL,
        energy REAL,
        danceability REAL,
        acousticness REAL,
        instrumentalness REAL,
        valence REAL,
        mood_label TEXT,
        genre_labels TEXT,
        provenance TEXT DEFAULT 'inferred',
        confidence REAL DEFAULT 0.7,
        analysis_version INTEGER DEFAULT 1,
        analyzed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS listening_history (
        id TEXT PRIMARY KEY,
        track_id TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration REAL,
        played_at INTEGER NOT NULL,
        duration_played REAL DEFAULT 0,
        completion_ratio REAL DEFAULT 0,
        session_id TEXT,
        source TEXT DEFAULT 'manual'
      );

      CREATE INDEX IF NOT EXISTS idx_history_played_at ON listening_history(played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_track_id ON listening_history(track_id);
      CREATE INDEX IF NOT EXISTS idx_history_artist ON listening_history(artist);
    `);

    // Ensure schema version recorded
    const row = this.db.prepare(`SELECT version FROM schema_version WHERE version = 1`).get();
    if (!row) {
      this.db.prepare(`INSERT INTO schema_version (version, applied_at) VALUES (1, ?)`).run(Date.now());
    }
  }

  // --- Track Operations ---
  upsertTrack(track) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO tracks (
        id, title, artist, album, duration, thumbnail,
        local_audio_path, local_artwork_path, file_size, mime_type,
        source, offline_available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        duration = excluded.duration,
        thumbnail = excluded.thumbnail,
        local_audio_path = COALESCE(excluded.local_audio_path, tracks.local_audio_path),
        local_artwork_path = COALESCE(excluded.local_artwork_path, tracks.local_artwork_path),
        file_size = CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE tracks.file_size END,
        mime_type = COALESCE(excluded.mime_type, tracks.mime_type),
        source = COALESCE(excluded.source, tracks.source),
        offline_available = excluded.offline_available,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      track.id,
      track.title || 'Untitled',
      track.artist || 'Unknown Artist',
      track.album || '',
      track.duration || 0,
      track.thumbnail || '',
      track.local_audio_path || null,
      track.local_artwork_path || null,
      track.file_size || 0,
      track.mime_type || 'audio/mpeg',
      track.source || 'download',
      track.offline_available ? 1 : 0,
      now,
      now
    );
  }

  getTrack(trackId) {
    return this.db.prepare(`SELECT * FROM tracks WHERE id = ?`).get(trackId);
  }

  getAllDownloadedTracks() {
    return this.db.prepare(`
      SELECT * FROM tracks 
      WHERE offline_available = 1 AND local_audio_path IS NOT NULL 
      ORDER BY updated_at DESC
    `).all();
  }

  deleteTrack(trackId) {
    this.db.prepare(`DELETE FROM tracks WHERE id = ?`).run(trackId);
    this.db.prepare(`DELETE FROM downloads WHERE track_id = ?`).run(trackId);
    this.db.prepare(`DELETE FROM playlist_tracks WHERE track_id = ?`).run(trackId);
    this.db.prepare(`DELETE FROM favorites WHERE track_id = ?`).run(trackId);
  }

  // --- Downloads Operations ---
  upsertDownload(record) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO downloads (
        id, track_id, title, artist, thumbnail, source_url,
        status, progress, bytes_downloaded, total_bytes, error_message,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        progress = excluded.progress,
        bytes_downloaded = excluded.bytes_downloaded,
        total_bytes = excluded.total_bytes,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      record.id,
      record.track_id,
      record.title || '',
      record.artist || '',
      record.thumbnail || '',
      record.source_url || '',
      record.status || 'queued',
      record.progress || 0,
      record.bytes_downloaded || 0,
      record.total_bytes || 0,
      record.error_message || null,
      now,
      now
    );
  }

  getDownload(downloadId) {
    return this.db.prepare(`SELECT * FROM downloads WHERE id = ?`).get(downloadId);
  }

  getAllDownloads() {
    return this.db.prepare(`SELECT * FROM downloads ORDER BY updated_at DESC`).all();
  }

  deleteDownload(downloadId) {
    this.db.prepare(`DELETE FROM downloads WHERE id = ?`).run(downloadId);
  }

  // --- Lyrics Cache Operations ---
  cacheLyrics(trackId, lyricsJson, lyricsFormat = 'synced', plainLyrics = '') {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO lyrics_cache (track_id, lyrics_json, lyrics_format, plain_lyrics, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        lyrics_json = excluded.lyrics_json,
        lyrics_format = excluded.lyrics_format,
        plain_lyrics = excluded.plain_lyrics,
        updated_at = excluded.updated_at
    `);
    stmt.run(trackId, typeof lyricsJson === 'string' ? lyricsJson : JSON.stringify(lyricsJson), lyricsFormat, plainLyrics, now);
  }

  getCachedLyrics(trackId) {
    const row = this.db.prepare(`SELECT * FROM lyrics_cache WHERE track_id = ?`).get(trackId);
    if (!row) return null;
    try {
      return {
        lyrics: row.lyrics_json ? JSON.parse(row.lyrics_json) : [],
        format: row.lyrics_format || 'synced',
        plainLyrics: row.plain_lyrics || ''
      };
    } catch {
      return null;
    }
  }

  // --- Favorites Operations ---
  setFavorite(trackId, isFavorite) {
    if (isFavorite) {
      this.db.prepare(`
        INSERT OR IGNORE INTO favorites (track_id, added_at) VALUES (?, ?)
      `).run(trackId, Date.now());
    } else {
      this.db.prepare(`DELETE FROM favorites WHERE track_id = ?`).run(trackId);
    }
  }

  getFavorites() {
    return this.db.prepare(`
      SELECT t.* FROM tracks t
      JOIN favorites f ON t.id = f.track_id
      ORDER BY f.added_at DESC
    `).all();
  }

  isFavorite(trackId) {
    const row = this.db.prepare(`SELECT track_id FROM favorites WHERE track_id = ?`).get(trackId);
    return !!row;
  }

  // --- Playlists Operations ---
  savePlaylist(playlist, trackIds = []) {
    const now = Date.now();
    const title = playlist.title || playlist.name || 'Untitled Playlist';
    const description = playlist.description || '';
    const coverUrl = playlist.cover_url || playlist.thumbnail || '';

    this.db.prepare(`
      INSERT INTO playlists (id, title, description, cover_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        cover_url = excluded.cover_url,
        updated_at = excluded.updated_at
    `).run(playlist.id, title, description, coverUrl, now, now);

    this.db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ?`).run(playlist.id);

    const insertPt = this.db.prepare(`
      INSERT INTO playlist_tracks (playlist_id, track_id, track_order)
      VALUES (?, ?, ?)
    `);

    trackIds.forEach((tId, idx) => {
      insertPt.run(playlist.id, tId, idx);
    });
  }

  getPlaylists() {
    const playlists = this.db.prepare(`SELECT * FROM playlists ORDER BY updated_at DESC`).all();
    const getTracksStmt = this.db.prepare(`
      SELECT t.* FROM tracks t
      JOIN playlist_tracks pt ON t.id = pt.track_id
      WHERE pt.playlist_id = ?
      ORDER BY pt.track_order ASC
    `);

    return playlists.map(p => ({
      ...p,
      name: p.title,
      tracks: getTracksStmt.all(p.id)
    }));
  }

  deletePlaylist(playlistId) {
    this.db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ?`).run(playlistId);
    this.db.prepare(`DELETE FROM playlists WHERE id = ?`).run(playlistId);
  }

  // --- Settings & Storage Info ---
  getSetting(key, defaultValue = null) {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
    return row ? row.value : defaultValue;
  }

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  getStorageStats() {
    const tracks = this.getAllDownloadedTracks();
    let totalBytes = 0;
    tracks.forEach(t => {
      totalBytes += Number(t.file_size || 0);
    });
    return {
      downloadedCount: tracks.length,
      totalBytes,
      totalFormatted: (totalBytes / (1024 * 1024)).toFixed(1) + ' MB'
    };
  }

  // --- Settings Operations ---
  getSetting(key) {
    try {
      const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : null;
    } catch (e) {
      console.warn('[DB] getSetting error:', e.message);
      return null;
    }
  }

  setSetting(key, value) {
    try {
      this.db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch (e) {
      console.warn('[DB] setSetting error:', e.message);
    }
  }

  // --- Song DNA Operations ---
  saveSongDna(dna) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO song_dna (
        track_id, bpm, energy, danceability, acousticness, instrumentalness,
        valence, mood_label, genre_labels, provenance, confidence, analysis_version, analyzed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(track_id) DO UPDATE SET
        bpm = excluded.bpm,
        energy = excluded.energy,
        danceability = excluded.danceability,
        acousticness = excluded.acousticness,
        instrumentalness = excluded.instrumentalness,
        valence = excluded.valence,
        mood_label = excluded.mood_label,
        genre_labels = excluded.genre_labels,
        provenance = excluded.provenance,
        confidence = excluded.confidence,
        analysis_version = excluded.analysis_version,
        analyzed_at = excluded.analyzed_at
    `);

    stmt.run(
      dna.track_id,
      dna.bpm ?? null,
      dna.energy ?? null,
      dna.danceability ?? null,
      dna.acousticness ?? null,
      dna.instrumentalness ?? null,
      dna.valence ?? null,
      dna.mood_label || '',
      typeof dna.genre_labels === 'string' ? dna.genre_labels : JSON.stringify(dna.genre_labels || []),
      dna.provenance || 'inferred',
      dna.confidence ?? 0.7,
      dna.analysis_version || 1,
      now
    );
  }

  getSongDna(trackId) {
    const row = this.db.prepare(`SELECT * FROM song_dna WHERE track_id = ?`).get(trackId);
    if (!row) return null;
    let genres = [];
    try {
      genres = JSON.parse(row.genre_labels || '[]');
    } catch {
      genres = row.genre_labels ? [row.genre_labels] : [];
    }
    return {
      ...row,
      genre_labels: genres
    };
  }

  getAllSongDna() {
    const rows = this.db.prepare(`SELECT * FROM song_dna`).all();
    return rows.map(r => {
      let genres = [];
      try {
        genres = JSON.parse(r.genre_labels || '[]');
      } catch {
        genres = r.genre_labels ? [r.genre_labels] : [];
      }
      return { ...r, genre_labels: genres };
    });
  }

  // --- Music Memory (Listening Graph) Operations ---
  recordPlay(entry) {
    const now = Date.now();
    const id = entry.id || `play_${now}_${Math.random().toString(36).substr(2, 6)}`;
    const stmt = this.db.prepare(`
      INSERT INTO listening_history (
        id, track_id, title, artist, album, duration, played_at,
        duration_played, completion_ratio, session_id, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      entry.track_id,
      entry.title || 'Untitled',
      entry.artist || 'Unknown Artist',
      entry.album || '',
      entry.duration || 0,
      entry.played_at || now,
      entry.duration_played || 0,
      entry.completion_ratio || 0,
      entry.session_id || null,
      entry.source || 'manual'
    );
    return id;
  }

  getListeningHistory(limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM listening_history
      ORDER BY played_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  getListeningStats() {
    const totalRow = this.db.prepare(`
      SELECT COUNT(*) as total_plays, COALESCE(SUM(duration_played), 0) as total_seconds
      FROM listening_history
    `).get();

    const topArtists = this.db.prepare(`
      SELECT lh.artist, COUNT(*) as plays, COALESCE(SUM(lh.duration_played), 0) as total_seconds,
             COALESCE((
               SELECT t.thumbnail 
               FROM listening_history lh2 
               LEFT JOIN tracks t ON t.id = lh2.track_id 
               WHERE lh2.artist = lh.artist AND t.thumbnail IS NOT NULL AND t.thumbnail != '' 
               LIMIT 1
             ), '') as thumbnail
      FROM listening_history lh
      WHERE lh.artist IS NOT NULL AND lh.artist != '' AND lh.artist != 'Unknown Artist'
      GROUP BY lh.artist
      ORDER BY plays DESC
      LIMIT 10
    `).all();

    const topTracks = this.db.prepare(`
      SELECT lh.track_id, lh.title, lh.artist, COUNT(*) as plays, MAX(lh.played_at) as last_played,
             COALESCE(t.thumbnail, '') as thumbnail
      FROM listening_history lh
      LEFT JOIN tracks t ON t.id = lh.track_id
      GROUP BY lh.track_id
      ORDER BY plays DESC
      LIMIT 15
    `).all();

    // Unique track count & discovery count (tracks played only once)
    const discoveryRow = this.db.prepare(`
      SELECT COUNT(*) as unique_tracks
      FROM (SELECT track_id FROM listening_history GROUP BY track_id)
    `).get();

    return {
      totalPlays: totalRow ? totalRow.total_plays : 0,
      totalListeningMinutes: totalRow ? Math.round(totalRow.total_seconds / 60) : 0,
      uniqueTracks: discoveryRow ? discoveryRow.unique_tracks : 0,
      topArtists: topArtists || [],
      topTracks: topTracks || []
    };
  }

  clearListeningHistory(options = {}) {
    if (options.all) {
      this.db.prepare(`DELETE FROM listening_history`).run();
      return { cleared: 'all' };
    }
    if (options.trackId) {
      this.db.prepare(`DELETE FROM listening_history WHERE track_id = ?`).run(options.trackId);
      return { cleared: 'track', trackId: options.trackId };
    }
    if (options.id) {
      this.db.prepare(`DELETE FROM listening_history WHERE id = ?`).run(options.id);
      return { cleared: 'entry', id: options.id };
    }
    if (options.beforeTimestamp) {
      this.db.prepare(`DELETE FROM listening_history WHERE played_at < ?`).run(options.beforeTimestamp);
      return { cleared: 'before', timestamp: options.beforeTimestamp };
    }
    return { cleared: 0 };
  }

  exportListeningData() {
    const history = this.db.prepare(`SELECT * FROM listening_history ORDER BY played_at DESC`).all();
    const stats = this.getListeningStats();
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      developerCredits: 'D!g!†@L G#0$†',
      stats,
      history
    };
  }

  close() {
    try {
      this.db.close();
    } catch (e) {
      console.warn('[DB] Close warning:', e.message);
    }
  }
}

module.exports = { GhosttunesDatabase };
