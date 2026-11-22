import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaCheck,
  FaCog,
  FaCompressAlt,
  FaDesktop,
  FaFilm,
  FaLaptop,
  FaMagic,
  FaMicrophone,
  FaMobileAlt,
  FaPhoneAlt,
  FaPhoneSlash,
  FaVideo,
  FaVideoSlash,
} from 'react-icons/fa';
import type { CallModeId } from '../constants/content';
import { DemoAvatar } from './DemoAvatar';
import { IllustratedPerson } from './IllustratedPerson';

interface CallStageProps {
  mode: CallModeId;
  running: boolean;
  labelledBy: string;
  id: string;
  label: string;
}

const START_SECONDS = 2 * 60 + 36;

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function useCallClock(running: boolean): string {
  const [seconds, setSeconds] = useState(START_SECONDS);

  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  return formatDuration(seconds);
}

export function CallStage({ mode, running, labelledBy, id, label }: CallStageProps) {
  const { t } = useTranslation('landing');
  const clock = useCallClock(running);
  const withVideo = mode === 'video' || mode === 'share';

  return (
    <div id={id} className="lp-stage" data-mode={mode} data-running={running ? 'true' : undefined} role="tabpanel" aria-labelledby={labelledBy}>
      <div className="lp-stage__screen" role="img" aria-label={label}>
        <span className="lp-stage__orb lp-stage__orb--a" />
        <span className="lp-stage__orb lp-stage__orb--b" />
        <span className="lp-stage__orb lp-stage__orb--c" />

        <div className="lp-stage__top">
          <span className="lp-stage__pill">
            <span className="lp-stage__pill-icon">
              <FaCompressAlt size={10} />
            </span>
            <strong className="lp-stage__pill-name">{t('calls.stage.name')}</strong>
            <span className="lp-stage__pill-live" />
            <span className="lp-stage__pill-time">
              {withVideo ? <FaVideo size={10} /> : <FaPhoneAlt size={9} />}
              {clock}
            </span>
          </span>
          <span className="lp-stage__quality">
            <span />
            <span />
            <span />
          </span>
        </div>

        <div className="lp-stage__body">
        <div className="lp-stage__scene" data-scene="voice">
          <div className="lp-tile lp-tile--voice" data-speaking="true">
            <span className="lp-tile__aura" />
            <span className="lp-tile__avatar">
              <span className="lp-tile__wave" />
              <span className="lp-tile__wave" />
              <DemoAvatar name="Ghost" size={64} />
            </span>
            <span className="lp-tile__label">
              <strong>{t('calls.stage.name')}</strong>
              <span className="lp-tile__status">
                <span className="lp-tile__eq">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                {t('calls.stage.speaking')}
              </span>
            </span>
          </div>
          <div className="lp-tile lp-tile--voice" data-person="you">
            <span className="lp-tile__aura" />
            <span className="lp-tile__chip">
              <FaMagic size={9} /> {t('calls.stage.noise')}
            </span>
            <span className="lp-tile__avatar">
              <DemoAvatar name="Cat" size={64} />
            </span>
            <span className="lp-tile__label">
              <strong>{t('calls.stage.you')}</strong>
              <span className="lp-tile__status">
                <FaMicrophone size={9} /> {t('calls.stage.micOn')}
              </span>
            </span>
          </div>
        </div>

        <div className="lp-stage__scene" data-scene="video">
          <div className="lp-tile lp-tile--video" data-speaking="true">
            <IllustratedPerson variant="marina" />
            <span className="lp-tile__name">{t('calls.stage.name')}</span>
          </div>
          <div className="lp-tile lp-tile--video">
            <IllustratedPerson variant="you" />
            <span className="lp-tile__name">{t('calls.stage.you')}</span>
          </div>
        </div>

        <div className="lp-stage__scene" data-scene="share">
          <div className="lp-share">
            <div className="lp-share__movie">
              <span className="lp-share__sky" />
              <span className="lp-share__sun" />
              <span className="lp-share__hill lp-share__hill--back" />
              <span className="lp-share__hill lp-share__hill--front" />
              <span className="lp-share__progress">
                <span />
              </span>
            </div>
            <span className="lp-share__live">{t('calls.stage.live')}</span>
            <span className="lp-share__who">{t('calls.stage.sharing')}</span>
            <span className="lp-share__movie-chip">
              <FaFilm size={9} /> {t('calls.stage.movie')}
            </span>
          </div>
          <div className="lp-share__strip">
            <div className="lp-tile lp-tile--video lp-tile--mini" data-speaking="true">
              <IllustratedPerson variant="marina" />
              <span className="lp-tile__name">{t('calls.stage.name')}</span>
            </div>
            <div className="lp-tile lp-tile--video lp-tile--mini">
              <IllustratedPerson variant="you" />
              <span className="lp-tile__name">{t('calls.stage.you')}</span>
            </div>
          </div>
        </div>

        <div className="lp-stage__scene" data-scene="transfer">
          <div className="lp-transfer">
            <div className="lp-transfer__laptop">
              <span className="lp-transfer__display">
                <span className="lp-transfer__mini lp-transfer__call--from">
                  <span className="lp-transfer__mini-tiles">
                    <span className="lp-transfer__mini-tile" data-speaking="true">
                      <DemoAvatar name="Ghost" size={26} />
                    </span>
                    <span className="lp-transfer__mini-tile">
                      <DemoAvatar name="Cat" size={26} />
                    </span>
                  </span>
                  <span className="lp-transfer__mini-bar">
                    <span />
                    <span />
                    <span className="lp-transfer__mini-hang" />
                  </span>
                </span>
              </span>
              <span className="lp-transfer__base" />
              <span className="lp-transfer__label">
                <FaLaptop size={10} /> {t('calls.stage.laptop')}
              </span>
            </div>
            <span className="lp-transfer__path">
              <span className="lp-transfer__dot" />
            </span>
            <div className="lp-transfer__phone">
              <span className="lp-transfer__phone-screen">
                <span className="lp-transfer__statusbar">
                  <span>9:41</span>
                  <span className="lp-transfer__notch" />
                  <span className="lp-transfer__signal" />
                </span>
                <span className="lp-transfer__button">
                  <FaMobileAlt size={9} /> {t('calls.stage.transferHere')}
                </span>
                <span className="lp-transfer__call lp-transfer__call--to">
                  <DemoAvatar name="Ghost" size={22} />
                  <span>{t('calls.stage.name')}</span>
                  <FaPhoneAlt size={8} />
                </span>
                <span className="lp-transfer__done">
                  <FaCheck size={8} /> {t('calls.stage.transferred')}
                </span>
              </span>
              <span className="lp-transfer__label">
                <FaMobileAlt size={10} /> {t('calls.stage.phone')}
              </span>
            </div>
          </div>
        </div>

        </div>

        <div className="lp-dock">
          <span className="lp-dock__btn">
            <FaMicrophone size={13} />
          </span>
          <span className="lp-dock__btn" data-on={withVideo ? 'true' : undefined}>
            {withVideo ? <FaVideo size={13} /> : <FaVideoSlash size={13} />}
          </span>
          <span className="lp-dock__btn" data-on={mode === 'share' ? 'true' : undefined}>
            <FaDesktop size={13} />
          </span>
          <span className="lp-dock__btn lp-dock__btn--settings">
            <FaCog size={13} />
          </span>
          <span className="lp-dock__sep" />
          <span className="lp-dock__hangup">
            <FaPhoneSlash size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}
