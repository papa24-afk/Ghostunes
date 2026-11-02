// Keep provider-supplied URLs intact: increasing the requested size can produce a 404.
export function extractBestThumbnail(item, fallbackId) {
  const images = [];
  const visit = (value, depth = 0) => {
    if (!value || depth > 6) return;
    if (typeof value === 'string') {
      if (/^(https?:\/\/|\/|data:image\/)/.test(value)) images.push({ url: value, width: 0 });
    } else if (Array.isArray(value)) value.forEach((entry) => visit(entry, depth + 1));
    else if (typeof value === 'object') {
      if (typeof value.url === 'string') images.push(value);
      for (const key of [
        'thumbnails',
        'thumbnail',
        'contents',
        'thumbnailRenderer',
        'musicThumbnailRenderer',
        'croppedSquareThumbnailRenderer',
      ])
        visit(value[key], depth + 1);
    }
  };
  visit(item?.thumbnails);
  visit(item?.thumbnail);
  images.sort((first, second) => (Number(second.width) || 0) - (Number(first.width) || 0));
  if (images.length) return images[0].url;
  return /^[\w-]{11}$/.test(fallbackId || '') ? `https://i.ytimg.com/vi/${fallbackId}/hqdefault.jpg` : '';
}
