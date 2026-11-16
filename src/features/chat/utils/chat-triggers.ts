import type { MessageView } from '@lib/socket';

export type ChatTrigger = 'confetti' | 'lightning' | 'wind' | 'rain' | 'sun';

export interface ChatTriggerMatch {
  type: ChatTrigger;
  intensity?: number;
}

const TRIGGER_RULES: Array<{ type: ChatTrigger; pattern: RegExp; intensity?: number }> = [
  { type: 'confetti', pattern: /parab[eé]ns|\bcongrat(s|ulations)\b|🎉/iu },
  { type: 'lightning', pattern: /\braios\b|\blightnings\b/iu, intensity: 3 },
  { type: 'lightning', pattern: /\braio\b|\blightning\b|⚡/iu, intensity: 1 },
  { type: 'wind', pattern: /\bvento\b|\bwind\b|🌬️|💨/iu },
  { type: 'rain', pattern: /\bchuva\b|\brain\b|🌧️/iu },
  { type: 'sun', pattern: /\bsol\b|\bsun\b|☀️/iu },
];

export function detectChatTrigger(message: MessageView): ChatTriggerMatch | null {
  if (message.type !== 'text' || message.deletedForEveryone) {
    return null;
  }

  const rule = TRIGGER_RULES.find(({ pattern }) => pattern.test(message.content));
  if (!rule) {
    return null;
  }

  return { type: rule.type, intensity: rule.intensity };
}
