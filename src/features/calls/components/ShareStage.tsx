import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCompress, FaExpand, FaMicrophoneSlash } from 'react-icons/fa';
import { MdOpenInNew, MdPictureInPictureAlt, MdScreenShare } from 'react-icons/md';
import { AVATAR_ICON_COLOR, type AVATARS } from '@features/auth/constants/avatars';
import { OverlayVisibility, resolveFocus, stripItems, type StageItem } from '../lib/stage-focus';
import { useStreamOn } from './call-hooks';

interface StreamVideoProps {
  stream: MediaStream | null;
  mirror?: boolean;
  fit?: 'contain' | 'cover';
  videoRef?: RefObject<HTMLVideoElement | null>;
  label?: string;
}

function StreamVideo({ stream, mirror = false, fit = 'cover', videoRef, label }: StreamVideoProps) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
  useStreamOn(ref, stream);
  return <video ref={ref} autoPlay playsInline muted aria-label={label} className="sc-stage-video" style={{ objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined }} />;
}

interface Person {
  name: string;
  avatar: (typeof AVATARS)[number] | undefined;
  stream: MediaStream | null;
  speaking: boolean;
  muted: boolean;
}

export interface ShareStageProps {
  stream: MediaStream | null;
  local: boolean;
  title: string;
  detail: string;
  remote: Person;
  self: Person | null;
  myScreen: MediaStream | null;
  stageRef: RefObject<HTMLDivElement | null>;
  streamVideoRef: RefObject<HTMLVideoElement | null>;
  fullscreen: { available: boolean; active: boolean; toggle: () => void };
  pip: { available: boolean; open: boolean; toggle: () => void };
  previewHidden: boolean;
  streamWindow: { open: boolean; onOpen: () => void } | null;
  onStop: (() => void) | null;
}

function Avatar({ person, size }: { person: Person; size: number }) {
  return (
    <div className="sc-stage-avatar" style={{ width: `${size}px`, height: `${size}px`, background: person.avatar?.bgGradient }}>
      {person.avatar ? <person.avatar.icon size={Math.round(size / 2)} color={AVATAR_ICON_COLOR} /> : null}
    </div>
  );
}

