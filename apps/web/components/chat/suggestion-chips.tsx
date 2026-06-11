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
          className="rounded-full inline-flex items-center border-0 cursor-pointer bg-[var(--bg-elev)] text-[var(--fg-1)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev-pressed)] hover:scale-[1.02] active:scale-95"
          style={{
            minHeight: 44,
            padding: '0 16px',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
          }}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}
