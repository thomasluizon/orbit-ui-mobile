import React from 'react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import type { ClarificationRequest } from '@orbit/shared/types/chat'
import { ClarificationCard } from '@/components/chat/clarification-card'

vi.unmock('react-i18next')
vi.mock('@/hooks/use-resolve-clarification', () => ({
  useResolveClarification: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

const TestRenderer: typeof import('react-test-renderer') = require('react-test-renderer')

const clarificationRequest: ClarificationRequest = {
  question: 'habits.clarification.questionFallback',
  operationId: '00000000-0000-0000-0000-000000000001',
  missingArgumentKey: 'frequency_unit',
  quickActions: [
    { label: 'habits.clarification.quickAction.daily', value: '{"frequency_unit":"Day","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.weekly', value: '{"frequency_unit":"Week","frequency_quantity":1}', description: null },
    { label: 'habits.clarification.quickAction.threePerWeek', value: '{"frequency_unit":"Week","frequency_quantity":3,"is_flexible":true}', description: null },
    { label: 'habits.clarification.quickAction.oneTime', value: '{"frequency_unit":null}', description: null },
  ],
}

describe.each([
  { locale: 'en', labels: ['Daily', 'Weekly', '3 times per week', 'Once'] },
  { locale: 'pt-BR', labels: ['Todo dia', 'Toda semana', '3 vezes por semana', 'Uma vez'] },
])('ClarificationCard translations in $locale on Android', ({ locale, labels }) => {
  it('renders every API-provided frequency choice from the catalog', async () => {
    const i18n = createInstance()
    await i18n.use(initReactI18next).init({
      lng: locale,
      resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
      interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    })

    let tree!: import('react-test-renderer').ReactTestRenderer
    await TestRenderer.act(() => {
      tree = TestRenderer.create(
        <I18nextProvider i18n={i18n}>
          <ClarificationCard clarificationRequest={clarificationRequest} />
        </I18nextProvider>,
      )
    })

    const buttonLabels = tree.root.findAll((node) => String(node.type) === 'Pressable' && node.props.accessibilityRole === 'button')
      .map((button) => button.findAll((node) => String(node.type) === 'Text').map((node) => node.props.children).join(''))
    expect(buttonLabels).toEqual(labels)
    expect(buttonLabels.join(' ')).not.toContain('habits.clarification.quickAction.')
  })
})
