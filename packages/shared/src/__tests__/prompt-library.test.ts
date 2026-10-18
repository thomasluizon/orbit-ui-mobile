import { describe, expect, it } from 'vitest'
import { createChatStoreState } from '../stores/chat-store'
import { findPromptSlot, filterPromptTemplates, preparePromptTemplate, promptCategories, PROMPT_CATEGORIES, PROMPT_TEMPLATES } from '../chat/prompt-library'
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
})
