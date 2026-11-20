import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { raiseKtAlert } from './kt-alerts';

const FAILURE_THRESHOLD = 4;

interface FailureRun {
  count: number;
  firstAt: number;
}

const failures = new Map<string, FailureRun>();
export function recordKtSuccess(event: string): void {
  failures.delete(event);
}

export function recordKtFailure(event: string, now: number = Date.now()): void {
  const run = failures.get(event) ?? { count: 0, firstAt: now };
  run.count += 1;
  failures.set(event, run);
  if (run.count < FAILURE_THRESHOLD) {
    return;
  }
  const identity = getCurrentIdentity();
  if (identity) {
    raiseKtAlert(identity.userId, 'logUnavailable', `unavailable:${event}`, event, now);
  }
}

export function resetKtHealth(): void {
  failures.clear();
}
