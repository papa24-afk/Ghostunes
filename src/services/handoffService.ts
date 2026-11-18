// src/services/handoffService.ts
// Tap / flick to transfer: moves playback between the phone and the desktop app.
import { Track } from '../types';
import { getApiBaseUrl } from '../utils/api';

export interface HandoffSnapshot {
  track: Track;
  queue: Track[];
  queueIndex: number;
  position: number;
  isPlaying: boolean;
  deviceName?: string;
}

export interface IncomingHandoff {
  id: string;
  snapshot: HandoffSnapshot;
  /** Server (= PC) time when the phone's snapshot arrived. */
  stampedAt: number;
}

export type HandoffErrorCode = 'desktop_offline' | 'unreachable' | 'desktop_failed' | 'timeout' | 'invalid';

export class HandoffError extends Error {
  constructor(public code: HandoffErrorCode, message?: string) {
    super(message || code);
    this.name = 'HandoffError';
  }
}

export const HANDOFF_EVENT = 'ghosttunes:handoff';
const MAX_QUEUE = 300;
const POLL_INTERVAL_MS = 300;
const PUSH_TIMEOUT_MS = 15000;
const PRESENCE_INTERVAL_MS = 2000;
const TRIGGER_DEBOUNCE_MS = 4000;
const YT_ID = /^[\w-]{11}$/;

const url = (path: string) => `${getApiBaseUrl()}${path}`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Removes device-local data (offline files, file:// or custom-protocol artwork) before a track leaves this device. */
export function stripLocalTrack(track: Track): Track {
  const { local_audio_url, local_artwork_url, isOfflinePlayable, file_size, ...rest } = track;
  const thumbnail = /^https?:\/\//i.test(rest.thumbnail || '')
    ? rest.thumbnail
    : YT_ID.test(rest.id) ? `https://i.ytimg.com/vi/${rest.id}/hqdefault.jpg` : '';
  const artist_thumbnail = rest.artist_thumbnail && /^https?:\/\//i.test(rest.artist_thumbnail) ? rest.artist_thumbnail : undefined;
  return { ...rest, thumbnail, artist_thumbnail };
}

/** Builds a sanitized snapshot, with the queue capped at 300 tracks around the current one. */
export function buildHandoffSnapshot(track: Track, queue: Track[], queueIndex: number, position: number, isPlaying: boolean): HandoffSnapshot {
  let index = queue[queueIndex]?.id === track.id ? queueIndex : queue.findIndex(item => item.id === track.id);
  let list = queue;
  if (index < 0) {
    list = [track, ...queue];
    index = 0;
  }
  if (list.length > MAX_QUEUE) {
    const start = Math.max(0, Math.min(index - Math.floor(MAX_QUEUE / 2), list.length - MAX_QUEUE));
    list = list.slice(start, start + MAX_QUEUE);
    index -= start;
  }
  return {
    track: stripLocalTrack(track),
    queue: list.map(stripLocalTrack),
    queueIndex: index,
    position: Number.isFinite(position) && position > 0 ? position : 0,
    isPlaying,
    deviceName: deviceLabel(),
  };
}

/** A friendly name for this device, e.g. "Pixel 7" or "SM-S918B". */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'your phone';
  const match = navigator.userAgent.match(/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/);
  const model = match?.[1]?.trim();
  if (model && model !== 'K' && !/^wv$/i.test(model)) return model;
  return 'your phone';
}

// ---------------------------------------------------------------- desktop side

export interface DesktopListenerOptions {
  getNowPlaying: () => HandoffSnapshot | null;
  onHandoff: (handoff: IncomingHandoff) => void;
  onRelease: () => void;
  /** Phone acting as a remote. */
  onCommand?: (command: { action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seek'; position: number | null }) => void;
}

/** Desktop app: keeps an SSE stream open for handoffs and reports what it is playing every 2s. */
export function startDesktopHandoffListener(options: DesktopListenerOptions): () => void {
  let source: EventSource | null = null;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    source = new EventSource(url('/api/handoff/events'));
    source.addEventListener('handoff', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as IncomingHandoff;
        if (data?.id && data.snapshot?.track) options.onHandoff(data);
      } catch (err) {
        console.warn('[Handoff] Bad handoff event:', err);
      }
    });
    source.addEventListener('release', () => options.onRelease());
    source.addEventListener('command', (event: MessageEvent) => {
      try {
        options.onCommand?.(JSON.parse(event.data));
      } catch (err) {
        console.warn('[Handoff] Bad command event:', err);
      }
      // Tell the phone the new state right away instead of waiting for the next 2 s report.
      setTimeout(sendPresence, 250);
      setTimeout(sendPresence, 900);
    });
    source.addEventListener('ready', () => sendPresence());
    // EventSource reconnects on its own; if the server closed it for good, retry.
    source.onerror = () => {
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        setTimeout(connect, 3000);
      }
    };
  };

  const sendPresence = () => {
    if (stopped) return;
    let nowPlaying: HandoffSnapshot | null = null;
    try {
      nowPlaying = options.getNowPlaying();
    } catch {}
    fetch(url('/api/handoff/presence'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nowPlaying }),
    }).catch(() => {});
  };

  connect();
  const presenceTimer = setInterval(sendPresence, PRESENCE_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(presenceTimer);
    source?.close();
    source = null;
  };
}

