import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./profile-photos.css', () => ({}));

vi.mock('@components/common/Spinner', () => ({
  Spinner: () => <span data-spinner="true" />,
}));

const { PhotoPickerTile } = await import('./PhotoPickerTile');

const handlers = { onChoose: vi.fn(), onSelect: vi.fn(), onRemove: vi.fn() };

describe('PhotoPickerTile', () => {
  it('shows a camera with a plus badge and an accessible label when empty', () => {
    const html = renderToStaticMarkup(<PhotoPickerTile size={75} iconSize={40} photoUrl={null} isSelected={false} {...handlers} />);
    expect(html).toContain('aria-label="profilePhotos.choose"');
    expect(html).toContain('data-static="true"');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('profilePhotos.remove');
  });

  it('shows the photo with change and remove controls once chosen', () => {
    const html = renderToStaticMarkup(<PhotoPickerTile size={58} iconSize={30} photoUrl="blob:photo" isSelected {...handlers} />);
    expect(html).toContain('src="blob:photo"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="profilePhotos.remove"');
    expect(html).toContain('aria-label="profilePhotos.change"');
  });

  it('offers to use the photo again when a preset is selected', () => {
    const html = renderToStaticMarkup(<PhotoPickerTile size={58} iconSize={30} photoUrl="blob:photo" isSelected={false} {...handlers} />);
    expect(html).toContain('aria-label="profilePhotos.useMine"');
    expect(html).toContain('data-selected="false"');
  });

  it('offers to enlarge the selected photo when a viewer is available', () => {
    const html = renderToStaticMarkup(<PhotoPickerTile size={58} iconSize={30} photoUrl="blob:photo" isSelected onView={vi.fn()} {...handlers} />);
    expect(html).toContain('aria-label="profilePhotos.viewMine"');
    expect(html).toContain('data-viewable="true"');
  });

  it('shows a spinner while busy', () => {
    const html = renderToStaticMarkup(<PhotoPickerTile size={58} iconSize={30} photoUrl={null} isSelected={false} isBusy {...handlers} />);
    expect(html).toContain('data-spinner="true"');
    expect(html).toContain('aria-busy="true"');
  });
});
