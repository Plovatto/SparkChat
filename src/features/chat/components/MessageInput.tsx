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
import { FaMicrophone, FaPaperclip, FaPaperPlane, FaTimes } from 'react-icons/fa';
import type { SessionAuth } from '@lib/api/session-auth';
import type { MessageLinkPreview } from '@lib/socket';
import { useTheme } from '@features/theme';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';
import { useLinkPreview } from '../hooks/useLinkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PendingAttachmentTile } from './PendingAttachmentTile';

export interface MessageInputHandle {
  focus: () => void;
  addFiles: (files: File[]) => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFiles: File[];
  documentFiles: File[];
  linkPreview?: MessageLinkPreview;
}

export interface AudioSendPayload {
  blob: Blob;
  mimeType: string;
  duration: number;
}

interface MentionCandidate {
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
  maxLength?: number;
  auth: SessionAuth;
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
  onRemove?: (index: number) => void;
}

function PendingAttachmentsPreview({ files, onRemove }: PendingAttachmentsPreviewProps) {
  const { theme } = useTheme();

  return (
    <div
      className="chat-preview-bar"
      style={{
        background: theme.surfaceSelected,
        borderLeft: `4px solid ${theme.accent}`,
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
            onRemove={onRemove ? () => onRemove(index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

interface RecordingBarProps {
  recordingTime: number;
  audioLevels: number[];
  onCancel: () => void;
  onSend: () => void;
}

function RecordingBar({ recordingTime, audioLevels, onCancel, onSend }: RecordingBarProps) {
  const { theme } = useTheme();
  const bars = interpolateLevels(audioLevels);

  return (
    <div
      className="chat-input-bar"
      style={{
        background: theme.surface,
        boxShadow: theme.shadowSm,
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <button type="button" onClick={onCancel} title="Descartar" className="sc-icon-btn sc-icon-btn--danger-soft" style={{ width: '38px', height: '38px' }}>
        <FaTimes size={15} />
      </button>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flex: 1,
          minWidth: 0,
          background: theme.surfaceSunken,
          border: `1px solid ${theme.borderSubtle}`,
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
            background: theme.danger,
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
                background: theme.accent,
                borderRadius: '3px',
                transition: 'height 0.08s ease-out',
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.textPrimary, minWidth: '38px', textAlign: 'right', flexShrink: 0 }}>
          {formatRecordingTime(recordingTime)}
        </div>
      </div>

      {recordingTime >= 1 && (
        <button type="button" onClick={onSend} title="Enviar" className="sc-icon-btn sc-icon-btn--primary" style={{ width: '38px', height: '38px', fontSize: '0.9rem' }}>
          <FaPaperPlane />
        </button>
      )}
    </div>
  );
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { onSend, onSendAudio, onTyping, onRecordingStart, onRecordingStop, isBlockedBy, userBlocked, mentionCandidates, maxLength, auth },
  ref,
) {
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const linkPreview = useLinkPreview(message, auth);
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
      linkPreview: linkPreview.preview ?? undefined,
    });
    setMessage('');
    setMentionQuery(null);
    setPendingAttachments([]);
    linkPreview.reset();
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
        {pendingAttachments.length > 0 && <PendingAttachmentsPreview files={pendingAttachments} />}
        <RecordingBar
          recordingTime={recordingTime}
          audioLevels={audioLevels}
          onCancel={handleCancelRecordingClick}
          onSend={() => void handleMicClick()}
        />
      </>
    );
  }

  const blockedTitle = isBlockedBy ? 'Você foi bloqueado' : userBlocked ? 'Você bloqueou este usuário' : null;

  return (
    <>
      {pendingAttachments.length > 0 && <PendingAttachmentsPreview files={pendingAttachments} onRemove={removePendingAttachment} />}
      {pendingAttachments.length === 0 && linkPreview.preview && (
        <div style={{ padding: '10px 14px 0', background: theme.surface }}>
          <LinkPreviewCard preview={linkPreview.preview} auth={auth} variant="composer" onDismiss={linkPreview.dismiss} />
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="chat-input-bar"
        style={{
          background: theme.surface,
          boxShadow: theme.shadowSm,
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
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={isBlocked}
              title={blockedTitle ?? 'Enviar anexo'}
              className="sc-icon-btn sc-icon-btn--muted"
              style={{ width: '44px', height: '44px' }}
            >
              <FaPaperclip size={18} />
            </button>
            <button
              type="button"
              onClick={() => void handleMicClick()}
              disabled={isBlocked}
              title={blockedTitle ?? 'Gravar áudio'}
              className="sc-icon-btn sc-icon-btn--muted"
              style={{ width: '44px', height: '44px' }}
            >
              <FaMicrophone size={18} />
            </button>
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
                background: theme.surfaceElevated,
                border: `1px solid ${theme.border}`,
                borderRadius: '12px',
                boxShadow: theme.shadowMd,
                overflow: 'hidden',
                zIndex: 20,
                padding: '4px',
              }}
            >
              {filteredMentionCandidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  role="option"
                  aria-selected={index === mentionActiveIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMentionCandidate(candidate.nickname);
                  }}
                  onMouseEnter={() => setMentionActiveIndex(index)}
                  data-active={index === mentionActiveIndex}
                  className="sc-menu-item"
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  @{candidate.nickname}
                </div>
              ))}
            </div>
          )}
          <input
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
            maxLength={maxLength}
            disabled={isBlocked}
            placeholder={
              isBlockedBy ? 'Você foi bloqueado...' : userBlocked ? 'Você bloqueou este usuário...' : 'Digite sua mensagem...'
            }
            autoFocus={shouldAutoFocus}
            className="sc-input sc-input--composer"
          />
        </div>
        {(message.trim() || pendingAttachments.length > 0) && (
          <button
            type="submit"
            title="Enviar"
            className="sc-icon-btn sc-icon-btn--gradient send-button-appear"
            style={{ width: '44px', height: '44px', fontSize: '1rem' }}
          >
            <FaPaperPlane />
          </button>
        )}
      </form>
    </>
  );
});
