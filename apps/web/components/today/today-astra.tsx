'use client'

import { useTranslations } from 'next-intl'
import {
  getReturningInterval,
  shouldShowTodayAstraSurface,
} from '@orbit/shared/utils'
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
  const t = useTranslations()
  const { profile } = useProfile()
  const { item: proactive, openItem } = useProactiveItem()
  const returning = getReturningInterval(profile?.lastCompletionDate, profile?.timeZone)

  if (!shouldShowTodayAstraSurface({ isTodaySelected, inDrillOrSurface: suppressed })) return null

  const line = proactive
      ? { text: proactive.text, destination: t('todayAstra.openConversation'), item: proactive }
      : returning
        ? {
            text: returning.kind === 'elapsed'
              ? t('todayAstra.returningElapsed', { days: returning.days })
              : t('todayAstra.returningBounded'),
            destination: t('todayAstra.viewProgress'),
            item: null,
          }
        : null

  if (!line) return <TodayAISummary date={today} />
  return <TodayAstraLine text={line.text} destination={line.destination}
    href={line.item ? undefined : '/progress'}
    onPress={line.item ? () => openItem(line.item) : undefined} />
}
