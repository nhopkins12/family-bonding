import { useAppData } from '../state/AppDataContext'
import { SUBRATING_KEYS } from '../types'
import { ModalBackdrop } from './ModalBackdrop'
import { PosterImage } from './PosterImage'
import { ScoreRow } from './MovieDetailModal'

interface IndividualMovieReviewProps {
  ownerId: string
  movieId: string
  onClose: () => void
}

/** Read-only view of one member's review of one movie — their text and their category
 * ratings. Opened directly from MemberRankingPage (a page, not a modal), so this is a
 * single-level modal with no "back" to another modal. */
export function IndividualMovieReview({ ownerId, movieId, onClose }: IndividualMovieReviewProps) {
  const { movies, allReviews, profilesByOwner } = useAppData()
  const movie = movies.find((m) => m.id === movieId)
  const name = profilesByOwner.get(ownerId)?.displayName ?? 'Someone'
  const review = allReviews.find((r) => r.owner === ownerId && r.movieId === movieId)

  if (!movie) return null

  return (
    <ModalBackdrop onClose={onClose}>
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

        {!review ? (
          <p className="empty-state">{name} hasn't reviewed this movie yet.</p>
        ) : (
          <>
            {review.text && (
              <section className="modal-section">
                <p className="profile-review-text">{review.text}</p>
              </section>
            )}
            <section className="modal-section">
              <div className="score-rows">
                {SUBRATING_KEYS.map((key) => {
                  const value = review[key]
                  return (
                    <ScoreRow
                      key={key}
                      subratingKey={key}
                      summary={typeof value === 'number' ? { average: value, reviewerCount: 1 } : null}
                      hideCount
                    />
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </ModalBackdrop>
  )
}
