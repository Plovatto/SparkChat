import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaArrowLeft,
  FaCheckDouble,
  FaDownload,
  FaFilePdf,
  FaLock,
  FaMicrophone,
  FaPaperclip,
  FaPlay,
  FaPhoneAlt,
  FaPlus,
  FaThumbtack,
  FaUsers,
  FaVideo,
} from 'react-icons/fa';
import { DemoAvatar } from './DemoAvatar';

interface AppWindowPreviewProps {
  wallpaper: string | null;
}

interface DemoConversation {
  avatar: string | null;
  name: string;
  preview: 'assistant' | 'marina' | 'camila' | 'group';
  time: string;
  pinned?: boolean;
  selected?: boolean;
  unread?: number;
}

const CONVERSATIONS: DemoConversation[] = [
  {
    avatar: 'Robot',
    name: 'SparkAI',
    preview: 'assistant',
    time: '13:47',
    pinned: true,
  },
  {
    avatar: 'Ghost',
    name: 'Marina',
    preview: 'marina',
    time: '19:24',
    selected: true,
  },
  {
    avatar: 'Heart',
    name: 'Camila',
    preview: 'camila',
    time: '18:02',
    unread: 2,
  },
  {
    avatar: null,
    name: 'group',
    preview: 'group',
    time: '17:40',
    unread: 5,
  },
];

const BURST = [0, 45, 90, 135, 180, 225, 270, 315];

const WAVEFORM = [6, 12, 18, 9, 22, 14, 8, 19, 24, 11, 16, 7, 20, 13, 9, 17, 23, 10, 15, 6, 18, 12];

function stagger(index: number): CSSProperties {
  return { '--sc-stagger-index': index } as CSSProperties;
}

