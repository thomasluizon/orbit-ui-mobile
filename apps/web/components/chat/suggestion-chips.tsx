'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestionChips({ onSelect }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()

  const suggestions = useMemo(() => [
    t('chat.suggestion.meditated'),
    t('chat.suggestion.exercise'),
    t('chat.suggestion.groceries'),
  ], [t])

  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion}
          className="px-4 py-2 rounded-full text-xs font-medium bg-surface-elevated border border-border-muted text-text-primary hover:border-border hover:scale-[1.02] transition-all duration-150 active:scale-95"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
