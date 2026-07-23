import { describe, expect, it, vi } from 'vitest'
import { createUpsertQueue } from './upsertQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('createUpsertQueue', () => {
  it('creates once, then updates on subsequent calls', async () => {
    const create = vi.fn(async () => 'record-1')
    const update = vi.fn(async () => {})
    const run = createUpsertQueue<string[]>({ getExistingId: () => null, create, update })

    await run(['a'])
    await run(['a', 'b'])
    await run(['a', 'b', 'c'])

    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenNthCalledWith(1, 'record-1', ['a', 'b'])
    expect(update).toHaveBeenNthCalledWith(2, 'record-1', ['a', 'b', 'c'])
  })

  it('never creates twice even when calls race before the first create resolves', async () => {
    const gate = deferred<string>()
    const create = vi.fn(() => gate.promise)
    const update = vi.fn(async () => {})
    const run = createUpsertQueue<string[]>({ getExistingId: () => null, create, update })

    // Two calls fire before the create has resolved — this is exactly the click-twice /
    // drag-twice race that used to produce duplicate backend records.
    const first = run(['a'])
    const second = run(['a', 'b'])

    expect(create).toHaveBeenCalledTimes(1)

    gate.resolve('record-1')
    await first
    await second

    expect(create).toHaveBeenCalledTimes(1)
    // The second call's value ('a','b') is the latest pending value, so it gets applied
    // via a follow-up update once the create settles rather than being dropped.
    expect(update).toHaveBeenCalledWith('record-1', ['a', 'b'])
  })

  it('coalesces to only the latest value when many calls arrive faster than the network responds', async () => {
    const create = vi.fn(async () => 'record-1')
    const update = vi.fn(async () => {})
    const run = createUpsertQueue<number>({ getExistingId: () => 'record-1', create, update })

    // Simulates dragging a slider through many intermediate values rapidly.
    const calls = [1, 2, 3, 4, 5].map((n) => run(n))
    await Promise.all(calls)

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('record-1', 5)
    expect(update.mock.calls.length).toBeLessThan(5)
  })

  it('uses getExistingId immediately when a record already exists, skipping create entirely', async () => {
    const create = vi.fn(async () => 'should-not-be-called')
    const update = vi.fn(async () => {})
    const run = createUpsertQueue<string[]>({ getExistingId: () => 'existing-id', create, update })

    await run(['x'])

    expect(create).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith('existing-id', ['x'])
  })
})
