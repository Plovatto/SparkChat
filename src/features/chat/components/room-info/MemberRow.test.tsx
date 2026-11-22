import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomParticipant } from '@lib/socket';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@features/profile-photos/components/Avatar', () => ({ Avatar: () => <span /> }));
vi.mock('@lib/format', () => ({ getDisplayName: (_id: string, nickname: string) => nickname }));

const { MemberRow } = await import('./MemberRow');

const participant = { id: 'u2', nickname: 'bruno', avatar: 1, isAdmin: false, status: 'offline' } as unknown as RoomParticipant;

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) };
}

function renderRow() {
  return render(
    <div className="sc-drawer__body">
      <MemberRow
        participant={participant}
        currentUserId="me"
        subtitle="offline"
        canManage
        isCopied={false}
        index={0}
        onCopy={vi.fn()}
        onPromote={vi.fn()}
        onRemove={vi.fn()}
        onViewPhoto={vi.fn()}
      />
      <div className="sc-drawer__footer" />
    </div>,
  );
}

function mockLayout(triggerTop: number, triggerBottom: number, footerTop: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(130);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('sc-drawer__footer')) {
      return rect(footerTop, footerTop + 120);
    }
    if (this.classList.contains('sc-drawer__body')) {
      return rect(0, 700);
    }
    return rect(triggerTop, triggerBottom);
  });
}

describe('MemberRow menu placement', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens below the trigger when there is room above the footer', () => {
    mockLayout(100, 136, 580);
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.memberOptions' }));
    expect(screen.getByRole('menu').getAttribute('data-placement')).toBe('bottom');
  });

  it('flips above the trigger when the sticky footer would cover it', () => {
    mockLayout(500, 536, 580);
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'roomInfo.memberOptions' }));
    expect(screen.getByRole('menu').getAttribute('data-placement')).toBe('top');
  });
});
