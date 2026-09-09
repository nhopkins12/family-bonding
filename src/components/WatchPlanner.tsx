import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useAppData } from '../state/AppDataContext'
import type { MovieRecord, MovieWatchRecord, WatchVoteRecord } from '../lib/dataClient'
import { latestByKeyMap } from '../lib/records'
import { todayKey } from '../lib/watchDates'
import { icsFeedUrl } from '../lib/amplifyConfig'
import { MovieCard } from './MovieCard'
import { PosterImage } from './PosterImage'
import { EventEditorModal, type EventForm } from './EventEditorModal'
import { SubscribeModal } from './SubscribeModal'
import { RandomPickModal } from './RandomPickModal'

interface WatchPlannerProps {
  onOpenMovie: (movieId: string) => void
}

type WatchStatus = 'scheduled' | 'watched'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// --- Date helpers -----------------------------------------------------------

function parseLocalDate(value: Date | string | null | undefined) {
  if (!value) return new Date(Number.NaN)
  if (value instanceof Date) return new Date(value)
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  return new Date(value)
}

function localDateKey(value: Date | string | null | undefined) {
  const date = parseLocalDate(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function sundayFromToday() {
  const date = parseLocalDate(todayKey())
  const daysUntilSunday = (7 - date.getDay()) % 7
  date.setDate(date.getDate() + daysUntilSunday)
  return date
}

function watchStart(watch: MovieWatchRecord | null | undefined) {
  return watch?.watchedAt ?? watch?.scheduledFor
}

function isWatched(watch: MovieWatchRecord | null | undefined) {
  return Boolean(watch?.watchedAt || watch?.status === 'watched')
}

function isOverdue(watch: MovieWatchRecord) {
  return !isWatched(watch) && Boolean(watch.scheduledFor) && localDateKey(watch.scheduledFor) < todayKey()
}

function statusForWatch(watch: MovieWatchRecord | null | undefined): WatchStatus {
  return isWatched(watch) ? 'watched' : 'scheduled'
}

function formatMonth(value: Date) {
  return value.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = parseLocalDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatDisplayDate(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = parseLocalDate(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}

/** Frames a date relative to today: "Today", "Tomorrow", "In 4 days", "3 days ago", or a plain date once it's more than a week out. */
function relativeDayLabel(dateKey: string) {
  if (!dateKey) return ''
  const today = todayKey()
  if (dateKey === today) return 'Today'
  const diffDays = Math.round((parseLocalDate(dateKey).getTime() - parseLocalDate(today).getTime()) / 86_400_000)
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays === -1) return 'Yesterday'
  if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`
  if (diffDays < -1 && diffDays >= -6) return `${-diffDays} days ago`
  return formatShortDate(dateKey)
}

function voteLabel(count: number) {
  return count === 1 ? '1 vote' : `${count} votes`
}

function latestVoteByOwner(votes: WatchVoteRecord[]) {
  return [...latestByKeyMap(votes.filter((vote) => vote.vote === 'interested'), (vote) => vote.owner).values()]
}

function nextOpenSunday(watches: MovieWatchRecord[]) {
  const occupied = new Set(watches.map((watch) => localDateKey(watchStart(watch))).filter(Boolean))
  const candidate = sundayFromToday()
  for (let i = 0; i < 52; i += 1) {
    if (!occupied.has(localDateKey(candidate))) return candidate
    candidate.setDate(candidate.getDate() + 7)
  }
  return candidate
}

/** Days back to the most recent Monday — weeks run Mon–Sun, so Sunday (getDay()===0) is 6 days after its own week's Monday. */
function daysSinceMonday(date: Date) {
  return (date.getDay() + 6) % 7
}

/**
 * Full current month, Monday-first, padded only enough to complete its first and
 * last week — not a fixed 6-row/42-cell grid. A 4-week month renders 4 rows, a
 * 6-week month renders 6; the padding days from neighboring months exist solely
 * to fill out those partial weeks (so every row still ends on a real Sunday).
 */
function buildMonthDays(month: Date, watchesByDate: Map<string, MovieWatchRecord[]>) {
  const first = startOfMonth(month)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)

  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - daysSinceMonday(first))

  const gridEnd = new Date(last)
  gridEnd.setDate(gridEnd.getDate() + (6 - daysSinceMonday(last)))

  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1

  const today = todayKey()

  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const key = localDateKey(date)
    const watches = watchesByDate.get(key) ?? []
    return {
      date,
      key,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: key === today,
      isPast: key < today,
      isSunday: date.getDay() === 0,
      watches,
    }
  })
}

// --- Presentational pieces ---------------------------------------------------

interface NextUpCardProps {
  overdueWatch: MovieWatchRecord | null
  upcomingWatch: MovieWatchRecord | null
  movieById: Map<string, MovieRecord>
  hasCandidates: boolean
  hasVotes: boolean
  topVoteMovie: MovieRecord | null
  topVoteCount: number
  voteTargetDate: Date
  onOpenMovie: (movieId: string) => void
  onSelectDate: (dateKey: string) => void
}

function NextUpCard({
  overdueWatch,
  upcomingWatch,
  movieById,
  hasCandidates,
  hasVotes,
  topVoteMovie,
  topVoteCount,
  voteTargetDate,
  onOpenMovie,
  onSelectDate,
}: NextUpCardProps) {
  const activeWatch = overdueWatch ?? upcomingWatch
  const movie = activeWatch?.movieId ? movieById.get(activeWatch.movieId) : null

  if (activeWatch && movie) {
    const dateKey = localDateKey(watchStart(activeWatch))
    return (
      <article className="sunday-next-card">
        <span className="sunday-card-label">{overdueWatch ? 'Overdue' : 'Up next'}</span>
        <button type="button" className="sunday-featured-movie" onClick={() => onSelectDate(dateKey)}>
          <PosterImage movie={movie} size="sm" />
          <span>
            <strong>{movie.title}</strong>
            <span>
              {overdueWatch ? 'Was set for ' : ''}
              {formatDisplayDate(dateKey)}, {relativeDayLabel(dateKey)}
            </span>
          </span>
        </button>
      </article>
    )
  }

  return (
    <article className="sunday-next-card">
      <span className="sunday-card-label">Up next</span>
      {hasVotes && topVoteMovie ? (
        <>
          <button type="button" className="sunday-featured-movie" onClick={() => onOpenMovie(topVoteMovie.id)}>
            <PosterImage movie={topVoteMovie} size="sm" />
            <span>
              <strong>{topVoteMovie.title}</strong>
              <span>Leading the vote, {voteLabel(topVoteCount)}</span>
            </span>
          </button>
          <p className="sunday-muted">Nothing&rsquo;s on the calendar for {formatShortDate(voteTargetDate)} yet.</p>
        </>
      ) : hasCandidates ? (
        <p className="sunday-muted">Nobody has voted yet. Vote below to get things started.</p>
      ) : (
        <p className="sunday-muted">Every movie has been scheduled or watched. Nothing left to plan.</p>
      )}
    </article>
  )
}

interface VoteListProps {
  candidates: MovieRecord[]
  voteCounts: Map<string, number>
  myVote: string | null
  isSignedIn: boolean
  pendingId: string | null
  error: string
  onVote: (movieId: string) => void
  onOpenMovie: (movieId: string) => void
}

function VoteList({ candidates, voteCounts, myVote, isSignedIn, pendingId, error, onVote, onOpenMovie }: VoteListProps) {
  return (
    <>
      {!isSignedIn ? (
        <p className="empty-state">Sign in to vote.</p>
      ) : candidates.length === 0 ? (
        <p className="empty-state">Every movie is already scheduled or watched. Nothing left to vote on.</p>
      ) : (
        <div className="ranked-list">
          {candidates.map((movie) => {
            const count = voteCounts.get(movie.id) ?? 0
            const selected = myVote === movie.id
            return (
              <MovieCard
                key={movie.id}
                movie={movie}
                subtitle={voteLabel(count)}
                onClick={() => onOpenMovie(movie.id)}
                trailing={
                  <button
                    type="button"
                    className={selected ? 'unrank-button' : 'rank-it-button'}
                    onClick={() => onVote(movie.id)}
                    disabled={pendingId === movie.id}
                  >
                    {selected ? 'Remove vote' : 'Vote'}
                  </button>
                }
              />
            )
          })}
        </div>
      )}
      {error && <p className="admin-form-error">{error}</p>}
    </>
  )
}

interface CalendarGridProps {
  monthCursor: Date
  monthDays: ReturnType<typeof buildMonthDays>
  movieById: Map<string, MovieRecord>
  selectedDateKey: string
  isAdmin: boolean
  dragError: string
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onDayClick: (dateKey: string) => void
  onDropMovie: (sourceDateKey: string, targetDateKey: string) => void
  onAddEvent: () => void
}

// Same activation rules as the personal ranking board's drag-and-drop (see
// RankingBoard for the full rationale): mouse starts on a small move, touch needs a
// brief hold first so an ordinary tap or scroll swipe is never mistaken for a drag.
// No keyboard sensor here — moving a night by keyboard/screen reader already works
// fully through the ordinary click-a-day-then-edit-the-form path; drag is purely an
// added mouse/touch convenience on top of that, not a replacement for it.
function useCalendarDragSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
}

function CalendarGrid({
  monthCursor,
  monthDays,
  movieById,
  selectedDateKey,
  isAdmin,
  dragError,
  onPrevMonth,
  onNextMonth,
  onToday,
  onDayClick,
  onDropMovie,
  onAddEvent,
}: CalendarGridProps) {
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const sensors = useCalendarDragSensors()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDateKey(null)
    if (!over) return
    const sourceDateKey = String(active.id)
    const targetDateKey = String(over.id)
    if (sourceDateKey !== targetDateKey) onDropMovie(sourceDateKey, targetDateKey)
  }

  const activeWatch = activeDateKey ? (monthDays.find((day) => day.key === activeDateKey)?.watches[0] ?? null) : null
  const activeMovie = activeWatch?.movieId ? movieById.get(activeWatch.movieId) : null

  return (
    <section className="sunday-calendar">
      <div className="section-header-row">
        <h2>{formatMonth(monthCursor)}</h2>
        <div className="sunday-calendar-nav">
          {isAdmin && (
            <button type="button" className="secondary-button" onClick={onAddEvent}>
              + Add event
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onPrevMonth}>
            Previous
          </button>
          <button type="button" className="secondary-button" onClick={onToday}>
            Today
          </button>
          <button type="button" className="secondary-button" onClick={onNextMonth}>
            Next
          </button>
        </div>
      </div>

      {isAdmin && <p className="sunday-muted">Drag a scheduled or watched night onto another day to move it there.</p>}
      {dragError && <p className="admin-form-error">{dragError}</p>}

      <div className="sunday-calendar-scroll">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveDateKey(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDateKey(null)}
        >
          <div className="month-calendar">
            {WEEKDAY_LABELS.map((day) => (
              <span className={`month-calendar-weekday${day === 'Sun' ? ' sunday' : ''}`} key={day}>
                {day}
              </span>
            ))}
            {monthDays.map((day) => (
              <CalendarDayCell
                key={day.key}
                day={day}
                movieById={movieById}
                isSelected={selectedDateKey === day.key}
                isAdmin={isAdmin}
                isDragging={activeDateKey === day.key}
                onClick={() => onDayClick(day.key)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeMovie && (
              <div className="month-calendar-event">
                <span className="month-calendar-event-title">{activeMovie.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  )
}

interface CalendarDayCellProps {
  day: ReturnType<typeof buildMonthDays>[number]
  movieById: Map<string, MovieRecord>
  isSelected: boolean
  isAdmin: boolean
  isDragging: boolean
  onClick: () => void
}

function CalendarDayCell({ day, movieById, isSelected, isAdmin, isDragging, onClick }: CalendarDayCellProps) {
  const watch = day.watches[0] ?? null
  const movie = watch?.movieId ? movieById.get(watch.movieId) : null
  const isVotingPlaceholder = watch?.status === 'voting'
  const isSkipped = watch?.status === 'skipped'
  const overdue = watch ? isOverdue(watch) : false
  const status = watch ? statusForWatch(watch) : 'open'
  const dayStatus = isVotingPlaceholder ? 'voting' : isSkipped ? 'skipped' : status
  const canDrag = isAdmin && Boolean(movie)

  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: day.key, disabled: !canDrag })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: day.key })

  return (
    <button
      ref={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      type="button"
      className={[
        'month-calendar-day',
        day.inMonth ? '' : 'outside-month',
        day.isSunday ? 'sunday' : '',
        day.isToday ? 'today' : '',
        isSelected ? 'selected' : '',
        isOver ? 'drag-over' : '',
        canDrag ? 'draggable' : '',
        dayStatus,
      ]
        .filter(Boolean)
        .join(' ')}
      style={isDragging ? { opacity: 0.35 } : undefined}
      onClick={onClick}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
    >
      <span className="month-calendar-date">{day.dayNumber}</span>
      {movie && (
        <span className="month-calendar-event">
          <span className="month-calendar-event-title">{movie.title}</span>
          <span className="month-calendar-event-meta">{overdue ? 'Overdue' : status === 'watched' ? 'Watched' : 'Scheduled'}</span>
        </span>
      )}
      {isVotingPlaceholder && (
        <span className="month-calendar-event">
          <span className="month-calendar-event-title">Vote night</span>
        </span>
      )}
      {isSkipped && (
        <span className="month-calendar-event">
          <span className="month-calendar-event-title">No movie</span>
        </span>
      )}
      {day.watches.length > 1 && <span className="month-calendar-count">+{day.watches.length - 1}</span>}
    </button>
  )
}

// --- Main component -----------------------------------------------------------

export function WatchPlanner({ onOpenMovie }: WatchPlannerProps) {
  const {
    movies,
    allMovieWatches,
    watchedMovieIds,
    allWatchVotes,
    myVotesByMovieId,
    setMyWatchVote,
    upsertMovieWatch,
    deleteMovieWatch,
    setVotingDate,
    clearVotingDate,
    ensureVotingPlaceholders,
    setSkippedDate,
    clearSkippedDate,
    isAdmin,
    isSignedIn,
    profilesByOwner,
  } = useAppData()

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(parseLocalDate(todayKey())))
  const [manualSelectedDateKey, setManualSelectedDateKey] = useState<string | null>(null)
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null)
  const [optimisticVoteMovieId, setOptimisticVoteMovieId] = useState<string | null>(null)
  const [votePendingId, setVotePendingId] = useState<string | null>(null)
  const [voteError, setVoteError] = useState('')
  const [dragError, setDragError] = useState('')
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [randomPickOpen, setRandomPickOpen] = useState(false)
  const [editorTarget, setEditorTarget] = useState<{ dateKey: string; watch: MovieWatchRecord | null } | null>(null)

  const movieById = useMemo(() => new Map(movies.map((movie) => [movie.id, movie])), [movies])
  // A "voting" placeholder (a date reserved for a vote, no movie chosen yet) has no
  // movieId — excluded here so it never masquerades as a real movie's watch record.
  const watchesByMovieId = useMemo(
    () =>
      new Map(
        allMovieWatches
          .filter((watch): watch is MovieWatchRecord & { movieId: string } => Boolean(watch.movieId))
          .map((watch) => [watch.movieId, watch]),
      ),
    [allMovieWatches],
  )
  const watchesByDate = useMemo(() => {
    const map = new Map<string, MovieWatchRecord[]>()
    for (const watch of allMovieWatches) {
      const key = localDateKey(watchStart(watch))
      if (!key) continue
      map.set(key, [...(map.get(key) ?? []), watch])
    }
    for (const watches of map.values()) {
      watches.sort((a, b) => String(watchStart(a) ?? '').localeCompare(String(watchStart(b) ?? '')))
    }
    return map
  }, [allMovieWatches])

  const sortedWatches = useMemo(
    () => [...allMovieWatches].sort((a, b) => String(watchStart(a) ?? '').localeCompare(String(watchStart(b) ?? ''))),
    [allMovieWatches],
  )
  // The voting placeholder (no movieId) is deliberately excluded from both — it isn't
  // a real movie night yet, so it belongs only in the vote-date control, not in the
  // "up next" priority list that assumes a movie is attached.
  const overdueWatches = useMemo(() => sortedWatches.filter((watch) => watch.movieId && isOverdue(watch)), [sortedWatches])
  const upcomingWatches = useMemo(
    () => sortedWatches.filter((watch) => watch.movieId && !isWatched(watch) && !isOverdue(watch) && watch.scheduledFor),
    [sortedWatches],
  )
  // Several Sundays can be open for voting at once now — "pending" here means the
  // soonest upcoming one, for the "up next" summary widgets below.
  const pendingVoteWatch = useMemo(() => {
    const today = todayKey()
    const upcoming = allMovieWatches
      .filter((watch) => watch.status === 'voting' && watch.scheduledFor && watch.scheduledFor >= today)
      .sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)))
    return upcoming[0] ?? null
  }, [allMovieWatches])

  const currentVotes = useMemo(() => latestVoteByOwner(allWatchVotes), [allWatchVotes])
  const myCurrentVote = useMemo(() => latestVoteByOwner([...myVotesByMovieId.values()])[0] ?? null, [myVotesByMovieId])

  // Optimistic vote state: seeded from the server's view of "my vote" whenever that
  // changes, but handleVote below overrides it immediately on click so the UI reacts
  // before the write round-trips.
  useEffect(() => {
    setOptimisticVoteMovieId(myCurrentVote?.movieId ?? null)
  }, [myCurrentVote?.movieId])

  const voteCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const vote of currentVotes) counts.set(vote.movieId, (counts.get(vote.movieId) ?? 0) + 1)
    return counts
  }, [currentVotes])

  const totalMembers = profilesByOwner.size

  const remainingMovies = useMemo(
    () =>
      movies
        .filter((movie) => {
          const watch = watchesByMovieId.get(movie.id)
          return !watchedMovieIds.has(movie.id) && watch?.status !== 'scheduled'
        })
        .sort((a, b) => {
          const voteDelta = (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0)
          if (voteDelta !== 0) return voteDelta
          return a.sortOrder - b.sortOrder
        }),
    [movies, voteCounts, watchesByMovieId, watchedMovieIds],
  )

  const topVoteMovie = remainingMovies[0] ?? null
  const topVoteCount = topVoteMovie ? (voteCounts.get(topVoteMovie.id) ?? 0) : 0
  const hasVotes = topVoteCount > 0
  // An admin can move the vote to any date (e.g. Wednesday because nobody's free
  // Sunday this week) — that reservation, if one exists, always wins over the
  // auto-picked next Sunday.
  const voteTargetDate = useMemo(
    () => (pendingVoteWatch?.scheduledFor ? parseLocalDate(pendingVoteWatch.scheduledFor) : nextOpenSunday(allMovieWatches)),
    [pendingVoteWatch, allMovieWatches],
  )
  const voteTargetDateKey = localDateKey(voteTargetDate)

  const monthDays = useMemo(() => buildMonthDays(monthCursor, watchesByDate), [monthCursor, watchesByDate])

  // Every future Sunday visible on the calendar should read as a real "open for
  // voting" event, not a blank cell — so as an admin browses the calendar, any such
  // Sunday still missing a MovieWatch row of any kind gets one backfilled automatically.
  // Self-limiting: once the placeholder exists, day.watches is no longer empty and this
  // stops asking for it again.
  const missingVoteSundayKeys = useMemo(
    () => monthDays.filter((day) => day.isSunday && !day.isPast && day.watches.length === 0).map((day) => day.key),
    [monthDays],
  )
  useEffect(() => {
    if (!isAdmin || missingVoteSundayKeys.length === 0) return
    void ensureVotingPlaceholders(missingVoteSundayKeys)
  }, [isAdmin, missingVoteSundayKeys, ensureVotingPlaceholders])

  // "Up next" — the same priority NextUpCard displays: an overdue night, else the
  // nearest upcoming one, else wherever the open vote is currently targeting.
  const upcomingDateKey = overdueWatches[0]
    ? localDateKey(watchStart(overdueWatches[0]))
    : upcomingWatches[0]
      ? localDateKey(watchStart(upcomingWatches[0]))
      : voteTargetDateKey

  // Defaults to "up next" and stays there until someone actually clicks a day —
  // computed fresh each render rather than copied into state, so it keeps tracking
  // "up next" live (e.g. if a vote resolves) right up until that first click.
  const selectedDateKey = manualSelectedDateKey ?? upcomingDateKey
  // Two or more movies can land on the same date (most commonly from a backfill that
  // can only estimate a date from when a ranking was submitted, not when each movie
  // was actually watched) — all of them need to stay reachable, not just the first.
  const dayWatches = watchesByDate.get(selectedDateKey) ?? []
  const selectedWatch = (selectedMovieId ? dayWatches.find((w) => w.movieId === selectedMovieId) : null) ?? dayWatches[0] ?? null
  const selectedMovie = selectedWatch?.movieId ? movieById.get(selectedWatch.movieId) : null
  const isVoteDay = !selectedMovie && selectedWatch?.status === 'voting'
  const isSkipDay = dayWatches[0]?.status === 'skipped'

  function selectDate(dateKey: string) {
    setManualSelectedDateKey(dateKey)
    setSelectedMovieId(null)
    setMonthCursor(startOfMonth(parseLocalDate(dateKey)))
  }

  function movieTitle(watch: MovieWatchRecord) {
    return (watch.movieId && movieById.get(watch.movieId)?.title) || 'A movie'
  }

  function openEditor(dateKey: string, watch: MovieWatchRecord | null) {
    setEditorTarget({ dateKey, watch })
  }

  // Translates the editor's single unified form into calls against the four
  // underlying record kinds (real movie / voting placeholder / skip marker) —
  // see the plan doc for the exact transition table this was validated against.
  async function saveEvent(originalWatch: MovieWatchRecord | null, originalDateKey: string, form: EventForm) {
    const { kind, movieId, dateKey, watched, notes } = form
    if (kind === 'movie' && watched && dateKey > todayKey()) {
      throw new Error("Can't mark a future date as watched.")
    }
    if (kind !== 'movie' && dateKey < todayKey()) {
      throw new Error(`Can't ${kind === 'voting' ? 'open a vote' : 'skip'} a date that's already passed.`)
    }

    // Clean up whatever this record used to be, if it's changing kind and/or date.
    if (originalWatch?.movieId && !(kind === 'movie' && originalWatch.movieId === movieId)) {
      await deleteMovieWatch(originalWatch.movieId)
    }
    if (originalWatch?.status === 'voting' && (kind !== 'voting' || originalDateKey !== dateKey)) {
      await clearVotingDate(originalDateKey) // voting's id is date-bound, can't just "move" it
    }
    if (originalWatch?.status === 'skipped' && (kind !== 'skipped' || originalDateKey !== dateKey)) {
      await clearSkippedDate(originalDateKey) // skip's id is date-bound, can't just "move" it
    }

    if (kind === 'movie') {
      if (originalWatch) {
        const collision = (watchesByDate.get(dateKey) ?? []).find((w) => w.movieId && w.movieId !== movieId && w.id !== originalWatch.id)
        if (collision) throw new Error(`${movieTitle(collision)} is already on that day. Move or remove it first.`)
      }
      // originalWatch === null ("+ Add event") never blocks — preserves the
      // existing ability to stack a second movie onto an already-occupied day.
      await upsertMovieWatch({ movieId, scheduledFor: dateKey, watchedAt: watched ? dateKey : undefined, status: watched ? 'watched' : 'scheduled', notes })
    } else if (kind === 'voting') {
      const occupant = (watchesByDate.get(dateKey) ?? []).find((w) => w.movieId && w.id !== originalWatch?.id)
      if (occupant) throw new Error(`${movieTitle(occupant)} is already scheduled for that date. Choose a different one, or edit that night instead.`)
      await setVotingDate(dateKey, notes)
    } else {
      // 'skipped' — matches the previous skip handler's silent-replace behavior.
      const occupant = (watchesByDate.get(dateKey) ?? []).find((w) => w.movieId && w.id !== originalWatch?.id)
      if (occupant?.movieId) await deleteMovieWatch(occupant.movieId)
      await setSkippedDate(dateKey, notes)
    }
    selectDate(dateKey)
  }

  async function deleteEvent(watch: MovieWatchRecord) {
    if (watch.movieId) return deleteMovieWatch(watch.movieId)
    // Dropping an open vote night marks the day skipped rather than just deleting the
    // row — every future Sunday auto-refills with a voting placeholder (see
    // missingVoteSundayKeys above), so a plain delete would just reappear on the next
    // render. Skipping the day is what actually sticks.
    if (watch.status === 'voting') return setSkippedDate(localDateKey(watchStart(watch)), watch.notes ?? undefined)
    return clearSkippedDate(localDateKey(watchStart(watch)))
  }

  async function handleDeleteEvent(watch: MovieWatchRecord) {
    const confirmMessage = watch.movieId
      ? isWatched(watch)
        ? `Mark ${movieTitle(watch)} as not watched? It will drop out of the group ranking until it's watched again.`
        : `Remove ${movieTitle(watch)} from the schedule? It goes back to being open for votes.`
      : watch.status === 'voting'
        ? 'Skip this day — no movie night, no open vote?'
        : 'Undo the skip for this day?'
    if (!window.confirm(confirmMessage)) return false
    await deleteEvent(watch)
    return true
  }

  async function handleDropMovie(sourceDateKey: string, targetDateKey: string) {
    const sourceWatch = watchesByDate.get(sourceDateKey)?.find((watch) => watch.movieId)
    if (!sourceWatch?.movieId) return
    setDragError('')
    const occupant = watchesByDate.get(targetDateKey)?.find((watch) => watch.movieId && watch.movieId !== sourceWatch.movieId)
    if (occupant) {
      const title = movieById.get(occupant.movieId as string)?.title ?? 'Another movie'
      setDragError(`${title} is already on that day. Move or remove it first.`)
      return
    }
    try {
      // A watched night dragged onto a future date can't stay "watched" there — it
      // hasn't happened on that date yet — so it drops back to merely scheduled.
      const staysWatched = isWatched(sourceWatch) && targetDateKey <= todayKey()
      await upsertMovieWatch({
        movieId: sourceWatch.movieId,
        scheduledFor: targetDateKey,
        watchedAt: staysWatched ? targetDateKey : undefined,
        status: staysWatched ? 'watched' : 'scheduled',
      })
      selectDate(targetDateKey)
    } catch (err) {
      setDragError(err instanceof Error ? err.message : 'Could not move this movie night.')
    }
  }

  async function handleVote(movieId: string) {
    const nextVote = optimisticVoteMovieId === movieId ? null : movieId
    const previousVote = optimisticVoteMovieId
    setOptimisticVoteMovieId(nextVote)
    setVotePendingId(movieId)
    setVoteError('')
    try {
      await setMyWatchVote(movieId, nextVote === movieId)
    } catch (err) {
      setOptimisticVoteMovieId(previousVote)
      setVoteError(err instanceof Error ? err.message : 'Vote could not be saved.')
    } finally {
      setVotePendingId(null)
    }
  }

  return (
    <div className="sunday-page">
      <section className="sunday-hero">
        <div>
          <h2>Upcoming</h2>
        </div>
      </section>

      <NextUpCard
        overdueWatch={overdueWatches[0] ?? null}
        upcomingWatch={upcomingWatches[0] ?? null}
        movieById={movieById}
        hasCandidates={remainingMovies.length > 0}
        hasVotes={hasVotes}
        topVoteMovie={topVoteMovie}
        topVoteCount={topVoteCount}
        voteTargetDate={voteTargetDate}
        onOpenMovie={onOpenMovie}
        onSelectDate={selectDate}
      />

      <CalendarGrid
        monthCursor={monthCursor}
        monthDays={monthDays}
        movieById={movieById}
        selectedDateKey={selectedDateKey}
        isAdmin={isAdmin}
        dragError={dragError}
        onPrevMonth={() => setMonthCursor((value) => addMonths(value, -1))}
        onNextMonth={() => setMonthCursor((value) => addMonths(value, 1))}
        onToday={() => setMonthCursor(startOfMonth(parseLocalDate(todayKey())))}
        onDayClick={selectDate}
        onDropMovie={(source, target) => void handleDropMovie(source, target)}
        onAddEvent={() => openEditor(selectedDateKey, null)}
      />

      <section className="sunday-day-details">
        <div className="section-header-row">
          <h2>{formatDisplayDate(selectedDateKey)}</h2>
        </div>

        {dayWatches.some((watch) => watch.movieId) && (
          <div className="ranked-list">
            {dayWatches.map((watch) => {
              const movie = watch.movieId ? movieById.get(watch.movieId) : null
              if (!movie) return null
              const active = dayWatches.length > 1 && watch.movieId === selectedWatch?.movieId
              return (
                <MovieCard
                  key={watch.id}
                  movie={movie}
                  subtitle={isWatched(watch) ? 'Watched' : isOverdue(watch) ? 'Overdue' : 'Scheduled'}
                  onClick={() => {
                    setSelectedMovieId(watch.movieId ?? null)
                    onOpenMovie(watch.movieId as string)
                  }}
                  trailing={
                    <span className="sunday-row-actions">
                      {active && <span className="sunday-pill">Viewing</span>}
                      {isAdmin && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditor(selectedDateKey, watch)
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </span>
                  }
                />
              )
            })}
          </div>
        )}

        {selectedMovie ? null : isSkipDay ? (
          <p className="empty-state">No movie night planned for this day.</p>
        ) : isVoteDay ? (
          <>
            {totalMembers > 0 && <p className="sunday-muted">{currentVotes.length} of {totalMembers} members have voted</p>}
            <VoteList
              candidates={remainingMovies}
              voteCounts={voteCounts}
              myVote={optimisticVoteMovieId}
              isSignedIn={isSignedIn}
              pendingId={votePendingId}
              error={voteError}
              onVote={handleVote}
              onOpenMovie={onOpenMovie}
            />
            {isAdmin && remainingMovies.length > 0 && (
              <div className="sunday-action-row">
                <button type="button" className="secondary-button" onClick={() => setRandomPickOpen(true)}>
                  Randomly pick a movie
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="empty-state">Nothing planned for this day yet.</p>
        )}

        {isAdmin && !dayWatches.some((watch) => watch.movieId) && (
          <div className="sunday-action-row">
            <button type="button" className="secondary-button" onClick={() => openEditor(selectedDateKey, dayWatches[0] ?? null)}>
              Edit this day
            </button>
          </div>
        )}
      </section>

      {icsFeedUrl && (
        <section className="sunday-action-row">
          <button type="button" className="secondary-button" onClick={() => setSubscribeOpen(true)}>
            Subscribe
          </button>
        </section>
      )}

      {editorTarget && (
        <EventEditorModal
          dateKey={editorTarget.dateKey}
          watch={editorTarget.watch}
          movies={movies}
          watchesByMovieId={watchesByMovieId}
          onSave={(form) => saveEvent(editorTarget.watch, editorTarget.dateKey, form)}
          onDelete={() => handleDeleteEvent(editorTarget.watch!)}
          onClose={() => setEditorTarget(null)}
        />
      )}

      {subscribeOpen && icsFeedUrl && <SubscribeModal feedUrl={icsFeedUrl} onClose={() => setSubscribeOpen(false)} />}

      {randomPickOpen && (
        <RandomPickModal
          candidates={remainingMovies}
          voteCounts={voteCounts}
          onPick={(movieId) => upsertMovieWatch({ movieId, scheduledFor: selectedDateKey, status: 'scheduled' })}
          onClose={() => setRandomPickOpen(false)}
        />
      )}
    </div>
  )
}
