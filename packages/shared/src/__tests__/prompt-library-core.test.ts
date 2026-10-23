import { describe, expect, it, vi } from 'vitest'
import { buildCatalogIdea, createUsePromptLibrary, groupPromptIdeas, type PromptLibraryAdapters } from '../chat/prompt-library-core'
import { buildPromptPage, INITIAL_PROMPT_FILTERS, PROMPT_CATEGORIES, PROMPT_PRESENTATION, PROMPT_TEMPLATES } from '../chat/prompt-library'
import { createHookStateHarness } from '../test-support/hook-state'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

function setup() {
  const harness = createHookStateHarness()
  let cleanup: (() => void) | undefined
  let previousDependencies: readonly unknown[] | undefined
  const adapters: PromptLibraryAdapters = {
    useState: harness.useState,
    useReducer: (reducer, initial) => {
      const [state, setState] = harness.useState(initial)
      return [state, action => setState(current => reducer(current, action))]
    },
    useRef: <Value>(initial: Value) => harness.useState(() => ({ current: initial }))[0],
    useEffect: (effect, dependencies) => {
      if (previousDependencies?.every((value, index) => value === dependencies[index])) return
      cleanup?.()
      cleanup = effect()
      previousDependencies = dependencies
    },
  }
  const useLibrary = createUsePromptLibrary(adapters)
  return { render: (visible = true, disabledReason?: string) => harness.render(() => useLibrary(visible, disabledReason)), unmount: () => cleanup?.() }
}

describe('shared Ideas presentation', () => {
  it.each([en, ptBR])('retains every translated selection and approved example', copy => {
    const translate = vi.fn((key: string) => {
      const [, , , id, field] = key.split('.')
      return copy.chat.templates.items[id as keyof typeof copy.chat.templates.items][field as 'label' | 'prompt']
    })
    const slottedIds = ['goalHabits', 'habitReminder', 'smallSteps', 'setReminder', 'changeReminder', 'logMany', 'tagGroup', 'smallerHabit', 'easierTime', 'findTime']
    for (const template of PROMPT_TEMPLATES) {
      const onSelect = vi.fn()
      const idea = buildCatalogIdea(template, translate, onSelect)
      const { label, prompt } = copy.chat.templates.items[template.id]
      expect(idea).toMatchObject({ catalogId: template.id, label, intentIcon: PROMPT_PRESENTATION[template.id].icon, invokesAstra: !slottedIds.includes(template.id) })
      expect(idea.example).toBe(PROMPT_PRESENTATION[template.id].example ? prompt : undefined)
      expect(translate).toHaveBeenCalledWith(template.labelKey)
      expect(translate).toHaveBeenCalledWith(template.promptKey)
      expect(onSelect).not.toHaveBeenCalled()
      idea.onSelect()
      expect(onSelect).toHaveBeenCalledExactlyOnceWith(template.id, label, prompt)
    }
  })

  it('groups only the current page in catalog order with named nonempty regions', () => {
    const translate = (key: string) => key
    const first = buildPromptPage({ filters: { ...INITIAL_PROMPT_FILTERS, query: 'templates' }, locale: 'en', hasProAccess: true, hasGoogleConnection: true, translate })
    const groups = groupPromptIdeas(first.visible, translate)
    expect(groups.map(group => [group.category, group.label, group.templates.length])).toEqual([
      ['start', 'chat.templates.categories.start', 6], ['remember', 'chat.templates.categories.remember', 2],
    ])
    expect(groups.flatMap(group => group.templates)).toEqual(first.visible)
    expect(groupPromptIdeas([], translate)).toEqual([])
    const allGroups = groupPromptIdeas(PROMPT_TEMPLATES, translate)
    expect(allGroups.map(group => group.category)).toEqual(PROMPT_CATEGORIES)
    expect(allGroups.flatMap(group => group.templates)).toEqual(PROMPT_TEMPLATES)
  })
})

describe('shared Ideas session', () => {
  it('preserves filters during renders and resets them only on reopening', () => {
    const session = setup()
    expect(session.render().filters).toEqual(INITIAL_PROMPT_FILTERS)
    session.render().dispatch({ type: 'category', category: 'restart' })
    session.render().dispatch({ type: 'query', query: 'week' })
    session.render().dispatch({ type: 'page', page: 2 })
    const filtered = { category: 'restart', query: 'week', page: 2 }
    expect(session.render().filters).toEqual(filtered)
    expect(session.render(false).filters).toEqual(filtered)
    expect(session.render(false).filters).toEqual(filtered)
    session.render()
    expect(session.render().filters).toEqual(INITIAL_PROMPT_FILTERS)
  })

  it('claims activation before the callback and rearms only on reopening', () => {
    const session = setup()
    const first = session.render()
    const repeated = vi.fn()
    const action = vi.fn(() => first.select(repeated))
    first.select(action)
    first.select(action)
    session.render().select(action)
    expect(action).toHaveBeenCalledOnce()
    expect(repeated).not.toHaveBeenCalled()
    session.render(false).select(action)
    first.select(action)
    expect(action).toHaveBeenCalledOnce()
    session.render().select(action)
    expect(action).toHaveBeenCalledTimes(2)
    session.unmount()
    first.select(action)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it.each(['offline', 'limit', 'busy'])('allows browsing while %s blocks activation without consuming it', reason => {
    const session = setup()
    const blocked = session.render(true, reason)
    const action = vi.fn()
    blocked.select(action)
    expect(action).not.toHaveBeenCalled()
    blocked.dispatch({ type: 'category', category: 'remember' })
    expect(session.render(true, reason).filters.category).toBe('remember')
    session.render().select(action)
    expect(action).toHaveBeenCalledOnce()
  })

  it('opens an initially hidden library with fresh filters and a live activation', () => {
    const session = setup()
    const action = vi.fn()
    session.render(false).select(action)
    expect(action).not.toHaveBeenCalled()
    session.render().select(action)
    expect(action).toHaveBeenCalledOnce()
    expect(session.render().filters).toEqual(INITIAL_PROMPT_FILTERS)
  })
})
