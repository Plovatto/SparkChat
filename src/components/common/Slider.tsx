interface SliderProps {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  accentColor: string;
  textColor: string;
  textSecondaryColor: string;
}

export function Slider({ label, valueLabel, value, min, max, step = 1, onChange, accentColor, textColor, textSecondaryColor }: SliderProps) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: textColor }}>{label}</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: textSecondaryColor }}>{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          width: '100%',
          accentColor,
          height: '20px',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}
