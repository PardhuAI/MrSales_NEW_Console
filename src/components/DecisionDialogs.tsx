import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Kind } from '../data/approvals';

/**
 * Focus goes back where it came from when a dialog closes. These dialogs are
 * opened from code rather than a Dialog.Trigger, so Radix has nothing to
 * return to; and after a decision the button that opened it may be gone, so
 * the person's name takes it instead.
 */
function useReturnFocus(open: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) opener.current = document.activeElement as HTMLElement | null;
  }, [open]);
  return (e: Event) => {
    e.preventDefault();
    const back = opener.current?.isConnected ? opener.current : document.getElementById('ap-person-heading');
    back?.focus();
  };
}

/**
 * The two moments in Approvals that deserve a pause: approving several things
 * at once, and rejecting. Each says exactly what will happen, and the button
 * names the action; never "OK".
 */

export function ConfirmDialog({
  open,
  title,
  lines,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  lines: string[];
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const returnFocus = useReturnFocus(open);
  return (
    <Dialog.Root open={open} onOpenChange={o => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim" />
        <Dialog.Content className="dialog" aria-describedby="confirm-lines" onCloseAutoFocus={returnFocus}>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <ul className="dialog-lines" id="confirm-lines">
            {lines.map(l => <li key={l}>{l}</li>)}
          </ul>
          <p className="dialog-note">Each person gets one message with what you decided.</p>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-secondary">Not yet</button>
            </Dialog.Close>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
              {busy ? 'Approving…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Reasons people actually give, one tap each; the text can still be edited. */
const REASONS: Record<Kind, string[]> = {
  expense: [
    'The bill is missing or cannot be read.',
    'The amount is above what the policy allows.',
    'The date or place does not match the day plan.',
  ],
  order: [
    'The discount is above the slab for this stockist.',
    'Please check the quantities with the client.',
    'This stockist cannot supply these products.',
  ],
  tour: [
    'Some working days have no clients planned.',
    'Please plan more calls on the listed doctors.',
    'The outstation days need to be discussed first.',
  ],
  leave: [
    'Please pick other dates; the team is short that week.',
    'Not enough leave left for this request.',
  ],
};

export function RejectDialog({
  open,
  title,
  kind,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  kind: Kind;
  confirmLabel: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useReturnFocus(open);

  useEffect(() => {
    if (open) {
      setReason('');
      setTried(false);
    }
  }, [open]);

  const missing = tried && !reason.trim();

  return (
    <Dialog.Root open={open} onOpenChange={o => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim" />
        <Dialog.Content
          className="dialog"
          aria-describedby="reject-help"
          onCloseAutoFocus={returnFocus}
          onOpenAutoFocus={e => {
            e.preventDefault();
            box.current?.focus();
          }}
        >
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <p className="dialog-note" id="reject-help">They will see this reason on their phone, so say what to change.</p>

          <div className="chips" role="group" aria-label="Common reasons">
            {REASONS[kind].map(r => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>
                {r}
              </button>
            ))}
          </div>

          <label className="field">
            <span className="field-label">Reason</span>
            <textarea
              ref={box}
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? 'reason-error' : undefined}
              placeholder="For example: the cab bill for 12 August is missing…"
            />
          </label>
          {missing && <p className="field-error" id="reason-error">Write a reason before rejecting.</p>}
          {error && !missing && <p className="field-error" role="alert">{error}</p>}

          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-secondary">Cancel</button>
            </Dialog.Close>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setTried(true);
                if (reason.trim()) onConfirm(reason);
                else box.current?.focus();
              }}
            >
              {busy ? 'Rejecting…' : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
