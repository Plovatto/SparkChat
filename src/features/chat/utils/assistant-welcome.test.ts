import { describe, expect, it } from 'vitest';
import enApp from '@/locales/en/app.json';
import ptApp from '@/locales/pt/app.json';
import { localizeAssistantWelcome } from './assistant-welcome';

const PT_WELCOME =
  'Oi! Eu sou o SparkAI 🤖✨ Bato papo e também te dou uma mão de verdade: troco seu tema, anoto, te lembro das coisas e muito mais. Dá uma olhada no que eu sei fazer 👇';
const EN_WELCOME =
  "Hi! I'm SparkAI 🤖✨ I chat and I also lend a real hand: I change your theme, take notes, remind you of things and more. Take a look at what I can do 👇";
const PT_LEGACY = 'Oi! Eu sou o SparkAI 🤖 — apareci aqui só pra gente trocar ideia. Manda o que quiser, é só um papo!';

describe('localizeAssistantWelcome', () => {
  it('shows the welcome in the current language', () => {
    expect(localizeAssistantWelcome(PT_WELCOME, 'en')).toBe(EN_WELCOME);
    expect(localizeAssistantWelcome(EN_WELCOME, 'pt')).toBe(PT_WELCOME);
    expect(localizeAssistantWelcome(`  ${PT_WELCOME}\n`, 'pt')).toBe(PT_WELCOME);
  });

  it('still localizes the previous welcome stored in existing rooms', () => {
    expect(localizeAssistantWelcome(PT_LEGACY, 'en')).toBe(EN_WELCOME);
  });

  it('leaves any other message alone', () => {
    expect(localizeAssistantWelcome('Oi! Eu sou o SparkAI', 'en')).toBeNull();
  });

  it('keeps the locale strings identical to the API welcome texts', () => {
    expect(ptApp.chat.assistant.welcome).toBe(PT_WELCOME);
    expect(enApp.chat.assistant.welcome).toBe(EN_WELCOME);
  });
});
