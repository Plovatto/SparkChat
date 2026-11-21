export interface CaretInsertion {
  value: string;
  caret: number;
}

function clampIndex(index: number | null | undefined, length: number, fallback: number): number {
  if (typeof index !== 'number' || Number.isNaN(index)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(index), 0), length);
}

export function insertAtCaret(
  value: string,
  insertion: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
  maxLength?: number,
): CaretInsertion | null {
  const start = clampIndex(selectionStart, value.length, value.length);
  const end = Math.max(start, clampIndex(selectionEnd, value.length, start));
  const next = value.slice(0, start) + insertion + value.slice(end);
  if (maxLength !== undefined && next.length > maxLength) {
    return null;
  }
  return { value: next, caret: start + insertion.length };
}
