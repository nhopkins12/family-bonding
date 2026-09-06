/**
 * Marks movies currently ranked by at least one member as watched. Reviews/scores
 * alone never qualify a movie as watched — someone can open the review UI and leave a
 * stray score without ever having watched the movie with the group; being in an
 * actual ranked list is a much stronger, harder-to-fake signal of that.
 *
 * The watched DATE is a separate question. A Ranking row is one array field per
 * person that gets updated in place every time they add or reorder a movie, so its
 * createdAt is only "when this person first ranked anything" — every movie they've
 * ever ranked shares that one timestamp, however many weeks apart they actually
 * added each one. That collapses everyone's whole backlog onto a single date. A
 * Review is its own row per movie, so its createdAt tracks a specific movie far more
 * precisely — most people rate a movie close to when they watched it. So: gate on
 * being ranked (unchanged), but for the date itself, prefer the earliest review with
 * real content for that movie, falling back to the earliest ranking timestamp only
 * when no review exists yet.
 *
 * Dry run:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run backfill-watched-dates
 *
 * Apply:
 *   ADMIN_NAME="Nick" ADMIN_PASSWORD="..." npm run backfill-watched-dates -- --apply
 *
 * Exclude specific titles (e.g. someone ranked a movie by mistake) — comma-separated,
 * matched exactly:
 *   npm run backfill-watched-dates -- --skip "Movie One,Movie Two"
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

function collectCandidates(rankings: Ranking[]) {
  const earliest = new Map<string, Candidate>()

  function add(movieId: string | null | undefined, timestamp: number | null) {
    if (!movieId || timestamp === null) return
    const existing = earliest.get(movieId)
    if (!existing || timestamp < existing.timestamp) earliest.set(movieId, { movieId, timestamp })
  }

  for (const ranking of rankings) {
    const timestamp = timestampFrom(ranking)
    for (const movieId of ranking.orderedMovieIds ?? []) add(movieId, timestamp)
  }

  return earliest
}

function hasReviewContent(review: Review) {
  return Boolean(
    review.text ||
      review.story != null ||
      review.bond != null ||
      review.villain != null ||
      review.action != null ||
      review.themeSong != null ||
      review.gadgets != null ||
      review.rewatchability != null ||
      review.datedness != null ||
      review.misogyny != null ||
      review.culturalInsensitivity != null ||
      review.campiness != null,
  )
}

/** Earliest non-empty review per movie — a much more specific "when watched" signal than a ranking row (see file header). */
function collectEarliestReviewByMovie(reviews: Review[]) {
  const earliest = new Map<string, number>()
  for (const review of reviews) {
    if (!hasReviewContent(review)) continue
    const timestamp = timestampFrom(review)
    if (timestamp === null) continue
    const existing = earliest.get(review.movieId)
    if (existing === undefined || timestamp < existing) earliest.set(review.movieId, timestamp)
  }
  return earliest
}

function groupWatchesByMovie(watches: MovieWatch[]) {
  const byMovie = new Map<string, MovieWatch[]>()
  for (const watch of watches) byMovie.set(watch.movieId, [...(byMovie.get(watch.movieId) ?? []), watch])
  return byMovie
}

function assertRequiredModels() {
  const models = client.models as Record<string, unknown>
  const missing = ['Movie', 'Ranking', 'MovieWatch'].filter((modelName) => !models[modelName])
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

function parseSkipTitles() {
  const flagIndex = process.argv.indexOf('--skip')
  const raw = flagIndex !== -1 ? process.argv[flagIndex + 1] : process.env.BACKFILL_SKIP
  if (!raw) return new Set<string>()
  return new Set(raw.split(',').map((title) => title.trim()).filter(Boolean))
}

async function main() {
  const apply = process.argv.includes('--apply') || process.env.BACKFILL_APPLY === 'true'
  const skipTitles = parseSkipTitles()
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
  const watchedCandidates = collectCandidates(rankings)
  const earliestReviewByMovie = collectEarliestReviewByMovie(reviews)
  const watchesByMovie = groupWatchesByMovie(watches)
  let created = 0
  let updated = 0
  let unchanged = 0
  let skipped = 0

  console.log(apply ? 'Applying watched-date backfill.' : 'Dry run only. Re-run with -- --apply to write these watched dates.')
  console.log(`Found ${watchedCandidates.size} movie(s) currently ranked by at least one member.`)
  if (skipTitles.size > 0) console.log(`Excluding via --skip: ${[...skipTitles].join(', ')}`)

  for (const candidate of [...watchedCandidates.values()].sort((a, b) => a.timestamp - b.timestamp)) {
    const label = titleFor(movieById, candidate.movieId)

    if (skipTitles.has(label)) {
      skipped += 1
      console.log(`  skipping ${label} (excluded via --skip)`)
      continue
    }

    const reviewTimestamp = earliestReviewByMovie.get(candidate.movieId)
    const targetDate = dateKeyFromTimestamp(reviewTimestamp ?? candidate.timestamp)
    const dateSource = reviewTimestamp !== undefined ? 'earliest review' : 'earliest ranking'
    const existingRows = watchesByMovie.get(candidate.movieId) ?? []
    const existing = existingRows[0]
    const existingWatchedDate = dateKeyFromStoredDate(existing?.watchedAt)
    const existingScheduledDate = dateKeyFromStoredDate(existing?.scheduledFor)
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

    if (existingRows.length > 1) console.warn(`  warning: ${label} has ${existingRows.length} MovieWatch rows; cleanup-backend-data should be run separately.`)

    if (needsCreate) {
      created += 1
      console.log(`  ${apply ? 'create' : 'would create'} watched ${label} -> ${targetDate} from ${dateSource}`)
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
    console.log(`  ${apply ? 'update' : 'would update'} watched ${label} -> ${targetDate} from ${dateSource}`)
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

  console.log(`Summary: ${created} create, ${updated} update, ${unchanged} unchanged, ${skipped} skipped.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
