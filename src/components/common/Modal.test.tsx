import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
}));

const { Modal } = await import('./Modal');

describe('Modal', () => {
  it('renders the default title bar with a close button when only a title is given', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Default title">
        <p>body</p>
      </Modal>,
    );

    expect(screen.getByRole('heading', { name: 'Default title' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('replaces the default title bar with a custom header', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Ignored title" header={<div data-testid="custom-header">Custom</div>}>
        <p>body</p>
      </Modal>,
    );

    expect(screen.getByTestId('custom-header')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ignored title' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('merges a custom body style over the default body padding', () => {
    render(
      <Modal isOpen onClose={vi.fn()} bodyStyle={{ padding: '18px' }}>
        <p>body</p>
      </Modal>,
    );

    const body = screen.getByText('body').parentElement as HTMLElement;
    expect(body.style.padding).toBe('18px');
  });

  it('appends a custom panel class name', () => {
    render(
      <Modal isOpen onClose={vi.fn()} panelClassName="custom-panel">
        <p>body</p>
      </Modal>,
    );

    const panel = document.querySelector('.sc-modal-panel') as HTMLElement;
    expect(panel.classList.contains('custom-panel')).toBe(true);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} header={<div>Custom</div>}>
        <p>body</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
