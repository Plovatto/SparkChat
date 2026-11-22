import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle } from 'react-icons/fa';
import { CALL_FACT_IDS, CALL_MODES, type CallModeId } from '../constants/content';
import { useCycle } from '../hooks/useCycle';
import { useInView } from '../hooks/useInView';
import { CallStage } from './CallStage';

const CYCLE_MS = 6500;
const STAGE_ID = 'chamadas-palco';

export function CallsShowcase() {
  const { t } = useTranslation('landing');
  const { ref, inView } = useInView<HTMLElement>('-15% 0px');
  const [picked, setPicked] = useState<CallModeId | null>(null);
  const [paused, setPaused] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const autoplay = inView && picked === null && !paused;
  const { index, reduced } = useCycle(CALL_MODES.length, CYCLE_MS, autoplay);
  const mode = picked ?? CALL_MODES[index]?.id ?? 'voice';
  const activeIndex = Math.max(
    0,
    CALL_MODES.findIndex((item) => item.id === mode),
  );
  const showProgress = picked === null && !reduced;
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (autoplay) {
      setRunId((value) => value + 1);
    }
  }, [autoplay]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    let target: number | null = null;
    if (event.key in keys) {
      target = (activeIndex + (keys[event.key] ?? 0) + CALL_MODES.length) % CALL_MODES.length;
    } else if (event.key === 'Home') {
      target = 0;
    } else if (event.key === 'End') {
      target = CALL_MODES.length - 1;
    }
    if (target === null) {
      return;
    }
    event.preventDefault();
    const next = CALL_MODES[target];
    if (next) {
      setPicked(next.id);
      tabRefs.current[target]?.focus();
    }
  };

  return (
    <section
      ref={ref}
      id="chamadas"
      className="lp-section lp-section--sunken lp-calls"
      aria-labelledby="chamadas-title"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <div className="lp-container lp-calls__inner">
        <div className="lp-section__intro">
          <h2 id="chamadas-title" className="lp-section__title">
            {t('calls.title')}
          </h2>
          <p className="lp-section__lead">{t('calls.lead')}</p>
        </div>

        <div
          className="lp-calls__tabs"
          role="tablist"
          aria-label={t('calls.modesLabel')}
          style={{ '--lp-tab-index': activeIndex, '--lp-tab-count': CALL_MODES.length } as CSSProperties}
        >
          <span className="lp-calls__indicator" aria-hidden="true">
            {showProgress && (
              <span
                key={`${mode}-${index}-${runId}`}
                className="lp-calls__progress"
                data-paused={autoplay ? undefined : 'true'}
                style={{ '--lp-cycle': `${CYCLE_MS}ms` } as CSSProperties}
              />
            )}
          </span>
          {CALL_MODES.map((item, position) => {
            const Icon = item.icon;
            const selected = item.id === mode;
            return (
              <button
                key={item.id}
                ref={(element) => {
                  tabRefs.current[position] = element;
                }}
                id={`chamadas-tab-${item.id}`}
                type="button"
                role="tab"
                className="lp-calls__tab"
                aria-selected={selected}
                aria-controls={STAGE_ID}
                tabIndex={selected ? 0 : -1}
                onClick={() => setPicked(item.id)}
                onKeyDown={handleKeyDown}
              >
                <Icon size={14} aria-hidden="true" />
                <span>{t(`calls.modes.${item.id}.tab`)}</span>
              </button>
            );
          })}
        </div>

        <div className="lp-calls__visual">
          <CallStage
            id={STAGE_ID}
            mode={mode}
            running={inView}
            labelledBy={`chamadas-tab-${mode}`}
            label={t('calls.stageLabel', { mode: t(`calls.modes.${mode}.title`) })}
          />
        </div>

        <div className="lp-calls__caption">
          <div key={mode} className="lp-calls__caption-body">
            <h3 className="lp-calls__caption-title">{t(`calls.modes.${mode}.title`)}</h3>
            <p className="lp-calls__caption-text">{t(`calls.modes.${mode}.text`)}</p>
          </div>
        </div>

        <ul className="lp-calls__facts">
          {CALL_FACT_IDS.map((id) => (
            <li key={id}>
              <FaCheckCircle size={13} aria-hidden="true" />
              {t(`calls.facts.${id}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
