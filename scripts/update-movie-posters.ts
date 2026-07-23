/**
 * Updates posterUrl on movies that already exist (seed-movies.ts only creates missing
 * ones — it never touches existing rows, so switching BOND_MOVIES' poster source doesn't
 * retroactively apply to a database that was seeded before the change). Matches existing
 * rows to BOND_MOVIES by title and only writes ones whose posterUrl actually differs.
 * Must be run as a user in the Admins group, since Movie writes are restricted to that
 * group. Whichever backend amplify_outputs.json currently points to is the one this
 * updates — double check that's the one you mean to touch before running it.
 *
 * Usage:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD=... npm run update-movie-posters
 *   POSTER_SOURCE=wikipedia ADMIN_NAME="Nick" ADMIN_PASSWORD=... npm run update-movie-posters
 */
import { Amplify } from 'aws-amplify'
import { signIn } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'
import { BOND_MOVIES } from '../src/data/bondMovies'
import { resolveLoginIdentifier } from '../src/lib/memberLogin'

Amplify.configure(outputs)

async function main() {
  const name = process.env.ADMIN_NAME
  const password = process.env.ADMIN_PASSWORD
  if (!name || !password) {
    console.error('Set ADMIN_NAME and ADMIN_PASSWORD env vars for an Admins-group account before running this script.')
    process.exit(1)
  }
  if (outputs.auth.user_pool_id === 'REPLACE_AFTER_DEPLOY') {
    console.error('amplify_outputs.json is still a placeholder — deploy the backend first (see README).')
    process.exit(1)
  }

  console.log(`Targeting user pool ${outputs.auth.user_pool_id} / API ${outputs.data.url}`)

  await signIn({ username: resolveLoginIdentifier(name), password })
  const client = generateClient<Schema>()

  const { data: existing, errors: listErrors } = await client.models.Movie.list()
  if (listErrors) {
    console.error(listErrors)
    process.exit(1)
  }

  const posterSource = process.env.POSTER_SOURCE === 'wikipedia' ? 'wikipedia' : 'tmdb'
  const byTitle = new Map(BOND_MOVIES.map((m) => [m.title, m]))

  let updated = 0
  let skipped = 0
  for (const movie of existing) {
    const seed = byTitle.get(movie.title)
    if (!seed) {
      console.log(`No BOND_MOVIES entry for "${movie.title}" — leaving it alone.`)
      continue
    }
    const nextPosterUrl = posterSource === 'wikipedia' ? seed.posterUrlWikipedia : seed.posterUrl
    if (movie.posterUrl === nextPosterUrl) {
      skipped++
      continue
    }
    const { errors } = await client.models.Movie.update({ id: movie.id, posterUrl: nextPosterUrl })
    if (errors) {
      console.error(`Failed to update "${movie.title}":`, errors)
      continue
    }
    updated++
    console.log(`Updated "${movie.title}"`)
  }

  console.log(`Updated ${updated} movie(s), ${skipped} already matched, ${existing.length} total.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
