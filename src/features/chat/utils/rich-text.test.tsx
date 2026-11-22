import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRichText } from './rich-text';

function renderText(text: string) {
  return render(<p>{renderRichText(text, [], '#000')}</p>);
}

describe('renderRichText', () => {
  it('links plain urls', () => {
    const { container } = renderText('see https://example.com/a now');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
  });

  it('removes bidi control characters so a link cannot disguise its real target', () => {
    const { container } = renderText('http://evil.com‮gpj.exe and ⁦text⁩');
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('http://evil.comgpj.exe');
    expect(link?.textContent).toBe('http://evil.comgpj.exe');
    expect(container.textContent).not.toMatch(/[‪-‮⁦-⁩]/);
  });
});
