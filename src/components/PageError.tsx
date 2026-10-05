import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { reportError } from '../app/crashReporting';

/**
 * One page failing is not the whole console failing.
 *
 * Without this, a page that throws while drawing takes the whole console with
 * it: a white tab, no menu, nothing to report. It catches the throw inside the
 * shell, so the menu survives, says so plainly, and shows the one line that
 * names what went wrong. Moving to another address clears a caught error;
 * a page that is working is never restarted by it.
 */
export class PageError extends Component<{ children: ReactNode; at: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { at: string }) {
    if (prev.at !== this.props.at && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('This page stopped:', error, info?.componentStack);
    reportError(error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="coming" role="alert">
        <h1 className="page-title-lg">This page stopped</h1>
        <p className="coming-about">
          Something on this page went wrong while it was drawing. Nothing has been changed or lost, and the rest of the console still works.
        </p>
        <pre className="page-error-detail">{error.message || String(error)}</pre>
        <div className="page-error-actions">
          <button type="button" className="btn btn-secondary" onClick={() => this.setState({ error: null })}>Try again</button>
          <Link className="btn btn-primary" to="/">Back to Today</Link>
        </div>
        <p className="form-help">If it happens again, send the line above to support@mrsales.in; it names what went wrong.</p>
      </div>
    );
  }
}
