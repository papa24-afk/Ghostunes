/**
 * App-wide safety net for plain <img> tags (the <Artwork> component has its own, richer fallbacks):
 * when a cover fails to load (busy or blocked network, size not available), try a smaller size or the
 * standard YouTube thumbnail; if nothing works, hide it so the dark background shows instead of a
 * broken-image box with its alt text.
 */
export function nextImageUrl(src: string, attempt: number): string | null {
  // Google-hosted art ("...=w1080-h1080-l90-rj" or "=s1200"): step down through common sizes.
  if (/(?:googleusercontent\.com|ggpht\.com)/.test(src)) {
    const sizes = [544, 226];
    const size = sizes[attempt];
    if (size === undefined) return null;
    if (/=w\d+-h\d+/.test(src)) return src.replace(/=w\d+-h\d+[^?]*/, `=w${size}-h${size}-l90-rj`);
    if (/=s\d+/.test(src)) return src.replace(/=s\d+[^?]*/, `=s${size}`);
    return attempt === 0 ? `${src}=w544-h544-l90-rj` : null;
  }
  // YouTube thumbnails: not every video has the larger ones.
  const m = src.match(/^(https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/[\w-]{11}\/)([\w]+)\.(jpg|webp)/);
  if (m) {
    const order = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
    const next = order.slice(order.indexOf(m[2]) + 1)[attempt];
    return next ? `${m[1].replace('/vi_webp/', '/vi/')}${next}.jpg` : null;
  }
  return null;
}

export function installImageFallback(root: Document = document) {
  root.addEventListener(
    'error',
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.closest('[data-artwork-state]')) return; // <Artwork> handles its own
      const attempt = Number(img.dataset.gtRetry || 0);
      const next = img.src ? nextImageUrl(img.src, attempt) : null;
      if (next && next !== img.src) {
        img.dataset.gtRetry = String(attempt + 1);
        img.src = next;
      } else {
        img.style.visibility = 'hidden';
      }
    },
    true, // image errors don't bubble; catch them on the way down
  );
  // A retried image that loads becomes visible again.
  root.addEventListener(
    'load',
    (event) => {
      const img = event.target;
      if (img instanceof HTMLImageElement && img.style.visibility === 'hidden') img.style.visibility = '';
    },
    true,
  );
}
