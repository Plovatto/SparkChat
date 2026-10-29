import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseMentionedUserIds } from './parse-mentions';

const participants = [
  { id: 'u1', nickname: 'Marina' },
  { id: 'u2', nickname: 'Rafael' },
];

describe('parseMentionedUserIds', () => {
  it('resolves mentions by nickname ignoring case', () => {
    expect(parseMentionedUserIds('oi @marina e @RAFAEL', participants)).toEqual(['u1', 'u2']);
  });

  it('ignores unknown nicknames and repeated mentions', () => {
    expect(parseMentionedUserIds('@Marina @marina @Camila', participants)).toEqual(['u1']);
  });

  it('only returns ids of participants, without duplicates', () => {
    const participant = fc.record({ id: fc.uuid(), nickname: fc.stringMatching(/^[a-z0-9_]{1,12}$/) });

    fc.assert(
      fc.property(fc.string(), fc.array(participant, { maxLength: 5 }), (content, members) => {
        const ids = parseMentionedUserIds(content, members);
        const memberIds = new Set(members.map((member) => member.id));

        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.every((id) => memberIds.has(id))).toBe(true);
      }),
    );
  });
});
