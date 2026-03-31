import * as Sentry from '@sentry/node';
// @ts-ignore - optional dependency, not installed
import { ProfilingIntegration } from '@sentry/profiling-node';

export function setupSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      // @ts-ignore - Express integration accepts boolean for app
      new Sentry.Integrations.Express({ app: true }),
      new ProfilingIntegration(),
    ],
    tracesSampleRate: 0.1, // 10% of transactions
    profilesSampleRate: 0.1, // 10% of transactions for profiling
    attachStacktrace: true,
    beforeSend(event, hint) {
      // Scrub sensitive data
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });
}
