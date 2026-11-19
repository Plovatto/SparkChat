import { hasTranslation, translate } from '@lib/i18n/app-i18n';
import { describeCallEvent, isCallEvent } from './call-event';

export { formatCallDuration } from './call-event';

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
  if (isCallEvent(event)) {
    const described = describeCallEvent(event);
    return [{ text: `${described.title} · ${described.subtitle}`, isName: false }];
  }
  const baseKey = `systemEvents.${event.type}`;
  if (!hasTranslation(baseKey)) {
    return null;
  }

  const targetIsSelf = Boolean(selfNickname) && event.params.target === selfNickname;
  const key = targetIsSelf && hasTranslation(`${baseKey}_you`) ? `${baseKey}_you` : baseKey;
  const marked = translate(key, { actor: `${MARK}actor${MARK}`, target: `${MARK}target${MARK}` });
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
