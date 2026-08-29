import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Button, Form } from 'react-bootstrap';
import { FaImage, FaMicrophone, FaPaperPlane } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';

export interface MessageInputHandle {
  focus: () => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFile: File | null;
}

export interface AudioSendPayload {
  blob: Blob;
  mimeType: string;
  duration: number;
}

interface MessageInputProps {
  onSend: (payload: MessageInputSubmitPayload) => void;
  onSendAudio: (payload: AudioSendPayload) => void;
  onTyping: () => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

function formatRecordingTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function interpolateLevels(levels: number[]): number[] {
  const interpolated: number[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const current = levels[i] ?? 0;
    const next = levels[i + 1] ?? 0;
    interpolated.push(current, (current + next) / 2);
  }
  const last = levels[levels.length - 1];
  if (last !== undefined) {
    interpolated.push(last);
  }
  return interpolated;
}

interface RecordingBarProps {
  theme: ThemePalette;
  recordingTime: number;
  audioLevels: number[];
  onCancel: () => void;
  onSend: () => void;
}

function RecordingBar({ theme, recordingTime, audioLevels, onCancel, onSend }: RecordingBarProps) {
  const bars = interpolateLevels(audioLevels);

  return (
    <div
      style={{
        background: theme.surface,
        padding: '14px 18px',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <Button
        onClick={onCancel}
        title="Descartar"
        style={{
          background: 'rgba(255, 107, 107, 0.15)',
          border: '1px solid rgba(255, 107, 107, 0.3)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          flexShrink: 0,
          transition: 'all 0.2s',
          color: '#ff6b6b',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(255, 107, 107, 0.25)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)';
        }}
      >
        ✕
      </Button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#ff6b6b',
            animation: 'blink 1s infinite',
            flexShrink: 0,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flex: 1,
            height: '50px',
            justifyContent: 'center',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {bars.map((level, index) => (
            <div
              key={index}
              style={{
                flex: '0 0 1.2px',
                height: `${Math.max(5, level * 8)}px`,
                background: theme.primary,
                borderRadius: '0.2px',
                transition: 'height 0.08s ease-out',
                minHeight: '2px',
                maxHeight: '30px',
                opacity: 0.95,
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ff6b6b', minWidth: '40px', textAlign: 'right' }}>
          {formatRecordingTime(recordingTime)}
        </div>
      </div>

      {recordingTime >= 1 && (
        <Button
          onClick={onSend}
          title="Enviar"
          style={{
            background: theme.primary,
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            color: 'white',
            flexShrink: 0,
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <FaPaperPlane />
        </Button>
      )}
    </div>
  );
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { onSend, onSendAudio, onTyping, onRecordingStart, onRecordingStop },
  ref,
) {
  const { theme, baseTheme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isRecording, recordingTime, audioLevels, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    return () => {
      if (pendingImage) {
        URL.revokeObjectURL(pendingImage.previewUrl);
      }
    };
  }, [pendingImage]);

  const clearPendingImage = () => {
    setPendingImage(null);
  };

  const handleImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && !pendingImage) {
      return;
    }

    onSend({ text: trimmed, imageFile: pendingImage?.file ?? null });
    setMessage('');
    clearPendingImage();
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const finishRecording = (result: AudioRecordingResult) => {
    onSendAudio({ blob: result.blob, mimeType: result.mimeType, duration: recordingTime });
  };

  const handleMicClick = async () => {
    if (isRecording) {
      if (recordingTime < 1) {
        cancelRecording();
        window.alert('O áudio deve ter no mínimo 1 segundo');
        onRecordingStop();
        return;
      }

      const result = await stopRecording();
      if (result) {
        finishRecording(result);
      }
      onRecordingStop();
      return;
    }

    const started = await startRecording();
    if (started) {
      onRecordingStart();
    }
  };

  const handleCancelRecordingClick = () => {
    cancelRecording();
    onRecordingStop();
  };

  if (isRecording) {
    return (
      <>
        {pendingImage && (
          <div
            style={{
              background: theme.surfaceLight,
              padding: '12px 18px',
              borderLeft: `4px solid ${theme.primary}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${theme.border}`,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
                Anexo pendente
              </div>
              <img
                src={pendingImage.previewUrl}
                alt="anexo"
                style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
              />
            </div>
          </div>
        )}
        <RecordingBar
          theme={theme}
          recordingTime={recordingTime}
          audioLevels={audioLevels}
          onCancel={handleCancelRecordingClick}
          onSend={() => void handleMicClick()}
        />
      </>
    );
  }

  return (
    <>
      {pendingImage && (
        <div
          style={{
            background: theme.surfaceLight,
            padding: '12px 18px',
            borderLeft: `4px solid ${theme.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '4px' }}>
              Anexo pendente
            </div>
            <div
              style={{
                fontSize: '0.9rem',
                color: theme.text,
                maxWidth: '300px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflow: 'hidden',
              }}
            >
              <img
                src={pendingImage.previewUrl}
                alt="anexo"
                style={{ width: 56, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
              />
            </div>
          </div>
          <Button
            variant="link"
            onClick={clearPendingImage}
            style={{ color: theme.textSecondary, padding: '4px 8px', minWidth: 'auto', textDecoration: 'none' }}
          >
            ✕
          </Button>
        </div>
      )}
      <Form
        onSubmit={handleSubmit}
        style={{
          background: theme.surface,
          padding: '14px 18px',
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <input type="file" ref={fileInputRef} onChange={handleImagePick} accept="image/*" style={{ display: 'none' }} />
        {!message.trim() && (
          <>
            <Button
              variant="link"
              onClick={() => fileInputRef.current?.click()}
              title="Enviar imagem"
              style={{
                color: theme.primary,
                padding: '10px',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: baseTheme === 'light' ? '#e1e1e1ff' : theme.surfaceLight,
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = '1';
              }}
            >
              <FaImage size={18} />
            </Button>
            <Button
              variant="link"
              onClick={() => void handleMicClick()}
              title="Gravar áudio"
              style={{
                color: theme.primary,
                padding: '10px',
                borderRadius: '50%',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: baseTheme === 'light' ? '#e1e1e1ff' : theme.surfaceLight,
                textDecoration: 'none',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.opacity = '0.8';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.opacity = '1';
              }}
            >
              <FaMicrophone size={18} />
            </Button>
          </>
        )}
        <Form.Control
          ref={inputRef}
          type="text"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            onTyping();
          }}
          placeholder="Digite sua mensagem..."
          autoFocus
          style={{
            borderRadius: '22px',
            padding: '12px 18px',
            border: `2px solid ${theme.border}`,
            fontSize: '0.95rem',
            background: theme.inputBg,
            color: theme.text,
          }}
          onFocus={(event) => {
            event.currentTarget.style.borderColor = theme.primary;
            event.currentTarget.style.boxShadow = `0 0 10px ${theme.primary}40`;
          }}
          onBlur={(event) => {
            event.currentTarget.style.borderColor = theme.border;
            event.currentTarget.style.boxShadow = 'none';
          }}
        />
        {(message.trim() || pendingImage) && (
          <Button
            type="submit"
            className="send-button-appear"
            style={{
              background: theme.headerGradient,
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              flexShrink: 0,
              boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.transform = 'scale(1.1) rotate(15deg)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.transform = 'scale(1) rotate(0deg)';
            }}
          >
            <FaPaperPlane />
          </Button>
        )}
      </Form>
    </>
  );
});
