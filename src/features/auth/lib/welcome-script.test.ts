import { describe, expect, it } from 'vitest';
import {
  advanceLine,
  bumpReaction,
  entranceSchedule,
  initialConversation,
  nextLine,
  nextReactionCount,
  setPhase,
  WELCOME_BUBBLES,
  WELCOME_LIVE_ORDER,
  WELCOME_REACTION_MAX,
  WELCOME_REACTION_MIN,
} from './welcome-script';

const coffee = WELCOME_BUBBLES.find((spec) => spec.id === 'coffee')!;

describe('welcome script', () => {
  it('starts every bubble hidden, or revealed with the typing slot still typing', () => {
    const hidden = initialConversation(WELCOME_BUBBLES, false);
    expect(Object.values(hidden.bubbles).every((bubble) => bubble.phase === 'hidden')).toBe(true);

    const revealed = initialConversation(WELCOME_BUBBLES, true);
    expect(revealed.bubbles.typing?.phase).toBe('typing');
    expect(revealed.bubbles.coffee?.phase).toBe('shown');
    expect(revealed.reactions).toBe(WELCOME_REACTION_MIN);
  });

  it('staggers the entrance and makes only incoming messages wait for typing', () => {
    const schedule = entranceSchedule(WELCOME_BUBBLES, { startMs: 100, stepMs: 50, typingMs: 400 });
    expect(schedule.map((step) => step.appearAt)).toEqual(WELCOME_BUBBLES.map((_, index) => 100 + index * 50));
    for (const step of schedule) {
      const spec = WELCOME_BUBBLES.find((candidate) => candidate.id === step.id)!;
      expect(step.revealAt - step.appearAt).toBe(spec.kind === 'incoming' ? 400 : 0);
    }
  });

  it('cycles lines and reaction counts within their bounds', () => {
    expect(nextLine(coffee, 0)).toBe(1);
    expect(nextLine(coffee, coffee.lineKeys.length - 1)).toBe(0);
    expect(nextReactionCount(WELCOME_REACTION_MIN)).toBe(WELCOME_REACTION_MIN + 1);
    expect(nextReactionCount(WELCOME_REACTION_MAX)).toBe(WELCOME_REACTION_MIN);
  });

  it('updates bubble state immutably', () => {
    const start = initialConversation(WELCOME_BUBBLES, false);
    const typing = setPhase(start, 'coffee', 'typing');
    expect(typing).not.toBe(start);
    expect(start.bubbles.coffee?.phase).toBe('hidden');
    expect(setPhase(typing, 'coffee', 'typing')).toBe(typing);
    expect(setPhase(typing, 'missing', 'shown')).toBe(typing);

    const advanced = advanceLine(typing, coffee);
    expect(advanced.bubbles.coffee).toEqual({ phase: 'shown', line: 1, sends: 1 });
    expect(bumpReaction(advanced).reactions).toBe(WELCOME_REACTION_MIN + 1);
  });

  it('only schedules live updates for bubbles that exist and are not the permanent typing slot', () => {
    const ids = new Set(WELCOME_BUBBLES.map((spec) => spec.id));
    for (const id of WELCOME_LIVE_ORDER) {
      expect(ids.has(id)).toBe(true);
      expect(id).not.toBe('typing');
    }
  });

  it('keeps every bubble inside its column and gives each line group three lines', () => {
    for (const spec of WELCOME_BUBBLES) {
      expect(spec.x).toBeGreaterThanOrEqual(0);
      expect(spec.x).toBeLessThan(0.6);
      expect(spec.y).toBeGreaterThan(0);
      expect(spec.y).toBeLessThan(0.85);
      if (spec.kind === 'incoming' || spec.kind === 'outgoing') {
        expect(spec.lineKeys).toHaveLength(3);
      }
    }
  });
});
