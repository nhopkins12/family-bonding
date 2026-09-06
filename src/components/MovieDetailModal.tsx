import { useMemo } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeMovieCategoryAverages } from '../lib/ranking'
import { SUBRATING_KEYS, SUBRATING_LABELS, type SubratingKey } from '../types'
import { ModalBackdrop } from './ModalBackdrop'
import { PosterImage } from './PosterImage'

interface MovieDetailModalProps {
  movieId: string
  onClose: () => void
  onOpenProfile: (ownerId: string) => void
}

/**
 * The actual movie breakdown — poster, meta, average ratings, everyone's written
 * review. Split out from MovieDetailModal so it can also render inline (the Upcoming
 * page's day-details panel) without dragging a modal backdrop along with it.
 */
export function MovieDetailContent({ movieId, onOpenProfile }: { movieId: string; onOpenProfile: (ownerId: string) => void }) {
  const { movies, allReviews, profilesByOwner, allMovieWatches } = useAppData()
  const movie = movies.find((m) => m.id === movieId)
  const watch = allMovieWatches.find((record) => record.movieId === movieId)

  const reviewsForMovie = useMemo(
    () =>
      allReviews
        .filter((r) => r.movieId === movieId && r.text)
        .map((review) => ({ review, name: profilesByOwner.get(review.owner ?? '')?.displayName ?? 'Someone' })),
    [allReviews, movieId, profilesByOwner],
  )

  if (!movie) return null

  return (
    <>
      <div className="modal-header">
        <PosterImage movie={movie} size="lg" />
        <div>
          <h2>{movie.title}</h2>
          {watch?.watchedAt && <p className="modal-meta">Watched {formatDate(watch.watchedAt)}</p>}
          {!watch?.watchedAt && watch?.scheduledFor && <p className="modal-meta">Scheduled {formatDate(watch.scheduledFor)}</p>}
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
    </>
  )
}

/** Read-only global view of a movie: average category ratings, and everyone's written review. */
export function MovieDetailModal({ movieId, onClose, onOpenProfile }: MovieDetailModalProps) {
  const { movies } = useAppData()
  const movie = movies.find((m) => m.id === movieId)
  if (!movie) return null

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>
        <MovieDetailContent movieId={movieId} onOpenProfile={onOpenProfile} />
      </div>
    </ModalBackdrop>
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
  const percent = summary ? Math.max(0, Math.min(100, (summary.average / 10) * 100)) : 0

  return (
    <div className="score-row">
      <span className="score-row-label">
        <span className="score-row-label-text">{SUBRATING_LABELS[subratingKey]}</span>
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

/**
 * Parses just the date portion as local calendar components (not a time-zoned instant)
 * — these are always plain "watched/scheduled on this day" facts with no real time of
 * day attached, so showing one is misleading, and parsing "2026-07-23" as a UTC instant
 * (the default for a bare date string) shifts it a day earlier in negative-UTC zones.
 */
function formatDate(value: string) {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })
}
