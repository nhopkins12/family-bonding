import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type AutoScrollOptions,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppData } from '../state/AppDataContext'
import { computeCategoryRanking } from '../lib/ranking'
import { DraggableMovieRow } from './DraggableMovieRow'
import { MovieCard } from './MovieCard'
import { SortControl } from './SortControl'
import { SORT_OPTIONS, SUBRATING_LABELS, type SortKey } from '../types'

interface RankingBoardProps {
  onOpenMovie: (movieId: string) => void
}

type Zone = 'ranked' | 'unranked'

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

// Matches the settle-speed tweak on DraggableMovieRow's own useSortable transition —
// keeping the pickup and drop feeling like one continuous motion instead of two
// differently-timed animations bolted together.
const dropAnimationConfig: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.4' } },
  }),
}

// dnd-kit's default autoscroll checks the *dragged item's computed rectangle*
// against the scroll container's edge, not the actual pointer/finger position. On
// touch, the DragOverlay's rendered box can sit slightly offset from where your
// finger really is, so "am I near the edge" and "is my finger near the edge" don't
// always agree — most noticeable exactly where it matters most here: dragging a
// long way (e.g. up from deep in Unranked into Ranked) rather than a short reorder.
// Pointer-based activation checks the real touch point directly instead. threshold
// is also widened (default ~0.2) and acceleration raised (default ~10) so it kicks
// in earlier and moves faster — less precision required to trigger it, less time
// spent holding still at the edge waiting for something to happen.
const autoScrollConfig: AutoScrollOptions = {
  activator: AutoScrollActivator.Pointer,
  threshold: { x: 0, y: 0.3 },
  acceleration: 20,
}

