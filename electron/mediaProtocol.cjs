// electron/mediaProtocol.cjs
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { protocol } = require('electron');

const SCHEME = 'ghost-media';

function registerPrivilegedSchemes() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        bypassCSP: true,
        stream: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ]);
}

function setupMediaProtocol(database, mediaDir, artworkDir) {
  protocol.handle(SCHEME, async (request) => {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          }
        });
      }

      const url = new URL(request.url);
      const host = url.host; // 'track' or 'artwork'
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));

      if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
        return new Response('Invalid media ID', { status: 400 });
      }

      let filePath = null;

      if (host === 'track') {
        const track = database.getTrack(id);
        if (track && track.local_audio_path && fs.existsSync(track.local_audio_path)) {
          // Verify path containment
          const resolved = path.resolve(track.local_audio_path);
          if (resolved.startsWith(path.resolve(mediaDir))) {
            filePath = resolved;
          }
        }
      } else if (host === 'artwork') {
        const track = database.getTrack(id);
        if (track && track.local_artwork_path && fs.existsSync(track.local_artwork_path)) {
          const resolved = path.resolve(track.local_artwork_path);
          if (resolved.startsWith(path.resolve(artworkDir))) {
            filePath = resolved;
          }
        }
        if (!filePath) {
          const sanitizedId = String(id || '').replace(/[\/\\:*?"<>|]/g, '_').substring(0, 100);
          for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
            for (const name of [`${id}${ext}`, `${sanitizedId}${ext}`]) {
              const directPath = path.join(artworkDir, name);
              if (fs.existsSync(directPath)) {
                filePath = path.resolve(directPath);
                break;
              }
            }
            if (filePath) break;
          }
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Media Not Found', { status: 404 });
      }

      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'audio/mpeg';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.m4a' || ext === '.mp4') mimeType = 'audio/mp4';
      else if (ext === '.webm') mimeType = 'audio/webm';
      else if (ext === '.ogg') mimeType = 'audio/ogg';
      else if (ext === '.wav') mimeType = 'audio/wav';
      else if (ext === '.flac') mimeType = 'audio/flac';

      const stat = fs.statSync(filePath);
      const totalSize = stat.size;
      const rangeHeader = request.headers.get('range');

      const responseHeaders = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length'
      };

      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
          const safeStart = Math.max(0, Math.min(start, totalSize - 1));
          const safeEnd = Math.max(safeStart, Math.min(end, totalSize - 1));
          const chunkSize = safeEnd - safeStart + 1;

          responseHeaders['Content-Range'] = `bytes ${safeStart}-${safeEnd}/${totalSize}`;
          responseHeaders['Content-Length'] = String(chunkSize);

          const nodeStream = fs.createReadStream(filePath, { start: safeStart, end: safeEnd });
          const webStream = Readable.toWeb(nodeStream);

          return new Response(webStream, {
            status: 206,
            statusText: 'Partial Content',
            headers: responseHeaders
          });
        }
      }

      responseHeaders['Content-Length'] = String(totalSize);
      const nodeStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream, {
        status: 200,
        statusText: 'OK',
        headers: responseHeaders
      });
    } catch (err) {
      console.error('[MediaProtocol] Error serving media:', err);
      return new Response('Internal Media Error', { status: 500 });
    }
  });
}

module.exports = {
  SCHEME,
  registerPrivilegedSchemes,
  setupMediaProtocol
};
