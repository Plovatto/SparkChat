import { describe, expect, it } from 'vitest';
import { isSuggestionTriggered, recordAssessment, shouldShowAutoTranslateBanner, STORED_ASSESSMENTS_PER_ROOM } from './auto-translate-suggestion';

describe('isSuggestionTriggered', () => {
  it('triggers after two manual translations in the conversation', () => {
    expect(isSuggestionTriggered({ manualCount: 1, assessments: [] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 2, assessments: [] })).toBe(true);
  });

  it('triggers when at least three of the last received messages are confidently in the other language', () => {
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'unsure', 'other'] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'unsure', 'other', 'other'] })).toBe(true);
  });

  it('only looks at the most recent received messages', () => {
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['other', 'other', 'other', 'target', 'target', 'target', 'unsure', 'target'] })).toBe(false);
    expect(isSuggestionTriggered({ manualCount: 0, assessments: ['target', 'target', 'other', 'unsure', 'other', 'target', 'other'] })).toBe(true);
  });
});

describe('recordAssessment', () => {
  const at = (minute: number) => `2026-11-18T10:${String(minute).padStart(2, '0')}:00.000Z`;

  it('keeps the assessments ordered by time', () => {
    const list = recordAssessment(recordAssessment([], { messageId: 'b', timestamp: at(2), assessment: 'other' }), {
      messageId: 'a',
      timestamp: at(1),
      assessment: 'target',
    });
    expect(list.map((entry) => entry.messageId)).toEqual(['a', 'b']);
  });

  it('replaces the assessment of the same message', () => {
    const first = recordAssessment([], { messageId: 'a', timestamp: at(1), assessment: 'unsure' });
    expect(recordAssessment(first, { messageId: 'a', timestamp: at(1), assessment: 'other' })).toEqual([
      { messageId: 'a', timestamp: at(1), assessment: 'other' },
    ]);
  });

  it('keeps only the most recent assessments', () => {
    let list: ReturnType<typeof recordAssessment> = [];
    for (let minute = 0; minute < STORED_ASSESSMENTS_PER_ROOM + 5; minute += 1) {
      list = recordAssessment(list, { messageId: `m${minute}`, timestamp: at(minute), assessment: 'other' });
    }
    expect(list).toHaveLength(STORED_ASSESSMENTS_PER_ROOM);
    expect(list[0]?.messageId).toBe('m5');
    expect(STORED_ASSESSMENTS_PER_ROOM).toBe(10);
  });
});

describe('shouldShowAutoTranslateBanner', () => {
  it('shows a triggered suggestion in on-demand mode', () => {
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: false, triggered: true })).toBe(true);
  });

  it('never shows when not triggered, dismissed, already automatic or translation is off', () => {
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: false, triggered: false })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'manual', dismissed: true, triggered: true })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'auto', dismissed: false, triggered: true })).toBe(false);
    expect(shouldShowAutoTranslateBanner({ mode: 'off', dismissed: false, triggered: true })).toBe(false);
  });
});
