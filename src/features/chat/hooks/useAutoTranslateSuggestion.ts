import { useCallback, useRef, useState } from 'react';
import type { IncomingAssessment } from '@lib/translation/incoming';
import { isSuggestionTriggered } from '../utils/auto-translate-suggestion';

interface RoomSignals {
  assessments: Map<string, { timestamp: string; assessment: IncomingAssessment }>;
  manual: Set<string>;
}

export interface AutoTranslateSuggestion {
  triggered: boolean;
  reportAssessment: (messageId: string, timestamp: string, assessment: IncomingAssessment) => void;
  reportManualTranslation: (messageId: string) => void;
}

function orderedAssessments(signals: RoomSignals): IncomingAssessment[] {
  return [...signals.assessments.values()]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .map((entry) => entry.assessment);
}

export function useAutoTranslateSuggestion(roomId: string | null): AutoTranslateSuggestion {
  const signalsRef = useRef(new Map<string, RoomSignals>());
  const [triggeredRooms, setTriggeredRooms] = useState<ReadonlySet<string>>(() => new Set());

  const signalsFor = useCallback((id: string): RoomSignals => {
    let signals = signalsRef.current.get(id);
    if (!signals) {
      signals = { assessments: new Map(), manual: new Set() };
      signalsRef.current.set(id, signals);
    }
    return signals;
  }, []);

  const evaluate = useCallback((id: string, signals: RoomSignals) => {
    if (!isSuggestionTriggered({ manualCount: signals.manual.size, assessments: orderedAssessments(signals) })) {
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
      if (signals.assessments.get(messageId)?.assessment === assessment) {
        return;
      }
      signals.assessments.set(messageId, { timestamp, assessment });
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
