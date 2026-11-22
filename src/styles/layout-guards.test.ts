import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8');
}

function rule(file: string, selector: string): string {
  const source = read(file);
  const start = source.indexOf(`\n${selector} {`);
  if (start === -1) {
    return '';
  }
  return source.slice(start, source.indexOf('}', start));
}

describe('layout guards', () => {
  it('lets message rows shrink below the min-content width of a long quote', () => {
    const row = rule('src/features/chat/styles/delete-messages.css', '.sc-message-row');
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    const inner = rule('src/features/chat/styles/delete-messages.css', '.sc-message-row > .sc-message-row__inner');
    expect(inner).toMatch(/min-width:\s*0/);
  });

  it('keeps the open member menu above the sticky drawer footer', () => {
    const open = rule('src/features/chat/styles/room-info-drawer.css', ".sc-info-member[data-menu-open='true']");
    const footer = rule('src/components/common/side-drawer.css', '.sc-drawer__footer');
    const openZ = Number(open.match(/z-index:\s*(\d+)/)?.[1]);
    const footerZ = Number(footer.match(/z-index:\s*(\d+)/)?.[1]);
    expect(openZ).toBeGreaterThan(footerZ);
  });

  it('stops pinning the drawer footer on short viewports', () => {
    expect(read('src/features/chat/styles/room-info-drawer.css')).toMatch(/@media \(max-height: 480px\)\s*\{\s*\.sc-drawer__footer\s*\{\s*position:\s*static/);
  });

  it('scrolls the message actions sheet instead of cutting it on landscape phones', () => {
    const list = rule('src/features/chat/styles/message-actions.css', '.sc-actions-sheet__list');
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps the profile share icon inline with a wrapped label', () => {
    const share = rule('src/features/rooms/styles/profile-modal.css', '.sc-profile-share');
    expect(share).toMatch(/display:\s*block/);
  });
});
