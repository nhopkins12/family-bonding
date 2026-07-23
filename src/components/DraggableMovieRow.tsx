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
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? 'var(--shadow-md)' : undefined,
    borderRadius: isDragging ? 'var(--radius)' : undefined,
    zIndex: isDragging ? 1 : undefined,
    position: 'relative' as const,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MovieCard movie={movie} rank={rank} onClick={onOpen} trailing={trailing} draggable />
    </div>
  )
}
