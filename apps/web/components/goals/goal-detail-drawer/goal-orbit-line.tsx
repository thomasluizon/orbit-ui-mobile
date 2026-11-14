'use client'

import { useId } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import type { Goal } from '@orbit/shared/types/goal'
import { formatLocaleDate, getAccountDay } from '@orbit/shared/utils'
import { getGoalDeadlineFact, type GoalDeadlineFact } from '@orbit/shared/utils/goal-detail-line'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { useProfile } from '@/hooks/use-profile'

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

/** The Orbit line row of the goal detail: one date fact, composed like the root Orbit line row. A press opens the conversation with the goal's seeded question. */
export function GoalOrbitLine({ text, destination, disabled, onPress }: Readonly<{ text: string; destination: string; disabled: boolean; onPress: () => void }>) {
  const destinationId = useId()
  return (
    <div data-goal-orbit-line="">
      <button type="button" className="today-astra-line" aria-describedby={destinationId} disabled={disabled} onClick={onPress}>
        <span aria-hidden="true" className="relative flex w-[48px] shrink-0 items-center justify-center">
          <OrbitMascot size={20} color="var(--fg-3)" />
        </span>
        <span className="today-astra-sentence">{text}</span>
      </button>
      <span id={destinationId} className="sr-only">{destination}</span>
    </div>
  )
}

/**
 * The way into the conversation from the goal detail. With a date fact it is the Orbit line row under the progress
 * (`at="top"`); without one it stays the ask row lower in the detail (`at="bottom"`). Each slot draws only its own case.
 */
export function GoalAskEntry({ line, at, disabled, onPress }: Readonly<{ line: string | null; at: 'top' | 'bottom'; disabled: boolean; onPress: () => void }>) {
  const t = useTranslations()
  if ((at === 'top') !== (line !== null)) return null
  if (line) return <GoalOrbitLine text={line} destination={t('todayAstra.openConversation')} disabled={disabled} onPress={onPress} />
  return <ListRow placement="column" wrapTitle icon={<OrbitMascot size={24} />} title={t('goals.detail.askAstraEyebrow')} accessibilityLabel={`${t('goals.detail.askAstraEyebrow')}: ${t('goals.detail.askAstraDefault')}`} disabled={disabled} onClick={onPress} />
}
