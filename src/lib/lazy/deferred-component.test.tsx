import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deferredComponent, deferredUntilOpen } from './deferred-component';

interface PanelProps {
  isOpen: boolean;
  label: string;
}

function Panel({ isOpen, label }: PanelProps) {
  return <div data-testid="panel">{`${label}:${isOpen ? 'open' : 'closed'}`}</div>;
}

describe('deferredUntilOpen', () => {
  it('does not load the module until the first open', async () => {
    const load = vi.fn(() => Promise.resolve(Panel));
    const Deferred = deferredUntilOpen<PanelProps>(load);

    const { rerender } = render(<Deferred isOpen={false} label="a" />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByTestId('panel')).toBeNull();

    rerender(<Deferred isOpen label="a" />);
    expect(await screen.findByText('a:open')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stays mounted after closing so exit animations can run', async () => {
    const Deferred = deferredUntilOpen<PanelProps>(() => Promise.resolve(Panel));

    const { rerender } = render(<Deferred isOpen label="b" />);
    expect(await screen.findByText('b:open')).toBeTruthy();

    rerender(<Deferred isOpen={false} label="b" />);
    expect(screen.getByText('b:closed')).toBeTruthy();
  });

  it('preloads once and reuses the loaded module', async () => {
    const load = vi.fn(() => Promise.resolve(Panel));
    const Deferred = deferredUntilOpen<PanelProps>(load);

    await act(() => Deferred.preload());
    await act(() => Deferred.preload());
    render(<Deferred isOpen label="c" />);

    expect(await screen.findByText('c:open')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('retries the load after a failed preload', async () => {
    const load = vi.fn<() => Promise<typeof Panel>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Panel);
    const Deferred = deferredUntilOpen<PanelProps>(load);

    await act(() => Deferred.preload());
    render(<Deferred isOpen label="d" />);

    expect(await screen.findByText('d:open')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('deferredComponent', () => {
  it('renders the loaded component with its props', async () => {
    const Deferred = deferredComponent<PanelProps>(() => Promise.resolve(Panel));

    render(<Deferred isOpen={false} label="e" />);

    expect(await screen.findByText('e:closed')).toBeTruthy();
  });
});
