import React, { useState } from 'react';
import { getApiBaseUrl, setCustomApiUrl } from '../utils/api';
import { isFlickHandoffEnabled, setFlickHandoffEnabled } from '../services/gestureService';

export function MobileServerSettings() {
  const [address, setAddress] = useState(getApiBaseUrl);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flickEnabled, setFlickEnabled] = useState(isFlickHandoffEnabled);

  const toggleFlick = () => {
    const next = !flickEnabled;
    setFlickEnabled(next);
    setFlickHandoffEnabled(next);
  };

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    let url: URL;
    try {
      url = new URL(address.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      setError('Enter a complete HTTP or HTTPS server address.');
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const base = url.toString().replace(/\/+$/, '');
      const response = await fetch(`${base}/api/health`, { signal: controller.signal });
      if (!response.ok || (await response.json()).status !== 'ok') throw new Error();
      setCustomApiUrl(base);
      window.location.reload();
    } catch {
      setError('Could not reach the music server. Check the address and your connection. For a local server, keep your phone and computer on the same Wi-Fi.');
    } finally {
      window.clearTimeout(timer);
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={connect} className="p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-3">
        <h3 className="text-sm font-semibold text-white">Music server</h3>
        <p className="text-xs text-zinc-400">This test build needs a music server. Enter the address provided for testing. For a server on your computer, connect both devices to the same Wi-Fi.</p>
        <label className="block text-xs text-zinc-300">Server address
          <input type="url" required value={address} onChange={event => setAddress(event.target.value)} placeholder="http://192.168.1.10:3001" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="mt-2 w-full px-3 py-2 rounded-lg border border-white/15 bg-black/30 text-sm text-white" />
        </label>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <button disabled={checking} className="w-full px-3 py-2 rounded-lg bg-[#9e2a40] text-sm font-semibold text-white disabled:opacity-50">{checking ? 'Connecting…' : 'Save and reconnect'}</button>
        <p className="text-[11px] text-zinc-500">Reconnecting reloads the app and pauses playback.</p>
      </form>

      <div className="p-4 rounded-xl border border-white/10 bg-white/[0.03] flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Flick to PC</h3>
          <p className="text-xs text-zinc-400 mt-1">With Ghosttunes open, flick your phone toward your PC to move the song there. Flick again (or tap your NFC sticker) to bring it back.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={flickEnabled}
          aria-label="Flick to PC"
          onClick={toggleFlick}
          className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${flickEnabled ? 'bg-[#9e2a40]' : 'bg-zinc-700'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${flickEnabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>
    </div>
  );
}
