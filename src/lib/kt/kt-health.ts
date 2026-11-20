import { getCurrentIdentity } from '@lib/e2ee/current-identity';
import { raiseKtAlert } from './kt-alerts';

const FAILURE_THRESHOLD = 4;

interface FailureRun {
  count: number;
  firstAt: number;
}

const failures = new Map<string, FailureRun>();
const lastSuccess = new Map<string, number>();

export function recordKtSuccess(event: string, now: number = Date.now()): void {
  failures.delete(event);
  lastSuccess.set(event, now);
}

export function recordKtFailure(event: string, now: number = Date.now()): void {
  const run = failures.get(event) ?? { count: 0, firstAt: now };
  run.count += 1;
  failures.set(event, run);
  if (run.count < FAILURE_THRESHOLD) {
    return;
  }
  const othersAnswer = Array.from(lastSuccess.entries()).some(([other, at]) => other !== event && at >= run.firstAt);
  const identity = getCurrentIdentity();
  if (othersAnswer && identity) {
    raiseKtAlert(identity.userId, 'logUnavailable', `unavailable:${event}`, event, now);
  }
}

export function resetKtHealth(): void {
  failures.clear();
  lastSuccess.clear();
}
