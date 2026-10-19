'use client'

import { useMemo, useState } from 'react'
import { createTagSuggestionActions, createTagSuggestionState, reconcileTagSuggestionState, type TagSuggestionOptions, type TagSuggestionState } from '@orbit/shared/hooks'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import type { SuggestedTag } from '@orbit/shared/types/habit'

interface TagSuggestions extends TagSuggestionState {
  needsTitle: boolean
  canSuggest: boolean
  suggest: () => Promise<void>
  acceptSuggestion: (suggestion: SuggestedTag) => Promise<void>
}

export function useTagSuggestions(options: TagSuggestionOptions): TagSuggestions {
  const account = useAccountGeneration()
  const needsTitle = !options.title.trim()
  const contextKey = JSON.stringify([account, options.language, options.title, options.description])
  const [snapshot, setSnapshot] = useState(() => ({ contextKey, generation: 0, state: createTagSuggestionState() }))
  if (snapshot.contextKey !== contextKey) {
    setSnapshot({ contextKey, generation: snapshot.generation + 1, state: createTagSuggestionState() })
  }
  const { generation, state } = snapshot
  const actions = useMemo(() => createTagSuggestionActions((update) => {
    setSnapshot((previous) => previous.generation === generation
      ? { ...previous, state: typeof update === 'function' ? update(previous.state) : update }
      : previous)
  }), [generation])
  return {
    ...reconcileTagSuggestionState(state, options.availableTags),
    needsTitle,
    canSuggest: !needsTitle && !options.disabled && state.pending === null,
    suggest: () => actions.suggest(options),
    acceptSuggestion: (suggestion) => actions.acceptSuggestion(suggestion, options),
  }
}
