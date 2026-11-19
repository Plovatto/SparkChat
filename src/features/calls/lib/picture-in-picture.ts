export type PipMode = 'document' | 'video' | null;

export interface DocumentPipHost {
  requestWindow: (options?: { width?: number; height?: number; disallowReturnToOpener?: boolean; preferInitialWindowPlacement?: boolean }) => Promise<Window>;
  window: Window | null;
}

export interface PipEnvironment {
  documentPictureInPicture?: DocumentPipHost;
  pictureInPictureEnabled?: boolean;
  videoPip?: boolean;
}

export function browserPipEnvironment(): PipEnvironment {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {};
  }
  const host = (window as Window & { documentPictureInPicture?: DocumentPipHost }).documentPictureInPicture;
  return {
    ...(host && typeof host.requestWindow === 'function' ? { documentPictureInPicture: host } : {}),
    pictureInPictureEnabled: document.pictureInPictureEnabled === true,
    videoPip: typeof HTMLVideoElement !== 'undefined' && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function',
  };
}

export function pipMode(environment: PipEnvironment = browserPipEnvironment()): PipMode {
  if (environment.documentPictureInPicture) {
    return 'document';
  }
  if (environment.pictureInPictureEnabled && environment.videoPip) {
    return 'video';
  }
  return null;
}

export const PIP_WINDOW_SIZE = { width: 320, height: 240 } as const;

export function copyStyles(source: Document, target: Document): void {
  for (const node of Array.from(source.querySelectorAll('style, link[rel="stylesheet"]'))) {
    target.head.appendChild(node.cloneNode(true));
  }
  target.documentElement.setAttribute('style', source.documentElement.getAttribute('style') ?? '');
  target.documentElement.setAttribute('data-theme', source.documentElement.getAttribute('data-theme') ?? '');
  target.documentElement.lang = source.documentElement.lang;
}

type ActionHandler = (() => void) | null;

export interface MediaSessionLike {
  setActionHandler: (action: string, handler: ActionHandler) => void;
}

export function registerAutoPip(handler: () => void, session: MediaSessionLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator.mediaSession as unknown as MediaSessionLike | undefined)): () => void {
  if (!session || typeof session.setActionHandler !== 'function') {
    return () => undefined;
  }
  try {
    session.setActionHandler('enterpictureinpicture', handler);
  } catch {
    return () => undefined;
  }
  return () => {
    try {
      session.setActionHandler('enterpictureinpicture', null);
    } catch {
      return;
    }
  };
}
