import { hasInviteFragment } from '@lib/e2ee/group-invite';

type InviteFragmentListener = () => void;

let pendingFragment: string | null = null;
let installed = false;
const listeners = new Set<InviteFragmentListener>();

export function captureInviteFragment(): boolean {
  const { hash, pathname, search } = window.location;
  if (!hasInviteFragment(hash)) {
    return false;
  }
  window.history.replaceState(window.history.state, '', pathname + search);
  pendingFragment = hash;
  for (const listener of Array.from(listeners)) {
    listener();
  }
  return true;
}

export function installInviteFragmentCapture(): void {
  captureInviteFragment();
  if (installed) {
    return;
  }
  installed = true;
  window.addEventListener('hashchange', () => {
    captureInviteFragment();
  });
}

export function takeInviteFragment(): string | null {
  const fragment = pendingFragment;
  pendingFragment = null;
  return fragment;
}

export function subscribeInviteFragment(listener: InviteFragmentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
