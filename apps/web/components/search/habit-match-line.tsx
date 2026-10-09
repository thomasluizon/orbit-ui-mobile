'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { useTranslations } from 'next-intl'
import { buildSearchMatchLines } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export function HabitMatchLine({ habit, query }: Readonly<{ habit: NormalizedHabit; query: string }>) {
  const t = useTranslations()
  return buildSearchMatchLines(query, habit, t).map((match) => (
    <span key={match.id} aria-label={match.text} className="flex min-w-0 flex-col font-mono text-[length:var(--fs-xs)] text-[var(--fg-3)] group-hover/habit-result:text-[var(--fg-2)] group-data-[selected=true]/habit-result:text-[var(--fg-2)]">
      <span>{match.label}{' '}</span>
      {match.fragment !== null && <PersonalText className="text-[var(--fg-2)] group-hover/habit-result:text-[var(--fg-1)] group-data-[selected=true]/habit-result:text-[var(--fg-1)]">{match.fragment}</PersonalText>}
    </span>
  ))
}
