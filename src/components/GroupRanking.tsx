import { useMemo, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeCategoryRanking, computePairwiseRanking } from '../lib/ranking'
import { getStoredView, storeView, type RankingView } from '../lib/viewPreference'
import { MovieCard } from './MovieCard'
import { PosterImage } from './PosterImage'
import { SortControl } from './SortControl'
import { SORT_LABELS, SUBRATING_KEYS, SUBRATING_LABELS, type SortKey } from '../types'
import type { MovieRecord } from '../lib/dataClient'

interface GroupRankingProps {
  onOpenMovie: (movieId: string) => void
}

// Same SortKey/SortControl as the personal ranking board, but "overall" means something
// different here (pairwise head-to-head consensus, not a manual drag order) — worth its
// own label so the sort menu actually says what it's doing.
const GROUP_SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: 'overall', label: 'Pairwise' },
  ...SUBRATING_KEYS.map((key) => ({ key, label: SORT_LABELS[key] })),
]

interface RankedEntry {
  movie: MovieRecord
  value: number
  reviewerCount: number
  kind: 'overall' | 'category'
  detail?: string
}

function StatTrailing({ value, reviewerCount, kind, detail }: { value: number; reviewerCount: number; kind: RankedEntry['kind']; detail?: string }) {
  const valueLabel = kind === 'overall' ? `${Math.round(value * 100)}%` : value.toFixed(1)
  return (
    <span className="movie-card-stat">
      <span className="movie-card-stat-value">{valueLabel}</span>
      <span className="movie-card-stat-label">{reviewerCount === 1 ? '1 person' : `${reviewerCount} people`}</span>
      {detail && <span className="movie-card-stat-label">{detail}</span>}
    </span>
  )
}

export function GroupRanking({ onOpenMovie }: GroupRankingProps) {
  const { movies, moviesLoading, allRankings, allReviews, watchedMovieIds } = useAppData()
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [view, setView] = useState<RankingView>(getStoredView)

  function changeView(next: RankingView) {
    setView(next)
    storeView(next)
  }

  // Only movies the group has actually watched together count toward the consensus
  // ranking — an unwatched movie ranked by one member in isolation isn't "the group's"
  // opinion of it yet. See the Sunday tab for the vote/schedule/watch pipeline that
  // gets a movie into this set.
  const watchedMovies = useMemo(() => movies.filter((movie) => watchedMovieIds.has(movie.id)), [movies, watchedMovieIds])

  // Pairwise (head-to-head win rate) rather than averaging raw rank positions:
  // members rank different numbers of movies, and averaging positions would let
  // someone's #2-of-4 outweigh someone else's #2-of-20. Head-to-head comparisons
  // stay meaningful regardless of list length.
  const overallEntries = useMemo(() => computePairwiseRanking(watchedMovies, allRankings), [watchedMovies, allRankings])
  const categoryEntries = useMemo(
    () => (sortKey === 'overall' ? [] : computeCategoryRanking(watchedMovies, allReviews, sortKey)),
    [watchedMovies, allReviews, sortKey],
  )

  const entries: RankedEntry[] = useMemo(() => {
    if (sortKey === 'overall') {
      return overallEntries.map((e) => ({
        movie: e.movie,
        value: e.winRate,
        reviewerCount: e.reviewerCount,
        kind: 'overall',
        detail: `${e.wins}-${e.losses}`,
      }))
    }
    return categoryEntries.map((e) => ({ movie: e.movie, value: e.average, reviewerCount: e.reviewerCount, kind: 'category' }))
  }, [sortKey, overallEntries, categoryEntries])

  if (moviesLoading) {
    return <p className="empty-state">Loading movies…</p>
  }

  const heading = sortKey === 'overall' ? 'Ranking' : `By ${SUBRATING_LABELS[sortKey]}`
  const emptyLabel =
    watchedMovies.length === 0
      ? 'No movies have been marked watched yet.'
      : sortKey === 'overall'
        ? 'No watched movies have been ranked yet.'
        : `Nobody has rated ${SUBRATING_LABELS[sortKey]} yet.`

  return (
    <div className="ranking-board">
      <div className="ranking-board-controls">
        <SortControl value={sortKey} onChange={setSortKey} options={GROUP_SORT_OPTIONS} />
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
                trailing={<StatTrailing value={entry.value} reviewerCount={entry.reviewerCount} kind={entry.kind} detail={entry.detail} />}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
