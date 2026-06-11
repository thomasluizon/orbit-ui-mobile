'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
}

export function SuggestionChips({ onSelect }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()

  const suggestions = useMemo(() => [
    t('chat.suggestion.meditated'),
    t('chat.suggestion.exercise'),
    t('chat.suggestion.groceries'),
  ], [t])

  return (
    <div data-tour="tour-chat-suggestions" className="flex gap-2 flex-wrap justify-center">
      {suggestions.map((suggestion, index) => (
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
