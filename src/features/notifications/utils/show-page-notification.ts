const SERVICE_WORKER_SCOPE = '/app/';

interface NotificationHost {
  createNotification: (title: string, options: NotificationOptions) => Notification;
  getRegistration: () => Promise<Pick<ServiceWorkerRegistration, 'showNotification'> | undefined>;
  focusWindow: () => void;
}

function defaultHost(): NotificationHost {
  return {
    createNotification: (title, options) => new Notification(title, options),
    getRegistration: () =>
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE)
        : Promise.resolve(undefined),
    focusWindow: () => window.focus(),
  };
}

export function showPageNotification(
  title: string,
  options: NotificationOptions,
  roomId: string,
  onClick: () => void,
  host: NotificationHost = defaultHost(),
): void {
  try {
    const notification = host.createNotification(title, options);
    notification.onclick = () => {
      host.focusWindow();
      onClick();
      notification.close();
    };
  } catch {
    void host
      .getRegistration()
      .then((registration) => registration?.showNotification(title, { ...options, data: { kind: 'msg', roomId } }))
      .catch(() => undefined);
  }
}
