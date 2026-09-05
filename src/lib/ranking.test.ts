import { describe, expect, it } from 'vitest'
import type { MovieLike, RankingRecord, ReviewRecord } from './ranking'
import { computeCategoryRanking, computeMovieCategoryAverages, computePairwiseRanking } from './ranking'

function movie(id: string, title: string): MovieLike {
  return { id, title }
}

const movies: MovieLike[] = [movie('a', 'Alpha'), movie('b', 'Bravo'), movie('c', 'Charlie'), movie('d', 'Delta')]

describe('computePairwiseRanking', () => {
  it('omits movies nobody has ranked', () => {
    const rankings: RankingRecord[] = [{ owner: 'u1', orderedMovieIds: ['a'] }]
    const result = computePairwiseRanking(movies, rankings)
    expect(result.map((e) => e.movie.id)).toEqual(['a'])
  })

  it('handles null/missing ranking data gracefully', () => {
    const rankings: RankingRecord[] = [{ owner: 'u1', orderedMovieIds: null }, { owner: 'u2', orderedMovieIds: ['a', null, 'b'] }, {}]
    const result = computePairwiseRanking(movies, rankings)
    expect(result.map((e) => e.movie.id).sort()).toEqual(['a', 'b'])
  })

  it('counts a movie only once per ranking record if duplicate ids are present', () => {
    const result = computePairwiseRanking(movies, [{ owner: 'u1', orderedMovieIds: ['a', 'a', 'b'] }])
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))

    expect(byId.a.wins).toBe(1)
    expect(byId.a.reviewerCount).toBe(1)
  })

  it('ranks by head-to-head placements instead of raw position values', () => {
    const rankings: RankingRecord[] = [
      { owner: 'u1', orderedMovieIds: ['a', 'b', 'c'] },
      { owner: 'u2', orderedMovieIds: ['b', 'a', 'c'] },
      { owner: 'u3', orderedMovieIds: ['b', 'c', 'a'] },
    ]
    const result = computePairwiseRanking(movies, rankings)

    expect(result[0].movie.id).toBe('b')
    expect(result[0]).toMatchObject({ wins: 5, losses: 1, matchupCount: 6, reviewerCount: 3 })
  })

  it('lets a shorter list contribute only comparisons it actually contains', () => {
    const rankings: RankingRecord[] = [
      { owner: 'u1', orderedMovieIds: ['a', 'b', 'c', 'd'] },
      { owner: 'u2', orderedMovieIds: ['b', 'a'] },
    ]
    const result = computePairwiseRanking(movies, rankings)
    const byId = Object.fromEntries(result.map((entry) => [entry.movie.id, entry]))

    expect(byId.b.wins).toBe(3)
    expect(byId.b.losses).toBe(1)
    expect(byId.b.reviewerCount).toBe(2)
    expect(byId.d.reviewerCount).toBe(1)
  })

  it('uses only the latest ranking per owner', () => {
    const result = computePairwiseRanking(movies, [
      { id: 'old', owner: 'u1', updatedAt: '2026-01-01T00:00:00.000Z', orderedMovieIds: ['a', 'b'] },
      { id: 'new', owner: 'u1', updatedAt: '2026-01-02T00:00:00.000Z', orderedMovieIds: ['b', 'a'] },
    ])

    expect(result.map((entry) => entry.movie.id)).toEqual(['b', 'a'])
  })
})

