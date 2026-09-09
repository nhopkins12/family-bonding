import { useState } from 'react'
import type { MovieRecord } from '../lib/dataClient'
import { MovieCard } from './MovieCard'
import { ModalBackdrop } from './ModalBackdrop'

interface RandomPickModalProps {
  candidates: MovieRecord[]
  voteCounts: Map<string, number>
  onPick: (movieId: string) => Promise<void>
  onClose: () => void
}

function voteLabel(count: number) {
  return count === 1 ? '1 vote' : `${count} votes`
}

/**
 * Narrows the open field down to a checked-in pool, then draws one at random from
 * just that pool — for whittling "everyone's still in the running" down to "these
 * three, go" before letting chance make the actual call.
 */
export function RandomPickModal({ candidates, voteCounts, onPick, onClose }: RandomPickModalProps) {
  const [includedIds, setIncludedIds] = useState(() => new Set(candidates.map((movie) => movie.id)))
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const pool = candidates.filter((movie) => includedIds.has(movie.id))
  const winner = winnerId ? (candidates.find((movie) => movie.id === winnerId) ?? null) : null

  function toggle(movieId: string) {
    setWinnerId(null)
    setIncludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(movieId)) next.delete(movieId)
      else next.add(movieId)
      return next
    })
  }

  function draw() {
    if (pool.length === 0) return
    const choice = pool[Math.floor(Math.random() * pool.length)]
    setWinnerId(choice.id)
  }

  async function confirmWinner() {
    if (!winnerId) return
    setError('')
    setPending(true)
    try {
      await onPick(winnerId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule this movie.')
      setPending(false)
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>

        <div className="modal-header">
          <h2>Randomly pick a movie</h2>
        </div>

        <section className="modal-section">
          {candidates.length === 0 ? (
            <p className="empty-state">Every movie is already scheduled or watched. Nothing left to draw from.</p>
          ) : (
            <>
              <p className="modal-meta">Uncheck any movie to keep it out of the draw.</p>
              <div className="ranked-list">
                {candidates.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    subtitle={voteLabel(voteCounts.get(movie.id) ?? 0)}
                    trailing={
                      <label className="admin-form-checkbox">
                        <input type="checkbox" checked={includedIds.has(movie.id)} onChange={() => toggle(movie.id)} />
                      </label>
                    }
                  />
                ))}
              </div>

              {winner && (
                <p className="modal-meta">
                  Picked: <strong>{winner.title}</strong>
                </p>
              )}

              <div className="sunday-action-row">
                <button type="button" className="admin-form-submit" disabled={pool.length === 0} onClick={draw}>
                  {winner ? 'Draw again' : 'Draw'}
                </button>
                {winner && (
                  <button type="button" className="secondary-button" disabled={pending} onClick={() => void confirmWinner()}>
                    {pending ? 'Scheduling…' : 'Schedule this movie'}
                  </button>
                )}
              </div>
              {error && <p className="admin-form-error">{error}</p>}
            </>
          )}
        </section>
      </div>
    </ModalBackdrop>
  )
}
