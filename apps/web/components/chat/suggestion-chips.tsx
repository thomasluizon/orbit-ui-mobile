'use client'

import { useTranslations } from 'next-intl'
import { useAstraSuggestions } from '@/hooks/use-astra-suggestions'

const SUGGESTION_CLASS =
  'orbit-pill-action flex min-h-11 min-w-0 max-w-full items-center rounded-full border-0 bg-[var(--bg-well)] px-4 text-[length:var(--fs-sm)] font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] forced-colors:border forced-colors:border-[ButtonText]'

interface SuggestionChipsProps {
  onSelect: (suggestion: string) => void
  contextualAction?: { label: string; onSelect: () => void }
}

function SuggestionLabel({ text }: Readonly<{ text: string }>) {
  return <span className="truncate">{text}</span>
}

/** The four drawn openers for an empty thread. Each one asks for a different kind
 *  of answer, and the two that name a habit drop out when no habit qualifies. */
export function SuggestionChips({ onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()
  const suggestions = useAstraSuggestions()

  if (suggestions === null) return null

  return (
    <div className="flex max-w-full flex-wrap justify-center gap-2">
      {contextualAction ? (
        <button type="button" className={SUGGESTION_CLASS} onClick={contextualAction.onSelect}>
          <SuggestionLabel text={contextualAction.label} />
        </button>
      ) : null}
      {suggestions.map((suggestion) => {
        const label = t(suggestion.key, suggestion.params)
        return (
          <button type="button" key={suggestion.id} className={SUGGESTION_CLASS} onClick={() => onSelect(label)}>
            <SuggestionLabel text={label} />
          </button>
        )
      })}
    </div>
  )
}
