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
});
