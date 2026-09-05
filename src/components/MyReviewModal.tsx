import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { AnimationEvent } from 'react'
import { useAppData } from '../state/AppDataContext'
import { debounce } from '../lib/debounce'
import { SUBRATING_KEYS, type Subratings } from '../types'
import { AutoResizeTextarea } from './AutoResizeTextarea'
import { ModalBackdrop } from './ModalBackdrop'
import { PosterImage } from './PosterImage'
import { SubratingSlider } from './SubratingSlider'

type OverlayPhase = 'closed' | 'opening' | 'open' | 'closing'
const OVERLAY_ANIMATION_MS = 220
const SAFETY_MARGIN_MS = 300

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

  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('closed')
  // The overlay's textarea is a completely separate DOM node from the collapsed one —
  // a fresh node has no memory of where the caret was, so it defaults to the very start
  // and reads as "jumping to the front." Carrying this one number across both directions
  // (open and close) is what keeps the caret exactly where you left it.
  const [carryCursorPos, setCarryCursorPos] = useState<number | null>(null)
  const collapsedTextareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayTextareaRef = useRef<HTMLTextAreaElement>(null)

  function openOverlay() {
    setCarryCursorPos(collapsedTextareaRef.current?.selectionStart ?? null)
    setOverlayPhase('opening')
  }

  function closeOverlay() {
    setCarryCursorPos(overlayTextareaRef.current?.selectionStart ?? null)
    setOverlayPhase('closing')
  }

  // Restore focus + caret the instant each textarea actually lands in the DOM — 'opening'
  // fires once when the overlay starts mounting, 'closed' fires once when it's gone and
  // the original field is back; neither re-fires just from the animation finishing since
  // that's a phase change to 'open'/'closing', not back to these two.
  useEffect(() => {
    if (overlayPhase !== 'opening') return
    const el = overlayTextareaRef.current
    if (!el) return
    el.focus()
    if (carryCursorPos !== null) el.selectionStart = el.selectionEnd = carryCursorPos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPhase])

  useEffect(() => {
    if (overlayPhase !== 'closed' || carryCursorPos === null) return
    const el = collapsedTextareaRef.current
    if (el) {
      el.focus()
      el.selectionStart = el.selectionEnd = carryCursorPos
    }
    setCarryCursorPos(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayPhase])

  function handleOverlayAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (overlayPhase === 'opening' && e.animationName === 'write-overlay-panel-in') setOverlayPhase('open')
    else if (overlayPhase === 'closing' && e.animationName === 'write-overlay-panel-out') setOverlayPhase('closed')
  }

  // Safety net matching the DotsSweepLoader/GunBarrelLoader pattern — forces the phase
  // forward if the real animationend never arrives, so the overlay can't get stuck.
  useEffect(() => {
    if (overlayPhase !== 'opening' && overlayPhase !== 'closing') return
    const next = overlayPhase === 'opening' ? 'open' : 'closed'
    const timer = setTimeout(() => setOverlayPhase((p) => (p === overlayPhase ? next : p)), OVERLAY_ANIMATION_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [overlayPhase])

  useEffect(() => {
    setDraft(toDraft(savedReview))
    setSaveStatus('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // First Escape backs out of expanded view instead of closing outright —
      // closing immediately from a full-screen writing session would be an
      // easy way to lose the sense of where you are, even though nothing's
      // actually lost (autosave already has it).
      if (overlayPhase !== 'closed') closeOverlay()
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, overlayPhase])

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
    <Fragment>
      <ModalBackdrop onClose={onClose}>
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
                <span className="review-text-field-actions">
                  <SaveStatusLabel status={saveStatus} />
                  <button type="button" className="review-expand-toggle" onClick={openOverlay}>
                    Expand
                  </button>
                </span>
              </span>
              <AutoResizeTextarea
                ref={collapsedTextareaRef}
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
                  onChange={(value) => {
                    const nextSubratings = { ...draft.subratings }
                    if (value === undefined) delete nextSubratings[key]
                    else nextSubratings[key] = value
                    updateDraft({ ...draft, subratings: nextSubratings })
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      </ModalBackdrop>

      {overlayPhase !== 'closed' && (
        // A dedicated popup, not a grown modal — the whole point is to make writing the
        // one thing on screen. It's a sibling of the review modal (not nested inside it)
        // so a click on its own backdrop can collapse just the overlay without also
        // closing the whole review. ModalBackdrop (not a raw onClick) is what keeps a
        // text-selection drag that slips past this backdrop's edge from doing that too.
        <ModalBackdrop className={`write-overlay-backdrop write-overlay-backdrop-${overlayPhase}`} onClose={closeOverlay}>
          <div className="write-overlay-panel" onClick={(e) => e.stopPropagation()} onAnimationEnd={handleOverlayAnimationEnd}>
            <div className="write-overlay-header">
              <span className="write-overlay-title">{movie.title}</span>
              <span className="review-text-field-actions">
                <SaveStatusLabel status={saveStatus} />
                <button type="button" className="review-expand-toggle" onClick={closeOverlay}>
                  Done
                </button>
              </span>
            </div>
            <AutoResizeTextarea
              ref={overlayTextareaRef}
              value={draft.text}
              onChange={(e) => updateDraft({ ...draft, text: e.target.value })}
              placeholder="Add your thoughts on this film"
              autosize={false}
              className="write-overlay-textarea"
            />
          </div>
        </ModalBackdrop>
      )}
    </Fragment>
  )
}

function SaveStatusLabel({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  if (status === 'pending') return <span className="save-status">Saving…</span>
  if (status === 'error') return <span className="save-status save-status-error">Couldn't save, check your connection</span>
  return <span className="save-status save-status-saved">Saved</span>
}
