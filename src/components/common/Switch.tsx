interface SwitchProps {
  checked: boolean;
  onChange: () => void;
}

export function Switch({ checked, onChange }: SwitchProps) {
  return (
    <button type="button" onClick={onChange} role="switch" aria-checked={checked} className="sc-switch">
      <span className="sc-switch__thumb" />
    </button>
  );
}
