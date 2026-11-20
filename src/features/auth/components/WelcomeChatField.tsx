import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaHeart } from 'react-icons/fa';
import { LuCat, LuGhost, LuRocket } from 'react-icons/lu';
import { useWelcomeConversation } from '../hooks/useWelcomeConversation';
import { WELCOME_SCENES, type WelcomeAvatar, type WelcomeBubbleSpec, type WelcomeBubbleState, type WelcomeScene, type WelcomeSceneId } from '../lib/welcome-script';

const AVATAR_ICONS: Record<WelcomeAvatar, ReactNode> = {
  ghost: <LuGhost size={13} />,
  cat: <LuCat size={13} />,
  rocket: <LuRocket size={13} />,
};

const SPARKLES = [
  { x: 0.2, y: 0.14, size: 17, delay: 0 },
  { x: 0.7, y: 0.11, size: 12, delay: 1.4 },
  { x: 0.11, y: 0.57, size: 11, delay: 2.6 },
  { x: 0.9, y: 0.48, size: 19, delay: 0.7 },
  { x: 0.7, y: 0.88, size: 14, delay: 3.1 },
  { x: 0.33, y: 0.92, size: 8, delay: 1.9 },
  { x: 0.95, y: 0.2, size: 8, delay: 4.2 },
  { x: 0.04, y: 0.86, size: 10, delay: 2.2 },
];

function Sparkle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0c.6 5.6 3.4 9.4 12 12-8.6 2.6-11.4 6.4-12 12-.6-5.6-3.4-9.4-12-12C8.6 9.4 11.4 5.6 12 0Z" />
    </svg>
  );
}

function TypingDots() {
  return (
    <span className="welcome-typing" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

interface BubbleBodyProps {
  variant: 'incoming' | 'outgoing' | 'typing';
  contentKey: string;
  children: ReactNode;
}

function BubbleBody({ variant, contentKey, children }: BubbleBodyProps) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const next = node.offsetWidth;
      if (next > 0) {
        setWidth(next);
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [contentKey]);

  return (
    <span className={`welcome-bubble welcome-bubble--${variant}`} style={width ? { width } : undefined}>
      <span ref={measureRef} className="welcome-bubble__measure">
        {children}
      </span>
      <span key={contentKey} className="welcome-bubble__content">
        {children}
      </span>
    </span>
  );
}

function slotStyle(spec: WelcomeBubbleSpec): CSSProperties {
  return {
    '--welcome-x': spec.x,
    '--welcome-y': spec.y,
    '--welcome-float-index': spec.float,
    ...(spec.compact ? { '--welcome-cy': spec.compact.y } : {}),
  } as CSSProperties;
}

interface WelcomeBubbleProps {
  spec: WelcomeBubbleSpec;
  state: WelcomeBubbleState;
  reactions: number;
}

function WelcomeBubble({ spec, state, reactions }: WelcomeBubbleProps) {
  const { t } = useTranslation();
  const hidden = state.phase === 'hidden';
  const typing = state.phase === 'typing';
  const lineKey = spec.lineKeys[state.line];

  let body: ReactNode;
  if (spec.kind === 'reaction') {
    body = (
      <span className="welcome-reaction">
        <span key={`heart-${reactions}`} className="welcome-reaction__heart">
          <FaHeart size={10} />
        </span>
        <span key={`count-${reactions}`} className="welcome-reaction__count">
          {reactions}
        </span>
      </span>
    );
  } else if (spec.kind === 'typing' || typing) {
    body = (
      <BubbleBody variant="typing" contentKey="typing">
        <TypingDots />
      </BubbleBody>
    );
  } else {
    body = (
      <BubbleBody variant={spec.kind} contentKey={`${state.line}-${state.sends}`}>
        {lineKey ? t(lineKey) : null}
      </BubbleBody>
    );
  }

  const className = [
    'welcome-slot',
    `welcome-slot--${spec.side}`,
    `welcome-slot--${spec.kind}`,
    spec.compact ? `welcome-slot--compact-${spec.compact.band} welcome-slot--compact-${spec.compact.align}` : 'welcome-slot--wide-only',
  ].join(' ');

  return (
    <div className={className} style={slotStyle(spec)} data-state={state.phase}>
      <div className="welcome-slot__float">
        {!hidden && (
          <div key={spec.kind === 'outgoing' ? `send-${state.sends}` : 'stay'} className="welcome-slot__enter">
            {spec.avatar && <span className={`welcome-avatar welcome-avatar--${spec.avatar}`}>{AVATAR_ICONS[spec.avatar]}</span>}
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

interface WelcomeConversationProps {
  scene: WelcomeScene;
  reducedMotion: boolean;
}

function WelcomeConversation({ scene, reducedMotion }: WelcomeConversationProps) {
  const conversation = useWelcomeConversation(scene.bubbles, scene.liveOrder, reducedMotion);

  return (
    <>
      {scene.bubbles.map((spec) => {
        const state = conversation.bubbles[spec.id];
        return state ? <WelcomeBubble key={spec.id} spec={spec} state={state} reactions={conversation.reactions} /> : null;
      })}
    </>
  );
}

interface WelcomeChatFieldProps {
  sceneId: WelcomeSceneId;
  reducedMotion: boolean;
  showConversation: boolean;
}

export function WelcomeChatField({ sceneId, reducedMotion, showConversation }: WelcomeChatFieldProps) {
  return (
    <div className="welcome-field" aria-hidden="true">
      <div className="welcome-field__glow welcome-field__glow--a" />
      <div className="welcome-field__glow welcome-field__glow--b" />
      <div className="welcome-field__glow welcome-field__glow--c" />
      {SPARKLES.map((sparkle) => (
        <span
          key={`${sparkle.x}-${sparkle.y}`}
          className="welcome-sparkle"
          style={{ '--welcome-sx': sparkle.x, '--welcome-sy': sparkle.y, '--welcome-sd': `${sparkle.delay}s` } as CSSProperties}
        >
          <Sparkle size={sparkle.size} />
        </span>
      ))}
      {showConversation && <WelcomeConversation key={sceneId} scene={WELCOME_SCENES[sceneId]} reducedMotion={reducedMotion} />}
    </div>
  );
}
