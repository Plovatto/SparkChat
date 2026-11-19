import { useEffect, useRef } from 'react';
import { useOptionalCall } from '@features/calls';
import { onWorkerMessage } from '../lib/sw-registration';

export function PwaCallBridge() {
  const call = useOptionalCall();
  const callRef = useRef(call);
  callRef.current = call;

  useEffect(
    () =>
      onWorkerMessage((message) => {
        const current = callRef.current;
        if (message.type !== 'sparkchat:call-decline' || !current) {
          return;
        }
        const { state } = current.snapshot;
        if (state.phase === 'incoming-ringing' && state.callId === message.callId) {
          current.decline();
        }
      }),
    [],
  );

  return null;
}
