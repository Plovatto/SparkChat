import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import {
  assessIncoming,
  getCachedIncoming,
  prepareTranslationOnGesture,
  subscribeIncomingInvalidation,
  translateIncoming,
  type IncomingAssessment,
  type IncomingResult,
} from '@lib/translation/incoming';
import {
  hasText,
  resolveDisplayText,
  resolveTranslationControl,
  selectCurrentResult,
  shouldRequestTranslation,
  shouldRetryOnInvalidation,
  type FetchedTranslation,
  type TranslationControl,
  type TranslationMode,
} from '../utils/message-translation';

const NONE: IncomingResult = { status: 'none' };

interface MessageTranslationParams {
  roomId: string;
  messageId: string;
  field: 'content' | 'caption';
  text: string | null | undefined;
  mode: TranslationMode;
  isVisible: boolean;
  onAssessed?: (assessment: IncomingAssessment) => void;
  onManualTranslation?: () => void;
}

interface MessageTranslation {
  text: string;
  result: IncomingResult;
  control: TranslationControl;
  toggleOriginal: () => void;
  requestTranslation: () => void;
}

export function useMessageTranslation({
  roomId,
  messageId,
  field,
  text,
  mode,
  isVisible,
  onAssessed,
  onManualTranslation,
}: MessageTranslationParams): MessageTranslation {
  const { language } = useAppLanguage();
  const original = text ?? '';
  const active = mode !== 'off' && hasText(text);
  const key = [roomId, messageId, field, language, original].join('\u0000');

  const [fetched, setFetched] = useState<FetchedTranslation | null>(null);
  const [assessed, setAssessed] = useState<{ key: string; assessment: IncomingAssessment } | null>(null);
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [toggledKey, setToggledKey] = useState<string | null>(null);
  const [invalidation, setInvalidation] = useState(0);

  const assessment = active && assessed?.key === key ? assessed.assessment : null;
  const assessedKey = assessed?.key ?? null;
  const requested = active && requestedKey === key;
  const cached = active ? getCachedIncoming(roomId, messageId, field, language, original) : undefined;
  const current = selectCurrentResult({ active, key, fetched, cached });
  const result = current ?? NONE;
  const showingOriginal = toggledKey === key;
  const needsRequest = shouldRequestTranslation({ mode, requested, isVisible, text: active ? text : null, current, assessment });
  const control = active
    ? resolveTranslationControl({ current, cached, requested, autoPending: needsRequest && !requested, assessment, showingOriginal })
    : 'none';
  const needsRequestRef = useRef(needsRequest);
  const retryOnInvalidation = shouldRetryOnInvalidation({ current, cached });
  const retryOnInvalidationRef = useRef(retryOnInvalidation);
  const onAssessedRef = useRef(onAssessed);
  const onManualTranslationRef = useRef(onManualTranslation);

  useEffect(() => {
    needsRequestRef.current = needsRequest;
    retryOnInvalidationRef.current = retryOnInvalidation;
    onAssessedRef.current = onAssessed;
    onManualTranslationRef.current = onManualTranslation;
  }, [needsRequest, retryOnInvalidation, onAssessed, onManualTranslation]);

  useEffect(() => {
    if (!active || !isVisible || assessedKey === key) {
      return;
    }
    let cancelled = false;
    void assessIncoming(original, language).then((next) => {
      if (!cancelled) {
        setAssessed({ key, assessment: next });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [active, isVisible, assessedKey, key, original, language]);

  useEffect(() => {
    if (assessment !== null) {
      onAssessedRef.current?.(assessment);
    }
  }, [assessment]);

  const manuallyTranslated = requested && result.status === 'translated';
  useEffect(() => {
    if (manuallyTranslated) {
      onManualTranslationRef.current?.();
    }
  }, [manuallyTranslated]);

  useEffect(() => {
    if (!needsRequest) {
      return;
    }
    const controller = new AbortController();
    void translateIncoming({ roomId, messageId, field, text: original, target: language, signal: controller.signal, explicit: requested }).then(
      (next) => {
        if (!controller.signal.aborted) {
          setFetched({ key, result: next });
        }
      },
    );
    return () => controller.abort();
  }, [needsRequest, requested, key, roomId, messageId, field, original, language, invalidation]);

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

  const wasVisibleRef = useRef(isVisible);
  useEffect(() => {
    const becameVisible = isVisible && !wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    if (becameVisible && retryOnInvalidationRef.current && !needsRequestRef.current) {
      setFetched(null);
    }
  }, [isVisible]);

  const toggleOriginal = useCallback(() => {
    setToggledKey((previous) => (previous === key ? null : key));
  }, [key]);

  const requestTranslation = useCallback(() => {
    prepareTranslationOnGesture(language);
    setFetched(null);
    setToggledKey(null);
    setRequestedKey(key);
  }, [key, language]);

  return {
    text: resolveDisplayText({ original, result, showingOriginal }),
    result,
    control,
    toggleOriginal,
    requestTranslation,
  };
}
