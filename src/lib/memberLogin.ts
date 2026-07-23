export const MEMBER_LOCAL_DOMAIN = 'member.local'

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || 'user'
}

/**
 * Mirrors the username scheme in amplify/functions/create-member/handler.ts and
 * scripts/create-admin-user.ts — keep all three in sync. Turns whatever someone types
 * into the sign-in "name or email" field into the actual Cognito login: a real email is
 * passed through untouched, a plain name resolves to the same deterministic
 * `<slug>@member.local` login the account was created with.
 */
export function resolveLoginIdentifier(input: string): string {
  const trimmed = input.trim()
  if (trimmed.includes('@')) return trimmed
  return `${slugify(trimmed)}@${MEMBER_LOCAL_DOMAIN}`
}
