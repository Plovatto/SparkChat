import type { ReactNode } from 'react';
import type { RoomParticipant } from '@lib/socket';

const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"']{1,2048})/gi;
const MENTION_TOKEN_PATTERN = /(@[\p{L}\p{N}_]+)/gu;
const TRAILING_URL_PUNCTUATION = /[)\].,!?]+$/;
const BIDI_CONTROL_PATTERN = /[\u202A-\u202E\u2066-\u2069]/g;

function renderMentions(text: string, nicknames: Set<string>, accentColor: string, keyPrefix: string): ReactNode[] {
  if (nicknames.size === 0 || !text.includes('@')) {
    return [text];
  }
  return text.split(MENTION_TOKEN_PATTERN).map((part, index) =>
    part.startsWith('@') && nicknames.has(part.slice(1).toLowerCase()) ? (
      <span key={`${keyPrefix}-m${index}`} className="sc-mention" style={{ color: accentColor }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function renderRichText(text: string, participants: RoomParticipant[], accentColor: string): ReactNode[] {
  const nicknames = new Set(participants.map((participant) => participant.nickname.toLowerCase()));
  const nodes: ReactNode[] = [];

  text.replace(BIDI_CONTROL_PATTERN, '').split(URL_SPLIT_PATTERN).forEach((part, index) => {
    if (index % 2 === 1) {
      const trailing = part.match(TRAILING_URL_PUNCTUATION)?.[0] ?? '';
      const url = trailing ? part.slice(0, -trailing.length) : part;
      nodes.push(
        <a
          key={`u${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="sc-message-link"
          onClick={(event) => event.stopPropagation()}
        >
          {url}
        </a>,
      );
      if (trailing) {
        nodes.push(trailing);
      }
      return;
    }
    if (part) {
      nodes.push(...renderMentions(part, nicknames, accentColor, `t${index}`));
    }
  });

  return nodes;
}
