import type { HabitTag, SuggestedTag, SuggestTagsResponse } from '../types/habit'

export interface TagSuggestionOptions {
  title: string
  description: string
  language: string
  disabled: boolean
  availableTags: readonly Pick<HabitTag, 'id'>[]
  request: (input: { title: string; description: string | null; language: string }) => Promise<SuggestTagsResponse>
  accept: (suggestion: SuggestedTag) => Promise<void>
}

export interface TagSuggestionState {
  suggestions: SuggestedTag[]
  pending: 'suggest' | 'accept' | null
  noResults: boolean
  error: { cause: unknown; operation: 'suggest' | 'accept' } | null
}

export function createTagSuggestionState(): TagSuggestionState {
  return { suggestions: [], pending: null, noResults: false, error: null }
}

function isTagSuggestionAvailable(suggestion: SuggestedTag, availableTags: TagSuggestionOptions['availableTags']): boolean {
  return !suggestion.isExisting || availableTags.some((tag) => tag.id === suggestion.id)
}

export function reconcileTagSuggestionState(state: TagSuggestionState, availableTags: TagSuggestionOptions['availableTags']): TagSuggestionState {
  return { ...state, suggestions: state.suggestions.filter((suggestion) => isTagSuggestionAvailable(suggestion, availableTags)) }
}

export function tagSuggestionStatusKey(state: TagSuggestionState, atLimit: boolean, needsTitle: boolean): string | null {
  if (state.pending === 'suggest') return 'habits.form.suggestingTags'
  if (state.pending === 'accept') return 'common.loading'
  if (atLimit) return 'habits.form.tagLimit'
  if (needsTitle) return 'habits.form.titleRequired'
  if (state.noResults) return 'habits.form.noTagSuggestions'
  if (state.suggestions.length > 0) return 'habits.form.suggestedTagsLabel'
  return null
}

export function createTagSuggestionActions(setState: (update: TagSuggestionState | ((previous: TagSuggestionState) => TagSuggestionState)) => void): {
  suggest: (options: TagSuggestionOptions) => Promise<void>
  acceptSuggestion: (suggestion: SuggestedTag, options: TagSuggestionOptions) => Promise<void>
} {
  let operationPending = false

  async function suggest({ title, description, language, disabled, request }: TagSuggestionOptions) {
    if (!title.trim() || disabled || operationPending) return
    operationPending = true
    setState({ suggestions: [], pending: 'suggest', noResults: false, error: null })
    try {
      const response = await request({ title: title.trim(), description: description.trim() || null, language })
      setState({ suggestions: response.tags, pending: null, noResults: response.tags.length === 0, error: null })
    } catch (cause: unknown) {
      setState({ suggestions: [], pending: null, noResults: false, error: { cause, operation: 'suggest' } })
    } finally {
      operationPending = false
    }
  }

  async function acceptSuggestion(suggestion: SuggestedTag, { disabled, accept, availableTags }: TagSuggestionOptions) {
    if (disabled || operationPending || !isTagSuggestionAvailable(suggestion, availableTags)) return
    operationPending = true
    setState((previous) => ({ ...previous, pending: 'accept', error: null }))
    try {
      await accept(suggestion)
      setState((previous) => ({ ...previous, pending: null, suggestions: previous.suggestions.filter((candidate) => candidate.name !== suggestion.name) }))
    } catch (cause: unknown) {
      setState((previous) => ({ ...previous, pending: null, error: { cause, operation: 'accept' } }))
    } finally {
      operationPending = false
    }
  }

  return { suggest, acceptSuggestion }
}
