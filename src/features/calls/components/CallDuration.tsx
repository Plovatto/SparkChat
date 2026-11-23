import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LuClock } from 'react-icons/lu';
import { formatCallDuration } from '@lib/format';

function elapsedSeconds(connectedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - connectedAt) / 1000));
}

function useElapsed(connectedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || connectedAt === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, connectedAt]);
  return connectedAt === null ? 0 : elapsedSeconds(connectedAt, now);
}

interface CallDurationProps {
  connectedAt: number | null;
  running: boolean;
}

export function CallDuration({ connectedAt, running }: CallDurationProps) {
  return <>{formatCallDuration(useElapsed(connectedAt, running))}</>;
}

interface CallEndedDurationProps {
  connectedAt: number | null;
}

export function CallEndedDuration({ connectedAt }: CallEndedDurationProps) {
  const { t } = useTranslation();
  const [endedAt] = useState(() => Date.now());
  const elapsed = connectedAt === null ? 0 : elapsedSeconds(connectedAt, endedAt);
  if (elapsed <= 0) {
    return null;
  }
  return (
    <p className="sc-call-ended__meta">
      <LuClock size={14} aria-hidden="true" />
      {t('calls.endedDuration', { time: formatCallDuration(elapsed) })}
    </p>
  );
}
