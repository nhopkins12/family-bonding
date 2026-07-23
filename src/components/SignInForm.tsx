import { useState, type FormEvent } from 'react'
import { confirmSignIn, signIn } from 'aws-amplify/auth'
import { resolveLoginIdentifier } from '../lib/memberLogin'

/**
 * Hand-rolled instead of Amplify UI's <Authenticator>: nobody here signs up (self-signup
 * is disabled at the Cognito level), and this lets the field say "Name" and transparently
 * resolve it to the underlying <slug>@member.local login — the member.local address is
 * never shown. Handles the NEW_PASSWORD_REQUIRED challenge defensively for any account
 * still using the older email-invite flow; every account created today gets a permanent
 * password up front and skips that step entirely.
 */
export function SignInForm() {
  const [step, setStep] = useState<'signin' | 'new-password'>('signin')
  const [nameOrEmail, setNameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { nextStep } = await signIn({ username: resolveLoginIdentifier(nameOrEmail), password })
      if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setStep('new-password')
      } else if (nextStep.signInStep !== 'DONE') {
        setError("This account needs additional setup that isn't supported here.")
      }
      // On DONE, Amplify dispatches the 'signedIn' Hub event and useAuthState picks it up.
    } catch {
      setError("That name and password don't match.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleNewPassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await confirmSignIn({ challengeResponse: newPassword })
    } catch {
      setError('Could not set that password — try a longer one.')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'new-password') {
    return (
      <form className="admin-form" onSubmit={handleNewPassword}>
        <p className="signin-form-note">Set a new password to finish signing in.</p>
        <label>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
            autoFocus
          />
        </label>
        {error && <p className="admin-form-error">{error}</p>}
        <button type="submit" className="admin-form-submit" disabled={submitting}>
          {submitting ? 'Setting password…' : 'Set password'}
        </button>
      </form>
    )
  }

  return (
    <form className="admin-form" onSubmit={handleSignIn}>
      <label>
        Name
        <input value={nameOrEmail} onChange={(e) => setNameOrEmail(e.target.value)} required autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {error && <p className="admin-form-error">{error}</p>}
      <button type="submit" className="admin-form-submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
