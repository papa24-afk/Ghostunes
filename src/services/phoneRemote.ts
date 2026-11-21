import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../utils/api';
import { HandoffSnapshot } from './handoffService';

/** A phone whose music this PC is controlling (Spotify Connect-style). */
export interface PhoneRemote {
  id: string;
  name: string;
  output?: string | null;
  via?: string;
  nowPlaying: HandoffSnapshot & { isPlaying: boolean };
  /** Local time when nowPlaying.position was valid. */
  at: number;
}

const POLL_MS = 700;

/**
 * While the PC isn't playing and a phone is, the PC's player becomes a remote for that phone:
 * same track, time and buttons, but play/pause/next/previous/seek act on the phone.
 * It stays a remote (even while the phone is paused) until the PC plays something itself.
 */
export function usePhoneRemote(enabled: boolean, isLocalPlaying: () => boolean) {
  const [remote, setRemote] = useState<PhoneRemote | null>(null);
  const remoteRef = useRef<PhoneRemote | null>(null);
  remoteRef.current = remote;
  /** Optimistic state after a button press, so the UI doesn't wait for the next report. */
  const pendingRef = useRef<{ until: number; isPlaying?: boolean; position?: number } | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(getApiUrl('/api/devices'));
        const data = await res.json();
        if (stop) return;
        const phones = (data.devices || []).filter((d: any) => d.type === 'phone' && d.online && d.nowPlaying);
        const current = remoteRef.current;
        if (isLocalPlaying()) {
          // The PC took over: stop the phone too, like moving playback to this device.
          if (current) {
            const p = phones.find((d: any) => d.id === current.id);
            if (p?.nowPlaying?.isPlaying) sendPhoneCommand(current.id, 'pause');
            setRemote(null);
          }
          return;
        }
        const pick =
          (current && phones.find((d: any) => d.id === current.id)) ||
          phones.find((d: any) => d.nowPlaying.isPlaying);
        if (!pick) {
          if (current) setRemote(null);
          return;
        }
        let np = pick.nowPlaying;
        const pending = pendingRef.current;
        if (pending && Date.now() < pending.until) {
          np = {
            ...np,
            isPlaying: pending.isPlaying ?? np.isPlaying,
            position: pending.position ?? np.position,
          };
        } else {
          pendingRef.current = null;
        }
        setRemote({ id: pick.id, name: pick.name, output: pick.output, via: pick.via, nowPlaying: np, at: Date.now() });
      } catch {}
    };
    poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, [enabled]);

  // Keep the time moving between reports.
  useEffect(() => {
    if (!remote?.nowPlaying.isPlaying) return;
    const t = window.setInterval(() => setTick(n => n + 1), 500);
    return () => window.clearInterval(t);
  }, [remote?.nowPlaying.isPlaying, remote?.id]);

  const durationOf = (r: PhoneRemote) => {
    const t: any = r.nowPlaying.track;
    return Number(t.durationSeconds) || 0;
  };

  const positionNow = (): number => {
    const r = remoteRef.current;
    if (!r) return 0;
    const elapsed = r.nowPlaying.isPlaying ? (Date.now() - r.at) / 1000 : 0;
    const pos = r.nowPlaying.position + elapsed;
    const dur = durationOf(r);
    return dur > 0 ? Math.min(pos, dur) : pos;
  };

  const optimistic = (patch: { isPlaying?: boolean; position?: number }) => {
    const r = remoteRef.current;
    if (!r) return;
    pendingRef.current = { until: Date.now() + 2500, ...patch };
    setRemote({
      ...r,
      at: Date.now(),
      nowPlaying: { ...r.nowPlaying, position: patch.position ?? positionNow(), isPlaying: patch.isPlaying ?? r.nowPlaying.isPlaying },
    });
  };

  const send = (action: string, position?: number) => {
    const r = remoteRef.current;
    if (r) sendPhoneCommand(r.id, action, position);
  };

  return {
    remote,
    positionNow,
    duration: remote ? durationOf(remote) : 0,
    toggle: () => {
      const r = remoteRef.current;
      if (!r) return;
      optimistic({ isPlaying: !r.nowPlaying.isPlaying });
      send('toggle');
    },
    next: () => send('next'),
    previous: () => send('previous'),
    seek: (sec: number) => {
      optimistic({ position: sec });
      send('seek', sec);
    },
    /** Ask the phone to move its music to this PC. */
    playHere: () => send('sendToPc'),
    /** Stop controlling the phone (e.g. the PC is about to play something). */
    clear: () => setRemote(null),
  };
}

export function sendPhoneCommand(id: string, action: string, position?: number) {
  return fetch(getApiUrl(`/api/devices/${encodeURIComponent(id)}/command`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, position }),
  }).catch(() => {});
}
