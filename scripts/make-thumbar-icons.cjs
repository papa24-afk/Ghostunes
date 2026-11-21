// Draws the Windows taskbar thumbnail button icons (previous / play / pause / next) as 32x32 PNGs.
// Run: node scripts/make-thumbar-icons.cjs   (output: electron/icons/thumbar-*.png)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 32;

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(alphaAt) {
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      // 4x supersampling for smooth edges
      let cover = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (alphaAt(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) cover++;
      const o = y * (S * 4 + 1) + 1 + x * 4;
      raw[o] = 255; raw[o + 1] = 255; raw[o + 2] = 255; raw[o + 3] = Math.round((cover / 16) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Triangle pointing right with left edge at x0, spanning y from top to bottom.
const tri = (x, y, x0, x1, top, bottom) => {
  if (x < x0 || x > x1) return false;
  const mid = (top + bottom) / 2, half = (bottom - top) / 2;
  return Math.abs(y - mid) <= half * (1 - (x - x0) / (x1 - x0));
};
const rect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const icons = {
  play: (x, y) => tri(x, y, 10, 25, 7, 25),
  pause: (x, y) => rect(x, y, 9, 8, 13.5, 24) || rect(x, y, 18.5, 8, 23, 24),
  next: (x, y) => tri(x, y, 7, 20, 8, 24) || rect(x, y, 21, 8, 24.5, 24),
  prev: (x, y) => tri(S - x, y, 7, 20, 8, 24) || rect(x, y, 7.5, 8, 11, 24),
};

const out = path.join(__dirname, '..', 'electron', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const [name, fn] of Object.entries(icons)) {
  fs.writeFileSync(path.join(out, `thumbar-${name}.png`), png(fn));
  console.log('wrote', `electron/icons/thumbar-${name}.png`);
}
