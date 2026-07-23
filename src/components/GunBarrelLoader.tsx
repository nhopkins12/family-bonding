import { useEffect, useRef, useState } from 'react'
import barrelSrc from '../assets/gunbarrel/barrel.webp'
import dotSrc from '../assets/gunbarrel/dot.webp'

// Minimum time before the barrel is allowed to open — just past the 0.85s pan
// animation below, so it always finishes centering before it's allowed to leave.
const PLAY_DURATION_MS = 1050

type Phase = 'playing' | 'holding' | 'leaving'

interface GunBarrelLoaderProps {
  loading: boolean
  onFinish: () => void
}

export function GunBarrelLoader({ loading, onFinish }: GunBarrelLoaderProps) {
  const [phase, setPhase] = useState<Phase>('playing')

  // Parent typically passes an inline callback, so a fresh identity lands on
  // every re-render of App (e.g. from auth-state polling). Reading it via ref
  // keeps this effect from depending on it, so the unmount timer isn't
  // endlessly cleared and restarted before it ever gets to fire.
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  useEffect(() => {
    const timer = setTimeout(() => setPhase((p) => (p === 'playing' ? 'holding' : p)), PLAY_DURATION_MS)
    return () => clearTimeout(timer)
  }, [])

  // Split in two: the first effect only decides *whether* to leave, the second
  // only fires the unmount timer once we're actually in the 'leaving' phase.
  // Combining both in one [phase, loading]-keyed effect caused setPhase('leaving')
  // to immediately re-run the effect and clear the timer before it ever fired.
  useEffect(() => {
    if (phase !== 'holding' || loading) return
    setPhase('leaving')
  }, [phase, loading])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = setTimeout(() => onFinishRef.current(), 500)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <div className={`gunbarrel gunbarrel-${phase}`} role="status" aria-label="Loading Family Bonding">
      <img className="gunbarrel-dot" src={dotSrc} alt="" aria-hidden="true" />
      <img className="gunbarrel-barrel" src={barrelSrc} alt="" aria-hidden="true" />
    </div>
  )
}
