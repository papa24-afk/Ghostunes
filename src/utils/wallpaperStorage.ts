/**
 * IndexedDB Wallpaper Storage utility for Metrolist Web.
 * Safely persists high-resolution user-uploaded wallpapers without localStorage quota limits.
 */

const DB_NAME = 'metrolist_wallpaper_db';
const DB_VERSION = 1;
const STORE_NAME = 'wallpapers';
const CUSTOM_WALLPAPER_KEY = 'active_custom_wallpaper';

export interface WallpaperPreset {
  id: string;
  name: string;
  file: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { id: 'dark_anime', name: 'Dark Anime Night (Default)', file: '/wallpapers/dark_anime_bg.png' },
  { id: 'midnight_anime_vector', name: 'Midnight Horizon (Anime)', file: '/wallpapers/midnight_anime.svg' },
  { id: 'midnight_bloom', name: 'Cobalt Bloom', file: '/wallpapers/midnight_bloom.jpg' },
  { id: 'dark_flow_2', name: 'Iridescent Flow', file: '/wallpapers/dark_flow_2.jpg' },
  { id: 'dark_flow_1', name: 'Prism Flow', file: '/wallpapers/dark_flow_1.jpg' }
];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this browser.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open wallpaper IndexedDB.'));
    };
  });
}

/**
 * Saves a user-uploaded image file into IndexedDB as a Blob.
 * Validates mime-types: image/jpeg, image/png, image/webp.
 */
export async function saveCustomWallpaper(file: File | Blob): Promise<string> {
  // Validate MIME type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (file.type && !allowedTypes.includes(file.type.toLowerCase())) {
    throw new Error('Unsupported image format. Please select a JPG, JPEG, PNG, or WebP image.');
  }

  // Check file size (limit to 35MB to prevent memory exhaustion)
  if (file.size > 35 * 1024 * 1024) {
    throw new Error('Image is too large. Please select an image under 35 MB.');
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const putRequest = store.put(file, CUSTOM_WALLPAPER_KEY);

      putRequest.onsuccess = () => {
        const objectUrl = URL.createObjectURL(file);
        resolve(objectUrl);
      };

      putRequest.onerror = () => {
        reject(putRequest.error || new Error('Failed to save wallpaper to IndexedDB.'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

/**
 * Retrieves the stored custom wallpaper from IndexedDB as an object URL.
 * Returns null if none is saved.
 */
export async function loadCustomWallpaper(): Promise<string | null> {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(CUSTOM_WALLPAPER_KEY);

        getRequest.onsuccess = () => {
          const result = getRequest.result;
          if (result && result instanceof Blob) {
            const objectUrl = URL.createObjectURL(result);
            resolve(objectUrl);
          } else {
            resolve(null);
          }
        };

        getRequest.onerror = () => {
          console.warn('Could not read custom wallpaper from IndexedDB, falling back.');
          resolve(null);
        };

        transaction.oncomplete = () => {
          db.close();
        };
      } catch (err) {
        console.warn('Error reading from IndexedDB:', err);
        db.close();
        resolve(null);
      }
    });
  } catch (err) {
    console.warn('IndexedDB unavailable:', err);
    return null;
  }
}

/**
 * Deletes any stored custom wallpaper from IndexedDB.
 */
export async function clearCustomWallpaper(): Promise<void> {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const deleteRequest = store.delete(CUSTOM_WALLPAPER_KEY);

        deleteRequest.onsuccess = () => {
          resolve();
        };

        deleteRequest.onerror = () => {
          resolve();
        };

        transaction.oncomplete = () => {
          db.close();
        };
      } catch {
        db.close();
        resolve();
      }
    });
  } catch {
    // Graceful fallback
  }
}
