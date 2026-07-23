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

  // setNodeRef stays on the row itself (dnd-kit needs the whole row's position for
  // reordering) but attributes/listeners — the things that actually start a drag — go
  // only onto the poster button (see MovieCard), not the whole row. Putting them on
  // the whole row (as this used to) meant touch-action:none applied everywhere on it
  // too, so any vertical swipe meant to scroll past the card, not drag it, got
  // captured as a drag attempt instead, with no way to tell the two apart. No visible
  // handle icon needed — the poster itself, already there, is a small enough target.
  return (
    <div ref={setNodeRef} style={style}>
      <MovieCard
        movie={movie}
        rank={rank}
        onClick={onOpen}
        trailing={trailing}
        draggable
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
