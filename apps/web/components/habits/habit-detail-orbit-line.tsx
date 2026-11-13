'use client'

import { useTranslations } from 'next-intl'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import { prepareChatRequest } from '@orbit/shared/stores'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { countDoneInRecentDays } from '@orbit/shared/utils'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { TodayAstraLine } from '@/components/today/today-astra-line'
import { useFlag } from '@/hooks/use-flag'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const RECENT_DAYS = 7

function useOpenHabitReview(habit: NormalizedHabit) {
  const t = useTranslations()
  return () => {
    prepareChatRequest(useChatStore.getState(), {
      id: `habit-detail:${habit.id}`,
      label: t('habits.detail.askAstra'),
      prompt: t('habits.detail.askAstraSeedDefault', { title: habit.title }),
    })
    useUIStore.getState().setAstraConversationOpen(true)
  }
}

/** The Orbit line under the header: one fact from the strip. It opens the conversation with the review of this habit. A habit with no day done in the window shows the review label, because a count of zero reads as a miss. */
export function HabitDetailOrbitLine({ habit, days }: Readonly<{ habit: NormalizedHabit; days: readonly HabitDayValue[] | undefined }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const openReview = useOpenHabitReview(habit)
  if (!guided) return null
  const done = days ? countDoneInRecentDays(days, RECENT_DAYS) : 0
  return <TodayAstraLine text={done > 0 ? t('habits.detail.orbit.lastSevenDays', { done }) : t('habits.detail.askAstra')} destination={t('habits.detail.askAstra')} gutter={false} onPress={openReview} />
}

/** The review row of the current surface, kept while the flag is off. */
export function HabitDetailReviewRow({ habit }: Readonly<{ habit: NormalizedHabit }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const openReview = useOpenHabitReview(habit)
  if (guided) return null
  return <ListRow placement="column" wrapTitle icon={<OrbitMascot size={24} />} title={t('habits.detail.askAstra')} accessibilityLabel={t('habits.detail.askAstra')} onClick={openReview} />
}
