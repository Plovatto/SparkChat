import {
  forwardRef,
  useCallback,
  useEffect,
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
import { LuMic, LuPaperclip, LuTrash2 } from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import type { SessionAuth } from '@lib/api/session-auth';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { EmojiButton, EmojiPickerPopover, insertAtCaret } from '@features/emoji';
import { GifButton, GifPanel, gifLocaleFor, keepGifPanelOpen, useGifStatus } from '@features/gifs';
import { MOTION_DURATION_MS, useLatchedPresence, usePrefersReducedMotion, usePresence } from '@features/motion';
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
const COMPACT_COMPOSER_QUERY = '(max-width: 420px)';
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

const pendingFileKeys = new WeakMap<File, number>();
let nextPendingFileKey = 0;

function pendingFileKey(file: File): number {
  let key = pendingFileKeys.get(file);
  if (key === undefined) {
    nextPendingFileKey += 1;
    key = nextPendingFileKey;
    pendingFileKeys.set(file, key);
  }
  return key;
}

interface PendingAttachmentsPreviewProps {
  files: File[];
  onRemove?: (file: File) => void;
}

function PendingAttachmentsPreview({ files, onRemove }: PendingAttachmentsPreviewProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [exitingFiles, setExitingFiles] = useState<ReadonlySet<File>>(() => new Set());
  const exitTimersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const timers = exitTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const removeWithExit = (file: File) => {
    if (!onRemove || exitingFiles.has(file)) {
      return;
    }
    if (prefersReducedMotion) {
      onRemove(file);
      return;
    }
    setExitingFiles((previous) => new Set(previous).add(file));
    const timer = window.setTimeout(() => {
      exitTimersRef.current.delete(timer);
      setExitingFiles((previous) => {
        const next = new Set(previous);
        next.delete(file);
        return next;
      });
      onRemove(file);
    }, MOTION_DURATION_MS.fast);
    exitTimersRef.current.add(timer);
  };

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
        {files.map((file) => (
          <div
            key={pendingFileKey(file)}
            className={exitingFiles.has(file) ? 'sc-anim-pop-out' : 'sc-anim-pop-in'}
            inert={exitingFiles.has(file)}
            style={{ display: 'flex', flexShrink: 0 }}
          >
            <PendingAttachmentTile file={file} onRemove={onRemove ? () => removeWithExit(file) : undefined} />
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
  const bars = interpolateLevels(audioLevels);
  const canSend = recordingTime >= 1;

  return (
    <div className="chat-input-bar sc-composer sc-recording" role="group" aria-label={t('chat.input.recordingLabel')}>
      <button type="button" onClick={onCancel} title={t('chat.input.discard')} aria-label={t('chat.input.discard')} className="sc-recording__discard">
        <LuTrash2 size={19} aria-hidden="true" />
      </button>

      <div className="sc-recording__pill">
        <span className="sc-recording__dot" aria-hidden="true" />
        <span className="sc-recording__time" aria-live="off">
          {formatRecordingTime(recordingTime)}
        </span>
        <div className="sc-recording__wave" aria-hidden="true">
          {bars.map((level, index) => {
            const quiet = level <= 15;
            return (
              <span
                key={index}
                className="sc-recording__bar"
                data-quiet={quiet || undefined}
                style={{ height: quiet ? undefined : `${Math.min(100, level)}%` }}
              />
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        title={t('chat.input.send')}
        aria-label={t('chat.input.send')}
        className="sc-composer-action sc-recording__send"
      >
        <FaPaperPlane size={16} aria-hidden="true" />
      </button>
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
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const composerRowRef = useRef<HTMLFormElement>(null);
  const isComposingRef = useRef(false);
  const [limitNotice, setLimitNotice] = useState(0);
  const [isPillShaking, setIsPillShaking] = useState(false);
  const isCompactComposer = useMediaQuery(COMPACT_COMPOSER_QUERY);

  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
  }, []);

  const toggleEmojiPicker = () => {
    setIsGifPanelOpen(false);
    setIsEmojiPickerOpen((open) => {
      if (!open && !shouldAutoFocus) {
        inputRef.current?.blur();
      }
      return !open;
    });
  };

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
  const isMentionListOpen = mentionQuery !== null && filteredMentionCandidates.length > 0;
  const mentionListPresence = useLatchedPresence(isMentionListOpen ? filteredMentionCandidates : null);
  const [hasRecorded, setHasRecorded] = useState(false);
  if (isRecording && !hasRecorded) {
    setHasRecorded(true);
  }

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
      event.preventDefault();
      setMentionQuery(null);
    }
  };

  const addPendingAttachments = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setPendingAttachments((previous) => [...previous, ...files.filter((file, index) => !previous.includes(file) && files.indexOf(file) === index)]);
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    addFiles: addPendingAttachments,
  }));

  const removePendingAttachment = (file: File) => {
    setPendingAttachments((previous) => previous.filter((item) => item !== file));
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

  const insertEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (isComposingRef.current) {
      return;
    }
    const insertion = insertAtCaret(
      messageRef.current,
      emoji,
      input?.selectionStart,
      input?.selectionEnd,
      characterLimit(pendingAttachmentsRef.current.length > 0),
    );
    if (!insertion) {
      setLimitNotice((count) => count + 1);
      setIsPillShaking(true);
      return;
    }
    messageRef.current = insertion.value;
    setMessage(insertion.value);
    setMentionQuery(null);
    onTyping();
    window.setTimeout(() => {
      if (!input) {
        return;
      }
      const active = document.activeElement;
      const focusInPicker = active instanceof Element && active.closest('.sc-emoji-surface') !== null;
      if (shouldAutoFocus && !focusInPicker) {
        input.focus();
      }
      input.setSelectionRange(insertion.caret, insertion.caret);
    }, 0);
  };

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
      setIsEmojiPickerOpen(false);
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
      <form
        ref={composerRowRef}
        onSubmit={handleSubmit}
        className={`chat-input-bar sc-composer${hasRecorded ? ' sc-anim-rise-in' : ''}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && !isRecording) {
            setHasRecorded(false);
          }
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
        <div
          className="sc-composer-pill"
          data-disabled={isBlocked || undefined}
          data-shake={isPillShaking || undefined}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) {
              setIsPillShaking(false);
            }
          }}
        >
          {mentionListPresence.value && (
            <div
              className={mentionListPresence.isExiting ? 'sc-anim-rise-out' : 'sc-anim-rise-in'}
              inert={mentionListPresence.isExiting}
              aria-hidden={mentionListPresence.isExiting || undefined}
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
              {mentionListPresence.value.map((candidate, index) => (
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
          <EmojiButton isOpen={isEmojiPickerOpen && !isBlocked} disabled={isBlocked} title={blockedTitle ?? undefined} onToggle={toggleEmojiPicker} />
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
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            maxLength={characterLimit(pendingAttachments.length > 0)}
            disabled={isBlocked}
            placeholder={
              isBlockedBy
                ? t('chat.input.placeholderBlockedBy')
                : userBlocked
                  ? t('chat.input.placeholderYouBlocked')
                  : isCompactComposer
                    ? t('chat.input.placeholderShort')
                    : t('chat.input.placeholder')
            }
            aria-label={isBlockedBy ? t('chat.input.placeholderBlockedBy') : userBlocked ? t('chat.input.placeholderYouBlocked') : t('chat.input.placeholder')}
            autoFocus={shouldAutoFocus}
            data-testid="message-input"
            className="sc-composer-input"
          />
          {!message.trim() && !(isCompactComposer && pendingAttachments.length > 0) && (
            <GifButton
              ref={gifButtonRef}
              enabled={isGifEnabled}
              isOpen={isGifPanelOpen}
              disabled={isBlocked}
              onToggle={() => {
                setIsEmojiPickerOpen(false);
                setIsGifPanelOpen((open) => !open);
              }}
            />
          )}
          <button
            type="button"
            onClick={() => attachmentInputRef.current?.click()}
            disabled={isBlocked}
            title={blockedTitle ?? t('chat.input.attach')}
            aria-label={t('chat.input.attach')}
            data-testid="attach-button"
            className="sc-composer-icon"
          >
            <LuPaperclip size={19} />
          </button>
        </div>
        {message.trim() || pendingAttachments.length > 0 ? (
          <button key="send" type="submit" title={t('chat.input.send')} aria-label={t('chat.input.send')} data-testid="send-button" className="sc-composer-action sc-anim-send-in">
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
            data-testid="record-button"
            className="sc-composer-action sc-anim-pop-in"
          >
            <LuMic size={20} />
          </button>
        )}
        {limitNotice > 0 && (
          <span key={limitNotice} role="status" className="sc-sr-only">
            {t('chat.input.tooLong')}
          </span>
        )}
      </form>
      <EmojiPickerPopover
        open={isEmojiPickerOpen && !isBlocked}
        anchorRef={composerRowRef}
        onSelect={insertEmoji}
        onClose={closeEmojiPicker}
      />
    </>
  );
});
