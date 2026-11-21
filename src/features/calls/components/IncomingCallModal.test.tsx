import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallContext, type CallApi } from '../call-context';
import { EMPTY_CALL_SNAPSHOT } from '../lib/call-controller';
import { IncomingCallModal } from './IncomingCallModal';

const media = vi.hoisted(() => ({ wide: false }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@lib/i18n/app-i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@hooks/useMediaQuery', () => ({
  useMediaQuery: () => media.wide,
}));

vi.mock('@features/profile-photos/components/Avatar', () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

function renderRinging(kind: 'voice' | 'video' = 'voice') {
  const api = {
    snapshot: { ...EMPTY_CALL_SNAPSHOT, state: { ...EMPTY_CALL_SNAPSHOT.state, phase: 'incoming-ringing', kind, peerId: 'p', callId: 'c' } },
    peerDisplay: () => ({ id: 'p', name: 'Ada', avatar: 1 }),
    accept: vi.fn(),
    decline: vi.fn(),
    silence: vi.fn(),
    primePlayback: vi.fn(),
  } as unknown as CallApi;
  render(
    <CallContext value={api}>
      <IncomingCallModal />
    </CallContext>,
  );
  return api;
}

describe('IncomingCallModal', () => {
  beforeEach(() => {
    media.wide = false;
  });

  it('rings full screen on a phone with the peer, the call kind and labelled actions', () => {
    const api = renderRinging('video');
    const dialog = screen.getByRole('alertdialog', { name: 'Ada' });
    expect(dialog.className).toContain('sc-ring');
    expect(dialog.textContent).toContain('calls.incomingKind.video');
    fireEvent.click(screen.getByRole('button', { name: 'calls.decline' }));
    fireEvent.click(screen.getByRole('button', { name: 'calls.silence' }));
    expect(api.decline).toHaveBeenCalledTimes(1);
    expect(api.silence).toHaveBeenCalledTimes(1);
  });

  it('focuses the answer button quietly until focus moves on', () => {
    renderRinging();
    const answer = screen.getByRole('button', { name: 'calls.answer' });
    expect(document.activeElement).toBe(answer);
    expect(answer.dataset.autofocus).toBe('true');
    fireEvent.blur(answer);
    expect(answer.dataset.autofocus).toBeUndefined();
  });

  it('answers with Enter on the dialog and silences with Escape', () => {
    const api = renderRinging();
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(api.primePlayback).toHaveBeenCalledTimes(1);
    expect(api.accept).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(api.silence).toHaveBeenCalledTimes(1);
  });

  it('shows a floating card on wider screens with a labelled silence button', () => {
    media.wide = true;
    const api = renderRinging();
    const dialog = screen.getByRole('alertdialog', { name: 'Ada' });
    expect(dialog.className).toContain('sc-ring-card');
    expect(dialog.className).not.toContain('sc-ring-card--docked');
    const silence = screen.getByRole('button', { name: 'calls.silence' });
    expect(silence.getAttribute('title')).toBe('calls.silence');
    fireEvent.click(screen.getByRole('button', { name: 'calls.answer' }));
    expect(api.accept).toHaveBeenCalledTimes(1);
  });
});
