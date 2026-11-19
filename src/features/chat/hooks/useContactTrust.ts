import { useEffect, useSyncExternalStore } from 'react';
import {
  getContactTrust,
  getCurrentIdentity,
  lookupContactKey,
  subscribeContactTrust,
  subscribeCurrentIdentity,
  type ContactTrust,
} from '@lib/e2ee';
import { useSocket } from '@lib/socket';

export function useContactTrust(contactId: string | undefined): ContactTrust | null {
  const { socket, connected } = useSocket();
  const identity = useSyncExternalStore(subscribeCurrentIdentity, getCurrentIdentity, getCurrentIdentity);
  const trust = useSyncExternalStore(
    subscribeContactTrust,
    () => (contactId ? getContactTrust(contactId) : null),
    () => null,
  );
  const identityKey = identity?.publicKey;

  useEffect(() => {
    if (!contactId || !socket || !connected || !identityKey) {
      return;
    }
    void lookupContactKey(socket, contactId);
  }, [contactId, socket, connected, identityKey]);

  return trust;
}