export function ShareStage({ stream, local, title, detail, remote, self, myScreen, stageRef, streamVideoRef, fullscreen, pip, previewHidden, streamWindow, onStop }: ShareStageProps) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState<StageItem>('stream');
  const [overlay, setOverlay] = useState(false);
  const visibilityRef = useRef<OverlayVisibility | null>(null);
  visibilityRef.current ??= new OverlayVisibility(setOverlay);
  const items = { stream: stream !== null, self: self !== null, myScreen: myScreen !== null };
  const current = resolveFocus(focus, items);
  const strip = stripItems(focus, items);

  useEffect(() => () => visibilityRef.current?.dispose(), []);

  const mutedBadge = (
    <span className="sc-call-muted-badge sc-call-muted-badge--small" role="img" aria-label={t('calls.mutedBadge')}>
      <FaMicrophoneSlash size={11} />
    </span>
  );

  const personView = (person: Person, mirror: boolean, size: number) =>
    person.stream ? <StreamVideo stream={person.stream} mirror={mirror} /> : <Avatar person={person} size={size} />;

  const streamView = () => {
    if (local && previewHidden) {
      return (
        <div className="sc-stage-placeholder">
          <MdScreenShare size={34} aria-hidden="true" />
          <span>{t('calls.share.banner')}</span>
        </div>
      );
    }
    return <StreamVideo stream={stream} fit="contain" label={title} />;
  };

  const mainView = (): ReactNode => {
    switch (current) {
      case 'stream':
        return streamView();
      case 'remote':
        return personView(remote, false, 96);
      case 'self':
        return self ? personView(self, true, 96) : null;
      case 'my-screen':
        return <StreamVideo stream={myScreen} fit="contain" label={t('calls.share.yourScreen')} />;
    }
  };

  const tile = (item: StageItem) => {
    const common = { type: 'button' as const, onClick: () => setFocus(item) };
    switch (item) {
      case 'stream':
        return (
          <button key={item} {...common} className="sc-call-tile sc-call-tile--screen" aria-label={title}>
            {local && previewHidden ? <MdScreenShare size={22} aria-hidden="true" /> : <StreamVideo stream={stream} fit="contain" />}
            <span className="sc-stage-live sc-stage-live--small">{t('calls.share.live')}</span>
          </button>
        );
      case 'remote':
        return (
          <button key={item} {...common} className={`sc-call-tile${remote.speaking ? ' sc-call-speaking' : ''}`} aria-label={remote.name}>
            {personView(remote, false, 44)}
            <span className="sc-call-chip">
              <span>{remote.name}</span>
            </span>
            {remote.muted && mutedBadge}
          </button>
        );
      case 'self':
        return self ? (
          <button key={item} {...common} className={`sc-call-tile${self.speaking ? ' sc-call-speaking' : ''}`} aria-label={t('calls.you')}>
            {personView(self, true, 44)}
            <span className="sc-call-chip">
              <span>{t('calls.you')}</span>
            </span>
            {self.muted && mutedBadge}
          </button>
        ) : null;
      case 'my-screen':
        return (
          <button key={item} {...common} className="sc-call-tile sc-call-tile--screen" aria-label={t('calls.share.yourScreen')}>
            <StreamVideo stream={myScreen} fit="contain" />
            <span className="sc-call-chip">
              <span>{t('calls.share.yourScreen')}</span>
            </span>
          </button>
        );
    }
  };

  const visibility = visibilityRef.current;
  const fullscreenLabel = fullscreen.active ? t('calls.share.exitFullscreen') : t('calls.share.fullscreen');

  return (
    <div className="sc-stage-wrap">
      <div
        ref={stageRef}
        className="sc-call-stage"
        data-overlay={overlay}
        data-focus={current}
        data-fullscreen-control={fullscreen.available}
        onPointerMove={(event) => {
          if (event.pointerType === 'mouse') {
            visibility.activity();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') {
            visibility.hide();
          }
        }}
        onFocus={() => visibility.holdOpen(true)}
        onBlur={() => visibility.holdOpen(false)}
      >
        <div className="sc-stage-pip-source" aria-hidden="true">
          <StreamVideo stream={stream} fit="contain" videoRef={streamVideoRef} />
        </div>
        <div
          key={current}
          className="sc-stage-main"
          onDoubleClick={() => {
            if (fullscreen.available) {
              fullscreen.toggle();
            }
          }}
          onClick={(event) => {
            if (current !== 'stream' && items.stream) {
              setFocus('stream');
              return;
            }
            if ((event.nativeEvent as PointerEvent).pointerType !== 'mouse') {
              visibility.toggle();
            }
          }}
        >
          {mainView()}
        </div>
        {fullscreen.available && (
          <button
            type="button"
            className="sc-stage-fullscreen"
            onClick={fullscreen.toggle}
            onPointerEnter={() => visibility.holdOpen(true)}
            onPointerLeave={() => visibility.holdOpen(false)}
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
          >
            <span key={fullscreen.active ? 'compress' : 'expand'} className="sc-call-icon-swap">
              {fullscreen.active ? <FaCompress size={15} /> : <FaExpand size={15} />}
            </span>
          </button>
        )}
        <div className="sc-stage-badges">
          <span className="sc-stage-live">{t('calls.share.live')}</span>
          <span className="sc-stage-chip" title={`${title} · ${detail}`}>
            <span>
              <strong>{title}</strong> · {detail}
            </span>
          </span>
        </div>
        {strip.length > 0 && <div className="sc-stage-tiles">{strip.map((item) => tile(item))}</div>}
        <div className="sc-stage-overlay" onPointerEnter={() => visibility.holdOpen(true)} onPointerLeave={() => visibility.holdOpen(false)}>
          <div className="sc-stage-overlay__group">
            {streamWindow && !streamWindow.open && (
              <button type="button" className="sc-stage-icon" onClick={streamWindow.onOpen} title={t('calls.share.openWindow')} aria-label={t('calls.share.openWindow')}>
                <MdOpenInNew size={17} />
              </button>
            )}
            {pip.available && (
              <button type="button" className="sc-stage-icon" onClick={pip.toggle} aria-pressed={pip.open} title={pip.open ? t('calls.pip.close') : t('calls.pip.open')} aria-label={pip.open ? t('calls.pip.close') : t('calls.pip.open')}>
                <MdPictureInPictureAlt size={17} />
              </button>
            )}
            {onStop && (
              <button type="button" className="sc-call-pill-btn" onClick={onStop}>
                {t('calls.share.stopShort')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
