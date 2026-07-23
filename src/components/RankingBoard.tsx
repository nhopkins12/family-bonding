import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppData } from '../state/AppDataContext'
import { DraggableMovieRow } from './DraggableMovieRow'
import { SortControl } from './SortControl'
import type { SortKey } from '../types'

interface RankingBoardProps {
  onOpenMovie: (movieId: string) => void
}

type Zone = 'ranked' | 'unranked'

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export function RankingBoard({ onOpenMovie }: RankingBoardProps) {
  const { movies, moviesLoading, myRankingsByCategory, setMyRanking } = useAppData()
  const [category, setCategory] = useState<SortKey>('overall')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const rankedIds = useMemo(() => myRankingsByCategory.get(category) ?? [], [myRankingsByCategory, category])

  // A movie counts as "watched" (for this category's unranked list) if it's been
  // ranked in ANY other category — lets you prioritize movies you already have an
  // opinion on instead of re-scanning the full catalog every time you switch category.
  const rankedAnywhereIds = useMemo(() => {
    const set = new Set<string>()
    for (const ids of myRankingsByCategory.values()) {
      for (const id of ids) set.add(id)
    }
    return set
  }, [myRankingsByCategory])

  const moviesById = useMemo(() => new Map(movies.map((m) => [m.id, m])), [movies])
  const unrankedIds = useMemo(() => {
    const rankedSet = new Set(rankedIds)
    return movies.filter((m) => !rankedSet.has(m.id)).map((m) => m.id)
  }, [movies, rankedIds])

  const [localRanked, setLocalRanked] = useState<string[]>(rankedIds)
  const [localUnranked, setLocalUnranked] = useState<string[]>(unrankedIds)

  // Tracks the last ranking we sent to the backend, so the resync effect below never
  // clobbers a just-made local change with stale data still in flight from the server.
  const pendingSendRef = useRef<string[] | null>(null)

  function persist(nextRanked: string[]) {
    pendingSendRef.current = nextRanked
    setMyRanking(category, nextRanked)
  }

  // Switching category is a full local-state reset, same as a resync — whatever's
  // mid-drag in the old category shouldn't carry over.
  useEffect(() => {
    pendingSendRef.current = null
    setLocalRanked(rankedIds)
    setLocalUnranked(unrankedIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  useEffect(() => {
    if (activeId !== null) return
    if (pendingSendRef.current && !sameOrder(pendingSendRef.current, rankedIds)) return
    pendingSendRef.current = null
    setLocalRanked(rankedIds)
    setLocalUnranked(unrankedIds)
  }, [rankedIds, unrankedIds, activeId])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (moviesLoading) {
    return <p className="empty-state">Loading movies…</p>
  }

  function containerOf(id: string): Zone | null {
    if (localRanked.includes(id)) return 'ranked'
    if (localUnranked.includes(id)) return 'unranked'
    return null
  }

  function zoneFromDroppableId(id: string): Zone | null {
    if (id === 'zone-ranked') return 'ranked'
    if (id === 'zone-unranked') return 'unranked'
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const draggedId = String(active.id)
    const overId = String(over.id)

    const fromZone = containerOf(draggedId)
    const toZone = containerOf(overId) ?? zoneFromDroppableId(overId)
    if (!fromZone || !toZone || fromZone === toZone) return

    if (fromZone === 'ranked' && toZone === 'unranked') {
      setLocalRanked((prev) => prev.filter((id) => id !== draggedId))
      setLocalUnranked((prev) => (prev.includes(draggedId) ? prev : [...prev, draggedId]))
    } else if (fromZone === 'unranked' && toZone === 'ranked') {
      setLocalUnranked((prev) => prev.filter((id) => id !== draggedId))
      setLocalRanked((prev) => {
        if (prev.includes(draggedId)) return prev
        const overIndex = prev.indexOf(overId)
        const insertAt = overIndex === -1 ? prev.length : overIndex
        const next = [...prev]
        next.splice(insertAt, 0, draggedId)
        return next
      })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (over) {
      const activeMovieId = String(active.id)
      const overId = String(over.id)
      const fromZone = containerOf(activeMovieId)
      const toZone = containerOf(overId) ?? zoneFromDroppableId(overId)

      if (fromZone === 'ranked' && toZone === 'ranked' && activeMovieId !== overId) {
        const oldIndex = localRanked.indexOf(activeMovieId)
        const newIndex = localRanked.indexOf(overId)
        if (oldIndex !== -1 && newIndex !== -1) {
          const reordered = arrayMove(localRanked, oldIndex, newIndex)
          setLocalRanked(reordered)
          persist(reordered)
          return
        }
      }
    }

    // Cross-container moves were already applied to localRanked live during drag —
    // whatever it holds now (dropped in place or not) is the array to persist.
    persist(localRanked)
  }

  function moveRankedItem(movieId: string, direction: 'up' | 'down') {
    const index = localRanked.indexOf(movieId)
    if (index === -1) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= localRanked.length) return
    const next = [...localRanked]
    ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
    setLocalRanked(next)
    persist(next)
  }

  function rankMovie(movieId: string) {
    if (localRanked.includes(movieId)) return
    const nextRanked = [...localRanked, movieId]
    setLocalRanked(nextRanked)
    setLocalUnranked((prev) => prev.filter((id) => id !== movieId))
    persist(nextRanked)
  }

  function unrankMovie(movieId: string) {
    const nextRanked = localRanked.filter((id) => id !== movieId)
    setLocalRanked(nextRanked)
    setLocalUnranked((prev) => (prev.includes(movieId) ? prev : [...prev, movieId]))
    persist(nextRanked)
  }

  const rankedMovies = localRanked.map((id) => moviesById.get(id)).filter((m): m is NonNullable<typeof m> => Boolean(m))
  const unrankedMovies = localUnranked
    .map((id) => moviesById.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))

  const searchQuery = search.trim().toLowerCase()
  const matches = (movie: { title: string }) => !searchQuery || movie.title.toLowerCase().includes(searchQuery)

  // Ranked entries keep their true rank number even when the search hides most of the
  // list — "#7" should still mean "7th in your full ranking," not "7th of the matches."
  const visibleRankedEntries = rankedMovies.map((movie, index) => ({ movie, rank: index + 1 })).filter(({ movie }) => matches(movie))
  const visibleRankedIds = visibleRankedEntries.map(({ movie }) => movie.id)

  const visibleUnrankedMovies = unrankedMovies.filter(matches)
  // "Watched" = ranked in some other category already, just not this one — surfaced
  // first so you're not hunting through the full catalog for movies you already know.
  const watchedMovies = visibleUnrankedMovies.filter((m) => rankedAnywhereIds.has(m.id))
  const trulyUnrankedMovies = visibleUnrankedMovies.filter((m) => !rankedAnywhereIds.has(m.id))
  const visibleUnrankedIds = visibleUnrankedMovies.map((m) => m.id)

  return (
    <div className="ranking-board">
      <div className="ranking-board-controls">
        <SortControl value={category} onChange={setCategory} />
        {movies.length > 0 && (
          <input
            type="search"
            className="movie-search"
            placeholder="Search movies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search movies"
          />
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <section className="ranking-section">
          <h2>Ranked</h2>
          <DroppableZone
            id="zone-ranked"
            empty={visibleRankedEntries.length === 0}
            emptyLabel={rankedMovies.length === 0 ? 'Drag movies here to rank them.' : `No ranked movies match "${search.trim()}".`}
          >
            <SortableContext items={visibleRankedIds} strategy={verticalListSortingStrategy}>
              <div className="ranked-list">
                {visibleRankedEntries.map(({ movie, rank }) => (
                  <DraggableMovieRow
                    key={movie.id}
                    movie={movie}
                    rank={rank}
                    onOpen={() => onOpenMovie(movie.id)}
                    trailing={
                      <span className="row-controls">
                        <button type="button" aria-label="Move up" disabled={rank === 1} onClick={() => moveRankedItem(movie.id, 'up')}>
                          ↑
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={rank === rankedMovies.length}
                          onClick={() => moveRankedItem(movie.id, 'down')}
                        >
                          ↓
                        </button>
                        <button type="button" aria-label="Remove from ranking" className="unrank-button" onClick={() => unrankMovie(movie.id)}>
                          Unrank
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DroppableZone>
        </section>

        <section className="ranking-section">
          <h2>Unranked</h2>
          <DroppableZone
            id="zone-unranked"
            empty={visibleUnrankedMovies.length === 0}
            emptyLabel={unrankedMovies.length === 0 ? 'Every movie has been ranked.' : `No unranked movies match "${search.trim()}".`}
          >
            <SortableContext items={visibleUnrankedIds} strategy={verticalListSortingStrategy}>
              {watchedMovies.length > 0 && (
                <div className="ranking-subsection">
                  <h3 className="ranking-subsection-label">Watched</h3>
                  <div className="unranked-list">
                    {watchedMovies.map((movie) => (
                      <DraggableMovieRow
                        key={movie.id}
                        movie={movie}
                        onOpen={() => onOpenMovie(movie.id)}
                        trailing={
                          <button type="button" className="rank-it-button" onClick={() => rankMovie(movie.id)}>
                            Rank it
                          </button>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              {trulyUnrankedMovies.length > 0 && (
                <div className="ranking-subsection">
                  {watchedMovies.length > 0 && <h3 className="ranking-subsection-label">Unranked</h3>}
                  <div className="unranked-list">
                    {trulyUnrankedMovies.map((movie) => (
                      <DraggableMovieRow
                        key={movie.id}
                        movie={movie}
                        onOpen={() => onOpenMovie(movie.id)}
                        trailing={
                          <button type="button" className="rank-it-button" onClick={() => rankMovie(movie.id)}>
                            Rank it
                          </button>
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </SortableContext>
          </DroppableZone>
        </section>
      </DndContext>
    </div>
  )
}

function DroppableZone({
  id,
  empty,
  emptyLabel,
  children,
}: {
  id: string
  empty: boolean
  emptyLabel: string
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`droppable-zone${isOver ? ' is-over' : ''}`}>
      {empty ? <p className="empty-state">{emptyLabel}</p> : children}
    </div>
  )
}
