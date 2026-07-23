import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent } from 'react'
import bloodSrc from '../assets/gunbarrel/blood.webp'

// Mirrors the longer of the two CSS durations (see .blood-wipe-covering / -revealing
// in index.css) — only used as the safety-net fallback below, not the primary driver.
const WIPE_MS = 900
const SAFETY_MARGIN_MS = 500

type Phase = 'covering' | 'revealing'

interface BloodWipeTransitionProps {
  // Fired the instant the screen is fully covered — swap whatever page/content is
  // underneath here, invisibly, before the reveal half starts.
  onCovered: () => void
  onDone: () => void
}

// A translucent red wash drips down from the top to fully cover the screen, then
// keeps falling — draining off the bottom — to reveal whatever onCovered swapped in
// underneath. Used for page-level transitions (see App.tsx) where content change
// should happen entirely out of sight instead of a visible cut or cross-fade.
// Phase transitions are driven by the real
// animationend event rather than a guessed setTimeout, same reasoning as
// DotsSweepLoader/GunBarrelLoader: the CSS clock and a parallel JS clock can
// drift under load, so listening to the real event removes the second clock.
export function BloodWipeTransition({ onCovered, onDone }: BloodWipeTransitionProps) {
  const [phase, setPhase] = useState<Phase>('covering')
  const onCoveredRef = useRef(onCovered)
  onCoveredRef.current = onCovered
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  function handleAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    if (phase === 'covering' && e.animationName === 'blood-wipe-reveal') {
      onCoveredRef.current()
      setPhase('revealing')
    } else if (phase === 'revealing' && e.animationName === 'blood-wipe-drain') {
      onDoneRef.current()
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (phase === 'covering') {
        onCoveredRef.current()
        setPhase('revealing')
      } else {
        onDoneRef.current()
      }
    }, WIPE_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div
      className={`blood-wipe blood-wipe-${phase}`}
      style={{ backgroundImage: `url(${bloodSrc})` }}
      role="presentation"
      onAnimationEnd={handleAnimationEnd}
    />
  )
}
