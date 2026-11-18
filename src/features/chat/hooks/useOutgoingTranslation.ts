import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { oppositeLanguage, type Language } from '@lib/i18n/language';
import { usePersistedIdSet } from '@lib/storage';
import {
  resolveEngine,
  subscribeIncomingInvalidation,
  translatePreservingSegments,
  type EngineRoute,
  type TranslationSupport,
} from '@lib/translation';
import {
  createOutgoingDraftTranslator,
  IDLE_OUTGOING_DRAFT,
  type OutgoingDraftState,
  type OutgoingDraftTranslator,
  type OutgoingSendResult,
} from './outgoing-draft';
import { AutoTranslateContext } from './useAutoTranslatePreference';

export interface OutgoingTranslation {
  isRequested: boolean;
  isEnabled: boolean;
  support: TranslationSupport;
  toggle: () => void;
  target: Language;
  state: OutgoingDraftState;
  resolveForSend: (text: string) => Promise<OutgoingSendResult>;
}

function isUsable(support: TranslationSupport): boolean {
  return support !== 'unavailable' && support !== 'failed';
}

async function translateOutgoing(text: string, source: Language, target: Language): Promise<string> {
  const route = await resolveEngine(source, target);
  if (!route || !isUsable(route.support)) {
    throw new Error('translate-failed');
  }
  return translatePreservingSegments(text, (chunk) => route.engine.translate(chunk, source, target, { priority: 0 }));
}

export function useOutgoingTranslation(roomId: string, userId: string, draft: string, available = true): OutgoingTranslation {
  const autoTranslate = useContext(AutoTranslateContext) && available;
  const { language: source } = useAppLanguage();
  const target = oppositeLanguage(source);
  const { ids, toggle: toggleIds } = usePersistedIdSet(`outgoingTranslation:${userId}`);
  const [route, setRoute] = useState<{ pair: string; route: EngineRoute | null } | null>(null);
  const [routeVersion, setRouteVersion] = useState(0);
  const [state, setState] = useState<OutgoingDraftState>(IDLE_OUTGOING_DRAFT);
  const translatorRef = useRef<OutgoingDraftTranslator | null>(null);
  const pair = `${source}-${target}`;

  useEffect(() => {
    if (!autoTranslate) {
      return;
    }
    let cancelled = false;
    void resolveEngine(source, target).then((resolved) => {
      if (!cancelled) {
        setRoute({ pair, route: resolved });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [autoTranslate, source, target, pair, routeVersion]);

  useEffect(() => {
    if (!autoTranslate) {
      return;
    }
    return subscribeIncomingInvalidation(() => setRouteVersion((version) => version + 1));
  }, [autoTranslate]);

  const currentRoute = autoTranslate && route?.pair === pair ? route.route : null;
  const support: TranslationSupport = currentRoute?.support ?? 'unavailable';
  const isOnForRoom = ids.has(roomId);
  const isRequested = autoTranslate && isOnForRoom;
  const isEnabled = isRequested && isUsable(support);
  const isRoutePending = support === 'downloadable' || support === 'downloading';

  useEffect(() => {
    if (isRoutePending && state.status === 'ready') {
      setRouteVersion((version) => version + 1);
    }
  }, [isRoutePending, state.status]);

  const engineId = currentRoute?.engine.id;
  const previousEngineId = useRef(engineId);
  useEffect(() => {
    if (previousEngineId.current !== undefined && engineId !== undefined && engineId !== previousEngineId.current) {
      translatorRef.current?.retryFailed();
    }
    previousEngineId.current = engineId;
  }, [engineId]);

  useEffect(() => {
    const translator = createOutgoingDraftTranslator((text) => translateOutgoing(text, source, target));
    translatorRef.current = translator;
    const unsubscribe = translator.subscribe(setState);
    return () => {
      unsubscribe();
      translator.dispose();
      if (translatorRef.current === translator) {
        translatorRef.current = null;
      }
      setState(IDLE_OUTGOING_DRAFT);
    };
  }, [roomId, source, target]);

  useEffect(() => {
    translatorRef.current?.update(isEnabled ? draft.trim() : '');
  }, [draft, isEnabled, roomId, source, target]);

  const toggle = useCallback(() => {
    if (isOnForRoom) {
      translatorRef.current?.cancelPendingSends();
    }
    if (!isOnForRoom && currentRoute && isUsable(currentRoute.support)) {
      const refresh = () => setRouteVersion((version) => version + 1);
      currentRoute.engine.prepare(source, target).then(refresh, refresh);
      if (currentRoute.support === 'downloadable') {
        setRoute({ pair, route: { ...currentRoute, support: 'downloading' } });
      }
    }
    toggleIds([roomId]);
  }, [isOnForRoom, currentRoute, source, target, pair, toggleIds, roomId]);

  const resolveForSend = useCallback((text: string): Promise<OutgoingSendResult> => {
    const translator = translatorRef.current;
    if (!translator) {
      return Promise.reject(new Error('outgoing-draft-disposed'));
    }
    return translator.resolveForSend(text);
  }, []);

  return { isRequested, isEnabled, support, toggle, target, state, resolveForSend };
}
