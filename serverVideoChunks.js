// Faster video for the Song / Video panel. YouTube lets each download connection run only about as fast
// as the music needs (~24 KB/s here), which a picture can't live on; several connections at once can.
// So a requested byte range is fetched as 128 KB pieces, 8 at a time (small, so the picture starts
// quickly), and sent out in order. Recent
// pieces are kept in memory (up to 200, ~25 MB), so jumping back or a repeated request is instant.

export const CHUNK = 128 * 1024;
const PARALLEL = 8;
const KEEP = 200;

/**
 * [fetchPiece](start, end) -> Promise<Buffer> downloads one piece. Returns
 * stream(key, start, end, write, isClosed): sends bytes start..end (inclusive) through write(buffer).
 */
export function createChunkFetcher(fetchPiece) {
  const pieces = new Map(); // key:index -> Promise<Buffer>

  const piece = (key, index, total) => {
    const id = `${key}:${index}`;
    let p = pieces.get(id);
    if (p) {
      pieces.delete(id); // most recently used goes to the end
      pieces.set(id, p);
      return p;
    }
    const from = index * CHUNK;
    const to = Math.min(total - 1, from + CHUNK - 1);
    const get = () => fetchPiece(from, to);
    p = get().catch(() => get()); // one retry: a single slow or dropped connection shouldn't break playback
    p.catch(() => pieces.delete(id));
    pieces.set(id, p);
    while (pieces.size > KEEP) pieces.delete(pieces.keys().next().value);
    return p;
  };

  return async function stream(key, total, start, end, write, isClosed) {
    const first = Math.floor(start / CHUNK);
    const last = Math.floor(end / CHUNK);
    for (let i = first; i <= last; i++) {
      if (isClosed()) return;
      // Ask for the next few pieces now, so they download side by side.
      for (let j = i; j <= Math.min(last, i + PARALLEL - 1); j++) piece(key, j, total);
      const buf = await piece(key, i, total);
      const from = i === first ? start - i * CHUNK : 0;
      const to = i === last ? end - i * CHUNK + 1 : buf.length;
      if (isClosed()) return;
      await write(buf.subarray(from, to));
    }
  };
}

/** Collect a readable stream into one Buffer. */
export function collect(readable) {
  return new Promise((resolve, reject) => {
    const parts = [];
    readable.on('data', (d) => parts.push(d));
    readable.on('end', () => resolve(Buffer.concat(parts)));
    readable.on('error', reject);
  });
}
