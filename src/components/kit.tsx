import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

/**
 * The pieces every working screen is built from, so a filter, a drawer or a
 * form field looks and behaves the same everywhere. Styles in components.css.
 */

// ── the line under a page's tabs ─────────────────────────────────────

/** The one sentence that says what is on the screen, with its most important count first. */
export function Summary({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="summary">
      <p className="summary-text">{children}</p>
      {aside && <div className="summary-aside">{aside}</div>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <label className="field-search">
      <MagnifyingGlass size={15} aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={e => onChange(e.target.value)} />
      {value && (
        <button type="button" className="search-clear" aria-label="Clear the search" onClick={() => onChange('')}>
          <X size={13} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

/** A filter: its name is always visible, so "All" never stands alone. */
export function Filter<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <span className={`filter${options[0] && value !== options[0].value ? ' on' : ''}`}>
      <label htmlFor={id} className="filter-label">{label}</label>
      <select id={id} className="filter-select" value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}

export function DateInput({ label, value, onChange, max, min }: { label: string; value: string; onChange: (v: string) => void; max?: string; min?: string }) {
  const id = useId();
  return (
    <span className="filter on">
      <label htmlFor={id} className="filter-label">{label}</label>
      <input id={id} type="date" className="filter-select" value={value} max={max} min={min} onChange={e => e.target.value && onChange(e.target.value)} />
    </span>
  );
}

// ── status ───────────────────────────────────────────────────────────

/**
 * A state, always as a word; the colour only repeats what the word says.
 * There is no accent tone: the accent is for actions, links, the selection and
 * focus, never a status (CLAUDE.md). Waiting is neutral.
 */
export function Pill({ tone = 'neutral', children }: { tone?: 'good' | 'warning' | 'critical' | 'neutral'; children: ReactNode }) {
  return <span className={`pill ${tone === 'neutral' ? 'info' : tone}`}>{children}</span>;
}

// ── long lists ───────────────────────────────────────────────────────

/** Shows the first n, with a button for the next n; resets when the list changes. */
export function useShowMore<T>(list: T[], step = 50) {
  const [n, setN] = useState(step);
  const key = list.length;
  useEffect(() => setN(step), [key, step]);
  return {
    shown: list.slice(0, n),
    more: list.length > n ? (
      <button type="button" className="btn btn-secondary show-more" onClick={() => setN(x => x + step)}>
        Show {Math.min(step, list.length - n)} more of {list.length - n}
      </button>
    ) : null,
  };
}

// ── overlays ─────────────────────────────────────────────────────────

/**
 * A side drawer for detail beside a list (console-design: drawers when the
 * list stays in view). Focus is trapped while open and returns to the opener.
 */
export function Drawer({ open, onClose, title, sub, children, footer, wide = false }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-scrim" />
        <Dialog.Content className={`drawer${wide ? ' wide' : ''}`} aria-describedby={undefined}>
          <header className="drawer-head">
            <div>
              <Dialog.Title className="drawer-title">{title}</Dialog.Title>
              {sub && <p className="drawer-sub">{sub}</p>}
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn" aria-label="Close"><X size={18} aria-hidden="true" /></button>
            </Dialog.Close>
          </header>
          <div className="drawer-body">{children}</div>
          {footer && <footer className="drawer-foot">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Confirms something consequential. The button names the action; when a
 * reason is required, the action waits for one (as the database does).
 */
export function Confirm({
  open, title, children, confirmLabel, danger = false, busy = false, error = '', reason, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string;
  /** Ask for a reason: its label, and whether it is required. */
  reason?: { label: string; required: boolean; placeholder?: string };
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const id = useId();
  useEffect(() => {
    if (open) {
      setText('');
      setTried(false);
    }
  }, [open]);
  const missing = Boolean(reason?.required && !text.trim());
  return (
    <Dialog.Root open={open} onOpenChange={o => !o && !busy && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          {children && <div className="dialog-body">{children}</div>}
          {reason && (
            <div className="form-field">
              <label htmlFor={id} className="form-label">{reason.label}{reason.required ? '' : ' (optional)'}</label>
              <textarea
                id={id}
                className="input textarea"
                rows={3}
                value={text}
                placeholder={reason.placeholder}
                aria-invalid={tried && missing}
                aria-describedby={tried && missing ? `${id}-err` : undefined}
                onChange={e => setText(e.target.value)}
              />
              {tried && missing && <p className="form-error" id={`${id}-err`}>Write a reason; the person it affects will read it.</p>}
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-secondary" disabled={busy}>Cancel</button>
            </Dialog.Close>
            <button
              type="button"
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy}
              onClick={() => {
                setTried(true);
                if (!missing) onConfirm(text.trim());
              }}
            >
              {busy ? 'Saving…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── forms ────────────────────────────────────────────────────────────

/** A labelled field: label above, help under, the error in words under that. */
export function Field({ label, help, error, children, optional = false, id: given }: {
  label: string;
  help?: ReactNode;
  error?: string;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
  optional?: boolean;
  id?: string;
}) {
  const auto = useId();
  const id = given ?? auto;
  const described = [help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-label">{label}{optional && <span className="form-optional"> (optional)</span>}</label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': described })}
      {help && <p className="form-help" id={`${id}-help`}>{help}</p>}
      {error && <p className="form-error" id={`${id}-err`}>{error}</p>}
    </div>
  );
}

/** Focuses the first invalid field after a failed submit. */
export function useFocusFirstError(errors: Record<string, string | undefined>, attempt: number) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!attempt) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  void errors;
  return form;
}

/** A message for work that finished off screen; things on screen confirm in place instead. */
export function Notice({ children, tone = 'good', onDone }: { children: ReactNode; tone?: 'good' | 'critical'; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 5000);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return <div className={`notice ${tone}`} role="status">{children}</div>;
}
