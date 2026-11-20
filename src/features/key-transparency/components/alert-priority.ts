import type { KtAlert, KtAlertKind } from '@lib/kt/kt-store';

const PRIORITY: readonly KtAlertKind[] = ['splitView', 'unknownOwnKey', 'downgrade', 'logKeyChanged', 'logUnavailable', 'gossipUnreadable', 'keyRejected'];

export function pickAlertToShow(alerts: readonly KtAlert[]): KtAlert | null {
  for (const kind of PRIORITY) {
    const match = alerts.find((alert) => alert.kind === kind);
    if (match) {
      return match;
    }
  }
  return null;
}
