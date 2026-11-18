import React, { useEffect, useState } from 'react';
import { MonitorSmartphone, Smartphone, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { getApiUrl } from '../utils/api';
import { HandoffSnapshot } from '../services/handoffService';

interface Device {
  id: string;
  type: 'pc' | 'phone';
  name: string;
  output?: string | null;
  online: boolean;
  via?: string;
  nowPlaying: (HandoffSnapshot & { isPlaying: boolean }) | null;
}

const post = (path: string, body: unknown) =>
  fetch(getApiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * Spotify Connect-style device list for the PC: every phone running Ghosttunes, what it's playing
 * (and through what, e.g. Bluetooth earbuds), controls for it, and moving music either way.
 */
export function DevicesPanel({
  getLocalSnapshot,
  onSentToPhone,
}: {
  /** What this PC is playing right now, or null. */
  getLocalSnapshot: () => HandoffSnapshot | null;
  /** Called once a phone is actually playing what we sent (fade out here). */
  onSentToPhone: (deviceName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [pcName, setPcName] = useState('This PC');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(getApiUrl('/api/devices'));
        const data = await res.json();
        if (stop) return;
        const list: Device[] = data.devices || [];
        setPcName(list.find(d => d.id === 'pc')?.name || 'This PC');
        setDevices(list.filter(d => d.type === 'phone' && d.online));
      } catch {}
    };
    load();
    const timer = window.setInterval(load, open ? 1500 : 5000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [open]);

  const command = (id: string, action: string) => post(`/api/devices/${id}/command`, { action }).catch(() => {});

  const playOnPhone = async (d: Device) => {
    const snapshot = getLocalSnapshot();
    if (!snapshot) return;
    setBusy(d.id);
    try {
      await post(`/api/devices/${d.id}/play`, { snapshot });
      // Wait for the phone to report it's playing this song, then let the PC fade out.
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 300));
        const data = await (await fetch(getApiUrl('/api/devices'))).json();
        const phone = (data.devices || []).find((x: Device) => x.id === d.id);
        if (phone?.nowPlaying?.isPlaying && phone.nowPlaying.track.id === snapshot.track.id) {
          onSentToPhone(d.name);
          break;
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const playing = devices.some(d => d.nowPlaying?.isPlaying);

  return (
    <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end gap-2">
      {open && (
        <div className="w-[340px] rounded-2xl bg-[#121214]/95 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md p-3 text-white">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="text-sm font-semibold">Connect to a device</div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-white/[0.04]">
            <MonitorSmartphone className="w-5 h-5 text-[#e0536c]" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#e0536c] truncate">{pcName}</div>
              <div className="text-xs text-white/50">This PC</div>
            </div>
          </div>
          {devices.length === 0 && (
            <div className="px-2 py-3 text-xs text-white/50">Open Ghosttunes on your phone (same Wi-Fi, or paired over Bluetooth).</div>
          )}
          {devices.map(d => {
            const np = d.nowPlaying;
            const sub = [np ? `${np.isPlaying ? 'Playing' : 'Paused'} · ${np.track.title}` : 'Ready', d.output, d.via === 'bluetooth' ? 'Bluetooth' : null]
              .filter(Boolean).join(' · ');
            return (
              <div key={d.id} className="mt-2 px-2 py-2 rounded-xl hover:bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-white/80 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{d.name}</div>
                    <div className="text-xs text-white/50 truncate">{sub}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 pl-8">
                  {np && (
                    <>
                      <button onClick={() => command(d.id, 'previous')} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Previous"><SkipBack className="w-4 h-4" /></button>
                      <button onClick={() => command(d.id, 'toggle')} className="p-1.5 rounded-full bg-white text-black" aria-label={np.isPlaying ? 'Pause' : 'Play'}>
                        {np.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button onClick={() => command(d.id, 'next')} className="p-1.5 rounded-full hover:bg-white/10" aria-label="Next"><SkipForward className="w-4 h-4" /></button>
                      {np.isPlaying && (
                        <button onClick={() => command(d.id, 'sendToPc')} className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15">Play here</button>
                      )}
                    </>
                  )}
                  {!np?.isPlaying && getLocalSnapshot()?.isPlaying && (
                    <button disabled={busy === d.id} onClick={() => playOnPhone(d)} className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-[#e0536c] text-black disabled:opacity-50">
                      {busy === d.id ? 'Sending…' : `Play on ${d.name}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-full border shadow-lg backdrop-blur-md text-xs font-semibold ${playing ? 'bg-[#e0536c] text-black border-transparent' : 'bg-[#18181b]/90 text-white border-white/10'}`}
        aria-label="Devices"
      >
        <MonitorSmartphone className="w-4 h-4" />
        {playing ? devices.find(d => d.nowPlaying?.isPlaying)?.name : 'Devices'}
      </button>
    </div>
  );
}
