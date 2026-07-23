import type { SubratingKey } from '../types'

export interface MovieLike {
  id: string
  title: string
}

/** A user's ranking record — the backend field is nullable-array-of-nullable-string per GraphQL. */
export interface RankingRecord {
  orderedMovieIds?: (string | null)[] | null
}

export type CategoryRatings = Partial<Record<SubratingKey, number | null | undefined>>

/** A single review record: one user's rating of one movie. */
export interface ReviewRecord extends CategoryRatings {
  movieId: string
}

export interface GroupRankingEntry<T extends MovieLike = MovieLike> {
  movie: T
  averageRank: number
  reviewerCount: number
}

/**
 * Combines every user's ranked list into one consensus ranking.
 *
 * Rank position 1 is best. For each movie, we average its rank positions
 * across only the users who ranked it (unranked = excluded, not penalized).
 * Movies nobody has ranked are omitted entirely (there is nothing to average).
 * Ties break alphabetically by title.
 */
export function computeGroupRanking<T extends MovieLike>(
  movies: T[],
  rankings: RankingRecord[],
): GroupRankingEntry<T>[] {
  const rankSums = new Map<string, number>()
  const rankCounts = new Map<string, number>()

  for (const ranking of rankings) {
    const orderedMovieIds = (ranking.orderedMovieIds ?? []).filter((id): id is string => Boolean(id))
    orderedMovieIds.forEach((movieId, index) => {
      const position = index + 1
      rankSums.set(movieId, (rankSums.get(movieId) ?? 0) + position)
      rankCounts.set(movieId, (rankCounts.get(movieId) ?? 0) + 1)
    })
  }

  const entries: GroupRankingEntry<T>[] = []

  for (const movie of movies) {
    const count = rankCounts.get(movie.id) ?? 0
    if (count === 0) continue

    entries.push({
      movie,
      averageRank: rankSums.get(movie.id)! / count,
      reviewerCount: count,
    })
  }

  entries.sort((a, b) => {
    if (a.averageRank !== b.averageRank) return a.averageRank - b.averageRank
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

  for (const review of reviews) {
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
  const relevant = reviews.filter((r) => r.movieId === movieId)
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
