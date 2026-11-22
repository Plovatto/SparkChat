import { REDUCED_MOTION_QUERY } from '@constants/media-queries';

const SKIP_SELECTOR = 'input, textarea, script, style, [contenteditable="true"], [data-no-language-reveal]';
const REVEAL_CLASS = 'sc-lang-reveal';
const DELAY_PROPERTY = '--sc-lang-reveal-delay';

const STAGGER_MS = 35;
const MAX_DELAY_MS = 420;
const MAX_FRAMES_TO_WAIT = 3;
const REVEAL_DURATION_MS = 460;
const FALLBACK_MARGIN_MS = 400;

interface VisibleText {
  node: Text;
  top: number;
  left: number;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function visibleTextNodes(root: ParentNode): VisibleText[] {
  const nodes: VisibleText[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.textContent?.trim() && !node.parentElement?.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
      nodes.push({ node: node as Text, top: rect.top, left: rect.left });
    }
  }
  return nodes;
}

function revealTarget(node: Text): HTMLElement | null {
  let element = node.parentElement;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const hasOwnAnimation = style.animationName !== 'none' && !element.classList.contains(REVEAL_CLASS);
    if (style.display !== 'inline' && !hasOwnAnimation) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function outermostTargets(changed: VisibleText[]): HTMLElement[] {
  const ordered = [...changed].sort((a, b) => a.top - b.top || a.left - b.left);
  const candidates = ordered.map(({ node }) => revealTarget(node)).filter((element): element is HTMLElement => element !== null);
  const unique = [...new Set(candidates)];
  return unique.filter((element) => !unique.some((other) => other !== element && other.contains(element)));
}

const cleanups = new WeakMap<HTMLElement, () => void>();

function reveal(elements: HTMLElement[]): void {
  elements.forEach((element, index) => {
    cleanups.get(element)?.();
    const delayMs = Math.min(index * STAGGER_MS, MAX_DELAY_MS);

    const finish = () => {
      window.clearTimeout(fallback);
      element.removeEventListener('animationend', onAnimationDone);
      element.removeEventListener('animationcancel', onAnimationDone);
      element.classList.remove(REVEAL_CLASS);
      element.style.removeProperty(DELAY_PROPERTY);
      cleanups.delete(element);
    };
    const onAnimationDone = (event: AnimationEvent) => {
      if (event.target === element) {
        finish();
      }
    };
    const fallback = window.setTimeout(finish, REVEAL_DURATION_MS + delayMs + FALLBACK_MARGIN_MS);

    element.style.setProperty(DELAY_PROPERTY, `${delayMs}ms`);
    void element.offsetWidth;
    element.classList.add(REVEAL_CLASS);
    element.addEventListener('animationend', onAnimationDone);
    element.addEventListener('animationcancel', onAnimationDone);
    cleanups.set(element, finish);
  });
}

export async function runLanguageTransition(applyChange: () => Promise<unknown>, root: ParentNode = document.body): Promise<void> {
  const before = prefersReducedMotion() ? null : new Map(visibleTextNodes(root).map(({ node }) => [node, node.data]));

  await applyChange();
  if (!before) {
    return;
  }

  for (let attempt = 0; attempt < MAX_FRAMES_TO_WAIT; attempt++) {
    await nextFrame();
    const changed = visibleTextNodes(root).filter(({ node }) => before.has(node) && before.get(node) !== node.data);
    if (changed.length > 0) {
      reveal(outermostTargets(changed));
      return;
    }
  }
}
