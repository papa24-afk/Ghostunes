// src/components/AudioLabModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { X, Sliders, Activity, Power, RotateCcw, Volume2, Shield, Sparkles } from 'lucide-react';
import {
  audioLab,
  EQ_FREQUENCIES,
  AUDIO_LAB_PRESETS
} from '../services/audioLabEngine';

interface AudioLabModalProps {
  isOpen: boolean;
  onClose: () => void;
  isPlaying?: boolean;
}

export const AudioLabModal: React.FC<AudioLabModalProps> = ({
  isOpen,
  onClose,
  isPlaying = false
}) => {
  const [bypassed, setBypassed] = useState<boolean>(false);
  const [normalizer, setNormalizer] = useState<boolean>(false);
  const [currentPreset, setCurrentPreset] = useState<string>('flat');
  const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const [preamp, setPreamp] = useState<number>(0);
  const [visualizerMode, setVisualizerMode] = useState<'spectrum' | 'waveform'>('spectrum');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const audioEl = document.querySelector('audio');
    if (audioEl) {
      audioLab.init(audioEl);
      audioLab.resume();
    }
    const st = audioLab.getState();
    setBypassed(st.isBypassed);
    setNormalizer(st.isNormalizerEnabled);
    setCurrentPreset(st.currentPresetId);
    setGains([...st.currentGains]);
    setPreamp(st.preampGainValue);
    audioLab.resume();
  }, [isOpen]);

  // Real-time Visualizer Animation Loop
  useEffect(() => {
    if (!isOpen) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioLab.getAnalyser();
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Dark background with subtle grid
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);

      if (visualizerMode === 'spectrum') {
        analyser.getByteFrequencyData(dataArray);
        const barWidth = (width / 64) - 1.5;
        let x = 0;

        for (let i = 0; i < 64; i++) {
          const val = dataArray[i * 2] || 0;
          const barHeight = (val / 255) * (height - 10);

          // Warm amber to rose gradient
          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, '#f59e0b');
          grad.addColorStop(0.7, '#f43f5e');
          grad.addColorStop(1, '#ec4899');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, height - barHeight, Math.max(2, barWidth), barHeight, [2, 2, 0, 0]);
          ctx.fill();

          x += barWidth + 1.5;
        }
      } else {
        // Waveform oscilloscope
        analyser.getByteTimeDomainData(dataArray);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#f59e0b';
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isOpen, visualizerMode]);

  const handleGainChange = (idx: number, value: number) => {
    const next = [...gains];
    next[idx] = value;
    setGains(next);
    audioLab.setBandGain(idx, value);
    setCurrentPreset('custom');
  };

  const handlePreampChange = (value: number) => {
    setPreamp(value);
    audioLab.setPreamp(value);
  };

  const handlePresetSelect = (presetId: string) => {
    const preset = AUDIO_LAB_PRESETS.find(p => p.id === presetId);
    if (preset) {
      audioLab.applyPreset(preset);
      setCurrentPreset(preset.id);
      setGains([...preset.gains]);
      setPreamp(preset.preamp);
      setNormalizer(preset.normalizer);
    }
  };

  const handleToggleBypass = () => {
    const next = !bypassed;
    setBypassed(next);
    audioLab.setBypass(next);
  };

  const handleToggleNormalizer = () => {
    const next = !normalizer;
    setNormalizer(next);
    audioLab.setNormalizer(next);
  };

  const handleReset = () => {
    audioLab.resetToFlat();
    setBypassed(false);
    setCurrentPreset('flat');
    setGains([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    setPreamp(0);
    setNormalizer(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-3xl bg-zinc-950/95 border border-zinc-800/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sliders className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif text-white tracking-wide">Audio Lab</h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Studio Equalizer & DSP
                </span>
              </div>
              <p className="text-xs text-zinc-400">10-band precision biquad filtering, volume limiter & real-time spectrum</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Master Bypass Toggle */}
            <button
              onClick={handleToggleBypass}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors border ${
                bypassed
                  ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                  : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              }`}
              title="Toggle EQ Bypass"
            >
              <Power className="w-3.5 h-3.5" />
              <span>{bypassed ? 'BYPASSED' : 'ACTIVE'}</span>
            </button>

            <button
              onClick={handleReset}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-colors"
              title="Reset to Flat Reference"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Visualizer Stage */}
          <div className="rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-900/60 relative">
            <canvas
              ref={canvasRef}
              width={700}
              height={110}
              className="w-full h-28 block"
            />
            {/* Visualizer Mode Switcher */}
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-zinc-950/80 backdrop-blur-sm p-1 rounded-lg border border-zinc-800/80 text-[10px] font-mono">
              <button
                onClick={() => setVisualizerMode('spectrum')}
                className={`px-2 py-0.5 rounded ${
                  visualizerMode === 'spectrum' ? 'bg-amber-500 text-black font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Spectrum
              </button>
              <button
                onClick={() => setVisualizerMode('waveform')}
                className={`px-2 py-0.5 rounded ${
                  visualizerMode === 'waveform' ? 'bg-amber-500 text-black font-semibold' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Oscilloscope
              </button>
            </div>
          </div>

          {/* Preset Selector Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
              <span>Studio Master Presets</span>
              <span className="text-[10px] text-zinc-500">{currentPreset}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AUDIO_LAB_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePresetSelect(p.id)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    currentPreset === p.id
                      ? 'bg-amber-500/15 border-amber-500/50 text-white'
                      : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-800/80 text-zinc-300'
                  }`}
                >
                  <div className="text-xs font-semibold font-serif truncate">{p.name}</div>
                  <div className="text-[10px] text-zinc-400 truncate mt-0.5">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 10-Band Equalizer Sliders */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  10-Band Biquad Filter Bank (&plusmn;12 dB)
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-zinc-400">Preamp:</span>
                <input
                  type="range"
                  min="-12"
                  max="6"
                  step="0.5"
                  value={preamp}
                  onChange={(e) => handlePreampChange(parseFloat(e.target.value))}
                  className="w-24 accent-amber-500"
                />
                <span className="text-amber-400 w-12 text-right">{preamp > 0 ? `+${preamp}` : preamp} dB</span>
              </div>
            </div>

            {/* Vertical Sliders */}
            <div className="grid grid-cols-10 gap-1 sm:gap-2 pt-2">
              {EQ_FREQUENCIES.map((freq, idx) => {
                const gain = gains[idx] || 0;
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}Hz`;

                return (
                  <div key={freq} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-400 h-4">
                      {gain > 0 ? `+${gain}` : gain}
                    </span>
                    <div className="h-36 flex items-center justify-center">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={gain}
                        disabled={bypassed}
                        onChange={(e) => handleGainChange(idx, parseFloat(e.target.value))}
                        className="w-32 -rotate-90 accent-amber-500 cursor-pointer disabled:opacity-40"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-zinc-300 font-medium">
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Volume Normalizer & Limiter Card */}
          <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-200">Dynamics Normalizer & Soft-Knee Limiter</div>
                <div className="text-[11px] text-zinc-400">
                  Balances perceived loudness between tracks and prevents harsh digital clipping.
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleNormalizer}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-colors border ${
                normalizer
                  ? 'bg-amber-500 text-black border-amber-400 font-semibold'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {normalizer ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <div>Audio Engine: Web Audio API &bull; 48kHz High-Fidelity</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
