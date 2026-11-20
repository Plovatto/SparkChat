import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FaCheckCircle, FaDownload, FaPlusSquare } from 'react-icons/fa';
import { FiShare } from 'react-icons/fi';
import { Modal } from '@components/common/Modal';
import { useTheme } from '@features/theme';
import { useInstallState } from '../hooks/useInstallState';
import { closeInstallSheet, promptInstall } from '../lib/install-state';

function Step({ index, icon, children }: { index: number; icon: ReactNode; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <li className="sc-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', borderRadius: '12px', padding: '12px 14px' }}>
      <span
        aria-hidden="true"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: theme.accentSoft,
          color: theme.accentText,
          fontWeight: 700,
          fontSize: '0.8rem',
        }}
      >
        {index}
      </span>
      <span style={{ flex: 1, minWidth: 0, color: theme.textPrimary, fontSize: '0.9rem', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{children}</span>
      <span aria-hidden="true" style={{ color: theme.textMuted, display: 'inline-flex', flexShrink: 0 }}>
        {icon}
      </span>
    </li>
  );
}

export function InstallSheet() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const install = useInstallState();
  const alreadyInstalled = install.isStandalone || install.installed;

  const paragraph = (text: string) => (
    <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.55, color: theme.textSecondary, overflowWrap: 'anywhere' }}>{text}</p>
  );

  let body: ReactNode;
  if (alreadyInstalled) {
    body = (
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <FaCheckCircle size={20} color={theme.successText} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
        {paragraph(t('pwa.sheet.installedText'))}
      </div>
    );
  } else if (install.isIos) {
    body = (
      <>
        <div className="sc-notice sc-notice--info">{t('pwa.sheet.iosWhy')}</div>
        <ol aria-label={t('pwa.sheet.stepsLabel')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Step index={1} icon={<FiShare size={18} />}>
            {t('pwa.sheet.iosStep1')}
          </Step>
          <Step index={2} icon={<FaPlusSquare size={18} />}>
            {t('pwa.sheet.iosStep2')}
          </Step>
          <Step index={3} icon={<FaCheckCircle size={18} />}>
            {t('pwa.sheet.iosStep3')}
          </Step>
        </ol>
      </>
    );
  } else {
    body = (
      <>
        {paragraph(t('pwa.sheet.lead'))}
        {paragraph(install.canPrompt ? t('pwa.sheet.promptText') : t('pwa.sheet.manualText'))}
      </>
    );
  }

  return (
    <Modal isOpen={install.sheetOpen} onClose={closeInstallSheet} title={alreadyInstalled ? t('pwa.sheet.installedTitle') : t('pwa.sheet.title')} maxWidth="440px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {body}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={closeInstallSheet} className="sc-btn sc-btn--secondary sc-btn--lift" style={{ padding: '10px 20px', fontWeight: 500 }}>
            {alreadyInstalled ? t('pwa.close') : t('pwa.notNow')}
          </button>
          {!alreadyInstalled && install.canPrompt && (
            <button type="button" onClick={() => void promptInstall()} className="sc-btn sc-btn--primary sc-btn--lift" style={{ padding: '10px 20px' }}>
              <FaDownload size={13} /> {t('pwa.install')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
