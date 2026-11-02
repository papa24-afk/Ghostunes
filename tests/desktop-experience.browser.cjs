const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const chrome =
  process.env.CHROME_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
const artifacts = path.resolve(__dirname, '../test_sandbox/ui');
const tracks = Array.from({ length: 8 }, (_, index) => ({
  id: `track-${index}`,
  title: index === 0 ? 'First Light' : `Night Drive ${index}`,
  artist: index === 0 ? 'First Artist' : 'Second Artist',
  album: 'After Hours',
  duration: '3:00',
  durationSeconds: 180,
  thumbnail: '/rainbow_cover.jpg',
}));
const sampleCount = 180 * 8000;
const silence = Buffer.alloc(44 + sampleCount, 128);
silence.write('RIFF', 0);
silence.writeUInt32LE(36 + sampleCount, 4);
silence.write('WAVEfmt ', 8);
silence.writeUInt32LE(16, 16);
silence.writeUInt16LE(1, 20);
silence.writeUInt16LE(1, 22);
silence.writeUInt32LE(8000, 24);
silence.writeUInt32LE(8000, 28);
silence.writeUInt16LE(1, 32);
silence.writeUInt16LE(8, 34);
silence.write('data', 36);
silence.writeUInt32LE(sampleCount, 40);
const session = {
  queue: tracks,
  currentIndex: 1,
  currentTime: 42,
  savedAt: Date.now(),
  sessionName: 'Outdated session name',
};

