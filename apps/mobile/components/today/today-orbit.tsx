import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { getOrbitRest } from '@orbit/shared/chat'
import { getReturningInterval, getTodayOrbitSlot } from '@orbit/shared/utils'
import { useOffline } from '@/hooks/use-offline'
import { useProactiveItem } from '@/hooks/use-proactive-item'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { TodayOrbitLine } from './today-orbit-line'
import { TodayAISummary } from './today-ai-summary'

interface TodayOrbitProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayOrbit({ today, isTodaySelected, suppressed }: Readonly<TodayOrbitProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const { isOnline } = useOffline()
  const rest = getOrbitRest({ isOnline, profile })
  const line = getTodayOrbitSlot({
    isTodaySelected, inDrillOrSurface: suppressed, item: proactive, 
    returning: getReturningInterval(profile?.lastCompletionDate, profile?.timeZone),
  }, t)

  if (!line) return null
  if (rest && line !== 'summary') return <TodayOrbitLine mascotState="descansando" text={t(rest)} destination={t('todayOrbit.openConversation')} onPress={() => useUIStore.getState().setOrbitConversationOpen(true)} />
  if (line === 'summary') return <TodayAISummary date={today} />
  return <TodayOrbitLine text={line.text} destination={line.destination} role={line.item ? 'button' : 'link'}
    onPress={() => { if (line.item) openItem(line.item); else router.navigate('/progress') }} />
}
