import { useCallback, useEffect, useState } from 'react';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import {
  getCachedIncoming,
  subscribeIncomingInvalidation,
  translateIncoming,
  type IncomingResult,
} from '@lib/translation/incoming';
import {
  hasText,
  resolveDisplayText,
  selectCurrentResult,
  shouldRequestTranslation,
  type FetchedTranslation,
} from '../utils/message-translation';

const NONE: IncomingResult = { status: 'none' };

interface MessageTranslationParams {
  roomId: string;
  messageId: string;
  field: 'content' | 'caption';
  text: string | null | undefined;
  enabled: boolean;
  isVisible: boolean;
}

interface MessageTranslation {
  text: string;
  result: IncomingResult;
  showingOriginal: boolean;
  toggleOriginal: () => void;
}

export function useMessageTranslation({ roomId, messageId, field, text, enabled, isVisible }: MessageTranslationParams): MessageTranslation {
  const { language } = useAppLanguage();
  const original = text ?? '';
  const active = enabled && hasText(text);
  // Identifies one request; in memory only. Any change (text, language, ids) supersedes the previous result and toggle.
  const key = [roomId, messageId, field, language, original].join('\u0000');

  const [fetched, setFetched] = useState<FetchedTranslation | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);
  const [invalidation, setInvalidation] = useState(0);

  const cached = active ? getCachedIncoming(roomId, messageId, field, language, original) : undefined;
  const current = selectCurrentResult({ active, key, fetched, cached });
  const result = current ?? NONE;
  const showingOriginal = toggledKey === key;
  const needsRequest = shouldRequestTranslation({ enabled, isVisible, text, current });
  const isPreparing = current?.status === 'preparing';

  useEffect(() => {
    if (!needsRequest) {
      return;
    }
    const controller = new AbortController();
    void translateIncoming({ roomId, messageId, field, text: original, target: language, signal: controller.signal }).then((next) => {
      // Aborted means superseded (left the screen, text/language changed, unmounted): its result is ignored.
      if (!controller.signal.aborted) {
        setFetched({ key, result: next });
      }
    });
    return () => controller.abort();
  }, [needsRequest, key, roomId, messageId, field, original, language, invalidation]);

  useEffect(() => {
    if (!isVisible || !isPreparing) {
      return;
    }
    return subscribeIncomingInvalidation(() => setInvalidation((count) => count + 1));
  }, [isVisible, isPreparing]);

  const toggleOriginal = useCallback(() => {
    setToggledKey((previous) => (previous === key ? null : key));
  }, [key]);

  return {
    text: resolveDisplayText({ original, result, showingOriginal }),
    result,
    showingOriginal,
    toggleOriginal,
  };
}
