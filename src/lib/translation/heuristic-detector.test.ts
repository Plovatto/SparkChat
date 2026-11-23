import { describe, expect, it } from 'vitest';
import { detectByWords } from './heuristic-detector';

describe('detectByWords', () => {
  it.each([
    ['Bom dia pessoal, a reunião ainda está de pé?', 'pt'],
    ['vc vai hoje? to indo pra lá', 'pt'],
    ['Good morning everyone, are we still meeting?', 'en'],
    ['thanks, I will check it tomorrow', 'en'],
  ])('detects %s as %s', (text, lang) => {
    const r = detectByWords(text);
    expect(r?.language).toBe(lang);
    expect(r!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('returns null when there is no signal', () => {
    expect(detectByWords('Netflix Spotify')).toBeNull();
    expect(detectByWords('')).toBeNull();
  });
});

describe('detectByWords short chat phrases', () => {
  it.each(['achei bom', 'muito legal', 'gostei demais', 'beleza então', 'oi tudo bem'])('detects "%s" as pt', (text) => {
    expect(detectByWords(text)?.language).toBe('pt');
  });

  it.each(['nice one', 'love it', 'sounds great', 'see you soon'])('detects "%s" as en', (text) => {
    expect(detectByWords(text)?.language).toBe('en');
  });
});

describe('detectByWords word shapes and chat signals', () => {
  it.each([
    'Definitivamente menos bugado kkkkkkkkkk',
    'Daí acabava com a concorrência',
    'rapidamente resolvido',
    'tava pensando nisso ontem',
    'rsrs que coisa',
    'trabalhando em casa hoje',
    'ficou lindinho',
  ])('reads "%s" as pt', (text) => {
    expect(detectByWords(text)?.language).toBe('pt');
  });

  it.each([
    'Definitely less buggy lol',
    'working from home today',
    'that was really helpful',
    'the weather is nice',
    'what should we do tonight',
    'thinking about it',
  ])('reads "%s" as en', (text) => {
    expect(detectByWords(text)?.language).toBe('en');
  });
});

describe('detectByWords does not decide on weak evidence', () => {
  it.each(['no', 'no problem', 'a lot', 'avocado toast', 'Orlando trip', 'Colorado', 'ok', 'yes', 'to indo'])('stays undecided on "%s"', (text) => {
    expect(detectByWords(text)).toBeNull();
  });

  it('reads laughter as Portuguese', () => {
    expect(detectByWords('kkkkk que isso')?.language).toBe('pt');
  });
});

describe('detectByWords single typical words', () => {
  it.each(['valeu', 'beleza', 'sim', 'oi', 'obg', 'nossa', 'show de bola'])('reads "%s" as pt', (text) => {
    expect(detectByWords(text)?.language).toBe('pt');
  });

  it.each(['thanks', 'hello', 'awesome'])('reads "%s" as en', (text) => {
    expect(detectByWords(text)?.language).toBe('en');
  });
});

describe('detectByWords Spanish', () => {
  it.each(['hola amigo', 'muchas gracias', '¿cómo estás?', 'Pero yo no tengo tiempo hoy, mejor lo hacemos el lunes'])('reads "%s" as es', (text) => {
    const result = detectByWords(text);
    expect(result?.language).toBe('es');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it.each(['Bom dia pessoal, a reunião ainda está de pé?', 'Tudo certo', 'vamos para casa agora'])('keeps "%s" as pt', (text) => {
    expect(detectByWords(text)?.language).toBe('pt');
  });
});
