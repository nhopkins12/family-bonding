import { useAppData } from '../state/AppDataContext'
import { MovieCard } from './MovieCard'

interface MemberRankingPageProps {
  ownerId: string
  onBack: () => void
  onOpenMovie: (movieId: string) => void
}

/** Read-only page for one member's full ranked list — reached from the Members tab or a
 * reviewer's name in a movie's global detail. Clicking a movie here shows that member's
 * review of it (a modal, not another page — see App.tsx). */
export function MemberRankingPage({ ownerId, onBack, onOpenMovie }: MemberRankingPageProps) {
  const { movies, allRankings, profilesByOwner } = useAppData()
  const name = profilesByOwner.get(ownerId)?.displayName ?? 'Someone'
  const rankingRecord = allRankings.find((r) => r.owner === ownerId)
  const rankedIds = (rankingRecord?.orderedMovieIds ?? []).filter((id): id is string => Boolean(id))
  const moviesById = new Map(movies.map((m) => [m.id, m]))
  const rankedMovies = rankedIds.map((id) => moviesById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))

  return (
    <>
      <button type="button" className="page-back-link" onClick={onBack}>
        ← Members
      </button>
      <main className="app-main">
        <h2 className="page-title">{name}'s Ranking</h2>
        {rankedMovies.length === 0 ? (
          <p className="empty-state">{name} hasn't ranked any movies yet.</p>
        ) : (
          <div className="ranked-list">
            {rankedMovies.map((movie, index) => (
              <MovieCard key={movie.id} movie={movie} rank={index + 1} onClick={() => onOpenMovie(movie.id)} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
