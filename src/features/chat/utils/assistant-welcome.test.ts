import { describe, expect, it } from 'vitest';
import enApp from '@/locales/en/app.json';
import ptApp from '@/locales/pt/app.json';
import { localizeAssistantWelcome } from './assistant-welcome';

// Literals copied from AI_WELCOME_MESSAGES in API-SparkChat/src/modules/ai/ai.model.ts.
const PT_WELCOME = 'Oi! Eu sou o SparkAI 🤖 — apareci aqui só pra gente trocar ideia. Manda o que quiser, é só um papo!';
const EN_WELCOME = "Hi! I'm SparkAI 🤖 — I'm here just to chat. Send me anything, no pressure!";

describe('localizeAssistantWelcome', () => {
  it('shows the welcome in the current language', () => {
    expect(localizeAssistantWelcome(PT_WELCOME, 'en')).toBe(EN_WELCOME);
    expect(localizeAssistantWelcome(EN_WELCOME, 'pt')).toBe(PT_WELCOME);
    expect(localizeAssistantWelcome(`  ${PT_WELCOME}\n`, 'pt')).toBe(PT_WELCOME);
  });

  it('leaves any other message alone', () => {
    expect(localizeAssistantWelcome('Oi! Eu sou o SparkAI', 'en')).toBeNull();
  });

  it('keeps the locale strings identical to the API welcome texts', () => {
    expect(ptApp.chat.assistant.welcome).toBe(PT_WELCOME);
    expect(enApp.chat.assistant.welcome).toBe(EN_WELCOME);
  });
});
