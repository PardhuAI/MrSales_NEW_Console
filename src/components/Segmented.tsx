import { useRef, type KeyboardEvent } from 'react';

/**
 * A row of mutually exclusive choices. One tab stop; the arrow keys move
 * between choices, as a radio group does.
 */
export function Segmented<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = options.filter(o => !o.disabled);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = enabled.findIndex(o => o.value === value);
    const next = enabled[(i + step + enabled.length) % enabled.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKey}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
