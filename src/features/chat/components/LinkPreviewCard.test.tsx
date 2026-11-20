import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkPreviewCard } from './LinkPreviewCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@features/theme', () => ({
  useTheme: () => ({
    theme: { surfaceSunken: '#111', textPrimary: '#fff', textSecondary: '#aaa', accentSoft: '#222', accentText: '#0ff', border: '#333', skeleton: '#444' },
  }),
}));

const spoofed = { url: 'https://evil.example/login', title: 'Google: security alert', siteName: 'accounts.google.com', imageUrl: null };

describe('LinkPreviewCard origin indicator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the real host and never the sender-supplied site name', () => {
    render(<LinkPreviewCard preview={spoofed} variant="bubble" messageText="https://evil.example/login" />);

    expect(screen.getByTestId('link-preview-host').textContent).toBe('evil.example');
    expect(screen.queryByText('accounts.google.com')).toBeNull();
  });

  it('shows the real host even when the site name is absent or matches', () => {
    const { unmount } = render(<LinkPreviewCard preview={{ ...spoofed, siteName: null }} variant="bubble" messageText="https://evil.example/login" />);
    expect(screen.getByTestId('link-preview-host').textContent).toBe('evil.example');
    unmount();

    render(
      <LinkPreviewCard
        preview={{ url: 'https://example.com/a', title: 'Example', siteName: 'example.com', imageUrl: null }}
        variant="bubble"
        messageText="https://example.com/a"
      />,
    );
    expect(screen.getByTestId('link-preview-host').textContent).toBe('example.com');
  });

  it('still opens the real URL on click', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<LinkPreviewCard preview={spoofed} variant="bubble" messageText="https://evil.example/login" />);

    fireEvent.click(screen.getByTestId('link-preview-host'));

    expect(open).toHaveBeenCalledWith('https://evil.example/login', '_blank', 'noopener,noreferrer');
  });
});
