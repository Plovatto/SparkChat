import {
  forwardRef,
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
import { FaMicrophone, FaPaperclip, FaPaperPlane, FaTimes } from 'react-icons/fa';
import { MdTranslate } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import type { SessionAuth } from '@lib/api/session-auth';
import type { MessageLinkPreview } from '@lib/socket';
import { useTheme } from '@features/theme';
import { useAudioRecorder, type AudioRecordingResult } from '../hooks/useAudioRecorder';
import { useLinkPreview } from '../hooks/useLinkPreview';
import { describeOutgoingDraft } from '../hooks/outgoing-draft';
import { useOutgoingTranslation, type OutgoingTranslation } from '../hooks/useOutgoingTranslation';
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
  onTyping: () => void;
  onRecordingStart: () => void;
  onRecordingStop: () => void;
  isBlockedBy: boolean;
  userBlocked: boolean;
  mentionCandidates?: MentionCandidate[];
  maxLength?: number;
  auth: SessionAuth;
  roomId: string;
  userId: string;
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

interface OutgoingTranslationStripProps {
  outgoing: OutgoingTranslation;
  draft: string;
}

function OutgoingTranslationStrip({ outgoing, draft }: OutgoingTranslationStripProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const view = describeOutgoingDraft({ isRequested: outgoing.isRequested, isEnabled: outgoing.isEnabled, support: outgoing.support, state: outgoing.state, draft });
  if (!view) {
    return null;
  }

  return (
    <div
      translate="no"
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
        zIndex: 20,
        padding: '8px 14px',
        transformOrigin: 'bottom center',
        fontSize: '0.85rem',
        maxHeight: '140px',
        overflowY: 'auto',
      }}
    >
      {view.kind === 'preview' ? (
        <>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.textSecondary, marginBottom: '2px' }}>
            {t('chat.translation.outgoingPreview', { language: t(`chat.translation.languages.${outgoing.target}`) })}
          </div>
          <div style={{ color: theme.textPrimary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{view.text}</div>
        </>
      ) : (
        <div style={{ color: theme.textSecondary }}>
          {view.kind === 'translating' ? t('chat.translation.outgoingTranslating') : t('chat.translation.outgoingFailed')}
        </div>
      )}
    </div>
  );
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput(
  { onSend, onSendAudio, onTyping, onRecordingStart, onRecordingStop, isBlockedBy, userBlocked, mentionCandidates, maxLength, auth, roomId, userId },
  ref,
) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const outgoing = useOutgoingTranslation(roomId, userId, message);
  const [isResolvingSend, setIsResolvingSend] = useState(false);
  const isResolvingSendRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
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
    // Locked while a send awaits its translation, so what is sent is exactly what is shown.
    if (files.length === 0 || isResolvingSendRef.current) {
      return;
    }

    setPendingAttachments((previous) => [...previous, ...files]);
  };

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    addFiles: addPendingAttachments,
  }));

  const removePendingAttachment = (index: number) => {
    if (isResolvingSendRef.current) {
      return;
    }
    setPendingAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleAttachmentPick = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    addPendingAttachments(files);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (isResolvingSendRef.current) {
      event.preventDefault();
      return;
    }
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

  // The translation can be longer than the draft, so both limits are checked on the text that will be sent.
  const exceedsLimits = (text: string, isCaption: boolean): boolean =>
    text.length > characterLimit(isCaption) || exceedsEncryptedLimit(text, isCaption);

  const buildSubmitPayload = (text: string): MessageInputSubmitPayload => ({
    text,
    imageFiles: pendingAttachments.filter((file) => file.type.startsWith('image/')),
    documentFiles: pendingAttachments.filter((file) => !file.type.startsWith('image/')),
    linkPreview: linkPreview.preview ?? undefined,
  });

  /**
   * The text that actually goes out: the translation when "translate before sending" is on, otherwise the draft.
   * Only that one text reaches onSend (and so the encryption path); the original is not sent alongside it.
   * Resolves to null when this send was dropped (timeout, translation turned off, room change): nothing is sent and
   * the draft stays in the composer.
   */
  const resolveOutgoingText = async (draftText: string): Promise<string | null> => {
    if (!outgoing.isEnabled || !draftText) {
      return draftText;
    }
    isResolvingSendRef.current = true;
    setIsResolvingSend(true);
    try {
      const { text } = await outgoing.resolveForSend(draftText);
      return isMountedRef.current ? text : null;
    } catch {
      return null;
    } finally {
      isResolvingSendRef.current = false;
      if (isMountedRef.current) {
        setIsResolvingSend(false);
      }
    }
  };

  const clearComposer = () => {
    setMessage('');
    setMentionQuery(null);
    setPendingAttachments([]);
    linkPreview.reset();
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Guards a second Enter while the translation of the first one is still being awaited.
    if (isResolvingSendRef.current) {
      return;
    }
    const draftText = message.trim();
    if ((!draftText && pendingAttachments.length === 0) || isBlocked) {
      return;
    }
    const text = await resolveOutgoingText(draftText);
    if (text === null) {
      return;
    }
    if (exceedsLimits(text, pendingAttachments.length > 0)) {
      window.alert(t('chat.input.tooLong'));
      return;
    }

    onSend(buildSubmitPayload(text));
    clearComposer();
  };

  const finishRecording = async (result: AudioRecordingResult) => {
    const attachments = pendingAttachmentsRef.current;
    const draftCaption = messageRef.current.trim();
    const caption = attachments.length > 0 ? await resolveOutgoingText(draftCaption) : draftCaption;
    if (caption === null) {
      // The caption's translation was dropped (timeout, turned off, room change): the audio still goes; the caption
      // and attachments stay in the composer instead of going out untranslated.
      onSendAudio({ blob: result.blob, mimeType: result.mimeType, duration: recordingTime });
      return;
    }
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
        void finishRecording(result);
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
  // Shown when an engine can run, or while the room's toggle is on so it can always be turned off again.
  // Auto-translate off makes support 'unavailable' and isRequested false, so the toggle only exists with it on.
  const showOutgoingToggle = outgoing.isRequested || (outgoing.support !== 'unavailable' && outgoing.support !== 'failed');
  // Fixed accessible name with aria-pressed carrying the state; the tooltip keeps the brief's state-dependent copy.
  const outgoingToggleLabel = t('chat.translation.outgoingToggleOn', { language: t(`chat.translation.languages.${outgoing.target}`) });
  const outgoingToggleTitle = outgoing.isRequested ? t('chat.translation.outgoingToggleOff') : outgoingToggleLabel;

  return (
    <>
      {pendingAttachments.length > 0 && (
        <PendingAttachmentsPreview files={pendingAttachments} onRemove={isResolvingSend ? undefined : removePendingAttachment} />
      )}
      {pendingAttachments.length === 0 && linkPreview.preview && (
        <div className="sc-anim-rise-in" style={{ padding: '10px 14px 0', background: theme.surface }}>
          <LinkPreviewCard preview={linkPreview.preview} auth={auth} variant="composer" onDismiss={linkPreview.dismiss} />
        </div>
      )}
      <form
        onSubmit={(event) => void handleSubmit(event)}
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
              disabled={isBlocked || isResolvingSend}
              title={blockedTitle ?? t('chat.input.attach')}
              className="sc-icon-btn sc-icon-btn--muted sc-anim-pop-in"
              style={{ width: '44px', height: '44px' }}
            >
              <FaPaperclip size={18} />
            </button>
            <button
              type="button"
              onClick={() => void handleMicClick()}
              disabled={isBlocked}
              title={blockedTitle ?? t('chat.input.record')}
              className="sc-icon-btn sc-icon-btn--muted sc-anim-pop-in"
              style={{ width: '44px', height: '44px' }}
            >
              <FaMicrophone size={18} />
            </button>
          </>
        )}
        {showOutgoingToggle && (
          <button
            type="button"
            onClick={outgoing.toggle}
            disabled={isBlocked}
            aria-pressed={outgoing.isRequested}
            title={outgoingToggleTitle}
            aria-label={outgoingToggleLabel}
            className="sc-icon-btn sc-icon-btn--muted"
            style={{
              width: '44px',
              height: '44px',
              flexDirection: 'column',
              gap: '1px',
              color: outgoing.isRequested ? theme.accent : undefined,
            }}
          >
            <MdTranslate size={18} aria-hidden="true" />
            <span style={{ fontSize: '0.6rem', fontWeight: 700, lineHeight: 1 }}>{outgoing.target.toUpperCase()}</span>
          </button>
        )}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          {!isMentionListOpen && <OutgoingTranslationStrip outgoing={outgoing} draft={message} />}
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
              setMessage(event.target.value);
              onTyping();
              updateMentionQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
            }}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            readOnly={isResolvingSend}
            maxLength={characterLimit(pendingAttachments.length > 0)}
            disabled={isBlocked}
            placeholder={
              isBlockedBy ? t('chat.input.placeholderBlockedBy') : userBlocked ? t('chat.input.placeholderYouBlocked') : t('chat.input.placeholder')
            }
            autoFocus={shouldAutoFocus}
            className="sc-input sc-input--composer"
          />
        </div>
        {(message.trim() || pendingAttachments.length > 0) && (
          <button
            type="submit"
            disabled={isResolvingSend}
            title={t('chat.input.send')}
            className="sc-icon-btn sc-icon-btn--gradient sc-anim-send-in"
            style={{ width: '44px', height: '44px', fontSize: '1rem' }}
          >
            <FaPaperPlane />
          </button>
        )}
      </form>
    </>
  );
});
