import React, { useEffect, useState } from 'react';
import { Track } from '../types';

export interface HandoffAnimation {
  key: number;
  direction: 'in' | 'out';
  track: Track;
  deviceName: string;
}

/**
 * Full-screen "it just arrived" moment: the album art flies in from below (from the phone),
 * blooms over a blurred copy of itself, shows where it came from, then fades back to the app.
 * Direction 'out' plays it in reverse when the phone takes the music back.
 */
export function HandoffArrival({ animation, onDone }: { animation: HandoffAnimation | null; onDone: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    if (!animation) return;
    setPhase('enter');
    const hold = window.setTimeout(() => setPhase('hold'), 450);
    const exit = window.setTimeout(() => setPhase('exit'), animation.direction === 'in' ? 1500 : 1100);
    const done = window.setTimeout(onDone, animation.direction === 'in' ? 1850 : 1450);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(exit);
      window.clearTimeout(done);
    };
  }, [animation?.key]);

  if (!animation) return null;
  const { track, direction, deviceName } = animation;
  const art = track.thumbnail;
  const arriving = direction === 'in';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden pointer-events-none"
      style={{ animation: `${phase === 'exit' ? 'gtFadeOut 350ms ease forwards' : 'gtFadeIn 120ms ease forwards'}` }}
      role="status"
      aria-live="polite"
    >
      <style>{`
        @keyframes gtFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes gtFadeOut { from { opacity: 1 } to { opacity: 0 } }
        @keyframes gtBgIn { from { opacity: 0; transform: scale(1.35) } to { opacity: 1; transform: scale(1.15) } }
        @keyframes gtArtIn {
          0%   { transform: translateY(60vh) scale(0.35) rotateX(28deg); opacity: 0; filter: blur(6px) }
          55%  { transform: translateY(-2vh) scale(1.04) rotateX(0deg); opacity: 1; filter: blur(0) }
          100% { transform: translateY(0) scale(1) rotateX(0deg); opacity: 1 }
        }
        @keyframes gtArtOut {
          0%   { transform: translateY(0) scale(1); opacity: 1 }
          25%  { transform: translateY(-2vh) scale(1.03); opacity: 1 }
          100% { transform: translateY(65vh) scale(0.35) rotateX(-24deg); opacity: 0; filter: blur(6px) }
        }
        @keyframes gtRing { from { transform: scale(0.6); opacity: 0.9 } to { transform: scale(1.9); opacity: 0 } }
        @keyframes gtText { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      {/* Blurred, color-rich backdrop from the artwork. */}
      <div className="absolute inset-0 bg-black/80" />
      {art && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url("${art}")`,
            filter: 'blur(70px) saturate(1.4) brightness(0.55)',
            animation: 'gtBgIn 600ms cubic-bezier(.2,.8,.2,1) forwards',
          }}
        />
      )}

      <div className="relative flex flex-col items-center" style={{ perspective: '900px' }}>
        <div
          className="absolute rounded-[28px] border-2 border-white/40"
          style={{ width: '320px', height: '320px', top: 0, animation: 'gtRing 800ms 260ms cubic-bezier(.2,.8,.2,1) both' }}
        />
        <img
          src={art}
          alt=""
          className="w-[320px] h-[320px] rounded-[20px] object-cover shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
          style={{
            animation: arriving
              ? 'gtArtIn 560ms cubic-bezier(.2,.9,.25,1) both'
              : 'gtArtOut 650ms cubic-bezier(.55,0,.75,.2) both',
          }}
        />
        <div className="mt-8 text-center" style={{ animation: 'gtText 300ms 200ms ease both' }}>
          <div className="text-3xl font-bold text-white max-w-[70vw] truncate">{track.title}</div>
          <div className="mt-1 text-lg text-white/70 max-w-[70vw] truncate">{track.artist}</div>
        </div>
      </div>
    </div>
  );
}
