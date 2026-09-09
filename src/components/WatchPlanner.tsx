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
  isAdmin: boolean
  schedulingId: string | null
  onSchedule: (movieId: string) => void
}

// Ranked by vote count already (see remainingMovies), so an admin picking straight
// off this list — instead of only via the top-vote shortcut or a random draw — reads
// as "any of these, your call" rather than needing a separate picker.
function VoteList({ candidates, voteCounts, myVote, isSignedIn, pendingId, error, onVote, onOpenMovie, isAdmin, schedulingId, onSchedule }: VoteListProps) {
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
                  <span className="sunday-row-actions">
                    {isAdmin && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSchedule(movie.id)
                        }}
                        disabled={schedulingId === movie.id}
                      >
                        {schedulingId === movie.id ? 'Scheduling…' : 'Schedule'}
                      </button>
                    )}
                    <button
                      type="button"
                      className={selected ? 'unrank-button' : 'rank-it-button'}
                      onClick={() => onVote(movie.id)}
                      disabled={pendingId === movie.id}
                    >
                      {selected ? 'Remove vote' : 'Vote'}
                    </button>
                  </span>
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
  onDropWatch: (sourceDateKey: string, targetDateKey: string) => void
  onAddEvent: () => void
  missingSundayCount: number
  fillingSundays: boolean
  onFillSundays: () => void
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
  onDropWatch,
  onAddEvent,
  missingSundayCount,
  fillingSundays,
  onFillSundays,
}: CalendarGridProps) {
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const sensors = useCalendarDragSensors()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDateKey(null)
    if (!over) return
    const sourceDateKey = String(active.id)
    const targetDateKey = String(over.id)
    if (sourceDateKey !== targetDateKey) onDropWatch(sourceDateKey, targetDateKey)
  }

  const activeWatch = activeDateKey ? (monthDays.find((day) => day.key === activeDateKey)?.watches[0] ?? null) : null
  const activeMovie = activeWatch?.movieId ? movieById.get(activeWatch.movieId) : null
  const activeLabel = activeMovie?.title ?? (activeWatch && !activeWatch.movieId ? 'Vote night' : null)

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
          {isAdmin && missingSundayCount > 0 && (
            <button type="button" className="secondary-button" disabled={fillingSundays} onClick={onFillSundays}>
              {fillingSundays ? 'Filling…' : `Fill ${missingSundayCount} Sunday${missingSundayCount === 1 ? '' : 's'}`}
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

      {isAdmin && <p className="sunday-muted">Drag a movie night or open vote onto another day to move it there.</p>}
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
            {activeLabel && (
              <div className="month-calendar-event">
                <span className="month-calendar-event-title">{activeLabel}</span>
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
  // A day is either a real movie night or it's open — no separate "skipped" kind.
  // An open day nobody wants is just deleted, not converted into a different record.
  const isOpen = Boolean(watch) && !movie
  const overdue = watch ? isOverdue(watch) : false
  const status = watch ? statusForWatch(watch) : 'open'
  const dayStatus = isOpen ? 'voting' : status
  // An open placeholder is a real event now, same as a scheduled movie — it should
  // move the same way a movie night does, not be stuck in place just because it has
  // no movieId.
  const canDrag = isAdmin && Boolean(watch)

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
      {isOpen && (
        <span className="month-calendar-event">
          <span className="month-calendar-event-title">Vote night</span>
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
    isAdmin,
    isSignedIn,
    profilesByOwner,
  } = useAppData()

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(parseLocalDate(todayKey())))
  const [manualSelectedDateKey, setManualSelectedDateKey] = useState<string | null>(null)
  const [selectedWatchId, setSelectedWatchId] = useState<string | null>(null)
  const [optimisticVoteMovieId, setOptimisticVoteMovieId] = useState<string | null>(null)
  const [votePendingId, setVotePendingId] = useState<string | null>(null)
  const [voteError, setVoteError] = useState('')
  const [dragError, setDragError] = useState('')
  const [schedulingMovieId, setSchedulingMovieId] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState('')
  const [fillingSundays, setFillingSundays] = useState(false)
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

  // Sundays in the visible month with no MovieWatch row of any kind yet — offered to
  // an admin as an explicit "Fill Sundays" action (see handleFillSundays) rather than
  // backfilled automatically in the background. That auto-fill used to run as a plain
  // effect keyed off this same list, which meant it could fire mid-drag: move a
  // placeholder off a Sunday, and before the drag's own two writes (open the target,
  // clear the source) finished landing, the effect could already be racing to
  // recreate a placeholder at that same now-empty Sunday under the same deterministic
  // id a follow-up action was about to touch. Making it an explicit click removes
  // that race entirely — nothing writes here except in direct response to a click.
  const missingVoteSundayKeys = useMemo(
    () => monthDays.filter((day) => day.isSunday && !day.isPast && day.watches.length === 0).map((day) => day.key),
    [monthDays],
  )

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
  // Two or more records can land on the same date — most commonly two or more movies
  // from a backfill that can only estimate a date from when a ranking was submitted,
  // but a stray duplicate open-slot row is possible too — every one of them needs to
  // stay individually reachable and manageable, not just whichever is first in the
  // array (that's what the calendar cell's "+N" badge was hiding).
  const dayWatches = watchesByDate.get(selectedDateKey) ?? []
  const selectedWatch = (selectedWatchId ? dayWatches.find((w) => w.id === selectedWatchId) : null) ?? dayWatches[0] ?? null
  const selectedMovie = selectedWatch?.movieId ? movieById.get(selectedWatch.movieId) : null
  const isVoteDay = !selectedMovie && Boolean(selectedWatch)

  function selectDate(dateKey: string) {
    setManualSelectedDateKey(dateKey)
    setSelectedWatchId(null)
    setMonthCursor(startOfMonth(parseLocalDate(dateKey)))
  }

  async function handleFillSundays() {
    if (missingVoteSundayKeys.length === 0) return
    setFillingSundays(true)
    try {
      await ensureVotingPlaceholders(missingVoteSundayKeys)
    } finally {
      setFillingSundays(false)
    }
  }

  function movieTitle(watch: MovieWatchRecord) {
    return (watch.movieId && movieById.get(watch.movieId)?.title) || 'A movie'
  }

  function openEditor(dateKey: string, watch: MovieWatchRecord | null) {
    setEditorTarget({ dateKey, watch })
  }

  // Translates the editor's single unified form into calls against the two
  // underlying record kinds: a real movie, or an open placeholder.
  async function saveEvent(originalWatch: MovieWatchRecord | null, originalDateKey: string, form: EventForm) {
    const { kind, movieId, dateKey, watched, notes } = form
    if (kind === 'movie' && watched && dateKey > todayKey()) {
      throw new Error("Can't mark a future date as watched.")
    }
    if (kind !== 'movie' && dateKey < todayKey()) {
      throw new Error("Can't open a date that's already passed.")
    }

    // Clean up whatever this record used to be, if it's changing kind and/or date.
    if (originalWatch?.movieId && !(kind === 'movie' && originalWatch.movieId === movieId)) {
      await deleteMovieWatch(originalWatch.movieId)
    }
    if (originalWatch && !originalWatch.movieId && (kind !== 'voting' || originalDateKey !== dateKey)) {
      await clearVotingDate(originalDateKey) // an open placeholder's id is date-bound, can't just "move" it
    }

    if (kind === 'movie') {
      if (originalWatch) {
        const collision = (watchesByDate.get(dateKey) ?? []).find((w) => w.movieId && w.movieId !== movieId && w.id !== originalWatch.id)
        if (collision) throw new Error(`${movieTitle(collision)} is already on that day. Move or remove it first.`)
      }
      // originalWatch === null ("+ Add event") never blocks — preserves the
      // existing ability to stack a second movie onto an already-occupied day.
      await upsertMovieWatch({ movieId, scheduledFor: dateKey, watchedAt: watched ? dateKey : undefined, status: watched ? 'watched' : 'scheduled', notes })
    } else {
      const occupant = (watchesByDate.get(dateKey) ?? []).find((w) => w.movieId && w.id !== originalWatch?.id)
      if (occupant) throw new Error(`${movieTitle(occupant)} is already scheduled for that date. Choose a different one, or edit that night instead.`)
      await setVotingDate(dateKey, notes)
    }
    selectDate(dateKey)
  }

  async function deleteEvent(watch: MovieWatchRecord) {
    if (watch.movieId) return deleteMovieWatch(watch.movieId)
    // A placeholder deletes the same as any other event — if this Sunday is still in
    // the future and still empty next render, missingVoteSundayKeys just opens a
    // fresh vote night there again, same as it does for any other open Sunday. That's
    // the intended way back in, not a separate record left behind.
    return clearVotingDate(localDateKey(watchStart(watch)))
  }

  async function handleDeleteEvent(watch: MovieWatchRecord) {
    const confirmMessage = watch.movieId
      ? isWatched(watch)
        ? `Mark ${movieTitle(watch)} as not watched? It will drop out of the group ranking until it's watched again.`
        : `Remove ${movieTitle(watch)} from the schedule? It goes back to being open for votes.`
      : 'Remove this event?'
    if (!window.confirm(confirmMessage)) return false
    await deleteEvent(watch)
    return true
  }

  async function handleDropWatch(sourceDateKey: string, targetDateKey: string) {
    // The calendar cell only ever exposes/drags day.watches[0] — same single-item
    // scope the pre-existing movie-only version of this already had.
    const sourceWatch = watchesByDate.get(sourceDateKey)?.[0]
    if (!sourceWatch) return
    setDragError('')

    if (sourceWatch.movieId) {
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
      return
    }

    // An open placeholder — its id is date-bound (see setVotingDate), so "moving" it
    // means opening one at the target date and clearing the one left behind at the
    // source, rather than updating a single row's date in place like a movie can.
    // Blocked on ANY existing record at the target, not just a movie — nearly every
    // future Sunday already carries its own auto-filled placeholder, so without this
    // a drag onto one would silently merge into it and drop the source's own row
    // instead of actually moving anything.
    const occupant = watchesByDate.get(targetDateKey)?.[0]
    if (occupant) {
      const title = occupant.movieId ? (movieById.get(occupant.movieId)?.title ?? 'Another movie') : 'An open vote night'
      setDragError(`${title} is already on that day. Move or remove it first.`)
      return
    }
    try {
      await setVotingDate(targetDateKey, sourceWatch.notes ?? undefined)
      await clearVotingDate(sourceDateKey)
      selectDate(targetDateKey)
    } catch (err) {
      setDragError(err instanceof Error ? err.message : 'Could not move this event.')
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

  // Shared by the per-row "Schedule" button and the random-pick modal — both commit a
  // vote-list candidate to the currently selected date. Guards against the same
  // collision saveEvent's movie branch already blocks: on an ordinary vote day this
  // is a no-op (the only other record there is the placeholder itself, which
  // upsertMovieWatch clears on its own), but a day that happens to carry a movie
  // *and* a stray placeholder together shouldn't silently gain a second movie.
  async function scheduleMovieForSelectedDate(movieId: string) {
    const occupant = dayWatches.find((w) => w.movieId && w.movieId !== movieId)
    if (occupant) throw new Error(`${movieTitle(occupant)} is already scheduled for that date. Choose a different one, or edit that night instead.`)
    await upsertMovieWatch({ movieId, scheduledFor: selectedDateKey, status: 'scheduled' })
  }

  async function handleScheduleMovie(movieId: string) {
    setSchedulingMovieId(movieId)
    setScheduleError('')
    try {
      await scheduleMovieForSelectedDate(movieId)
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Could not schedule this movie.')
    } finally {
      setSchedulingMovieId(null)
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

      <section className="sunday-day-details">
        <div className="section-header-row">
          <h2>{formatDisplayDate(selectedDateKey)}</h2>
        </div>

        {dayWatches.length > 0 && (
          <div className="ranked-list">
            {dayWatches.map((watch) => {
              const movie = watch.movieId ? movieById.get(watch.movieId) : null
              const active = dayWatches.length > 1 && watch.id === selectedWatch?.id
              const trailing = (
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
              )
              if (movie) {
                return (
                  <MovieCard
                    key={watch.id}
                    movie={movie}
                    subtitle={isWatched(watch) ? 'Watched' : isOverdue(watch) ? 'Overdue' : 'Scheduled'}
                    onClick={() => {
                      setSelectedWatchId(watch.id)
                      onOpenMovie(watch.movieId as string)
                    }}
                    trailing={trailing}
                  />
                )
              }
              // An open placeholder — no movie to show, but still its own selectable,
              // editable row instead of being reachable only as whichever record
              // happens to be dayWatches[0].
              return (
                <button type="button" key={watch.id} className="sunday-placeholder-row" onClick={() => setSelectedWatchId(watch.id)}>
                  <span className="movie-card-title">Vote night</span>
                  {trailing}
                </button>
              )
            })}
          </div>
        )}

        {selectedMovie ? null : isVoteDay ? (
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
              isAdmin={isAdmin}
              schedulingId={schedulingMovieId}
              onSchedule={(movieId) => void handleScheduleMovie(movieId)}
            />
            {isAdmin && remainingMovies.length > 0 && (
              <div className="sunday-action-row">
                <button type="button" className="secondary-button" onClick={() => setRandomPickOpen(true)}>
                  Randomly pick a movie
                </button>
              </div>
            )}
            {scheduleError && <p className="admin-form-error">{scheduleError}</p>}
          </>
        ) : (
          <p className="empty-state">Nothing planned for this day yet.</p>
        )}
      </section>

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
        onDropWatch={(source, target) => void handleDropWatch(source, target)}
        onAddEvent={() => openEditor(selectedDateKey, null)}
        missingSundayCount={missingVoteSundayKeys.length}
        fillingSundays={fillingSundays}
        onFillSundays={() => void handleFillSundays()}
      />

      {icsFeedUrl && (
        <section className="sunday-subscribe">
          <div>
            <h2>Subscribe</h2>
            <p className="sunday-muted">Get movie nights and open votes in Google, Apple, or Outlook Calendar.</p>
          </div>
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
          onPick={(movieId) => scheduleMovieForSelectedDate(movieId)}
          onClose={() => setRandomPickOpen(false)}
        />
      )}
    </div>
  )
}
