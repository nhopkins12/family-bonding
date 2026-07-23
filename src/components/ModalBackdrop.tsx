import { useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'

interface ModalBackdropProps {
  className?: string
  onClose: () => void
  children: ReactNode
}

/**
 * A backdrop that closes on click — but only a real click on the backdrop itself, not a
 * text-selection drag that starts inside the modal and happens to release outside it.
 * A plain onClick={onClose} closes the modal any time the mouse comes UP over the
 * backdrop, including mid-selection: dragging to select a review's text and slipping a
 * few pixels past the modal's edge (easy to do near the top/bottom) would fire a click
 * on the backdrop and slam the modal shut. Tracking mousedown and mouseup separately —
 * both have to land on the backdrop itself, not just bubble from a child — fixes that
 * without losing click-outside-to-close.
 */
export function ModalBackdrop({ className, onClose, children }: ModalBackdropProps) {
  const pressedSelf = useRef(false)

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    pressedSelf.current = e.target === e.currentTarget
  }

  function handleMouseUp(e: MouseEvent<HTMLDivElement>) {
    if (pressedSelf.current && e.target === e.currentTarget) onClose()
    pressedSelf.current = false
  }

  return (
    <div className={className ?? 'modal-backdrop'} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      {children}
    </div>
  )
}
