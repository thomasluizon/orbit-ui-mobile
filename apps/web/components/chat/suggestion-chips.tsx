'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAstraSuggestionHabits } from '@/hooks/use-astra-suggestions'

const SUGGESTION_CLASS =
  'flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border-0 bg-[var(--bg-well)] px-4 text-[length:var(--fs-sm)] font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-1)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] animate-chip-in'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  contextualAction?: { label: string; onSelect: () => void }
}

/** The four drawn openers for an empty thread. Each one asks for a different kind
 *  of answer, and the two that name a habit drop out when no habit qualifies. */
export function SuggestionChips({ onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()
  const { logHabitTitle, splitHabitTitle } = useAstraSuggestionHabits()

  const suggestions = useMemo(() => [
    ...(logHabitTitle === null ? [] : [t('chat.suggestion.logHabit', { habit: logHabitTitle })]),
    t('chat.suggestion.week'),
    ...(splitHabitTitle === null ? [] : [t('chat.suggestion.splitHabit', { habit: splitHabitTitle })]),
    t('chat.suggestion.goals'),
  ], [logHabitTitle, splitHabitTitle, t])

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {contextualAction ? (
        <button type="button" className={SUGGESTION_CLASS} onClick={contextualAction.onSelect}>
          {contextualAction.label}
        </button>
      ) : null}
      {suggestions.map((suggestion, index) => (
        /* eslint-disable-next-line local/max-button-words -- granted canvas suggestions, Orbit Astra Conversation.dc.html:177 (D42) */
        <button
          type="button"
          key={suggestion}
          className={SUGGESTION_CLASS}
          style={{ animationDelay: `${index * 60}ms` }}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
