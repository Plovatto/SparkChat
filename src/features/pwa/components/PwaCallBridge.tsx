import { useEffect } from 'react';
import { queueNotificationCallAction } from '@features/calls';
import { takePendingAnswer } from '../lib/launch-params';
import { onWorkerMessage } from '../lib/sw-registration';

export function PwaCallBridge() {
  useEffect(() => {
    const answerCallId = takePendingAnswer();
    if (answerCallId) {
      queueNotificationCallAction({ type: 'answer', callId: answerCallId });
    }
  }, []);

  useEffect(
    () =>
      onWorkerMessage((message) => {
        if (message.type === 'sparkchat:call-decline') {
          queueNotificationCallAction({ type: 'decline', callId: message.callId });
        } else if (message.type === 'sparkchat:open-room' && message.callId) {
          queueNotificationCallAction({ type: 'answer', callId: message.callId });
        }
      }),
    [],
  );

  return null;
}
