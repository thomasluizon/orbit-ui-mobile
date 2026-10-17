'use client'

import { useMemo, useState } from 'react'
import { createTagSuggestionActions, createTagSuggestionState, type TagSuggestionOptions, type TagSuggestionState } from '@orbit/shared/hooks'
import type { SuggestedTag } from '@orbit/shared/types/habit'

interface TagSuggestions extends TagSuggestionState {
  canSuggest: boolean
  suggest: () => Promise<void>
  acceptSuggestion: (suggestion: SuggestedTag) => Promise<void>
}

export function useTagSuggestions(options: TagSuggestionOptions): TagSuggestions {
  const [state, setState] = useState(createTagSuggestionState)
  const actions = useMemo(() => createTagSuggestionActions(setState), [])
  return {
    ...state,
    canSuggest: Boolean(options.title.trim()) && !options.disabled && state.pending === null,
    suggest: () => actions.suggest(options),
    acceptSuggestion: (suggestion) => actions.acceptSuggestion(suggestion, options),
  }
}
