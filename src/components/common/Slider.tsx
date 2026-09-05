import { useTheme } from '@features/theme';

interface SliderProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

export function Slider({ label, valueLabel, value, min, max, step = 1, onChange }: SliderProps) {
  const { theme } = useTheme();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: theme.textPrimary }}>{label}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: theme.textSecondary }}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sc-range"
      />
    </div>
  );
}
