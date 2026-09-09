import { defineFunction } from '@aws-amplify/backend'

/**
 * Serves the read-only, subscribable calendar feed (an .ics file that regenerates on
 * every request from live data) behind its own Lambda Function URL — not a GraphQL
 * resolver, since calendar apps re-fetch a subscription URL with a plain
 * unauthenticated GET, which AppSync doesn't support. Public with no auth (see
 * amplify/backend.ts for why) — a subscribing calendar app can't do interactive
 * sign-in anyway, and the URL is already public app-wide once it's shown once.
 */
export const icsFeed = defineFunction({
  name: 'ics-feed',
  entry: './handler.ts',
  // Reads the Movie/MovieWatch tables directly (see amplify/backend.ts), which would
  // otherwise put it in the shared function stack alongside createMember — and since
  // data already depends on that function stack for createMember's resolver, icsFeed's
  // grantReadData back onto the tables would close data -> function -> data into a
  // circular nested-stack dependency. Grouping it into the data stack instead keeps
  // that dependency one-directional.
  resourceGroupName: 'data',
})
