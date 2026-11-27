import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useChipRowScroll } from './useChipRowScroll';

function setMetrics(element: HTMLElement, metrics: { clientWidth: number; scrollWidth: number; scrollLeft?: number }) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: metrics.clientWidth });
  Object.defineProperty(element, 'scrollWidth', { configurable: true, value: metrics.scrollWidth });
  element.scrollLeft = metrics.scrollLeft ?? 0;
}

function Row() {
  const { ref, canScrollStart, canScrollEnd, scrollByPage } = useChipRowScroll<HTMLDivElement>();
  return (
    <div>
      <div ref={ref} data-testid="row" />
      <span data-testid="edges">{`${String(canScrollStart)}-${String(canScrollEnd)}`}</span>
      <button type="button" onClick={() => scrollByPage(1)}>
        next
      </button>
    </div>
  );
}

describe('useChipRowScroll', () => {
  it('turns a vertical wheel into horizontal scrolling when the row overflows', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    setMetrics(row, { clientWidth: 300, scrollWidth: 900 });

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => {
      row.dispatchEvent(event);
    });

    expect(row.scrollLeft).toBe(120);
    expect(event.defaultPrevented).toBe(true);
  });

  it('lets the page scroll when the row is already at the end', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    setMetrics(row, { clientWidth: 300, scrollWidth: 900, scrollLeft: 600 });

    const event = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    act(() => {
      row.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps native horizontal wheel gestures untouched', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    setMetrics(row, { clientWidth: 300, scrollWidth: 900 });

    const event = new WheelEvent('wheel', { deltaX: 80, deltaY: 10, bubbles: true, cancelable: true });
    act(() => {
      row.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it('reports which edges can still scroll', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    setMetrics(row, { clientWidth: 300, scrollWidth: 900, scrollLeft: 0 });
    fireEvent.scroll(row);
    expect(screen.getByTestId('edges').textContent).toBe('false-true');

    row.scrollLeft = 300;
    fireEvent.scroll(row);
    expect(screen.getByTestId('edges').textContent).toBe('true-true');

    row.scrollLeft = 600;
    fireEvent.scroll(row);
    expect(screen.getByTestId('edges').textContent).toBe('true-false');
  });

  it('pages the row forward by most of its width', () => {
    render(<Row />);
    const row = screen.getByTestId('row');
    setMetrics(row, { clientWidth: 300, scrollWidth: 900 });
    const calls: ScrollToOptions[] = [];
    row.scrollBy = ((options: ScrollToOptions) => {
      calls.push(options);
    }) as typeof row.scrollBy;

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    expect(calls).toEqual([{ left: 240, behavior: 'smooth' }]);
  });
});
