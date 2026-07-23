import { useMemo } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeGroupRanking, findRank, type RankPosition } from '../lib/ranking'
import { INVERTED_SUBRATINGS, SUBRATING_KEYS, SUBRATING_LABELS, type SubratingKey } from '../types'
import { PosterImage } from './PosterImage'

interface MovieDetailModalProps {
  movieId: string
  onClose: () => void
  onOpenProfile: (ownerId: string) => void
}

/** Read-only global view of a movie: its rank in every category's family-wide
 * consensus ranking, and everyone's written review. */
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
          <h3>Family Ranking</h3>
          <GlobalRanks movieId={movieId} />
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

export interface CategoryRank extends RankPosition {
  reviewerCount: number
}

function GlobalRanks({ movieId }: { movieId: string }) {
  const { movies, allRankings } = useAppData()

  const ranksByCategory = useMemo(() => {
    const result = {} as Record<SubratingKey, CategoryRank | null>
    for (const key of SUBRATING_KEYS) {
      const categoryRankings = allRankings.filter((r) => r.category === key)
      const entries = computeGroupRanking(movies, categoryRankings)
      const rank = findRank(
        movieId,
        entries.map((e) => e.movie.id),
      )
      result[key] = rank ? { ...rank, reviewerCount: entries[rank.position - 1].reviewerCount } : null
    }
    return result
  }, [movies, allRankings, movieId])

  return (
    <div className="score-rows">
      {SUBRATING_KEYS.map((key) => (
        <ScoreRow key={key} subratingKey={key} rank={ranksByCategory[key]} />
      ))}
    </div>
  )
}

export function ScoreRow({
  subratingKey,
  rank,
  hideCount = false,
}: {
  subratingKey: SubratingKey
  rank: CategoryRank | RankPosition | null
  hideCount?: boolean
}) {
  const isInverted = INVERTED_SUBRATINGS.has(subratingKey)
  const percent = rank ? Math.max(0, Math.min(100, ((rank.total - rank.position + 1) / rank.total) * 100)) : 0
  const reviewerCount = rank && 'reviewerCount' in rank ? rank.reviewerCount : undefined

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
        {rank ? `#${rank.position} of ${rank.total}` : '–'}
        {rank && !hideCount && reviewerCount !== undefined && <span className="reviewer-count"> ({reviewerCount})</span>}
      </span>
    </div>
  )
}