export async function reportHandoffStatus(id: string, status: 'playing' | 'failed', error?: string): Promise<void> {
  try {
    await fetch(url(`/api/handoff/${encodeURIComponent(id)}/status`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, error }),
    });
  } catch (err) {
    console.warn('[Handoff] Could not report status:', err);
  }
}

// ---------------------------------------------------------------- phone side

async function request(path: string, init?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url(path), { ...init, signal: controller.signal });
  } catch {
    throw new HandoffError('unreachable');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Phone: sends playback to the PC and resolves once the PC is actually playing.
 * The caller keeps playing until this resolves. On timeout a release is sent so both don't end up playing.
 */
export async function pushToDesktop(snapshot: HandoffSnapshot): Promise<void> {
  const response = await request('/api/handoff/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snapshot }),
  });
  if (response.status === 409) throw new HandoffError('desktop_offline');
  if (!response.ok) throw new HandoffError(response.status === 400 ? 'invalid' : 'unreachable');
  const { id } = await response.json();

  const deadline = Date.now() + PUSH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    try {
      const statusResponse = await request(`/api/handoff/${encodeURIComponent(id)}`, undefined, 3000);
      if (!statusResponse.ok) continue;
      const { status, error } = await statusResponse.json();
      if (status === 'playing') return;
      if (status === 'failed') throw new HandoffError('desktop_failed', error);
    } catch (err) {
      if (err instanceof HandoffError && err.code === 'desktop_failed') throw err;
      // Transient network error: keep polling until the deadline.
    }
  }
  await releaseDesktop('timeout');
  throw new HandoffError('timeout');
}

export interface DesktopNowPlaying {
  online: boolean;
  nowPlaying: HandoffSnapshot | null;
  /** Local (phone) time when the response arrived; nowPlaying.position is valid at this moment. */
  receivedAt: number;
}

export async function getDesktopNowPlaying(): Promise<DesktopNowPlaying> {
  const response = await request('/api/handoff/desktop');
  if (!response.ok) throw new HandoffError('unreachable');
  const data = await response.json();
  return { online: Boolean(data.online), nowPlaying: data.nowPlaying || null, receivedAt: Date.now() };
}

export async function releaseDesktop(reason = 'release'): Promise<void> {
  try {
    await request('/api/handoff/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  } catch (err) {
    console.warn('[Handoff] Release failed:', err);
  }
}

// ---------------------------------------------------------------- shared

/** Fades the element out over ~0.9s, pauses it, then restores its volume. */
export function fadeOutAndPause(audio: HTMLAudioElement, durationMs = 900): Promise<void> {
  return new Promise(resolve => {
    if (audio.paused) return resolve();
    const startVolume = audio.volume;
    const startedAt = performance.now();
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
      audio.volume = Math.max(0, startVolume * (1 - progress));
      if (progress < 1 && !audio.paused) {
        setTimeout(step, 30);
        return;
      }
      audio.pause();
      audio.volume = startVolume;
      resolve();
    };
    step();
  });
}

let lastTriggerAt = 0;

/** Fires a handoff trigger (button, flick). NFC triggers arrive from MainActivity as the same window event. */
export function requestHandoff(source: 'button' | 'flick' | 'nfc'): void {
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: { source } }));
}

/** Listens for handoff triggers, debounced (NFC can fire twice). Tells MainActivity that JS is ready. */
export function onHandoffTrigger(callback: (source: string) => void): () => void {
  const handler = (event: Event) => {
    const now = Date.now();
    if (now - lastTriggerAt < TRIGGER_DEBOUNCE_MS) return;
    lastTriggerAt = now;
    callback(String((event as CustomEvent).detail?.source || 'nfc'));
  };
  window.addEventListener(HANDOFF_EVENT, handler);
  (window as any).__ghosttunesHandoffReady = true;
  return () => {
    window.removeEventListener(HANDOFF_EVENT, handler);
    (window as any).__ghosttunesHandoffReady = false;
  };
}
