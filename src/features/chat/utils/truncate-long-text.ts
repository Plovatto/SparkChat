export const LONG_TEXT_MAX_CHARS = 700;
export const LONG_TEXT_MAX_LINES = 14;
const MIN_HIDDEN_CHARS = 120;
const WORD_BOUNDARY_LOOKBACK = 40;

function graphemeBoundaryAtOrBefore(text: string, index: number): number {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') {
    const code = text.charCodeAt(index - 1);
    return code >= 0xd800 && code <= 0xdbff ? index - 1 : index;
  }
  let boundary = 0;
  for (const { index: start } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.slice(0, index + 16))) {
    if (start > index) {
      break;
    }
    boundary = start;
  }
  return boundary;
}

export function truncateLongText(text: string, maxChars = LONG_TEXT_MAX_CHARS, maxLines = LONG_TEXT_MAX_LINES): string | null {
  let cut = Math.min(text.length, maxChars);
  let cutByLines = false;
  let lines = 1;
  for (let index = 0; index < cut; index++) {
    if (text[index] === '\n') {
      lines++;
      if (lines > maxLines) {
        cut = index;
        cutByLines = true;
        break;
      }
    }
  }

  if (cut >= text.length) {
    return null;
  }
  if (!cutByLines && text.length - cut < MIN_HIDDEN_CHARS) {
    return null;
  }

  cut = graphemeBoundaryAtOrBefore(text, cut);

  let preview = text.slice(0, cut);
  if (!cutByLines) {
    const lastBreak = Math.max(preview.lastIndexOf(' '), preview.lastIndexOf('\n'));
    if (lastBreak > 0 && lastBreak >= cut - WORD_BOUNDARY_LOOKBACK) {
      preview = preview.slice(0, lastBreak);
    }
  }

  return preview.trimEnd();
}
