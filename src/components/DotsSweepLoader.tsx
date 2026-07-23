import { useEffect, useRef, useState } from 'react'
import type { AnimationEvent, CSSProperties, TransitionEvent } from 'react'

// A single leader dot travels left (0%) toward the last stamp position (not
// the literal screen edge — see lastPos below). Each stamp flashes in the
// instant the leader's center is exactly over it (flush with it for that one
// frame, no fade-in), then fades out on its own as the leader moves on to
// the next one — a comet trail, not a permanent row of dots. Once the leader
// reaches that last stamp, if `loading` is still true it holds there until
// loading finishes, then a growing hole (not a filled color — see
// .dots-sweep-hole) punches through the black, right at that same spot, to
// reveal the real page already mounted behind it.
//
// Phase transitions are driven by the browser's own animationend/
// transitionend events on the leader/hole, NOT a parallel setTimeout guessing
// the same duration. A setTimeout starts counting the instant this component
// mounts, but the CSS animation only starts once the browser actually gets
// around to painting it — usually the same instant, but not guaranteed,
// especially on a page load that's also competing for the main thread with
// webfont/image loading. That gap is exactly what caused "sometimes the
// timing gets thrown off": the JS clock and the CSS clock would drift out of
// sync under load even though each was individually correct. Listening for
// the real DOM event removes the second clock entirely.
const STAMP_COUNT = 5
// Mirrored as a literal value in the CSS below (search "1600") since CSS
// keyframe delays can't reference JS.
const TRAVEL_MS = 1600
// Matches the CSS transition duration for the hole grow / leader fade — see
// .dots-sweep-leaving rules. Only used below for the safety-net margin, not
// as a primary timer.
const BLOOM_MS = 700
// Safety net only, not the primary driver — see the two "safety net" effects
// below. Generous margin past the real CSS durations (1600ms move, 700ms
// bloom) so it never preempts the real event on a normal run; it only ever
// fires if that event never arrives at all (e.g. a dev-server cold-load CSS
// race where the animation never actually got applied to the element).
const SAFETY_MARGIN_MS = 900

type Phase = 'playing' | 'holding' | 'leaving'

interface DotsSweepLoaderProps {
  loading?: boolean
  onDone?: () => void
}

export function DotsSweepLoader({ loading = false, onDone }: DotsSweepLoaderProps) {
  const [phase, setPhase] = useState<Phase>('playing')
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const loadingRef = useRef(loading)
  loadingRef.current = loading

  function handleLeaderAnimationEnd(e: AnimationEvent<HTMLDivElement>) {
    // phase !== 'playing' guards against a second animationend for the same
    // animation name — doesn't happen with the current CSS (.dots-sweep-leaving
    // clears the animation with `animation: none` instead of re-declaring
    // dots-sweep-leader-move), but GunBarrelLoader hit exactly that bug when a
    // later phase's CSS re-listed the same keyframe name, restarting the whole
    // `animation` list and re-firing this handler. Keeping the guard here too
    // means the same mistake can't silently reintroduce it later.
    if (e.animationName !== 'dots-sweep-leader-move' || phase !== 'playing') return
    // Loading might already be finished by the time the leader arrives, in
    // which case skip the hold entirely and go straight to leaving.
    setPhase(loadingRef.current ? 'holding' : 'leaving')
  }

  function handleHoleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== 'width' || phase !== 'leaving') return
    onDoneRef.current?.()
  }

  // Once holding, there's no DOM event to wait on — `loading` flipping false
  // is the only trigger, so this one genuinely is a plain state watcher.
  if (phase === 'holding' && !loading) {
    setPhase('leaving')
  }

  // Safety nets: if the real animationend/transitionend never arrives (the
  // dev-server cold-load CSS race described above), these force the phase
  // forward anyway after a generous margin, so the splash can never get
  // permanently stuck on a bad load — it just skips straight to the next
  // phase without the visual flourish that load happened to miss.
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = setTimeout(() => {
      setPhase((p) => (p === 'playing' ? (loadingRef.current ? 'holding' : 'leaving') : p))
    }, TRAVEL_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = setTimeout(() => onDoneRef.current?.(), BLOOM_MS + SAFETY_MARGIN_MS)
    return () => clearTimeout(timer)
  }, [phase])

  const stampPositions = Array.from({ length: STAMP_COUNT }, (_, i) => ((i + 1) / (STAMP_COUNT + 1)) * 100)
  const lastPos = stampPositions[stampPositions.length - 1]
  const leaderStyle = { '--leader-end': `${lastPos}%` } as CSSProperties

  return (
    <div className={`dots-sweep dots-sweep-${phase}`} role="status" aria-label="Loading">
      <div className="dots-sweep-hole" style={{ left: `${lastPos}%` }} onTransitionEnd={handleHoleTransitionEnd} />
      {stampPositions.map((pos) => (
        // Leader travels 0% -> lastPos% (not 0% -> 100%) over TRAVEL_MS, so
        // the time it's exactly over a given stamp is (pos / lastPos) *
        // TRAVEL_MS, not (pos / 100) * TRAVEL_MS — that mismatch was the bug
        // behind every stamp appearing later than the leader actually passed it.
        <div
          key={pos}
          className="dots-sweep-stamp"
          style={{ left: `${pos}%`, animationDelay: `${(pos / lastPos) * TRAVEL_MS}ms` }}
        />
      ))}
      <div className="dots-sweep-leader" style={leaderStyle} onAnimationEnd={handleLeaderAnimationEnd} />
    </div>
  )
}