export function RankingBoard({ onOpenMovie }: RankingBoardProps) {
  const { movies, moviesLoading, rankedIds, setMyRanking, watchedMovieIds } = useAppData()
  const [sortKey, setSortKey] = useState<SortKey>('overall')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const moviesById = useMemo(() => new Map(movies.map((m) => [m.id, m])), [movies])
  const unrankedIds = useMemo(() => {
    const rankedSet = new Set(rankedIds)
    return movies
      .filter((m) => !rankedSet.has(m.id))
      .sort((a, b) => {
        const watchedDelta = Number(watchedMovieIds.has(b.id)) - Number(watchedMovieIds.has(a.id))
        if (watchedDelta !== 0) return watchedDelta
        return a.sortOrder - b.sortOrder
      })
      .map((m) => m.id)
  }, [movies, rankedIds, watchedMovieIds])

  const [localRanked, setLocalRanked] = useState<string[]>(rankedIds)
  const [localUnranked, setLocalUnranked] = useState<string[]>(unrankedIds)

  // Tracks the last ranking we sent to the backend, so the resync effect below never
  // clobbers a just-made local change with stale data still in flight from the server.
  const pendingSendRef = useRef<string[] | null>(null)

  function persist(nextRanked: string[]) {
    pendingSendRef.current = nextRanked
    setMyRanking(nextRanked)
  }

  useEffect(() => {
    if (activeId !== null) return
    if (pendingSendRef.current && !sameOrder(pendingSendRef.current, rankedIds)) return
    pendingSendRef.current = null
    setLocalRanked(rankedIds)
    setLocalUnranked(unrankedIds)
  }, [rankedIds, unrankedIds, activeId])

  // Mouse and touch need different activation rules for the same whole-row drag
  // handle. Mouse: start as soon as the pointer moves 5px (instant, like before —
  // nothing on desktop reaches for a scrollbar by accident). Touch: require a short
  // hold before the drag activates ("delay"), and cancel it if the finger travels
  // more than "tolerance" px first — that part is unchanged from dnd-kit's own
  // documented answer to telling a deliberate drag apart from a scroll swipe.
  //
  // What's different from the first attempt at this: the rows themselves are
  // touch-action:none again (see .movie-card-draggable in index.css), not "auto".
  // On real iOS Safari, leaving touch-action as auto let the browser's compositor
  // start optimistically treating the hold as a native pan before the delay timer
  // ever fired dnd-kit's activation — once that happens, iOS stops reliably handing
  // the gesture back to JS, so the drag would technically activate (you'd see the
  // lifted-row highlight) but the floating card never visually tracked the finger
  // afterward. touch-action:none prevents the browser from ever contesting the
  // gesture, which is what made dragging itself reliable in every version tried
  // this far — the tradeoff is that it also blocks native scrolling for any touch
  // that starts on a row, which is what the manual scroll effect below exists to
  // replace.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isDraggingRef = useRef(false)
  const boardRef = useRef<HTMLDivElement | null>(null)

  // Hand-rolled scroll, standing in for the native touch-scroll that
  // touch-action:none disables on draggable rows above. While no drag has
  // activated yet, a touch that started on a card just scrolls the page by the
  // same amount the finger moved — a 1:1 replacement, no momentum/inertia, but
  // enough to make the list scrollable again. The instant a drag activates
  // (isDraggingRef flips true, set synchronously in handleDragStart so this
  // doesn't rely on a React re-render landing in time), this stops touching
  // scroll at all and dnd-kit's own pointer-based autoscroll takes over instead.
  useEffect(() => {
    const board = boardRef.current
    if (!board) return

    let lastY: number | null = null

    function onTouchStart(event: TouchEvent) {
      if (isDraggingRef.current) return
      const target = event.target as HTMLElement | null
      if (!target?.closest('.movie-card-draggable')) return
      lastY = event.touches[0]?.clientY ?? null
    }

    function onTouchMove(event: TouchEvent) {
      if (isDraggingRef.current || lastY === null) return
      const currentY = event.touches[0]?.clientY
      if (currentY === undefined) return
      window.scrollBy(0, lastY - currentY)
      lastY = currentY
    }

    function onTouchEnd() {
      lastY = null
    }

    board.addEventListener('touchstart', onTouchStart, { passive: true })
    board.addEventListener('touchmove', onTouchMove, { passive: true })
    board.addEventListener('touchend', onTouchEnd, { passive: true })
    board.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      board.removeEventListener('touchstart', onTouchStart)
      board.removeEventListener('touchmove', onTouchMove)
      board.removeEventListener('touchend', onTouchEnd)
      board.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

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
    isDraggingRef.current = true
    setActiveId(String(event.active.id))
  }

  function handleDragCancel() {
    isDraggingRef.current = false
    setActiveId(null)
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
    isDraggingRef.current = false
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
  const visibleUnrankedIds = visibleUnrankedMovies.map((m) => m.id)

  const activeMovie = activeId ? moviesById.get(activeId) : undefined
  const activeRank = activeId ? localRanked.indexOf(activeId) : -1

  return (
    <div className="ranking-board" ref={boardRef}>
      <div className="ranking-board-controls">
        <SortControl value={sortKey} onChange={setSortKey} options={SORT_OPTIONS} />
        {sortKey === 'overall' && movies.length > 0 && (
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

      {sortKey === 'overall' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          autoScroll={autoScrollConfig}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
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
                <div className="unranked-list">
                  {visibleUnrankedMovies.map((movie) => (
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
              </SortableContext>
            </DroppableZone>
          </section>

          <DragOverlay dropAnimation={dropAnimationConfig}>
            {activeMovie && (
              <MovieCard movie={activeMovie} rank={activeRank === -1 ? undefined : activeRank + 1} overlay />
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <CategoryPersonalRanking sortKey={sortKey} onOpenMovie={onOpenMovie} onRank={rankMovie} onUnrank={unrankMovie} />
      )}
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

function CategoryPersonalRanking({
  sortKey,
  onOpenMovie,
  onRank,
  onUnrank,
}: {
  sortKey: Exclude<SortKey, 'overall'>
  onOpenMovie: (id: string) => void
  onRank: (id: string) => void
  onUnrank: (id: string) => void
}) {
  const { movies, myReviewsByMovieId, rankedIds } = useAppData()
  const myReviews = useMemo(() => [...myReviewsByMovieId.values()], [myReviewsByMovieId])
  const entries = useMemo(() => computeCategoryRanking(movies, myReviews, sortKey), [movies, myReviews, sortKey])
  const rankedSet = new Set(rankedIds)

  if (entries.length === 0) {
    return <p className="empty-state">You haven't rated {SUBRATING_LABELS[sortKey]} on any movie yet.</p>
  }

  return (
    <section className="ranking-section">
      <h2>By {SUBRATING_LABELS[sortKey]}</h2>
      <div className="ranked-list">
        {entries.map((entry, index) => {
          const isRanked = rankedSet.has(entry.movie.id)
          return (
            <MovieCard
              key={entry.movie.id}
              movie={entry.movie}
              rank={index + 1}
              subtitle={`${entry.average.toFixed(1)}/10${isRanked ? ` · ranked #${rankedIds.indexOf(entry.movie.id) + 1}` : ' · not ranked'}`}
              onClick={() => onOpenMovie(entry.movie.id)}
              trailing={
                isRanked ? (
                  <button type="button" className="unrank-button" onClick={() => onUnrank(entry.movie.id)}>
                    Unrank
                  </button>
                ) : (
                  <button type="button" className="rank-it-button" onClick={() => onRank(entry.movie.id)}>
                    Rank it
                  </button>
                )
              }
            />
          )
        })}
      </div>
    </section>
  )
}
