import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfPreviewModal } from './PdfPreviewModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#000000' }) }),
}));

vi.mock('../utils/pdf-document', () => ({
  loadLocalPdfDocument: vi.fn(() => new Promise(() => undefined)),
}));

function clickWithPointer(pressTarget: Element, releaseTarget: Element = pressTarget) {
  fireEvent.pointerDown(pressTarget);
  fireEvent.pointerUp(releaseTarget);
  fireEvent.click(releaseTarget);
}

function renderViewer() {
  const onClose = vi.fn();
  render(<PdfPreviewModal isOpen onClose={onClose} url="blob:http://localhost/doc" fileName="report.pdf" />);
  const page = screen.getByRole('document', { name: 'report.pdf', hidden: true });
  const backdrop = document.querySelector('.sc-modal-backdrop') as HTMLElement;
  return { onClose, page, backdrop };
}

describe('PdfPreviewModal backdrop dismissal', () => {
  it('closes when the blurred backdrop is clicked', () => {
    const { onClose, backdrop } = renderViewer();

    clickWithPointer(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the document and title are clicked', () => {
    const { onClose, page } = renderViewer();

    clickWithPointer(page);
    clickWithPointer(screen.getByText('report.pdf'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a drag starts on the document and ends on the backdrop', () => {
    const { onClose, page, backdrop } = renderViewer();

    clickWithPointer(page, backdrop);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = renderViewer();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', () => {
    const { onClose } = renderViewer();

    clickWithPointer(screen.getByTitle('common.close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
