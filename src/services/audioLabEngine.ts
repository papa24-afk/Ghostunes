// src/services/audioLabEngine.ts
import { AudioLabPreset } from '../types';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const AUDIO_LAB_PRESETS: AudioLabPreset[] = [
  {
    id: 'flat',
    name: 'Flat / Studio Reference',
    description: 'Completely uncolored, transparent monitor profile.',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
    normalizer: false
  },
  {
    id: 'bass_boost',
    name: 'Ghost Sub-Bass Punch',
    description: 'Deep, resonant sub-bass elevation for electronic, hip-hop, and club music.',
    gains: [7, 6, 4, 1, 0, 0, 0, 1, 2, 2],
    preamp: -2,
    normalizer: true
  },
  {
    id: 'vocal_clarity',
    name: 'Vocal Presence & Intelligibility',
    description: 'Sculpts away lower mid mud and enhances vocal air between 1kHz and 4kHz.',
    gains: [-2, -2, -1, 0, 2, 4, 4, 3, 1, 0],
    preamp: 0,
    normalizer: true
  },
  {
    id: 'acoustic',
    name: 'Acoustic & Unplugged',
    description: 'Warm organic body with delicate sparkle for strings, piano, and live instruments.',
    gains: [3, 2, 1, 0, 0, 1, 2, 3, 4, 3],
    preamp: 0,
    normalizer: false
  },
  {
    id: 'electronic',
    name: 'Electronic Modern Club',
    description: 'Scooped mids with elevated punchy sub-lows and ultra-crisp highs.',
    gains: [6, 5, 2, -1, -2, 0, 2, 4, 5, 6],
    preamp: -1.5,
    normalizer: true
  },
  {
    id: 'late_night',
    name: 'Late Night Velvet',
    description: 'Softens high transient spikes and levels dynamics for fatigue-free listening.',
    gains: [2, 2, 1, 1, 0, 0, -1, -2, -4, -6],
    preamp: 0,
    normalizer: true
  }
];

class AudioLabSubsystem {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private preampNode: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private compressorNode: DynamicsCompressorNode | null = null;
  private normalizerBypassGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isBypassed: boolean = false;
  private isNormalizerEnabled: boolean = false;
  private currentPresetId: string = 'flat';
  private currentGains: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  private preampGainValue: number = 0;
  private attachedElement: HTMLAudioElement | null = null;

