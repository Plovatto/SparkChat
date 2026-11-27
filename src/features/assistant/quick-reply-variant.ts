import type { QuickReplyChoice } from '@lib/assistant/assistant-card';

export type QuickReplyVariant = 'primary' | 'tonal' | 'quiet';

const VARIANTS: Record<QuickReplyChoice, QuickReplyVariant> = {
  yes: 'primary',
  'send-now': 'primary',
  done: 'primary',
  another: 'tonal',
  undo: 'tonal',
  snooze10: 'tonal',
  snooze60: 'tonal',
  no: 'quiet',
  keep: 'quiet',
};

export function quickReplyVariant(choice: QuickReplyChoice): QuickReplyVariant {
  return VARIANTS[choice];
}
