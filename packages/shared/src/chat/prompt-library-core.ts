import type { StateHook } from '../hooks/state-adapter'
import { findPromptSlot } from './composer-controls'
import { INITIAL_PROMPT_FILTERS, PROMPT_CATEGORIES, PROMPT_PRESENTATION, reducePromptFilters, type PromptCategory, type PromptFilterAction, type PromptFilters, type PromptTemplate } from './prompt-library'

export interface PromptIdeaProps<Icon> {
  label: string
  icon?: Icon
  example?: string
  invokesAstra?: boolean
  catalogId?: string
  disabled: boolean
  onSelect: () => void
}

export interface CatalogIdeaProps {
  template: PromptTemplate
  disabled: boolean
  onSelect: (id: string, label: string, prompt: string) => void
}

export interface PromptIdeaGroup {
  category: PromptCategory
  label: string
  templates: readonly PromptTemplate[]
}

export function groupPromptIdeas(templates: readonly PromptTemplate[], translate: (key: string) => string): PromptIdeaGroup[] {
  return PROMPT_CATEGORIES.flatMap(category => {
    const rows = templates.filter(template => template.category === category)
    return rows.length ? [{ category, label: translate(`chat.templates.categories.${category}`), templates: rows }] : []
  })
}

export function buildCatalogIdea(template: PromptTemplate, translate: (key: string) => string, onSelect: CatalogIdeaProps['onSelect']): Omit<PromptIdeaProps<never>, 'disabled' | 'icon'> & { intentIcon: (typeof PROMPT_PRESENTATION)[PromptTemplate['id']]['icon'] } {
  const presentation = PROMPT_PRESENTATION[template.id]
  const label = translate(template.labelKey)
  const prompt = translate(template.promptKey)
  return {
    catalogId: template.id, label, intentIcon: presentation.icon,
    example: presentation.example ? prompt : undefined,
    invokesAstra: !findPromptSlot(prompt), onSelect: () => onSelect(template.id, label, prompt),
  }
}

export interface PromptLibraryAdapters {
  useState: StateHook
  useReducer: (reducer: typeof reducePromptFilters, initial: PromptFilters) => [PromptFilters, (action: PromptFilterAction) => void]
  useRef: <Value>(initial: Value) => { current: Value }
  useEffect: (effect: () => () => void, dependencies: readonly unknown[]) => void
}

export interface PromptLibraryState {
  filters: PromptFilters
  dispatch: (action: PromptFilterAction) => void
  select: (action: () => void) => void
}

export function createUsePromptLibrary(adapters: PromptLibraryAdapters): (visible: boolean, disabledReason?: string) => PromptLibraryState {
  const { useState, useReducer, useRef, useEffect } = adapters
  return function usePromptLibrary(visible, disabledReason) {
    const [filters, dispatch] = useReducer(reducePromptFilters, INITIAL_PROMPT_FILTERS)
    const [previousVisible, setPreviousVisible] = useState(visible)
    if (previousVisible !== visible) {
      setPreviousVisible(visible)
      if (visible) dispatch({ type: 'reset' })
    }
    const activated = useRef(false)
    useEffect(() => { activated.current = !visible; return () => { activated.current = true } }, [visible])
    return { filters, dispatch, select: (action) => {
      if (!visible || disabledReason || activated.current) return
      activated.current = true
      action()
    } }
  }
}
