import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LuBellOff, LuPhone, LuPhoneOff, LuVideo } from 'react-icons/lu';
import { Avatar } from '@features/profile-photos/components/Avatar';
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

function Sonar({ className }: { className: string }) {
  return (
    <>
      <span className={`${className} ${className}--1`} aria-hidden="true" />
      <span className={`${className} ${className}--2`} aria-hidden="true" />
      <span className={`${className} ${className}--3`} aria-hidden="true" />
    </>
  );
}

export function IncomingCallModal() {
  const { t } = useTranslation();
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
  const stage = usePresence(ringing, 420, 200);
  const lastRef = useRef<{ kind: CallKind; peerId: string | null } | null>(null);
  if (ringing && state.kind) {
    lastRef.current = { kind: state.kind, peerId: state.peerId };
  }

  useEffect(() => {
    if (!ringing) {
      return;
    }
    const answerButton = answerRef.current;
    if (answerButton) {
      answerButton.focus({ preventScroll: true });
      answerButton.dataset.autofocus = 'true';
    }
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
  const titleId = 'sc-incoming-title';
  const kindId = 'sc-incoming-kind';
  const kindLabel = translate(`calls.incomingKind.${shown.kind}`);
  const KindIcon = shown.kind === 'video' ? LuVideo : LuPhone;
  const answer = () => {
    call.primePlayback();
    call.accept();
  };
  const clearAutofocus = (event: FocusEvent<HTMLButtonElement>) => {
    delete event.currentTarget.dataset.autofocus;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      answer();
    }
  };

  if (wide) {
    const card = (
      <div
        role="alertdialog"
        aria-labelledby={titleId}
        aria-describedby={kindId}
        className={`sc-ring-card${docked ? ' sc-ring-card--docked' : ''}`}
        data-state={visualStage}
        data-kind={shown.kind}
        onKeyDown={onKeyDown}
      >
        <span className="sc-ring-card__tint" aria-hidden="true" />
        <div className="sc-ring-card__head">
          <span className="sc-ring-card__halo">
            <Sonar className="sc-ring-card__wave" />
            <Avatar userId={peer ? shown.peerId : null} avatarIndex={peer?.avatar} size={52} iconSize={24} className="sc-ring-card__avatar" style={{ width: undefined, height: undefined }} />
          </span>
          <div className="sc-ring-card__text">
            <span id={kindId} className="sc-ring-card__kind">
              <KindIcon size={13} aria-hidden="true" />
              <span>{kindLabel}</span>
            </span>
            <h2 id={titleId} className="sc-ring-card__name" title={peer?.name ?? ''}>
              {peer?.name ?? ''}
            </h2>
            <span className="sc-ring-card__status" aria-live="polite">
              {t('calls.status.ringing')}
            </span>
          </div>
          <button type="button" className="sc-ring-card__silence" onClick={call.silence} title={t('calls.silence')} aria-label={t('calls.silence')}>
            <LuBellOff size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="sc-ring-card__actions">
          <button type="button" className="sc-ring-card__btn sc-ring-card__btn--decline" onClick={call.decline}>
            <LuPhoneOff size={18} aria-hidden="true" />
            <span>{t('calls.decline')}</span>
          </button>
          <button ref={answerRef} type="button" className="sc-ring-card__btn sc-ring-card__btn--answer" onClick={answer} onBlur={clearAutofocus}>
            <KindIcon size={18} aria-hidden="true" className="sc-ring-card__ring-icon" />
            <span>{t('calls.answer')}</span>
          </button>
        </div>
      </div>
    );
    return docked ? createPortal(card, slot) : card;
  }

  return (
    <div role="alertdialog" aria-labelledby={titleId} aria-describedby={kindId} className="sc-ring" data-state={visualStage} data-kind={shown.kind} onKeyDown={onKeyDown}>
      <div className="sc-ring__bg" aria-hidden="true">
        <span className="sc-ring__glow sc-ring__glow--a" />
        <span className="sc-ring__glow sc-ring__glow--b" />
        <span className="sc-ring__glow sc-ring__glow--c" />
      </div>
      <div className="sc-ring__top">
        <span id={kindId} className="sc-ring__chip">
          <KindIcon size={15} aria-hidden="true" />
          <span>{kindLabel}</span>
        </span>
      </div>
      <div className="sc-ring__hero">
        <span className="sc-ring__halo">
          <Sonar className="sc-ring__wave" />
          <Avatar userId={peer ? shown.peerId : null} avatarIndex={peer?.avatar} size={128} iconSize={52} className="sc-ring__avatar" style={{ width: undefined, height: undefined }} />
        </span>
        <h2 id={titleId} className="sc-ring__name">
          {peer?.name ?? ''}
        </h2>
        <span className="sc-ring__status" aria-live="polite">
          {t('calls.status.ringing')}
        </span>
      </div>
      <div className="sc-ring__dock">
        <div className="sc-ring__actions">
          <button type="button" className="sc-ring__action sc-ring__action--decline" onClick={call.decline}>
            <span className="sc-ring__circle" aria-hidden="true">
              <LuPhoneOff size={30} />
            </span>
            <span className="sc-ring__label">{t('calls.decline')}</span>
          </button>
          <button ref={answerRef} type="button" className="sc-ring__action sc-ring__action--answer" onClick={answer} onBlur={clearAutofocus}>
            <span className="sc-ring__circle" aria-hidden="true">
              <KindIcon size={30} className="sc-ring__ring-icon" />
            </span>
            <span className="sc-ring__label">{t('calls.answer')}</span>
          </button>
        </div>
        <button type="button" className="sc-ring__silence" onClick={call.silence}>
          <LuBellOff size={16} aria-hidden="true" />
          {t('calls.silence')}
        </button>
      </div>
    </div>
  );
}
