import { useTranslation } from 'react-i18next';
import { ColorPicker } from '@components/common/ColorPicker';
import { AppearanceSlider } from './AppearanceSlider';

interface AppearanceBubbleCardProps {
  label: string;
  colorLabel: string;
  color: string;
  opacity: number;
  textIntensity: number | null;
  canReset: boolean;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onTextIntensityChange: (intensity: number | null) => void;
  onReset: () => void;
}

export function AppearanceBubbleCard({
  label,
  colorLabel,
  color,
  opacity,
  textIntensity,
  canReset,
  onColorChange,
  onOpacityChange,
  onTextIntensityChange,
  onReset,
}: AppearanceBubbleCardProps) {
  const { t } = useTranslation();

  return (
    <div className="sc-appearance-card">
      <div className="sc-appearance-card-header">
        <ColorPicker value={color} onChange={onColorChange} label={colorLabel} />
        <span className="sc-appearance-card-label">{label}</span>
        <button type="button" className="sc-appearance-link" onClick={onReset} disabled={!canReset}>
          {t('chat.appearance.resetDefault')}
        </button>
      </div>
      <AppearanceSlider
        label={t('chat.appearance.transparency')}
        valueLabel={`${opacity}%`}
        value={opacity}
        min={10}
        max={100}
        onChange={onOpacityChange}
      />
      <div className="sc-appearance-stack">
        <AppearanceSlider
          label={t('chat.appearance.textDim')}
          valueLabel={textIntensity === null ? t('chat.appearance.auto') : `${textIntensity}%`}
          value={textIntensity ?? 50}
          min={0}
          max={100}
          onChange={onTextIntensityChange}
        />
        {textIntensity !== null && (
          <button type="button" className="sc-appearance-link sc-appearance-link--start" onClick={() => onTextIntensityChange(null)}>
            {t('chat.appearanceModal.useAuto')}
          </button>
        )}
      </div>
    </div>
  );
}
