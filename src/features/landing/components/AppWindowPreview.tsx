import type { CSSProperties } from 'react';
import {
  FaArrowLeft,
  FaCheckDouble,
  FaFilePdf,
  FaLock,
  FaMicrophone,
  FaPaperclip,
  FaPlay,
  FaPlus,
  FaThumbtack,
  FaUser,
} from 'react-icons/fa';
import { DemoAvatar } from './DemoAvatar';

interface AppWindowPreviewProps {
  wallpaper: string | null;
}

const CONVERSATIONS = [
  {
    avatar: 'Robot',
    name: 'SparkAI',
    preview: 'Por aqui tá tudo ótimo, pronto pra ajudar!',
    time: '13:47',
    pinned: true,
  },
  {
    avatar: 'Ghost',
    name: 'Marina',
    preview: 'Ficou ótimo! Só vou trocar a trilha',
    time: '19:24',
    selected: true,
  },
  {
    avatar: 'Heart',
    name: 'Camila',
    preview: 'Combinado, às 19h então 😄',
    time: '18:02',
    unread: 2,
  },
  {
    avatar: 'Crown',
    name: 'Rafael',
    preview: 'Vi sim! Amanhã cedo te mando',
    time: '17:40',
  },
];

const WAVEFORM = [6, 12, 18, 9, 22, 14, 8, 19, 24, 11, 16, 7, 20, 13, 9, 17, 23, 10, 15, 6, 18, 12];

function stagger(index: number): CSSProperties {
  return { '--sc-stagger-index': index } as CSSProperties;
}

export function AppWindowPreview({ wallpaper }: AppWindowPreviewProps) {
  return (
    <div
      className="lp-monitor"
      role="img"
      aria-label="Prévia do SparkChat num computador: lista de conversas ao lado de um chat com Marina, com mensagens de texto, um PDF e um áudio"
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
                    <strong>Você</strong>
                    <span>Disponível</span>
                  </div>
                </div>
                <span className="lp-window__new-chat">
                  <FaPlus size={11} /> Novo chat
                </span>
              </div>
              <span className="lp-window__list-label">Conversas</span>
              <ul className="lp-window__list">
                {CONVERSATIONS.map((conversation) => (
                  <li key={conversation.name} className="lp-window__item" data-selected={conversation.selected ? 'true' : undefined}>
                    <DemoAvatar name={conversation.avatar} size={36} online />
                    <div className="lp-window__item-text">
                      <span className="lp-window__item-top">
                        <strong>{conversation.name}</strong>
                        <span>
                          {conversation.pinned && <FaThumbtack size={9} />} {conversation.time}
                        </span>
                      </span>
                      <span className="lp-window__item-bottom">
                        <span>{conversation.preview}</span>
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
                  <span>
                    <span className="lp-window__online-dot" /> Online
                  </span>
                </div>
                <span className="lp-window__round lp-window__round--end">
                  <FaUser size={12} />
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
                  Oi! Fechou a data da viagem?
                  <span className="lp-bubble__meta">19:08</span>
                </div>
                <div className="lp-bubble sc-anim-rise-in sc-stagger" data-own="true" style={stagger(3)}>
                  Fechou sim, dia 12 a gente sai cedo
                  <span className="lp-bubble__meta">
                    19:12 <FaCheckDouble size={11} className="lp-bubble__read" />
                  </span>
                </div>
                <div className="lp-bubble lp-bubble--file sc-anim-rise-in sc-stagger" data-own="false" style={stagger(5)}>
                  <span className="lp-bubble__file">
                    <span className="lp-bubble__file-icon">
                      <FaFilePdf size={16} />
                    </span>
                    <span>
                      <strong>roteiro-da-viagem.pdf</strong>
                      <span>1 página</span>
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
                <span className="lp-window__input">Digite sua mensagem...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
