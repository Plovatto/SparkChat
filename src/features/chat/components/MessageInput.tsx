import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button, Form } from 'react-bootstrap';
import { FaMicrophone, FaPaperclip, FaPaperPlane, FaTimes } from 'react-icons/fa';
import { useTheme } from '@features/theme';
import type { ThemePalette } from '@features/theme';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';
import { PendingAttachmentTile } from './PendingAttachmentTile';

export interface MessageInputHandle {
  focus: () => void;
  addFiles: (files: File[]) => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFiles: File[];
  documentFiles: File[];
}

export interface AudioSendPayload {
  blob: Blob;
  mimeType: string;
  duration: number;
}

export interface MentionCandidate {
  id: string;
  nickname: string;
}

interface MessageInputProps {
  onSend: (payload: MessageInputSubmitPayload) => void;
  onSendAudio: (payload: AudioSendPayload) => void;
  onTyping: () => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
  isBlockedBy: boolean;
  userBlocked: boolean;
  mentionCandidates?: MentionCandidate[];
}

const MENTION_QUERY_PATTERN = /(?:^|\s)@(\w*)$/;
const MENTION_SUGGESTION_LIMIT = 5;
const DOCUMENT_ACCEPT = '.pdf,.mp4,.webm,.mov,.avi,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv';
const ATTACHMENT_ACCEPT = `image/*,${DOCUMENT_ACCEPT}`;

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

interface PendingAttachmentsPreviewProps {
  files: File[];
  theme: ThemePalette;
  onRemove?: (index: number) => void;
}

function PendingAttachmentsPreview({ files, theme, onRemove }: PendingAttachmentsPreviewProps) {
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
        {files.length > 1 ? `${files.length} anexos selecionados` : 'Anexo pendente'}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          maxHeight: '190px',
          overflowY: 'auto',
          padding: '10px 10px 4px 4px',
        }}
      >
        {files.map((file, index) => (
          <PendingAttachmentTile
            key={`${file.name}-${file.lastModified}-${index}`}
            file={file}
            theme={theme}
            onRemove={onRemove ? () => onRemove(index) : undefined}
          />
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
  { onSend, onSendAudio, onTyping, onRecordingStart, onRecordingStop, isBlockedBy, userBlocked, mentionCandidates },
  ref,
) {
  const { theme, baseTheme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [shouldAutoFocus] = useState(
    () => typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(pointer: coarse)').matches,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const { isRecording, recordingTime, audioLevels, startRecording, stopRecording, cancelRecording } =
    useAudioRecorder();
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);

  const filteredMentionCandidates = useMemo(() => {
    if (mentionQuery === null || !mentionCandidates || mentionCandidates.length === 0) {
      return [];
    }
    const query = mentionQuery.toLowerCase();
    return mentionCandidates
      .filter((candidate) => candidate.nickname.toLowerCase().startsWith(query))
      .slice(0, MENTION_SUGGESTION_LIMIT);
  }, [mentionQuery, mentionCandidates]);

  const updateMentionQuery = (value: string, cursorPosition: number) => {
    if (!mentionCandidates || mentionCandidates.length === 0) {
      setMentionQuery(null);
      return;
    }

    const match = value.slice(0, cursorPosition).match(MENTION_QUERY_PATTERN);
    setMentionQuery(match ? (match[1] ?? '') : null);
    setMentionActiveIndex(0);
  };

  const selectMentionCandidate = (nickname: string) => {
    const input = inputRef.current;
    const cursorPosition = input?.selectionStart ?? message.length;
    const beforeCursor = message.slice(0, cursorPosition);
    const afterCursor = message.slice(cursorPosition);
    const replacedBeforeCursor = beforeCursor.replace(MENTION_QUERY_PATTERN, (matched) =>
      matched.startsWith(' ') ? ` @${nickname} ` : `@${nickname} `,
    );

    setMessage(replacedBeforeCursor + afterCursor);
    setMentionQuery(null);

    setTimeout(() => {
      input?.focus();
      input?.setSelectionRange(replacedBeforeCursor.length, replacedBeforeCursor.length);
    }, 0);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery === null || filteredMentionCandidates.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMentionActiveIndex((previous) => (previous + 1) % filteredMentionCandidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMentionActiveIndex((previous) => (previous - 1 + filteredMentionCandidates.length) % filteredMentionCandidates.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const candidate = filteredMentionCandidates[mentionActiveIndex];
      if (candidate) {
        selectMentionCandidate(candidate.nickname);
      }
    } else if (event.key === 'Escape') {
      setMentionQuery(null);
    }
  };

  const addPendingAttachments = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setPendingAttachments((previous) => [...previous, ...files]);
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    addFiles: addPendingAttachments,
  }));

  const removePendingAttachment = (index: number) => {
    setPendingAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAttachmentPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    addPendingAttachments(files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    addPendingAttachments(files);
  };

  const isBlocked = isBlockedBy || userBlocked;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if ((!trimmed && pendingAttachments.length === 0) || isBlocked) {
      return;
    }

    onSend({
      text: trimmed,
      imageFiles: pendingAttachments.filter((file) => file.type.startsWith('image/')),
      documentFiles: pendingAttachments.filter((file) => !file.type.startsWith('image/')),
    });
    setMessage('');
    setMentionQuery(null);
    setPendingAttachments([]);
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
        {pendingAttachments.length > 0 && <PendingAttachmentsPreview files={pendingAttachments} theme={theme} />}
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
      {pendingAttachments.length > 0 && (
        <PendingAttachmentsPreview files={pendingAttachments} theme={theme} onRemove={removePendingAttachment} />
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
          ref={attachmentInputRef}
          onChange={handleAttachmentPick}
          accept={ATTACHMENT_ACCEPT}
          multiple
          style={{ display: 'none' }}
        />
        {!message.trim() && (
          <>
            <Button
              variant="link"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={isBlocked}
              title={isBlockedBy ? 'Você foi bloqueado' : userBlocked ? 'Você bloqueou este usuário' : 'Enviar anexo'}
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
              <FaPaperclip size={18} />
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
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {mentionQuery !== null && filteredMentionCandidates.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                overflow: 'hidden',
                zIndex: 20,
              }}
            >
              {filteredMentionCandidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMentionCandidate(candidate.nickname);
                  }}
                  onMouseEnter={() => setMentionActiveIndex(index)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: theme.text,
                    background: index === mentionActiveIndex ? `${theme.primary}18` : 'transparent',
                  }}
                >
                  @{candidate.nickname}
                </div>
              ))}
            </div>
          )}
          <Form.Control
            ref={inputRef}
            type="text"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              onTyping();
              updateMentionQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
            }}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            disabled={isBlocked}
            placeholder={
              isBlockedBy ? 'Você foi bloqueado...' : userBlocked ? 'Você bloqueou este usuário...' : 'Digite sua mensagem...'
            }
            autoFocus={shouldAutoFocus}
            style={{
              borderRadius: '22px',
              padding: '12px 18px',
              border: '2px solid transparent',
              fontSize: '0.95rem',
              background: isBlocked ? '#f5f5f5' : theme.inputBg,
              color: theme.text,
              boxShadow: 'none',
              width: '100%',
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
        </div>
        {(message.trim() || pendingAttachments.length > 0) && (
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
