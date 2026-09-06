'use client'

import { useTranslations } from 'next-intl'
import { computeHabitMatchBadges } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

const MATCH_KEYS = {
  title: 'habits.search.matchTitle', description: 'habits.search.matchDescription',
  tag: 'habits.search.matchTag', child: 'habits.search.matchChild',
} as const

export function HabitMatchLine({ habit, query }: Readonly<{ habit: NormalizedHabit; query: string }>) {
  const t = useTranslations()
  return computeHabitMatchBadges(query, habit).map((match, index) => (
    <span key={`${match.field}-${index}`} className="block truncate font-mono text-[length:var(--fs-xs)] text-[var(--fg-3)]">
      {t(MATCH_KEYS[match.field])}
      {match.value !== null && <> <span className="text-[var(--fg-2)]">{`“${match.value}”`}</span></>}
    </span>
  ))
}
