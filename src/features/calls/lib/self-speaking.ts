export function showSelfSpeaking(speaking: boolean, muted: boolean): boolean {
  return speaking && !muted;
}

export function speakingClass(base: string, active: boolean): string {
  return active ? `${base} sc-call-speaking` : base;
}
