/**
 * Imports one person's ranking + reviews from an old localStorage export
 * (the pre-backend `family-bonding-*.json` export format) into their own,
 * real backend account. Run once per member, signed in as themselves —
 * this only ever writes to the authenticated caller's own records (via owner
 * authorization), so there's no risk of writing into the wrong person's data.
 *
 * Usage:
 *   USER_NAME="Alice" USER_PASSWORD=... \
 *     npm run migrate-legacy-export -- ./family-bonding-2026-07-22.json "Alice"
 *
 * The second argument must match a profile name in the export's `profiles` list
 * exactly. Movies are matched by title, so seed-movies must be run first.
 */
import { readFileSync } from 'node:fs'
import { Amplify } from 'aws-amplify'
import { signIn } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'
import { SUBRATING_KEYS } from '../src/types'
import { resolveLoginIdentifier } from '../src/lib/memberLogin'

Amplify.configure(outputs)

interface LegacyExport {
  movies?: { id: string; title: string }[]
  profiles?: { id: string; name: string }[]
  rankings?: Record<string, string[]>
  reviews?: Record<string, Record<string, { text?: string; subratings?: Partial<Record<string, number>> }>>
}

async function main() {
  const [, , exportPath, profileName] = process.argv
  const name = process.env.USER_NAME
  const password = process.env.USER_PASSWORD

  if (!exportPath || !profileName || !name || !password) {
    console.error(
      'Usage: USER_NAME="Alice" USER_PASSWORD=... npm run migrate-legacy-export -- <export.json> "<Legacy Profile Name>"',
    )
    process.exit(1)
  }
  if (outputs.auth.user_pool_id === 'REPLACE_AFTER_DEPLOY') {
    console.error('amplify_outputs.json is still a placeholder — deploy the backend first (see README).')
    process.exit(1)
  }

  const legacy: LegacyExport = JSON.parse(readFileSync(exportPath, 'utf-8'))
  const profile = legacy.profiles?.find((p) => p.name === profileName)
  if (!profile) {
    const available = legacy.profiles?.map((p) => p.name).join(', ') ?? '(none found)'
    console.error(`No profile named "${profileName}" in ${exportPath}. Available: ${available}`)
    process.exit(1)
  }

  await signIn({ username: resolveLoginIdentifier(name), password })
  const client = generateClient<Schema>()

  const { data: movies } = await client.models.Movie.list()
  const movieIdByTitle = new Map(movies.map((m) => [m.title, m.id]))
  const legacyTitleBySlug = new Map((legacy.movies ?? []).map((m) => [m.id, m.title]))

  function resolveMovieId(slugId: string): string | undefined {
    const title = legacyTitleBySlug.get(slugId)
    return title ? movieIdByTitle.get(title) : undefined
  }

  const rankedSlugIds = legacy.rankings?.[profile.id] ?? []
  const orderedMovieIds = rankedSlugIds.map(resolveMovieId).filter((id): id is string => Boolean(id))

  if (orderedMovieIds.length > 0) {
    const { errors } = await client.models.Ranking.create({ orderedMovieIds })
    if (errors) console.error('Failed to import ranking:', errors)
    else console.log(`Imported ${orderedMovieIds.length} ranked movie(s).`)
  } else {
    console.log('No ranked movies to import for this profile.')
  }

  const legacyReviews = legacy.reviews?.[profile.id] ?? {}
  let reviewCount = 0
  for (const [slugId, review] of Object.entries(legacyReviews)) {
    const movieId = resolveMovieId(slugId)
    if (!movieId) continue

    const categoryFields = Object.fromEntries(SUBRATING_KEYS.map((key) => [key, review.subratings?.[key] ?? null]))

    const { errors } = await client.models.Review.create({
      movieId,
      text: review.text ?? '',
      ...categoryFields,
    })
    if (errors) {
      console.error(`Failed to import review for "${slugId}":`, errors)
      continue
    }
    reviewCount++
  }

  console.log(`Imported ${reviewCount} review(s) for "${profileName}".`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
