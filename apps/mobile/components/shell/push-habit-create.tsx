import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { HABIT_CREATE_OVERLAY_ID, buildHabitCreateHref } from '@orbit/shared/utils'
import { useUIStore } from '@/stores/ui-store'

/** Opens the create screen on the press that raised `showCreateModal`, wherever the press came from, as web's root layout does. */
export function PushHabitCreate({ pathname, date }: Readonly<{
  pathname: string
  date: string | null
}>) {
  const router = useRouter()
  const showCreateModal = useUIStore((state) => state.showCreateModal)
  useEffect(() => {
    const store = useUIStore.getState()
    if (!showCreateModal || !store.showCreateModal) return
    const conversation = store.astraConversationOpen
    store.registerOpenOverlay(HABIT_CREATE_OVERLAY_ID)
    store.setShowCreateModal(false)
    store.setAstraConversationOpen(false)
    router.push(buildHabitCreateHref({ date, from: pathname, conversation }))
  }, [date, pathname, router, showCreateModal])
  return null
}
