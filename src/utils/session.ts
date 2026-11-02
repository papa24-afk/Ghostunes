import { Track } from '../types';

export interface SavedSession {
  queue: Track[];
  currentIndex: number;
  currentTime: number;
  sessionName: string;
  savedAt: number;
}

// Saved data can come from an older build or an interrupted write.
export function parseSavedSession(raw: string | null): SavedSession | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Array.isArray(value.queue) || !value.queue.length) return null;
    if (
      !value.queue.every(
        (track: Track) =>
          track &&
          typeof track.id === 'string' &&
          typeof track.title === 'string' &&
          typeof track.artist === 'string' &&
          typeof track.duration === 'string' &&
          typeof track.thumbnail === 'string',
      )
    )
      return null;
    const currentIndex = Number.isInteger(value.currentIndex)
      ? Math.max(0, Math.min(value.queue.length - 1, value.currentIndex))
      : 0;
    return {
      queue: value.queue,
      currentIndex,
      currentTime: Number.isFinite(value.currentTime) ? Math.max(0, value.currentTime) : 0,
      sessionName: typeof value.sessionName === 'string' ? value.sessionName : 'Previous session',
      savedAt: Number.isFinite(value.savedAt) ? value.savedAt : 0,
    };
  } catch {
    return null;
  }
}
