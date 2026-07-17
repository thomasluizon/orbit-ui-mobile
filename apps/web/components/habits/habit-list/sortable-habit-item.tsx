'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/** @dnd-kit sortable wrapper for a single habit row. Web-only — mobile uses a
 *  DraggableFlatList instead. Applies the drag transform/transition and dims
 *  the row while it's being dragged. */
export function SortableHabitItem({
  id,
  children,
}: Readonly<{
  id: string
  children: React.ReactNode
}>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isItemDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isItemDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isItemDragging ? 50 : 'auto',
    ...(isItemDragging
      ? {
          background: 'var(--bg-card)',
          boxShadow: 'inset 0 0 0 1px var(--hairline-strong)',
          borderRadius: 18,
        }
      : {}),
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  )
}
