import { afterEach, describe, expect, it } from 'vitest';
import { appI18n } from '@lib/i18n/app-i18n';
import { describeCallEvent, isCallEvent } from './call-event';

afterEach(async () => {
  await appI18n.changeLanguage('pt');
});

const ended = (params: Record<string, string | number | null>) => ({ type: 'call.ended', params });
const missed = (params: Record<string, string | number | null>) => ({ type: 'call.missed', params });

describe('describeCallEvent', () => {
  it('says who started the call and that an answered call lasted', () => {
    const outgoing = describeCallEvent(ended({ kind: 'voice', callerId: 'me', reason: 'completed', durationSec: '125' }), 'me');
    expect(outgoing.direction).toBe('outgoing');
    expect(outgoing.tone).toBe('answered');
    expect(outgoing.title).toBe('Chamada de voz');
    expect(outgoing.subtitle).toBe('Você ligou · Atendida · 2:05');

    const incoming = describeCallEvent(ended({ kind: 'video', callerId: 'peer', reason: 'completed', durationSec: 3725 }), 'me');
    expect(incoming.direction).toBe('incoming');
    expect(incoming.title).toBe('Chamada de vídeo');
    expect(incoming.subtitle).toBe('Ligou para você · Atendida · 1:02:05');
  });

  it('describes every way a call can go unanswered from each side', () => {
    const cases: Array<[string, string, string]> = [
      ['missed', 'Você ligou · Sem resposta', 'Ligou para você · Perdida'],
      ['cancelled', 'Você ligou · Cancelada', 'Ligou para você · Perdida'],
      ['declined', 'Você ligou · Recusada', 'Ligou para você · Você recusou'],
      ['busy', 'Você ligou · Ocupado', 'Ligou para você · Perdida'],
      ['failed', 'Você ligou · Não conectou', 'Ligou para você · Não conectou'],
      ['connection-lost', 'Você ligou · Conexão perdida', 'Ligou para você · Conexão perdida'],
    ];
    for (const [reason, outgoing, incoming] of cases) {
      expect(describeCallEvent(missed({ kind: 'voice', callerId: 'me', reason }), 'me').subtitle).toBe(outgoing);
      expect(describeCallEvent(missed({ kind: 'voice', callerId: 'peer', reason }), 'me').subtitle).toBe(incoming);
      expect(describeCallEvent(missed({ kind: 'voice', callerId: 'peer', reason }), 'me').tone).toBe('unanswered');
    }
  });

  it('falls back safely on unknown reasons, missing params and no signed-in user', () => {
    expect(describeCallEvent(missed({ kind: 'voice', callerId: 'me', reason: 'nonsense' }), 'me').subtitle).toBe('Você ligou · Sem resposta');
    expect(describeCallEvent(missed({}), null).direction).toBe('incoming');
    expect(describeCallEvent(ended({ kind: 'voice', callerId: 'me', durationSec: -4 }), 'me').duration).toBe('0:00');
  });

  it('is translated to english', async () => {
    await appI18n.changeLanguage('en');
    expect(describeCallEvent(ended({ kind: 'video', callerId: 'me', durationSec: '61' }), 'me').subtitle).toBe('You called · Answered · 1:01');
    expect(describeCallEvent(missed({ kind: 'voice', callerId: 'peer', reason: 'declined' }), 'me').subtitle).toBe('Called you · You declined');
  });

  it('recognises only call events', () => {
    expect(isCallEvent({ type: 'call.ended' })).toBe(true);
    expect(isCallEvent({ type: 'call.missed' })).toBe(true);
    expect(isCallEvent({ type: 'member.left' })).toBe(false);
    expect(isCallEvent(null)).toBe(false);
  });
});
