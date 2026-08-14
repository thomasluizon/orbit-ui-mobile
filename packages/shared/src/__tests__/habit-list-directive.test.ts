import { describe, expect, it } from 'vitest'
import { stripChatDirectives } from '../chat'

describe('stripChatDirectives', () => {
  it('removes a complete today directive and surrounding whitespace', () => {
    expect(stripChatDirectives('Here are your habits for today:\n[[orbit:habits:today]]')).toBe(
      'Here are your habits for today:',
    )
  })

  it('removes a complete all directive', () => {
    expect(stripChatDirectives('All of them:\n[[orbit:habits:all]]')).toBe('All of them:')
  })

  it('removes a partial directive still being streamed', () => {
    expect(stripChatDirectives('Here you go:\n[[orbit:habits:tod')).toBe('Here you go:')
    expect(stripChatDirectives('Here you go:\n[[orbit:habits')).toBe('Here you go:')
  })

  it('removes complete and partial goals directives', () => {
    expect(stripChatDirectives('Here are your goals.\n[[orbit:goals]]')).toBe('Here are your goals.')
    expect(stripChatDirectives('Here are your goals.\n[[orbit:goa')).toBe('Here are your goals.')
    expect(stripChatDirectives('Here are your goals.\n[[orbit:')).toBe('Here are your goals.')
  })

  it('removes a generic directive without adding a per-directive rule', () => {
    expect(stripChatDirectives('Astra response.\n[[orbit:future:card]]')).toBe('Astra response.')
  })

  it('removes a complete directive within surrounding text', () => {
    expect(stripChatDirectives('Before [[orbit:goals]] after')).toBe('Before  after')
  })

  it('preserves pt-BR content around a directive', () => {
    expect(stripChatDirectives('Aqui estão seus objetivos.\n[[orbit:goals]]')).toBe(
      'Aqui estão seus objetivos.',
    )
  })

  it('leaves directive-free content unchanged', () => {
    const content = 'You have 3 habits due today.'

    expect(stripChatDirectives(content)).toBe(content)
    expect(stripChatDirectives('Keep [[other:goals]] intact.')).toBe('Keep [[other:goals]] intact.')
  })

  it('is idempotent after directives are removed', () => {
    const content = 'Here are your goals.\n[[orbit:goals]]'
    const strippedContent = stripChatDirectives(content)

    expect(stripChatDirectives(strippedContent)).toBe(strippedContent)
  })
})
