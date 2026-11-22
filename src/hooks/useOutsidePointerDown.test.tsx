import { fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useOutsidePointerDown } from './useOutsidePointerDown';

function Harness({ isActive, onOutside, capture, withIgnored = true }: { isActive: boolean; onOutside: () => void; capture?: boolean; withIgnored?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const ignoredRef = useRef<HTMLButtonElement>(null);
  useOutsidePointerDown(isActive, [panelRef, withIgnored ? ignoredRef : undefined], onOutside, capture);
  return (
    <div>
      <div ref={panelRef} data-testid="panel">
        <span data-testid="inside">inside</span>
      </div>
      <button ref={ignoredRef} type="button" data-testid="ignored">
        trigger
      </button>
      <p data-testid="outside">outside</p>
    </div>
  );
}

describe('useOutsidePointerDown', () => {
  it('calls the handler for a pointerdown outside every inside element', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Harness isActive onOutside={onOutside} />);
    fireEvent.pointerDown(getByTestId('outside'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('ignores pointerdowns inside the panel or any other inside element', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Harness isActive onOutside={onOutside} />);
    fireEvent.pointerDown(getByTestId('inside'));
    fireEvent.pointerDown(getByTestId('ignored'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('skips missing refs', () => {
    const onOutside = vi.fn();
    const { getByTestId } = render(<Harness isActive onOutside={onOutside} withIgnored={false} />);
    fireEvent.pointerDown(getByTestId('ignored'));
    expect(onOutside).toHaveBeenCalledTimes(1);
  });

  it('does nothing while inactive and stops listening once deactivated', () => {
    const onOutside = vi.fn();
    const { getByTestId, rerender } = render(<Harness isActive={false} onOutside={onOutside} />);
    fireEvent.pointerDown(getByTestId('outside'));
    rerender(<Harness isActive onOutside={onOutside} />);
    rerender(<Harness isActive={false} onOutside={onOutside} />);
    fireEvent.pointerDown(getByTestId('outside'));
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('always calls the latest handler', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { getByTestId, rerender } = render(<Harness isActive onOutside={first} />);
    rerender(<Harness isActive onOutside={second} />);
    fireEvent.pointerDown(getByTestId('outside'));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('runs in the capture phase when asked, before a target handler can stop propagation', () => {
    const bubbling = vi.fn();
    const capturing = vi.fn();
    const stop = (event: Event) => event.stopPropagation();
    const { getByTestId, unmount } = render(<Harness isActive onOutside={bubbling} />);
    getByTestId('outside').addEventListener('pointerdown', stop);
    fireEvent.pointerDown(getByTestId('outside'));
    expect(bubbling).not.toHaveBeenCalled();
    unmount();
    const captured = render(<Harness isActive onOutside={capturing} capture />);
    captured.getByTestId('outside').addEventListener('pointerdown', stop);
    fireEvent.pointerDown(captured.getByTestId('outside'));
    expect(capturing).toHaveBeenCalledTimes(1);
  });
});
