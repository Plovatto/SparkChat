export type SessionDeviceKind = 'phone' | 'tablet' | 'desktop';

export function sessionDeviceKind(device: string): SessionDeviceKind {
  if (/\biPad\b/i.test(device)) {
    return 'tablet';
  }
  if (/\b(iPhone|Android)\b/i.test(device)) {
    return 'phone';
  }
  return 'desktop';
}
