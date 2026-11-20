import { describe, expect, it } from 'vitest';
import { showSelfSpeaking, speakingClass } from './self-speaking';

describe('showSelfSpeaking', () => {
  it('shows only while speaking and unmuted', () => {
    expect(showSelfSpeaking(true, false)).toBe(true);
    expect(showSelfSpeaking(false, false)).toBe(false);
  });

  it('never shows while muted', () => {
    expect(showSelfSpeaking(true, true)).toBe(false);
    expect(showSelfSpeaking(false, true)).toBe(false);
  });
});

describe('speakingClass', () => {
  it('adds the shared speaking style only when active', () => {
    expect(speakingClass('sc-call-round', true)).toBe('sc-call-round sc-call-speaking');
    expect(speakingClass('sc-call-round', false)).toBe('sc-call-round');
  });
});
