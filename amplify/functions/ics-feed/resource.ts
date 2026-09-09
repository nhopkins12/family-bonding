import { defineFunction } from '@aws-amplify/backend'

/**
 * Serves the read-only, subscribable calendar feed (an .ics file that regenerates on
 * every request from live data) behind its own Lambda Function URL — not a GraphQL
 * resolver, since calendar apps re-fetch a subscription URL with a plain
 * unauthenticated GET, which AppSync doesn't support. Gated by an unguessable
 * CDK-generated secret path token (see amplify/backend.ts) instead of real auth,
 * since a subscribing calendar app can't do interactive sign-in.
 */
export const icsFeed = defineFunction({
  name: 'ics-feed',
  entry: './handler.ts',
})