  public init(audioElement: HTMLAudioElement) {
    if (this.attachedElement === audioElement && this.audioCtx) {
      return; // Already initialized for this element
    }

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      this.attachedElement = audioElement;

      this.sourceNode = this.audioCtx.createMediaElementSource(audioElement);

      // Preamp Gain Node
      this.preampNode = this.audioCtx.createGain();
      this.preampNode.gain.value = 1.0;

      // 10-Band Biquad Filters
      this.filters = EQ_FREQUENCIES.map((freq, idx) => {
        const filter = this.audioCtx!.createBiquadFilter();
        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4;
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Volume Normalizer / Dynamics Compressor
      this.compressorNode = this.audioCtx.createDynamicsCompressor();
      this.compressorNode.threshold.value = -24;
      this.compressorNode.knee.value = 30;
      this.compressorNode.ratio.value = 4;
      this.compressorNode.attack.value = 0.003;
      this.compressorNode.release.value = 0.25;

      // Analyser Node for visualizer
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.8;

      // Connect the Graph
      let currentNode: AudioNode = this.sourceNode;
      currentNode.connect(this.preampNode);
      currentNode = this.preampNode;

      // Chain through filters
      for (const filter of this.filters) {
        currentNode.connect(filter);
        currentNode = filter;
      }

      // Chain to analyser and destination
      currentNode.connect(this.analyserNode);
      this.analyserNode.connect(this.audioCtx.destination);

      // Restore saved settings
      this.loadSavedSettings();
    } catch (e) {
      console.warn('[AudioLab] Init Web Audio Graph error:', e);
    }
  }

  public resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  public setBandGain(bandIndex: number, gainDb: number) {
    if (bandIndex < 0 || bandIndex >= this.filters.length) return;
    this.currentGains[bandIndex] = gainDb;
    this.currentPresetId = 'custom';
    if (!this.isBypassed && this.filters[bandIndex]) {
      this.filters[bandIndex].gain.setTargetAtTime(gainDb, this.audioCtx?.currentTime || 0, 0.02);
    }
    this.saveSettings();
  }

  public setPreamp(preampDb: number) {
    this.preampGainValue = preampDb;
    if (this.preampNode && !this.isBypassed) {
      const linearGain = Math.pow(10, preampDb / 20);
      this.preampNode.gain.setTargetAtTime(linearGain, this.audioCtx?.currentTime || 0, 0.02);
    }
    this.saveSettings();
  }

  public applyPreset(preset: AudioLabPreset) {
    this.currentPresetId = preset.id;
    this.currentGains = [...preset.gains];
    this.preampGainValue = preset.preamp;
    this.isNormalizerEnabled = preset.normalizer;

    if (!this.isBypassed) {
      preset.gains.forEach((gain, idx) => {
        if (this.filters[idx]) {
          this.filters[idx].gain.setTargetAtTime(gain, this.audioCtx?.currentTime || 0, 0.02);
        }
      });
      if (this.preampNode) {
        const linear = Math.pow(10, preset.preamp / 20);
        this.preampNode.gain.setTargetAtTime(linear, this.audioCtx?.currentTime || 0, 0.02);
      }
    }
    this.saveSettings();
  }

  public setBypass(bypass: boolean) {
    this.isBypassed = bypass;
    const now = this.audioCtx?.currentTime || 0;

    if (bypass) {
      // Set all filter gains to 0 dB smoothly
      this.filters.forEach(f => f.gain.setTargetAtTime(0, now, 0.02));
      if (this.preampNode) this.preampNode.gain.setTargetAtTime(1.0, now, 0.02);
    } else {
      // Re-apply current gains
      this.filters.forEach((f, idx) => f.gain.setTargetAtTime(this.currentGains[idx] || 0, now, 0.02));
      if (this.preampNode) {
        const linear = Math.pow(10, this.preampGainValue / 20);
        this.preampNode.gain.setTargetAtTime(linear, now, 0.02);
      }
    }
    this.saveSettings();
  }

  public setNormalizer(enabled: boolean) {
    this.isNormalizerEnabled = enabled;
    // When enabled, compressor threshold is active; when disabled, threshold is set to 0 dB
    if (this.compressorNode) {
      const now = this.audioCtx?.currentTime || 0;
      this.compressorNode.threshold.setTargetAtTime(enabled ? -24 : 0, now, 0.02);
    }
    this.saveSettings();
  }

  public resetToFlat() {
    const flat = AUDIO_LAB_PRESETS[0];
    this.applyPreset(flat);
    this.setBypass(false);
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  public getState() {
    return {
      isBypassed: this.isBypassed,
      isNormalizerEnabled: this.isNormalizerEnabled,
      currentPresetId: this.currentPresetId,
      currentGains: [...this.currentGains],
      preampGainValue: this.preampGainValue
    };
  }

  private saveSettings() {
    try {
      localStorage.setItem('ghost_audio_lab_settings', JSON.stringify(this.getState()));
    } catch {}
  }

  private loadSavedSettings() {
    try {
      const raw = localStorage.getItem('ghost_audio_lab_settings');
      if (raw) {
        const saved = JSON.parse(raw);
        this.isBypassed = Boolean(saved.isBypassed);
        this.isNormalizerEnabled = Boolean(saved.isNormalizerEnabled);
        this.currentPresetId = saved.currentPresetId || 'flat';
        this.currentGains = saved.currentGains || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.preampGainValue = saved.preampGainValue || 0;

        if (!this.isBypassed) {
          const now = this.audioCtx?.currentTime || 0;
          this.filters.forEach((f, idx) => {
            if (this.currentGains[idx] !== undefined) {
              f.gain.setValueAtTime(this.currentGains[idx], now);
            }
          });
          if (this.preampNode) {
            const linear = Math.pow(10, this.preampGainValue / 20);
            this.preampNode.gain.setValueAtTime(linear, now);
          }
        }
      }
    } catch {}
  }
}

export const audioLab = new AudioLabSubsystem();
