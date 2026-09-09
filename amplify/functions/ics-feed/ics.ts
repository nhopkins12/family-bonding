// Pure, dependency-free ICS building — ported from the frontend's old one-time
// "Download calendar" button (since deleted) so the live feed produces byte-for-byte
// the same event shape members were already used to seeing.

export interface IcsMovieWatch {
  id: string
  movieId?: string | null
  status: string
  watchedAt?: string | null
  scheduledFor?: string | null
}

export interface IcsMovie {
  id: string
  title: string
}

export interface IcsWatchVote {
  movieId: string
  vote: string
  owner?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

function parseLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return new Date(Number.NaN)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function toIcsAllDayDate(value: string) {
  return localDateKey(parseLocalDate(value)).replace(/-/g, '')
}

function nextDateKey(value: string) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + 1)
  return localDateKey(date)
}

function toIcsTimestamp(value: Date) {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// Escapes the characters ICS TEXT properties (SUMMARY, DESCRIPTION, ...) treat as
// syntax — a movie title or vote tally containing a comma or semicolon would
// otherwise silently corrupt the property's field boundaries.
function icsEscape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function voteLabel(count: number) {
  return count === 1 ? '1 vote' : `${count} votes`
}

// Same "latest row per owner wins" dedup the frontend applies (see src/lib/records.ts
// / WatchPlanner's latestVoteByOwner) — re-derived here rather than imported, so this
// function's bundle stays exactly what its own header promises: pure and
// dependency-free of the frontend.
function countInterestedVotes(votes: IcsWatchVote[]): Map<string, number> {
  const latestByOwnerAndMovie = new Map<string, IcsWatchVote>()
  for (const vote of votes) {
    if (!vote.owner) continue
    const key = `${vote.owner}:${vote.movieId}`
    const existing = latestByOwnerAndMovie.get(key)
    if (!existing) {
      latestByOwnerAndMovie.set(key, vote)
      continue
    }
    const time = Date.parse(vote.updatedAt ?? vote.createdAt ?? '')
    const existingTime = Date.parse(existing.updatedAt ?? existing.createdAt ?? '')
    if (!Number.isNaN(time) && (Number.isNaN(existingTime) || time > existingTime)) latestByOwnerAndMovie.set(key, vote)
  }
  const counts = new Map<string, number>()
  for (const vote of latestByOwnerAndMovie.values()) {
    if (vote.vote !== 'interested') continue
    counts.set(vote.movieId, (counts.get(vote.movieId) ?? 0) + 1)
  }
  return counts
}

function voteNightDescription(candidates: IcsMovie[], voteCounts: Map<string, number>): string {
  if (candidates.length === 0) return 'No movies left to vote on yet.'
  const ranked = [...candidates].sort((a, b) => (voteCounts.get(b.id) ?? 0) - (voteCounts.get(a.id) ?? 0))
  const shown = ranked.slice(0, 5).map((movie) => `${movie.title} (${voteLabel(voteCounts.get(movie.id) ?? 0)})`)
  const rest = ranked.length - shown.length
  return `Voting is open — ${shown.join(', ')}${rest > 0 ? `, +${rest} more` : ''}`
}

export function buildIcsCalendar(watches: IcsMovieWatch[], movies: Map<string, IcsMovie>, votes: IcsWatchVote[] = [], now = new Date()): string {
  // Every movie can carry at most one MovieWatch row (scheduled or watched — see
  // upsertMovieWatch's id: movieId), so "still a vote candidate" just means no row
  // claims it yet.
  const claimedMovieIds = new Set(watches.filter((watch) => watch.movieId).map((watch) => watch.movieId as string))
  const candidates = [...movies.values()].filter((movie) => !claimedMovieIds.has(movie.id))
  const voteCounts = countInterestedVotes(votes)

  const body = watches
    .map((watch) => {
      if (watch.movieId) {
        const movie = movies.get(watch.movieId)
        const startsAt = watch.watchedAt ?? watch.scheduledFor
        if (!movie || !startsAt) return ''
        const start = toIcsAllDayDate(startsAt)
        const end = toIcsAllDayDate(nextDateKey(startsAt))
        return [
          'BEGIN:VEVENT',
          `UID:${watch.id}@family-bonding`,
          `DTSTAMP:${toIcsTimestamp(now)}`,
          `DTSTART;VALUE=DATE:${start}`,
          `DTEND;VALUE=DATE:${end}`,
          `SUMMARY:${icsEscape(`Family Bonding: ${movie.title}`)}`,
          'END:VEVENT',
        ].join('\r\n')
      }
      // An open, not-yet-decided movie night — still a real calendar event (a
      // placeholder for movie night, not "nothing"), just with the candidates and
      // their current vote counts in the description instead of a chosen title.
      if (watch.status === 'voting' && watch.scheduledFor) {
        const start = toIcsAllDayDate(watch.scheduledFor)
        const end = toIcsAllDayDate(nextDateKey(watch.scheduledFor))
        return [
          'BEGIN:VEVENT',
          `UID:${watch.id}@family-bonding`,
          `DTSTAMP:${toIcsTimestamp(now)}`,
          `DTSTART;VALUE=DATE:${start}`,
          `DTEND;VALUE=DATE:${end}`,
          `SUMMARY:${icsEscape('Family Bonding: Vote night')}`,
          `DESCRIPTION:${icsEscape(voteNightDescription(candidates, voteCounts))}`,
          'END:VEVENT',
        ].join('\r\n')
      }
      return ''
    })
    .filter(Boolean)
    .join('\r\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Family Bonding//Sunday Schedule//EN',
    `NAME:${icsEscape('Family Bonding')}`,
    `X-WR-CALNAME:${icsEscape('Family Bonding')}`,
    body,
    'END:VCALENDAR',
  ].join('\r\n')
}
