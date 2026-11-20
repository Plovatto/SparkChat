import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBackdropDismiss } from './useBackdropDismiss';

function Harness({ onDismiss }: { onDismiss: () => void }) {
  const backdropDismissProps = useBackdropDismiss(onDismiss);
  return (
    <div data-testid="backdrop" {...backdropDismissProps}>
      <span>media</span>
    </div>
  );
}

function clickWithPointer(pressTarget: Element, releaseTarget: Element = pressTarget) {
  fireEvent.pointerDown(pressTarget);
  fireEvent.pointerUp(releaseTarget);
  fireEvent.click(releaseTarget);
}

describe('useBackdropDismiss', () => {
  it('dismisses when the press starts and ends on the backdrop itself', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    clickWithPointer(screen.getByTestId('backdrop'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks on content inside the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    clickWithPointer(screen.getByText('media'));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores a drag that starts on the content and ends on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    clickWithPointer(screen.getByText('media'), screen.getByTestId('backdrop'));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores a click without a matching press on the backdrop', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('backdrop'));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('does not reuse a previous backdrop press for a later click', () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);
    const backdrop = screen.getByTestId('backdrop');

    clickWithPointer(backdrop);
    fireEvent.click(backdrop);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
