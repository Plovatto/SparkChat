import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./side-drawer.css', () => ({}));

const { SideDrawer } = await import('./SideDrawer');

describe('SideDrawer', () => {
  it('renders as a modal dialog with a backdrop in a portal by default', () => {
    const { container } = render(
      <SideDrawer isOpen title="Informações" onClose={vi.fn()}>
        conteúdo
      </SideDrawer>,
    );
    expect(container.querySelector('.sc-drawer')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Informações' }).getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('.sc-drawer-backdrop')).not.toBeNull();
  });

  it('renders inline next to the content without backdrop or modal semantics', () => {
    const { container } = render(
      <SideDrawer isOpen inline title="Informações" onClose={vi.fn()}>
        conteúdo
      </SideDrawer>,
    );
    const panel = container.querySelector('.sc-drawer--inline');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('complementary');
    expect(panel?.getAttribute('aria-modal')).toBeNull();
    expect(document.querySelector('.sc-drawer-backdrop')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes from the header button and shows a back button only when given', () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(
      <SideDrawer isOpen inline title="Aparência" onClose={onClose} onBack={onBack}>
        conteúdo
      </SideDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    const { container } = render(
      <SideDrawer isOpen={false} inline title="Informações" onClose={vi.fn()}>
        conteúdo
      </SideDrawer>,
    );
    expect(container.querySelector('.sc-drawer')).toBeNull();
  });
});
