import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import {
  FaBolt,
  FaCat,
  FaCheck,
  FaCopy,
  FaFire,
  FaHeart,
  FaLaughSquint,
  FaLink,
  FaMusic,
  FaPhoneAlt,
  FaPlus,
  FaSearch,
  FaStar,
  FaThumbsUp,
  FaUsers,
  FaVideo,
} from 'react-icons/fa';
import { useCycle } from '../hooks/useCycle';
import { BrandMark } from './BrandMark';
import { DemoAvatar } from './DemoAvatar';
import { IllustratedPerson } from './IllustratedPerson';

interface DemoProps {
  active: boolean;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

const REACTION_STEPS: { pick: number | null; chips: [string, number][] }[] = [
  { pick: null, chips: [] },
  { pick: 0, chips: [['❤️', 1]] },
  {
    pick: 1,
    chips: [
      ['❤️', 1],
      ['😂', 1],
    ],
  },
  {
    pick: 0,
    chips: [
      ['❤️', 2],
      ['😂', 1],
    ],
  },
];

function delay(ms: number): CSSProperties {
  return { '--lp-delay': `${ms}ms` } as CSSProperties;
}

export function ReactionsDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');
  const { index, reduced } = useCycle(REACTION_STEPS.length, 1900, active);
  const step = REACTION_STEPS[reduced ? REACTION_STEPS.length - 1 : index] ?? REACTION_STEPS[0];

