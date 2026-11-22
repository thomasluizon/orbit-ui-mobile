import { useTranslation } from 'react-i18next'
import type { HabitDayValue } from '@orbit/shared/contracts/dates'
import { prepareChatRequest } from '@orbit/shared/stores'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { countDoneInRecentDays } from '@orbit/shared/utils'
import { TodayOrbitLine } from '@/components/today/today-orbit-line'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

const RECENT_DAYS = 7

function useOpenHabitReview(habit: NormalizedHabit) {
  const { t } = useTranslation()
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
  const { t } = useTranslation()
  const openReview = useOpenHabitReview(habit)
  
  const done = days ? countDoneInRecentDays(days, RECENT_DAYS) : 0
  return <TodayOrbitLine text={done > 0 ? t('habits.detail.orbit.lastSevenDays', { done }) : t('habits.detail.askOrbit')} destination={t('habits.detail.askOrbit')} mascotState={thinking ? 'pensando' : 'parado'} onPress={openReview} />
}

