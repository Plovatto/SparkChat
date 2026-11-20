import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('@lib/media/profile-photo-compression', () => ({
  profilePhotoErrorKey: () => 'errors.profilePhoto.failed',
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({ theme: new Proxy({}, { get: () => '#123456' }) }),
  withAlpha: (color: string) => color,
}));

vi.mock('react-easy-crop', () => ({
  default: () => <div data-cropper="true" />,
}));

vi.mock('react-easy-crop/react-easy-crop.css', () => ({}));
vi.mock('./profile-photos.css', () => ({}));

const { PhotoCropModal } = await import('./PhotoCropModal');

function Harness({ isOpen }: { isOpen: boolean }) {
  return (
    <>
      <button type="button">opener</button>
      <PhotoCropModal isOpen={isOpen} imageUrl="blob:photo" onCancel={vi.fn()} onConfirm={() => Promise.resolve()} />
    </>
  );
}

describe('PhotoCropModal focus', () => {
  it('keeps Tab inside the dialog and gives focus back to the opener when it closes', () => {
    const view = render(<Harness isOpen={false} />);
    const opener = screen.getByText('opener');
    opener.focus();

    view.rerender(<Harness isOpen />);
    const confirm = screen.getByText('profilePhotos.crop.confirm').closest('button') as HTMLButtonElement;
    const close = screen.getByLabelText('common.close');
    expect(document.activeElement).toBe(confirm);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    view.rerender(<Harness isOpen={false} />);
    expect(document.activeElement).toBe(opener);
  });
});
