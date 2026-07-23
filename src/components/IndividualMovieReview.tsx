import { useMemo } from 'react'
import { useAppData } from '../state/AppDataContext'
import { findRank } from '../lib/ranking'
import { SUBRATING_KEYS } from '../types'
import { PosterImage } from './PosterImage'
import { ScoreRow } from './MovieDetailModal'

interface IndividualMovieReviewProps {
  ownerId: string
  movieId: string
  onClose: () => void
}

/** Read-only view of one member's review of one movie — their written text and
 * where this movie sits in their own per-category rankings. Opened directly from
 * MemberRankingPage (a page, not a modal), so this is a single-level modal with
 * no "back" to another modal. */
export function IndividualMovieReview({ ownerId, movieId, onClose }: IndividualMovieReviewProps) {
  const { movies, allReviews, allRankings, profilesByOwner } = useAppData()
  const movie = movies.find((m) => m.id === movieId)
  const name = profilesByOwner.get(ownerId)?.displayName ?? 'Someone'
  const review = allReviews.find((r) => r.owner === ownerId && r.movieId === movieId)

  const ranksByCategory = useMemo(() => {
    const result: Record<string, ReturnType<typeof findRank>> = {}
    for (const key of SUBRATING_KEYS) {
      const record = allRankings.find((r) => r.owner === ownerId && r.category === key)
      result[key] = findRank(movieId, record?.orderedMovieIds)
    }
    return result
  }, [allRankings, ownerId, movieId])

  const hasAnyRank = SUBRATING_KEYS.some((key) => ranksByCategory[key])

  if (!movie) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>

        <div className="modal-header">
          <PosterImage movie={movie} size="lg" />
          <div>
            <h2>{movie.title}</h2>
            <p className="modal-meta">
              {movie.year} · {movie.actor}
            </p>
            <p className="modal-meta">{name}'s review</p>
          </div>
        </div>

        {!review && !hasAnyRank ? (
          <p className="empty-state">{name} hasn't reviewed this movie yet.</p>
        ) : (
          <>
            {review?.text && (
              <section className="modal-section">
                <p className="profile-review-text">{review.text}</p>
              </section>
            )}
            {hasAnyRank && (
              <section className="modal-section">
                <div className="score-rows">
                  {SUBRATING_KEYS.map((key) => (
                    <ScoreRow key={key} subratingKey={key} rank={ranksByCategory[key]} hideCount />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
