const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function localDateTimeToEpoch(local: string, timeZone: string): number | null {
  const match = LOCAL_PATTERN.exec(local);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const wall = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0));
  try {
    const first = wall - offsetAt(wall, timeZone);
    const second2 = wall - offsetAt(first, timeZone);
    return Number.isFinite(second2) ? second2 : null;
  } catch {
    return null;
  }
}
