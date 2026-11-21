import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { FaLink, FaPaperPlane, FaTimes } from 'react-icons/fa';
import { LuMic, LuPaperclip } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import type { SessionAuth } from '@lib/api/session-auth';
import { GifButton, GifPanel, gifLocaleFor, keepGifPanelOpen, useGifStatus } from '@features/gifs';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { useTheme } from '@features/theme';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';
import { useLinkPreview, type LinkPreviewStatus } from '../hooks/useLinkPreview';
import type { ComposerLinkPreview } from '../utils/composer-link-preview';
import { LinkPreviewCard } from './LinkPreviewCard';
import { PendingAttachmentTile } from './PendingAttachmentTile';
import '../styles/composer.css';

export interface MessageInputHandle {
  focus: () => void;
  addFiles: (files: File[]) => void;
}

export interface MessageInputSubmitPayload {
  text: string;
  imageFiles: File[];
  documentFiles: File[];
  linkPreview?: ComposerLinkPreview;
}

const TEXT_MAX_LENGTH = 20000;
const CAPTION_MAX_LENGTH = 2000;
const TEXT_MAX_BYTES = 22000;
const CAPTION_MAX_BYTES = 2150;

function exceedsEncryptedLimit(text: string, isCaption: boolean): boolean {
  return new TextEncoder().encode(text).length > (isCaption ? CAPTION_MAX_BYTES : TEXT_MAX_BYTES);
}

export interface AudioSendPayload {
  blob: Blob;
  mimeType: string;
  duration: number;
  pending?: MessageInputSubmitPayload;
}

interface MentionCandidate {
  id: string;
  nickname: string;
}

interface MessageInputProps {
  onSend: (payload: MessageInputSubmitPayload) => void;
  onSendAudio: (payload: AudioSendPayload) => void;
  onSendGif?: (blob: Blob) => void;
  onTyping: () => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
  isBlockedBy: boolean;
  userBlocked: boolean;
  mentionCandidates?: MentionCandidate[];
  maxLength?: number;
  auth: SessionAuth;
}

const MENTION_QUERY_PATTERN = /(?:^|\s)@([\p{L}\p{N}_]*)$/u;
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
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <div
      className="chat-preview-bar sc-anim-rise-in"
      style={{
        background: theme.surfaceSelected,
        borderLeft: `4px solid ${theme.accent}`,
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '8px' }}>
        {t('chat.input.attachments', { count: files.length })}
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
          <div key={`${file.name}-${file.lastModified}-${index}`} className="sc-anim-pop-in" style={{ display: 'flex', flexShrink: 0 }}>
            <PendingAttachmentTile file={file} onRemove={onRemove ? () => onRemove(index) : undefined} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface LinkPreviewOfferProps {
  status: LinkPreviewStatus;
  onGenerate: () => void;
  onDismiss: () => void;
}

