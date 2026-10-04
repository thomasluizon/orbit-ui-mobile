import type { Announcements, UniqueIdentifier } from '@dnd-kit/core'
import type { useTranslations } from 'next-intl'

export function createDragAccessibility(
  t: ReturnType<typeof useTranslations>,
  getItemName: (id: UniqueIdentifier) => string | undefined,
  instructions = t('dragAndDrop.instructions'),
) {
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      const name = getItemName(active.id)
      return name === undefined ? undefined : t('dragAndDrop.pickedUp', { name })
    },
    onDragOver: ({ active, over }) => {
      const name = getItemName(active.id)
      if (name === undefined) return undefined
      if (!over) return t('dragAndDrop.movedOutside', { name })
      if (over.id === active.id) return undefined
      const target = getItemName(over.id)
      return target === undefined ? undefined : t('dragAndDrop.movedOver', { name, target })
    },
    onDragEnd: ({ active, over }) => {
      const name = getItemName(active.id)
      if (name === undefined) return undefined
      if (!over) return t('dragAndDrop.dropped', { name })
      const target = getItemName(over.id)
      return target === undefined ? undefined : t('dragAndDrop.droppedOver', { name, target })
    },
    onDragCancel: ({ active }) => {
      const name = getItemName(active.id)
      return name === undefined ? undefined : t('dragAndDrop.cancelled', { name })
    },
  }
  return { screenReaderInstructions: { draggable: instructions }, announcements }
}
