// Pure, dependency-free ICS building — ported from the frontend's old one-time
// "Download calendar" button (since deleted) so the live feed produces byte-for-byte
// the same event shape members were already used to seeing.

export interface IcsMovieWatch {
  id: string
  movieId?: string | null
  watchedAt?: string | null
  scheduledFor?: string | null
}

export interface IcsMovie {
  id: string
  title: string
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

export function buildIcsCalendar(watches: IcsMovieWatch[], movies: Map<string, IcsMovie>, now = new Date()): string {
  const body = watches
    .map((watch) => {
      const movie = watch.movieId ? movies.get(watch.movieId) : undefined
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
        `SUMMARY:Family Bonding: ${movie.title}`,
        'END:VEVENT',
      ].join('\r\n')
    })
    .filter(Boolean)
    .join('\r\n')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Family Bonding//Sunday Schedule//EN', body, 'END:VCALENDAR'].join('\r\n')
}
