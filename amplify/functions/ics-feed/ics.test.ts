import { describe, expect, it } from 'vitest'
import { buildIcsCalendar } from './ics'

describe('buildIcsCalendar', () => {
  const movies = new Map([
    ['m1', { id: 'm1', title: 'Dr. No' }],
    ['m2', { id: 'm2', title: 'Skyfall' }],
    ['m3', { id: 'm3', title: 'Goldfinger' }],
  ])

  it('names the calendar Family Bonding', () => {
    const ics = buildIcsCalendar([], movies)
    expect(ics).toContain('NAME:Family Bonding')
    expect(ics).toContain('X-WR-CALNAME:Family Bonding')
  })

  it('wraps events in a VCALENDAR block', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', status: 'watched', watchedAt: '2026-07-23' }], movies)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('SUMMARY:Family Bonding: Dr. No')
  })

  it('makes the event span exactly one all-day date, crossing a month boundary correctly', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', status: 'scheduled', scheduledFor: '2026-01-31' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260131')
    expect(ics).toContain('DTEND;VALUE=DATE:20260201')
  })

  it('crosses a year boundary correctly', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', status: 'scheduled', scheduledFor: '2026-12-31' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('prefers watchedAt over scheduledFor when both are present', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', status: 'watched', watchedAt: '2026-07-23', scheduledFor: '2026-07-20' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260723')
  })

  it('skips a watch with no movie, no date, or an unresolvable movie', () => {
    const ics = buildIcsCalendar(
      [
        { id: 'w1', movieId: undefined, status: 'skipped', scheduledFor: '2026-07-23' },
        { id: 'w2', movieId: 'm1', status: 'scheduled' },
        { id: 'w3', movieId: 'unknown', status: 'scheduled', scheduledFor: '2026-07-23' },
      ],
      movies,
    )
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('includes one VEVENT per resolvable watch', () => {
    const ics = buildIcsCalendar(
      [
        { id: 'w1', movieId: 'm1', status: 'watched', watchedAt: '2026-07-23' },
        { id: 'w2', movieId: 'm2', status: 'scheduled', scheduledFor: '2026-08-02' },
      ],
      movies,
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:w1@family-bonding')
    expect(ics).toContain('UID:w2@family-bonding')
  })

  it('includes an open voting slot as its own event, not a blank day', () => {
    const ics = buildIcsCalendar([{ id: 'vote-2026-09-13', movieId: null, status: 'voting', scheduledFor: '2026-09-13' }], movies)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('SUMMARY:Family Bonding: Vote night')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260913')
  })

  it("lists a voting slot's remaining candidates, ranked by vote count, in its description", () => {
    const ics = buildIcsCalendar(
      [{ id: 'vote-2026-09-13', movieId: null, status: 'voting', scheduledFor: '2026-09-13' }],
      movies,
      [
        { movieId: 'm2', vote: 'interested', owner: 'alice', updatedAt: '2026-09-01T00:00:00Z' },
        { movieId: 'm2', vote: 'interested', owner: 'bob', updatedAt: '2026-09-01T00:00:00Z' },
        { movieId: 'm3', vote: 'interested', owner: 'carol', updatedAt: '2026-09-01T00:00:00Z' },
      ],
    )
    const description = ics.match(/DESCRIPTION:(.*)/)?.[1]
    expect(description).toContain('Skyfall (2 votes)')
    expect(description).toContain('Goldfinger (1 vote)')
    expect(description?.indexOf('Skyfall')).toBeLessThan(description?.indexOf('Goldfinger') ?? -1)
  })

  it('excludes an already-scheduled or watched movie from a voting slot\'s candidates', () => {
    const ics = buildIcsCalendar(
      [
        { id: 'w1', movieId: 'm1', status: 'watched', watchedAt: '2026-07-23' },
        { id: 'vote-2026-09-13', movieId: null, status: 'voting', scheduledFor: '2026-09-13' },
      ],
      movies,
    )
    const description = ics.match(/DESCRIPTION:(.*)/)?.[1]
    expect(description).not.toContain('Dr. No')
  })

  it('only counts the latest vote per owner per movie', () => {
    const ics = buildIcsCalendar(
      [{ id: 'vote-2026-09-13', movieId: null, status: 'voting', scheduledFor: '2026-09-13' }],
      movies,
      [
        { movieId: 'm2', vote: 'interested', owner: 'alice', updatedAt: '2026-09-01T00:00:00Z' },
        { movieId: 'm2', vote: 'not-interested', owner: 'alice', updatedAt: '2026-09-02T00:00:00Z' },
      ],
    )
    const description = ics.match(/DESCRIPTION:(.*)/)?.[1]
    expect(description).toContain('Skyfall (0 votes)')
  })

  it('escapes commas and semicolons in text fields', () => {
    const commaMovies = new Map([['m1', { id: 'm1', title: 'A, B; C' }]])
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', status: 'watched', watchedAt: '2026-07-23' }], commaMovies)
    expect(ics).toContain('SUMMARY:Family Bonding: A\\, B\\; C')
  })
})
