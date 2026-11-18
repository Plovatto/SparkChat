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
