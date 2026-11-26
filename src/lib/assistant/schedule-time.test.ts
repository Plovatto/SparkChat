import { describe, expect, it } from 'vitest';
import { localDateTimeToEpoch } from './schedule-time';

describe('localDateTimeToEpoch', () => {
  it('converts a wall time in the given zone to an epoch', () => {
    expect(localDateTimeToEpoch('2026-11-27T09:00', 'America/Sao_Paulo')).toBe(Date.UTC(2026, 10, 27, 12, 0));
    expect(localDateTimeToEpoch('2026-07-01T09:00', 'Europe/Lisbon')).toBe(Date.UTC(2026, 6, 1, 8, 0));
    expect(localDateTimeToEpoch('2026-11-27T09:00', 'UTC')).toBe(Date.UTC(2026, 10, 27, 9, 0));
  });

  it('rejects malformed values and unknown zones', () => {
    expect(localDateTimeToEpoch('tomorrow', 'UTC')).toBeNull();
    expect(localDateTimeToEpoch('2026-11-27T09:00', 'Mars/Base')).toBeNull();
  });
});
