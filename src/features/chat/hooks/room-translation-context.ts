import { createContext } from 'react';
import type { IncomingAssessment } from '@lib/translation/incoming';
import type { TranslationMode } from '../utils/message-translation';

export interface RoomTranslation {
  mode: TranslationMode;
  reportAssessment: (messageId: string, timestamp: string, assessment: IncomingAssessment) => void;
  reportManualTranslation: (messageId: string) => void;
}

export const RoomTranslationContext = createContext<RoomTranslation>({
  mode: 'off',
  reportAssessment: () => undefined,
  reportManualTranslation: () => undefined,
});
