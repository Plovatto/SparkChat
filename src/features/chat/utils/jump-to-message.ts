const HIGHLIGHT_DURATION_MS = 1500;

export function jumpToMessage(messageId: string): boolean {
  const target = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!target) {
    return false;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('message-highlight-flash');
  setTimeout(() => target.classList.remove('message-highlight-flash'), HIGHLIGHT_DURATION_MS);
  return true;
}