function LinkPreviewOffer({ status, onGenerate, onDismiss }: LinkPreviewOfferProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const isLoading = status === 'loading';
  const noteId = 'link-preview-disclosure';

  return (
    <div
      className="sc-anim-rise-in"
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px 0', background: theme.surface }}
    >
      <button
        type="button"
        onClick={onGenerate}
        disabled={isLoading}
        aria-describedby={noteId}
        className="sc-btn sc-btn--soft"
        style={{ padding: '6px 12px', fontSize: '0.8rem', flexShrink: 0 }}
      >
        <FaLink size={12} />
        {isLoading ? t('chat.input.linkPreview.generating') : t('chat.input.linkPreview.generate')}
      </button>
      <span
        id={noteId}
        role={status === 'failed' ? 'status' : undefined}
        style={{ flex: 1, minWidth: 0, fontSize: '0.72rem', lineHeight: 1.4, color: theme.textSecondary }}
      >
        {status === 'failed' ? t('chat.input.linkPreview.failed') : t('chat.input.linkPreview.disclosure')}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        title={t('chat.input.linkPreview.dismiss')}
        aria-label={t('chat.input.linkPreview.dismiss')}
        className="sc-icon-btn sc-icon-btn--ghost"
        style={{ width: '28px', height: '28px', flexShrink: 0 }}
      >
        <FaTimes size={12} />
      </button>
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
  const { t } = useTranslation();
  const { theme } = useTheme();
  const bars = interpolateLevels(audioLevels);

  return (
    <div
      className="chat-input-bar sc-anim-fade-in"
      style={{
        background: theme.surface,
        boxShadow: theme.shadowSm,
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <button type="button" onClick={onCancel} title={t('chat.input.discard')} className="sc-icon-btn sc-icon-btn--danger-soft" style={{ width: '38px', height: '38px' }}>
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
          className="sc-anim-blink"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: theme.danger,
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
                transition: 'height 0.08s var(--sc-ease-standard)',
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: theme.textPrimary, minWidth: '38px', textAlign: 'right', flexShrink: 0 }}>
          {formatRecordingTime(recordingTime)}
        </div>
      </div>

      {recordingTime >= 1 && (
        <button type="button" onClick={onSend} title={t('chat.input.send')} className="sc-icon-btn sc-icon-btn--primary sc-anim-pop-in" style={{ width: '38px', height: '38px', fontSize: '0.9rem' }}>
          <FaPaperPlane />
        </button>
      )}
    </div>
  );
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { onSend, onSendAudio, onSendGif, onTyping, onRecordingStart, onRecordingStop, isBlockedBy, userBlocked, mentionCandidates, maxLength, auth },
  ref,
) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  pendingAttachmentsRef.current = pendingAttachments;
  const messageRef = useRef(message);
  messageRef.current = message;
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
  const isGifStatusEnabled = useGifStatus(auth);
  const isGifEnabled = isGifStatusEnabled && Boolean(onSendGif);
  const [isGifPanelOpen, setIsGifPanelOpen] = useState(false);
  const gifButtonRef = useRef<HTMLButtonElement>(null);
  const gifPanelPresence = usePresence(isGifEnabled && isGifPanelOpen && !isBlockedBy && !userBlocked, MOTION_DURATION_MS.fast);
  const { language } = useAppLanguage();

  const closeGifPanel = useCallback(() => {
    setIsGifPanelOpen(false);
  }, []);

  const dismissGifPanel = useCallback(() => {
    setIsGifPanelOpen(false);
    gifButtonRef.current?.focus();
  }, []);

  const handleGifPick = useCallback(
    (blob: Blob) => {
      onSendGif?.(blob);
      setTimeout(() => inputRef.current?.focus(), 10);
    },
    [onSendGif],
  );

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

    if (files.length > 0) {
      event.preventDefault();
      addPendingAttachments(files);
    }
  };

  const isBlocked = isBlockedBy || userBlocked;

  const characterLimit = (isCaption: boolean): number =>
    isCaption ? Math.min(CAPTION_MAX_LENGTH, maxLength ?? CAPTION_MAX_LENGTH) : (maxLength ?? TEXT_MAX_LENGTH);

  const exceedsLimits = (text: string, isCaption: boolean): boolean =>
    text.length > characterLimit(isCaption) || exceedsEncryptedLimit(text, isCaption);

  const buildSubmitPayload = (text: string): MessageInputSubmitPayload => ({
    text,
    imageFiles: pendingAttachments.filter((file) => file.type.startsWith('image/')),
    documentFiles: pendingAttachments.filter((file) => !file.type.startsWith('image/')),
    linkPreview: linkPreview.preview ?? undefined,
  });

  const clearComposer = () => {
    setMessage('');
    setMentionQuery(null);
    setPendingAttachments([]);
    linkPreview.reset();
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = message.trim();
    if ((!text && pendingAttachments.length === 0) || isBlocked) {
      return;
    }
    if (exceedsLimits(text, pendingAttachments.length > 0)) {
      window.alert(t('chat.input.tooLong'));
      return;
    }

    onSend(buildSubmitPayload(text));
    clearComposer();
  };

  const finishRecording = (result: AudioRecordingResult) => {
    const attachments = pendingAttachmentsRef.current;
    const caption = messageRef.current.trim();
    const canSendPending = attachments.length > 0 && !exceedsLimits(caption, true);
    const pending = canSendPending
      ? {
          text: caption,
          imageFiles: attachments.filter((file) => file.type.startsWith('image/')),
          documentFiles: attachments.filter((file) => !file.type.startsWith('image/')),
        }
      : undefined;
    if (attachments.length > 0 && !canSendPending) {
      window.alert(t('chat.input.tooLong'));
    }
    onSendAudio({ blob: result.blob, mimeType: result.mimeType, duration: recordingTime, pending });
    if (pending) {
      clearComposer();
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      if (recordingTime < 1) {
        cancelRecording();
        window.alert(t('chat.input.audioTooShort'));
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

  const blockedTitle = isBlockedBy ? t('chat.input.blockedBy') : userBlocked ? t('chat.input.youBlocked') : null;
  const isMentionListOpen = mentionQuery !== null && filteredMentionCandidates.length > 0;

  return (
    <>
      {gifPanelPresence.isPresent && (
        <GifPanel
          auth={auth}
          locale={gifLocaleFor(language)}
          onPick={handleGifPick}
          onClose={closeGifPanel}
          onDismiss={dismissGifPanel}
          ignoreOutsideRef={gifButtonRef}
          autoFocusSearch={shouldAutoFocus}
          isExiting={gifPanelPresence.isExiting}
        />
      )}
      {pendingAttachments.length > 0 && <PendingAttachmentsPreview files={pendingAttachments} onRemove={removePendingAttachment} />}
      {pendingAttachments.length === 0 && linkPreview.preview && (
        <div className="sc-anim-rise-in" style={{ padding: '10px 14px 0', background: theme.surface }}>
          <LinkPreviewCard
            preview={linkPreview.preview.preview}
            imageBlob={linkPreview.preview.image}
            variant="composer"
            onDismiss={linkPreview.dismiss}
          />
        </div>
      )}
      {pendingAttachments.length === 0 && linkPreview.url && !linkPreview.preview && (
        <LinkPreviewOffer status={linkPreview.status} onGenerate={linkPreview.generate} onDismiss={linkPreview.dismiss} />
      )}
      <form onSubmit={handleSubmit} className="chat-input-bar sc-composer">
        <input
          type="file"
          ref={attachmentInputRef}
          onChange={handleAttachmentPick}
          accept={ATTACHMENT_ACCEPT}
          multiple
          style={{ display: 'none' }}
        />
        <div className="sc-composer-pill" data-disabled={isBlocked || undefined}>
          {isMentionListOpen && (
            <div
              className="sc-anim-rise-in"
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
                transformOrigin: 'bottom center',
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
                  className="sc-menu-item sc-anim-rise-in sc-stagger"
                  style={
                    {
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      '--sc-stagger-index': index,
                      '--sc-stagger-step': '30ms',
                    } as CSSProperties
                  }
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
              const composerText = event.target.value;
              setMessage(composerText);
              setIsGifPanelOpen((open) => keepGifPanelOpen(open, composerText));
              onTyping();
              updateMentionQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
            }}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            maxLength={characterLimit(pendingAttachments.length > 0)}
            disabled={isBlocked}
            placeholder={
              isBlockedBy ? t('chat.input.placeholderBlockedBy') : userBlocked ? t('chat.input.placeholderYouBlocked') : t('chat.input.placeholder')
            }
            autoFocus={shouldAutoFocus}
            className="sc-composer-input"
          />
          {!message.trim() && (
            <GifButton
              ref={gifButtonRef}
              enabled={isGifEnabled}
              isOpen={isGifPanelOpen}
              disabled={isBlocked}
              onToggle={() => setIsGifPanelOpen((open) => !open)}
            />
          )}
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isBlocked}
            title={blockedTitle ?? t('chat.input.attach')}
            aria-label={t('chat.input.attach')}
            className="sc-composer-icon"
          >
            <LuPaperclip size={19} />
          </button>
        </div>
        {message.trim() || pendingAttachments.length > 0 ? (
          <button key="send" type="submit" title={t('chat.input.send')} aria-label={t('chat.input.send')} className="sc-composer-action sc-anim-send-in">
            <FaPaperPlane size={16} />
          </button>
        ) : (
          <button
            key="mic"
            type="button"
            onClick={() => void handleMicClick()}
            disabled={isBlocked}
            title={blockedTitle ?? t('chat.input.record')}
            aria-label={t('chat.input.record')}
            className="sc-composer-action sc-anim-pop-in"
          >
            <LuMic size={20} />
          </button>
        )}
      </form>
    </>
  );
});
