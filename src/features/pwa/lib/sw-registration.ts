import { isWorkerToClientMessage, SW_SCOPE, SW_SCRIPT_PATH, type ClientToWorkerMessage, type WorkerToClientMessage } from '../sw/protocol';

export const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

type ServiceWorkerHost = Pick<ServiceWorkerContainer, 'register' | 'addEventListener' | 'removeEventListener' | 'controller'>;

let updateAvailable = false;
const updateListeners = new Set<() => void>();
const messageListeners = new Set<(message: WorkerToClientMessage) => void>();

function setUpdateAvailable(value: boolean): void {
  updateAvailable = value;
  updateListeners.forEach((listener) => listener());
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}

export function subscribeUpdateAvailable(listener: () => void): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

export function dismissUpdate(): void {
  setUpdateAvailable(false);
}

export function onWorkerMessage(listener: (message: WorkerToClientMessage) => void): () => void {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
}

type WorkerContainer = Pick<ServiceWorkerContainer, 'controller' | 'ready'>;

export function postToWorker(message: ClientToWorkerMessage, container: WorkerContainer | null = defaultContainer()): void {
  if (!container) {
    return;
  }
  if (container.controller) {
    container.controller.postMessage(message);
    return;
  }
  void container.ready.then((registration) => registration.active?.postMessage(message)).catch(() => undefined);
}

function defaultContainer(): WorkerContainer | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null;
}

export interface RegisterOptions {
  container: ServiceWorkerHost;
  setInterval: (callback: () => void, ms: number) => unknown;
}

export async function registerServiceWorker({ container, setInterval }: RegisterOptions): Promise<ServiceWorkerRegistration | null> {
  const hadController = Boolean(container.controller);
  container.addEventListener('controllerchange', () => {
    if (hadController) {
      setUpdateAvailable(true);
    }
  });
  container.addEventListener('message', (event: MessageEvent) => {
    if (isWorkerToClientMessage(event.data)) {
      const message = event.data;
      messageListeners.forEach((listener) => listener(message));
    }
  });
  try {
    const registration = await container.register(SW_SCRIPT_PATH, { scope: SW_SCOPE, updateViaCache: 'none' });
    setInterval(() => {
      void registration.update().catch(() => undefined);
    }, SW_UPDATE_CHECK_INTERVAL_MS);
    return registration;
  } catch {
    return null;
  }
}

export function startServiceWorker(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  void registerServiceWorker({ container: navigator.serviceWorker, setInterval: (callback, ms) => window.setInterval(callback, ms) });
}

export function resetServiceWorkerStateForTests(): void {
  updateAvailable = false;
  updateListeners.clear();
  messageListeners.clear();
}
