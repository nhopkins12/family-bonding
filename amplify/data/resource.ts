import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { createMember } from '../functions/create-member/resource'

/**
 * Category fields on Review mirror SUBRATING_KEYS in src/types.ts 1:1. If the set of
 * rating categories ever changes, update both places together — this schema is the
 * source of truth for what's persisted, src/types.ts is the source of truth for how
 * the UI labels/sorts them.
 *
 * Every model allows guest (unauthenticated) reads so the global ranking, library,
 * and movie detail pages work without signing in — only writes require an account.
 */
const schema = a.schema({
  Movie: a
    .model({
      title: a.string().required(),
      year: a.integer().required(),
      actor: a.string().required(),
      posterUrl: a.string(),
      sortOrder: a.integer().required(),
    })
    .authorization((allow) => [
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.groups(['Admins']).to(['create', 'update', 'delete']),
    ]),

  AppUser: a
    .model({
      displayName: a.string().required(),
      active: a.boolean().default(true),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.groups(['Admins']),
    ]),

  Ranking: a
    .model({
      orderedMovieIds: a.string().array(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.groups(['Admins']),
    ]),

  Review: a
    .model({
      movieId: a.string().required(),
      text: a.string(),
      story: a.integer(),
      bond: a.integer(),
      villain: a.integer(),
      action: a.integer(),
      style: a.integer(),
      themeSong: a.integer(),
      rewatchability: a.integer(),
      datedness: a.integer(),
      misogyny: a.integer(),
      culturalInsensitivity: a.integer(),
      campiness: a.integer(),
    })
    .secondaryIndexes((index) => [index('movieId')])
    .authorization((allow) => [
      allow.owner(),
      allow.guest().to(['read']),
      allow.authenticated().to(['read']),
      allow.groups(['Admins']),
    ]),

  createMember: a
    .mutation()
    .arguments({ name: a.string().required(), password: a.string().required(), isAdmin: a.boolean() })
    .returns(a.customType({ username: a.string() }))
    .authorization((allow) => [allow.groups(['Admins'])])
    .handler(a.handler.function(createMember)),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
})
