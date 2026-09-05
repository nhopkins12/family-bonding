/**
 * Marks movies that already have ranking/review activity as watched.
 *
 * Dry run:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run backfill-watched-dates
 *
 * Apply:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run backfill-watched-dates -- --apply
 *
 * PowerShell apply alternative:
 *   $env:BACKFILL_APPLY="true"
 *   npm run backfill-watched-dates
 */
import { Amplify } from 'aws-amplify'
import { signIn } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'
import { resolveLoginIdentifier } from '../src/lib/memberLogin'

Amplify.configure(outputs)

const client = generateClient<Schema>()

type Movie = Schema['Movie']['type']
type Ranking = Schema['Ranking']['type']
type Review = Schema['Review']['type']
type MovieWatch = Schema['MovieWatch']['type']

type ModelClient<T extends { id: string }> = {
  list(input?: { limit?: number; nextToken?: string | null }): Promise<{
    data: T[]
    nextToken?: string | null
    errors?: { message: string }[]
  }>
}

type Candidate = {
  movieId: string
  timestamp: number
  source: string
}

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

function timestampFrom(record: { createdAt?: string | null; updatedAt?: string | null }) {
  const candidates = [record.createdAt, record.updatedAt]
    .map((value) => Date.parse(value ?? ''))
    .filter((value) => !Number.isNaN(value))
  return candidates.length ? Math.min(...candidates) : null
}

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dateKeyFromStoredDate(value: string | null | undefined) {
  if (!value) return null
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : dateKeyFromTimestamp(parsed)
}

function titleFor(movieById: Map<string, Movie>, movieId: string) {
  return movieById.get(movieId)?.title ?? movieId
}

function collectCandidates(rankings: Ranking[], reviews: Review[]) {
  const earliest = new Map<string, Candidate>()

  function add(movieId: string | null | undefined, timestamp: number | null, source: string) {
    if (!movieId || timestamp === null) return
    const existing = earliest.get(movieId)
    if (!existing || timestamp < existing.timestamp) earliest.set(movieId, { movieId, timestamp, source })
  }

  for (const ranking of rankings) {
    const timestamp = timestampFrom(ranking)
    for (const movieId of ranking.orderedMovieIds ?? []) add(movieId, timestamp, 'ranking')
  }

  for (const review of reviews) add(review.movieId, timestampFrom(review), 'review')

  return earliest
}

function groupWatchesByMovie(watches: MovieWatch[]) {
  const byMovie = new Map<string, MovieWatch[]>()
  for (const watch of watches) byMovie.set(watch.movieId, [...(byMovie.get(watch.movieId) ?? []), watch])
  return byMovie
}

function assertRequiredModels() {
  const models = client.models as Record<string, unknown>
  const missing = ['Movie', 'Ranking', 'Review', 'MovieWatch', 'WatchVote'].filter((modelName) => !models[modelName])
  if (missing.length === 0) return

  throw new Error(
    [
      `Your current amplify_outputs.json is missing these backend model(s): ${missing.join(', ')}.`,
      'Deploy or start the updated Amplify backend before running this backfill.',
      'For local sandbox testing, run: npm run sandbox',
      'For the hosted app, push/deploy the branch that contains amplify/data/resource.ts, then pull/regenerate the updated amplify_outputs.json if needed.',
    ].join('\n'),
  )
}

async function main() {
  const apply = process.argv.includes('--apply') || process.env.BACKFILL_APPLY === 'true'
  const name = process.env.ADMIN_NAME
  const password = process.env.ADMIN_PASSWORD

  assertRequiredModels()

  if (!name || !password) {
    console.error('Set ADMIN_NAME and ADMIN_PASSWORD for an Admins-group account before running the backfill.')
    process.exit(1)
  }

  await signIn({ username: resolveLoginIdentifier(name), password })

  const [movies, rankings, reviews, watches] = await Promise.all([
    listAll(client.models.Movie),
    listAll(client.models.Ranking),
    listAll(client.models.Review),
    listAll(client.models.MovieWatch),
  ])

  const movieById = new Map(movies.map((movie) => [movie.id, movie]))
  const watchedCandidates = collectCandidates(rankings, reviews)
  const watchesByMovie = groupWatchesByMovie(watches)
  let created = 0
  let updated = 0
  let unchanged = 0

  console.log(apply ? 'Applying watched-date backfill.' : 'Dry run only. Re-run with -- --apply to write these watched dates.')
  console.log(`Found ${watchedCandidates.size} movie(s) with ranking or review activity.`)

  for (const candidate of [...watchedCandidates.values()].sort((a, b) => a.timestamp - b.timestamp)) {
    const dateKey = dateKeyFromTimestamp(candidate.timestamp)
    const existingRows = watchesByMovie.get(candidate.movieId) ?? []
    const existing = existingRows[0]
    const existingWatchedDate = dateKeyFromStoredDate(existing?.watchedAt)
    const existingScheduledDate = dateKeyFromStoredDate(existing?.scheduledFor)
    const targetDate = [dateKey, existingWatchedDate].filter(Boolean).sort()[0] ?? dateKey
    const needsCreate = !existing
    const needsUpdate =
      Boolean(existing) &&
      (existing.status !== 'watched' ||
        existingWatchedDate !== targetDate ||
        existingScheduledDate !== targetDate ||
        existingRows.length > 1)

    if (!needsCreate && !needsUpdate) {
      unchanged += 1
      continue
    }

    const label = titleFor(movieById, candidate.movieId)
    if (existingRows.length > 1) console.warn(`  warning: ${label} has ${existingRows.length} MovieWatch rows; cleanup-backend-data should be run separately.`)

    if (needsCreate) {
      created += 1
      console.log(`  ${apply ? 'create' : 'would create'} watched ${label} -> ${targetDate} from earliest ${candidate.source}`)
      if (apply) {
        const result = await client.models.MovieWatch.create({
          id: candidate.movieId,
          movieId: candidate.movieId,
          status: 'watched',
          scheduledFor: targetDate,
          watchedAt: targetDate,
        })
        if (result.errors) throw new Error(result.errors.map((error) => error.message).join('; '))
      }
      continue
    }

    updated += 1
    console.log(`  ${apply ? 'update' : 'would update'} watched ${label} -> ${targetDate} from earliest ${candidate.source}`)
    if (apply) {
      const result = await client.models.MovieWatch.update({
        id: existing.id,
        movieId: candidate.movieId,
        status: 'watched',
        scheduledFor: targetDate,
        watchedAt: targetDate,
      })
      if (result.errors) throw new Error(result.errors.map((error) => error.message).join('; '))
    }
  }

  console.log(`Summary: ${created} create, ${updated} update, ${unchanged} unchanged.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
