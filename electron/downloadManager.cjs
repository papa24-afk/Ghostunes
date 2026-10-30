// electron/downloadManager.cjs
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

function upgradeArtworkUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (/=w\d+-h\d+/.test(url)) {
      return url.replace(/=w\d+-h\d+[^?]*/, '=w1080-h1080-l90-rj');
    }
    if (/=s\d+/.test(url)) {
      return url.replace(/=s\d+[^?]*/, '=s1080');
    }
    if (!url.includes('=')) {
      return `${url}=w1080-h1080-l90-rj`;
    }
  }
  if (url.includes('i.ytimg.com/vi/')) {
    return url.replace(/\/(default|mqdefault|hqdefault|sddefault)\.jpg$/, '/maxresdefault.jpg');
  }
  if (url.includes('mzstatic.com')) {
    return url.replace(/\/\d+x\d+bb\./, '/1000x1000bb.');
  }
  return url;
}

class DownloadManager {
  constructor(database, mediaDir, artworkDir, onProgressCallback) {
    this.database = database;
    this.mediaDir = mediaDir;
    this.artworkDir = artworkDir;
    this.onProgress = onProgressCallback || (() => {});
    this.activeDownloads = new Map(); // downloadId -> { abortController, track }
    this.playlistQueues = new Map(); // playlistId -> { isPaused: false, isCancelled: false }

    if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
    if (!fs.existsSync(artworkDir)) fs.mkdirSync(artworkDir, { recursive: true });
  }

