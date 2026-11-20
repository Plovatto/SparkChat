import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { LuSearch, LuSearchX } from 'react-icons/lu';
import { formatDateTime, getDisplayName } from '@lib/format';
import type { MessageView } from '@lib/socket';
import { MESSAGE_SEARCH_MIN_LENGTH, searchMessages } from '../../utils/message-search';

interface InfoMessageSearchProps {
  messages: MessageView[];
  currentUserId: string | undefined;
  onSelect: (messageId: string) => void;
}

const SNIPPET_CONTEXT = 36;

function snippet(text: string, start: number, length: number): { before: string; match: string; after: string } {
  const from = Math.max(0, start - SNIPPET_CONTEXT);
  return {
    before: `${from > 0 ? '…' : ''}${text.slice(from, start)}`,
    match: text.slice(start, start + length),
    after: text.slice(start + length),
  };
}

export function InfoMessageSearch({ messages, currentUserId, onSelect }: InfoMessageSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchMessages(messages, query), [messages, query]);
  const isTooShort = query.trim().length < MESSAGE_SEARCH_MIN_LENGTH;

  return (
    <div className="sc-info-search">
      <label className="sc-info-search__field">
        <LuSearch size={17} className="sc-info-search__icon" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('roomInfo.searchPlaceholder')}
          aria-label={t('roomInfo.searchPlaceholder')}
          className="sc-info-search__input"
          autoComplete="off"
          spellCheck={false}
          autoFocus
        />
      </label>
      <p className="sc-info-search__hint">{t('roomInfo.searchLoadedOnly')}</p>

      {!isTooShort && results.length === 0 && (
        <div className="sc-info-empty sc-anim-rise-in">
          <LuSearchX size={30} aria-hidden="true" />
          <span>{t('roomInfo.searchEmpty')}</span>
        </div>
      )}

      <ul className="sc-info-search__results">
        {results.map((result, index) => {
          const parts = snippet(result.text, result.matchStart, result.matchLength);
          return (
            <li key={result.message.id} style={{ '--sc-info-i': Math.min(index, 10) } as CSSProperties}>
              <button type="button" className="sc-info-search__result" onClick={() => onSelect(result.message.id)}>
                <span className="sc-info-search__meta">
                  <span className="sc-info-search__sender">{getDisplayName(result.message.sender.id, result.message.sender.nickname, currentUserId)}</span>
                  <span className="sc-info-search__time">{formatDateTime(result.message.timestamp)}</span>
                </span>
                <span className="sc-info-search__text">
                  {parts.before}
                  <mark>{parts.match}</mark>
                  {parts.after}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
