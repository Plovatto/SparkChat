interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

export function Switch({ checked, onChange, disabled = false, 'aria-labelledby': labelledBy, 'aria-describedby': describedBy }: SwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="sc-switch"
    >
      <span className="sc-switch__thumb" />
    </button>
  );
}
