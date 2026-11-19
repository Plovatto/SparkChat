import { hasInviteFragment, parseInviteFragment, type InviteLinkTarget } from '@lib/e2ee/group-invite';

export type PendingInvite = InviteLinkTarget | 'invalid';

type InviteFragmentListener = () => void;

let pendingInvite: PendingInvite | null = null;
let installed = false;
const listeners = new Set<InviteFragmentListener>();

export function discardPendingInvite(): void {
  if (pendingInvite && pendingInvite !== 'invalid') {
    pendingInvite.secret.fill(0);
  }
  pendingInvite = null;
}

export function captureInviteFragment(): boolean {
  const { hash, pathname, search } = window.location;
  if (!hasInviteFragment(hash)) {
    return false;
  }
  window.history.replaceState(window.history.state, '', pathname + search);
  discardPendingInvite();
  pendingInvite = parseInviteFragment(hash) ?? 'invalid';
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

export function takePendingInvite(): PendingInvite | null {
  const invite = pendingInvite;
  pendingInvite = null;
  return invite;
}

export function subscribeInviteFragment(listener: InviteFragmentListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