  // Sanitize file names to prevent directory traversal or Windows filesystem issues
  sanitizeFileName(str) {
    return String(str || 'unknown')
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\.\.+/g, '.')
      .trim()
      .substring(0, 100);
  }

  // Validate if a track is legally and technically eligible for download
  checkSourceEligibility(track) {
    if (!track || !track.id) {
      return { eligible: false, reason: 'Invalid track data' };
    }

    // Direct local import
    if (track.source === 'local_import' || (track.local_audio_path && fs.existsSync(track.local_audio_path))) {
      return { eligible: true, type: 'local' };
    }

    // Direct audio URL or eligible stream endpoint
    const url = track.downloadUrl || track.streamUrl || track.url;
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      return { eligible: true, type: 'remote_url', url };
    }

    // Internal Express streaming endpoint or authorized YouTube Music / backend stream
    if (track.id) {
      // Use dedicated /api/download/:id for complete full-track streaming with byte counting
      return { 
        eligible: true, 
        type: 'backend_stream', 
        url: `http://127.0.0.1:3001/api/download/${track.id}` 
      };
    }

    return { eligible: false, reason: 'No authorized download stream available' };
  }

  // Download individual track
  async downloadTrack(track) {
    const downloadId = track.id;

    // Check if already active
    if (this.activeDownloads.has(downloadId)) {
      return { success: false, message: 'Download already in progress' };
    }

    // Check if already downloaded and verified on disk
    const existing = this.database.getTrack(track.id);
    if (existing && existing.local_audio_path && fs.existsSync(existing.local_audio_path)) {
      this.database.upsertDownload({
        id: downloadId,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        status: 'completed',
        progress: 100,
        bytes_downloaded: existing.file_size,
        total_bytes: existing.file_size
      });
      return { success: true, alreadyDownloaded: true, track: existing };
    }

    // Check eligibility
    const eligibility = this.checkSourceEligibility(track);
    if (!eligibility.eligible) {
      const record = {
        id: downloadId,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        thumbnail: track.thumbnail,
        status: 'unsupported',
        progress: 0,
        bytes_downloaded: 0,
        total_bytes: 0,
        error_message: eligibility.reason
      };
      this.database.upsertDownload(record);
      this.onProgress(record);
      return { success: false, reason: eligibility.reason };
    }

    const abortController = new AbortController();
    const activeInfo = { abortController, track, isPaused: false };
    this.activeDownloads.set(downloadId, activeInfo);

    const safeId = this.sanitizeFileName(track.id);
    const audioExt = '.mp3';
    const finalAudioPath = path.join(this.mediaDir, `${safeId}${audioExt}`);
    const partAudioPath = `${finalAudioPath}.part`;

    let artworkPath = null;
    if (track.thumbnail && track.thumbnail.startsWith('http')) {
      artworkPath = path.join(this.artworkDir, `${safeId}.jpg`);
    }

    // Check if partial download already exists on disk
    let startOffset = 0;
    if (fs.existsSync(partAudioPath)) {
      try {
        startOffset = fs.statSync(partAudioPath).size;
      } catch {
        startOffset = 0;
      }
    }

    const record = {
      id: downloadId,
      track_id: track.id,
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      thumbnail: track.thumbnail || '',
      source_url: eligibility.url || '',
      status: 'downloading',
      progress: 0,
      bytes_downloaded: startOffset,
      total_bytes: 0,
      error_message: null
    };

    this.database.upsertDownload(record);
    this.onProgress(record);

    let fileStream = null;
    let downloadedBytes = startOffset;
    let totalBytes = 0;

    try {
      // 1. Download artwork if available at highest resolution
      if (artworkPath && (!fs.existsSync(artworkPath) || fs.statSync(artworkPath).size < 25000)) {
        try {
          const highResUrl = upgradeArtworkUrl(track.thumbnail);
          let artRes = await fetch(highResUrl, { signal: abortController.signal });
          if (!artRes.ok && highResUrl !== track.thumbnail) {
            artRes = await fetch(track.thumbnail, { signal: abortController.signal });
          }
          if (artRes.ok) {
            const buf = await artRes.arrayBuffer();
            if (buf.byteLength > 1000) {
              fs.writeFileSync(artworkPath, Buffer.from(buf));
            }
          }
        } catch (e) {
          console.warn('[DownloadManager] Artwork download notice:', e.message);
        }
      }

      // 2. Download audio file with HTTP Range support for seamless resume
      const downloadUrl = eligibility.url;
      const fetchHeaders = {
        'User-Agent': 'GhosttunesDesktop/1.0'
      };
      if (startOffset > 0) {
        fetchHeaders['Range'] = `bytes=${startOffset}-`;
      }

      const res = await fetch(downloadUrl, {
        signal: abortController.signal,
        headers: fetchHeaders
      });

      if (!res.ok && res.status !== 206) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const isPartial = res.status === 206;

      const contentRange = res.headers.get('content-range');
      const contentLength = res.headers.get('content-length');

      if (isPartial && contentRange) {
        const match = contentRange.match(/\/(\d+)/);
        if (match) {
          totalBytes = parseInt(match[1], 10);
        } else if (contentLength) {
          totalBytes = startOffset + parseInt(contentLength, 10);
        }
        downloadedBytes = startOffset;
      } else if (isPartial && contentLength) {
        totalBytes = startOffset + parseInt(contentLength, 10);
        downloadedBytes = startOffset;
      } else {
        totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        downloadedBytes = 0;
        startOffset = 0;
      }

      record.total_bytes = totalBytes;
      record.bytes_downloaded = downloadedBytes;
      if (totalBytes > 0) {
        record.progress = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
      }

      fileStream = fs.createWriteStream(partAudioPath, {
        flags: isPartial && startOffset > 0 ? 'a' : 'w'
      });

      // Stream with progress counting
      const reader = res.body.getReader();
      let lastReportTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        fileStream.write(value);
        downloadedBytes += value.length;

        const now = Date.now();
        if (now - lastReportTime > 250 || (totalBytes > 0 && downloadedBytes === totalBytes)) {
          lastReportTime = now;
          const prog = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 50;
          record.progress = prog;
          record.bytes_downloaded = downloadedBytes;
          this.database.upsertDownload(record);
          this.onProgress({ ...record });
        }
      }

      fileStream.end();
      await new Promise(resolve => fileStream.on('finish', resolve));

      // Validate downloaded file
      const stats = fs.statSync(partAudioPath);
      if (stats.size < 1024) {
        throw new Error('Downloaded audio file is invalid or empty');
      }

      // Rename from .part to final
      if (fs.existsSync(finalAudioPath)) {
        fs.unlinkSync(finalAudioPath);
      }
      fs.renameSync(partAudioPath, finalAudioPath);

      // Save to database
      this.database.upsertTrack({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album || '',
        duration: track.duration || 0,
        thumbnail: upgradeArtworkUrl(track.thumbnail) || '',
        local_audio_path: finalAudioPath,
        local_artwork_path: (artworkPath && fs.existsSync(artworkPath)) ? artworkPath : null,
        file_size: stats.size,
        mime_type: 'audio/mpeg',
        source: 'download',
        offline_available: true
      });

      record.status = 'completed';
      record.progress = 100;
      record.bytes_downloaded = stats.size;
      record.total_bytes = stats.size;
      this.database.upsertDownload(record);
      this.onProgress({ ...record });

      this.activeDownloads.delete(downloadId);
      return { success: true, localAudioPath: finalAudioPath };
    } catch (err) {
      try { if (fileStream) fileStream.end(); } catch {}

      const active = this.activeDownloads.get(downloadId);
      const isPaused = active?.isPaused || abortController.signal.reason === 'paused';

      if (isPaused) {
        // Paused by user: keep .part file intact for resume
        const currentBytes = fs.existsSync(partAudioPath) ? fs.statSync(partAudioPath).size : downloadedBytes;
        record.status = 'paused';
        record.bytes_downloaded = currentBytes;
        if (record.total_bytes > 0) {
          record.progress = Math.min(99, Math.round((currentBytes / record.total_bytes) * 100));
        }
        record.error_message = null;
        this.database.upsertDownload(record);
        this.onProgress({ ...record });

        this.activeDownloads.delete(downloadId);
        return { success: true, paused: true };
      }

      if (fs.existsSync(partAudioPath)) {
        try { fs.unlinkSync(partAudioPath); } catch {}
      }

      const isAborted = abortController.signal.aborted;
      record.status = isAborted ? 'cancelled' : 'failed';
      record.error_message = isAborted ? 'Download cancelled by user' : err.message;
      this.database.upsertDownload(record);
      this.onProgress({ ...record });

      this.activeDownloads.delete(downloadId);
      return { success: false, error: record.error_message };
    }
  }

  // Pause an active download
  pauseDownload(downloadId) {
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      active.isPaused = true;
      active.abortController.abort('paused');
      return true;
    }
    const record = this.database.getDownload(downloadId);
    if (record && (record.status === 'downloading' || record.status === 'queued')) {
      record.status = 'paused';
      this.database.upsertDownload(record);
      this.onProgress({ ...record });
      return true;
    }
    return false;
  }

  // Resume / play a paused download
  async resumeDownload(downloadId) {
    if (this.activeDownloads.has(downloadId)) {
      const active = this.activeDownloads.get(downloadId);
      if (!active.isPaused) return { success: true, message: 'Already downloading' };
    }

    const record = this.database.getDownload(downloadId);
    if (!record) {
      return { success: false, message: 'Download record not found' };
    }

    const track = {
      id: record.track_id,
      title: record.title,
      artist: record.artist,
      thumbnail: record.thumbnail,
      downloadUrl: record.source_url
    };

    return await this.downloadTrack(track);
  }

  // Pause all running downloads
  pauseAllDownloads() {
    for (const [id, active] of this.activeDownloads.entries()) {
      active.isPaused = true;
      active.abortController.abort('paused');
    }
    for (const [playlistId, queue] of this.playlistQueues.entries()) {
      queue.isPaused = true;
    }
    const all = this.database.getAllDownloads();
    for (const record of all) {
      if (record.status === 'downloading' || record.status === 'queued') {
        record.status = 'paused';
        this.database.upsertDownload(record);
        this.onProgress({ ...record });
      }
    }
    return true;
  }

  // Resume / play all paused downloads
  async resumeAllDownloads() {
    for (const [playlistId, queue] of this.playlistQueues.entries()) {
      queue.isPaused = false;
      if (queue.resumeResolver) {
        queue.resumeResolver();
        queue.resumeResolver = null;
      }
    }

    const all = this.database.getAllDownloads();
    const paused = all.filter(r => r.status === 'paused');
    for (const record of paused) {
      this.resumeDownload(record.id).catch(err => {
        console.warn(`[DownloadManager] Error resuming ${record.id}:`, err.message);
      });
    }
    return true;
  }

  // Cancel an active download
  cancelDownload(downloadId) {
    const active = this.activeDownloads.get(downloadId);
    if (active) {
      active.abortController.abort();
      this.activeDownloads.delete(downloadId);
      return true;
    }
    const record = this.database.getDownload(downloadId);
    if (record) {
      record.status = 'cancelled';
      this.database.upsertDownload(record);
      this.onProgress({ ...record });
      const safeId = this.sanitizeFileName(record.track_id);
      const partAudioPath = path.join(this.mediaDir, `${safeId}.mp3.part`);
      if (fs.existsSync(partAudioPath)) {
        try { fs.unlinkSync(partAudioPath); } catch {}
      }
      return true;
    }
    return false;
  }

  // Download entire playlist
  async downloadPlaylist(playlist, tracks = [], onPlaylistProgress = () => {}) {
    if (!tracks || tracks.length === 0) return { total: 0, completed: 0, failed: 0, skipped: 0 };

    const playlistId = playlist.id;
    const playlistTitle = playlist.title || playlist.name || 'Playlist';
    const queueState = { isPaused: false, isCancelled: false, currentTrackId: null, resumeResolver: null };
    this.playlistQueues.set(playlistId, queueState);

    // Store playlist in DB
    this.database.savePlaylist(playlist, tracks.map(t => t.id));

    let completed = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < tracks.length; i++) {
      if (queueState.isCancelled) {
        break;
      }

      // Check if paused and wait until resumed
      while (queueState.isPaused && !queueState.isCancelled) {
        onPlaylistProgress({
          playlistId,
          playlistTitle,
          currentIndex: i + 1,
          total: tracks.length,
          currentTrackTitle: tracks[i].title,
          completed,
          failed,
          skipped,
          isPaused: true
        });
        await new Promise(resolve => {
          queueState.resumeResolver = resolve;
        });
      }
      if (queueState.isCancelled) break;

      const track = tracks[i];
      queueState.currentTrackId = track.id;

      onPlaylistProgress({
        playlistId,
        playlistTitle,
        currentIndex: i + 1,
        total: tracks.length,
        currentTrackTitle: track.title,
        completed,
        failed,
        skipped,
        isPaused: false
      });

      // Check if already downloaded
      const existing = this.database.getTrack(track.id);
      if (existing && existing.local_audio_path && fs.existsSync(existing.local_audio_path)) {
        completed++;
        skipped++;
        if (this.onProgress) {
          this.onProgress({
            id: track.id,
            track_id: track.id,
            status: 'completed',
            progress: 100
          });
        }
        continue;
      }

      try {
        const result = await this.downloadTrack(track);
        if (result && result.success) {
          if (result.paused) {
            // Track was paused mid-stream: wait until queue is resumed, then retry same track from byte offset
            while (queueState.isPaused && !queueState.isCancelled) {
              await new Promise(resolve => {
                queueState.resumeResolver = resolve;
              });
            }
            if (queueState.isCancelled) break;
            i--;
            continue;
          }
          completed++;
        } else {
          console.warn(`[DownloadManager] Track ${track.id} (${track.title}) did not succeed:`, result?.error || result?.reason);
          failed++;
        }
      } catch (err) {
        console.error(`[DownloadManager] Error downloading track ${track.id} (${track.title}):`, err.message);
        failed++;
      }
    }

    onPlaylistProgress({
      playlistId,
      playlistTitle,
      currentIndex: tracks.length,
      total: tracks.length,
      currentTrackTitle: 'Done',
      completed,
      failed,
      skipped,
      isFinished: true,
      isPaused: false
    });

    this.playlistQueues.delete(playlistId);
    return { total: tracks.length, completed, failed, skipped };
  }

  pausePlaylistDownload(playlistId) {
    const queue = this.playlistQueues.get(playlistId);
    if (queue) {
      queue.isPaused = true;
      if (queue.currentTrackId && this.activeDownloads.has(queue.currentTrackId)) {
        this.pauseDownload(queue.currentTrackId);
      }
      return true;
    }
    return false;
  }

  resumePlaylistDownload(playlistId) {
    const queue = this.playlistQueues.get(playlistId);
    if (queue) {
      queue.isPaused = false;
      if (queue.resumeResolver) {
        queue.resumeResolver();
        queue.resumeResolver = null;
      }
      return true;
    }
    return false;
  }

  cancelPlaylistDownload(playlistId) {
    const queue = this.playlistQueues.get(playlistId);
    if (queue) {
      queue.isCancelled = true;
      if (queue.resumeResolver) {
        queue.resumeResolver();
        queue.resumeResolver = null;
      }
      if (queue.currentTrackId && this.activeDownloads.has(queue.currentTrackId)) {
        this.cancelDownload(queue.currentTrackId);
      }
      return true;
    }
    return false;
  }
}

module.exports = { DownloadManager };
