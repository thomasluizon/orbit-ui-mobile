'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import type { Goal } from '@orbit/shared/types/goal'
import { formatLocaleDate, getAccountDay } from '@orbit/shared/utils'
import { getGoalDeadlineFact, type GoalDeadlineFact } from '@orbit/shared/utils/goal-detail-line'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useProfile } from '@/hooks/use-profile'
import { TodayAstraLine } from '@/components/today/today-astra-line'

type Translate = ReturnType<typeof useTranslations>

function deadlineSentence(fact: GoalDeadlineFact, t: Translate, locale: string): string {
  if (fact.kind === 'daysLeft') return t('goals.detail.line.daysLeft', { days: fact.days })
  if (fact.kind === 'dueToday') return t('goals.detail.line.dueToday')
  return t('goals.detail.line.passed', { date: formatLocaleDate(fact.date, locale) })
}

/** The date fact of the goal in the Orbit line, from the account's today. Null off the Orbit logic, with no deadline, or for a goal that is not active. */
export function useGoalOrbitLine(goal: Goal | null, guided: boolean): string | null {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  if (!goal || !guided) return null
  const fact = getGoalDeadlineFact(goal, getAccountDay(new Date(), profile?.timeZone))
  return fact ? deadlineSentence(fact, t, locale) : null
}

/**
 * The way into the conversation from the goal detail. With a date fact it is the Orbit line row under the progress
 * (`at="top"`); without one it stays the ask row lower in the detail (`at="bottom"`). Each slot draws only its own case.
 */
export function GoalAskEntry({ line, at, disabled, onPress }: Readonly<{ line: string | null; at: 'top' | 'bottom'; disabled: boolean; onPress: () => void }>) {
  const t = useTranslations()
  if ((at === 'top') !== (line !== null)) return null
  if (line) return <div data-goal-orbit-line=""><TodayAstraLine text={line} destination={t('todayAstra.openConversation')} gutter={false} disabled={disabled} onPress={onPress} /></div>
  return <ListRow placement="column" wrapTitle icon={<OrbitMascot size={24} />} title={t('goals.detail.askAstraEyebrow')} accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`} disabled={disabled} onClick={onPress} />
}
