import { useCallback, useEffect, useState } from 'react';
import { useSocket, type PushConfigPayload, type SocketErrorPayload } from '@lib/socket';
import { needsIosInstall } from '../lib/install-state';
import {
  currentNotificationPermission,
  disablePush,
  enablePushFromGesture,
  getServiceWorkerRegistration,
  isPushSupported,
  PushSetupError,
  requestPushConfig,
  storedPushEndpoint,
  subscribePushState,
  type PushErrorCode,
} from '../lib/push-subscription';
import { useInstallState } from './useInstallState';

export type PushStatus = 'unsupported' | 'ios-needs-install' | 'checking' | 'server-disabled' | 'blocked' | 'on' | 'off';

export interface PushNotificationsState {
  status: PushStatus;
  busy: boolean;
  error: PushErrorCode | null;
  serverError: SocketErrorPayload | null;
  permission: NotificationPermission;
  enable: () => Promise<NotificationPermission>;
  disable: () => Promise<void>;
}

export interface PushStatusInput {
  isIos: boolean;
  isStandalone: boolean;
  supported: boolean;
  permission: NotificationPermission;
  config: PushConfigPayload | null;
  subscribed: boolean;
}

export function resolvePushStatus(input: PushStatusInput): PushStatus {
  if (needsIosInstall(input)) {
    return 'ios-needs-install';
  }
  if (!input.supported) {
    return 'unsupported';
  }
  if (input.permission === 'denied') {
    return 'blocked';
  }
  if (input.config === null) {
    return 'checking';
  }
  if (!input.config.enabled) {
    return 'server-disabled';
  }
  return input.subscribed && input.permission === 'granted' ? 'on' : 'off';
}

export function usePushNotifications(): PushNotificationsState {
  const { socket, connected } = useSocket();
  const install = useInstallState();
  const supported = isPushSupported();
  const [config, setConfig] = useState<PushConfigPayload | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(currentNotificationPermission);
  const [subscribed, setSubscribed] = useState(() => storedPushEndpoint() !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PushErrorCode | null>(null);
  const [serverError, setServerError] = useState<SocketErrorPayload | null>(null);

  useEffect(() => {
    if (!socket || !connected || !supported) {
      return;
    }
    let active = true;
    void requestPushConfig(socket).then((value) => {
      if (active) {
        setConfig(value);
      }
    });
    return () => {
      active = false;
    };
  }, [socket, connected, supported]);

  useEffect(
    () =>
      subscribePushState(() => {
        setSubscribed(storedPushEndpoint() !== null);
        setPermission(currentNotificationPermission());
      }),
    [],
  );

  const enable = useCallback((): Promise<NotificationPermission> => {
    if (!socket || !supported) {
      return Promise.resolve(currentNotificationPermission());
    }
    setError(null);
    setServerError(null);
    setBusy(true);
    return enablePushFromGesture(socket, requestPushConfig(socket), {
      getRegistration: () => getServiceWorkerRegistration(),
      requestPermission: () => Notification.requestPermission(),
      currentPermission: currentNotificationPermission,
    })
      .then((result) => {
        setPermission(result.permission);
        return result.permission;
      })
      .catch((reason: unknown) => {
        setError(reason instanceof PushSetupError ? reason.code : 'subscribe-failed');
        setServerError(reason instanceof PushSetupError ? reason.serverError : null);
        setPermission(currentNotificationPermission());
        return currentNotificationPermission();
      })
      .finally(() => setBusy(false));
  }, [socket, supported]);

  const disable = useCallback((): Promise<void> => {
    setError(null);
    setServerError(null);
    setBusy(true);
    return disablePush(socket).finally(() => setBusy(false));
  }, [socket]);

  const status = resolvePushStatus({ isIos: install.isIos, isStandalone: install.isStandalone, supported, permission, config, subscribed });

  return { status, busy, error, serverError, permission, enable, disable };
}
