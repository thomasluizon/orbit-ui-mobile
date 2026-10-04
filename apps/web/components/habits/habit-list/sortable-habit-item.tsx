'use client'

import { useTranslations } from 'next-intl'
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
  const t = useTranslations()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isItemDragging,
  } = useSortable({ id, attributes: { roleDescription: t('dragAndDrop.roleDescription') } })

  const sensorListeners = listeners as Record<string, React.EventHandler<React.SyntheticEvent<HTMLElement>>> | undefined
  const rowListeners = Object.fromEntries(
    Object.entries(sensorListeners ?? {}).map(([eventName, activate]) => [eventName, (event: React.SyntheticEvent<HTMLElement>) => {
      if (event.target instanceof Node && event.currentTarget.contains(event.target)) activate(event)
    }]),
  )

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isItemDragging ? 0.5 : 1,
    position: 'relative' as const,
    zIndex: isItemDragging ? 1 : 'auto',
  }

  return (
    <div ref={setNodeRef} className="orbit-focus-inset rounded-[20px]" style={style} {...attributes} {...rowListeners}>
      {children}
    </div>
  )
}
