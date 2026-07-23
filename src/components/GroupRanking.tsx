import { useMemo, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeCategoryRanking, computeGroupRanking } from '../lib/ranking'
import { getStoredView, storeView, type RankingView } from '../lib/viewPreference'
import { MovieCard } from './MovieCard'
import { PosterImage } from './PosterImage'
import { SortControl } from './SortControl'
import { SUBRATING_LABELS, type SortKey } from '../types'
import type { MovieRecord } from '../lib/dataClient'

interface GroupRankingProps {
  onOpenMovie: (movieId: string) => void
}

interface RankedEntry {
  movie: MovieRecord
  value: number
  reviewerCount: number
}

function StatTrailing({ value, reviewerCount }: { value: number; reviewerCount: number }) {
  return (
    <span className="movie-card-stat">
      <span className="movie-card-stat-value">{value.toFixed(1)}</span>
      <span className="movie-card-stat-label">{reviewerCount === 1 ? '1 person' : `${reviewerCount} people`}</span>
    </span>
  )
}

export function GroupRanking({ onOpenMovie }: GroupRankingProps) {
  const { movies, moviesLoading, allRankings, allReviews } = useAppData()
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [view, setView] = useState<RankingView>(getStoredView)

  function changeView(next: RankingView) {
    setView(next)
    storeView(next)
  }

  const overallEntries = useMemo(() => computeGroupRanking(movies, allRankings), [movies, allRankings])
  const categoryEntries = useMemo(
    () => (sortKey === 'overall' ? [] : computeCategoryRanking(movies, allReviews, sortKey)),
    [movies, allReviews, sortKey],
  )

  const entries: RankedEntry[] = useMemo(() => {
    if (sortKey === 'overall') {
      return overallEntries.map((e) => ({ movie: e.movie, value: e.averageRank, reviewerCount: e.reviewerCount }))
    }
    return categoryEntries.map((e) => ({ movie: e.movie, value: e.average, reviewerCount: e.reviewerCount }))
  }, [sortKey, overallEntries, categoryEntries])

  if (moviesLoading) {
    return <p className="empty-state">Loading movies…</p>
  }

  const heading = sortKey === 'overall' ? 'Ranking' : `By ${SUBRATING_LABELS[sortKey]}`
  const emptyLabel =
    sortKey === 'overall' ? 'No movies have been ranked yet.' : `Nobody has rated ${SUBRATING_LABELS[sortKey]} yet.`

  return (
    <div className="ranking-board">
      <div className="ranking-board-controls">
        <SortControl value={sortKey} onChange={setSortKey} />
        <div className="view-toggle">
          <button type="button" className={view === 'grid' ? 'active' : ''} onClick={() => changeView('grid')}>
            Grid
          </button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => changeView('list')}>
            List
          </button>
        </div>
      </div>

      <section className="ranking-section">
        <h2>{heading}</h2>
        {entries.length === 0 ? (
          <p className="empty-state">{emptyLabel}</p>
        ) : view === 'grid' ? (
          <div className="poster-grid">
            {entries.map((entry, index) => (
              <button key={entry.movie.id} type="button" className="poster-grid-item" onClick={() => onOpenMovie(entry.movie.id)}>
                <span className="poster-grid-rank">{index + 1}</span>
                <PosterImage movie={entry.movie} size="lg" />
              </button>
            ))}
          </div>
        ) : (
          <div className="ranked-list">
            {entries.map((entry, index) => (
              <MovieCard
                key={entry.movie.id}
                movie={entry.movie}
                rank={index + 1}
                onClick={() => onOpenMovie(entry.movie.id)}
                trailing={<StatTrailing value={entry.value} reviewerCount={entry.reviewerCount} />}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
