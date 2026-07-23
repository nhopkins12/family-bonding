import { useMemo } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeMovieCategoryAverages } from '../lib/ranking'
import { INVERTED_SUBRATINGS, SUBRATING_KEYS, SUBRATING_LABELS, type SubratingKey } from '../types'
import { PosterImage } from './PosterImage'

interface MovieDetailModalProps {
  movieId: string
  onClose: () => void
  onOpenProfile: (ownerId: string) => void
}

/** Read-only global view of a movie: average category ratings, and everyone's written review. */
export function MovieDetailModal({ movieId, onClose, onOpenProfile }: MovieDetailModalProps) {
  const { movies, allReviews, profilesByOwner } = useAppData()
  const movie = movies.find((m) => m.id === movieId)

  const reviewsForMovie = useMemo(
    () =>
      allReviews
        .filter((r) => r.movieId === movieId && r.text)
        .map((review) => ({ review, name: profilesByOwner.get(review.owner ?? '')?.displayName ?? 'Someone' })),
    [allReviews, movieId, profilesByOwner],
  )

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
          </div>
        </div>

        <section className="modal-section">
          <h3>Average Ratings</h3>
          <GlobalAverages movieId={movieId} />
        </section>

        {reviewsForMovie.length > 0 && (
          <section className="modal-section">
            <h3>Reviews</h3>
            <div className="all-reviews-list">
              {reviewsForMovie.map(({ review, name }) => (
                <div key={review.id} className="profile-review-card">
                  <button type="button" className="profile-review-name" onClick={() => onOpenProfile(review.owner ?? '')}>
                    {name}
                  </button>
                  <p className="profile-review-text">{review.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function GlobalAverages({ movieId }: { movieId: string }) {
  const { allReviews } = useAppData()
  const averages = useMemo(
    () => computeMovieCategoryAverages(movieId, allReviews, SUBRATING_KEYS),
    [allReviews, movieId],
  )

  return (
    <div className="score-rows">
      {SUBRATING_KEYS.map((key) => (
        <ScoreRow key={key} subratingKey={key} summary={averages[key]} />
      ))}
    </div>
  )
}

export function ScoreRow({
  subratingKey,
  summary,
  hideCount = false,
}: {
  subratingKey: SubratingKey
  summary: { average: number; reviewerCount: number } | null
  hideCount?: boolean
}) {
  const isInverted = INVERTED_SUBRATINGS.has(subratingKey)
  const percent = summary ? Math.max(0, Math.min(100, (summary.average / 10) * 100)) : 0

  return (
    <div className="score-row">
      <span className="score-row-label">
        <span className="score-row-label-text">{SUBRATING_LABELS[subratingKey]}</span>
        {isInverted && <span className="inverted-tag">more</span>}
      </span>
      <span className="score-row-track">
        <span className="score-row-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="score-row-value">
        {summary ? summary.average.toFixed(1) : '–'}
        {summary && !hideCount && <span className="reviewer-count"> ({summary.reviewerCount})</span>}
      </span>
    </div>
  )
}
