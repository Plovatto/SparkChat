export const CALL_MEDIA_SELECTOR = '[data-call-audio], [data-call-media]';

type SinkableElement = HTMLMediaElement & { sinkId?: string; setSinkId?: (id: string) => Promise<void> };

export function supportsOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export function applySink(element: Element, sinkId: string): void {
  const media = element as SinkableElement;
  if (typeof media.setSinkId !== 'function' || media.sinkId === sinkId) {
    return;
  }
  void media.setSinkId(sinkId).catch(() => undefined);
}

export interface OutputRoute {
  refresh: () => void;
  dispose: () => void;
}

export function routeCallOutput(root: ParentNode & Node, getSink: () => string): OutputRoute {
  const applyWithin = (node: ParentNode) => {
    for (const element of Array.from(node.querySelectorAll(CALL_MEDIA_SELECTOR))) {
      applySink(element, getSink());
    }
  };
  applyWithin(root);
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
          for (const record of records) {
            for (const node of Array.from(record.addedNodes)) {
              if (!(node instanceof Element)) {
                continue;
              }
              if (node.matches(CALL_MEDIA_SELECTOR)) {
                applySink(node, getSink());
              }
              applyWithin(node);
            }
          }
        });
  observer?.observe(root, { childList: true, subtree: true });
  return {
    refresh: () => applyWithin(root),
    dispose: () => observer?.disconnect(),
  };
}
