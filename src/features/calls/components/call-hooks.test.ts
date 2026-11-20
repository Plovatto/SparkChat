import { describe, expect, it } from 'vitest';
import { isOutside } from './call-hooks';

function element(...children: object[]) {
  return { contains: (node: Node) => children.includes(node) };
}

describe('isOutside', () => {
  const inPanel = {};
  const onTrigger = {};
  const elsewhere = {};
  const panel = element(inPanel);
  const trigger = element(onTrigger);

  it('closes the settings panel on a pointer down outside the panel and the settings button', () => {
    expect(isOutside(elsewhere as EventTarget, panel, trigger)).toBe(true);
  });

  it('keeps it open for pointer downs inside the panel or on the settings button', () => {
    expect(isOutside(inPanel as EventTarget, panel, trigger)).toBe(false);
    expect(isOutside(onTrigger as EventTarget, panel, trigger)).toBe(false);
  });

  it('ignores missing targets and missing elements', () => {
    expect(isOutside(null, panel, trigger)).toBe(false);
    expect(isOutside(elsewhere as EventTarget, null, trigger)).toBe(true);
  });
});
