import { useEffect, useState } from 'react';
import { ArrowClockwise } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { isLive } from '../live/client';
import { ago } from '../lib/days';

/**
 * The states every list and screen has (CLAUDE.md, Behaviour): loading for a
 * real wait, an error that says what happened with a way to try again, and an
 * empty state that says what would appear and how it gets here.
 */

export function Loading({ label, lines = 2 }: { label: string; lines?: number }) {
  return (
    <div className="state-loading" aria-busy="true" aria-label={label}>
      <span className="skeleton sk-line" />
      {Array.from({ length: lines }, (_, i) => <span key={i} className={`skeleton ${i === 0 ? 'sk-hero' : 'sk-block'}`} />)}
    </div>
  );
}

export function LoadError({ what, error, retry }: { what: string; error: string; retry: () => void }) {
  return (
    <div className="dash-state" role="alert">
      <p className="dash-state-title">{what} could not be read</p>
      <p className="dash-state-text">{error} Check the connection and try again.</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>Try again</button>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state-empty">
      <p className="state-empty-title">{title}</p>
      {children && <p className="state-empty-text">{children}</p>}
    </div>
  );
}

/** "Demo data", or when the figures were read with a refresh button; and a failed refresh, said plainly. */
export function Freshness({ at, error, reload, label = 'Refresh' }: { at: Date | null; error?: string; reload: () => void; label?: string }) {
  // "Updated 2 minutes ago" keeps counting while the page is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick(n => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <>
      {!isLive ? (
        <span className="demo-tag">Demo data</span>
      ) : (
        <span className="live-tag">
          Updated {ago(at)}
          <button type="button" className="live-refresh" onClick={reload} aria-label={label}>
            <ArrowClockwise size={13} aria-hidden="true" />
          </button>
        </span>
      )}
      {error && at && <span className="live-error" role="status">The last refresh failed; showing what was read before.</span>}
    </>
  );
}
