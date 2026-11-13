'use client'

import { useTranslations } from 'next-intl'
import { getReturningInterval, getTodayAstraRest, getTodayAstraSlot } from '@orbit/shared/utils'
import { useFlag } from '@/hooks/use-flag'
import { useOffline } from '@/hooks/use-offline'
import { useProactiveItem } from '@/hooks/use-proactive-item'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { TodayAstraLine } from './today-astra-line'
import { TodayAISummary } from './today-ai-summary'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const guided = useFlag('orbit_guided_flows')
  const { isOnline } = useOffline()
  const rest = guided ? getTodayAstraRest({ isOnline, aiMessagesUsed: profile?.aiMessagesUsed, aiMessagesLimit: profile?.aiMessagesLimit, hasProAccess: profile?.hasProAccess }) : null
  const line = getTodayAstraSlot({
    isTodaySelected, inDrillOrSurface: suppressed, item: proactive,
    returning: getReturningInterval(profile?.lastCompletionDate, profile?.timeZone),
  }, t)

  if (!line) return null
  if (rest && line !== 'summary') return <TodayAstraLine resting text={t(rest)} destination={t('todayAstra.openConversation')} onPress={() => useUIStore.getState().setAstraConversationOpen(true)} />
  if (line === 'summary') return <TodayAISummary date={today} />
  return <TodayAstraLine text={line.text} destination={line.destination}
    href={line.item ? undefined : '/progress'}
    onPress={line.item ? () => openItem(line.item) : undefined} />
}
