'use client'

import { useTranslations } from 'next-intl'
import { buildSearchMatchLines } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export function HabitMatchLine({ habit, query }: Readonly<{ habit: NormalizedHabit; query: string }>) {
  const t = useTranslations()
  return buildSearchMatchLines(query, habit, t).map((match) => (
    <span key={match.id} className="block truncate font-mono text-[length:var(--fs-xs)] text-[var(--fg-3)]">
      {match.label}
      {match.fragment !== null && <> <span className="text-[var(--fg-2)]">{match.fragment}</span></>}
    </span>
  ))
}
