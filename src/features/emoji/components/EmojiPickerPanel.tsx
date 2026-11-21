import { useCallback, useState, type CSSProperties, type MouseEvent } from 'react';
import {
  EmojiPicker,
  defaultEmojiDataResolver,
  type EmojiDataResolver,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
} from 'frimousse';
import { FaSearch } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { translate } from '@lib/i18n/app-i18n';
import { localizeCategories } from '../utils/emoji-categories';
import { EMOJI_DATA_PATH, type EmojiDataLocale } from '../utils/emoji-data-source';
import { readRecentEmojis, recordRecentEmoji } from '../utils/recent-emojis';
import { SKIN_TONE_PREVIEW, nextSkinTone, readSkinTone, saveSkinTone, type EmojiSkinTone } from '../utils/skin-tone';

export interface EmojiPickerPanelProps {
  locale: EmojiDataLocale;
  columns: number;
  autoFocusSearch: boolean;
  onSelect: (emoji: string) => void;
}

const resolveEmojiData: EmojiDataResolver = async (locale, options) => {
  const data = await defaultEmojiDataResolver(locale, options);
  return { ...data, categories: localizeCategories(data.categories, (key) => translate(key)) };
};

function keepFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}

function CategoryHeader({ category, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div {...props} className="sc-emoji-category">
      {category.label}
    </div>
  );
}

function Row({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className="sc-emoji-row">
      {children}
    </div>
  );
}

function EmojiCell({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button {...props} type="button" className="sc-emoji-cell" onMouseDown={keepFocus} title={emoji.label}>
      <span aria-hidden="true">{emoji.emoji}</span>
    </button>
  );
}

const LIST_COMPONENTS = { CategoryHeader, Row, Emoji: EmojiCell };

export default function EmojiPickerPanel({ locale, columns, autoFocusSearch, onSelect }: EmojiPickerPanelProps) {
  const { t } = useTranslation();
  const [recents] = useState(readRecentEmojis);
  const [search, setSearch] = useState('');
  const [skinTone, setSkinTone] = useState<EmojiSkinTone>(readSkinTone);

  const select = useCallback(
    (emoji: string) => {
      recordRecentEmoji(emoji);
      onSelect(emoji);
    },
    [onSelect],
  );

  const cycleSkinTone = () => {
    setSkinTone((current) => {
      const next = nextSkinTone(current);
      saveSkinTone(next);
      return next;
    });
  };

  const visibleRecents = search.trim() ? [] : recents.slice(0, columns);

  return (
    <EmojiPicker.Root
      className="sc-emoji-root"
      locale={locale}
      columns={columns}
      skinTone={skinTone}
      emojibaseUrl={EMOJI_DATA_PATH}
      resolveEmojiData={resolveEmojiData}
      onEmojiSelect={({ emoji }) => select(emoji)}
      style={{ '--sc-emoji-columns': columns } as CSSProperties}
    >
      <div className="sc-emoji-toolbar">
        <div className="sc-emoji-search">
          <FaSearch size={12} aria-hidden="true" className="sc-emoji-search-icon" />
          <EmojiPicker.Search
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('emoji.searchPlaceholder')}
            aria-label={t('emoji.searchLabel')}
            autoFocus={autoFocusSearch}
            enterKeyHint="search"
            autoComplete="off"
            data-testid="emoji-search-input"
            className="sc-input sc-emoji-search-input"
          />
        </div>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={cycleSkinTone}
          className="sc-emoji-tone sc-icon-btn sc-icon-btn--ghost"
          title={t('emoji.skinTone')}
          aria-label={t('emoji.skinTone')}
          data-testid="emoji-skin-tone"
        >
          <span aria-hidden="true">{SKIN_TONE_PREVIEW[skinTone]}</span>
        </button>
      </div>
      {visibleRecents.length > 0 && (
        <div className="sc-emoji-recents" role="group" aria-label={t('emoji.recent')}>
          <div className="sc-emoji-category">{t('emoji.recent')}</div>
          <div className="sc-emoji-row">
            {visibleRecents.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="sc-emoji-cell"
                onMouseDown={keepFocus}
                onClick={() => select(emoji)}
                aria-label={emoji}
                data-testid="emoji-recent"
              >
                <span aria-hidden="true">{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <EmojiPicker.Viewport className="sc-emoji-viewport">
        <EmojiPicker.Loading className="sc-emoji-status">
          <span className="sc-emoji-spinner" aria-hidden="true" />
          <span>{t('emoji.loading')}</span>
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="sc-emoji-status">
          <span className="sc-emoji-empty-face" aria-hidden="true">
            {'\u{1F50D}'}
          </span>
          <span>{t('emoji.empty')}</span>
        </EmojiPicker.Empty>
        <EmojiPicker.List className="sc-emoji-list" components={LIST_COMPONENTS} />
      </EmojiPicker.Viewport>
      <EmojiPicker.ActiveEmoji>
        {({ emoji }) => (
          <div className="sc-emoji-footer" aria-hidden="true">
            {emoji ? (
              <>
                <span className="sc-emoji-footer-glyph">{emoji.emoji}</span>
                <span className="sc-emoji-footer-label">{emoji.label}</span>
              </>
            ) : (
              <span className="sc-emoji-footer-label">{t('emoji.hint')}</span>
            )}
          </div>
        )}
      </EmojiPicker.ActiveEmoji>
    </EmojiPicker.Root>
  );
}
