export type ResumeReason = 'visible' | 'pageshow' | 'resume' | 'focus';

export interface ResumeSource {
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>;
  window: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

function browserSource(): ResumeSource | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }
  return { document, window };
}

export function onPageResume(handler: (reason: ResumeReason) => void, source: ResumeSource | null = browserSource()): () => void {
  if (!source) {
    return () => undefined;
  }
  const visible = () => {
    if (source.document.visibilityState === 'visible') {
      handler('visible');
    }
  };
  const pageshow = () => handler('pageshow');
  const resume = () => handler('resume');
  const focus = () => handler('focus');
  source.document.addEventListener('visibilitychange', visible);
  source.document.addEventListener('resume', resume);
  source.window.addEventListener('pageshow', pageshow);
  source.window.addEventListener('focus', focus);
  return () => {
    source.document.removeEventListener('visibilitychange', visible);
    source.document.removeEventListener('resume', resume);
    source.window.removeEventListener('pageshow', pageshow);
    source.window.removeEventListener('focus', focus);
  };
}
