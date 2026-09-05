import type { SubratingKey } from '../types'
import { latestByKey, type TimestampedRecord } from './records'

export interface MovieLike {
  id: string
  title: string
}

/** A user's ranking record — the backend field is nullable-array-of-nullable-string per GraphQL. */
export interface RankingRecord extends TimestampedRecord {
  owner?: string | null
  orderedMovieIds?: (string | null)[] | null
}

export type CategoryRatings = Partial<Record<SubratingKey, number | null | undefined>>

/** A single review record: one user's rating of one movie. */
export interface ReviewRecord extends TimestampedRecord, CategoryRatings {
  owner?: string | null
  movieId: string
}

export interface PairwiseRankingEntry<T extends MovieLike = MovieLike> {
  movie: T
  winRate: number
  wins: number
  losses: number
  matchupCount: number
  reviewerCount: number
}

/**
 * Consensus ranking via head-to-head comparisons, so members who've ranked different
 * numbers of movies still contribute fairly.
 *
 * Each member's ranked list contributes only the head-to-head comparisons it actually
 * contains: a user's #2 of 4 means "above the two movies below it", not the same
 * absolute placement as another user's #2 of 10. Movies sort by win rate (wins /
 * matchups), so a movie two people agree is great outranks one that squeaked a single
 * narrow win.
 */
export function computePairwiseRanking<T extends MovieLike>(
  movies: T[],
  rankings: RankingRecord[],
): PairwiseRankingEntry<T>[] {
  const movieIds = new Set(movies.map((movie) => movie.id))
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  const reviewersByMovie = new Map<string, Set<string>>()

  for (const ranking of latestByKey(rankings, (r) => r.owner)) {
    const seen = new Set<string>()
    const orderedMovieIds = (ranking.orderedMovieIds ?? []).filter((id): id is string => {
      if (!id || !movieIds.has(id) || seen.has(id)) return false
      seen.add(id)
      return true
    })
    const reviewer = ranking.owner ?? ranking.id ?? `ownerless-${orderedMovieIds.join('-')}`

    for (const movieId of orderedMovieIds) {
      if (!reviewersByMovie.has(movieId)) reviewersByMovie.set(movieId, new Set())
      reviewersByMovie.get(movieId)!.add(reviewer)
    }

    for (let i = 0; i < orderedMovieIds.length; i++) {
      const winner = orderedMovieIds[i]
      for (let j = i + 1; j < orderedMovieIds.length; j++) {
        const loser = orderedMovieIds[j]
        wins.set(winner, (wins.get(winner) ?? 0) + 1)
        losses.set(loser, (losses.get(loser) ?? 0) + 1)
      }
    }
  }

  const entries: PairwiseRankingEntry<T>[] = []
  for (const movie of movies) {
    const movieWins = wins.get(movie.id) ?? 0
    const movieLosses = losses.get(movie.id) ?? 0
    const matchupCount = movieWins + movieLosses
    const reviewerCount = reviewersByMovie.get(movie.id)?.size ?? 0
    if (reviewerCount === 0) continue

    entries.push({
      movie,
      wins: movieWins,
      losses: movieLosses,
      matchupCount,
      reviewerCount,
      winRate: matchupCount === 0 ? 0 : movieWins / matchupCount,
    })
  }

  entries.sort((a, b) => {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate
    if (a.wins - a.losses !== b.wins - b.losses) return b.wins - b.losses - (a.wins - a.losses)
    if (a.matchupCount !== b.matchupCount) return b.matchupCount - a.matchupCount
    if (a.reviewerCount !== b.reviewerCount) return b.reviewerCount - a.reviewerCount
    return a.movie.title.localeCompare(b.movie.title)
  })

  return entries
}

export interface CategoryRankingEntry<T extends MovieLike = MovieLike> {
  movie: T
  average: number
  reviewerCount: number
}

/**
 * Ranks movies by the average of a single rating category, across whichever review
 * records are passed in. Pass every review for a global/group category ranking, or
 * just one user's reviews for a personal category ranking — the averaging logic is
 * the same either way. Movies nobody has scored on this category are omitted.
 * Higher average sorts first; for inverted categories (Datedness, Misogyny) that
 * means "most present" first, not "best" first. There's no longer a UI label calling
 * that out (removed per product feedback) — SUBRATING_LABELS' plain names are all a
 * caller has to work with now.
 */
export function computeCategoryRanking<T extends MovieLike>(
  movies: T[],
  reviews: ReviewRecord[],
  key: SubratingKey,
): CategoryRankingEntry<T>[] {
  const sums = new Map<string, number>()
  const counts = new Map<string, number>()

  for (const review of latestReviewsByOwnerAndMovie(reviews)) {
    const value = review[key]
    if (typeof value === 'number') {
      sums.set(review.movieId, (sums.get(review.movieId) ?? 0) + value)
      counts.set(review.movieId, (counts.get(review.movieId) ?? 0) + 1)
    }
  }

  const entries: CategoryRankingEntry<T>[] = []
  for (const movie of movies) {
    const count = counts.get(movie.id) ?? 0
    if (count === 0) continue
    entries.push({ movie, average: sums.get(movie.id)! / count, reviewerCount: count })
  }

  entries.sort((a, b) => {
    if (a.average !== b.average) return b.average - a.average
    return a.movie.title.localeCompare(b.movie.title)
  })

  return entries
}

export interface CategorySummary {
  average: number
  reviewerCount: number
}

/** Averages every rating category for one movie, across all review records that mention it. */
export function computeMovieCategoryAverages(
  movieId: string,
  reviews: ReviewRecord[],
  keys: readonly SubratingKey[],
): Record<SubratingKey, CategorySummary | null> {
  const relevant = latestReviewsByOwnerAndMovie(reviews).filter((r) => r.movieId === movieId)
  const result = {} as Record<SubratingKey, CategorySummary | null>

  for (const key of keys) {
    let sum = 0
    let count = 0
    for (const review of relevant) {
      const value = review[key]
      if (typeof value === 'number') {
        sum += value
        count += 1
      }
    }
    result[key] = count > 0 ? { average: sum / count, reviewerCount: count } : null
  }

  return result
}

function latestReviewsByOwnerAndMovie(reviews: ReviewRecord[]): ReviewRecord[] {
  return latestByKey(reviews, (review) => (review.owner ? `${review.owner}:${review.movieId}` : null))
}
