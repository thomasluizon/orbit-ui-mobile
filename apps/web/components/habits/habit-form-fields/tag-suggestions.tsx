'use client'

import { useLocale, useTranslations } from 'next-intl'
import { tagSuggestionStatusKey } from '@orbit/shared/hooks'
import { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { useSuggestTags } from '@/hooks/use-tags'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { PillButton } from '@/components/ui/pill-button'
import { PickerRow } from '@/components/ui/picker-row'
import { Proposed } from '@/components/ui/proposed'

interface TagSuggestionsProps {
  title: string
  description: string
  tags: TagSelectionState
  disabled: boolean
  createTag: (name: string, color: string) => Promise<string | null>
}

export function TagSuggestions(props: Readonly<TagSuggestionsProps>) {
  const language = useLocale()
  const account = useAccountGeneration()
  return <TagSuggestionsContent key={JSON.stringify([account, language, props.title, props.description])} {...props} language={language} />
}

function TagSuggestionsContent({ title, description, tags, disabled, language, createTag }: Readonly<TagSuggestionsProps & { language: string }>) {
  const t = useTranslations()
  const request = useSuggestTags()
  const suggestions = useTagSuggestions({ title, description, language, disabled: disabled || tags.atTagLimit, request: request.mutateAsync, accept: (suggestion) => tags.acceptSuggestedTag(suggestion, createTag) })
  const pending = suggestions.pending !== null
  const failure = suggestions.error
  const statusKey = tagSuggestionStatusKey(suggestions, tags.atTagLimit)
  return <div className="flex flex-col gap-4 pt-4">
    <div className="self-start"><PillButton hint={suggestions.pending === 'suggest' ? t('habits.form.suggestingTags') : undefined} accessibleName={t('habits.form.suggestTags')} variant="ghost" leadingIcon={<AstraGlyph size={16} />} disabled={!suggestions.canSuggest} loading={suggestions.pending === 'suggest'} onClick={() => void suggestions.suggest()}>{t('habits.form.suggestTags')}</PillButton></div>
    <div role="status" aria-label={t('habits.form.suggestTags')} className="text-sm text-[var(--fg-3)]">{statusKey ? t(statusKey) : null}</div>
    {failure ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{getFriendlyErrorMessage(failure.cause, t, failure.operation === 'suggest' ? 'habits.form.suggestTagsError' : 'toast.errors.validation', failure.operation === 'suggest' ? 'generic' : 'tag')}</p> : null}
    {suggestions.suggestions.length > 0 ? <Proposed proposed scope="field" label={t('habits.form.suggestedTagsLabel')}><div aria-busy={suggestions.pending === 'accept'} className="flex flex-col gap-2 p-2">
      {suggestions.suggestions.map((suggestion) => <PickerRow proposed key={suggestion.name} name={suggestion.name} selected={false} disabled={disabled || tags.atTagLimit || pending} onToggle={() => void suggestions.acceptSuggestion(suggestion)} value="" valueHidden valueClassName="flex-1" actionsClassName="flex items-center justify-end" controlClassName="habit-control-motion flex min-h-12 w-full min-w-0 items-center rounded-[12px] px-2 py-1 text-left enabled:hover:bg-[var(--bg-hover)] motion-safe:enabled:active:scale-[0.96] disabled:opacity-40" />)}
    </div></Proposed> : null}
  </div>
}
