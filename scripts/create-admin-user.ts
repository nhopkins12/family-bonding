/**
 * Bootstraps the first admin account (AdminCreateUser) — needed once, since you can't
 * use the in-app admin panel until an admin already exists to sign in. Every account
 * after this one should come from that in-app panel instead. No email is used anywhere:
 * the login is the same deterministic `<slug>@member.local` scheme the panel uses, and
 * the password is set directly (permanent, no invite email, no force-change prompt).
 *
 * Usage:
 *   npm run create-admin-user -- "<name>" "<password>"
 *
 * Requires amplify_outputs.json to point at a real deployed backend, and AWS
 * credentials (e.g. `aws configure`) for an identity allowed to call
 * cognito-idp:AdminCreateUser / AdminSetUserPassword / AdminAddUserToGroup on that pool.
 */
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import outputs from '../amplify_outputs.json'
import { MEMBER_LOCAL_DOMAIN, slugify } from '../src/lib/memberLogin'

async function main() {
  const [, , name, password] = process.argv
  if (!name || !password || password.length < 6) {
    console.error('Usage: npm run create-admin-user -- "<name>" "<password>" (password must be at least 6 characters)')
    process.exit(1)
  }
  if (outputs.auth.user_pool_id === 'REPLACE_AFTER_DEPLOY') {
    console.error('amplify_outputs.json is still a placeholder — deploy the backend first (see README).')
    process.exit(1)
  }

  const username = `${slugify(name)}@${MEMBER_LOCAL_DOMAIN}`
  const client = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region })

  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: outputs.auth.user_pool_id,
      Username: username,
      UserAttributes: [
        { Name: 'email', Value: username },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: name },
      ],
      MessageAction: 'SUPPRESS',
    }),
  )

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: outputs.auth.user_pool_id,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  )

  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: outputs.auth.user_pool_id,
      Username: username,
      GroupName: 'Admins',
    }),
  )

  console.log(`Created admin "${name}". Sign in with that name and the password you gave this script.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
