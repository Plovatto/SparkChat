import { useCallback, useEffect, useRef, useState } from 'react';
import type { IncomingAssessment } from '@lib/translation/incoming';
import { isSuggestionTriggered, recordAssessment, type RecordedAssessment } from '../utils/auto-translate-suggestion';

interface RoomSignals {
  assessments: RecordedAssessment[];
  manual: Set<string>;
}

export interface AutoTranslateSuggestion {
  triggered: boolean;
  reportAssessment: (messageId: string, timestamp: string, assessment: IncomingAssessment) => void;
  reportManualTranslation: (messageId: string) => void;
}

export function useAutoTranslateSuggestion(roomId: string | null, roomIds: string[]): AutoTranslateSuggestion {
  const signalsRef = useRef(new Map<string, RoomSignals>());
  const [triggeredRooms, setTriggeredRooms] = useState<ReadonlySet<string>>(() => new Set());
  const roomIdsKey = roomIds.join('\u0000');

  useEffect(() => {
    const known = new Set(roomIdsKey.split('\u0000'));
    for (const id of [...signalsRef.current.keys()]) {
      if (!known.has(id)) {
        signalsRef.current.delete(id);
      }
    }
    setTriggeredRooms((previous) => {
      const kept = [...previous].filter((id) => known.has(id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, [roomIdsKey]);

  const signalsFor = useCallback((id: string): RoomSignals => {
    let signals = signalsRef.current.get(id);
    if (!signals) {
      signals = { assessments: [], manual: new Set() };
      signalsRef.current.set(id, signals);
    }
    return signals;
  }, []);

  const evaluate = useCallback((id: string, signals: RoomSignals) => {
    const assessments = signals.assessments.map((entry) => entry.assessment);
    if (!isSuggestionTriggered({ manualCount: signals.manual.size, assessments })) {
      return;
    }
    setTriggeredRooms((previous) => (previous.has(id) ? previous : new Set(previous).add(id)));
  }, []);

  const reportAssessment = useCallback(
    (messageId: string, timestamp: string, assessment: IncomingAssessment) => {
      if (!roomId || assessment === 'skip') {
        return;
      }
      const signals = signalsFor(roomId);
      if (signals.assessments.some((entry) => entry.messageId === messageId && entry.assessment === assessment)) {
        return;
      }
      signals.assessments = recordAssessment(signals.assessments, { messageId, timestamp, assessment });
      evaluate(roomId, signals);
    },
    [roomId, signalsFor, evaluate],
  );

  const reportManualTranslation = useCallback(
    (messageId: string) => {
      if (!roomId) {
        return;
      }
      const signals = signalsFor(roomId);
      if (signals.manual.has(messageId)) {
        return;
      }
      signals.manual.add(messageId);
      evaluate(roomId, signals);
    },
    [roomId, signalsFor, evaluate],
  );

  return { triggered: roomId !== null && triggeredRooms.has(roomId), reportAssessment, reportManualTranslation };
}
