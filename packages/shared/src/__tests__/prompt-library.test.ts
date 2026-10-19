import { describe, expect, it } from 'vitest'
import { createChatStoreState } from '../stores/chat-store'
import { buildPromptPage, INITIAL_PROMPT_FILTERS, reducePromptFilters, filterPromptTemplates, promptCategories, PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '../chat/prompt-library'
import { promptDisabledReason, findPromptSlot, preparePromptTemplate } from '../chat/composer-controls'
import en from '../i18n/en.json'
import ptBR from '../i18n/pt-BR.json'

const locales = { en, 'pt-BR': ptBR }

describe('prompt library', () => {
  it('defines six balanced categories and complete copy in both languages', () => {
    expect(PROMPT_TEMPLATES.length).toBeGreaterThanOrEqual(36)
    expect(PROMPT_TEMPLATES.length).toBeLessThanOrEqual(44)
    expect(new Set(PROMPT_TEMPLATES.map(template => template.id)).size).toBe(PROMPT_TEMPLATES.length)
    for (const category of PROMPT_CATEGORIES) {
      expect(PROMPT_TEMPLATES.filter(template => template.category === category)).toHaveLength(6)
    }
    for (const locale of Object.values(locales)) {
      for (const template of PROMPT_TEMPLATES) {
        const copy = locale.chat.templates.items[template.id as keyof typeof locale.chat.templates.items]
        expect(copy.label.trim()).not.toBe('')
        expect(copy.prompt.trim()).not.toBe('')
        expect(template.labelKey).toBe(`chat.templates.items.${template.id}.label`)
        expect(template.promptKey).toBe(`chat.templates.items.${template.id}.prompt`)
      }
    }
  })

  it.each([[false, false], [false, true], [true, false]])('hides Calendar when access is %s and connection is %s', (pro, google) => {
    expect(promptCategories(pro, google)).not.toContain('calendar')
  })

  it('includes Calendar only with access and a connection', () => {
    expect(promptCategories(true, true)).toEqual(PROMPT_CATEGORIES)
  })

  it('finds the first complete slot with Unicode selection offsets', () => {
    expect(findPromptSlot('Me lembre de {hábito} às {hora}.')).toEqual({ start: 13, end: 21 })
    expect(findPromptSlot('Review my week.')).toBeNull()
    expect(findPromptSlot('A {broken slot')).toBeNull()
    expect(findPromptSlot('🙂 {hábito}')).toEqual({ start: 3, end: 11 })
  })

  it('searches all permitted categories and localized prompt text without accents', () => {
    const translate = (key: string) => {
      const [, , , id, field] = key.split('.')
      return ptBR.chat.templates.items[id as keyof typeof ptBR.chat.templates.items][field as 'label' | 'prompt']
    }
    const options = { category: 'start' as const, query: '', locale: 'pt-BR', categories: promptCategories(true, true), translate }
    expect(filterPromptTemplates(options)).toHaveLength(6)
    expect(filterPromptTemplates({ ...options, query: 'congelamentos da sequencia' }).map(template => template.id)).toEqual(['freezes'])
    expect(filterPromptTemplates({ ...options, query: 'Google', categories: promptCategories(false, true) })).toEqual([])
    expect(filterPromptTemplates({ ...options, query: 'nada assim' })).toEqual([])
  })

  it('prepares editable text and preserves an existing draft as a contextual request', () => {
    let chat = createChatStoreState(update => { chat = { ...chat, ...(typeof update === 'function' ? update(chat) : update) } })
    const request = { id: 'reminder', label: 'Set a reminder', prompt: 'Remind me to {habit} at {time}.' }
    expect(preparePromptTemplate(chat, request)).toEqual({ start: 13, end: 20 })
    expect(chat.draft).toBe(request.prompt)
    chat.setDraft('My own unfinished thought')
    expect(preparePromptTemplate(chat, request)).toBeNull()
    expect(chat.draft).toBe('My own unfinished thought')
    expect(chat.contextualSuggestion).toEqual({ ...request, id: 'prompt-library:reminder' })
  })

  it('resets paging for searches and categories, and restores the opening filters', () => {
    const searched = reducePromptFilters(INITIAL_PROMPT_FILTERS, { type: 'query', query: 'week' })
    const paged = reducePromptFilters(searched, { type: 'page', page: 2 })
    expect(paged).toEqual({ category: 'start', query: 'week', page: 2 })
    expect(reducePromptFilters(paged, { type: 'query', query: '' })).toEqual(INITIAL_PROMPT_FILTERS)
    const category = reducePromptFilters(paged, { type: 'category', category: 'restart' })
    expect(category).toEqual({ category: 'restart', query: '', page: 0 })
    expect(reducePromptFilters(category, { type: 'reset' })).toEqual(INITIAL_PROMPT_FILTERS)
  })

  it.each(Object.entries(locales))('paginates localized search results without losing rows in %s', (locale, copy) => {
    const translate = (key: string) => {
      const [, , , id, field] = key.split('.')
      return copy.chat.templates.items[id as keyof typeof copy.chat.templates.items][field as 'label' | 'prompt']
    }
    const options = { filters: { ...INITIAL_PROMPT_FILTERS, query: 'e' }, locale, hasProAccess: true, hasGoogleConnection: true, translate }
    const first = buildPromptPage(options)
    expect(first.lastPage).toBeGreaterThan(0)
    const pages = Array.from({ length: first.lastPage + 1 }, (_, page) => buildPromptPage({ ...options, filters: { ...options.filters, page } }))
    expect(pages.flatMap(page => page.visible)).toEqual(first.matches)
    expect(pages.every(page => page.visible.length <= 8)).toBe(true)
    expect(buildPromptPage({ ...options, filters: { ...options.filters, page: 100 } }).currentPage).toBe(first.lastPage)
    const restricted = buildPromptPage({ ...options, hasProAccess: false, filters: { category: 'calendar', query: '', page: 3 } })
    expect(restricted.categories).not.toContain('calendar')
    expect(restricted.activeCategory).toBe('start')
    expect(restricted.currentPage).toBe(0)
    expect(restricted.visible.map(template => template.category)).toEqual(Array(6).fill('start'))
  })

  it('prioritizes offline, then the daily limit, then an active request', () => {
    const state = { isOnline: true, atMessageLimit: false, aiMessagesLimit: 5, isSending: false }
    const translate = (key: string, values?: { allowance: number }) => `${key}:${values?.allowance ?? ''}`
    expect(promptDisabledReason(state, translate)).toBeUndefined()
    expect(promptDisabledReason({ ...state, isSending: true }, translate)).toBe('shell.composer.busy.reason:')
    expect(promptDisabledReason({ ...state, atMessageLimit: true, isSending: true }, translate)).toBe('shell.composer.limit.reason:5')
    expect(promptDisabledReason({ ...state, isOnline: false, atMessageLimit: true, isSending: true }, translate)).toBe('shell.composer.offline.reason:')
  })
})
