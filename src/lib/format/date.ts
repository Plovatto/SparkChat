import { format, formatDistanceToNow, isToday, isValid, isYesterday, parseISO } from 'date-fns';
import { enUS, ptBR } from 'date-fns/locale';
import { currentLanguage, translate } from '@lib/i18n/app-i18n';
import { HTML_LANG, type Language } from '@lib/i18n/language';

const DATE_FNS_LOCALES = { pt: ptBR, en: enUS };

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(language: Language, kind: 'time' | 'date' | 'dateTime'): Intl.DateTimeFormat {
  const cacheKey = `${language}:${kind}`;
  const cached = formatterCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const options: Intl.DateTimeFormatOptions =
    kind === 'time'
      ? { hour: '2-digit', minute: '2-digit' }
      : kind === 'date'
        ? { day: '2-digit', month: '2-digit', year: 'numeric' }
        : { dateStyle: 'short', timeStyle: 'short' };
  const created = new Intl.DateTimeFormat(HTML_LANG[language], options);
  formatterCache.set(cacheKey, created);
  return created;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatTime(value: string | number | Date): string {
  return formatter(currentLanguage(), 'time').format(toDate(value));
}

export function formatDateTime(value: string | number | Date): string {
  return formatter(currentLanguage(), 'dateTime').format(toDate(value));
}

export function formatDayLabel(value: string | number | Date): string {
  const date = toDate(value);
  if (isToday(date)) {
    return translate('dates.today');
  }
  if (isYesterday(date)) {
    return translate('dates.yesterday');
  }
  return formatter(currentLanguage(), 'date').format(date);
}

const LOCAL_DATE_TIME_PATTERNS: Record<Language, string> = {
  pt: "EEEEEE, dd/MM 'às' HH:mm",
  en: "EEE, MMM d 'at' h:mm a",
};

export function formatLocalDateTime(local: string): string {
  const parsed = parseISO(local);
  if (!isValid(parsed)) {
    return local;
  }
  const language = currentLanguage();
  return format(parsed, LOCAL_DATE_TIME_PATTERNS[language], { locale: DATE_FNS_LOCALES[language] });
}

export function formatTimeAgo(value: string | number | Date): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true, locale: DATE_FNS_LOCALES[currentLanguage()] });
}
