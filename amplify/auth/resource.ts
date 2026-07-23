import { defineAuth } from '@aws-amplify/backend'

/**
 * Email/password Cognito auth. Self-signup is disabled via a CDK override in
 * amplify/backend.ts (`allowAdminCreateUserOnly`) — accounts only ever come from
 * an admin running scripts/create-admin-user.ts. The "Admins" group gets write
 * access to shared data (movies, and other users' rankings/reviews for corrections
 * or migration); everyone else can only ever write their own.
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['Admins'],
})
