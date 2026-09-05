import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import type { MovieRecord, MovieWatchRecord, WatchVoteRecord } from '../lib/dataClient'
import { latestByKeyMap } from '../lib/records'
import { MovieCard } from './MovieCard'
import { MovieDetailContent } from './MovieDetailModal'
import { PosterImage } from './PosterImage'

interface WatchPlannerProps {
  onOpenMovie: (movieId: string) => void
  onOpenProfile: (ownerId: string) => void
}

type WatchStatus = 'scheduled' | 'watched'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The family runs on Toronto time, so "today" always means today in Toronto,
// regardless of which timezone a viewer's own device happens to be set to.
const TIME_ZONE = 'America/Toronto'
const torontoDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

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

/** Today's date key (YYYY-MM-DD) in Toronto time — en-CA formats as YYYY-MM-DD directly. */
function todayKey() {
  return torontoDateFormatter.format(new Date())
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
      isToday: key === todayKey(),
      isSunday: date.getDay() === 0,
      watches,
    }
  })
}

function downloadCalendar(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function toIcsTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function toIcsAllDayDate(value: string) {
  return localDateKey(value).replace(/-/g, '')
}

function nextDateKey(value: string) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + 1)
  return localDateKey(date)
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
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onDayClick: (dateKey: string) => void
}

