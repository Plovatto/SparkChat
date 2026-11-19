import { contactPinId, loadContactPin, saveContactPin, type ContactPin } from './key-store';
import { verifyKeyBinding, type PublishedKeyEntry } from './signing';

export type ContactTrustStatus = 'unverifiable' | 'unverified' | 'verified' | 'changed' | 'invalid';

export interface ContactTrust {
  contactId: string;
  status: ContactTrustStatus;
  pin: ContactPin | null;
}

export interface OwnIdentityRef {
  userId: string;
  publicKey: string;
}

type Listener = () => void;

const pinCache = new Map<string, ContactPin>();
const trustByContact = new Map<string, ContactTrust>();
const listeners = new Set<Listener>();
const queues = new Map<string, Promise<unknown>>();

export function isKeyUsable(status: ContactTrustStatus): boolean {
  return status !== 'changed' && status !== 'invalid';
}

export function getContactTrust(contactId: string): ContactTrust | null {
  return trustByContact.get(contactId) ?? null;
}

export function subscribeContactTrust(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(trust: ContactTrust): ContactTrust {
  trustByContact.set(trust.contactId, trust);
  for (const listener of Array.from(listeners)) {
    listener();
  }
  return trust;
}

function statusOfPin(pin: ContactPin): ContactTrustStatus {
  if (pin.pending) {
    return 'changed';
  }
  if (pin.verified) {
    return 'verified';
  }
  return pin.signingPublicKey ? 'unverified' : 'unverifiable';
}

async function readPin(own: OwnIdentityRef, contactId: string): Promise<ContactPin | null> {
  const id = contactPinId(own.userId, contactId);
  const cached = pinCache.get(id);
  if (cached) {
    return cached;
  }
  const stored = await loadContactPin(own.userId, contactId);
  if (stored) {
    pinCache.set(id, stored);
  }
  return stored;
}

async function writePin(pin: ContactPin): Promise<void> {
  pinCache.set(pin.id, pin);
  await saveContactPin(pin);
}

function serialize<T>(contactId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(contactId) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(contactId, next);
  return next;
}

async function observe(own: OwnIdentityRef, entry: PublishedKeyEntry): Promise<ContactTrust> {
  const contactId = entry.userId;
  const hasSigning = Boolean(entry.signingPublicKey || entry.keySignature);
  const bindingValid = hasSigning ? await verifyKeyBinding(entry) : null;
  if (bindingValid === false) {
    return publish({ contactId, status: 'invalid', pin: await readPin(own, contactId) });
  }
  const signingPublicKey = bindingValid ? (entry.signingPublicKey ?? null) : null;

  let pin = await readPin(own, contactId);
  if (!pin) {
    pin = {
      id: contactPinId(own.userId, contactId),
      ownerId: own.userId,
      contactId,
      publicKey: entry.publicKey,
      signingPublicKey,
      ownPublicKey: own.publicKey,
      verified: false,
      pinnedAt: Date.now(),
      pending: null,
    };
    await writePin(pin);
    return publish({ contactId, status: statusOfPin(pin), pin });
  }

  const sameKey = pin.publicKey === entry.publicKey;
  const sameSigning = pin.signingPublicKey === null ? true : pin.signingPublicKey === signingPublicKey;

  if (sameKey && sameSigning) {
    let next = pin;
    if (pin.signingPublicKey === null && signingPublicKey) {
      next = { ...next, signingPublicKey };
    }
    if (next.pending) {
      next = { ...next, pending: null };
    }
    if (next.verified && next.ownPublicKey !== own.publicKey) {
      next = { ...next, verified: false, ownPublicKey: own.publicKey };
    }
    if (next !== pin) {
      await writePin(next);
    }
    return publish({ contactId, status: statusOfPin(next), pin: next });
  }

  const next: ContactPin = { ...pin, pending: { publicKey: entry.publicKey, signingPublicKey, seenAt: Date.now() } };
  await writePin(next);
  return publish({ contactId, status: 'changed', pin: next });
}

export function observeContactKey(own: OwnIdentityRef, entry: PublishedKeyEntry): Promise<ContactTrust> {
  return serialize(entry.userId, () => observe(own, entry));
}

export function acceptContactKeyChange(own: OwnIdentityRef, contactId: string): Promise<ContactTrust | null> {
  return serialize(contactId, async () => {
    const pin = await readPin(own, contactId);
    if (!pin?.pending) {
      return getContactTrust(contactId);
    }
    const next: ContactPin = {
      ...pin,
      publicKey: pin.pending.publicKey,
      signingPublicKey: pin.pending.signingPublicKey,
      ownPublicKey: own.publicKey,
      verified: false,
      pinnedAt: Date.now(),
      pending: null,
      replacedSigningPublicKey: pin.signingPublicKey,
    };
    await writePin(next);
    return publish({ contactId, status: statusOfPin(next), pin: next });
  });
}

export function setContactVerified(own: OwnIdentityRef, contactId: string, verified: boolean): Promise<ContactTrust | null> {
  return serialize(contactId, async () => {
    const pin = await readPin(own, contactId);
    if (!pin || pin.pending) {
      return getContactTrust(contactId);
    }
    const next: ContactPin = { ...pin, verified, ownPublicKey: own.publicKey };
    await writePin(next);
    return publish({ contactId, status: statusOfPin(next), pin: next });
  });
}

export function resetContactTrustState(): void {
  pinCache.clear();
  trustByContact.clear();
  queues.clear();
  for (const listener of Array.from(listeners)) {
    listener();
  }
}
