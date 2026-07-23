import { describe, expect, it } from 'vitest'
import type { MovieLike, RankingRecord } from './ranking'
import { computeGroupRanking, findRank } from './ranking'

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

  it('aggregates a category ranking the same way as overall — callers just pre-filter by category', () => {
    // Two people's "Villain" rankings (already filtered to category === 'villain' by the caller).
    const villainRankings: RankingRecord[] = [{ orderedMovieIds: ['b', 'a'] }, { orderedMovieIds: ['a', 'b', 'c'] }]
    const result = computeGroupRanking(movies, villainRankings)
    const byId = Object.fromEntries(result.map((e) => [e.movie.id, e]))
    expect(byId.a.averageRank).toBe(1.5)
    expect(byId.b.averageRank).toBe(1.5)
    expect(byId.c.averageRank).toBe(3)
  })
})

describe('findRank', () => {
  it('reports 1-indexed position and total length', () => {
    expect(findRank('b', ['a', 'b', 'c'])).toEqual({ position: 2, total: 3 })
  })

  it('returns null when the movie is not in the list', () => {
    expect(findRank('z', ['a', 'b', 'c'])).toBeNull()
  })

  it('returns null for an empty or missing list', () => {
    expect(findRank('a', [])).toBeNull()
    expect(findRank('a', null)).toBeNull()
    expect(findRank('a', undefined)).toBeNull()
  })

  it('filters out null entries before computing position', () => {
    expect(findRank('b', ['a', null, 'b'])).toEqual({ position: 2, total: 2 })
  })
})
