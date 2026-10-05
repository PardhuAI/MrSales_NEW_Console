/**
 * Crash reporting, off until VITE_SENTRY_DSN is set; the old console's, unchanged.
 *
 * Without a DSN nothing loads: the SDK is imported only when there is
 * somewhere to send to, so a build without one ships no Sentry code to the
 * browser and makes no requests. With one: errors only, no tracing or replay,
 * and nothing that identifies a person (no user, no IP, no request bodies).
 * mrsales.in/privacy lists the providers that handle data; add Sentry there
 * before setting the DSN.
 */
import { isLive } from '../live/client';

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
let sentry: typeof import('@sentry/react') | null = null;

export function startCrashReporting(): void {
  if (!dsn) return;
  void import('@sentry/react').then(s => {
    s.init({
      dsn,
      environment: isLive ? 'live' : 'demo',
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
      },
    });
    sentry = s;
  }).catch(() => { /* reporting is never a reason for the console to fail */ });
}

/** A failure an error boundary caught, which the global handler never sees. */
export function reportError(error: unknown, componentStack?: string | null): void {
  sentry?.captureException(error, componentStack ? { extra: { componentStack } } : undefined);
}
