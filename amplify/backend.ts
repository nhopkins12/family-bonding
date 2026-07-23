import { defineBackend } from '@aws-amplify/backend'
import { Stack } from 'aws-cdk-lib'
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { createMember } from './functions/create-member/resource'

const backend = defineBackend({
  auth,
  data,
  createMember,
})

// Enforce "admin-created users only": Cognito rejects self-registration entirely.
// Accounts are created via the in-app admin panel (createMember) or
// scripts/create-admin-user.ts (AdminCreateUser).
const { cfnUserPool } = backend.auth.resources.cfnResources
cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
}

// This is a small private tool, not a bank — a short plain password is fine.
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 6,
    requireLowercase: false,
    requireUppercase: false,
    requireNumbers: false,
    requireSymbols: false,
  },
}

// Let createMember (the in-app "add a member" admin control) manage users in this pool.
const userPool = backend.auth.resources.userPool
const createMemberLambda = backend.createMember.resources.lambda as LambdaFunction
createMemberLambda.addEnvironment('USER_POOL_ID', userPool.userPoolId)
createMemberLambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminAddUserToGroup'],
    resources: [userPool.userPoolArn],
  }),
)

// Explicit belt-and-suspenders grant for signed-out (guest) reads: `allow.guest()` in the
// data schema generates @aws_iam directives on the API, but doesn't reliably attach the
// matching IAM permission to the Identity Pool's unauthenticated role on every deploy —
// observed on a real sandbox deploy where the schema had the directives but the role had
// zero policies, so guest reads failed outright. Granting Query/Subscription only (never
// Mutation) keeps guests strictly read-only, matching the app's "read without an account,
// write only when signed in" model.
//
// This Policy is deliberately constructed *in the data stack* (not via
// unauthenticatedUserIamRole.addToPrincipalPolicy, which would attach it in the auth
// stack instead). Data already depends on auth for its default userPool auth mode, and
// createMember's Lambda already depends on auth for Cognito Admin* permissions — if this
// grant also made auth depend on data, that closes auth→data→function→auth into a
// circular nested-stack dependency, which CloudFormation rejects outright.
const graphqlApi = backend.data.resources.graphqlApi
new Policy(Stack.of(backend.data), 'GuestReadAccessPolicy', {
  roles: [backend.auth.resources.unauthenticatedUserIamRole],
  statements: [
    new PolicyStatement({
      actions: ['appsync:GraphQL'],
      resources: [`${graphqlApi.arn}/types/Query/*`, `${graphqlApi.arn}/types/Subscription/*`],
    }),
  ],
})
