import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { MovieRecord } from '../lib/dataClient'
import { MovieCard } from './MovieCard'

interface DraggableMovieRowProps {
  movie: MovieRecord
  rank?: number
  onOpen: () => void
  trailing: ReactNode
}

export function DraggableMovieRow({ movie, rank, onOpen, trailing }: DraggableMovieRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: movie.id,
    // Slightly snappier and less linear than dnd-kit's default (250ms ease) — the
    // default reads as sluggish/mechanical when a row has to travel a long way
    // down the list; this settles quickly but decelerates smoothly instead of
    // stopping abruptly.
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  })

  // A real DragOverlay (see RankingBoard) now renders the floating, pointer-following
  // card, so the original spot just needs to read as "this card is lifted out of here"
  // — a faint placeholder, not a second copy of the card fighting the overlay for
  // attention.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MovieCard movie={movie} rank={rank} onClick={onOpen} trailing={trailing} draggable />
    </div>
  )
}
