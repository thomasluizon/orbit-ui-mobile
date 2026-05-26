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
      {suggestions.map((suggestion) => (
        <button
          type="button"
          key={suggestion}
          className="px-4 py-2 rounded-full text-xs font-medium bg-[var(--bg-elev)] border border-[var(--hairline)] text-[var(--fg-1)] hover:border-[var(--hairline)] hover:scale-[1.02] transition-[border-color,transform] duration-150 active:scale-95"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
