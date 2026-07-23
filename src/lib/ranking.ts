export interface MovieLike {
  id: string
  title: string
}

/** A user's ranking record — the backend field is nullable-array-of-nullable-string per GraphQL. */
export interface RankingRecord {
  orderedMovieIds?: (string | null)[] | null
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
 *
 * Category ranking uses this exact same function — a "category ranking" is just
 * a Ranking record scoped to a category instead of 'overall', so aggregating
 * several people's Story rankings into one global Story order is identical math
 * to aggregating their Overall rankings. Callers just pre-filter the records
 * they pass in by category.
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

export interface RankPosition {
  position: number
  total: number
}

/**
 * Where a movie sits in a single ordered list (1-indexed), or null if the list
 * doesn't include it. Used both for a single person's per-category rank lookup
 * and for showing "#3 of 12" alongside a computeGroupRanking-derived global bar.
 */
export function findRank(movieId: string, orderedMovieIds?: (string | null)[] | null): RankPosition | null {
  const ids = (orderedMovieIds ?? []).filter((id): id is string => Boolean(id))
  const index = ids.indexOf(movieId)
  if (index === -1) return null
  return { position: index + 1, total: ids.length }
}
