import { useState } from 'react'
import type { MovieRecord } from '../lib/dataClient'

interface PosterImageProps {
  movie: MovieRecord
  size?: 'sm' | 'lg'
}

export function PosterImage({ movie, size = 'sm' }: PosterImageProps) {
  const [failed, setFailed] = useState(false)
  const showPlaceholder = !movie.posterUrl || failed

  if (showPlaceholder) {
    return (
      <span className={`poster poster-placeholder poster-${size}`} aria-hidden="true">
        {initials(movie.title)}
      </span>
    )
  }

  return (
    <img
      className={`poster poster-${size}`}
      src={movie.posterUrl ?? undefined}
      alt={`${movie.title} poster`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

function initials(title: string): string {
  return title
    .split(' ')
    .filter((w) => w.length > 0 && /[a-zA-Z0-9]/.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
