import { describe, expect, it } from 'vitest'
import { buildIcsCalendar } from './ics'

describe('buildIcsCalendar', () => {
  const movies = new Map([
    ['m1', { id: 'm1', title: 'Dr. No' }],
    ['m2', { id: 'm2', title: 'Skyfall' }],
  ])

  it('wraps events in a VCALENDAR block', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', watchedAt: '2026-07-23' }], movies)
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('SUMMARY:Family Bonding: Dr. No')
  })

  it('makes the event span exactly one all-day date, crossing a month boundary correctly', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', scheduledFor: '2026-01-31' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260131')
    expect(ics).toContain('DTEND;VALUE=DATE:20260201')
  })

  it('crosses a year boundary correctly', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', scheduledFor: '2026-12-31' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231')
    expect(ics).toContain('DTEND;VALUE=DATE:20270101')
  })

  it('prefers watchedAt over scheduledFor when both are present', () => {
    const ics = buildIcsCalendar([{ id: 'w1', movieId: 'm1', watchedAt: '2026-07-23', scheduledFor: '2026-07-20' }], movies)
    expect(ics).toContain('DTSTART;VALUE=DATE:20260723')
  })

  it('skips a watch with no movie, no date, or an unresolvable movie', () => {
    const ics = buildIcsCalendar(
      [
        { id: 'w1', movieId: undefined, scheduledFor: '2026-07-23' },
        { id: 'w2', movieId: 'm1' },
        { id: 'w3', movieId: 'unknown', scheduledFor: '2026-07-23' },
      ],
      movies,
    )
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('includes one VEVENT per resolvable watch', () => {
    const ics = buildIcsCalendar(
      [
        { id: 'w1', movieId: 'm1', watchedAt: '2026-07-23' },
        { id: 'w2', movieId: 'm2', scheduledFor: '2026-08-02' },
      ],
      movies,
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('UID:w1@family-bonding')
    expect(ics).toContain('UID:w2@family-bonding')
  })
})
