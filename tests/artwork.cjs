const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

(async () => {
  const { extractBestThumbnail } = await import('../serverArtwork.js');
  const supplied = 'https://lh3.googleusercontent.com/album=w544-h544-l90-rj';
  assert.equal(extractBestThumbnail({ thumbnail: { contents: [{ url: supplied, width: 544 }] } }), supplied);
  assert.equal(
    extractBestThumbnail({ thumbnails: [], thumbnail: [{ url: supplied, width: 544 }] }),
    supplied,
  );
  assert.equal(
    extractBestThumbnail({
      thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: supplied, width: 544 }] } } },
    }),
    supplied,
  );
  assert.equal(
    extractBestThumbnail({
      thumbnails: [
        { url: '/small.jpg', width: 120 },
        { url: supplied, width: 544 },
      ],
    }),
    supplied,
  );
  assert.equal(extractBestThumbnail({}, 'MPREb_album_release'), '', 'Album IDs are not video IDs');
  assert.equal(extractBestThumbnail({}, 'Abcdef12345'), 'https://i.ytimg.com/vi/Abcdef12345/hqdefault.jpg');

  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('src/utils/artwork.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, navigator: { onLine: true } });
  const { getArtworkCandidates } = module.exports;
  const candidates = getArtworkCandidates(
    'https://i.ytimg.com/vi/Abcdef12345/maxresdefault.jpg',
    'Abcdef12345',
  );
  assert.equal(candidates[0], 'https://i.ytimg.com/vi/Abcdef12345/maxresdefault.jpg');
  assert.ok(candidates.includes('https://i.ytimg.com/vi/Abcdef12345/hqdefault.jpg'));
  assert.equal(new Set(candidates).size, candidates.length, 'Fallbacks must terminate without cycling');
  assert.equal(getArtworkCandidates(supplied)[0], supplied);
  assert.equal(getArtworkCandidates('', 'MPREb_album_release').length, 0);
  console.log(
    'PASS: artwork preserves provider URLs, handles thumbnail shapes, and provides finite fallbacks',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