async function run() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    let failStream = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(
      ({ tracks, session }) => {
        if (!localStorage.getItem('ui_test_seeded')) {
          localStorage.setItem('metrolist_favorites', JSON.stringify(tracks));
          localStorage.setItem(
            'metrolist_history',
            JSON.stringify(tracks.slice(0, 3).map((track) => ({ track, playedAt: Date.now() }))),
          );
          localStorage.setItem(
            'metrolist_playlists',
            JSON.stringify([{ id: 'test-list', name: 'Evening mix', tracks, createdAt: Date.now() }]),
          );
          localStorage.setItem('ghost_interrupted_session', JSON.stringify(session));
          localStorage.setItem(
            'ghost_listening_history',
            JSON.stringify([
              {
                id: 'listen-1',
                track_id: tracks[1].id,
                title: tracks[1].title,
                artist: tracks[1].artist,
                album: '',
                duration: 180,
                duration_played: 60,
                completion_ratio: 0.33,
                played_at: Date.now(),
                source: 'manual',
              },
            ]),
          );
          localStorage.setItem('ui_test_seeded', 'true');
        }
      },
      { tracks, session },
    );
    // No provider credentials or external catalogue are required for these UI checks.
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/stream/')) {
        if (failStream) return route.fulfill({ status: 404, body: 'Unavailable' });
        const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Number(range[2]) : silence.length - 1;
        return route.fulfill({
          status: range ? 206 : 200,
          contentType: 'audio/wav',
          headers: {
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${silence.length}` } : {}),
          },
          body: silence.subarray(start, end + 1),
        });
      }
      if (url.includes('/search')) return route.fulfill({ json: { results: tracks } });
      if (url.includes('/genre')) return route.fulfill({ json: { tracks } });
      if (url.includes('/lyrics')) return route.fulfill({ json: { syncedLyrics: '', plainLyrics: '' } });
      return route.fulfill({ json: {} });
    });
    await page.goto(baseURL);
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.match(await page.locator('#desktop-player-canvas footer').innerText(), /Night Drive 1/);
    const closedQueue = await page.locator('[aria-label="Play queue"]').boundingBox();
    assert.ok(!closedQueue || closedQueue.x >= 1440, 'Closed queue must be off screen');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    try {
      await page.waitForFunction(
        () => {
          const audio = document.querySelector('audio');
          return audio && !audio.paused && audio.currentTime >= 42;
        },
        undefined,
        { timeout: 10000 },
      );
    } catch (error) {
      console.error(
        'Audio state:',
        await page.locator('audio').evaluate((audio) => ({
          src: audio.src,
          time: audio.currentTime,
          duration: audio.duration,
          readyState: audio.readyState,
          paused: audio.paused,
          error: audio.error?.message,
        })),
      );
      console.error('UI:', await page.locator('#desktop-player-canvas').innerText());
      throw error;
    }
    await page
      .locator('#desktop-player-canvas footer')
      .getByRole('button', { name: 'Pause', exact: true })
      .click();
    assert.ok(
      (await page.evaluate(
        () => JSON.parse(localStorage.getItem('ghost_interrupted_session')).currentTime,
      )) >= 42,
    );
    // Space must toggle once even while the hidden lyrics view remains mounted.
    await page.locator('audio').evaluate(audio => {
      window.__keyboardMediaEvents = 0;
      audio.addEventListener('play', () => { window.__keyboardMediaEvents += 1; });
      audio.addEventListener('pause', () => { window.__keyboardMediaEvents += 1; });
    });
    const toggleWithSpace = async () => {
      const wasPaused = await page.locator('audio').evaluate(audio => audio.paused);
      await page.evaluate(() => { document.activeElement?.blur(); window.__keyboardMediaEvents = 0; });
      await page.keyboard.press('Space');
      await page.waitForFunction(expected => document.querySelector('audio').paused === expected, !wasPaused);
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.__keyboardMediaEvents), 1, 'Each press should cause one playback change');
    };
    for (let press = 0; press < 4; press++) await toggleWithSpace();
    await page.locator('#desktop-player-canvas footer').getByRole('button', { name: 'Play', exact: true }).focus();
    await page.evaluate(() => { window.__keyboardMediaEvents = 0; });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !document.querySelector('audio').paused);
    await page.waitForFunction(() => window.__keyboardMediaEvents === 1);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__keyboardMediaEvents), 1, 'Focused play button should activate once');
    await page.evaluate(() => { document.activeElement?.blur(); window.__keyboardMediaEvents = 0; });
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('audio').paused);
    await page.keyboard.down('Space'); // A repeated keydown while the key is held.
    await page.keyboard.up('Space');
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__keyboardMediaEvents), 1, 'Holding space should not repeatedly toggle');
    await page.locator('#desktop-player-canvas footer').getByRole('button', { name: 'Fullscreen Lyrics', exact: true }).click();
    await page.locator('#cinematic-lyrics-canvas').waitFor({ state: 'visible' });
    for (let press = 0; press < 4; press++) await toggleWithSpace();
    await page.keyboard.press('Escape');
    await page.locator('#cinematic-lyrics-canvas').waitFor({ state: 'hidden' });
    await toggleWithSpace();
    await toggleWithSpace();
    const searchBox = page.getByRole('searchbox', { name: 'Search music' });
    await searchBox.focus();
    await page.evaluate(() => { window.__keyboardMediaEvents = 0; });
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => window.__keyboardMediaEvents), 0, 'Typing in search must not control playback');
    await searchBox.fill('');
    const scrubber = page.getByRole('slider', { name: 'Playback position' });
    await scrubber.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('audio').currentTime >= 47);
    assert.ok(Number(await scrubber.getAttribute('aria-valuenow')) >= 47);
    await page.screenshot({ path: path.join(artifacts, 'home.png') });

    await page.getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('heading', { name: 'My Library', exact: true }).waitFor();
    await page.getByRole('button', { name: /Evening mix 8 songs/ }).click();
    await page.getByRole('heading', { name: 'Evening mix', exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Search this collection' }).fill('no matching song');
    await page.getByText('No songs match this search.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to Library', exact: true }).click();
    await page.getByRole('heading', { name: 'My Library', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'library.png') });

    await page.getByRole('button', { name: 'Favourites', exact: true }).click();
    await page.getByRole('heading', { name: 'Favourites', exact: true }).waitFor();
    assert.equal(await page.getByText('Top result', { exact: true }).count(), 0);
    assert.equal(
      await page.locator('main article').count(),
      8,
      'Favourites should not hide songs by prolific artists',
    );
    await page.getByRole('button', { name: 'List view', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search this collection' }).fill('Night Drive 3');
    assert.equal(await page.locator('main article').count(), 1);
    await page.getByRole('textbox', { name: 'Search this collection' }).fill('');
    await page.getByRole('combobox', { name: 'Sort collection' }).selectOption('title');
    assert.match(await page.locator('main article').first().innerText(), /First Light/);
    await page.screenshot({ path: path.join(artifacts, 'favourites.png') });

    await page.getByRole('searchbox', { name: 'Search music' }).fill('Second Artist');
    await page.getByText('Top result', { exact: true }).waitFor();
    assert.equal(await page.locator('[aria-label="Browse by genre"]').count(), 0);
    assert.equal(await page.locator('main article').count(), 8);
    await page.screenshot({ path: path.join(artifacts, 'search.png') });
    await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await page.getByRole('heading', { name: 'Favourites', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Go forward', exact: true }).click();
    await page.getByRole('heading', { name: 'Explore', exact: true }).waitFor();

    await page.getByRole('button', { name: 'Stats', exact: true }).click();
    await page.getByText('Resume Interrupted Listening', { exact: true }).waitFor();
    const resume = page.getByText('Resume Interrupted Listening', { exact: true }).locator('..');
    assert.match(await resume.innerText(), /Night Drive 1/);
    assert.match(await resume.innerText(), /Second Artist/);
    assert.doesNotMatch(await resume.innerText(), /Outdated session name/);
    await page.getByText('Total plays', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'stats.png') });

    await page.getByRole('button', { name: 'Audio Lab', exact: true }).first().click();
    const lab = page.getByRole('dialog', { name: 'Audio Lab' });
    await lab.waitFor();
    assert.equal(await lab.locator('details').getAttribute('open'), null);
    await lab.locator('summary').click();
    assert.equal(await lab.getByRole('slider').count(), 11);
    await page.screenshot({ path: path.join(artifacts, 'audio-lab.png') });
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Open Queue', exact: true }).click();
    const queue = page.getByRole('dialog', { name: 'Play queue' });
    await queue.waitFor();
    await queue.getByRole('button', { name: 'Move Night Drive 3 up', exact: true }).click();
    const queueTitles = await queue.locator('p.font-semibold').allTextContents();
    assert.ok(queueTitles.indexOf('Night Drive 3') < queueTitles.indexOf('Night Drive 2'));
    await queue.getByRole('button', { name: 'Close Queue', exact: true }).click();

    await page.locator('header').getByRole('button', { name: 'Open Now Playing', exact: true }).click();
    assert.equal(await page.getByRole('heading', { name: 'Welcome back' }).count(), 0);
    await page.screenshot({ path: path.join(artifacts, 'now-playing.png') });

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const footer = await page.locator('#desktop-player-canvas footer').boundingBox();
    assert.ok(footer && footer.x >= 0 && footer.x + footer.width <= 1024);
    await page.screenshot({ path: path.join(artifacts, 'home-laptop.png') });

    // A failed stream must leave the selected song's identity intact.
    failStream = true;
    await page.reload();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.ok(
      (await page.evaluate(
        () => JSON.parse(localStorage.getItem('ghost_interrupted_session')).currentTime,
      )) >= 42,
    );
    await page
      .locator('#desktop-player-canvas footer')
      .getByRole('button', { name: 'Play', exact: true })
      .click();
    await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert.match(await page.locator('#desktop-player-canvas footer').innerText(), /Night Drive 1/);
    await page.reload();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    assert.match(await page.locator('#desktop-player-canvas footer').innerText(), /Night Drive 1/);
    assert.ok(
      (await page.evaluate(
        () => JSON.parse(localStorage.getItem('ghost_interrupted_session')).currentTime,
      )) >= 42,
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: navigation, Home, search, favourites, session details and metadata-ready audio resume, queue ordering, Audio Lab, laptop layout, failed playback and repeated spacebar pause/resume',
    );
    console.log(`Screenshots: ${artifacts}`);
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
