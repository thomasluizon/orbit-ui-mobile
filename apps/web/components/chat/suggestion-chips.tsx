'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  contextualAction?: { label: string; onSelect: () => void }
}

export function SuggestionChips({ onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()

  const suggestions = useMemo(() => [
    t('chat.suggestion.meditated'),
    t('chat.suggestion.exercise'),
    t('chat.suggestion.groceries'),
  ], [t])

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {contextualAction ? (
        <button type="button" className="chip animate-chip-in" style={{ minHeight: 44 }} onClick={contextualAction.onSelect}>
          {contextualAction.label}
        </button>
      ) : null}
      {suggestions.map((suggestion, index) => (
        /* eslint-disable-next-line local/max-button-words -- D69 replaces this pre-redesign chip surface. */
        <button
          type="button"
          key={suggestion}
          className="chip animate-chip-in"
          style={{ minHeight: 44, animationDelay: `${index * 60}ms` }}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
