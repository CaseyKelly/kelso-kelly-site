import * as Sentry from "@sentry/nextjs";

import { sentryDataCollection } from "@/lib/sentry-data-collection";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
  dataCollection: sentryDataCollection,
});