export function AppWindowPreview({ wallpaper }: AppWindowPreviewProps) {
  const { t } = useTranslation('landing');

  return (
    <div
      className="lp-monitor"
      role="img"
      aria-label={t('preview.windowLabel')}
    >
      <div className="lp-monitor__frame" aria-hidden="true">
        <span className="lp-monitor__camera" />
        <div className="lp-monitor__screen">
          <div className="lp-monitor__bar">
            <span className="lp-monitor__dots">
              <span />
              <span />
              <span />
            </span>
            <span className="lp-monitor__address">
              <FaLock size={9} /> sparkchat.plovatto.dev
            </span>
          </div>
          <div className="lp-window">
            <div className="lp-window__sidebar">
              <div className="lp-window__profile">
                <div className="lp-window__me">
                  <DemoAvatar name="Cat" size={40} online />
                  <div>
                    <strong>{t('preview.you')}</strong>
                    <span>{t('preview.available')}</span>
                  </div>
                </div>
                <span className="lp-window__new-chat">
                  <FaPlus size={11} /> {t('preview.newChat')}
                </span>
              </div>
              <span className="lp-window__list-label">{t('preview.conversations')}</span>
              <ul className="lp-window__list">
                {CONVERSATIONS.map((conversation, position) => (
                  <li key={conversation.name} className="lp-window__item" style={{ '--lp-item-index': position } as CSSProperties} data-selected={conversation.selected ? 'true' : undefined}>
                    {conversation.avatar ? (
                      <DemoAvatar name={conversation.avatar} size={36} online />
                    ) : (
                      <span className="lp-window__group-avatar">
                        <FaUsers size={15} />
                      </span>
                    )}
                    <div className="lp-window__item-text">
                      <span className="lp-window__item-top">
                        <strong>{conversation.avatar ? conversation.name : t('preview.groupName')}</strong>
                        <span>
                          {conversation.pinned && <FaThumbtack size={9} />} {conversation.time}
                        </span>
                      </span>
                      <span className="lp-window__item-bottom">
                        <span>{t(`preview.list.${conversation.preview}`)}</span>
                        {conversation.unread && <span className="lp-window__badge">{conversation.unread}</span>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-window__chat">
              <div className="lp-window__chat-header">
                <span className="lp-window__round">
                  <FaArrowLeft size={12} />
                </span>
                <DemoAvatar name="Ghost" size={38} online />
                <div className="lp-window__chat-title">
                  <strong>Marina</strong>
                  <span className="lp-window__status">{t('preview.marinaStatus')}</span>
                </div>
                <span className="lp-window__round lp-window__round--end" title={t('preview.voiceCall')}>
                  <FaPhoneAlt size={11} />
                </span>
                <span className="lp-window__round" title={t('preview.videoCall')}>
                  <FaVideo size={12} />
                </span>
              </div>

              <div
                className="lp-window__messages"
                style={
                  wallpaper
                    ? {
                        background: wallpaper,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : undefined
                }
              >
                <div className="lp-bubble sc-anim-rise-in sc-stagger" data-own="false" style={stagger(1)}>
                  {t('preview.chat.question')}
                  <span className="lp-bubble__meta">19:08</span>
                </div>
                <div className="lp-bubble lp-bubble--reacted sc-anim-rise-in sc-stagger" data-own="true" style={stagger(3)}>
                  {t('preview.chat.answer')}
                  <span className="lp-bubble__meta">
                    19:12 <FaCheckDouble size={11} className="lp-bubble__read" />
                  </span>
                  <span className="lp-react-chip lp-react-chip--hero">
                    ❤️
                    <span className="lp-burst">
                      {BURST.map((angle) => (
                        <span key={angle} style={{ '--lp-angle': `${angle}deg` } as CSSProperties} />
                      ))}
                    </span>
                  </span>
                </div>
                <div className="lp-bubble lp-bubble--file sc-anim-rise-in sc-stagger" data-own="false" style={stagger(5)}>
                  <span className="lp-pdf">
                    <span className="lp-pdf__thumb" aria-hidden="true">
                      <span className="lp-pdf__page">
                        <span className="lp-pdf__band" />
                        <span className="lp-pdf__title">{t('preview.pdfTitle')}</span>
                        <span className="lp-pdf__row">
                          <span className="lp-pdf__lines">
                            <span />
                            <span />
                            <span />
                          </span>
                          <span className="lp-pdf__map">
                            <span className="lp-pdf__route" />
                            <span className="lp-pdf__pin" />
                            <span className="lp-pdf__pin lp-pdf__pin--end" />
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="lp-bubble__file">
                      <span className="lp-bubble__file-icon">
                        <FaFilePdf size={16} />
                      </span>
                      <span className="lp-pdf__info">
                        <strong>{t('preview.pdfName')}</strong>
                        <span>{t('preview.page')} · 248 KB</span>
                      </span>
                      <span className="lp-pdf__download">
                        <FaDownload size={10} />
                      </span>
                    </span>
                  </span>
                  <span className="lp-bubble__meta">19:16</span>
                </div>
                <div className="lp-bubble lp-bubble--audio sc-anim-rise-in sc-stagger" data-own="true" style={stagger(7)}>
                  <span className="lp-bubble__audio">
                    <span className="lp-bubble__play">
                      <FaPlay size={10} />
                    </span>
                    <span className="lp-bubble__wave">
                      {WAVEFORM.map((height, index) => (
                        <span key={index} style={{ height }} />
                      ))}
                    </span>
                    <span className="lp-bubble__duration">0:09</span>
                  </span>
                  <span className="lp-bubble__meta">
                    19:20 <FaCheckDouble size={11} className="lp-bubble__read" />
                  </span>
                </div>
                <div className="lp-bubble lp-bubble--typing sc-anim-rise-in sc-stagger" data-own="false" style={stagger(10)}>
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="lp-typing-dot sc-anim-typing-dot"
                      style={{ '--sc-anim-delay': `${dot * 160}ms` } as CSSProperties}
                    />
                  ))}
                </div>
              </div>

              <div className="lp-window__composer">
                <span className="lp-window__round lp-window__round--soft">
                  <FaPaperclip size={12} />
                </span>
                <span className="lp-window__round lp-window__round--soft">
                  <FaMicrophone size={12} />
                </span>
                <span className="lp-window__input">{t('preview.composer')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
