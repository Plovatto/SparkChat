import { useEffect, useRef } from 'react';

interface Owner {
  close: () => void;
  sticky: boolean;
}

interface Entry {
  id: number;
  owner: Owner | null;
}

let entries: Entry[] = [];
let pending: Owner[] = [];
const stickyOwners = new Set<Owner>();
let nextId = 0;
let flushQueued = false;
let listening = false;

function currentState(): Record<string, unknown> {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
}

function pushEntry(owner: Owner | null) {
  nextId += 1;
  entries.push({ id: nextId, owner });
  window.history.pushState({ ...currentState(), scLayer: nextId }, '');
}

function hasLiveNonSticky(): boolean {
  return entries.some((entry) => entry.owner !== null && !entry.owner.sticky);
}

function flush() {
  flushQueued = false;
  const queued = pending.reverse();
  pending = [];
  const armed = new Set(entries.map((entry) => entry.owner));
  const stickyToArm = hasLiveNonSticky()
    ? []
    : [...stickyOwners].filter((owner) => !armed.has(owner) && !queued.includes(owner));
  const nonStickyBelow = hasLiveNonSticky();
  const toAdd = [...stickyToArm, ...queued.filter((owner) => !(owner.sticky && nonStickyBelow))];

  let runStart = entries.length;
  while (runStart > 0 && entries[runStart - 1]?.owner === null) {
    runStart -= 1;
  }
  let added = 0;
  let index = runStart;
  while (index < entries.length && added < toAdd.length) {
    const entry = entries[index];
    const owner = toAdd[added];
    if (entry && owner) {
      entry.owner = owner;
    }
    index += 1;
    added += 1;
  }
  const leftoverStale = entries.length - index;
  if (leftoverStale > 0) {
    entries = entries.slice(0, index);
    window.history.go(-leftoverStale);
    return;
  }
  toAdd.slice(added).forEach((owner) => pushEntry(owner));
}

function schedule() {
  if (flushQueued) {
    return;
  }
  flushQueued = true;
  queueMicrotask(flush);
}

function handlePopState(event: PopStateEvent) {
  const state = event.state as { scLayer?: unknown } | null;
  const depth = typeof state?.scLayer === 'number' ? state.scLayer : 0;
  const closing: Entry[] = [];
  let top = entries[entries.length - 1];
  while (top && top.id > depth) {
    closing.push(entries.pop() as Entry);
    top = entries[entries.length - 1];
  }
  closing.forEach((entry) => entry.owner?.close());
  schedule();
}

function ensureListener() {
  if (!listening) {
    window.addEventListener('popstate', handlePopState);
    listening = true;
  }
}

function acquire(owner: Owner) {
  ensureListener();
  if (owner.sticky) {
    stickyOwners.add(owner);
  }
  pending.push(owner);
  schedule();
}

function release(owner: Owner) {
  pending = pending.filter((candidate) => candidate !== owner);
  stickyOwners.delete(owner);
  const entry = entries.find((candidate) => candidate.owner === owner);
  if (entry) {
    entry.owner = null;
  }
  schedule();
}

export function useBackLayer(isOpen: boolean, onClose: () => void, rearmKey?: string | number, sticky = false): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const owner: Owner = { close: () => onCloseRef.current(), sticky };
    acquire(owner);
    return () => release(owner);
  }, [isOpen, rearmKey, sticky]);
}

export function resetBackLayersForTests() {
  entries = [];
  pending = [];
  stickyOwners.clear();
  flushQueued = false;
  if (listening) {
    window.removeEventListener('popstate', handlePopState);
    listening = false;
  }
}
