const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const tracks = Array.from({ length: 40 }, (_, index) => ({
  id: index === 0 ? 'Abcdef12345' : `track-${index}`,
  title: `Song ${String(index + 1).padStart(2, '0')}`,
  artist: 'Test Artist',
  duration: '3:00',
  durationSeconds: 180,
  thumbnail: index === 0 ? 'https://i.ytimg.com/vi/Abcdef12345/maxresdefault.jpg' : '/rainbow_cover.jpg',
}));
const artist = {
  id: 'test-artist',
  name: 'Test Artist',
  avatar: '/rainbow_cover.jpg',
  banner: '',
  description: '',
  topTracks: tracks.slice(0, 5),
  similarArtists: [],
  albums: [
    {
      id: 'album-1',
      title: 'An album',
      year: '2026',
      thumbnail: 'https://lh3.googleusercontent.com/album=w1080-h1080-l90-rj',
    },
  ],
  singles: Array.from({ length: 10 }, (_, index) => ({
    id: `single-${index}`,
    title: `Single ${index + 1}`,
    thumbnail: index
      ? '/rainbow_cover.jpg'
      : 'https://lh3.googleusercontent.com/unavailable=w1080-h1080-l90-rj',
  })),
};

async function run() {
  const executablePath =
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  const artwork = fs.readFileSync(path.resolve(__dirname, '../public/rainbow_cover.jpg'));
  const artifacts = path.resolve(__dirname, '../test_sandbox/ui');
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const failedUrls = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://i.ytimg.com/**', (route) =>
      route.request().url().includes('maxresdefault')
        ? route.fulfill({ status: 404, body: 'Unavailable size' })
        : route.fulfill({ contentType: 'image/jpeg', body: artwork }),
    );
    await page.route('https://lh3.googleusercontent.com/**', (route) => {
      const url = route.request().url();
      if (url.includes('/album=') && url.includes('w544'))
        return route.fulfill({ contentType: 'image/jpeg', body: artwork });
      failedUrls.push(url);
      return route.fulfill({ status: 404, body: 'Unavailable size' });
    });
    await page.route('**/api/**', (route) => {
      const url = route.request().url();
      if (url.includes('/artist?')) return route.fulfill({ json: artist });
      if (url.includes('/search')) return route.fulfill({ json: { results: tracks } });
      if (url.includes('/genre')) return route.fulfill({ json: { tracks } });
      return route.fulfill({ json: {} });
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    const collapse = page.locator('header').getByRole('button', { name: 'Collapse sidebar', exact: true });
    assert.ok(
      (await collapse.boundingBox()).x <= 24,
      'Browser toggle should be at the far-left sidebar edge',
    );
    await collapse.click();
    assert.ok(
      (
        await page
          .locator('header')
          .getByRole('button', { name: 'Expand sidebar', exact: true })
          .boundingBox()
      ).x <= 24,
    );
    await page.locator('header').getByRole('button', { name: 'Expand sidebar', exact: true }).click();
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.locator('main article').first().locator('img').waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('main article img');
      return image?.complete && image.naturalWidth > 32 && image.src.endsWith('hqdefault.jpg');
    });
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(size);
      for (const view of ['grid', 'list']) {
        if (view === 'list') {
          await page.getByRole('searchbox', { name: 'Search music' }).fill('Test Artist');
          await page.getByText('Top result', { exact: true }).waitFor();
        }
        const last = page.locator('main article').last();
        await last.evaluate((element) => element.scrollIntoView({ block: 'end' }));
        const bounds = await last.boundingBox();
        const footer = await page.locator('#desktop-player-canvas footer').boundingBox();
        assert.ok(
          bounds.y + bounds.height <= footer.y + 1,
          `Last ${view} row must sit above player at ${size.width}px`,
        );
        await page.screenshot({ path: path.join(artifacts, `last-row-${view}-${size.width}.png`) });
        if (view === 'list')
          await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('searchbox', { name: 'Search music' }).fill('Test Artist');
    await page.getByRole('heading', { name: 'Artists', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Test Artist', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Albums & Discography', exact: true }).waitFor();
    const album = page.getByAltText('An album', { exact: true });
    await album.scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      Array.from(document.images).some(
        (image) =>
          image.alt === 'An album' && image.complete && image.naturalWidth > 32 && image.src.includes('w544'),
      ),
    );
    const unavailable = page.getByRole('img', { name: 'Single 1 — artwork unavailable', exact: true });
    await page.getByText('Single 1', { exact: true }).locator('..').scrollIntoViewIfNeeded();
    await unavailable.waitFor();
    assert.ok(
      failedUrls.filter((url) => url.includes('/unavailable=')).length <= 4,
      'Unavailable artwork must stop retrying',
    );
    const finalRelease = page.getByText('Single 10', { exact: true });
    await finalRelease.evaluate((element) => element.scrollIntoView({ block: 'end' }));
    const releaseBounds = await finalRelease.boundingBox();
    const footer = await page.locator('#desktop-player-canvas footer').boundingBox();
    assert.ok(releaseBounds.y + releaseBounds.height <= footer.y + 1);
    await page.screenshot({ path: path.join(artifacts, 'artist-artwork.png') });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: artwork recovery, unavailable covers, far-left collapse toggle, and reachable final grid/list/artist rows',
    );
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
