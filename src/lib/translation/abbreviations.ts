import type { Language } from '@lib/i18n/language';

const WORD_ABBREVIATIONS: Record<Language, Record<string, string>> = {
  pt: {
    vc: 'você',
    vcs: 'vocês',
    hj: 'hoje',
    amanha: 'amanhã',
    mto: 'muito',
    mt: 'muito',
    tb: 'também',
    tbm: 'também',
    pq: 'porque',
    q: 'que',
    td: 'tudo',
    tds: 'todos',
    blz: 'beleza',
    vlw: 'obrigado',
    obg: 'obrigado',
    msg: 'mensagem',
    cmg: 'comigo',
    ctz: 'certeza',
    dps: 'depois',
    agr: 'agora',
    fds: 'fim de semana',
    tô: 'estou',
    tá: 'está',
    pra: 'para',
  },
  en: {
    u: 'you',
    ur: 'your',
    thx: 'thanks',
    thnx: 'thanks',
    pls: 'please',
    plz: 'please',
    idk: "I don't know",
    btw: 'by the way',
    tmrw: 'tomorrow',
    gonna: 'going to',
    wanna: 'want to',
    ya: 'you',
    r: 'are',
    im: "I'm",
  },
};

const BEFORE_SPACE_ABBREVIATIONS: Record<Language, Record<string, string>> = {
  pt: { n: 'não' },
  en: {},
};

const WHOLE_MESSAGE_ABBREVIATIONS: Record<Language, Record<string, string>> = {
  pt: { n: 'não', s: 'sim', valeu: 'obrigado' },
  en: {},
};

const WORD_CHAR = /[\p{L}\p{N}_']/u.source;
const WHOLE_MESSAGE = /^(\s*)([\p{L}]+)([\s.!?…]*)$/u;

function wordPattern(words: string[], lookahead: string): RegExp | null {
  if (words.length === 0) {
    return null;
  }
  const alternatives = [...words].sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?<!${WORD_CHAR})(${alternatives})${lookahead}`, 'giu');
}

const PATTERNS = Object.fromEntries(
  (Object.keys(WORD_ABBREVIATIONS) as Language[]).map((language) => [
    language,
    {
      words: wordPattern(Object.keys(WORD_ABBREVIATIONS[language]), `(?!${WORD_CHAR})`),
      beforeSpace: wordPattern(Object.keys(BEFORE_SPACE_ABBREVIATIONS[language]), '(?= )'),
    },
  ]),
) as Record<Language, { words: RegExp | null; beforeSpace: RegExp | null }>;

function matchCase(original: string, replacement: string): string {
  const first = original.charAt(0);
  if (first !== first.toLocaleLowerCase() && first === first.toLocaleUpperCase()) {
    return replacement.charAt(0).toLocaleUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function replaceWith(text: string, pattern: RegExp | null, map: Record<string, string>): string {
  if (!pattern) {
    return text;
  }
  return text.replace(pattern, (match: string) => {
    const replacement = map[match.toLocaleLowerCase()];
    return replacement === undefined ? match : matchCase(match, replacement);
  });
}

export function normalizeChatAbbreviations(text: string, language: Language): string {
  const whole = text.match(WHOLE_MESSAGE);
  if (whole) {
    const [, lead = '', word = '', trail = ''] = whole;
    const replacement = WHOLE_MESSAGE_ABBREVIATIONS[language][word.toLocaleLowerCase()];
    if (replacement !== undefined) {
      return `${lead}${matchCase(word, replacement)}${trail}`;
    }
  }
  const patterns = PATTERNS[language];
  const expanded = replaceWith(text, patterns.words, WORD_ABBREVIATIONS[language]);
  return replaceWith(expanded, patterns.beforeSpace, BEFORE_SPACE_ABBREVIATIONS[language]);
}

export function isWholeMessageAbbreviation(text: string): boolean {
  const word = text.match(WHOLE_MESSAGE)?.[2]?.toLocaleLowerCase();
  if (word === undefined) {
    return false;
  }
  return (Object.keys(WORD_ABBREVIATIONS) as Language[]).some(
    (language) => word in WORD_ABBREVIATIONS[language] || word in WHOLE_MESSAGE_ABBREVIATIONS[language],
  );
}
