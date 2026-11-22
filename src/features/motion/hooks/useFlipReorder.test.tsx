import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlipReorder } from './useFlipReorder';

const ROW_HEIGHT = 50;

function List({ ids, view = 'all' }: { ids: string[]; view?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFlipReorder(ref, ids, view);
  return (
    <div ref={ref}>
      {ids.map((id) => (
        <div key={id} data-flip-key={id}>
          {id}
        </div>
      ))}
    </div>
  );
}

type AnimateCall = { element: HTMLElement; keyframes: Keyframe[] };

describe('useFlipReorder', () => {
  let calls: AnimateCall[] = [];
  let rectSpy: { mockRestore: () => void };
  const animate = vi.fn(function animate(this: HTMLElement, keyframes: Keyframe[]) {
    calls.push({ element: this, keyframes });
    return { id: '', onfinish: null, oncancel: null } as unknown as Animation;
  });

  beforeEach(() => {
    calls = [];
    animate.mockClear();
    rectSpy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: Element) {
      const parent = this.parentElement;
      const index = this.hasAttribute('data-flip-key') && parent ? Array.from(parent.children).indexOf(this) : 0;
      return { top: index * ROW_HEIGHT, left: 0, right: 0, bottom: 0, width: 0, height: ROW_HEIGHT, x: 0, y: 0, toJSON: () => ({}) };
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  });

  afterEach(() => {
    rectSpy.mockRestore();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('slides every moved row from its old place and lifts the row promoted to the top', () => {
    const { rerender, getByText } = render(<List ids={['a', 'b', 'c']} />);
    rerender(<List ids={['c', 'a', 'b']} />);

    expect(calls).toHaveLength(3);
    const byText = new Map(calls.map((call) => [call.element.textContent, call.keyframes]));
    expect(byText.get('a')?.[0]?.transform).toBe('translate3d(0, -50px, 0)');
    expect(byText.get('b')?.[0]?.transform).toBe('translate3d(0, -50px, 0)');
    expect(byText.get('c')?.[0]?.transform).toBe('translate3d(0, 100px, 0) scale(1)');
    expect(String(byText.get('c')?.[1]?.transform)).toContain('scale(1.025)');
    expect(getByText('c').style.zIndex).toBe('1');
  });

  it('does not animate when the view changes or the order stays the same', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a', 'b']} />);
    rerender(<List ids={['b', 'a']} view="unread" />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('respects reduced motion', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
    );
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['b', 'a']} />);
    expect(animate).not.toHaveBeenCalled();
    matchMedia.mockRestore();
  });
});
