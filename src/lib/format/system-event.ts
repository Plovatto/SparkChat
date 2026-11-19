import { hasTranslation, translate } from '@lib/i18n/app-i18n';

export interface SystemEvent {
  type: string;
  params: Record<string, string | number | null>;
}

export interface SystemTextSegment {
  text: string;
  isName: boolean;
}

interface SystemMessageLike {
  content: string;
  systemEvent?: SystemEvent | null;
}

const MARK = '\u0001';
const MARKED_NAME = new RegExp(`${MARK}(\\w+)${MARK}`);

export function formatCallDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

function callVariables(event: SystemEvent): Record<string, string> {
  if (!event.type.startsWith('call.')) {
    return {};
  }
  const kind = event.params.kind === 'video' ? 'video' : 'voice';
  const raw = event.params.durationSec ?? event.params.duration;
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 0;
  const duration = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  return { kind: translate(`calls.kind.${kind}`), duration: formatCallDuration(duration) };
}

function resolveName(value: unknown, selfNickname: string | undefined, atStart: boolean): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return translate('common.someone');
  }
  if (selfNickname && value === selfNickname) {
    return translate(atStart ? 'common.you' : 'common.youLower');
  }
  return value;
}

export function systemEventSegments(event: SystemEvent, selfNickname?: string): SystemTextSegment[] | null {
  const baseKey = `systemEvents.${event.type}`;
  if (!hasTranslation(baseKey)) {
    return null;
  }

  const targetIsSelf = Boolean(selfNickname) && event.params.target === selfNickname;
  const key = targetIsSelf && hasTranslation(`${baseKey}_you`) ? `${baseKey}_you` : baseKey;
  const marked = translate(key, { ...callVariables(event), actor: `${MARK}actor${MARK}`, target: `${MARK}target${MARK}` });
  const pieces = marked.split(MARKED_NAME);

  return pieces.flatMap((piece, index): SystemTextSegment[] => {
    if (index % 2 === 0) {
      return piece ? [{ text: piece, isName: false }] : [];
    }
    const atStart = index === 1 && pieces[0] === '';
    return [{ text: resolveName(event.params[piece], selfNickname, atStart), isName: true }];
  });
}

export function systemMessageSegments(message: SystemMessageLike, selfNickname?: string): SystemTextSegment[] {
  const segments = message.systemEvent ? systemEventSegments(message.systemEvent, selfNickname) : null;
  return segments ?? [{ text: message.content, isName: false }];
}

export function systemMessageText(message: SystemMessageLike, selfNickname?: string): string {
  return systemMessageSegments(message, selfNickname)
    .map((segment) => segment.text)
    .join('');
}
