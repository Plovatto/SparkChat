import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@components/common/Modal';
import { useTheme } from '@features/theme';
import {
  computeSafetyNumber,
  getCurrentIdentity,
  ownSigningKey,
  setContactVerified,
  type ContactTrust,
  type SafetyNumber,
} from '@lib/e2ee';

interface SafetyNumberDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  trust: ContactTrust;
}

export function SafetyNumberDialog({ isOpen, onClose, contactId, contactName, trust }: SafetyNumberDialogProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [safetyNumber, setSafetyNumber] = useState<SafetyNumber | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const pinnedKey = trust.pin?.pending?.publicKey ?? trust.pin?.publicKey;
  const pinnedSigningKey = trust.pin?.pending ? trust.pin.pending.signingPublicKey : (trust.pin?.signingPublicKey ?? null);
  const ownPrivateKey = getCurrentIdentity()?.privateKey;
  const identity = getCurrentIdentity();
  const ownUserId = identity?.userId;
  const ownPublicKey = identity?.publicKey;
  const isVerified = trust.status === 'verified';
  const canMark = trust.status === 'verified' || trust.status === 'unverified' || trust.status === 'unverifiable';

  useEffect(() => {
    if (!isOpen || !ownUserId || !ownPublicKey || !pinnedKey) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const ownSigningPublicKey = ownPrivateKey ? await ownSigningKey(ownPrivateKey) : null;
      const result = await computeSafetyNumber(
        { userId: ownUserId, publicKey: ownPublicKey, signingPublicKey: ownSigningPublicKey },
        { userId: contactId, publicKey: pinnedKey, signingPublicKey: pinnedSigningKey },
      );
      const { default: QRCode } = await import('qrcode');
      const url = await QRCode.toDataURL(result.qrPayload, { margin: 1, width: 192 });
      if (!cancelled) {
        setSafetyNumber(result);
        setQrUrl(url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, ownUserId, ownPublicKey, ownPrivateKey, pinnedKey, pinnedSigningKey, contactId]);

  const toggleVerified = () => {
    if (!ownUserId || !ownPublicKey) {
      return;
    }
    void setContactVerified({ userId: ownUserId, publicKey: ownPublicKey }, contactId, !isVerified);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('chat.keyTrust.dialogTitle')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: theme.textPrimary }}>
        <p style={{ margin: 0, color: theme.textSecondary, fontSize: '0.9rem' }}>
          {t('chat.keyTrust.dialogIntro', { name: contactName })}
        </p>
        {trust.status === 'unverifiable' && (
          <p role="note" style={{ margin: 0, color: theme.warningText, fontSize: '0.85rem' }}>
            {t('chat.keyTrust.unverifiableHint')}
          </p>
        )}
        {safetyNumber && (
          <div
            aria-label={t('chat.keyTrust.numberLabel')}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px 12px',
              fontFamily: 'monospace',
              fontSize: '1.05rem',
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {safetyNumber.groups.map((group, index) => (
              <span key={`${index}-${group}`}>{group}</span>
            ))}
          </div>
        )}
        {qrUrl && (
          <img src={qrUrl} alt={t('chat.keyTrust.qrAlt')} width={192} height={192} style={{ alignSelf: 'center', background: '#fff', borderRadius: '8px' }} />
        )}
        <button
          type="button"
          onClick={toggleVerified}
          disabled={!canMark || !safetyNumber}
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            background: isVerified ? theme.surfaceSunken : theme.accent,
            color: isVerified ? theme.textPrimary : theme.textOnAccent,
            fontWeight: 600,
            cursor: canMark && safetyNumber ? 'pointer' : 'not-allowed',
          }}
        >
          {isVerified ? t('chat.keyTrust.unmarkVerified') : t('chat.keyTrust.markVerified')}
        </button>
      </div>
    </Modal>
  );
}
