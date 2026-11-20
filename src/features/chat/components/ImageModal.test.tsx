import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageModal } from './ImageModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@components/common/Spinner', () => ({
  Spinner: () => null,
}));

vi.mock('@lib/e2ee', () => ({
  decryptMediaContentIfNeeded: vi.fn((content: string) => Promise.resolve(content)),
  downloadMessageMedia: vi.fn(),
}));

const IMAGES = ['blob:http://localhost/first', 'blob:http://localhost/second'];

function clickWithPointer(pressTarget: Element, releaseTarget: Element = pressTarget) {
  fireEvent.pointerDown(pressTarget);
  fireEvent.pointerUp(releaseTarget);
  fireEvent.click(releaseTarget);
}

function renderViewer(images: string[] = IMAGES) {
  const onClose = vi.fn();
  render(<ImageModal isOpen images={images} onClose={onClose} />);
  const image = screen.getByAltText('chat.viewer.expanded');
  const contentLayer = image.parentElement?.parentElement as HTMLElement;
  const backdrop = document.querySelector('.sc-modal-backdrop') as HTMLElement;
  return { onClose, image, contentLayer, backdrop };
}

describe('ImageModal backdrop dismissal', () => {
  it('closes when the blurred area around the image is clicked', () => {
    const { onClose, contentLayer } = renderViewer();

    clickWithPointer(contentLayer);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop layer itself is clicked', () => {
    const { onClose, backdrop } = renderViewer();

    clickWithPointer(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the image is clicked', () => {
    const { onClose, image } = renderViewer();

    clickWithPointer(image);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when toolbar, counter and navigation controls are clicked', () => {
    const { onClose } = renderViewer();

    clickWithPointer(screen.getByTitle('chat.viewer.zoomIn'));
    clickWithPointer(screen.getByTitle('chat.viewer.zoomOut'));
    clickWithPointer(screen.getByTitle('chat.viewer.downloadImage'));
    clickWithPointer(screen.getByTitle('chat.viewer.next'));
    clickWithPointer(screen.getByTitle('chat.viewer.previous'));
    clickWithPointer(screen.getByText('1 / 2'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a drag starts on the image and ends on the backdrop', () => {
    const { onClose, image, contentLayer } = renderViewer();

    clickWithPointer(image, contentLayer);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = renderViewer();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', () => {
    const { onClose } = renderViewer();

    clickWithPointer(screen.getByTitle('chat.viewer.closeImage'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
