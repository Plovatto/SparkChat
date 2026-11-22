import { afterEach, describe, expect, it } from 'vitest';
import { appI18n } from '@lib/i18n/app-i18n';
import { describeCallCard, describeCallEvent, describeCallPreview, isCallEvent } from './call-event';

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

describe('describeCallPreview', () => {
  it('shows a green outgoing glyph and the duration for an answered voice call I made', () => {
    expect(describeCallPreview(ended({ kind: 'voice', callerId: 'me', reason: 'completed', durationSec: 159 }), 'me')).toEqual({
      glyph: 'voice-outgoing',
      tone: 'success',
      label: 'Chamada de voz',
      detail: '2:39',
      missed: false,
      fullText: 'Chamada de voz · Você ligou · Atendida · 2:39',
    });
  });

  it('calls out a missed incoming call in red without extra words', () => {
    for (const reason of ['missed', 'cancelled', 'busy']) {
      expect(describeCallPreview(missed({ kind: 'voice', callerId: 'peer', reason }), 'me')).toEqual({
        glyph: 'voice-missed',
        tone: 'danger',
        label: 'Chamada perdida',
        detail: null,
        missed: true,
        fullText: 'Chamada de voz · Ligou para você · Perdida',
      });
    }
  });

  it('marks declined calls in red and keeps the outcome as detail', () => {
    const declinedVideo = describeCallPreview(missed({ kind: 'video', callerId: 'me', reason: 'declined' }), 'me');
    expect(declinedVideo).toMatchObject({ glyph: 'video', tone: 'danger', label: 'Chamada de vídeo', detail: 'Recusada', missed: false });
    expect(declinedVideo.fullText).toBe('Chamada de vídeo · Você ligou · Recusada');

    const iDeclined = describeCallPreview(missed({ kind: 'voice', callerId: 'peer', reason: 'declined' }), 'me');
    expect(iDeclined).toMatchObject({ glyph: 'voice-missed', tone: 'danger', label: 'Chamada de voz', detail: 'Você recusou', missed: false });
  });

  it('keeps unanswered calls I made muted and failed calls red', () => {
    expect(describeCallPreview(missed({ kind: 'voice', callerId: 'me', reason: 'missed' }), 'me')).toMatchObject({
      glyph: 'voice-outgoing',
      tone: 'muted',
      detail: 'Sem resposta',
    });
    expect(describeCallPreview(missed({ kind: 'voice', callerId: 'me', reason: 'cancelled' }), 'me').tone).toBe('muted');
    expect(describeCallPreview(missed({ kind: 'voice', callerId: 'me', reason: 'failed' }), 'me').tone).toBe('danger');
    expect(describeCallPreview(missed({ kind: 'video', callerId: 'peer', reason: 'connection-lost' }), 'me')).toMatchObject({
      glyph: 'video-off',
      tone: 'danger',
      detail: 'Conexão perdida',
    });
  });

  it('describes answered and missed video calls', async () => {
    expect(describeCallPreview(ended({ kind: 'video', callerId: 'peer', durationSec: 725 }), 'me')).toMatchObject({
      glyph: 'video',
      tone: 'success',
      label: 'Chamada de vídeo',
      detail: '12:05',
    });
    expect(describeCallPreview(missed({ kind: 'video', callerId: 'peer', reason: 'missed' }), 'me')).toMatchObject({
      glyph: 'video-off',
      label: 'Chamada de vídeo perdida',
      missed: true,
    });
    await appI18n.changeLanguage('en');
    expect(describeCallPreview(missed({ kind: 'voice', callerId: 'peer', reason: 'missed' }), 'me').label).toBe('Missed call');
    expect(describeCallPreview(missed({ kind: 'video', callerId: 'peer', reason: 'missed' }), 'me').label).toBe('Missed video call');
  });
});

describe('describeCallCard', () => {
  it('reports the status pill for answered, missed, declined and other outcomes', async () => {
    const answered = describeCallCard(ended({ kind: 'voice', callerId: 'peer', reason: 'completed', durationSec: 1183 }), 'me');
    expect(answered).toMatchObject({ status: 'answered', statusLabel: '19:43', tone: 'success', pulse: false, who: 'Ligou para você', title: 'Chamada de voz' });

    const lost = describeCallCard(missed({ kind: 'voice', callerId: 'peer', reason: 'missed' }), 'me');
    expect(lost).toMatchObject({ status: 'missed', statusLabel: 'Perdida', tone: 'danger', pulse: true, glyph: 'voice-missed' });

    const declined = describeCallCard(missed({ kind: 'video', callerId: 'peer', reason: 'declined' }), 'me');
    expect(declined).toMatchObject({ status: 'declined', statusLabel: 'Recusada', tone: 'danger', pulse: false, glyph: 'video-off' });

    const unanswered = describeCallCard(missed({ kind: 'voice', callerId: 'me', reason: 'missed' }), 'me');
    expect(unanswered).toMatchObject({ status: 'other', statusLabel: 'Sem resposta', tone: 'muted', direction: 'outgoing', who: 'Você ligou' });

    await appI18n.changeLanguage('en');
    expect(describeCallCard(missed({ kind: 'video', callerId: 'peer', reason: 'declined' }), 'me').statusLabel).toBe('Declined');
  });
});
