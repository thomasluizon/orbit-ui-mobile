import { useRef } from 'react'
import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import type { useTranslations } from 'next-intl'

export function useDragAccessibility(
  t: ReturnType<typeof useTranslations>,
  getItemName: (id: UniqueIdentifier) => string | undefined,
  instructions = t('dragAndDrop.instructions'),
) {
  const hasLeftStart = useRef(false)
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      hasLeftStart.current = false
      const name = getItemName(active.id)
      return name === undefined ? undefined : t('dragAndDrop.pickedUp', { name })
    },
    onDragOver: ({ active, over }) => {
      const name = getItemName(active.id)
      if (name === undefined) return undefined
      if (over?.id === active.id) {
        return hasLeftStart.current ? t('dragAndDrop.returnedToStart', { name }) : undefined
      }
      hasLeftStart.current = true
      if (!over) return t('dragAndDrop.movedOutside', { name })
      const target = getItemName(over.id)
      return target === undefined ? undefined : t('dragAndDrop.movedOver', { name, target })
    },
    onDragEnd: ({ active, over }) => {
      hasLeftStart.current = false
      const name = getItemName(active.id)
      if (name === undefined) return undefined
      if (!over) return t('dragAndDrop.dropped', { name })
      if (over.id === active.id) return t('dragAndDrop.droppedInPlace', { name })
      const target = getItemName(over.id)
      return target === undefined ? undefined : t('dragAndDrop.droppedOver', { name, target })
    },
    onDragCancel: ({ active }) => {
      hasLeftStart.current = false
      const name = getItemName(active.id)
      return name === undefined ? undefined : t('dragAndDrop.cancelled', { name })
    },
  }
  return { screenReaderInstructions: { draggable: instructions }, announcements }
}
