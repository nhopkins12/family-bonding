import { describe, expect, it } from 'vitest'
import { isNewerRecord, latestByKey, latestByKeyMap } from './records'

describe('isNewerRecord', () => {
  it('prefers the record with the later updatedAt', () => {
    const a = { id: 'a', updatedAt: '2026-01-02T00:00:00.000Z' }
    const b = { id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' }
    expect(isNewerRecord(a, b)).toBe(true)
    expect(isNewerRecord(b, a)).toBe(false)
  })

  it('falls back to createdAt when updatedAt is missing', () => {
    const a = { id: 'a', createdAt: '2026-01-02T00:00:00.000Z' }
    const b = { id: 'b', createdAt: '2026-01-01T00:00:00.000Z' }
    expect(isNewerRecord(a, b)).toBe(true)
  })

  it('treats a record with a valid timestamp as newer than one with none', () => {
    const a = { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }
    const b = { id: 'b' }
    expect(isNewerRecord(a, b)).toBe(true)
    expect(isNewerRecord(b, a)).toBe(false)
  })

  it('breaks a timestamp tie (or a double-missing timestamp) by id', () => {
    const a = { id: 'b' }
    const b = { id: 'a' }
    expect(isNewerRecord(a, b)).toBe(true)
    expect(isNewerRecord(b, a)).toBe(false)
  })
})

describe('latestByKeyMap', () => {
  it('keeps only the newest record per key', () => {
    const records = [
      { id: 'old', owner: 'u1', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', owner: 'u1', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'u2', owner: 'u2', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]
    const result = latestByKeyMap(records, (r) => r.owner)
    expect(result.get('u1')?.id).toBe('new')
    expect(result.get('u2')?.id).toBe('u2')
    expect(result.size).toBe(2)
  })

  it('drops records whose key is null, undefined, or empty', () => {
    const records = [{ id: 'a', owner: null }, { id: 'b', owner: undefined }, { id: 'c', owner: '' }]
    const result = latestByKeyMap(records, (r) => r.owner)
    expect(result.size).toBe(0)
  })
})

describe('latestByKey', () => {
  it('keeps keyless records as-is alongside the deduped keyed ones', () => {
    const records = [
      { id: 'old', owner: 'u1', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new', owner: 'u1', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'guest-1', owner: null },
      { id: 'guest-2', owner: null },
    ]
    const result = latestByKey(records, (r) => r.owner)
    expect(result.map((r) => r.id).sort()).toEqual(['guest-1', 'guest-2', 'new'])
  })
})