  return (
    <div className="lp-demo lp-demo--reactions" role="img" aria-label={t('features.demo.reactionsLabel')}>
      <div className="lp-demo__chat" aria-hidden="true">
        <div className="lp-react-bar">
          {QUICK_REACTIONS.map((emoji, position) => (
            <span key={emoji} className="lp-react-bar__item" data-picked={step?.pick === position ? 'true' : undefined}>
              {emoji}
            </span>
          ))}
          <span className="lp-react-bar__item lp-react-bar__more">
            <FaPlus size={11} />
          </span>
        </div>
        <div className="lp-demo-row">
          <DemoAvatar name="Ghost" size={30} />
          <div className="lp-bubble lp-bubble--demo" data-own="false">
            {t('features.demo.reactionsMessage')}
            <span className="lp-bubble__meta">20:14</span>
            {step && step.chips.length > 0 && (
              <span className="lp-react-chips">
                {step.chips.map(([emoji, count]) => (
                  <span key={`${emoji}-${count}`} className="lp-react-chip">
                    <span>{emoji}</span>
                    {count > 1 && <span className="lp-react-chip__count">{count}</span>}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const GIF_SCENES: { icon: IconType; scene: string }[] = [
  { icon: FaHeart, scene: 'beat' },
  { icon: FaLaughSquint, scene: 'wobble' },
  { icon: FaStar, scene: 'spin' },
  { icon: FaMusic, scene: 'bars' },
  { icon: FaFire, scene: 'flicker' },
  { icon: FaThumbsUp, scene: 'pop' },
  { icon: FaCat, scene: 'bounce' },
  { icon: FaBolt, scene: 'flash' },
];

function GifColumn({ scenes, reverse }: { scenes: typeof GIF_SCENES; reverse?: boolean }) {
  const loop = [...scenes, ...scenes];
  return (
    <div className="lp-gif-col" data-reverse={reverse ? 'true' : undefined}>
      <div className="lp-gif-col__track">
        {loop.map((item, position) => {
          const Icon = item.icon;
          return (
            <span key={position} className="lp-gif" data-scene={item.scene} data-tall={position % 3 === 0 ? 'true' : undefined}>
              {item.scene === 'bars' ? (
                <span className="lp-gif__bars">
                  {[0, 1, 2, 3, 4].map((bar) => (
                    <span key={bar} style={delay(bar * 110)} />
                  ))}
                </span>
              ) : (
                <Icon className="lp-gif__icon" />
              )}
              <span className="lp-gif__tag">GIF</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function GifsDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');

  return (
    <div className="lp-demo lp-demo--gifs" data-active={active ? 'true' : undefined} role="img" aria-label={t('features.demo.gifsLabel')}>
      <div className="lp-gif-panel" aria-hidden="true">
        <span className="lp-gif-search">
          <FaSearch size={11} /> {t('features.demo.gifsSearch')}
        </span>
        <div className="lp-gif-grid">
          <GifColumn scenes={GIF_SCENES.slice(0, 4)} />
          <GifColumn scenes={GIF_SCENES.slice(4)} reverse />
        </div>
      </div>
    </div>
  );
}

export function TranslationDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');
  const { index, reduced } = useCycle(2, 3000, active);
  const translated = reduced ? true : index === 1;

  return (
    <div className="lp-demo lp-demo--translate" role="img" aria-label={t('features.demo.translationLabel')}>
      <div className="lp-demo-row" aria-hidden="true">
        <DemoAvatar name="Heart" size={30} />
        <div className="lp-bubble lp-bubble--demo lp-translate" data-own="false">
          <span key={translated ? 'translated' : 'original'} className="lp-translate__swap">
            <span className="lp-translate__text">{translated ? t('features.demo.translationTranslated') : t('features.demo.translationOriginal')}</span>
            <span className="lp-translate__links">
              {translated ? (
                <span className="lp-translate__link">
                  {t('features.demo.translatedFrom')} · <u>{t('features.demo.seeOriginal')}</u>
                </span>
              ) : (
                <span className="lp-translate__link" data-role="original">
                  {t('features.demo.translate')}
                </span>
              )}
            </span>
          </span>
          <span className="lp-bubble__meta">10:02</span>
        </div>
      </div>
    </div>
  );
}

const GROUP_MEMBERS = ['Cat', 'Ghost', 'Heart', 'Robot'];

export function GroupsDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');
  const { index, reduced } = useCycle(3, 2100, active);
  const step = reduced ? 2 : index;
  const copied = step === 1;
  const joined = step === 2;
  const count = GROUP_MEMBERS.length + (joined ? 1 : 0);

  return (
    <div className="lp-demo lp-demo--groups" role="img" aria-label={t('features.demo.groupsLabel')}>
      <div className="lp-group" aria-hidden="true">
        <div className="lp-group__head">
          <span className="lp-group__avatar">
            <FaUsers size={16} />
          </span>
          <span className="lp-group__title">
            <strong>{t('features.demo.groupName')}</strong>
            <span>{t('features.demo.groupMembers', { count })}</span>
          </span>
        </div>
        <div className="lp-group__stack">
          {GROUP_MEMBERS.map((name) => (
            <DemoAvatar key={name} name={name} size={32} />
          ))}
          <span className="lp-group__newcomer" data-shown={joined ? 'true' : undefined}>
            <DemoAvatar name="Crown" size={32} />
          </span>
        </div>
        <div className="lp-group__invite">
          <FaLink size={11} />
          <span className="lp-group__link">{t('features.demo.inviteLink')}</span>
          <span className="lp-group__copy" data-copied={copied ? 'true' : undefined}>
            <span className="lp-group__copy-label" data-role="idle">
              <FaCopy size={10} /> {t('features.demo.copyLink')}
            </span>
            <span className="lp-group__copy-label" data-role="done">
              <FaCheck size={10} /> {t('features.demo.linkCopied')}
            </span>
          </span>
        </div>
        <span className="lp-group__event" data-shown={joined ? 'true' : undefined}>
          {t('features.demo.joined')}
        </span>
      </div>
    </div>
  );
}

export function InstallDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');
  const { index, reduced } = useCycle(3, 2200, active);
  const step = reduced ? 2 : index;

  return (
    <div className="lp-demo lp-demo--install" role="img" aria-label={t('features.demo.installLabel')}>
      <div className="lp-lock" aria-hidden="true">
        <span className="lp-lock__island" />
        <span className="lp-lock__time">{t('features.demo.lockTime')}</span>
        <span className="lp-lock__date">{t('features.demo.lockDate')}</span>
        <div className="lp-lock__stack">
          <div className="lp-push" data-shown={step >= 1 ? 'true' : undefined}>
            <span className="lp-push__app">
              <BrandMark />
            </span>
            <span className="lp-push__body">
              <span className="lp-push__top">
                <strong>Marina</strong>
                <span>{t('features.demo.now')}</span>
              </span>
              <span className="lp-push__text">
                <FaVideo size={10} /> {t('features.demo.pushCall')}
              </span>
            </span>
            <span className="lp-push__answer">
              <FaPhoneAlt size={10} />
              <span className="lp-sr-only">{t('features.demo.pushAnswer')}</span>
            </span>
          </div>
          <div className="lp-push" data-shown={step >= 2 ? 'true' : undefined}>
            <span className="lp-push__app">
              <BrandMark />
            </span>
            <span className="lp-push__body">
              <span className="lp-push__top">
                <strong>Camila</strong>
                <span>{t('features.demo.now')}</span>
              </span>
              <span className="lp-push__text">{t('features.demo.pushMessage')}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhotoDemo({ active }: DemoProps) {
  const { t } = useTranslation('landing');
  const { index, reduced } = useCycle(3, 2000, active);
  const step = reduced ? 2 : index;
  const phase = step === 0 ? 'avatar' : step === 1 ? 'crop' : 'done';

  return (
    <div className="lp-demo lp-demo--photo" role="img" aria-label={t('features.demo.photosLabel')}>
      <div className="lp-photo" data-phase={phase} aria-hidden="true">
        <span className="lp-photo__avatar">
          <DemoAvatar name="Cat" size={92} />
        </span>
        <span className="lp-photo__crop">
          <IllustratedPerson variant="you" />
          <span className="lp-photo__mask" />
          <span className="lp-photo__grid" />
        </span>
        <span className="lp-photo__done">
          <FaCheck size={11} />
        </span>
      </div>
    </div>
  );
}
