/**
 * Serializes "create once, then update" for a single backend record so rapid/overlapping
 * calls (drag events, slider ticks, double clicks) can never race and create duplicate
 * rows. The id is locked in memory the instant a create resolves — every later call sees
 * it immediately, even if the subscription/list state hasn't caught up yet. Calls that
 * arrive while one is already in flight coalesce to just the latest value instead of each
 * firing their own request.
 */
export function createUpsertQueue<T>(options: {
  getExistingId: () => string | null
  create: (value: T) => Promise<string>
  update: (id: string, value: T) => Promise<void>
}) {
  let lockedId: string | null = null
  let running: Promise<void> | null = null
  let pending: T | null = null
  let hasPending = false

  async function drain() {
    while (hasPending) {
      const value = pending as T
      hasPending = false
      pending = null

      const id = lockedId ?? options.getExistingId()
      if (id) {
        lockedId = id
        await options.update(id, value)
      } else {
        lockedId = await options.create(value)
      }
    }
    running = null
  }

  function run(value: T): Promise<void> {
    pending = value
    hasPending = true
    if (!running) running = drain()
    return running
  }

  return run
}
