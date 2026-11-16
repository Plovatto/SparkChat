import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { LanguageSwitch } from '@lib/i18n/LanguageSwitch';

export function AuthLanguageSwitch() {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppLanguage();

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '22px' }}>
      <LanguageSwitch value={language} onChange={changeLanguage} label={t('language.label')} />
    </div>
  );
}
