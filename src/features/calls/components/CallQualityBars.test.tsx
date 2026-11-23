import { render, screen } from '@testing-library/react';
import type * as ReactI18next from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { CallQualityBars } from './CallQualityBars';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18next>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CallQualityBars', () => {
  it('shows a good relayed call in green and keeps the relay route in the label', () => {
    render(<CallQualityBars bars={3} relayed />);
    const indicator = screen.getByRole('img');

    expect(indicator.getAttribute('data-tone')).toBe('good');
    expect(indicator.getAttribute('title')).toContain('calls.route.relay');
  });

  it('still warns about a relayed call with poor measured quality', () => {
    render(<CallQualityBars bars={1} relayed />);

    expect(screen.getByRole('img').getAttribute('data-tone')).toBe('poor');
  });
});
