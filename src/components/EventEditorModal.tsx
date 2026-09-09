import { useState } from 'react'
import type { MovieRecord, MovieWatchRecord } from '../lib/dataClient'
import { todayKey } from '../lib/watchDates'
import { ModalBackdrop } from './ModalBackdrop'

export type EventKind = 'movie' | 'voting' | 'skipped'

export interface EventForm {
  dateKey: string
  kind: EventKind
  movieId: string
  watched: boolean
  notes: string
}

interface EventEditorModalProps {
  dateKey: string
  watch: MovieWatchRecord | null
  movies: MovieRecord[]
  watchesByMovieId: Map<string, MovieWatchRecord>
  onSave: (form: EventForm) => Promise<void>
  onDelete: () => Promise<boolean>
  onClose: () => void
}

function isWatchedRecord(watch: MovieWatchRecord) {
  return Boolean(watch.watchedAt || watch.status === 'watched')
}

function deleteLabel(watch: MovieWatchRecord | null) {
  if (!watch) return null
  if (watch.status === 'voting') return 'Reset to next Sunday'
  if (watch.status === 'skipped') return 'Undo skip'
  return 'Delete'
}

/**
 * The one place an admin adds, edits, relocates, or removes anything on the
 * calendar — a real movie, an open vote slot, or a deliberate skip are all just
 * different answers to "what's happening on this date," edited from the same form
 * instead of three separate stacked ones.
 */
export function EventEditorModal({ dateKey, watch, movies, watchesByMovieId, onSave, onDelete, onClose }: EventEditorModalProps) {
  const [dateDraft, setDateDraft] = useState(dateKey)
  const [movieIdDraft, setMovieIdDraft] = useState(watch?.movieId ?? '')
  const [kindDraft, setKindDraft] = useState<'voting' | 'skipped'>(watch?.status === 'skipped' ? 'skipped' : 'voting')
  const [watchedDraft, setWatchedDraft] = useState(watch ? isWatchedRecord(watch) : false)
  const [notesDraft, setNotesDraft] = useState(watch?.notes ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const removeLabel = deleteLabel(watch)

  async function handleSave() {
    setError('')
    setPending(true)
    try {
      await onSave({
        dateKey: dateDraft,
        kind: movieIdDraft ? 'movie' : kindDraft,
        movieId: movieIdDraft,
        watched: watchedDraft,
        notes: notesDraft.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this event.')
      setPending(false)
    }
  }

  async function handleDelete() {
    setError('')
    setPending(true)
    try {
      const proceeded = await onDelete()
      if (proceeded) onClose()
      else setPending(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this event.')
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
          <h2>{watch ? 'Edit event' : 'Add event'}</h2>
        </div>

        <section className="modal-section">
          <form
            className="admin-form"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSave()
            }}
          >
            <label>
              Date
              <input
                type="date"
                value={dateDraft}
                onChange={(e) => {
                  const nextDate = e.target.value
                  setDateDraft(nextDate)
                  if (watchedDraft && nextDate > todayKey()) setWatchedDraft(false)
                }}
                required
              />
            </label>

            <label>
              Movie
              <select value={movieIdDraft} onChange={(e) => setMovieIdDraft(e.target.value)}>
                <option value="">No movie — open slot</option>
                {movies.map((movie) => {
                  const existingWatch = watchesByMovieId.get(movie.id)
                  const watchLabel = existingWatch ? (isWatchedRecord(existingWatch) ? 'watched' : 'scheduled') : null
                  return (
                    <option key={movie.id} value={movie.id}>
                      {movie.title}
                      {watchLabel ? ` (${watchLabel})` : ''}
                    </option>
                  )
                })}
              </select>
            </label>

            {movieIdDraft && watch?.movieId && <p className="sunday-muted">Changing the movie here replaces this event.</p>}

            {!movieIdDraft && (
              <div className="admin-form-radio-group">
                <label className="admin-form-checkbox">
                  <input type="radio" name="event-kind" checked={kindDraft === 'voting'} onChange={() => setKindDraft('voting')} />
                  Open for voting
                </label>
                <label className="admin-form-checkbox">
                  <input type="radio" name="event-kind" checked={kindDraft === 'skipped'} onChange={() => setKindDraft('skipped')} />
                  Skip this day, no movie night
                </label>
              </div>
            )}

            {movieIdDraft && dateDraft <= todayKey() && (
              <label className="admin-form-checkbox">
                <input type="checkbox" checked={watchedDraft} onChange={(e) => setWatchedDraft(e.target.checked)} />
                Watched
              </label>
            )}

            <label>
              Notes
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={3} placeholder="Optional" />
            </label>

            <div className="sunday-action-row">
              <button type="submit" className="admin-form-submit" disabled={pending}>
                Save
              </button>
              {removeLabel && (
                <button type="button" className="unrank-button" disabled={pending} onClick={() => void handleDelete()}>
                  {removeLabel}
                </button>
              )}
            </div>
            {error && <p className="admin-form-error">{error}</p>}
          </form>
        </section>
      </div>
    </ModalBackdrop>
  )
}
