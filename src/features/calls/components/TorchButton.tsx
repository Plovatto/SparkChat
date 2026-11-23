import { useTranslation } from 'react-i18next';
import { LuFlashlight, LuFlashlightOff } from 'react-icons/lu';
import type { TorchControl } from './use-torch';
import { useToggleRipple } from './call-hooks';
import '../styles/torch.css';

interface TorchButtonProps {
  torch: TorchControl;
  disabled?: boolean;
}

export function TorchButton({ torch, disabled = false }: TorchButtonProps) {
  const { t } = useTranslation();
  const [ripple, armRipple] = useToggleRipple(torch.on);
  if (!torch.supported) {
    return null;
  }
  const label = torch.on ? t('calls.torch.off') : t('calls.torch.on');
  return (
    <button
      type="button"
      className="sc-call-round sc-call-round--torch"
      data-tone={torch.on ? 'on' : undefined}
      onClick={() => {
        armRipple();
        void torch.toggle();
      }}
      title={label}
      aria-label={label}
      aria-pressed={torch.on}
      data-ripple={ripple}
      disabled={disabled}
    >
      <span key={torch.on ? 'on' : 'off'} className="sc-call-icon-swap">
        {torch.on ? <LuFlashlight size={21} /> : <LuFlashlightOff size={21} />}
      </span>
    </button>
  );
}
