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
import { FaImage, FaMicrophone, FaPaperPlane, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';

export interface MessageInputHandle {
  focus: () => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFiles: File[];
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
  isBlockedBy: boolean;
  userBlocked: boolean;
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

interface PendingImagesPreviewProps {
  images: PendingImage[];
  theme: ThemePalette;
  onRemove?: (index: number) => void;
}

function PendingImagesPreview({ images, theme, onRemove }: PendingImagesPreviewProps) {
  return (
    <div
      className="chat-preview-bar"
      style={{
        background: theme.surfaceLight,
        borderLeft: `4px solid ${theme.primary}`,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '8px' }}>
        {images.length > 1 ? `${images.length} imagens selecionadas` : 'Anexo pendente'}
      </div>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 4px 4px 0' }}>
        {images.map((image, index) => (
          <div key={image.previewUrl} style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={image.previewUrl}
              alt="anexo"
              style={{ width: 58, height: 58, objectFit: 'cover', borderRadius: 10, display: 'block' }}
            />
            {onRemove && (
              <button
                onClick={() => onRemove(index)}
                title="Remover"
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#ef4444',
                  color: 'white',
                  border: `2px solid ${theme.surfaceLight}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <FaTimes size={9} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
      className="chat-input-bar"
      style={{
        background: theme.surface,
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
          border: 'none',
          borderRadius: '50%',
          width: '38px',
          height: '38px',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.2s',
          color: '#ff6b6b',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.background = 'rgba(255, 107, 107, 0.25)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.background = 'rgba(255, 107, 107, 0.15)';
        }}
      >
        <FaTimes size={15} />
      </Button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flex: 1,
          minWidth: 0,
          background: theme.surfaceLight,
          borderRadius: '999px',
          padding: '8px 16px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
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
            gap: '3px',
            flex: 1,
            height: '28px',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {bars.map((level, index) => (
            <div
              key={index}
              style={{
                flex: '0 0 3px',
                height: `${Math.max(15, Math.min(100, level))}%`,
                background: theme.primary,
                borderRadius: '3px',
                transition: 'height 0.08s ease-out',
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.text, minWidth: '38px', textAlign: 'right', flexShrink: 0 }}>
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
            width: '38px',
            height: '38px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.9rem',
            color: 'white',
            flexShrink: 0,
            transition: 'transform 0.2s',
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
  { onSend, onSendAudio, onTyping, onRecordingStart, onRecordingStop, isBlockedBy, userBlocked },
  ref,
) {
  const { theme, baseTheme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const pendingImagesRef = useRef<PendingImage[]>(pendingImages);
  pendingImagesRef.current = pendingImages;
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isRecording, recordingTime, audioLevels, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    return () => {
      pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  const clearAllPendingImages = () => {
    setPendingImages((previous) => {
      previous.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      return [];
    });
  };

  const removePendingImage = (index: number) => {
    setPendingImages((previous) => {
      const target = previous[index];
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return previous.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleImagePick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    setPendingImages((previous) => [
      ...previous,
      ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
  };

  const isBlocked = isBlockedBy || userBlocked;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if ((!trimmed && pendingImages.length === 0) || isBlocked) {
      return;
    }

    onSend({ text: trimmed, imageFiles: pendingImages.map((image) => image.file) });
    setMessage('');
    clearAllPendingImages();
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
        {pendingImages.length > 0 && <PendingImagesPreview images={pendingImages} theme={theme} />}
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
      {pendingImages.length > 0 && (
        <PendingImagesPreview images={pendingImages} theme={theme} onRemove={removePendingImage} />
      )}
      <Form
        onSubmit={handleSubmit}
        className="chat-input-bar"
        style={{
          background: theme.surface,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.05)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImagePick}
          accept="image/*"
          multiple
          style={{ display: 'none' }}
        />
        {!message.trim() && (
          <>
            <Button
              variant="link"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBlocked}
              title={isBlockedBy ? 'Você foi bloqueado' : userBlocked ? 'Você bloqueou este usuário' : 'Enviar imagens'}
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
                opacity: isBlocked ? 0.5 : 1,
                cursor: isBlocked ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!isBlocked) {
                  event.currentTarget.style.opacity = '0.8';
                }
              }}
              onMouseLeave={(event) => {
                if (!isBlocked) {
                  event.currentTarget.style.opacity = '1';
                }
              }}
            >
              <FaImage size={18} />
            </Button>
            <Button
              variant="link"
              onClick={() => void handleMicClick()}
              disabled={isBlocked}
              title={isBlockedBy ? 'Você foi bloqueado' : userBlocked ? 'Você bloqueou este usuário' : 'Gravar áudio'}
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
                opacity: isBlocked ? 0.5 : 1,
                cursor: isBlocked ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(event) => {
                if (!isBlocked) {
                  event.currentTarget.style.opacity = '0.8';
                }
              }}
              onMouseLeave={(event) => {
                if (!isBlocked) {
                  event.currentTarget.style.opacity = '1';
                }
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
          disabled={isBlocked}
          placeholder={
            isBlockedBy ? 'Você foi bloqueado...' : userBlocked ? 'Você bloqueou este usuário...' : 'Digite sua mensagem...'
          }
          autoFocus
          style={{
            borderRadius: '22px',
            padding: '12px 18px',
            border: '2px solid transparent',
            fontSize: '0.95rem',
            background: isBlocked ? '#f5f5f5' : theme.inputBg,
            color: theme.text,
            boxShadow: 'none',
          }}
          onFocus={(event) => {
            event.currentTarget.style.borderColor = theme.primary;
            event.currentTarget.style.boxShadow = `0 0 10px ${theme.primary}40`;
          }}
          onBlur={(event) => {
            event.currentTarget.style.borderColor = 'transparent';
            event.currentTarget.style.boxShadow = 'none';
          }}
        />
        {(message.trim() || pendingImages.length > 0) && (
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
