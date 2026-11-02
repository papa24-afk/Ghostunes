const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

// This checks the mobile renderer, not Android WebView or native background services.
async function run() {
  const chrome =
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined);
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  const artifacts = path.resolve(__dirname, '../test_sandbox/android');
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const page = await browser.newPage({ ...devices['Pixel 7'] });
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    });
    const songs = [
      {
        id: 'test-song',
        title: 'Android test song',
        artist: 'Test artist',
        duration: '3:00',
        durationSeconds: 180,
        thumbnail: '/rainbow_cover.jpg',
      },
    ];
    await page.route('**/api/**', (route) => {
      requests.push(route.request().url());
      if (route.request().url().includes('/health')) return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, json: { status: 'ok' } });
      return route.fulfill({
        headers: { 'Access-Control-Allow-Origin': '*' },
        json: route.request().url().includes('/search') ? { results: songs } : { tracks: songs },
      });
    });
    await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:5173');
    await page.getByRole('heading', { name: 'Listen Now', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(artifacts, 'mobile-home.png') });
    await page.locator('nav').getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByPlaceholder('What do you want to play?').fill('Android test');
    await page.getByText('Android test song', { exact: true }).waitFor();
    assert.ok(
      requests.some((url) => url.startsWith('http://10.0.2.2:3001/api/search')),
      'Default native endpoint is the Android emulator host',
    );
    await page.screenshot({ path: path.join(artifacts, 'mobile-search.png') });
    await page.locator('nav').getByRole('button', { name: 'Library', exact: true }).click();
    await page.getByRole('heading', { name: 'Your Library', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'mobile-library.png') });
    await page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click();
    const serverAddress = page.getByRole('textbox', { name: 'Server address', exact: true });
    await serverAddress.fill('http://192.0.2.10:3001');
    await page.getByRole('button', { name: 'Save and reconnect', exact: true }).click();
    await page.getByRole('heading', { name: 'Listen Now', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('ghosttunes_api_url')), 'http://192.0.2.10:3001');
    assert.ok(requests.some(url => url.startsWith('http://192.0.2.10:3001/api/genre')));
    assert.deepEqual(errors, []);
    console.log('PASS: Pixel-sized mobile renderer opens Home, searches, navigates Library, and saves a reachable music server');
    console.log('LIMIT: requests are mocked; the default native backend is emulator-only');
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
