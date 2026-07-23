import { defineFunction } from '@aws-amplify/backend'

/**
 * Backs the `createMember` custom mutation — the in-app "add a member" admin control.
 * Runs with elevated Cognito admin permissions granted in amplify/backend.ts; never
 * exposed to the client directly (the mutation itself is Admins-group gated).
 */
export const createMember = defineFunction({
  name: 'create-member',
  entry: './handler.ts',
})
