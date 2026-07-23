import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from '../state/AppDataContext'
import { debounce } from '../lib/debounce'
import { SUBRATING_KEYS, type Subratings } from '../types'
import { AutoResizeTextarea } from './AutoResizeTextarea'
import { PosterImage } from './PosterImage'
import { SubratingSlider } from './SubratingSlider'

interface MyReviewModalProps {
  movieId: string
  onClose: () => void
}

interface Draft {
  text: string
  subratings: Subratings
}

function toDraft(review: { text?: string | null; [key: string]: unknown } | undefined): Draft {
  if (!review) return { text: '', subratings: {} }
  const subratings: Subratings = {}
  for (const key of SUBRATING_KEYS) {
    const value = review[key]
    if (typeof value === 'number') subratings[key] = value
  }
  return { text: review.text ?? '', subratings }
}

type SaveStatus = 'idle' | 'pending' | 'saved' | 'error'

export function MyReviewModal({ movieId, onClose }: MyReviewModalProps) {
  const { movies, myReviewsByMovieId, setMyReview } = useAppData()
  const movie = movies.find((m) => m.id === movieId)
  const savedReview = myReviewsByMovieId.get(movieId)
  const [draft, setDraft] = useState<Draft>(() => toDraft(savedReview))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  useEffect(() => {
    setDraft(toDraft(savedReview))
    setSaveStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Slider drags fire onChange continuously — write instantly to local state for a
  // smooth visual, but only push to the network ~350ms after the user stops moving it,
  // so one drag produces one saved value instead of one write per tick. The status
  // label gives reassurance that a long review is actually being saved as you write it,
  // rather than silently trusting a background debounce.
  const debouncedSave = useMemo(
    () =>
      debounce((next: Draft) => {
        setMyReview(movieId, next)
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('error'))
      }, 350),
    [movieId, setMyReview],
  )
  const debouncedSaveRef = useRef(debouncedSave)
  debouncedSaveRef.current = debouncedSave

  useEffect(() => () => debouncedSaveRef.current.cancel(), [])

  function updateDraft(next: Draft) {
    setDraft(next)
    setSaveStatus('pending')
    debouncedSaveRef.current(next)
  }

  if (!movie) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          Close
        </button>

        <div className="modal-header">
          <PosterImage movie={movie} size="lg" />
          <div>
            <h2>{movie.title}</h2>
            <p className="modal-meta">
              {movie.year} · {movie.actor}
            </p>
          </div>
        </div>

        <section className="modal-section">
          <label className="review-text-field">
            <span className="review-text-field-header">
              Written review
              <SaveStatusLabel status={saveStatus} />
            </span>
            <AutoResizeTextarea
              value={draft.text}
              onChange={(e) => updateDraft({ ...draft, text: e.target.value })}
              placeholder="Add your thoughts on this film"
            />
          </label>

          <div className="subrating-grid">
            {SUBRATING_KEYS.map((key) => (
              <SubratingSlider
                key={key}
                subratingKey={key}
                value={draft.subratings[key]}
                onChange={(value) => updateDraft({ ...draft, subratings: { ...draft.subratings, [key]: value } })}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  if (status === 'pending') return <span className="save-status">Saving…</span>
  if (status === 'error') return <span className="save-status save-status-error">Couldn't save — check your connection</span>
  return <span className="save-status save-status-saved">Saved</span>
}