function CalendarGrid({ monthCursor, monthDays, movieById, selectedDateKey, onPrevMonth, onNextMonth, onToday, onDayClick }: CalendarGridProps) {
  return (
    <section className="sunday-calendar">
      <div className="section-header-row">
        <h2>{formatMonth(monthCursor)}</h2>
        <div className="sunday-calendar-nav">
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

      <div className="sunday-calendar-scroll">
        <div className="month-calendar">
          {WEEKDAY_LABELS.map((day) => (
            <span className={`month-calendar-weekday${day === 'Sun' ? ' sunday' : ''}`} key={day}>
              {day}
            </span>
          ))}
          {monthDays.map((day) => {
            const watch = day.watches[0] ?? null
            const movie = watch?.movieId ? movieById.get(watch.movieId) : null
            const isVotingPlaceholder = watch?.status === 'voting'
            const overdue = watch ? isOverdue(watch) : false
            const status = watch ? statusForWatch(watch) : 'open'
            const dayStatus = isVotingPlaceholder ? 'voting' : status
            return (
              <button
                type="button"
                className={[
                  'month-calendar-day',
                  day.inMonth ? '' : 'outside-month',
                  day.isSunday ? 'sunday' : '',
                  day.isToday ? 'today' : '',
                  selectedDateKey === day.key ? 'selected' : '',
                  dayStatus,
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={day.key}
                onClick={() => onDayClick(day.key)}
              >
                <span className="month-calendar-date">{day.dayNumber}</span>
                {movie && (
                  <span className="month-calendar-event">
                    <span className="month-calendar-event-title">{movie.title}</span>
                    <span className="month-calendar-event-meta">
                      {status === 'watched' ? `Watched ${formatShortDate(watchStart(watch))}` : overdue ? 'Overdue' : 'Scheduled'}
                    </span>
                  </span>
                )}
                {isVotingPlaceholder && (
                  <span className="month-calendar-event">
                    <span className="month-calendar-event-title">Vote night</span>
                  </span>
                )}
                {!watch && day.isSunday && <span className="month-calendar-open">Open</span>}
                {day.watches.length > 1 && <span className="month-calendar-count">+{day.watches.length - 1}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

interface ScheduleFormProps {
  isNew: boolean
  movies: MovieRecord[]
  watchesByMovieId: Map<string, MovieWatchRecord>
  movieId: string
  date: string
  status: WatchStatus
  pending: boolean
  error: string
  onMovieChange: (movieId: string) => void
  onDateChange: (date: string) => void
  onStatusChange: (status: WatchStatus) => void
  onSubmit: () => void
}

function ScheduleForm({ isNew, movies, watchesByMovieId, movieId, date, status, pending, error, onMovieChange, onDateChange, onStatusChange, onSubmit }: ScheduleFormProps) {
  return (
    <form
      className="sunday-schedule-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <h3>{isNew ? 'Schedule a movie' : 'Move or edit this night'}</h3>
      <label>
        Movie
        <select value={movieId} onChange={(e) => onMovieChange(e.target.value)} required>
          <option value="">Choose movie</option>
          {movies.map((movie) => {
            const watch = watchesByMovieId.get(movie.id)
            const watchLabel = watch ? (isWatched(watch) ? 'watched' : 'scheduled') : null
            return (
              <option key={movie.id} value={movie.id}>
                {movie.title}
                {watchLabel ? ` (${watchLabel})` : ''}
              </option>
            )
          })}
        </select>
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} required />
      </label>
      <label>
        Status
        <select value={status} onChange={(e) => onStatusChange(e.target.value as WatchStatus)}>
          <option value="scheduled">Scheduled</option>
          <option value="watched">Watched</option>
        </select>
      </label>
      <div className="sunday-action-row">
        <button type="submit" className="admin-form-submit" disabled={pending || !movieId}>
          {isNew ? 'Add to calendar' : 'Save changes'}
        </button>
      </div>
      {error && <p className="admin-form-error">{error}</p>}
    </form>
  )
}

// --- Main component -----------------------------------------------------------

export function WatchPlanner({ onOpenMovie, onOpenProfile }: WatchPlannerProps) {
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
    isAdmin,
    isSignedIn,
    profilesByOwner,
  } = useAppData()

  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(parseLocalDate(todayKey())))
  const [manualSelectedDateKey, setManualSelectedDateKey] = useState<string | null>(null)
  const [formMovieId, setFormMovieId] = useState('')
  const [formDate, setFormDate] = useState('')
  const [formStatus, setFormStatus] = useState<WatchStatus>('scheduled')
  const [formError, setFormError] = useState('')
  const [rowPending, setRowPending] = useState(false)
  const [optimisticVoteMovieId, setOptimisticVoteMovieId] = useState<string | null>(null)
  const [votePendingId, setVotePendingId] = useState<string | null>(null)
  const [voteError, setVoteError] = useState('')
  const [voteDateDraft, setVoteDateDraft] = useState('')
  const [voteDatePending, setVoteDatePending] = useState(false)
  const [voteDateError, setVoteDateError] = useState('')

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
  const pendingVoteWatch = useMemo(() => allMovieWatches.find((watch) => watch.status === 'voting') ?? null, [allMovieWatches])

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

  useEffect(() => {
    setVoteDateDraft(voteTargetDateKey)
  }, [voteTargetDateKey])

  const monthDays = useMemo(() => buildMonthDays(monthCursor, watchesByDate), [monthCursor, watchesByDate])

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
  const selectedWatch = watchesByDate.get(selectedDateKey)?.[0] ?? null
  const selectedMovie = selectedWatch?.movieId ? movieById.get(selectedWatch.movieId) : null
  const isVoteDay = !selectedMovie && selectedDateKey === voteTargetDateKey

  // Keep the admin edit form in step with whichever day is selected — re-seeded only
  // when the selection itself changes, not on every incidental data refresh, so an
  // admin's in-progress edit isn't clobbered by an unrelated vote coming in.
  useEffect(() => {
    setFormMovieId(selectedWatch?.movieId ?? '')
    setFormDate(selectedDateKey)
    setFormStatus(selectedWatch ? statusForWatch(selectedWatch) : 'scheduled')
    setFormError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateKey])

  function selectDate(dateKey: string) {
    setManualSelectedDateKey(dateKey)
    setMonthCursor(startOfMonth(parseLocalDate(dateKey)))
  }

  async function submitForm() {
    if (!formMovieId || !formDate) return
    setFormError('')
    setRowPending(true)
    try {
      if (selectedWatch?.movieId && selectedWatch.movieId !== formMovieId) {
        await deleteMovieWatch(selectedWatch.movieId)
      }
      await upsertMovieWatch({
        movieId: formMovieId,
        scheduledFor: formDate,
        watchedAt: formStatus === 'watched' ? formDate : undefined,
        status: formStatus,
      })
      selectDate(formDate)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this movie night.')
    } finally {
      setRowPending(false)
    }
  }

  async function markWatchedNow(watch: MovieWatchRecord) {
    if (!watch.movieId) return
    setFormError('')
    setRowPending(true)
    try {
      await upsertMovieWatch({
        movieId: watch.movieId,
        scheduledFor: watch.scheduledFor ?? todayKey(),
        watchedAt: todayKey(),
        status: 'watched',
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not mark this movie watched.')
    } finally {
      setRowPending(false)
    }
  }

  async function removeWatch(watch: MovieWatchRecord) {
    if (!watch.movieId) return
    const movie = movieById.get(watch.movieId)
    const label = movie?.title ?? 'this movie'
    const confirmMessage = isWatched(watch)
      ? `Mark ${label} as not watched? It will drop out of the group ranking until it's watched again.`
      : `Remove ${label} from the schedule? It goes back to being open for votes.`
    if (!window.confirm(confirmMessage)) return
    setFormError('')
    setRowPending(true)
    try {
      await deleteMovieWatch(watch.movieId)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update the schedule.')
    } finally {
      setRowPending(false)
    }
  }

  async function handleSetVoteDate(dateKey: string) {
    if (!dateKey) return
    setVoteDateError('')
    const occupant = watchesByDate.get(dateKey)?.find((watch) => watch.movieId)
    if (occupant) {
      const title = movieById.get(occupant.movieId as string)?.title ?? 'A movie'
      setVoteDateError(`${title} is already scheduled for that date. Choose a different one, or change that night instead.`)
      return
    }
    setVoteDatePending(true)
    try {
      await setVotingDate(dateKey)
    } catch (err) {
      setVoteDateError(err instanceof Error ? err.message : 'Could not change the vote date.')
    } finally {
      setVoteDatePending(false)
    }
  }

  async function handleResetVoteDate() {
    setVoteDateError('')
    setVoteDatePending(true)
    try {
      await clearVotingDate()
    } catch (err) {
      setVoteDateError(err instanceof Error ? err.message : 'Could not reset the vote date.')
    } finally {
      setVoteDatePending(false)
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

  function downloadSchedule() {
    const body = allMovieWatches
      .filter((watch) => watchStart(watch))
      .map((watch) => {
        const movie = watch.movieId ? movieById.get(watch.movieId) : undefined
        const startsAt = watchStart(watch)
        if (!movie || !startsAt) return ''
        const start = toIcsAllDayDate(startsAt)
        const end = toIcsAllDayDate(nextDateKey(startsAt))
        return [`BEGIN:VEVENT`, `UID:${watch.id}@family-bonding`, `DTSTAMP:${toIcsTimestamp(new Date().toISOString())}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:Family Bonding: ${movie.title}`, `END:VEVENT`].join('\r\n')
      })
      .filter(Boolean)
      .join('\r\n')
    downloadCalendar('family-bonding.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Bonding//Sunday Schedule//EN', body, 'END:VCALENDAR'].join('\r\n'))
  }

  return (
    <div className="sunday-page">
      <section className="sunday-hero">
        <div>
          <h2>Upcoming</h2>
        </div>
        <button type="button" className="secondary-button" onClick={downloadSchedule} disabled={allMovieWatches.length === 0}>
          Download calendar
        </button>
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
        onPrevMonth={() => setMonthCursor((value) => addMonths(value, -1))}
        onNextMonth={() => setMonthCursor((value) => addMonths(value, 1))}
        onToday={() => setMonthCursor(startOfMonth(parseLocalDate(todayKey())))}
        onDayClick={selectDate}
      />

      <section className="sunday-day-details">
        <div className="section-header-row">
          <h2>{formatDisplayDate(selectedDateKey)}</h2>
        </div>

        {selectedMovie ? (
          <MovieDetailContent movieId={selectedMovie.id} onOpenProfile={onOpenProfile} />
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
          </>
        ) : (
          <p className="empty-state">Nothing planned for this day yet.</p>
        )}

        {isAdmin && (
          <div className="sunday-day-admin">
            {isVoteDay ? (
              <form
                className="sunday-action-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleSetVoteDate(voteDateDraft)
                }}
              >
                <input type="date" value={voteDateDraft} onChange={(e) => setVoteDateDraft(e.target.value)} aria-label="Vote date" required />
                <button type="submit" className="secondary-button" disabled={voteDatePending}>
                  Change vote date
                </button>
                {pendingVoteWatch && (
                  <button type="button" className="secondary-button" onClick={() => void handleResetVoteDate()} disabled={voteDatePending}>
                    Reset to next Sunday
                  </button>
                )}
              </form>
            ) : (
              !selectedMovie && (
                <div className="sunday-action-row">
                  <button type="button" className="secondary-button" onClick={() => void handleSetVoteDate(selectedDateKey)} disabled={voteDatePending}>
                    Vote here instead, no movie yet
                  </button>
                </div>
              )
            )}
            {voteDateError && <p className="admin-form-error">{voteDateError}</p>}

            {selectedWatch?.movieId && (
              <div className="sunday-action-row">
                {!isWatched(selectedWatch) && (
                  <button type="button" className="secondary-button" onClick={() => void markWatchedNow(selectedWatch)} disabled={rowPending}>
                    Mark watched
                  </button>
                )}
                <button type="button" className="unrank-button" onClick={() => void removeWatch(selectedWatch)} disabled={rowPending}>
                  {isWatched(selectedWatch) ? 'Undo' : 'Unschedule'}
                </button>
              </div>
            )}

            <ScheduleForm
              isNew={!selectedWatch?.movieId}
              movies={movies}
              watchesByMovieId={watchesByMovieId}
              movieId={formMovieId}
              date={formDate}
              status={formStatus}
              pending={rowPending}
              error={formError}
              onMovieChange={setFormMovieId}
              onDateChange={setFormDate}
              onStatusChange={setFormStatus}
              onSubmit={() => void submitForm()}
            />
          </div>
        )}
      </section>
    </div>
  )
}
