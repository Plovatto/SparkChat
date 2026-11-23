import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveTranslationControl } from '@features/chat/utils/message-translation';
import type { Language } from '@lib/i18n/language';
import { resetDetectorForTests } from './detection';
import { assessIncoming, resetIncomingForTests } from './incoming';

async function offersTranslation(text: string, target: Language): Promise<boolean> {
  const assessment = await assessIncoming(text, target);
  const control = resolveTranslationControl({ current: undefined, cached: undefined, requested: false, autoPending: false, assessment, showingOriginal: false });
  return control === 'offer';
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).Translator = { availability: () => Promise.resolve('available') };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Translator;
  delete (globalThis as Record<string, unknown>).LanguageDetector;
  resetDetectorForTests();
  resetIncomingForTests();
});

const PORTUGUESE_SHORT = ['Tudo certooo', 'tudo certo', 'kkkk', 'kkkkkkk', 'blz', 'oi', 'oii', 'vlw', 'tmj', 'sim', 'beleza', 'bora', 'rsrs', 'ok', 'show', 'aham', 'pode ser', 'tô indo', 'Vamos nessa'];
const PORTUGUESE_LONG = [
  'Bom dia pessoal, a reunião ainda está de pé?',
  'vc vai hoje? to indo pra lá depois do trabalho',
  'Cheguei em casa agora, amanhã a gente conversa melhor sobre isso',
];
const NEUTRAL = ['😂😂😂', '👍', 'https://example.com/a/b', '12345', '10:30', '@maria', '...', '?!'];
const ENGLISH_SHORT = ['thanks', 'hello', 'good morning', 'see you soon', 'thank you so much'];
const ENGLISH_LONG = ['Good morning everyone, are we still meeting today?', 'I will check it tomorrow and let you know what happened'];
const SPANISH_SHORT = ['hola amigo', 'muchas gracias', '¿cómo estás?', 'buenas noches'];
const SPANISH_LONG = ['Hola, ¿cómo estás? Muchas gracias por todo, nos vemos mañana', 'Pero yo no tengo tiempo hoy, mejor lo hacemos el lunes'];
const ENGLISH_NEUTRAL_FOR_EN = ['ok', 'lol', 'hello', 'yes', 'cool'];

describe('translate button offer with the interface in Portuguese', () => {
  it.each([...PORTUGUESE_SHORT, ...PORTUGUESE_LONG, ...NEUTRAL])('does not offer for "%s"', async (text) => {
    expect(await offersTranslation(text, 'pt')).toBe(false);
  });

  it.each([...ENGLISH_SHORT, ...ENGLISH_LONG, ...SPANISH_SHORT, ...SPANISH_LONG])('offers for "%s"', async (text) => {
    expect(await offersTranslation(text, 'pt')).toBe(true);
  });
});

describe('translate button offer with the interface in English', () => {
  it.each([...ENGLISH_NEUTRAL_FOR_EN, ...ENGLISH_LONG, ...NEUTRAL])('does not offer for "%s"', async (text) => {
    expect(await offersTranslation(text, 'en')).toBe(false);
  });

  it.each(['Tudo certooo', 'oi', 'obrigado', 'bom dia', ...PORTUGUESE_LONG, ...SPANISH_SHORT, ...SPANISH_LONG])('offers for "%s"', async (text) => {
    expect(await offersTranslation(text, 'en')).toBe(true);
  });
});

describe('translate button offer for Spanish without a translator for it', () => {
  it('does not offer Spanish when no engine can translate it', async () => {
    delete (globalThis as Record<string, unknown>).Translator;
    expect(await offersTranslation('Hola, ¿cómo estás? Muchas gracias por todo', 'pt')).toBe(false);
  });
});

describe('translate button offer with a native detector that misreads short Portuguese', () => {
  it('does not trust a native Spanish verdict on short Portuguese text', async () => {
    (globalThis as Record<string, unknown>).LanguageDetector = {
      availability: () => Promise.resolve('available'),
      create: () => Promise.resolve({ detect: () => Promise.resolve([{ detectedLanguage: 'es', confidence: 0.8 }, { detectedLanguage: 'pt', confidence: 0.15 }]) }),
    };
    expect(await offersTranslation('Tudo certooo', 'pt')).toBe(false);
  });

  it('does not offer when the native detector is unsure', async () => {
    (globalThis as Record<string, unknown>).LanguageDetector = {
      availability: () => Promise.resolve('available'),
      create: () => Promise.resolve({ detect: () => Promise.resolve([{ detectedLanguage: 'pt', confidence: 0.4 }, { detectedLanguage: 'gl', confidence: 0.3 }]) }),
    };
    expect(await offersTranslation('Tudo certooo', 'pt')).toBe(false);
  });

  it('pt-BR from the native detector counts as the Portuguese interface', async () => {
    (globalThis as Record<string, unknown>).LanguageDetector = {
      availability: () => Promise.resolve('available'),
      create: () => Promise.resolve({ detect: () => Promise.resolve([{ detectedLanguage: 'pt-BR', confidence: 0.97 }]) }),
    };
    expect(await offersTranslation('Cheguei em casa agora, amanhã a gente conversa melhor sobre isso', 'pt')).toBe(false);
  });
});
