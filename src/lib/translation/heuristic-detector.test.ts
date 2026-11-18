import { describe, expect, it } from 'vitest';
import { detectPtEn } from './heuristic-detector';

describe('detectPtEn', () => {
  it.each([
    ['Bom dia pessoal, a reunião ainda está de pé?', 'pt'],
    ['vc vai hoje? to indo pra lá', 'pt'],
    ['Good morning everyone, are we still meeting?', 'en'],
    ['thanks, I will check it tomorrow', 'en'],
  ])('detects %s as %s', (text, lang) => {
    const r = detectPtEn(text);
    expect(r?.language).toBe(lang);
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns null when there is no signal', () => {
    expect(detectPtEn('Netflix Spotify')).toBeNull();
    expect(detectPtEn('')).toBeNull();
  });
});

describe('detectPtEn short chat phrases', () => {
  it.each(['achei bom', 'muito legal', 'gostei demais', 'beleza então', 'oi tudo bem'])('detects "%s" as pt', (text) => {
    expect(detectPtEn(text)?.language).toBe('pt');
  });

  it.each(['nice one', 'love it', 'sounds great', 'see you soon'])('detects "%s" as en', (text) => {
    expect(detectPtEn(text)?.language).toBe('en');
  });
});

describe('detectPtEn word shapes and chat signals', () => {
  it.each([
    'Definitivamente menos bugado kkkkkkkkkk',
    'Daí acabava com a concorrência',
    'rapidamente resolvido',
    'tava pensando nisso ontem',
    'rsrs que coisa',
    'trabalhando em casa hoje',
    'ficou lindinho',
  ])('reads "%s" as pt', (text) => {
    expect(detectPtEn(text)?.language).toBe('pt');
  });

  it.each([
    'Definitely less buggy lol',
    'working from home today',
    'that was really helpful',
    'the weather is nice',
    'what should we do tonight',
    'thinking about it',
  ])('reads "%s" as en', (text) => {
    expect(detectPtEn(text)?.language).toBe('en');
  });
});

describe('detectPtEn does not decide on weak evidence', () => {
  it.each(['no', 'no problem', 'a lot', 'avocado toast', 'Orlando trip', 'Colorado', 'ok', 'yes', 'to indo'])('stays undecided on "%s"', (text) => {
    expect(detectPtEn(text)).toBeNull();
  });

  it('reads laughter as Portuguese', () => {
    expect(detectPtEn('kkkkk que isso')?.language).toBe('pt');
  });
});
