import { useCallback, useEffect, useRef, useState } from 'react';
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
  shouldRetryOnInvalidation,
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
  const key = [roomId, messageId, field, language, original].join('\u0000');

  const [fetched, setFetched] = useState<FetchedTranslation | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);
  const [invalidation, setInvalidation] = useState(0);

  const cached = active ? getCachedIncoming(roomId, messageId, field, language, original) : undefined;
  const current = selectCurrentResult({ active, key, fetched, cached });
  const result = current ?? NONE;
  const showingOriginal = toggledKey === key;
  const needsRequest = shouldRequestTranslation({ enabled, isVisible, text, current });
  const needsRequestRef = useRef(needsRequest);
  const retryOnInvalidation = shouldRetryOnInvalidation({ current, cached });
  const retryOnInvalidationRef = useRef(retryOnInvalidation);

  useEffect(() => {
    needsRequestRef.current = needsRequest;
    retryOnInvalidationRef.current = retryOnInvalidation;
  }, [needsRequest, retryOnInvalidation]);

  useEffect(() => {
    if (!needsRequest) {
      return;
    }
    const controller = new AbortController();
    void translateIncoming({ roomId, messageId, field, text: original, target: language, signal: controller.signal }).then((next) => {
      if (!controller.signal.aborted) {
        setFetched({ key, result: next });
      }
    });
    return () => controller.abort();
  }, [needsRequest, key, roomId, messageId, field, original, language, invalidation]);

  useEffect(() => {
    if (!isVisible || !active) {
      return;
    }
    return subscribeIncomingInvalidation(() => {
      if (needsRequestRef.current) {
        setInvalidation((count) => count + 1);
      } else if (retryOnInvalidationRef.current) {
        setFetched(null);
      }
    });
  }, [isVisible, active]);

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
