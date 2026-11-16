import { useTranslation } from 'react-i18next';
import { FaArrowLeft } from 'react-icons/fa';

interface AuthBackButtonProps {
  onClick: () => void;
}

export function AuthBackButton({ onClick }: AuthBackButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      title={t('common.back')}
      aria-label={t('common.back')}
      className="sc-btn sc-btn--header"
      style={{ borderRadius: '12px', padding: '12px', backdropFilter: 'blur(10px)', flexShrink: 0 }}
    >
      <FaArrowLeft size={18} />
    </button>
  );
}
