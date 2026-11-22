'use client'

import { useTranslations } from 'next-intl'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import { prepareChatRequest } from '@orbit/shared/stores'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { countDoneInRecentDays } from '@orbit/shared/utils'
import { ListRow } from '@/components/ui/list-row'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'
import { useFlag } from '@/hooks/use-flag'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const RECENT_DAYS = 7

function useOpenHabitReview(habit: NormalizedHabit) {
  const t = useTranslations()
  return () => {
    prepareChatRequest(useChatStore.getState(), {
      id: `habit-detail:${habit.id}`,
      label: t('habits.detail.askOrbit'),
      prompt: t('habits.detail.askOrbitSeedDefault', { title: habit.title }),
    })
    useUIStore.getState().setOrbitConversationOpen(true)
  }
}

/** The Orbit line under the header: one fact from the strip. Orbit is Pensando while the reschedule suggestion loads. It opens the conversation with the review of this habit. A habit with no day done in the window shows the review label, because a count of zero reads as a miss. */
export function HabitDetailOrbitLine({ habit, days, thinking = false }: Readonly<{ habit: NormalizedHabit; days: readonly HabitDayValue[] | undefined; thinking?: boolean }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const openReview = useOpenHabitReview(habit)
  if (!guided) return null
  const done = days ? countDoneInRecentDays(days, RECENT_DAYS) : 0
  return <TodayOrbitLine text={done > 0 ? t('habits.detail.orbit.lastSevenDays', { done }) : t('habits.detail.askOrbit')} destination={t('habits.detail.askOrbit')} gutter={false} mascotState={thinking ? 'pensando' : 'parado'} onPress={openReview} />
}

/** The review row of the current surface, kept while the flag is off. */
export function HabitDetailReviewRow({ habit }: Readonly<{ habit: NormalizedHabit }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')
  const openReview = useOpenHabitReview(habit)
  if (guided) return null
  return <ListRow placement="column" wrapTitle icon={<OrbitMascot size={24} />} title={t('habits.detail.askOrbit')} accessibilityLabel={t('habits.detail.askOrbit')} onClick={openReview} />
}
