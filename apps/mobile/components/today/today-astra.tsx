import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { getReturningInterval, getTodayAstraSlot } from '@orbit/shared/utils'
import { useProactiveItem } from '@/hooks/use-proactive-item'
import { useProfile } from '@/hooks/use-profile'
import { TodayAstraLine } from './today-astra-line'
import { TodayAISummary } from './today-ai-summary'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const line = getTodayAstraSlot({
    isTodaySelected, inDrillOrSurface: suppressed, item: proactive,
    returning: getReturningInterval(profile?.lastCompletionDate, profile?.timeZone),
  }, t)

  if (!line) return null
  if (line === 'summary') return <TodayAISummary date={today} />
  return <TodayAstraLine text={line.text} destination={line.destination} role={line.item ? 'button' : 'link'}
    onPress={() => { if (line.item) openItem(line.item); else router.navigate('/progress') }} />
}
