import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent, TransitionEvent } from 'react'
import barrelSrc from '../assets/gunbarrel/barrel.webp'
import dotSrc from '../assets/gunbarrel/dot.webp'

// Phase transitions are driven by the browser's own animationend/transitionend
// events on the barrel image and the overlay itself, NOT a parallel setTimeout
// guessing the same duration — see DotsSweepLoader for the full rationale
// (a setTimeout clock and a CSS animation clock can drift apart under load,
// e.g. a page load competing with webfont/image loading for the main thread).
// Below are safety-net-only durations, generous margins past the real CSS
// durations (0.85s pan, 0.5s open) so they never preempt the real event on a
// normal run — they only fire if that event never arrives at all.
const PAN_MS = 850
const OPEN_MS = 500
const SAFETY_MARGIN_MS = 900

type Phase = 'playing' | 'holding' | 'leaving'

interface GunBarrelLoaderProps {
  loading: boolean
  onFinish: () => void
}

export function GunBarrelLoader({ loading, onFinish }: GunBarrelLoaderProps) {
  const [phase, setPhase] = useState<Phase>('playing')

  // Parent typically passes an inline callback, so a fresh identity lands on
  // every re-render of App (e.g. from auth-state polling). Reading it via ref
  // keeps effects from depending on it, so timers/handlers aren't endlessly
  // recreated.
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const loadingRef = useRef(loading)
  loadingRef.current = loading

  function handleBarrelAnimationEnd(e: AnimationEvent<HTMLImageElement>) {
    // .gunbarrel-leaving re-declares gb-pan alongside gb-open (see CSS) so the
    // whole `animation` list restarts and gb-pan's animationend fires a SECOND
    // time during leaving — guard on phase so that late firing can't bounce
    // us back from 'leaving' to 'holding'.
    if (e.animationName !== 'gb-pan' || phase !== 'playing') return
    // Loading might already be finished by the time the pan completes, in
    // which case skip the hold entirely and go straight to leaving.
    setPhase(loadingRef.current ? 'holding' : 'leaving')
  }

  function handleContainerTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== 'opacity' || phase !== 'leaving') return
    onFinishRef.current()
  }

  // Once holding, there's no DOM event to wait on — `loading` flipping false
  // is the only trigger, so this one genuinely is a plain state watcher.
  if (phase === 'holding' && !loading) {
    setPhase('leaving')
  }

  // Safety nets: if the real animationend/transitionend never arrives (e.g. a
  // dev-server cold-load CSS race), these force the phase forward anyway
  // after a generous margin, so the splash can never get permanently stuck —
  // it just skips straight to the next phase without the flourish that load
  // happened to miss.
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = setTimeout(() => {
      setPhase((p) => (p === 'playing' ? (loadingRef.current ? 'holding' : 'leaving') : p))
    }, PAN_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = setTimeout(() => onFinishRef.current(), OPEN_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div
      className={`gunbarrel gunbarrel-${phase}`}
      role="status"
      aria-label="Loading Family Bonding"
      onTransitionEnd={handleContainerTransitionEnd}
    >
      <img className="gunbarrel-dot" src={dotSrc} alt="" aria-hidden="true" />
      <img className="gunbarrel-barrel" src={barrelSrc} alt="" aria-hidden="true" onAnimationEnd={handleBarrelAnimationEnd} />
    </div>
  )
}
