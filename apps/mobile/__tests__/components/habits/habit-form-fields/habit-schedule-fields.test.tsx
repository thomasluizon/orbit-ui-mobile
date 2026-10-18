import React from 'react'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/lib/i18n'
import { HabitScheduleFields } from '@/components/habits/habit-form-fields/habit-schedule-fields'

vi.unmock('react-i18next')

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

describe.each([
  { locale: 'en', units: ['day', 'week', 'month', 'year'] },
  { locale: 'pt-BR', units: ['dia', 'semana', 'mês', 'ano'] },
])('Android flexible schedule copy in $locale', ({ locale, units }) => {
  it.each(['Day', 'Week', 'Month', 'Year'] as const)('renders whole singular and plural sentences for %s', async (unit) => {
    await i18n.changeLanguage(locale)
    const period = units[['Day', 'Week', 'Month', 'Year'].indexOf(unit)]
    const sentence = (quantity: number) => locale === 'en'
      ? `Complete ${quantity === 1 ? 'once' : `${quantity} times`} a ${period}`
      : `Conclua ${quantity === 1 ? 'uma vez' : `${quantity} vezes`} por ${period}`
    const fields = (quantity: number) => <I18nextProvider i18n={i18n}>
      <HabitScheduleFields unit={unit} quantity={quantity} flexible disabled={false} onChange={vi.fn()} />
    </I18nextProvider>
    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => { tree = TestRenderer.create(fields(1)) })
    const sentences = () => tree.root.findAll((node) => String(node.type) === 'Text' && typeof node.props.children === 'string')
      .map((node) => node.props.children)
    expect(sentences()).toContain(sentence(1))
    await TestRenderer.act(() => { tree.update(fields(3)) })
    expect(sentences()).toContain(sentence(3))
    await TestRenderer.act(() => { tree.update(fields(0)) })
    expect(sentences()).not.toContain(sentence(0))
    expect(sentences()).toContain(i18n.t('habits.form.frequencyRequired'))
    await TestRenderer.act(() => { tree.update(<></>) })
  })
})
