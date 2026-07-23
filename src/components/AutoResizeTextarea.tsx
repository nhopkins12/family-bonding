import { useLayoutEffect, useRef } from 'react'
import type { TextareaHTMLAttributes } from 'react'

/**
 * Grows with content instead of scrolling internally or relying on the browser's manual
 * drag-corner resize handle — which has no awareness of the modal it sits in and lets you
 * drag a textarea wider/taller than its container. Caps out at a max height (see
 * .autoresize-textarea in index.css) so one extremely long review can't blow out the
 * whole modal; beyond that it scrolls like normal.
 */
export function AutoResizeTextarea({ value, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={className ? `autoresize-textarea ${className}` : 'autoresize-textarea'}
      {...rest}
    />
  )
}
