import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Collapse } from './Collapse';

function endAnimation(element: Element) {
  act(() => {
    element.dispatchEvent(new Event('animationend', { bubbles: true }));
    element.dispatchEvent(new Event('webkitAnimationEnd', { bubbles: true }));
  });
}

describe('Collapse', () => {
  it('opens with an enter animation and settles once its own animation ends', () => {
    const { container } = render(
      <Collapse isExiting={false}>
        <span className="child">Banner</span>
      </Collapse>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('sc-collapse sc-collapse--enter');
    expect(wrapper.dataset.settled).toBeUndefined();

    endAnimation(screen.getByText('Banner'));
    expect(wrapper.dataset.settled).toBeUndefined();

    endAnimation(wrapper);
    expect(wrapper.dataset.settled).toBe('true');
  });

  it('collapses while exiting and drops the settled flag so the content clips', () => {
    const { container, rerender } = render(
      <Collapse isExiting={false} animateEnter={false}>
        <span>Pill</span>
      </Collapse>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toBe('sc-collapse');
    expect(wrapper.dataset.settled).toBe('true');

    rerender(
      <Collapse isExiting animateEnter={false}>
        <span>Pill</span>
      </Collapse>,
    );
    expect(wrapper.className).toBe('sc-collapse is-exiting');
    expect(wrapper.dataset.settled).toBeUndefined();
  });
});
