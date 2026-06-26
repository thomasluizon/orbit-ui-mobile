'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { SuggestedTag } from '@orbit/shared/types/habit'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useAppToast } from '@/hooks/use-app-toast'
import { useSuggestTags } from '@/hooks/use-tags'

interface SuggestedTagsRowProps {
  title: string
  description: string
  atTagLimit: boolean
  onAccept: (suggestion: SuggestedTag) => void
}

export function SuggestedTagsRow({
  title,
  description,
  atTagLimit,
  onAccept,
}: Readonly<SuggestedTagsRowProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { showError } = useAppToast()
  const suggestMutation = useSuggestTags()
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([])
  const [noResults, setNoResults] = useState(false)

  const trimmedTitle = title.trim()
  const canSuggest = trimmedTitle.length > 0 && !atTagLimit && !suggestMutation.isPending

  async function handleSuggest() {
    if (!canSuggest) return
    setNoResults(false)
    try {
      const response = await suggestMutation.mutateAsync({
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
        language: locale,
      })
      setSuggestions(response.tags)
      setNoResults(response.tags.length === 0)
    } catch (error: unknown) {
      showError(getFriendlyErrorMessage(error, t, 'habits.form.suggestTagsError', 'generic'))
    }
  }

  function handleAccept(suggestion: SuggestedTag) {
    onAccept(suggestion)
    setSuggestions((previous) =>
      previous.filter((candidate) => candidate.name !== suggestion.name),
    )
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="chip"
        disabled={!canSuggest}
        aria-busy={suggestMutation.isPending}
        onClick={handleSuggest}
      >
        <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
        {suggestMutation.isPending
          ? t('habits.form.suggestingTags')
          : t('habits.form.suggestTags')}
      </button>

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-[var(--fg-3)]">
            {t('habits.form.suggestedTagsLabel')}
          </span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={`${suggestion.name}-${suggestion.id ?? 'new'}`}
                type="button"
                className="chip"
                disabled={atTagLimit}
                onClick={() => handleAccept(suggestion)}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: suggestion.color }}
                  aria-hidden="true"
                />
                {suggestion.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {noResults && !suggestMutation.isPending && (
        <p className="text-xs text-[var(--fg-3)]">{t('habits.form.noTagSuggestions')}</p>
      )}
    </div>
  )
}
