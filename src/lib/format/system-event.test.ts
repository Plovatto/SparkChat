import { afterEach, describe, expect, it } from 'vitest';
import { appI18n } from '@lib/i18n/app-i18n';
import { formatCallDuration, systemEventSegments, systemMessageSegments, systemMessageText } from './system-event';

afterEach(async () => {
  await appI18n.changeLanguage('pt');
});

const event = (type: string, params: Record<string, string | number | null> = {}) => ({ type, params });

describe('systemMessageText', () => {
  it('describes every group event in Portuguese', () => {
    expect(systemMessageText({ content: '', systemEvent: event('group.created', { actor: 'Ana' }) })).toBe('Ana criou o grupo');
    expect(systemMessageText({ content: '', systemEvent: event('group.memberJoined', { actor: 'Ana' }) })).toBe('Ana entrou no grupo');
    expect(systemMessageText({ content: '', systemEvent: event('group.memberLeft', { actor: 'Ana' }) })).toBe('Ana saiu do grupo');
    expect(systemMessageText({ content: '', systemEvent: event('group.memberRemoved', { actor: 'Ana', target: 'Bia' }) })).toBe(
      'Bia foi removido do grupo por Ana',
    );
    expect(systemMessageText({ content: '', systemEvent: event('group.adminPromoted', { actor: 'Ana', target: 'Bia' }) })).toBe(
      'Bia foi promovido a administrador por Ana',
    );
  });

  it('describes group events in English', async () => {
    await appI18n.changeLanguage('en');
    expect(systemMessageText({ content: 'Ana criou o grupo', systemEvent: event('group.created', { actor: 'Ana' }) })).toBe(
      'Ana created the group',
    );
    expect(systemMessageText({ content: '', systemEvent: event('group.memberRemoved', { actor: 'Ana', target: 'Bia' }) })).toBe(
      'Bia was removed from the group by Ana',
    );
  });

  it('says someone when the actor is unknown', async () => {
    expect(systemMessageText({ content: '', systemEvent: event('group.created', { actor: null }) })).toBe('Alguém criou o grupo');
    await appI18n.changeLanguage('en');
    expect(systemMessageText({ content: '', systemEvent: event('group.created', { actor: null }) })).toBe('Someone created the group');
  });

  it('refers to the reader as you, with the right grammar', async () => {
    await appI18n.changeLanguage('en');
    expect(systemMessageText({ content: '', systemEvent: event('group.memberLeft', { actor: 'Ana' }) }, 'Ana')).toBe('You left the group');
    expect(systemMessageText({ content: '', systemEvent: event('group.memberRemoved', { actor: 'Ana', target: 'Bia' }) }, 'Bia')).toBe(
      'You were removed from the group by Ana',
    );
    expect(systemMessageText({ content: '', systemEvent: event('group.adminPromoted', { actor: 'Ana', target: 'Bia' }) }, 'Ana')).toBe(
      'Bia was made an admin by you',
    );
  });

  it('translates the SparkAI notices', async () => {
    await appI18n.changeLanguage('en');
    expect(systemMessageText({ content: 'Não consegui responder agora.', systemEvent: event('ai.replyFailed') })).toBe(
      "I couldn't reply right now. Please try again shortly.",
    );
    expect(systemMessageText({ content: '', systemEvent: event('ai.dailyLimitReached') })).toContain('daily AI message limit');
  });

  it('falls back to the stored text when the event is missing or unknown', () => {
    expect(systemMessageText({ content: 'Ana fez algo', systemEvent: null })).toBe('Ana fez algo');
    expect(systemMessageText({ content: 'Ana fez algo novo', systemEvent: event('group.somethingNew', { actor: 'Ana' }) })).toBe(
      'Ana fez algo novo',
    );
    expect(systemEventSegments(event('group.somethingNew'))).toBeNull();
  });
});

describe('systemMessageSegments', () => {
  it('marks the names so they can be highlighted', () => {
    expect(systemMessageSegments({ content: '', systemEvent: event('group.memberRemoved', { actor: 'Ana', target: 'Bia' }) })).toEqual([
      { text: 'Bia', isName: true },
      { text: ' foi removido do grupo por ', isName: false },
      { text: 'Ana', isName: true },
    ]);
  });
});

describe('call events', () => {
  it('renders ended and missed calls with kind and duration in both languages', async () => {
    const ended = { content: '', systemEvent: { type: 'call.ended', params: { kind: 'video', duration: 125 } } };
    const missed = { content: '', systemEvent: { type: 'call.missed', params: { kind: 'voice' } } };

    expect(systemMessageText(ended)).toBe('Chamada de vídeo encerrada · 2:05');
    expect(systemMessageText(missed)).toBe('Chamada de voz perdida');
    await appI18n.changeLanguage('en');
    expect(systemMessageText(ended)).toBe('video call ended · 2:05');
    expect(systemMessageText(missed)).toBe('Missed voice call');
  });

  it('formats long durations with hours', () => {
    expect(formatCallDuration(3725)).toBe('1:02:05');
    expect(formatCallDuration(-5)).toBe('0:00');
  });
});
