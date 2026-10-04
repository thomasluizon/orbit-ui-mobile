'use client'

import { useTranslations } from 'next-intl'
import type { AstraSuggestion } from '@orbit/shared/utils'

const SUGGESTION_CLASS =
  'orbit-pill-action flex min-h-[var(--touch-min)] min-w-0 max-w-full items-center rounded-full border-0 bg-[var(--bg-well)] px-4 text-[length:var(--fs-sm)] font-medium text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] forced-colors:border forced-colors:border-[ButtonText]'

interface SuggestionChipsProps {
  suggestions: readonly AstraSuggestion[]
  onSelect: (suggestion: string) => void
  contextualAction?: { label: string; onSelect: () => void }
}

function SuggestionLabel({ text }: Readonly<{ text: string }>) {
  return <span className="min-w-0">{text}</span>
}

/** The drawn openers for an empty thread, in the order given, each kept to one line.
 *  A press sends the complete request for the selected habit. */
export function SuggestionChips({ suggestions, onSelect, contextualAction }: Readonly<SuggestionChipsProps>) {
  const t = useTranslations()

  return (
    <div className="flex max-w-full flex-wrap justify-center gap-2">
      {contextualAction ? (
        <button type="button" className={SUGGESTION_CLASS} onClick={contextualAction.onSelect}>
          <SuggestionLabel text={contextualAction.label} />
        </button>
      ) : null}
      {suggestions.map((suggestion) => {
        const label = t(suggestion.key)
        return (
          <button type="button" key={suggestion.id} className={SUGGESTION_CLASS} onClick={() => onSelect(t(suggestion.promptKey ?? suggestion.key, suggestion.params))}>
            <SuggestionLabel text={label} />
          </button>
        )
      })}
    </div>
  )
}
