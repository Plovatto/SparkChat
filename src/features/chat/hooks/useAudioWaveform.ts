import { useEffect, useState } from 'react';
import { createAudioContext } from '@lib/audio/shared-audio-context';

const WAVEFORM_BAR_COUNT = 40;
const waveformCache = new Map<string, number[]>();

function silentWaveform(): number[] {
  return new Array(WAVEFORM_BAR_COUNT).fill(0) as number[];
}

function processAudioBuffer(audioBuffer: AudioBuffer): number[] {
  const rawData = audioBuffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(rawData.length / WAVEFORM_BAR_COUNT));
  const bars: number[] = [];

  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    let sum = 0;
    for (let j = 0; j < blockSize; j++) {
      sum += Math.abs(rawData[i * blockSize + j] ?? 0);
    }

    bars.push(Math.min(100, Math.pow((sum / blockSize) * 5, 0.5) * 100));
  }

  return bars;
}

export function useAudioWaveform(audioUrl: string | null): number[] {
  const [waveform, setWaveform] = useState<number[]>(() =>
    audioUrl ? (waveformCache.get(audioUrl) ?? silentWaveform()) : silentWaveform(),
  );

  useEffect(() => {
    if (!audioUrl) {
      setWaveform(silentWaveform());
      return;
    }

    const cached = waveformCache.get(audioUrl);
    if (cached) {
      setWaveform(cached);
      return;
    }

    let cancelled = false;
    const audioContext = createAudioContext();

    fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => audioContext.decodeAudioData(buffer))
      .then((audioBuffer) => {
        if (cancelled) {
          return;
        }
        const bars = processAudioBuffer(audioBuffer);
        waveformCache.set(audioUrl, bars);
        setWaveform(bars);
      })
      .catch((error: unknown) => {
        console.error('Erro ao carregar waveform:', error);
        if (!cancelled) {
          setWaveform(silentWaveform());
        }
      })
      .finally(() => {
        void audioContext.close();
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  return waveform;
}
