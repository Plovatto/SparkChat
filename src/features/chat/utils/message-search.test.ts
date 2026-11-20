import { describe, expect, it } from 'vitest';
import type { MessageView } from '@lib/socket';
import { MESSAGE_SEARCH_LIMIT, searchMessages } from './message-search';

function message(id: string, overrides: Partial<MessageView> = {}): MessageView {
  return {
    id,
    roomId: 'room-1',
    sender: { id: 'u1', nickname: 'Ana' },
    content: '',
    type: 'text',
    duration: null,
    timestamp: `2026-11-20T10:${String(Number(id.replace(/\D/g, '')) % 60).padStart(2, '0')}:00.000Z`,
    deletedForEveryone: false,
    status: 'sent',
    deliveredTo: [],
    readBy: [],
    playedBy: [],
    replyTo: null,
    mentionedUserIds: [],
    fileMeta: null,
    caption: null,
    linkPreview: null,
    ...overrides,
  } as MessageView;
}

describe('searchMessages', () => {
  it('ignores queries shorter than two characters', () => {
    expect(searchMessages([message('m1', { content: 'oi' })], 'o')).toEqual([]);
  });

  it('finds text ignoring accents and case and points at the match', () => {
    const [result] = searchMessages([message('m1', { content: 'Bora pra Floripa amanhã?' })], 'AMANHA');
    expect(result?.message.id).toBe('m1');
    expect(result?.text.slice(result.matchStart, result.matchStart + result.matchLength)).toBe('amanhã');
  });

  it('searches media captions but skips deleted and system messages', () => {
    const results = searchMessages(
      [
        message('m1', { type: 'image', content: 'blob:x', caption: 'vista do quarto' }),
        message('m2', { content: 'quarto apagado', deletedForEveryone: true }),
        message('m3', { content: 'quarto', systemEvent: { type: 'memberJoined' } as MessageView['systemEvent'] }),
        message('m4', { type: 'image', content: 'quarto.png' }),
      ],
      'quarto',
    );
    expect(results.map((result) => result.message.id)).toEqual(['m1']);
  });

  it('returns the newest matches first and caps the list', () => {
    const many = Array.from({ length: MESSAGE_SEARCH_LIMIT + 5 }, (_, index) => message(`m${index}`, { content: 'praia' }));
    const results = searchMessages(many, 'praia');
    expect(results).toHaveLength(MESSAGE_SEARCH_LIMIT);
    const times = results.map((result) => new Date(result.message.timestamp).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});
