import { useEffect, useRef } from 'react';

interface BackLayer {
  close: () => void;
}

const layers: BackLayer[] = [];
let ignoredPops = 0;
let listening = false;

function handlePopState() {
  if (ignoredPops > 0) {
    ignoredPops -= 1;
    return;
  }
  const layer = layers.pop();
  layer?.close();
}

function ensureListener() {
  if (!listening) {
    window.addEventListener('popstate', handlePopState);
    listening = true;
  }
}

function pushLayer(layer: BackLayer) {
  layers.push(layer);
  window.history.pushState({ scLayer: layers.length }, '');
  ensureListener();
}

function removeLayer(layer: BackLayer) {
  const index = layers.indexOf(layer);
  if (index === -1) {
    return;
  }
  layers.splice(index, 1);
  ignoredPops += 1;
  window.history.back();
}

export function useBackLayer(isOpen: boolean, onClose: () => void, rearmKey?: string | number): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const layer: BackLayer = { close: () => onCloseRef.current() };
    pushLayer(layer);
    return () => removeLayer(layer);
  }, [isOpen, rearmKey]);
}

export function resetBackLayersForTests() {
  layers.length = 0;
  ignoredPops = 0;
  if (listening) {
    window.removeEventListener('popstate', handlePopState);
    listening = false;
  }
}
