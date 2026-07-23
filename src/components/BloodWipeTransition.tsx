import { useEffect, useRef } from 'react'
import bloodSrc from '../assets/gunbarrel/blood.webp'

const DURATION_MS = 650

interface BloodWipeTransitionProps {
  onDone?: () => void
}

// Standalone transition, not wired into any flow yet: a red wash drips down
// from the top of the screen (real overlay artwork, same template pack as the
// gun-barrel loader) and covers it, then calls onDone once fully covered.
export function BloodWipeTransition({ onDone }: BloodWipeTransitionProps) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current?.(), DURATION_MS)
    return () => clearTimeout(timer)
  }, [])

  return <div className="blood-wipe" style={{ backgroundImage: `url(${bloodSrc})` }} role="presentation" />
}
