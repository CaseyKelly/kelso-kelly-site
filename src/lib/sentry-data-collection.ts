import type * as Sentry from "@sentry/nextjs";

type DataCollection = NonNullable<Parameters<typeof Sentry.init>[0]>["dataCollection"];

/**
 * Sentry v11 collects user info, cookies, headers, HTTP bodies, DB query
 * data, and stack-frame locals by default. The contact form posts visitors'
 * names, emails, and messages, so keep collection close to the v10
 * (`sendDefaultPii: false`) behavior instead of opting into all of that.
 */
export const sentryDataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { allow: ["accept", "content-type", "user-agent"] },
  httpBodies: [],
  databaseQueryData: false,
  stackFrameVariables: false,
};
