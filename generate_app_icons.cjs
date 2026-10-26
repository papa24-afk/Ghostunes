// generate_app_icons.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Create Windows .ico binary buffer from an array of PNG buffers { width, height, buffer }
function createIcoFromPngs(pngEntries) {
  // ICONDIR: 6 bytes
  // 0-1: Reserved (0)
  // 2-3: Type (1 = ICO)
  // 4-5: Count of images
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  // ICONDIRENTRY: 16 bytes each
  const dirEntries = [];
  let currentOffset = 6 + (16 * count);

  for (const entry of pngEntries) {
    const dir = Buffer.alloc(16);
    // Width (0 = 256)
    dir.writeUInt8(entry.width >= 256 ? 0 : entry.width, 0);
    // Height (0 = 256)
    dir.writeUInt8(entry.height >= 256 ? 0 : entry.height, 1);
    // Color count (0 = no palette)
    dir.writeUInt8(0, 2);
    // Reserved (0)
    dir.writeUInt8(0, 3);
    // Color planes (1)
    dir.writeUInt16LE(1, 4);
    // Bits per pixel (32)
    dir.writeUInt16LE(32, 6);
    // Image size in bytes
    dir.writeUInt32LE(entry.buffer.length, 8);
    // Image offset
    dir.writeUInt32LE(currentOffset, 12);

    dirEntries.push(dir);
    currentOffset += entry.buffer.length;
  }

  return Buffer.concat([
    header,
    ...dirEntries,
    ...pngEntries.map(e => e.buffer)
  ]);
}

const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Border Gradient: crimson -> rose -> bright pink -->
    <linearGradient id="borderGrad" x1="15%" y1="90%" x2="90%" y2="10%">
      <stop offset="0%" stop-color="#9e2a40" />
      <stop offset="50%" stop-color="#e0536c" />
      <stop offset="100%" stop-color="#ff758f" />
    </linearGradient>

    <!-- Background Gradient: subtle depth -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f14" />
      <stop offset="100%" stop-color="#070709" />
    </linearGradient>

    <!-- Outer Bloom Glow Filter -->
    <filter id="bloom" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#9e2a40" flood-opacity="0.45" />
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#e0536c" flood-opacity="0.35" />
    </filter>

    <!-- Sparkle Glow -->
    <filter id="sparkleGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#ff8099" flood-opacity="0.8" />
    </filter>

    <!-- Music Note Neon Glow -->
    <filter id="noteGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="8" flood-color="#ff8099" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- Squircle Base with Glow and Crimson Border -->
  <!-- Size 400x400 centered at 256, 260 with rx=104 -->
  <rect 
    x="56" 
    y="60" 
    width="400" 
    height="400" 
    rx="108" 
    ry="108" 
    fill="url(#bgGrad)" 
    stroke="url(#borderGrad)" 
    stroke-width="16" 
    filter="url(#bloom)" 
  />

  <!-- Subtle Inner Specular Rim -->
  <rect 
    x="65" 
    y="69" 
    width="382" 
    height="382" 
    rx="100" 
    ry="100" 
    fill="none" 
    stroke="rgba(255, 255, 255, 0.08)" 
    stroke-width="2" 
  />

  <!-- Eighth Note (Music2) Centered -->
  <!-- Original Lucide Music2 viewBox: 0 0 24 24, center is (13, 11) -->
  <!-- Scale factor = 11.2, translate to center at (250, 262) -->
  <g transform="translate(116, 128) scale(11.2)" filter="url(#noteGlow)">
    <!-- Eighth note stem and beam -->
    <path 
      d="m19 6-5.2-3.9a.5.5 0 0 0-.8.4V18" 
      fill="none" 
      stroke="#ff8099" 
      stroke-width="2.2" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />
    <!-- Note head circle -->
    <circle 
      cx="9" 
      cy="18" 
      r="4" 
      fill="none" 
      stroke="#ff8099" 
      stroke-width="2.2" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />
  </g>

  <!-- Sparkle Star at Top-Right Corner (from Lucide Sparkles) -->
  <!-- Scaled and positioned at (398, 76) -->
  <g transform="translate(378, 56) scale(2.8)" filter="url(#sparkleGlow)">
    <path 
      d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" 
      fill="#ff8099" 
    />
    <path d="M20 2v4" stroke="#ff8099" stroke-width="1.8" stroke-linecap="round" />
    <path d="M22 4h-4" stroke="#ff8099" stroke-width="1.8" stroke-linecap="round" />
  </g>
</svg>
`;

app.whenReady().then(async () => {
  try {
    const rootDir = path.resolve(__dirname);
    const publicDir = path.join(rootDir, 'public');
    const buildDir = path.join(rootDir, 'build');

    if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

    // Save SVG file
    fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon.trim(), 'utf8');
    fs.writeFileSync(path.join(buildDir, 'icon.svg'), svgIcon.trim(), 'utf8');
    console.log('[IconGenerator] Saved icon.svg');

    // Create hidden rendering window
    const win = new BrowserWindow({
      width: 512,
      height: 512,
      show: false,
      frame: false,
      transparent: true,
      webPreferences: {
        offscreen: true
      }
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 512px; height: 512px; background: transparent; overflow: hidden; }
          </style>
        </head>
        <body>${svgIcon}</body>
      </html>
    `;

    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 600));

    const masterImage = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
    const masterPng512 = masterImage.toPNG();

    // Save 512x512 master PNGs
    fs.writeFileSync(path.join(publicDir, 'icon.png'), masterPng512);
    fs.writeFileSync(path.join(buildDir, 'icon.png'), masterPng512);
    console.log('[IconGenerator] Saved icon.png (512x512)');

    // Generate resolutions for .ico
    const sizes = [256, 128, 64, 48, 32, 16];
    const pngEntries = [{ width: 256, height: 256, buffer: masterImage.resize({ width: 256, height: 256, quality: 'best' }).toPNG() }];

    for (const size of [128, 64, 48, 32, 16]) {
      const resized = masterImage.resize({ width: size, height: size, quality: 'best' });
      pngEntries.push({
        width: size,
        height: size,
        buffer: resized.toPNG()
      });
    }

    const icoBuffer = createIcoFromPngs(pngEntries);
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoBuffer);
    console.log(`[IconGenerator] Saved icon.ico (${icoBuffer.length} bytes) with sizes: 256, 128, 64, 48, 32, 16`);

    console.log('[IconGenerator] All app icons generated successfully!');
  } catch (err) {
    console.error('[IconGenerator] Error:', err);
  } finally {
    app.quit();
  }
});
