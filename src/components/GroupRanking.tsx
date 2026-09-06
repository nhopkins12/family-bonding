import { useMemo, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import { computeCategoryRanking, computeGroupRanking, computePairwiseRanking } from '../lib/ranking'
import { getStoredView, storeView, type RankingView } from '../lib/viewPreference'
import { MovieCard } from './MovieCard'
import { PosterImage } from './PosterImage'
import { SortControl } from './SortControl'
import { SORT_LABELS, SUBRATING_KEYS, SUBRATING_LABELS, type SubratingKey } from '../types'
import type { MovieRecord } from '../lib/dataClient'

interface GroupRankingProps {
  onOpenMovie: (movieId: string) => void
}

// Distinct from the personal ranking board's SortKey: the group view offers two
// different consensus methods (not one "overall" manual order), so it gets its own
// key/options rather than overloading the shared type.
type GroupSortKey = 'pairwise' | 'averageRank' | SubratingKey

const GROUP_SORT_OPTIONS: readonly { key: GroupSortKey; label: string }[] = [
  { key: 'pairwise', label: 'Pairwise' },
  { key: 'averageRank', label: 'Average Rank' },
  ...SUBRATING_KEYS.map((key) => ({ key, label: SORT_LABELS[key] })),
]

interface RankedEntry {
  movie: MovieRecord
  value: number
  reviewerCount: number
  kind: 'pairwise' | 'averageRank' | 'category'
  detail?: string
}

function StatTrailing({ value, reviewerCount, kind, detail }: { value: number; reviewerCount: number; kind: RankedEntry['kind']; detail?: string }) {
  const valueLabel = kind === 'pairwise' ? `${Math.round(value * 100)}%` : value.toFixed(1)
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
  const [sortKey, setSortKey] = useState<GroupSortKey>('pairwise')
  const [view, setView] = useState<RankingView>(getStoredView)

  function changeView(next: RankingView) {
    setView(next)
    storeView(next)
  }

  // Only movies the group has actually watched together count toward the consensus
  // ranking — an unwatched movie ranked by one member in isolation isn't "the group's"
  // opinion of it yet. See the Upcoming tab for the vote/schedule/watch pipeline that
  // gets a movie into this set.
  const watchedMovies = useMemo(() => movies.filter((movie) => watchedMovieIds.has(movie.id)), [movies, watchedMovieIds])

  // Pairwise (head-to-head win rate) corrects for members ranking different numbers of
  // movies; Average Rank is the simpler, more familiar "average your position" math —
  // both stay available since they're each a legitimate way to read the same data.
  const pairwiseEntries = useMemo(() => computePairwiseRanking(watchedMovies, allRankings), [watchedMovies, allRankings])
  const averageRankEntries = useMemo(() => computeGroupRanking(watchedMovies, allRankings), [watchedMovies, allRankings])
  const categoryEntries = useMemo(
    () => (sortKey === 'pairwise' || sortKey === 'averageRank' ? [] : computeCategoryRanking(watchedMovies, allReviews, sortKey)),
    [watchedMovies, allReviews, sortKey],
  )

  const entries: RankedEntry[] = useMemo(() => {
    if (sortKey === 'pairwise') {
      return pairwiseEntries.map((e) => ({
        movie: e.movie,
        value: e.winRate,
        reviewerCount: e.reviewerCount,
        kind: 'pairwise',
        detail: `${e.wins}-${e.losses}`,
      }))
    }
    if (sortKey === 'averageRank') {
      return averageRankEntries.map((e) => ({ movie: e.movie, value: e.averageRank, reviewerCount: e.reviewerCount, kind: 'averageRank' }))
    }
    return categoryEntries.map((e) => ({ movie: e.movie, value: e.average, reviewerCount: e.reviewerCount, kind: 'category' }))
  }, [sortKey, pairwiseEntries, averageRankEntries, categoryEntries])

  if (moviesLoading) {
    return <p className="empty-state">Loading movies…</p>
  }

  const heading = sortKey === 'pairwise' ? 'Ranking' : sortKey === 'averageRank' ? 'Average Rank' : `By ${SUBRATING_LABELS[sortKey]}`
  const emptyLabel =
    watchedMovies.length === 0
      ? 'No movies have been marked watched yet.'
      : sortKey === 'pairwise' || sortKey === 'averageRank'
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
