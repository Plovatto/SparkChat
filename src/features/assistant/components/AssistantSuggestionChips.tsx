import { useTranslation } from 'react-i18next';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { MOTION_DURATION_MS, usePresence } from '@features/motion';
import { ASSISTANT_CHIP_IDS, type AssistantChipId } from '../assistant-chips';
import { useChipRowScroll } from '../hooks/useChipRowScroll';
import '../styles/assistant.css';

interface AssistantSuggestionChipsProps {
  visible: boolean;
  onPick: (id: AssistantChipId, prompt: string) => void;
}

export function AssistantSuggestionChips({ visible, onPick }: AssistantSuggestionChipsProps) {
  const presence = usePresence(visible, MOTION_DURATION_MS.fast);

  if (!presence.isPresent) {
    return null;
  }

  return (
    <div className="sc-assistant-chips-anchor">
      <ChipRow exiting={presence.isExiting} onPick={onPick} />
    </div>
  );
}

function ChipRow({ exiting, onPick }: { exiting: boolean; onPick: AssistantSuggestionChipsProps['onPick'] }) {
  const { t } = useTranslation();
  const { ref, canScrollStart, canScrollEnd, scrollByPage } = useChipRowScroll<HTMLDivElement>();

  return (
    <div
      className="sc-assistant-chips-wrap"
      data-exiting={exiting ? 'true' : undefined}
      data-fade-start={canScrollStart ? 'true' : undefined}
      data-fade-end={canScrollEnd ? 'true' : undefined}
    >
      {canScrollStart && (
        <button
          type="button"
          className="sc-assistant-chips-arrow sc-assistant-chips-arrow--start"
          aria-label={t('chat.assistant.chips.scrollBack')}
          onClick={() => scrollByPage(-1)}
        >
          <FaChevronLeft aria-hidden="true" />
        </button>
      )}
      <div ref={ref} className="sc-assistant-chips" role="group" aria-label={t('chat.assistant.chips.label')}>
        {ASSISTANT_CHIP_IDS.map((id, index) => (
          <button
            key={id}
            type="button"
            className="sc-assistant-chip"
            style={{ animationDelay: `${index * 40}ms` }}
            onClick={() => {
              onPick(id, t(`chat.assistant.prompts.${id}`));
              ref.current?.scrollTo?.({ left: 0, behavior: 'smooth' });
            }}
          >
            {t(`chat.assistant.chips.${id}`)}
          </button>
        ))}
      </div>
      {canScrollEnd && (
        <button
          type="button"
          className="sc-assistant-chips-arrow sc-assistant-chips-arrow--end"
          aria-label={t('chat.assistant.chips.scrollForward')}
          onClick={() => scrollByPage(1)}
        >
          <FaChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
