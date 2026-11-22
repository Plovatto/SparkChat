import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { translate } from '@lib/i18n/app-i18n';

export type CallEventDirection = 'outgoing' | 'incoming';
export type CallEventTone = 'answered' | 'unanswered';

export interface CallEventParams {
  type: string;
  params: Record<string, string | number | null>;
}

export interface CallEventDescription {
  kind: 'voice' | 'video';
  direction: CallEventDirection;
  tone: CallEventTone;
  title: string;
  who: string;
  outcome: string;
  duration: string | null;
  subtitle: string;
}

const KNOWN_REASONS: ReadonlySet<string> = new Set(['missed', 'cancelled', 'declined', 'busy', 'failed', 'connection-lost']);

export function isCallEvent(event: { type: string } | null | undefined): boolean {
  return event?.type === 'call.ended' || event?.type === 'call.missed';
}

export function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

function readDuration(params: CallEventParams['params']): number {
  const raw = params.durationSec ?? params.duration;
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

export function describeCallEvent(event: CallEventParams, selfUserId: string | null | undefined = getCurrentIdentity()?.userId): CallEventDescription {
  const kind = event.params.kind === 'video' ? 'video' : 'voice';
  const direction: CallEventDirection = selfUserId && event.params.callerId === selfUserId ? 'outgoing' : 'incoming';
  const answered = event.type === 'call.ended';
  const reasonRaw = typeof event.params.reason === 'string' ? event.params.reason : 'missed';
  const reason = KNOWN_REASONS.has(reasonRaw) ? reasonRaw : 'missed';
  const title = translate(`calls.event.title.${kind}`);
  const who = translate(`calls.event.${direction}`);
  const outcome = answered ? translate('calls.event.answered') : translate(`calls.event.outcome.${reason}.${direction}`);
  const duration = answered ? formatCallDuration(readDuration(event.params)) : null;
  const subtitle = [who, outcome, duration].filter((part): part is string => Boolean(part)).join(' · ');
  return { kind, direction, tone: answered ? 'answered' : 'unanswered', title, who, outcome, duration, subtitle };
}

export type CallPreviewGlyph = 'voice-outgoing' | 'voice-incoming' | 'voice-missed' | 'video' | 'video-off';
export type CallPreviewTone = 'success' | 'danger' | 'muted';

export interface CallPreview {
  glyph: CallPreviewGlyph;
  tone: CallPreviewTone;
  label: string;
  detail: string | null;
  missed: boolean;
  fullText: string;
}

const MISSED_INCOMING_REASONS: ReadonlySet<string> = new Set(['missed', 'cancelled', 'busy']);
const MUTED_OUTGOING_REASONS: ReadonlySet<string> = new Set(['missed', 'cancelled', 'busy']);

function readReason(params: CallEventParams['params']): string {
  const raw = typeof params.reason === 'string' ? params.reason : 'missed';
  return KNOWN_REASONS.has(raw) ? raw : 'missed';
}

export function describeCallPreview(event: CallEventParams, selfUserId: string | null | undefined = getCurrentIdentity()?.userId): CallPreview {
  const described = describeCallEvent(event, selfUserId);
  const fullText = `${described.title} · ${described.subtitle}`;
  const answered = described.tone === 'answered';
  const reason = readReason(event.params);
  const missedIncoming = !answered && described.direction === 'incoming' && MISSED_INCOMING_REASONS.has(reason);

  const tone: CallPreviewTone = answered
    ? 'success'
    : described.direction === 'outgoing' && MUTED_OUTGOING_REASONS.has(reason)
      ? 'muted'
      : 'danger';

  const glyph: CallPreviewGlyph =
    described.kind === 'video'
      ? answered || described.direction === 'outgoing'
        ? 'video'
        : 'video-off'
      : answered
        ? described.direction === 'outgoing'
          ? 'voice-outgoing'
          : 'voice-incoming'
        : described.direction === 'outgoing'
          ? 'voice-outgoing'
          : 'voice-missed';

  const label = missedIncoming ? translate(`calls.event.missedTitle.${described.kind}`) : described.title;
  const detail = answered ? described.duration : missedIncoming ? null : described.outcome;

  return { glyph, tone, label, detail, missed: missedIncoming, fullText };
}

export type CallCardStatus = 'answered' | 'missed' | 'declined' | 'other';

export interface CallCard {
  kind: 'voice' | 'video';
  direction: CallEventDirection;
  tone: CallPreviewTone;
  glyph: CallPreviewGlyph;
  title: string;
  who: string;
  status: CallCardStatus;
  statusLabel: string;
  pulse: boolean;
  fullText: string;
}

export function describeCallCard(event: CallEventParams, selfUserId: string | null | undefined = getCurrentIdentity()?.userId): CallCard {
  const described = describeCallEvent(event, selfUserId);
  const preview = describeCallPreview(event, selfUserId);
  const answered = described.tone === 'answered';
  const reason = readReason(event.params);
  const status: CallCardStatus = answered ? 'answered' : preview.missed ? 'missed' : reason === 'declined' ? 'declined' : 'other';
  const statusLabel = answered
    ? (described.duration ?? '')
    : status === 'declined'
      ? translate('calls.event.declinedShort')
      : described.outcome;
  return {
    kind: described.kind,
    direction: described.direction,
    tone: preview.tone,
    glyph: preview.glyph,
    title: described.title,
    who: described.who,
    status,
    statusLabel,
    pulse: preview.missed,
    fullText: preview.fullText,
  };
}
