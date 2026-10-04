import * as Sentry from "@sentry/nextjs";
import { sanitizeError, sanitizeSpan, traceSampleRate } from "./lib/observability/privacy";

// Server-only opt-in. No browser SDK, replay, automatic HTTP/SQL capture or source-map upload.
export function sentryOptions(dsn: string): Sentry.NodeOptions {
  return {
    dsn, defaultIntegrations: false, integrations: [], includeServerName: false,
    tracePropagationTargets: [],
    tracesSampleRate: traceSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    maxBreadcrumbs: 0,
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      genAI: { inputs: false, outputs: false }, graphQL: { document: false, variables: false },
      databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0,
    },
    beforeSend: sanitizeError, beforeSendSpan: sanitizeSpan,
    beforeBreadcrumb: () => null, beforeSendLog: () => null, beforeSendMetric: () => null,
  };
}

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  try {
    initializeSentry(sentryOptions(dsn));
  } catch { /* Invalid monitoring configuration must not prevent Thread starting. */ }
}

export function initializeSentry(options: Sentry.NodeOptions) {
  const client = Sentry.init(options);
  // Sampling metadata is outside beforeSendSpan. Strip arbitrary parent names here too.
  client?.on("createDsc", (context) => { delete context.transaction; });
  client?.on("beforeEnvelope", ([header]) => {
    const context = header.trace;
    if (context && typeof context === "object" && "transaction" in context) delete context.transaction;
  });
  return client;
}
