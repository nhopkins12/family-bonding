import { Amplify } from 'aws-amplify'
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'

Amplify.configure(outputs)

const client = generateClient<Schema>()

type ModelClient<T> = {
  list(input?: { authMode?: 'identityPool'; limit?: number; nextToken?: string | null }): Promise<{
    data: T[]
    nextToken?: string | null
    errors?: unknown
  }>
}

type OwnedRecord = {
  id: string
  owner?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

type AppUserRecord = Schema['AppUser']['type']
type RankingRecord = Schema['Ranking']['type']
type ReviewRecord = Schema['Review']['type']
type MovieRecord = Schema['Movie']['type']

async function listAll<T>(model: ModelClient<T>) {
  const out: T[] = []
  let nextToken: string | null | undefined = null

  do {
    const result = await model.list({ authMode: 'identityPool', limit: 1000, nextToken })
    if (result.errors) throw new Error(JSON.stringify(result.errors, null, 2))
    out.push(...result.data)
    nextToken = result.nextToken
  } while (nextToken)

  return out
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

function recordSummary(record: OwnedRecord) {
  return {
    id: record.id,
    owner: record.owner,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function rankCount(record: RankingRecord) {
  return (record.orderedMovieIds ?? []).filter(Boolean).length
}

function duplicateMovieIds(record: RankingRecord) {
  const ids = (record.orderedMovieIds ?? []).filter((id): id is string => Boolean(id))
  const seen = new Set<string>()
  return [...new Set(ids.filter((id) => {
    if (seen.has(id)) return true
    seen.add(id)
    return false
  }))]
}

async function main() {
  const compact = process.argv.includes('--compact')
  const [users, rankings, reviews, movies] = await Promise.all([
    listAll<AppUserRecord>(client.models.AppUser),
    listAll<RankingRecord>(client.models.Ranking),
    listAll<ReviewRecord>(client.models.Review),
    listAll<MovieRecord>(client.models.Movie),
  ])

  const movieTitleById = new Map(movies.map((movie) => [movie.id, movie.title]))
  const activeOwners = new Set(users.filter((user) => user.owner && user.active !== false).map((user) => user.owner!))
  const usersByOwner = groupBy(users, (user) => user.owner ?? '(no owner)')
  const rankingsByOwner = groupBy(rankings, (ranking) => ranking.owner ?? '(no owner)')
  const reviewsByOwnerMovie = groupBy(reviews, (review) => `${review.owner ?? '(no owner)'}::${review.movieId}`)

  const duplicateUserOwners = [...usersByOwner.entries()].filter(([, rows]) => rows.length > 1)
  const duplicateRankingOwners = [...rankingsByOwner.entries()].filter(([, rows]) => rows.length > 1)
  const duplicateReviewOwnerMovies = [...reviewsByOwnerMovie.entries()].filter(([, rows]) => rows.length > 1)
  const latestProfileByOwner = new Map<string, AppUserRecord>()

  for (const profile of users) {
    if (!profile.owner) continue
    const existing = latestProfileByOwner.get(profile.owner)
    if (!existing || String(profile.updatedAt ?? profile.createdAt ?? '') > String(existing.updatedAt ?? existing.createdAt ?? '')) {
      latestProfileByOwner.set(profile.owner, profile)
    }
  }

  const cognito = new CognitoIdentityProviderClient({ region: outputs.auth.aws_region })
  const cognitoUsers = await cognito.send(new ListUsersCommand({ UserPoolId: outputs.auth.user_pool_id, Limit: 60 }))

  if (compact) {
    const rawRankingRowCounts = new Map<string, number>()
    for (const ranking of rankings) {
      const seenInRow = new Set((ranking.orderedMovieIds ?? []).filter((id): id is string => Boolean(id)))
      for (const movieId of seenInRow) rawRankingRowCounts.set(movieId, (rawRankingRowCounts.get(movieId) ?? 0) + 1)
    }

    const rawReviewRowCounts = new Map<string, number>()
    for (const review of reviews) {
      rawReviewRowCounts.set(review.movieId, (rawReviewRowCounts.get(review.movieId) ?? 0) + 1)
    }

    console.log(
      JSON.stringify(
        {
          backend: {
            region: outputs.auth.aws_region,
            userPoolId: outputs.auth.user_pool_id,
            graphqlUrl: outputs.data.url,
          },
          totals: {
            cognitoUsers: cognitoUsers.Users?.length ?? null,
            appUserRows: users.length,
            uniqueProfileOwners: latestProfileByOwner.size,
            activeProfileOwners: activeOwners.size,
            rankingRows: rankings.length,
            reviewRows: reviews.length,
            movieRows: movies.length,
          },
          profilesByOwner: [...latestProfileByOwner.entries()]
            .map(([owner, profile]) => ({
              owner,
              displayName: profile.displayName,
              username: profile.username,
              active: profile.active,
              latestProfileId: profile.id,
              totalProfileRows: users.filter((user) => user.owner === owner).length,
            }))
            .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))),
          rankingRowsByOwner: [...rankingsByOwner.entries()]
            .map(([owner, rows]) => ({
              owner,
              displayName: latestProfileByOwner.get(owner)?.displayName ?? owner,
              activeMember: activeOwners.has(owner),
              rows: rows.map((row) => ({
                id: row.id,
                ranked: rankCount(row),
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                duplicateMovieIds: duplicateMovieIds(row).map((id) => movieTitleById.get(id) ?? id),
              })),
            }))
            .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))),
          duplicateRankingOwners: duplicateRankingOwners.map(([owner, rows]) => ({
            owner,
            displayName: latestProfileByOwner.get(owner)?.displayName ?? owner,
            activeMember: activeOwners.has(owner),
            rows: rows.map((row) => ({ id: row.id, ranked: rankCount(row), createdAt: row.createdAt, updatedAt: row.updatedAt })),
          })),
          duplicateReviewOwnerMovies: duplicateReviewOwnerMovies.map(([key, rows]) => {
            const [owner, movieId] = key.split('::')
            return {
              owner,
              displayName: latestProfileByOwner.get(owner)?.displayName ?? owner,
              movieTitle: movieTitleById.get(movieId) ?? movieId,
              activeMember: activeOwners.has(owner),
              rows: rows.map((row) => ({ id: row.id, hasText: Boolean(row.text), createdAt: row.createdAt, updatedAt: row.updatedAt })),
            }
          }),
          moviesWithMoreThanFourRawRankingRows: [...rawRankingRowCounts.entries()]
            .filter(([, count]) => count > 4)
            .map(([movieId, count]) => ({ movieTitle: movieTitleById.get(movieId) ?? movieId, rawRankingRows: count })),
          moviesWithMoreThanFourRawReviewRows: [...rawReviewRowCounts.entries()]
            .filter(([, count]) => count > 4)
            .map(([movieId, count]) => ({ movieTitle: movieTitleById.get(movieId) ?? movieId, rawReviewRows: count })),
        },
        null,
        2,
      ),
    )
    return
  }

  const rankedMovieCounts = new Map<string, Set<string>>()
  for (const ranking of rankings) {
    const owner = ranking.owner ?? '(no owner)'
    for (const movieId of ranking.orderedMovieIds ?? []) {
      if (!movieId) continue
      if (!rankedMovieCounts.has(movieId)) rankedMovieCounts.set(movieId, new Set())
      rankedMovieCounts.get(movieId)!.add(owner)
    }
  }

  const activeRankedMovieCounts = new Map<string, Set<string>>()
  for (const ranking of rankings) {
    if (!ranking.owner || !activeOwners.has(ranking.owner)) continue
    for (const movieId of ranking.orderedMovieIds ?? []) {
      if (!movieId) continue
      if (!activeRankedMovieCounts.has(movieId)) activeRankedMovieCounts.set(movieId, new Set())
      activeRankedMovieCounts.get(movieId)!.add(ranking.owner)
    }
  }

  const report = {
    backend: {
      region: outputs.auth.aws_region,
      userPoolId: outputs.auth.user_pool_id,
      graphqlUrl: outputs.data.url,
    },
    totals: {
      movies: movies.length,
      appUsers: users.length,
      activeAppUsers: activeOwners.size,
      rankings: rankings.length,
      reviews: reviews.length,
    },
    users: users
      .map((user) => ({
        ...recordSummary(user),
        displayName: user.displayName,
        username: user.username,
        active: user.active,
      }))
      .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))),
    rankingOwners: [...rankingsByOwner.entries()]
      .map(([owner, rows]) => ({
        owner,
        activeMember: activeOwners.has(owner),
        recordCount: rows.length,
        rankedCounts: rows.map(rankCount),
        rows: rows.map((row) => ({
          ...recordSummary(row),
          ranked: rankCount(row),
          duplicateMovieIds: duplicateMovieIds(row).map((id) => ({ id, title: movieTitleById.get(id) ?? '(unknown)' })),
        })),
      }))
      .sort((a, b) => a.owner.localeCompare(b.owner)),
    duplicateUserOwners: duplicateUserOwners.map(([owner, rows]) => ({
      owner,
      rows: rows.map((row) => ({
        ...recordSummary(row),
        displayName: row.displayName,
        username: row.username,
        active: row.active,
      })),
    })),
    duplicateRankingOwners: duplicateRankingOwners.map(([owner, rows]) => ({
      owner,
      activeMember: activeOwners.has(owner),
      rows: rows.map((row) => ({ ...recordSummary(row), ranked: rankCount(row) })),
    })),
    duplicateReviewOwnerMovies: duplicateReviewOwnerMovies.map(([key, rows]) => {
      const [, movieId] = key.split('::')
      return {
        key,
        movieTitle: movieTitleById.get(movieId) ?? '(unknown)',
        activeMember: activeOwners.has(key.split('::')[0]),
        rows: rows.map((row) => ({
          ...recordSummary(row),
          hasText: Boolean(row.text),
          scores: {
            story: row.story,
            bond: row.bond,
            villain: row.villain,
            action: row.action,
            themeSong: row.themeSong,
            gadgets: row.gadgets,
            rewatchability: row.rewatchability,
            datedness: row.datedness,
            misogyny: row.misogyny,
            culturalInsensitivity: row.culturalInsensitivity,
            campiness: row.campiness,
          },
        })),
      }
    }),
    moviesWithMoreThanFourRawRankingOwners: [...rankedMovieCounts.entries()]
      .filter(([, owners]) => owners.size > 4)
      .map(([movieId, owners]) => ({ movieId, title: movieTitleById.get(movieId) ?? '(unknown)', owners: [...owners] })),
    moviesWithMoreThanFourActiveRankingOwners: [...activeRankedMovieCounts.entries()]
      .filter(([, owners]) => owners.size > 4)
      .map(([movieId, owners]) => ({ movieId, title: movieTitleById.get(movieId) ?? '(unknown)', owners: [...owners] })),
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
