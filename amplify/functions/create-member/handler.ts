import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider'
import type { Schema } from '../../data/resource'
import { MEMBER_LOCAL_DOMAIN, slugify } from '../../../src/lib/memberLogin'

const cognito = new CognitoIdentityProviderClient()

/**
 * Creates a Cognito user identified by name and a password the admin sets directly —
 * no email is sent or required. Cognito's username attribute on this pool is
 * email-shaped, so we synthesize a deterministic `<slug>@member.local` login from the
 * name, using the same slugify the sign-in form uses to turn a typed name back into
 * this same login string.
 */
export const handler: Schema['createMember']['functionHandler'] = async (event) => {
  const { name, password, isAdmin } = event.arguments
  const userPoolId = process.env.USER_POOL_ID
  if (!userPoolId) throw new Error('USER_POOL_ID environment variable is not set')

  const username = `${slugify(name)}@${MEMBER_LOCAL_DOMAIN}`

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: username },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: name },
        ],
        MessageAction: 'SUPPRESS',
      }),
    )
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      throw new Error(`Someone named "${name}" already has an account. Try a different name.`)
    }
    throw err
  }

  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  )

  if (isAdmin) {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'Admins',
      }),
    )
  }

  return { username }
}
