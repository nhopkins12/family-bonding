import { defineBackend } from '@aws-amplify/backend'
import { Stack } from 'aws-cdk-lib'
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { FunctionUrlAuthType, type Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { createMember } from './functions/create-member/resource'
import { icsFeed } from './functions/ics-feed/resource'

const backend = defineBackend({
  auth,
  data,
  createMember,
  icsFeed,
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

// --- Subscribable ICS calendar feed: unguessable, unauthenticated, read-only -----
// A Lambda Function URL rather than a GraphQL query — calendar apps re-fetch a
// subscription URL with a plain unauthenticated GET on their own schedule, which
// AppSync has no way to serve. Protection is the Function URL's own random subdomain
// being hard to guess — there's no content worth hiding behind more than that here
// (same movie schedule/vote data guest reads already see in-app), and the URL is
// already handed to every visitor via the Subscribe button regardless of sign-in, so
// a second secret layered on top wouldn't actually keep anyone out who could already
// get the URL from the app itself.
const icsFeedLambda = backend.icsFeed.resources.lambda as LambdaFunction

const movieTable = backend.data.resources.tables['Movie']
const movieWatchTable = backend.data.resources.tables['MovieWatch']
const watchVoteTable = backend.data.resources.tables['WatchVote']
movieTable.grantReadData(icsFeedLambda)
movieWatchTable.grantReadData(icsFeedLambda)
watchVoteTable.grantReadData(icsFeedLambda)
icsFeedLambda.addEnvironment('MOVIE_TABLE_NAME', movieTable.tableName)
icsFeedLambda.addEnvironment('MOVIE_WATCH_TABLE_NAME', movieWatchTable.tableName)
icsFeedLambda.addEnvironment('WATCH_VOTE_TABLE_NAME', watchVoteTable.tableName)

const icsFeedUrl = icsFeedLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE })
backend.addOutput({
  custom: {
    icsFeedUrl: icsFeedUrl.url,
  },
})
