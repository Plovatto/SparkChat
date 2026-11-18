import { describe, expect, it } from 'vitest';
import { isWholeMessageAbbreviation, normalizeChatAbbreviations } from './abbreviations';

describe('normalizeChatAbbreviations', () => {
  it.each([
    ['vc vem hj?', 'você vem hoje?'],
    ['vcs tão bem?', 'vocês tão bem?'],
    ['blz, vlw!', 'beleza, valeu!'],
    ['obg pela msg', 'obrigado pela mensagem'],
    ['pq q vc n veio', 'porque que você não veio'],
    ['tb gostei, td certo', 'também gostei, tudo certo'],
    ['tbm acho', 'também acho'],
    ['tô chegando, tá bom pra vc?', 'estou chegando, está bom para você?'],
    ['mto bom, mt legal', 'muito bom, muito legal'],
    ['dps a gente vê, agr não', 'depois a gente vê, agora não'],
    ['fds vem cmg', 'fim de semana vem comigo'],
    ['ctz que amanha dá', 'certeza que amanhã dá'],
    ['tds aqui', 'todos aqui'],
  ])('expands portuguese chat abbreviations: %s', (input, expected) => {
    expect(normalizeChatAbbreviations(input, 'pt')).toBe(expected);
  });

  it.each([
    ['thx u', 'thanks you'],
    ['thnx', 'thanks'],
    ['r u ok?', 'are you ok?'],
    ['idk btw', "I don't know by the way"],
    ['pls come tmrw', 'please come tomorrow'],
    ['plz', 'please'],
    ['im gonna go, wanna come?', "I'm going to go, want to come?"],
    ['see ya, ur the best', 'see you, your the best'],
  ])('expands english chat abbreviations: %s', (input, expected) => {
    expect(normalizeChatAbbreviations(input, 'en')).toBe(expected);
  });

  it('keeps the capital letter of the abbreviation', () => {
    expect(normalizeChatAbbreviations('Vc viu?', 'pt')).toBe('Você viu?');
    expect(normalizeChatAbbreviations('Thx', 'en')).toBe('Thanks');
  });

  it('only replaces whole words', () => {
    expect(normalizeChatAbbreviations('quero vcx hjk tbmm', 'pt')).toBe('quero vcx hjk tbmm');
    expect(normalizeChatAbbreviations('umbrella ruby', 'en')).toBe('umbrella ruby');
  });

  it('expands n only as a whole message or before a space', () => {
    expect(normalizeChatAbbreviations('n', 'pt')).toBe('não');
    expect(normalizeChatAbbreviations('N!', 'pt')).toBe('Não!');
    expect(normalizeChatAbbreviations('n sei', 'pt')).toBe('não sei');
    expect(normalizeChatAbbreviations('eu n sei', 'pt')).toBe('eu não sei');
    expect(normalizeChatAbbreviations('vitamina n', 'pt')).toBe('vitamina n');
    expect(normalizeChatAbbreviations('n.', 'pt')).toBe('não.');
  });

  it('expands s only as a whole message', () => {
    expect(normalizeChatAbbreviations('s', 'pt')).toBe('sim');
    expect(normalizeChatAbbreviations(' s ', 'pt')).toBe(' sim ');
    expect(normalizeChatAbbreviations('s sim', 'pt')).toBe('s sim');
  });

  it('uses only the map of the source language', () => {
    expect(normalizeChatAbbreviations('u r', 'pt')).toBe('u r');
    expect(normalizeChatAbbreviations('vc blz', 'en')).toBe('vc blz');
  });

  it('keeps the rest of the text, spacing and line breaks untouched', () => {
    expect(normalizeChatAbbreviations('  oi vc\r\ntudo bem?  ', 'pt')).toBe('  oi você\r\ntudo bem?  ');
  });
});

describe('isWholeMessageAbbreviation', () => {
  it('recognizes a known abbreviation that is the whole message', () => {
    expect(isWholeMessageAbbreviation('n')).toBe(true);
    expect(isWholeMessageAbbreviation(' S? ')).toBe(true);
    expect(isWholeMessageAbbreviation('u')).toBe(true);
    expect(isWholeMessageAbbreviation('x')).toBe(false);
    expect(isWholeMessageAbbreviation('n sei')).toBe(false);
  });
});
