import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoPreviewModal } from './VideoPreviewModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@lib/e2ee', () => ({
  downloadMessageMedia: vi.fn(),
}));

function clickWithPointer(pressTarget: Element, releaseTarget: Element = pressTarget) {
  fireEvent.pointerDown(pressTarget);
  fireEvent.pointerUp(releaseTarget);
  fireEvent.click(releaseTarget);
}

function renderViewer() {
  const onClose = vi.fn();
  render(<VideoPreviewModal isOpen onClose={onClose} url="blob:http://localhost/video" fileName="clip.mp4" />);
  const video = document.querySelector('video') as HTMLVideoElement;
  const contentLayer = video.parentElement?.parentElement as HTMLElement;
  const backdrop = document.querySelector('.sc-modal-backdrop') as HTMLElement;
  return { onClose, video, contentLayer, backdrop };
}

describe('VideoPreviewModal backdrop dismissal', () => {
  it('closes when the blurred area around the video is clicked', () => {
    const { onClose, contentLayer } = renderViewer();

    clickWithPointer(contentLayer);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop layer itself is clicked', () => {
    const { onClose, backdrop } = renderViewer();

    clickWithPointer(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the video is clicked', () => {
    const { onClose, video } = renderViewer();

    clickWithPointer(video);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when the toolbar and file name are clicked', () => {
    const { onClose } = renderViewer();

    clickWithPointer(screen.getByTitle('chat.viewer.downloadVideo'));
    clickWithPointer(screen.getByText('clip.mp4'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('stays open when a drag starts on the video and ends on the backdrop', () => {
    const { onClose, video, contentLayer } = renderViewer();

    clickWithPointer(video, contentLayer);

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = renderViewer();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the close button', () => {
    const { onClose } = renderViewer();

    clickWithPointer(screen.getByTitle('chat.viewer.closeVideo'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
