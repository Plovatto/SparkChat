import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n');
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
    expect(read('src/features/chat/styles/room-info-drawer.css')).toMatch(/@media \(max-height: 480px\)\s*\{\s*\.sc-drawer__footer:has\(\.sc-info-footer-row\)\s*\{\s*position:\s*static/);
  });

  it('scrolls the message actions sheet instead of cutting it on landscape phones', () => {
    const list = rule('src/features/chat/styles/message-actions.css', '.sc-actions-sheet__list');
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it('keeps the profile share button centred while its label wraps', () => {
    const file = 'src/features/rooms/styles/profile-modal.css';
    const base = read(file).match(/\.sc-profile-share,\s*\.sc-profile-outline-btn\s*\{[^}]*\}/)?.[0] ?? '';
    expect(base).toMatch(/display:\s*inline-flex/);
    expect(base).toMatch(/align-items:\s*center/);
    expect(base).toMatch(/justify-content:\s*center/);
    expect(rule(file, '.sc-profile-share__label')).toMatch(/text-align:\s*center/);
    expect(rule(file, '.sc-profile-share')).toBe('');
  });

  it('anchors the jump to latest button inside the chat area instead of measuring the viewport', () => {
    const source = read('src/features/chat/components/ChatArea.tsx');
    expect(source).not.toMatch(/scrollButtonPosition/);
    const button = source.slice(source.lastIndexOf('<button', source.indexOf('<FaArrowDown')), source.indexOf('<FaArrowDown'));
    expect(button).toMatch(/className="sc-icon-btn sc-icon-btn--surface sc-jump-latest"/);
    expect(button).not.toMatch(/position:/);
    const jump = rule('src/features/chat/styles/chat-bubbles.css', '.sc-jump-latest');
    expect(jump).toMatch(/position:\s*absolute/);
    expect(jump).toMatch(/right:\s*calc\([^;]*env\(safe-area-inset-right/);
    expect(jump).toMatch(/bottom:\s*\d+px/);
    expect(jump).not.toMatch(/position:\s*fixed/);
  });

  it('keeps chat media out of native selection and drag on every pointer while keeping the long press menu', () => {
    const media = rule('src/features/chat/styles/chat-bubbles.css', '.chat-bubble-wrap .sc-bubble img,\n.chat-bubble-wrap .sc-bubble video');
    expect(media).toMatch(/-webkit-user-select:\s*none/);
    expect(media).toMatch(/user-select:\s*none/);
    expect(media).toMatch(/-webkit-user-drag:\s*none/);
    expect(media).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(media).not.toMatch(/touch-callout:\s*none/);
  });
});
