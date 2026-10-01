import { usePreventRemove } from 'expo-router/react-navigation'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { resolveHabitCreateReturnPath, resolveHabitDetailRouteDate } from '@orbit/shared/utils'
import { CreateHabitModal } from '@/components/habits/create-habit-modal'
import { useUIStore } from '@/stores/ui-store'
import { useOfflineSyncStore } from '@/stores/offline-sync-store'
import { getDroppedItemName, getRecoveryMessage } from '@/lib/offline-recovery'
import { useTranslation } from 'react-i18next'

function NativeHabitCreateGuard({ leaving, requestLeave }: Readonly<{ leaving: boolean; requestLeave: () => void }>) {
  usePreventRemove(!leaving, requestLeave)
  return null
}

export default function HabitCreateRoute() {
  const params = useLocalSearchParams<{ title?: string; date?: string; from?: string; origin?: string; recovery?: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const drop = useOfflineSyncStore((state) => state.drops.find((entry) => entry.id === params.recovery))
  const conversation = params.origin === 'conversation'
  function back() {
    if (conversation) useUIStore.getState().setAstraConversationOpen(true)
    if (router.canGoBack()) router.back()
    else router.replace(resolveHabitCreateReturnPath(params.from))
  }
  const recoveryMessage = drop ? getRecoveryMessage(drop.mutation, drop.itemName ?? getDroppedItemName(drop.mutation) ?? t('common.syncEntity.habits'), t) : undefined
  return <CreateHabitModal open presentation="screen" leaveGuard={NativeHabitCreateGuard} fromConversation={conversation}
    initialTitle={params.title} initialDate={resolveHabitDetailRouteDate(params.date)} recoveryMessage={recoveryMessage}
    onClose={back} onCreated={drop ? () => useOfflineSyncStore.getState().dismissDrop(drop.id) : undefined} />
}
