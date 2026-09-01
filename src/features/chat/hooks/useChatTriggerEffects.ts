import { useEffect, useRef } from 'react';
import { useSocket, type MessageView } from '@lib/socket';
import { detectChatTrigger, type ChatTriggerMatch } from '../utils/chat-triggers';
import { launchConfetti } from '../utils/launch-confetti';
import { launchLightning } from '../utils/launch-lightning';
import { launchRain } from '../utils/launch-rain';
import { launchSun } from '../utils/launch-sun';
import { launchWind } from '../utils/launch-wind';
import { playCelebrationSound } from '../utils/play-celebration-sound';
import { playRainSound } from '../utils/play-rain-sound';
import { playSunSound } from '../utils/play-sun-sound';
import { playThunderSound } from '../utils/play-thunder-sound';
import { playWindSound } from '../utils/play-wind-sound';

function runTriggerEffect(match: ChatTriggerMatch): void {
  switch (match.type) {
    case 'confetti':
      launchConfetti();
      playCelebrationSound();
      break;
    case 'lightning': {
      const boltCount = match.intensity ?? 1;
      launchLightning(boltCount);
      playThunderSound(boltCount);
      break;
    }
    case 'wind':
      launchWind();
      playWindSound();
      break;
    case 'rain':
      launchRain();
      playRainSound();
      break;
    case 'sun':
      launchSun();
      playSunSound();
      break;
  }
}

function isViewingNow(): boolean {
  return document.hasFocus() && document.visibilityState === 'visible';
}

export function useChatTriggerEffects(selectedRoomId: string | null, currentUserId: string | undefined): void {
  const { socket } = useSocket();
  const pendingByRoomRef = useRef<Map<string, ChatTriggerMatch>>(new Map());
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleMessageNew = (message: MessageView) => {
      const trigger = detectChatTrigger(message);
      if (!trigger) {
        return;
      }

      const isOwnMessage = message.sender.id === currentUserId;
      const isSelectedRoom = message.roomId === selectedRoomIdRef.current;

      if (isOwnMessage || (isSelectedRoom && isViewingNow())) {
        runTriggerEffect(trigger);
        return;
      }

      pendingByRoomRef.current.set(message.roomId, trigger);
    };

    socket.on('message:new', handleMessageNew);
    return () => {
      socket.off('message:new', handleMessageNew);
    };
  }, [socket, currentUserId]);

  useEffect(() => {
    if (!selectedRoomId) {
      return;
    }

    const pendingTrigger = pendingByRoomRef.current.get(selectedRoomId);
    if (pendingTrigger) {
      pendingByRoomRef.current.delete(selectedRoomId);
      runTriggerEffect(pendingTrigger);
    }
  }, [selectedRoomId]);

  useEffect(() => {
    const handleFocusOrVisible = () => {
      const roomId = selectedRoomIdRef.current;
      if (!roomId || !isViewingNow()) {
        return;
      }

      const pendingTrigger = pendingByRoomRef.current.get(roomId);
      if (pendingTrigger) {
        pendingByRoomRef.current.delete(roomId);
        runTriggerEffect(pendingTrigger);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, []);
}
