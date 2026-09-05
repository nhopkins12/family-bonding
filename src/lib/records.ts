/**
 * Shared "pick the newest record" logic for backend models that can end up with
 * more than one row per logical owner (a client retry racing a create, a legacy
 * import, etc.) before every write path used a deterministic id. Centralized here
 * because getting this comparison wrong in one call site but not another would
 * make different parts of the app disagree about which row is current.
 */
export interface TimestampedRecord {
  id?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

/** True if `a` is more recent than `b` — by updatedAt (falling back to createdAt), then by id as a final deterministic tiebreak when timestamps tie or are missing. */
export function isNewerRecord(a: TimestampedRecord, b: TimestampedRecord): boolean {
  const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? '')
  const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? '')

  if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) return aTime > bTime
  if (!Number.isNaN(aTime) && Number.isNaN(bTime)) return true
  if (Number.isNaN(aTime) && !Number.isNaN(bTime)) return false

  return String(a.id ?? '') > String(b.id ?? '')
}

/** Reduces `records` to a Map of the single newest record per key. Records where `keyFn` returns null/undefined are dropped. */
export function latestByKeyMap<T extends TimestampedRecord>(records: T[], keyFn: (record: T) => string | null | undefined): Map<string, T> {
  const map = new Map<string, T>()
  for (const record of records) {
    const key = keyFn(record)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || isNewerRecord(record, existing)) map.set(key, record)
  }
  return map
}

/** Same as {@link latestByKeyMap}, flattened to an array — records with no key are kept as-is (there's nothing to dedupe them against). */
export function latestByKey<T extends TimestampedRecord>(records: T[], keyFn: (record: T) => string | null | undefined): T[] {
  const keyless = records.filter((record) => !keyFn(record))
  return [...keyless, ...latestByKeyMap(records, keyFn).values()]
}
