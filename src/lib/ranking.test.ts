import { describe, expect, it } from 'vitest'
import type { MovieLike, RankingRecord, ReviewRecord } from './ranking'
import { computeCategoryRanking, computeGroupRanking, computeMovieCategoryAverages } from './ranking'

function movie(id: string, title: string): MovieLike {
  return { id, title }
}

const movies: MovieLike[] = [movie('a', 'Alpha'), movie('b', 'Bravo'), movie('c', 'Charlie'), movie('d', 'Delta')]

describe('computeGroupRanking', () => {
  it('averages rank positions across users who ranked a movie', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['a', 'b', 'c'] }, { orderedMovieIds: ['b', 'a', 'c'] }]
    const result = computeGroupRanking(movies, rankings)

    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))
    expect(byId.a.averageRank).toBe(1.5)
    expect(byId.b.averageRank).toBe(1.5)
    expect(byId.c.averageRank).toBe(3)
  })

  it('excludes movies a user did not rank from that user contribution', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['a', 'b'] }, { orderedMovieIds: ['b'] }]
    const result = computeGroupRanking(movies, rankings)
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))

    expect(byId.a.averageRank).toBe(1)
    expect(byId.a.reviewerCount).toBe(1)
    expect(byId.b.averageRank).toBe(1.5)
    expect(byId.b.reviewerCount).toBe(2)
  })

  it('omits movies nobody has ranked', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['a'] }]
    const result = computeGroupRanking(movies, rankings)
    expect(result.map((e) => e.movie.id)).toEqual(['a'])
  })

  it('does not require every user to have ranked every movie', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['a'] }, { orderedMovieIds: ['a', 'b', 'c'] }]
    const result = computeGroupRanking(movies, rankings)
    expect(result.map((e) => e.movie.id).sort()).toEqual(['a', 'b', 'c'])
  })

  it('handles null/missing ranking data gracefully', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: null }, { orderedMovieIds: ['a', null, 'b'] }, {}]
    const result = computeGroupRanking(movies, rankings)
    expect(result.map((e) => e.movie.id)).toEqual(['a', 'b'])
  })

  it('sorts by lowest average rank first', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['c', 'a', 'b'] }]
    const result = computeGroupRanking(movies, rankings)
    expect(result.map((e) => e.movie.id)).toEqual(['c', 'a', 'b'])
  })

  it('breaks ties alphabetically by title', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['b', 'a'] }, { orderedMovieIds: ['a', 'b'] }]
    const result = computeGroupRanking(movies, rankings)
    expect(result[0].movie.id).toBe('a')
    expect(result[1].movie.id).toBe('b')
  })

  it('reports the number of users included in the average', () => {
    const rankings: RankingRecord[] = [{ orderedMovieIds: ['a'] }, { orderedMovieIds: ['a'] }, { orderedMovieIds: ['b'] }]
    const result = computeGroupRanking(movies, rankings)
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))
    expect(byId.a.reviewerCount).toBe(2)
    expect(byId.b.reviewerCount).toBe(1)
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
})
