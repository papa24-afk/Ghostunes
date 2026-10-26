// metrolist-web/test_desktop_engine.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

console.log('====================================================');
console.log(' Ghosttunes Desktop — Offline & Engine Test Suite');
console.log('====================================================\n');

const testDir = path.join(__dirname, 'test_sandbox');
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

const mediaDir = path.join(testDir, 'media');
const artworkDir = path.join(testDir, 'artwork');
const dbPath = path.join(testDir, 'database', 'ghosttunes.db');

const { GhosttunesDatabase } = require('./electron/database.cjs');
const { DownloadManager } = require('./electron/downloadManager.cjs');

async function runTests() {
  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name}:`, e.message);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name}:`, e.message);
    }
  }

  // --- 1. Database & Schema Verification ---
  const db = new GhosttunesDatabase(dbPath);

  test('Database initialisation and schema version check', () => {
    const row = db.db.prepare('SELECT version FROM schema_version').get();
    assert.strictEqual(row.version, 1, 'Schema version should be 1');
  });

  test('Upsert track and retrieve track metadata', () => {
    db.upsertTrack({
      id: 'track_123',
      title: 'Timeless',
      artist: 'The Weeknd & Playboi Carti',
      album: 'Hurry Up Tomorrow',
      duration: 256,
      thumbnail: 'https://example.com/art.jpg',
      local_audio_path: path.join(mediaDir, 'track_123.mp3'),
      file_size: 6543210,
      offline_available: true
    });

    const track = db.getTrack('track_123');
    assert(track, 'Track should exist in DB');
    assert.strictEqual(track.title, 'Timeless');
    assert.strictEqual(track.artist, 'The Weeknd & Playboi Carti');
    assert.strictEqual(track.offline_available, 1);
    assert.strictEqual(track.file_size, 6543210);
  });

  test('Lyrics caching and retrieval from SQLite', () => {
    const testLyrics = [
      { time: 18.57, text: 'Out of time' },
      { time: 28.58, text: 'Oh, yeah' }
    ];
    db.cacheLyrics('track_123', testLyrics, 'synced', 'Out of time\nOh, yeah');

    const cached = db.getCachedLyrics('track_123');
    assert(cached, 'Cached lyrics should exist');
    assert.strictEqual(cached.lyrics.length, 2);
    assert.strictEqual(cached.lyrics[0].text, 'Out of time');
    assert.strictEqual(cached.format, 'synced');
  });

  test('Favorites persistence in SQLite', () => {
    db.setFavorite('track_123', true);
    assert.strictEqual(db.isFavorite('track_123'), true);
    const favs = db.getFavorites();
    assert.strictEqual(favs.length, 1);
    assert.strictEqual(favs[0].id, 'track_123');

    db.setFavorite('track_123', false);
    assert.strictEqual(db.isFavorite('track_123'), false);
  });

  test('Playlist and track ordering in SQLite', () => {
    db.savePlaylist({ id: 'pl_1', title: 'Top Hits', description: 'Favorites' }, ['track_123']);
    const playlists = db.getPlaylists();
    assert.strictEqual(playlists.length, 1);
    assert.strictEqual(playlists[0].title, 'Top Hits');
    assert.strictEqual(playlists[0].tracks.length, 1);
    assert.strictEqual(playlists[0].tracks[0].id, 'track_123');
  });

  test('Storage stats calculation', () => {
    const stats = db.getStorageStats();
    assert(stats.downloadedCount >= 0);
    assert(stats.totalFormatted.includes('MB'));
  });

  // --- 2. Download Manager Verification ---
  let reportedRecords = [];
  const dm = new DownloadManager(db, mediaDir, artworkDir, (record) => {
    reportedRecords.push(record);
  });

  test('Matched catalog tracks and direct streams are eligible for download', () => {
    const check1 = dm.checkSourceEligibility({ id: 'yt_1', source: 'spotify', title: 'Song' });
    assert.strictEqual(check1.eligible, true);
    assert.strictEqual(check1.type, 'backend_stream');

    const check2 = dm.checkSourceEligibility({ id: 'yt_2', source: 'youtube', title: 'Song' });
    assert.strictEqual(check2.eligible, true);

    const check3 = dm.checkSourceEligibility({ title: 'Song without ID' });
    assert.strictEqual(check3.eligible, false);
  });

  test('Authorized sources: Direct stream URLs accepted', () => {
    const check = dm.checkSourceEligibility({ 
      id: 'auth_1', 
      downloadUrl: 'https://example.com/audio.mp3',
      title: 'Free Track' 
    });
    assert.strictEqual(check.eligible, true);
    assert.strictEqual(check.type, 'remote_url');
  });

  // Start a mock HTTP server to test real streaming, range requests, and download engine
  const mockServer = http.createServer((req, res) => {
    const mockAudioData = Buffer.alloc(200 * 1024, 0xAA); // 200 KB mock audio

    if (req.url === '/test-audio.mp3') {
      if (req.headers.range) {
        const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : mockAudioData.length - 1;
          const chunk = mockAudioData.subarray(start, end + 1);
          res.writeHead(206, {
            'Content-Type': 'audio/mpeg',
            'Content-Range': `bytes ${start}-${end}/${mockAudioData.length}`,
            'Content-Length': chunk.length,
            'Accept-Ranges': 'bytes'
          });
          res.end(chunk);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mockAudioData.length,
        'Accept-Ranges': 'bytes'
      });
      res.end(mockAudioData);
      return;
    }

    if (req.url === '/test-slow-audio.mp3') {
      let start = 0;
      if (req.headers.range) {
        const match = req.headers.range.match(/bytes=(\d+)-(\d*)/);
        if (match) start = parseInt(match[1], 10);
      }

      const chunk = mockAudioData.subarray(start);
      const headers = {
        'Content-Type': 'audio/mpeg',
        'Content-Length': chunk.length,
        'Accept-Ranges': 'bytes'
      };
      if (start > 0) {
        headers['Content-Range'] = `bytes ${start}-${mockAudioData.length - 1}/${mockAudioData.length}`;
      }

      res.writeHead(start > 0 ? 206 : 200, headers);

      // Send chunk in small slices with delays
      const sliceSize = 20 * 1024;
      let offset = 0;
      const interval = setInterval(() => {
        if (offset >= chunk.length) {
          clearInterval(interval);
          res.end();
          return;
        }
        res.write(chunk.subarray(offset, Math.min(chunk.length, offset + sliceSize)));
        offset += sliceSize;
      }, 50);

      req.on('close', () => {
        clearInterval(interval);
      });
      return;
    }

    if (req.url === '/test-fail.mp3') {
      res.writeHead(500);
      res.end('Server Error');
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const serverPort = mockServer.address().port;
  const mockUrl = `http://127.0.0.1:${serverPort}/test-audio.mp3`;
  const mockFailUrl = `http://127.0.0.1:${serverPort}/test-fail.mp3`;

  await asyncTest('Real download execution, progress events, and file validation', async () => {
    reportedRecords = [];
    const result = await dm.downloadTrack({
      id: 'mock_track_1',
      title: 'Mock Free Track',
      artist: 'Mock Artist',
      downloadUrl: mockUrl
    });

    assert.strictEqual(result.success, true);
    assert(fs.existsSync(result.localAudioPath), 'Audio file must exist on disk');
    const stats = fs.statSync(result.localAudioPath);
    assert.strictEqual(stats.size, 200 * 1024, 'Downloaded file size must match source exactly');

    // Verify DB update
    const dbTrack = db.getTrack('mock_track_1');
    assert.strictEqual(dbTrack.offline_available, 1);
    assert.strictEqual(dbTrack.file_size, 200 * 1024);

    // Verify progress events were emitted
    assert(reportedRecords.length > 0, 'Progress events must be emitted');
    const lastRecord = reportedRecords[reportedRecords.length - 1];
    assert.strictEqual(lastRecord.status, 'completed');
    assert.strictEqual(lastRecord.progress, 100);
  });

  await asyncTest('Duplicate download detection (skips re-downloading if already valid on disk)', async () => {
    const result = await dm.downloadTrack({
      id: 'mock_track_1',
      title: 'Mock Free Track',
      artist: 'Mock Artist',
      downloadUrl: mockUrl
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyDownloaded, true);
  });

  await asyncTest('Download failure handling and partial file cleanup', async () => {
    const result = await dm.downloadTrack({
      id: 'mock_fail_track',
      title: 'Failing Track',
      artist: 'Mock Artist',
      downloadUrl: mockFailUrl
    });
    assert.strictEqual(result.success, false);
    // Ensure no orphan .part file left
    const partFile = path.join(mediaDir, 'mock_fail_track.mp3.part');
    assert.strictEqual(fs.existsSync(partFile), false, 'Temporary .part file must be cleaned up on failure');

    const dlRecord = db.getDownload('mock_fail_track');
    assert.strictEqual(dlRecord.status, 'failed');
  });

  await asyncTest('Pause active download (preserves .part file, sets status to paused)', async () => {
    const mockSlowUrl = `http://127.0.0.1:${serverPort}/test-slow-audio.mp3`;

    // Start download in background
    const downloadPromise = dm.downloadTrack({
      id: 'mock_pause_track',
      title: 'Slow Track for Pause',
      artist: 'Slow Artist',
      downloadUrl: mockSlowUrl
    });

    // Wait 120ms so some bytes are written to .part
    await new Promise(r => setTimeout(r, 120));

    // Pause download
    const pauseSuccess = dm.pauseDownload('mock_pause_track');
    assert.strictEqual(pauseSuccess, true, 'pauseDownload must return true for active download');

    const result = await downloadPromise;
    assert.strictEqual(result.paused, true, 'downloadTrack result should indicate paused');

    const dlRecord = db.getDownload('mock_pause_track');
    assert.strictEqual(dlRecord.status, 'paused', 'Record in database must have status paused');

    const partFile = path.join(mediaDir, 'mock_pause_track.mp3.part');
    assert(fs.existsSync(partFile), '.part file must remain on disk when paused');
    assert(fs.statSync(partFile).size > 0, '.part file must have captured downloaded bytes');
  });

  await asyncTest('Resume / play paused download (uses Range header and completes file)', async () => {
    const resumeResult = await dm.resumeDownload('mock_pause_track');
    assert.strictEqual(resumeResult.success, true, 'resumeDownload must succeed');

    const finalFile = path.join(mediaDir, 'mock_pause_track.mp3');
    assert(fs.existsSync(finalFile), 'Resumed file must be finalized on disk');
    const stats = fs.statSync(finalFile);
    assert.strictEqual(stats.size, 200 * 1024, 'Full file size must match original 200 KB');

    const dlRecord = db.getDownload('mock_pause_track');
    assert.strictEqual(dlRecord.status, 'completed', 'Record must transition from paused to completed');
    assert.strictEqual(dlRecord.progress, 100);
  });

  await asyncTest('Playlist queue download with progress reporting', async () => {
    let playlistEvents = [];
    const plTracks = [
      { id: 'pl_track_1', title: 'Track 1', downloadUrl: mockUrl },
      { id: 'pl_track_2', title: 'Track 2', downloadUrl: mockUrl }
    ];

    const result = await dm.downloadPlaylist(
      { id: 'pl_test', title: 'Test Album' },
      plTracks,
      (ev) => playlistEvents.push(ev)
    );

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.completed, 2);
    assert.strictEqual(result.failed, 0);
    assert(playlistEvents.length >= 2, 'Playlist progress events must be reported');
  });

  await asyncTest('Playlist queue pause and resume controls', async () => {
    let playlistEvents = [];
    const plTracks = [
      { id: 'pl_pause_1', title: 'Pause Track 1', downloadUrl: `http://127.0.0.1:${serverPort}/test-slow-audio.mp3` },
      { id: 'pl_pause_2', title: 'Pause Track 2', downloadUrl: mockUrl }
    ];

    const playlistPromise = dm.downloadPlaylist(
      { id: 'pl_pause_album', title: 'Pausable Album' },
      plTracks,
      (ev) => playlistEvents.push(ev)
    );

    await new Promise(r => setTimeout(r, 60));
    const pauseOk = dm.pausePlaylistDownload('pl_pause_album');
    assert.strictEqual(pauseOk, true, 'pausePlaylistDownload must return true');

    await new Promise(r => setTimeout(r, 100));
    const resumeOk = dm.resumePlaylistDownload('pl_pause_album');
    assert.strictEqual(resumeOk, true, 'resumePlaylistDownload must return true');

    const result = await playlistPromise;
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.completed, 2);
  });

  // Clean up
  mockServer.close();
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });

  console.log(`\n====================================================`);
  console.log(` Results: ${passed}/${total} Tests Passed Successfully!`);
  console.log(`====================================================\n`);
}

runTests().catch(e => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
