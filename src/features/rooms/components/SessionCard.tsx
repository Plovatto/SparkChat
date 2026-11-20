import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { LuLogOut, LuMonitor, LuSmartphone, LuTablet } from 'react-icons/lu';
import { formatDateTime } from '@lib/format';
import type { SessionSummary } from '@lib/socket';
import { sessionDeviceKind } from '../utils/session-device';

const DEVICE_ICONS = { phone: LuSmartphone, tablet: LuTablet, desktop: LuMonitor } as const;

interface SessionCardProps {
  session: SessionSummary;
  index: number;
  onRevoke: (sessionId: string) => void;
}

export function SessionCard({ session, index, onRevoke }: SessionCardProps) {
  const { t } = useTranslation();
  const DeviceIcon = DEVICE_ICONS[sessionDeviceKind(session.device)];

  return (
    <div className="sc-session-card" data-current={session.isCurrent ? 'true' : 'false'} style={{ '--sc-session-i': index } as CSSProperties}>
      <span className="sc-session-card__icon" aria-hidden="true">
        <DeviceIcon size={20} strokeWidth={2} />
      </span>
      <div className="sc-session-card__body">
        <span className="sc-session-card__title">
          <span className="sc-session-card__device">{session.device}</span>
          {session.isCurrent && <span className="sc-session-card__current">· {t('profile.thisDevice')}</span>}
        </span>
        <span className="sc-session-card__meta">{t(`profile.authMethod.${session.authMethod}`)}</span>
        <span className="sc-session-card__time">{t('profile.lastUsed', { date: formatDateTime(session.lastUsedAt) })}</span>
      </div>
      {!session.isCurrent && (
        <button
          type="button"
          onClick={() => onRevoke(session.id)}
          title={t('profile.revokeSession')}
          aria-label={t('profile.revokeSession')}
          className="sc-session-card__revoke"
        >
          <LuLogOut size={18} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
