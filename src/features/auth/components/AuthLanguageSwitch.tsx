import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@lib/i18n/app-i18n';
import { LanguageMenuButton } from '@lib/i18n/LanguageMenuButton';

interface AuthLanguageSwitchProps {
  top: string;
  right: string;
  noBorder?: boolean;
  iconColor?: string;
}

const THEME_TOGGLE_SIZE_PX = 48;
const GAP_PX = 8;
const EDGE_PX = 15;
const TEXT_GAP_PX = 10;

export const AUTH_HEADER_CONTROLS_SPACE = `${EDGE_PX + THEME_TOGGLE_SIZE_PX * 2 + GAP_PX + TEXT_GAP_PX}px`;

export function AuthLanguageSwitch({ top, right, noBorder, iconColor }: AuthLanguageSwitchProps) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useAppLanguage();

  return (
    <span style={{ position: 'absolute', top, right: `calc(${right} + ${THEME_TOGGLE_SIZE_PX + GAP_PX}px)`, zIndex: 100, display: 'block' }}>
      <LanguageMenuButton
        value={language}
        onChange={changeLanguage}
        label={t('language.label')}
        className="sc-toggle-icon"
        iconSize={19}
        style={{
          width: `${THEME_TOGGLE_SIZE_PX}px`,
          height: `${THEME_TOGGLE_SIZE_PX}px`,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(noBorder ? { border: 'none' } : {}),
          ...(iconColor ? { color: iconColor } : {}),
        }}
      />
    </span>
  );
}
