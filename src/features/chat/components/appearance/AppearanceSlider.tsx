import type { CSSProperties } from 'react';
import { Slider } from '@components/common/Slider';

interface AppearanceSliderProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

export function AppearanceSlider({ label, valueLabel, value, min, max, onChange }: AppearanceSliderProps) {
  const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="sc-appearance-slider" style={{ '--sc-appearance-fill': `${fill}%` } as CSSProperties}>
      <Slider label={label} valueLabel={valueLabel} value={value} min={min} max={max} onChange={onChange} />
    </div>
  );
}
