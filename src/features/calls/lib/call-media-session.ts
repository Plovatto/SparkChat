export interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler: (action: string, handler: (() => void) | null) => void;
  setMicrophoneActive?: (active: boolean) => void;
}

export interface CallMediaSessionOptions {
  title: string;
  artist: string;
  muted: boolean;
  onHangup: () => void;
  onToggleMicrophone: () => void;
  onResume?: () => void;
}

export interface CallMediaSession {
  update: (options: CallMediaSessionOptions) => void;
  stop: () => void;
}

export type MetadataFactory = (init: { title: string; artist: string }) => unknown;

type CallAction = 'hangup' | 'togglemicrophone' | 'pause';

function browserSession(): MediaSessionLike | null {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return null;
  }
  return navigator.mediaSession as unknown as MediaSessionLike;
}

function browserMetadata(init: { title: string; artist: string }): unknown {
  return typeof MediaMetadata === 'undefined' ? null : new MediaMetadata(init);
}

export function startCallMediaSession(
  options: CallMediaSessionOptions,
  session: MediaSessionLike | null = browserSession(),
  createMetadata: MetadataFactory = browserMetadata,
): CallMediaSession {
  if (!session) {
    return { update: () => undefined, stop: () => undefined };
  }
  const registered = new Set<string>();
  let current = options;
  let stopped = false;

  const register = (action: CallAction, handler: () => void) => {
    try {
      session.setActionHandler(action, handler);
      registered.add(action);
    } catch {
      return;
    }
  };

  const apply = (next: CallMediaSessionOptions) => {
    current = next;
    try {
      session.metadata = createMetadata({ title: next.title, artist: next.artist });
    } catch {
      session.metadata = null;
    }
    session.playbackState = 'playing';
    try {
      session.setMicrophoneActive?.(!next.muted);
    } catch {
      return;
    }
  };

  register('hangup', () => current.onHangup());
  register('togglemicrophone', () => current.onToggleMicrophone());
  if (options.onResume) {
    register('pause', () => {
      session.playbackState = 'playing';
      current.onToggleMicrophone();
    });
  }
  apply(options);

  return {
    update: (next) => {
      if (!stopped) {
        apply(next);
      }
    },
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const action of registered) {
        try {
          session.setActionHandler(action, null);
        } catch {
          continue;
        }
      }
      registered.clear();
      session.metadata = null;
      session.playbackState = 'none';
    },
  };
}
