export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, suffix = '', disabled, onChange } = props;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper__ctl">
        <button aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite">
          {value}
          {suffix}
        </output>
        <button aria-label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
