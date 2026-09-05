/**
 * Removes duplicate logical rows from the live Amplify backend.
 *
 * Dry run:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run cleanup-backend-data
 *
 * Apply:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run cleanup-backend-data -- --apply
 *
 * PowerShell apply alternative:
 *   $env:CLEANUP_APPLY="true"
 *   npm run cleanup-backend-data
 */
import { Amplify } from 'aws-amplify'
import { signIn } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'
import { resolveLoginIdentifier } from '../src/lib/memberLogin'
import { isNewerRecord, type TimestampedRecord } from '../src/lib/records'

Amplify.configure(outputs)

const client = generateClient<Schema>()

type ModelClient<T extends { id: string }> = {
  list(input?: { limit?: number; nextToken?: string | null }): Promise<{
    data: T[]
    nextToken?: string | null
    errors?: { message: string }[]
  }>
  delete(input: { id: string }): Promise<{ errors?: { message: string }[] }>
}

type OwnedRecord = TimestampedRecord & { owner?: string | null }

async function listAll<T extends { id: string }>(model: ModelClient<T>) {
  const out: T[] = []
  let nextToken: string | null | undefined = null

  do {
    const result = await model.list({ limit: 1000, nextToken })
    if (result.errors) throw new Error(result.errors.map((error) => error.message).join('; '))
    out.push(...result.data)
    nextToken = result.nextToken
  } while (nextToken)

  return out
}

function duplicateLosers<T extends OwnedRecord>(records: T[], keyFn: (record: T) => string | null) {
  const groups = new Map<string, T[]>()

  for (const record of records) {
    const key = keyFn(record)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), record])
  }

  const losers: T[] = []
  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    const keep = rows.reduce((latest, row) => (isNewerRecord(row, latest) ? row : latest))
    losers.push(...rows.filter((row) => row.id !== keep.id))
  }

  return losers
}

async function deleteRows<T extends { id: string }>(label: string, model: ModelClient<T>, rows: T[], apply: boolean) {
  console.log(`${label}: ${rows.length} stale row(s)${apply ? ' to delete' : ' found'}.`)
  for (const row of rows) {
    console.log(`  ${apply ? 'delete' : 'would delete'} ${row.id}`)
    if (!apply) continue
    const result = await model.delete({ id: row.id })
    if (result.errors) throw new Error(result.errors.map((error) => error.message).join('; '))
  }
}

async function main() {
  const apply = process.argv.includes('--apply') || process.env.CLEANUP_APPLY === 'true'
  const name = process.env.ADMIN_NAME
  const password = process.env.ADMIN_PASSWORD

  if (!name || !password) {
    console.error('Set ADMIN_NAME and ADMIN_PASSWORD for an Admins-group account before running cleanup.')
    process.exit(1)
  }

  await signIn({ username: resolveLoginIdentifier(name), password })

  const [profiles, rankings, reviews] = await Promise.all([
    listAll(client.models.AppUser),
    listAll(client.models.Ranking),
    listAll(client.models.Review),
  ])

  const staleProfiles = duplicateLosers(profiles, (profile) => profile.owner ?? null)
  const staleRankings = duplicateLosers(rankings, (ranking) => ranking.owner ?? null)
  const staleReviews = duplicateLosers(reviews, (review) => (review.owner ? `${review.owner}:${review.movieId}` : null))

  console.log(apply ? 'Applying cleanup.' : 'Dry run only. Re-run with -- --apply to delete these rows.')
  await deleteRows('AppUser profiles', client.models.AppUser, staleProfiles, apply)
  await deleteRows('Rankings', client.models.Ranking, staleRankings, apply)
  await deleteRows('Reviews', client.models.Review, staleReviews, apply)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