describe('computeCategoryRanking', () => {
  it('averages a positive category across all review records', () => {
    const reviews: ReviewRecord[] = [
      { movieId: 'a', story: 8 },
      { movieId: 'b', story: 4 },
      { movieId: 'a', story: 6 },
    ]
    const result = computeCategoryRanking(movies, reviews, 'story')
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))
    expect(byId.a.average).toBe(7)
    expect(byId.a.reviewerCount).toBe(2)
    expect(byId.b.average).toBe(4)
    expect(byId.b.reviewerCount).toBe(1)
  })

  it('sorts highest average first for a positive category', () => {
    const reviews: ReviewRecord[] = [
      { movieId: 'a', action: 5 },
      { movieId: 'b', action: 9 },
      { movieId: 'c', action: 7 },
    ]
    const result = computeCategoryRanking(movies, reviews, 'action')
    expect(result.map((e) => e.movie.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts Datedness highest-first too (caller frames it as "most dated", not "best")', () => {
    const reviews: ReviewRecord[] = [
      { movieId: 'a', datedness: 2 },
      { movieId: 'b', datedness: 8 },
    ]
    const result = computeCategoryRanking(movies, reviews, 'datedness')
    expect(result.map((e) => e.movie.id)).toEqual(['b', 'a'])
  })

  it('sorts Misogyny highest-first too (caller frames it as "most misogynistic", not "best")', () => {
    const reviews: ReviewRecord[] = [
      { movieId: 'a', misogyny: 1 },
      { movieId: 'b', misogyny: 9 },
      { movieId: 'c', misogyny: 5 },
    ]
    const result = computeCategoryRanking(movies, reviews, 'misogyny')
    expect(result.map((e) => e.movie.id)).toEqual(['b', 'c', 'a'])
  })

  it('sorts Cultural Insensitivity and Campiness highest-first too (descriptive, not "best")', () => {
    const culturalInsensitivityReviews: ReviewRecord[] = [
      { movieId: 'a', culturalInsensitivity: 2 },
      { movieId: 'b', culturalInsensitivity: 9 },
    ]
    expect(computeCategoryRanking(movies, culturalInsensitivityReviews, 'culturalInsensitivity').map((e) => e.movie.id)).toEqual([
      'b',
      'a',
    ])

    const campinessReviews: ReviewRecord[] = [
      { movieId: 'a', campiness: 7 },
      { movieId: 'b', campiness: 3 },
    ]
    expect(computeCategoryRanking(movies, campinessReviews, 'campiness').map((e) => e.movie.id)).toEqual(['a', 'b'])
  })

  it('averages the renamed "bond" category (formerly bondPerformance)', () => {
    const reviews: ReviewRecord[] = [{ movieId: 'a', bond: 8 }, { movieId: 'a', bond: 6 }]
    const result = computeCategoryRanking(movies, reviews, 'bond')
    expect(result[0]).toMatchObject({ average: 7, reviewerCount: 2 })
  })

  it('omits movies nobody has scored on that category', () => {
    const reviews: ReviewRecord[] = [{ movieId: 'a', story: 5 }]
    const result = computeCategoryRanking(movies, reviews, 'story')
    expect(result.map((e) => e.movie.id)).toEqual(['a'])
  })

  it('ignores null/undefined category values instead of treating them as zero', () => {
    const reviews: ReviewRecord[] = [{ movieId: 'a', story: null }, { movieId: 'a', story: 8 }, { movieId: 'b' }]
    const result = computeCategoryRanking(movies, reviews, 'story')
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))
    expect(byId.a.average).toBe(8)
    expect(byId.a.reviewerCount).toBe(1)
    expect(byId.b).toBeUndefined()
  })

  it('breaks ties alphabetically by title', () => {
    const reviews: ReviewRecord[] = [{ movieId: 'a', villain: 5 }, { movieId: 'b', villain: 5 }]
    const result = computeCategoryRanking(movies, reviews, 'villain')
    expect(result.map((e) => e.movie.id)).toEqual(['a', 'b'])
  })

  it('averages the Gadgets category', () => {
    const reviews: ReviewRecord[] = [{ movieId: 'a', gadgets: 9 }, { movieId: 'a', gadgets: 7 }]
    const result = computeCategoryRanking(movies, reviews, 'gadgets')
    expect(result[0]).toMatchObject({ average: 8, reviewerCount: 2 })
  })

  it('uses only the latest review per owner and movie for category counts', () => {
    const reviews: ReviewRecord[] = [
      { id: 'old', owner: 'u1', movieId: 'a', updatedAt: '2026-01-01T00:00:00.000Z', story: 2 },
      { id: 'new', owner: 'u1', movieId: 'a', updatedAt: '2026-01-02T00:00:00.000Z', story: 8 },
      { id: 'u2', owner: 'u2', movieId: 'a', updatedAt: '2026-01-01T00:00:00.000Z', story: 6 },
    ]
    const result = computeCategoryRanking(movies, reviews, 'story')

    expect(result[0]).toMatchObject({ average: 7, reviewerCount: 2 })
  })
})

describe('computeMovieCategoryAverages', () => {
  it('averages every requested category for one movie across users', () => {
    const reviews: ReviewRecord[] = [
      { movieId: 'a', story: 8, misogyny: 2 },
      { movieId: 'a', story: 6, misogyny: 4 },
      { movieId: 'b', story: 9 },
    ]
    const result = computeMovieCategoryAverages('a', reviews, ['story', 'misogyny', 'action'])
    expect(result.story).toEqual({ average: 7, reviewerCount: 2 })
    expect(result.misogyny).toEqual({ average: 3, reviewerCount: 2 })
    expect(result.action).toBeNull()
  })

  it('uses only the latest review per owner and movie for detail averages', () => {
    const reviews: ReviewRecord[] = [
      { id: 'old', owner: 'u1', movieId: 'a', updatedAt: '2026-01-01T00:00:00.000Z', story: 2 },
      { id: 'new', owner: 'u1', movieId: 'a', updatedAt: '2026-01-02T00:00:00.000Z', story: 10 },
      { id: 'u2', owner: 'u2', movieId: 'a', updatedAt: '2026-01-01T00:00:00.000Z', story: 6 },
    ]
    const result = computeMovieCategoryAverages('a', reviews, ['story'])

    expect(result.story).toEqual({ average: 8, reviewerCount: 2 })
  })
})
