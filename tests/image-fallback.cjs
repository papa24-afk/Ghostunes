// Checks the plain-<img> fallback chain (src/utils/imageFallback.ts).
const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'utils', 'imageFallback.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const { nextImageUrl } = mod.exports;

const g = 'https://yt3.googleusercontent.com/abc=w1080-h1080-l90-rj';
assert.equal(nextImageUrl(g, 0), 'https://yt3.googleusercontent.com/abc=w544-h544-l90-rj');
assert.equal(nextImageUrl(g, 1), 'https://yt3.googleusercontent.com/abc=w226-h226-l90-rj');
assert.equal(nextImageUrl(g, 2), null);
assert.equal(nextImageUrl('https://lh3.googleusercontent.com/x=s1200', 0), 'https://lh3.googleusercontent.com/x=s544');
assert.equal(nextImageUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', 0), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/sddefault.jpg');
assert.equal(nextImageUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 0), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
assert.equal(nextImageUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', 0), null);
assert.equal(nextImageUrl('https://example.com/a.png', 0), null);
console.log('PASS: image fallback steps down sizes and stops');
