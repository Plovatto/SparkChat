import { useCallback, useEffect, useRef, useState } from 'react';

const WAVEFORM_BAR_COUNT = 60;
const NOISE_GATE_THRESHOLD = 15;

export interface AudioRecordingResult {
  blob: Blob;
  mimeType: string;
}

export interface AudioRecorderControls {
  isRecording: boolean;
  recordingTime: number;
  audioLevels: number[];
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<AudioRecordingResult | null>;
  cancelRecording: () => void;
}

function silentLevels(): number[] {
  return new Array(WAVEFORM_BAR_COUNT).fill(0) as number[];
}

export function useAudioRecorder(): AudioRecorderControls {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(silentLevels());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopVisualizer = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, []);

  const stopMediaTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopTimer();
      stopVisualizer();
      stopMediaTracks();
    };
  }, [stopTimer, stopVisualizer, stopMediaTracks]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];
      setRecordingTime(0);

      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.2;
      audioContext.createMediaStreamSource(stream).connect(analyser);

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      const binSize = Math.max(1, Math.floor(frequencyData.length / WAVEFORM_BAR_COUNT));

      const updateLevels = () => {
        analyser.getByteFrequencyData(frequencyData);
        const newLevels = silentLevels();

        for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
          let sum = 0;
          for (let j = 0; j < binSize; j++) {
            sum += frequencyData[i * binSize + j] ?? 0;
          }

          const average = sum / binSize;
          if (average >= NOISE_GATE_THRESHOLD) {
            const normalized = Math.min(100, ((average - NOISE_GATE_THRESHOLD) / (255 - NOISE_GATE_THRESHOLD)) * 800);
            newLevels[i] = Math.pow(normalized / 100, 0.2) * 100;
          }
        }

        setAudioLevels(newLevels);
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordingTime((previous) => previous + 1);
      }, 1000);

      return true;
    } catch (error) {
      console.error('Erro ao acessar microfone:', error);
      window.alert('Não foi possível acessar o microfone. Verifique as permissões.');
      return false;
    }
  }, []);

  const stopRecording = useCallback((): Promise<AudioRecordingResult | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || !isRecording) {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        resolve({ blob: new Blob(audioChunksRef.current, { type: mimeType }), mimeType });
      };

      mediaRecorder.stop();
      setIsRecording(false);
      setAudioLevels(silentLevels());
      stopTimer();
      stopVisualizer();
      stopMediaTracks();
    });
  }, [isRecording, stopTimer, stopVisualizer, stopMediaTracks]);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || !isRecording) {
      return;
    }

    mediaRecorder.stop();
    setIsRecording(false);
    setRecordingTime(0);
    setAudioLevels(silentLevels());
    stopTimer();
    stopVisualizer();
    stopMediaTracks();
    audioChunksRef.current = [];
  }, [isRecording, stopTimer, stopVisualizer, stopMediaTracks]);

  return { isRecording, recordingTime, audioLevels, startRecording, stopRecording, cancelRecording };
}
