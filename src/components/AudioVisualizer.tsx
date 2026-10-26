import React, { useEffect, useRef } from 'react';

interface Props {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
}

export const AudioVisualizer: React.FC<Props> = ({ audioRef, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudio = () => {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioContextClass();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 64;

        try {
          sourceRef.current = audioContextRef.current.createMediaElementSource(audio);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
        } catch {
          // MediaElementSource may already be connected
        }
      }

      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    };

    const handlePlay = () => setupAudio();
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('play', handlePlay);
    };
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!isPlaying) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const analyser = analyserRef.current;
    const bufferLength = analyser ? analyser.frequencyBinCount : 16;
    const dataArray = new Uint8Array(bufferLength);
    let step = 0;

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      step += 0.15;

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.floor(
            Math.abs(Math.sin(step + i * 0.45) * 190) + 
            Math.abs(Math.cos(step * 0.7 + i * 0.3) * 60)
          );
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = Math.max(2, (dataArray[i] / 255) * canvas.height * 0.9);

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#e11d48');
        gradient.addColorStop(1, '#fb7185');

        ctx.fillStyle = gradient;
        const w = Math.max(1.5, barWidth - 2);
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(x, canvas.height - barHeight, w, barHeight, [2, 2, 0, 0]);
          ctx.fill();
        } else {
          ctx.fillRect(x, canvas.height - barHeight, w, barHeight);
        }

        x += barWidth;
      }
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={32}
      className="rounded opacity-80"
    />
  );
};
