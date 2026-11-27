import { describe, expect, it } from 'vitest';
import { parseAssistantCard } from './assistant-card';

const buttons = [
  { choice: 'yes', label: 'Aplicar' },
  { choice: 'no', label: 'Não' },
];

describe('parseAssistantCard', () => {
  it('accepts a valid card as object or JSON string', () => {
    const card = { v: 1, kind: 'choices', buttons };
    expect(parseAssistantCard(card)).toEqual(card);
    expect(parseAssistantCard(JSON.stringify(card))).toEqual(card);
  });

  it('rejects other versions', () => {
    expect(parseAssistantCard({ v: 2, kind: 'choices', buttons })).toBeNull();
  });

  it('rejects unknown kinds', () => {
    expect(parseAssistantCard({ v: 1, kind: 'mystery', buttons })).toBeNull();
  });

  it('rejects buttons without a valid choice or label', () => {
    expect(parseAssistantCard({ v: 1, kind: 'choices', buttons: [{ choice: 'explode', label: 'Boom' }] })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'choices', buttons: [{ choice: 'yes' }] })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'choices' })).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(parseAssistantCard('not json')).toBeNull();
    expect(parseAssistantCard(null)).toBeNull();
    expect(parseAssistantCard([1])).toBeNull();
  });

  it('validates list and capabilities cards', () => {
    expect(parseAssistantCard({ v: 1, kind: 'capabilities' })).toEqual({ v: 1, kind: 'capabilities' });
    expect(parseAssistantCard({ v: 1, kind: 'list', title: 'Notas', items: [{ id: '1', text: 'a' }] })).not.toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'list', title: 'Notas', items: [{ id: 1, text: 'a' }] })).toBeNull();
  });

  it('validates help cards', () => {
    expect(parseAssistantCard({ v: 1, kind: 'help', topic: 'themes', target: 'appearance' })).not.toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'help', topic: 'nope', target: 'appearance' })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'help', topic: 'themes', target: 'elsewhere' })).toBeNull();
  });

  it('rejects look cards whose look or previous is not an object', () => {
    expect(parseAssistantCard({ v: 1, kind: 'look-suggestion', look: 'x', buttons })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'look-suggestion', look: null, buttons })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'look-applied', look: {}, previous: 3, buttons })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'look-applied', look: {}, buttons })).toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'look-applied', look: {}, previous: {}, buttons })).not.toBeNull();
    expect(parseAssistantCard({ v: 1, kind: 'look-suggestion', look: {}, buttons })).not.toBeNull();
  });
});

describe('scheduled-message confirm card sendAt', () => {
  const action = { type: 'scheduled-message', roomId: 'r', recipient: 'Ana', text: 'oi', sendAtLocal: '2026-11-27T09:00', timeZone: 'UTC' };
  const buttons = [{ choice: 'yes', label: 'Sim' }];

  it('accepts the card with a numeric sendAt', () => {
    expect(parseAssistantCard({ v: 1, kind: 'confirm', action: { ...action, sendAt: 1_800_000_000_000 }, buttons })).not.toBeNull();
  });

  it('drops the card without sendAt so only the text renders', () => {
    expect(parseAssistantCard({ v: 1, kind: 'confirm', action, buttons })).toBeNull();
  });
});
