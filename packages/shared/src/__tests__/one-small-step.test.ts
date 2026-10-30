import { describe, expect, it } from 'vitest'
import { chatPartSchema, chatClientContextSchema } from '../types/chat'
import { buildChatClientContext } from '../chat/client-context'
import { makeOneSmallStepCard } from '../test-support/chat-fixtures'

const part = (block: unknown) => ({ type: 'block', kind: 'oneSmallStep', block })

describe('one small step contract', () => {
  it.each(['en', 'pt-BR'] as const)('accepts the producer card in %s', language => {
    const card = makeOneSmallStepCard(language)
    expect(chatPartSchema.parse(part(card))).toEqual(part(card))
  })
  it.each(['en', 'pt-BR'] as const)('preserves the typed smaller baseline in %s', language => {
    const card = makeOneSmallStepCard(language)
    const block = { ...card, actions: card.actions.map(action => action.id === 'smaller'
      ? { ...action, previousStep: card.suggestion } : action) }
    expect(chatPartSchema.parse(part(block))).toEqual(part(block))
    const context = { ...buildChatClientContext({ platform: 'web', locale: language }), previousStartingStep: card.suggestion }
    expect(chatClientContextSchema.parse(context)).toEqual(context)
  })
  it.each([
    { goal: '' }, { step: 'Open\nthe book' }, { step: 'x'.repeat(201) }, { language: 'es' }, { command: 'save' },
  ])('rejects malformed typed baselines at both boundaries', override => {
    const card = makeOneSmallStepCard()
    const previousStep = { ...card.suggestion, ...override }
    const block = { ...card, actions: card.actions.map(action => action.id === 'smaller' ? { ...action, previousStep } : action) }
    expect(chatPartSchema.parse(part(block))).toBeNull()
    expect(chatClientContextSchema.safeParse({ ...buildChatClientContext({ platform: 'web', locale: 'en' }),
      previousStartingStep: previousStep }).success).toBe(false)
  })
  it.each(['web', 'mobile'] as const)('advertises oneSmallStep on %s', platform => {
    const context = buildChatClientContext({ platform, locale: 'en' })
    expect(context.supportsParts).toBe(true)
    expect(context).toHaveProperty('supportsStartingStepContext', true)
    expect(context.partKinds).toContain('oneSmallStep')
  })
  it.each([
    { suggestion: { ...makeOneSmallStepCard().suggestion, step: 'x'.repeat(201) } },
    { suggestion: { ...makeOneSmallStepCard().suggestion, goal: 'x'.repeat(201) } },
    { suggestion: { ...makeOneSmallStepCard().suggestion, step: '  ' } },
    { suggestion: { ...makeOneSmallStepCard().suggestion, step: 'Open\nthe book' } },
    { suggestion: { ...makeOneSmallStepCard().suggestion, language: 'es' } },
    { suggestion: { ...makeOneSmallStepCard().suggestion, command: 'execute' } },
    { actions: [{ ...makeOneSmallStepCard().actions[0], id: 'execute' }] },
    { actions: makeOneSmallStepCard().actions.slice(0, 2) },
    { actions: [makeOneSmallStepCard().actions[0], makeOneSmallStepCard().actions[0], makeOneSmallStepCard().actions[2]] },
    { command: 'execute' },
  ])('skips a malformed card without losing adjacent prose', override => {
    expect(chatPartSchema.parse(part({ ...makeOneSmallStepCard(), ...override }))).toBeNull()
    expect(chatPartSchema.parse({ type: 'text', text: 'Open the book.' })).toEqual({ type: 'text', text: 'Open the book.' })
  })
})
