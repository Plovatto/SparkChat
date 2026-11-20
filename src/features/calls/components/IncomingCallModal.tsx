import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FaPhone, FaVideo, FaVolumeMute } from 'react-icons/fa';
import { MdCallEnd } from 'react-icons/md';
import { AVATARS, AVATAR_ICON_COLOR } from '@features/auth/constants/avatars';
import { useTheme } from '@features/theme';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { translate } from '@lib/i18n/app-i18n';
import type { CallKind } from '@lib/e2ee/call-crypto';
import { useCall } from '../call-context';
import { isMounted } from '../lib/presence';
import { usePresence } from './use-presence';
import { getIncomingSlot, isSlotVisible, releaseIncomingSlot, setIncomingSlot, subscribeIncomingSlot, watchSlotVisibility } from '../lib/incoming-slot';

export function IncomingCallSlot() {
  const ref = useRef<HTMLDivElement | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      ref.current = element;
      setIncomingSlot(element);
    } else if (ref.current) {
      releaseIncomingSlot(ref.current);
      ref.current = null;
    }
  }, []);
  return <div ref={attach} className="sc-incoming-slot" />;
}

const getServerSlot = () => null;

export function IncomingCallModal() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const call = useCall();
  const { state } = call.snapshot;
  const answerRef = useRef<HTMLButtonElement>(null);
  const wide = useMediaQuery('(min-width: 600px)');
  const slot = useSyncExternalStore(subscribeIncomingSlot, getIncomingSlot, getServerSlot);
  const ringing = state.phase === 'incoming-ringing' && state.kind !== null;
  const { silence } = call;
  const [slotVisible, setSlotVisible] = useState(() => isSlotVisible(slot));
  useEffect(() => watchSlotVisibility(slot, setSlotVisible), [slot]);
  const docked = wide && slotVisible && slot !== null;
  const stage = usePresence(ringing, 240, 180);
  const lastRef = useRef<{ kind: CallKind; peerId: string | null } | null>(null);
  if (ringing && state.kind) {
    lastRef.current = { kind: state.kind, peerId: state.peerId };
  }

  useEffect(() => {
    if (!ringing) {
      return;
    }
    answerRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        silence();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ringing, silence, docked, wide]);

  const shown = lastRef.current;
  if (!isMounted(stage) || !shown) {
    return null;
  }
  const visualStage = ringing ? stage : 'exiting';
  const peer = call.peerDisplay(shown.peerId);
  const avatar = peer ? AVATARS[peer.avatar] : undefined;
  const titleId = 'sc-incoming-title';
  const kindId = 'sc-incoming-kind';
  const kindLabel = translate(`calls.incomingKind.${shown.kind}`);
  const answer = () => {
    call.primePlayback();
    call.accept();
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      answer();
    }
  };

  if (wide) {
    const card = (
      <div role="alertdialog" aria-labelledby={titleId} aria-describedby={kindId} className={`sc-incoming-card${docked ? ' sc-incoming-card--docked' : ''}`} data-state={visualStage} onKeyDown={onKeyDown}>
        <div className="sc-incoming-card__row">
          <div className="sc-incoming-card__avatar" style={{ background: avatar?.bgGradient ?? theme.gradientControl }}>
            {avatar ? <avatar.icon size={24} color={AVATAR_ICON_COLOR} /> : null}
          </div>
          <div className="sc-incoming-card__text">
            <h2 id={titleId} className="sc-incoming-card__name" title={peer?.name ?? ''}>
              {peer?.name ?? ''}
            </h2>
            <span id={kindId} className="sc-incoming-card__meta">
              {shown.kind === 'video' ? <FaVideo size={12} aria-hidden="true" /> : <FaPhone size={11} aria-hidden="true" />}
              <span>
                {kindLabel} · <span aria-live="polite">{t('calls.status.ringing')}</span>
              </span>
            </span>
          </div>
          <button type="button" className="sc-incoming-card__mute" onClick={call.silence} title={t('calls.silence')} aria-label={t('calls.silence')}>
            <FaVolumeMute size={13} />
          </button>
        </div>
        <div className="sc-incoming-card__actions">
          <button type="button" className="sc-incoming-card__btn sc-incoming-card__btn--decline" onClick={call.decline}>
            <MdCallEnd size={18} aria-hidden="true" />
            <span>{t('calls.decline')}</span>
          </button>
          <button ref={answerRef} type="button" className="sc-incoming-card__btn sc-incoming-card__btn--answer" onClick={answer}>
            <FaPhone size={13} aria-hidden="true" />
            <span>{t('calls.answer')}</span>
          </button>
        </div>
      </div>
    );
    return docked ? createPortal(card, slot) : card;
  }

  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={kindId} className="sc-incoming" data-state={visualStage} onKeyDown={onKeyDown}>
      <div className="sc-incoming__head">
        <div className="sc-incoming__avatar" style={{ background: avatar?.bgGradient ?? theme.gradientControl }}>
          {avatar ? <avatar.icon size={44} color={AVATAR_ICON_COLOR} style={{ width: '50%', height: '50%' }} /> : null}
        </div>
        <div className="sc-incoming__text">
          <h2 id={titleId} className="sc-incoming__name">
            {peer?.name ?? ''}
          </h2>
          <span id={kindId} className="sc-incoming__sub">
            {kindLabel}
          </span>
          <span className="sc-incoming__sub" aria-live="polite">
            {t('calls.status.ringing')}
          </span>
        </div>
      </div>
      <div className="sc-incoming__bottom">
        <div className="sc-incoming__actions">
          <button type="button" className="sc-incoming__action" onClick={call.decline}>
            <span className="sc-incoming__circle" style={{ background: theme.danger }} aria-hidden="true">
              <MdCallEnd size={30} />
            </span>
            {t('calls.decline')}
          </button>
          <button ref={answerRef} type="button" className="sc-incoming__action" onClick={answer}>
            <span className="sc-incoming__circle sc-incoming__circle--answer" style={{ background: theme.success }} aria-hidden="true">
              <FaPhone size={22} />
            </span>
            {t('calls.answer')}
          </button>
        </div>
        <div className="sc-incoming__footer">
          <button type="button" className="sc-incoming__silence" onClick={call.silence}>
            <FaVolumeMute size={14} aria-hidden="true" />
            {t('calls.silence')}
          </button>
        </div>
      </div>
    </div>
  );
}
