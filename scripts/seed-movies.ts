/**
 * One-time seed of the official Bond movie catalog. Idempotent — safe to re-run,
 * skips titles that already exist. Must be run as a user in the Admins group,
 * since Movie writes are restricted to that group.
 *
 * Usage:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD=... npm run seed-movies
 *   POSTER_SOURCE=wikipedia ADMIN_NAME="Nick" ADMIN_PASSWORD=... npm run seed-movies
 *
 * POSTER_SOURCE defaults to 'tmdb' (real portrait one-sheet art). 'wikipedia' switches
 * back to the original landscape UK-quad scans in BOND_MOVIES[].posterUrlWikipedia —
 * kept as an option rather than deleted, even though they don't fit the poster grid's
 * aspect ratio as well.
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

  await signIn({ username: resolveLoginIdentifier(name), password })
  const client = generateClient<Schema>()

  const { data: existing, errors: listErrors } = await client.models.Movie.list()
  if (listErrors) {
    console.error(listErrors)
    process.exit(1)
  }
  const existingTitles = new Set(existing.map((m) => m.title))

  const posterSource = process.env.POSTER_SOURCE === 'wikipedia' ? 'wikipedia' : 'tmdb'

  let created = 0
  for (const [index, movie] of BOND_MOVIES.entries()) {
    if (existingTitles.has(movie.title)) continue
    const { errors } = await client.models.Movie.create({
      title: movie.title,
      year: movie.year,
      actor: movie.actor,
      posterUrl: posterSource === 'wikipedia' ? movie.posterUrlWikipedia : movie.posterUrl,
      sortOrder: index,
    })
    if (errors) {
      console.error(`Failed to create "${movie.title}":`, errors)
      continue
    }
    created++
  }

  console.log(`Seeded ${created} new movie(s). ${existing.length} already existed.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
