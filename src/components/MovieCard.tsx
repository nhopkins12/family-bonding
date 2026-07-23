import type { ReactNode } from 'react'
import type { MovieRecord } from '../lib/dataClient'
import { PosterImage } from './PosterImage'

interface MovieCardProps {
  movie: MovieRecord
  rank?: number
  subtitle?: string
  trailing?: ReactNode
  onClick?: () => void
  draggable?: boolean
  overlay?: boolean
}

export function MovieCard({ movie, rank, subtitle, trailing, onClick, draggable, overlay }: MovieCardProps) {
  const className = ['movie-card', draggable && 'movie-card-draggable', overlay && 'movie-card-overlay'].filter(Boolean).join(' ')
  return (
    <div className={className}>
      {rank !== undefined && <span className="rank-badge">{rank}</span>}
      <button type="button" className="movie-card-main" onClick={onClick}>
        <PosterImage movie={movie} size="sm" />
        <span className="movie-card-info">
          <span className="movie-card-title">{movie.title}</span>
          <span className="movie-card-meta">
            {movie.year} · {movie.actor}
          </span>
          {subtitle && <span className="movie-card-subtitle">{subtitle}</span>}
        </span>
      </button>
      {trailing && <span className="movie-card-trailing">{trailing}</span>}
    </div>
  )
}
