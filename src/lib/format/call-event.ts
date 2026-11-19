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
