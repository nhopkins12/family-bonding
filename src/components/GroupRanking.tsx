import { useMemo, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeGroupRanking } from '../lib/ranking'
import { getStoredView, storeView, type RankingView } from '../lib/viewPreference'
import { MovieCard } from './MovieCard'
import { PosterImage } from './PosterImage'
import { SortControl } from './SortControl'
import { SUBRATING_LABELS, type SortKey } from '../types'

interface GroupRankingProps {
  onOpenMovie: (movieId: string) => void
}

function StatTrailing({ rank, reviewerCount }: { rank: number; reviewerCount: number }) {
  return (
    <span className="movie-card-stat">
      <span className="movie-card-stat-value">{rank.toFixed(1)}</span>
      <span className="movie-card-stat-label">{reviewerCount === 1 ? '1 person' : `${reviewerCount} people`}</span>
    </span>
  )
}

export function GroupRanking({ onOpenMovie }: GroupRankingProps) {
  const { movies, moviesLoading, allRankings } = useAppData()
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [view, setView] = useState<RankingView>(getStoredView)

  function changeView(next: RankingView) {
    setView(next)
    storeView(next)
  }

  // A category ranking is just a Ranking record scoped to that category instead of
  // 'overall' — same aggregation math either way, just pre-filtered by category.
  const rankingsForSortKey = useMemo(() => allRankings.filter((r) => r.category === sortKey), [allRankings, sortKey])
  const entries = useMemo(() => computeGroupRanking(movies, rankingsForSortKey), [movies, rankingsForSortKey])

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
                trailing={<StatTrailing rank={entry.averageRank} reviewerCount={entry.reviewerCount} />}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
