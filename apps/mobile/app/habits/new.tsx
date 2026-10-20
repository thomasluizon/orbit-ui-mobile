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

function firstParam(value: string | string[] | null | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

export default function HabitCreateRoute() {
  const params = useLocalSearchParams<{ title?: string | string[]; date?: string | string[]; from?: string | string[]; origin?: string | string[]; recovery?: string | string[] }>()
  const router = useRouter()
  const { t } = useTranslation()
  const drop = useOfflineSyncStore((state) => state.drops.find((entry) => entry.id === firstParam(params.recovery)))
  const conversation = firstParam(params.origin) === 'conversation'
  function back() {
    if (conversation) useUIStore.getState().setAstraConversationOpen(true)
    if (router.canGoBack()) router.back()
    else router.replace(resolveHabitCreateReturnPath(firstParam(params.from)))
  }
  const recoveryMessage = drop ? getRecoveryMessage(drop.mutation, drop.itemName ?? getDroppedItemName(drop.mutation) ?? t('common.syncEntity.habits'), t) : undefined
  return <CreateHabitModal open presentation="screen" leaveGuard={NativeHabitCreateGuard} fromConversation={conversation}
    initialTitle={firstParam(params.title)} initialDate={resolveHabitDetailRouteDate(params.date)} recoveryMessage={recoveryMessage}
    onClose={back} onCreated={drop ? () => useOfflineSyncStore.getState().dismissDrop(drop.id) : undefined} />
}
